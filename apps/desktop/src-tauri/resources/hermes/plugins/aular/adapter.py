"""AULAR platform adapter for the Hermes gateway.

Makes the AULAR web app a first-class Hermes messaging platform (like
Telegram/IRC), so agents can both reply interactively AND push proactively
when a cron/async job fires. See ~/.hermes/plugins/aular/plugin.yaml.

Flow:
  - Inbound: AULAR core-api POSTs a user message to this adapter's HTTP
    listener (/inbound). We build a MessageEvent (platform=aular,
    chat_id=<conversation_id>), attach the AULAR persona as the per-turn
    ephemeral system prompt (MessageEvent.channel_prompt), and hand it to
    the base class, which runs the agent (with tools + session) and calls
    send() with the reply.
  - Outbound (live reply AND out-of-process cron delivery): send() /
    _standalone_send() POST to core-api's /internal/deliver, which inserts
    an agent message and broadcasts it over AULAR's WebSocket.

Because the session is stamped platform=aular (an async-delivery-capable
platform), any cron the agent creates is stamped Deliver: aular:<conv id>
and actually gets delivered here when it fires — unlike the api_server
platform, which hardwires async_delivery=False.
"""

import asyncio
import base64
import logging
import mimetypes
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

from aiohttp import web
import aiohttp

from gateway.platforms.base import (
    BasePlatformAdapter,
    SendResult,
    MessageEvent,
    MessageType,
)
from gateway.config import Platform

logger = logging.getLogger(__name__)

DEFAULT_PORT = 8643
DEFAULT_CORE_API = "http://localhost:8080"
MEDIA_EXTS = (
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "svg",
    "mp4", "mov", "avi", "mkv", "webm",
    "mp3", "wav", "ogg", "opus", "m4a", "flac",
    "pdf", "docx", "doc", "odt", "rtf", "txt", "md", "epub",
    "xlsx", "xls", "ods", "csv", "tsv", "json", "xml", "yaml", "yml",
    "pptx", "ppt", "odp", "key",
    "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "apk", "ipa",
    "html", "htm",
)
LOCAL_PATH_RE = re.compile(
    r"(?<![/:\w.])(?:~/|/)(?:[\w.\-]+/)*[\w.\-]+\.(?:" + "|".join(MEDIA_EXTS) + r")\b",
    re.IGNORECASE,
)
AULAR_CHUNK_DELIMITER = "<<<AULAR_CHUNK>>>"
AULAR_CHUNK_RE = re.compile(r"^\s*" + re.escape(AULAR_CHUNK_DELIMITER) + r"\s*$", re.MULTILINE)
# Streaming edits may carry a trailing "typing cursor" glyph the gateway
# appends to in-progress text (config: streaming.cursor). Strip it so bubbles
# store clean text; the UI renders its own live-streaming indicator instead.
STREAM_CURSOR_CHARS = "▉▌▐█▮┃|"  # ▉▌▐█▮│ and ascii bar


def _strip_stream_cursor(text: str) -> str:
    return (text or "").rstrip(STREAM_CURSOR_CHARS + " \t")


# Hermes wraps cron/scheduled deliveries in a "Cronjob Response: <name>\n(job_id:
# ...)\n-----\n\n<body>\n\nTo stop or manage this job..." envelope. In AULAR's
# chat that chrome is noise — the routine already shows in the agent's Routines
# panel — so we deliver just the agent's actual output.
_CRON_HEADER_RE = re.compile(r"^Cronjob Response:.*?\n-{3,}\n+", re.DOTALL)
_CRON_FOOTER_RE = re.compile(
    r"\n+To stop or manage this job, send me a new message.*$", re.DOTALL
)


def _strip_cron_envelope(content: str) -> str:
    stripped = _CRON_HEADER_RE.sub("", content or "", count=1)
    if stripped != content:  # only a real cron envelope; trim its footer too
        stripped = _CRON_FOOTER_RE.sub("", stripped)
        return stripped.strip()
    return content


