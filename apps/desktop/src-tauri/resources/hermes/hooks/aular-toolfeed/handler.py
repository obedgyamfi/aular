"""AULAR tool-feed hook — agent:step → core-api /internal/tool-event.

The gateway fires agent:step at the start of each tool-loop iteration with the
PREVIOUS iteration's tool batch: [{name, arguments, result}, ...]. That is the
only supported seam that carries per-call tool data out of a turn (the typed
stream-event dispatcher exists in gateway/stream_dispatch.py but is not wired
into the run loop in this Hermes version), so the AULAR work feed hangs off it.

agent:step context has no chat_id — only the Hermes session_id. For the aular
platform a session maps 1:1 to an AULAR conversation. agent:start DOES carry
chat_id + session_id, so we cache the mapping there (live sessions are not yet
flushed to ~/.hermes/state.db — a lookup there only helps after a gateway
restart mid-session, so it's kept as fallback only).

Every failure here is swallowed: this is an observability channel and must
never affect a turn.
"""

import asyncio
import json
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

import aiohttp

logger = logging.getLogger(__name__)

STATE_DB = Path(os.path.expanduser("~/.hermes/state.db"))
ARGS_MAX = 2048    # serialized tool arguments cap per event
RESULT_MAX = 1024  # result snippet cap per event

# session_id → chat_id for source='aular' (None = known non-aular session).
_session_chat: Dict[str, Optional[str]] = {}


def _core_api_url() -> str:
    return (os.getenv("AULAR_CORE_API_URL") or "http://localhost:8080").rstrip("/")


def _resolve_chat_id(session_id: str) -> Optional[str]:
    if session_id in _session_chat:
        return _session_chat[session_id]
    chat_id: Optional[str] = None
    try:
        # Read-only; WAL mode makes a concurrent short read safe.
        db = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True, timeout=1.0)
        try:
            row = db.execute(
                "SELECT chat_id, source FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        finally:
            db.close()
        if row and row[1] == "aular" and row[0]:
            chat_id = str(row[0])
    except Exception as e:
        logger.debug("aular-toolfeed: session lookup failed: %s", e)
        return None  # uncached — retry next event
    # Cache hits AND non-aular misses; prune crudely if it somehow grows.
    if len(_session_chat) > 512:
        _session_chat.clear()
    _session_chat[session_id] = chat_id
    return chat_id


def _clip(value: Any, cap: int) -> Optional[str]:
    if value is None:
        return None
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text[:cap] if len(text) > cap else text


async def handle(event_type: str, context: dict) -> None:
    if (context.get("platform") or "") != "aular":
        return

    # agent:start carries the chat_id that agent:step lacks — cache it.
    if event_type == "agent:start":
        session_id = str(context.get("session_id") or "")
        chat_id = str(context.get("chat_id") or "")
        if session_id and chat_id:
            if len(_session_chat) > 512:
                _session_chat.clear()
            _session_chat[session_id] = chat_id
        return

    if event_type != "agent:step":
        return
    tools = context.get("tools") or []
    # list[str] shape (older emitters) carries no per-call data — skip.
    tools = [t for t in tools if isinstance(t, dict) and t.get("name")]
    if not tools:
        return
    session_id = str(context.get("session_id") or "")
    if not session_id:
        return
    chat_id = _resolve_chat_id(session_id)
    if not chat_id:
        return

    url = f"{_core_api_url()}/internal/tool-event"
    headers = {
        "Content-Type": "application/json",
        "X-Aular-Internal-Token": os.getenv("AULAR_INTERNAL_TOKEN", ""),
    }
    iteration = int(context.get("iteration") or 0)
    try:
        async with aiohttp.ClientSession() as session:
            for tool in tools:
                args: Any = None
                raw_args = tool.get("arguments")
                if raw_args:
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except Exception:
                        args = {"_raw": str(raw_args)[:ARGS_MAX]}
                    serialized = json.dumps(args, ensure_ascii=False, default=str)
                    if len(serialized) > ARGS_MAX:
                        args = {"_truncated": serialized[:ARGS_MAX]}
                body = {
                    "conversation_id": chat_id,
                    "tool_name": str(tool.get("name")),
                    "args": args,
                    "result": _clip(tool.get("result"), RESULT_MAX),
                    "index": iteration,
                }
                await session.post(
                    url, json=body, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=5),
                )
        logger.info(
            "aular-toolfeed: forwarded %d tool call(s) for conversation %s",
            len(tools), chat_id,
        )
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.debug("aular-toolfeed: post failed: %s", e)