def _core_api_url() -> str:
    return (os.getenv("AULAR_CORE_API_URL") or DEFAULT_CORE_API).rstrip("/")


def _internal_token() -> str:
    return os.getenv("AULAR_INTERNAL_TOKEN", "")


def _kind_for_mime(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    return "document"


def _media_item(path_or_url: str, kind: Optional[str] = None) -> Optional[Dict[str, str]]:
    raw = str(path_or_url or "").strip()
    if not raw:
        return None

    parsed = urlparse(raw)
    if parsed.scheme in {"http", "https"}:
        mime_type = mimetypes.guess_type(parsed.path)[0] or ""
        return {
            "url": raw,
            "name": Path(parsed.path).name or "attachment",
            "mime_type": mime_type,
            "kind": kind or _kind_for_mime(mime_type),
        }

    path = unquote(parsed.path) if parsed.scheme == "file" else raw
    p = Path(path).expanduser()
    if not p.exists() or not p.is_file():
        logger.warning("AULAR media path missing or not a file: %s", raw)
        return None

    mime_type = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return {
        "name": p.name,
        "mime_type": mime_type,
        "kind": kind or _kind_for_mime(mime_type),
        "size": str(p.stat().st_size),
        "data_base64": base64.b64encode(p.read_bytes()).decode("ascii"),
    }


def _extract_local_media(content: str) -> tuple[str, List[Dict[str, str]]]:
    """Turn generated local file paths into AULAR attachments as a fallback."""
    media: List[Dict[str, str]] = []
    seen = set()

    def replace(match: re.Match[str]) -> str:
        raw = match.group(0)
        path = os.path.expanduser(raw)
        if path in seen:
            return ""
        item = _media_item(path)
        if not item:
            return raw
        seen.add(path)
        media.append(item)
        return ""

    cleaned = LOCAL_PATH_RE.sub(replace, content or "")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, media

def _split_response_chunks(content: str) -> List[str]:
    """Split model-authored chat chunks while preserving unsplit normal replies."""
    chunks = [chunk.strip() for chunk in AULAR_CHUNK_RE.split(content or "")]
    return [chunk for chunk in chunks if chunk]


async def _deliver_to_core_api(
    conversation_id: str,
    content: str,
    media: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """POST one agent message to core-api and return its new message_id.

    Returns the id on success (so streaming can edit it in place), or None on
    failure. Callers that only care about success/failure check for None.
    """
    url = f"{_core_api_url()}/internal/deliver"
    headers = {
        "Content-Type": "application/json",
        "X-Aular-Internal-Token": _internal_token(),
    }
    body = {"conversation_id": conversation_id, "content": content, "media": media or []}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status >= 300:
                    text = await resp.text()
                    logger.error("AULAR deliver failed %s: %s", resp.status, text[:200])
                    return None
                try:
                    data = await resp.json()
                    return str(data.get("message_id") or "")
                except Exception:
                    return ""
    except Exception as e:
        logger.error("AULAR deliver error: %s", e)
        return None


async def _edit_core_api_message(
    conversation_id: str,
    message_id: str,
    content: str,
    finalize: bool = False,
) -> bool:
    """PATCH a streaming agent message in place via core-api's /internal/edit.

    Called repeatedly as a reply streams in; the growing text replaces the
    bubble's content and core-api broadcasts message.updated. finalize=True on
    the last edit clears the live-streaming indicator."""
    url = f"{_core_api_url()}/internal/edit"
    headers = {
        "Content-Type": "application/json",
        "X-Aular-Internal-Token": _internal_token(),
    }
    body = {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "content": content,
        "finalize": finalize,
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status >= 300:
                    text = await resp.text()
                    logger.debug("AULAR edit failed %s: %s", resp.status, text[:200])
                    return False
                return True
    except Exception as e:
        logger.debug("AULAR edit error: %s", e)
        return False


async def _deliver_chunked_to_core_api(
    conversation_id: str,
    content: str,
    media: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """Deliver AULAR replies as separate chat bubbles when the model marks chunks.

    Used for non-streaming delivery (proactive/cron pushes, or when gateway
    streaming is off). The prompt asks AULAR agents to insert <<<AULAR_CHUNK>>>
    between semantically distinct text-message-sized points. If no delimiter is
    present, this preserves single-message behavior. Media is attached to the
    last chunk. Returns the last delivered message_id, or None on failure.
    """
    media = media or []
    content = _strip_cron_envelope(content)
    chunks = _split_response_chunks(content)
    if not chunks:
        return await _deliver_to_core_api(conversation_id, "", media=media)

    last_id: Optional[str] = None
    for index, chunk in enumerate(chunks):
        chunk_media = media if index == len(chunks) - 1 else []
        result = await _deliver_to_core_api(conversation_id, chunk, media=chunk_media)
        if result is None:
            return None
        last_id = result
        if index < len(chunks) - 1:
            await asyncio.sleep(0.2)
    return last_id


async def _post_activity(conversation_id: str, state: str = "working") -> None:
    """Best-effort ping to core-api that the agent is actively working on this
    conversation, so the UI can show a live 'typing…'/presence state. Fire and
    forget — a failure just means the UI falls back to its optimistic state."""
    url = f"{_core_api_url()}/internal/activity"
    headers = {
        "Content-Type": "application/json",
        "X-Aular-Internal-Token": _internal_token(),
    }
    body = {"conversation_id": conversation_id, "state": state}
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                url,
                json=body,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=5),
            )
    except Exception as e:
        logger.debug("AULAR activity ping error: %s", e)


class AularAdapter(BasePlatformAdapter):
    """Bidirectional HTTP bridge between AULAR core-api and the Hermes agent."""

    # We support editing sent messages (via /internal/edit), so the gateway's
    # stream consumer will stream replies token-by-token: send() the first
    # partial, then edit_message() as text grows. REQUIRES_EDIT_FINALIZE makes
    # the consumer always send a closing finalize edit so we can clear the live
    # cursor even when the final text is unchanged from the last frame.
    SUPPORTS_MESSAGE_EDITING = True
    REQUIRES_EDIT_FINALIZE = True

    def __init__(self, config, **kwargs):
        platform = Platform("aular")
        super().__init__(config=config, platform=platform)

        extra = getattr(config, "extra", {}) or {}
        try:
            self.port = int(os.getenv("AULAR_ADAPTER_PORT") or extra.get("port", DEFAULT_PORT))
        except (ValueError, TypeError):
            self.port = DEFAULT_PORT

        self._runner: Optional[web.AppRunner] = None
        self._site: Optional[web.TCPSite] = None

    @property
    def name(self) -> str:
        return "AULAR"

    # ── Connection lifecycle ──────────────────────────────────────────────

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        """Start the inbound HTTP listener that core-api POSTs user messages to."""
        app = web.Application()
        app.router.add_post("/inbound", self._handle_inbound)
        app.router.add_get("/healthz", lambda r: web.json_response({"status": "ok"}))

        self._runner = web.AppRunner(app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, host="127.0.0.1", port=self.port)
        try:
            await self._site.start()
        except Exception as e:
            logger.error("AULAR: failed to bind :%s — %s", self.port, e)
            self._set_fatal_error("bind_failed", str(e), retryable=True)
            return False

        self._mark_connected()
        logger.info("AULAR: inbound listener up on 127.0.0.1:%s", self.port)
        return True

    async def disconnect(self) -> None:
        self._mark_disconnected()
        try:
            if self._site:
                await self._site.stop()
            if self._runner:
                await self._runner.cleanup()
        except Exception:
            pass
        self._site = None
        self._runner = None

    # ── Inbound (core-api → agent) ────────────────────────────────────────

    async def _handle_inbound(self, request: "web.Request") -> "web.Response":
        # Trusted local caller (core-api). Optional shared-token check.
        token = _internal_token()
        if token and request.headers.get("X-Aular-Internal-Token", "") != token:
            return web.json_response({"error": "unauthorized"}, status=401)

        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)

        conversation_id = str(body.get("conversation_id", "")).strip()
        content = body.get("content", "")
        user_id = str(body.get("user_id", "") or "aular-user")
        system_prompt = body.get("system_prompt") or None
        if not conversation_id or not content:
            return web.json_response({"error": "conversation_id and content required"}, status=400)

        if not self._message_handler:
            return web.json_response({"error": "gateway not ready"}, status=503)

        source = self.build_source(
            chat_id=conversation_id,
            chat_name=conversation_id,
            chat_type="dm",
            user_id=user_id,
            user_name="user",
        )
        event = MessageEvent(
            text=content,
            message_type=MessageType.TEXT,
            source=source,
            message_id=str(int(time.time() * 1000)),
            # AULAR persona for this conversation — ephemeral, per-turn, never
            # persisted to Hermes' transcript.
            channel_prompt=system_prompt,
        )
        # handle_message returns quickly (spawns a background task); the reply
        # is delivered later via send() -> /internal/deliver -> WebSocket.
        await self.handle_message(event)
        return web.json_response({"status": "accepted"}, status=202)

    # ── Outbound (agent → AULAR) ──────────────────────────────────────────

    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        # Streaming path: the gateway's stream consumer marks the first send of a
        # reply segment with expect_edits, then grows it via edit_message(). We
        # keep the WHOLE segment as ONE message (delimiters and all) so the
        # consumer's completeness check stays satisfied and it never fires a
        # duplicate fallback send. The AULAR web UI splits that one message on
        # <<<AULAR_CHUNK>>> into separate chat bubbles at render time.
        if (metadata or {}).get("expect_edits"):
            text = _strip_stream_cursor(content)
            msg_id = await _deliver_to_core_api(chat_id, text or " ")
            if not msg_id:
                return SendResult(success=False, error="core-api delivery failed")
            return SendResult(success=True, message_id=msg_id)

        # Non-streaming path (proactive/cron pushes, or streaming disabled):
        # deliver the whole reply, split into bubbles on the chunk delimiter.
        content, media = _extract_local_media(content)
        last_id = await _deliver_chunked_to_core_api(chat_id, content, media=media)
        if last_id is None:
            return SendResult(success=False, error="core-api delivery failed")
        return SendResult(success=True, message_id=last_id or str(int(time.time() * 1000)))

    async def edit_message(
        self,
        chat_id: str,
        message_id: str,
        content: str,
        *,
        finalize: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> SendResult:
        """Grow a streaming reply in place. `content` is the cumulative text for
        the segment (chunk delimiters preserved — the UI splits them into
        bubbles). Editing one message keeps the gateway's completeness check
        happy so it won't re-send. finalize clears the streaming cursor."""
        text = _strip_stream_cursor(content)
        await _edit_core_api_message(chat_id, message_id, text, finalize=finalize)
        return SendResult(success=True, message_id=message_id)

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        media_item = _media_item(image_path, kind="image")
        if not media_item:
            return SendResult(success=False, error="image not found")
        ok = await _deliver_to_core_api(chat_id, caption or "", media=[media_item])
        if not ok:
            return SendResult(success=False, error="core-api image delivery failed")
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def send_multiple_images(
        self,
        chat_id: str,
        images: List,
        metadata: Optional[Dict[str, Any]] = None,
        human_delay: float = 0,
    ):
        media: List[Dict[str, str]] = []
        for item in images or []:
            url = item[0] if isinstance(item, (tuple, list)) else item
            media_item = _media_item(str(url), kind="image")
            if media_item:
                media.append(media_item)
        if not media:
            return SendResult(success=False, error="no deliverable images")
        ok = await _deliver_to_core_api(chat_id, "", media=media)
        if not ok:
            return SendResult(success=False, error="core-api media delivery failed")
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        media_item = _media_item(video_path, kind="video")
        if not media_item:
            return SendResult(success=False, error="video not found")
        ok = await _deliver_to_core_api(chat_id, caption or "", media=[media_item])
        if not ok:
            return SendResult(success=False, error="core-api video delivery failed")
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def send_document(
        self,
        chat_id: str,
        file_path: str,
        caption: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        media_item = _media_item(file_path)
        if not media_item:
            return SendResult(success=False, error="document not found")
        ok = await _deliver_to_core_api(chat_id, caption or "", media=[media_item])
        if not ok:
            return SendResult(success=False, error="core-api document delivery failed")
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        media_item = _media_item(audio_path, kind="audio")
        if not media_item:
            return SendResult(success=False, error="audio not found")
        ok = await _deliver_to_core_api(chat_id, "", media=[media_item])
        if not ok:
            return SendResult(success=False, error="core-api audio delivery failed")
        return SendResult(success=True, message_id=str(int(time.time() * 1000)))

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        # Hermes calls this while the agent is actively processing a turn. Relay
        # it to core-api as a transient activity ping so the UI shows a live
        # "typing…"/presence state (works even for proactive/cron work the user
        # didn't just trigger). Best-effort; never blocks the turn.
        await _post_activity(chat_id, "working")

    async def get_chat_info(self, chat_id: str) -> Dict[str, Any]:
        return {"name": chat_id, "type": "dm"}


# ---------------------------------------------------------------------------
# Out-of-process cron delivery
# ---------------------------------------------------------------------------

async def _standalone_send(
    pconfig,
    chat_id: str,
    message: str,
    *,
    thread_id: Optional[str] = None,
    media_files: Optional[List[str]] = None,
    force_document: bool = False,
) -> Dict[str, Any]:
    """Deliver a cron/async message to AULAR when the gateway runner isn't in
    this process (e.g. `hermes cron` firing separately). Without this hook,
    deliver=aular jobs fail with 'No live adapter for platform aular'."""
    message, media = _extract_local_media(message)
    for item in media_files or []:
        path_or_url = item[0] if isinstance(item, (tuple, list)) else item
        media_item = _media_item(str(path_or_url))
        if media_item:
            media.append(media_item)
    result = await _deliver_chunked_to_core_api(chat_id, message, media=media)
    return {"success": result is not None, "chat_id": chat_id}


# ---------------------------------------------------------------------------
# Enablement / registration
# ---------------------------------------------------------------------------

def check_requirements() -> bool:
    return bool(os.getenv("AULAR_INTERNAL_TOKEN") or _core_api_url())


def validate_config(config) -> bool:
    return True


def is_connected(config) -> bool:
    return bool(os.getenv("AULAR_CORE_API_URL") or os.getenv("AULAR_INTERNAL_TOKEN"))


def _env_enablement() -> Optional[dict]:
    """Auto-enable the platform when AULAR env is present, so the gateway
    brings it up without an interactive setup step."""
    if not (os.getenv("AULAR_CORE_API_URL") or os.getenv("AULAR_INTERNAL_TOKEN")):
        return None
    seed: dict = {"port": os.getenv("AULAR_ADAPTER_PORT", str(DEFAULT_PORT))}
    home = os.getenv("AULAR_HOME_CHANNEL", "").strip()
    if home:
        seed["home_channel"] = {"chat_id": home}
    return seed


def register(ctx):
    """Plugin entry point — called by the Hermes plugin system."""
    ctx.register_platform(
        name="aular",
        label="AULAR",
        adapter_factory=lambda cfg: AularAdapter(cfg),
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=[],
        install_hint="Set AULAR_CORE_API_URL and AULAR_INTERNAL_TOKEN",
        env_enablement_fn=_env_enablement,
        # Cron/home-channel delivery: deliver=aular jobs route here, and
        # _standalone_send handles delivery when cron runs out-of-process.
        cron_deliver_env_var="AULAR_HOME_CHANNEL",
        standalone_sender_fn=_standalone_send,
        # Single-user trusted app.
        allow_all_env="AULAR_ALLOW_ALL_USERS",
        max_message_length=8000,
        emoji="🟢",
        pii_safe=True,
        platform_hint=(
            "You are chatting inside AULAR, a private single-user chat app. "
            "Reply conversationally. Markdown is supported."
        ),
    )
