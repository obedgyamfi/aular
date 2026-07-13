import { createSignal, For, Show } from "solid-js";

import type { MediaDescriptor, Message } from "~/lib/types";

/**
 * Attachments on a message — the prototype's Telegram treatment, in full.
 *
 * Images are cards: rounded, capped height, a caption gradient carrying the
 * filename, and Open/download pills riding the corner. Video gets the same
 * card with controls; audio a titled player; anything else a document card
 * with a fat extension tile. Media sits *above* the text, like every chat
 * app people already know.
 *
 * Overlay colors are literal rgba values, not tokens: they sit on top of the
 * image itself, so they must read on a photo in either theme — and the
 * palette utilities (bg-black/55) compile to nothing on this design system.
 */
export function MediaAttachments(props: { message: Message }) {
  const items = () => mediaOf(props.message);
  const [lightbox, setLightbox] = createSignal<MediaDescriptor | null>(null);

  return (
    <Show when={items().length}>
      <div
        class="flex flex-col gap-2"
        classList={{ "mb-1.5": !!props.message.content.trim() }}
      >
        <For each={items()}>
          {(m) => {
            const kind = kindOf(m);
            const label = () => m.name || m.url.split("/").pop() || "attachment";
            if (kind === "image")
              return (
                <div class="relative overflow-hidden rounded-xl bg-[rgba(0,0,0,0.25)]">
                  <button
                    type="button"
                    onClick={() => setLightbox(m)}
                    class="block w-full"
                    aria-label={`View ${label()}`}
                  >
                    <img
                      src={absolute(m.url)}
                      alt={label()}
                      loading="lazy"
                      class="max-h-[420px] w-full object-contain"
                    />
                  </button>
                  <div
                    class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 text-[12px] text-[#ffffff]"
                    style={{
                      "background-image":
                        "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
                    }}
                  >
                    <span class="line-clamp-1">{label()}</span>
                  </div>
                  <Overlay media={m} label={label()} />
                </div>
              );
            if (kind === "video")
              return (
                <div class="relative overflow-hidden rounded-xl bg-[rgba(0,0,0,0.35)]">
                  <video
                    src={absolute(m.url)}
                    controls
                    playsinline
                    preload="metadata"
                    title={label()}
                    class="max-h-[420px] w-full"
                  />
                  <Overlay media={m} label={label()} />
                </div>
              );
            if (kind === "audio")
              return (
                <div class="rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3">
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="truncate text-[12.5px] font-medium text-v2-text-text-base">
                        {label()}
                      </div>
                      <div class="text-[11px] text-v2-text-text-faint">
                        {formatBytes(m.size) || "Audio"}
                      </div>
                    </div>
                    <a
                      href={absolute(m.url)}
                      download={label()}
                      class="shrink-0 rounded-full bg-v2-background-bg-layer-02 px-3 py-1 text-[11.5px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                    >
                      Download
                    </a>
                  </div>
                  <audio src={absolute(m.url)} controls preload="metadata" class="w-full" />
                </div>
              );
            return <DocumentCard media={m} label={label()} />;
          }}
        </For>
      </div>

      <Show when={lightbox()}>
        {(m) => (
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.75)] p-8"
            onClick={() => setLightbox(null)}
          >
            <img
              src={absolute(m().url)}
              alt={m().name ?? "attachment"}
              class="max-h-full max-w-full rounded-md object-contain"
            />
          </div>
        )}
      </Show>
    </Show>
  );
}

/** Open + download pills on the card's corner — the prototype's affordances. */
function Overlay(props: { media: MediaDescriptor; label: string }) {
  const pill =
    "rounded-full bg-[rgba(0,0,0,0.55)] px-2 py-1 text-[11px] font-medium text-[#ffffff] backdrop-blur transition-colors hover:bg-[rgba(0,0,0,0.78)]";
  return (
    <div class="absolute right-2 top-2 flex gap-1 opacity-95">
      <a
        href={absolute(props.media.url)}
        target="_blank"
        rel="noopener noreferrer"
        class={pill}
        aria-label={`Open ${props.label}`}
      >
        Open
      </a>
      <a
        href={absolute(props.media.url)}
        download={props.label}
        class={pill}
        aria-label={`Download ${props.label}`}
      >
        ↓
      </a>
    </div>
  );
}

function DocumentCard(props: { media: MediaDescriptor; label: string }) {
  const meta = () =>
    [extensionOf(props.label), formatBytes(props.media.size)]
      .filter(Boolean)
      .join(" · ");
  return (
    <div class="relative flex min-w-0 items-center gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3">
      <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-layer-03 font-mono text-[10px] font-bold uppercase text-v2-text-text-muted">
        {extensionOf(props.label).slice(0, 4) || "FILE"}
      </div>
      <div class="min-w-0 flex-1 pr-16">
        <a
          href={absolute(props.media.url)}
          target="_blank"
          rel="noopener noreferrer"
          class="block truncate text-[12.5px] font-medium text-v2-text-text-base hover:underline"
        >
          {props.label}
        </a>
        <Show when={meta()}>
          <div class="mt-0.5 text-[11px] text-v2-text-text-faint">{meta()}</div>
        </Show>
      </div>
      <Overlay media={props.media} label={props.label} />
    </div>
  );
}

/** The backend serves media from its own origin, not the app's. */
function absolute(url: string): string {
  if (/^https?:|^data:|^blob:/.test(url)) return url;
  const base = import.meta.env.VITE_AULAR_API ?? "http://127.0.0.1:8080";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function mediaOf(message: Message): MediaDescriptor[] {
  const media = message.structured_payload?.media;
  if (!Array.isArray(media)) return [];
  return media.filter((m) => typeof m?.url === "string" && m.url.length > 0);
}

function kindOf(m: MediaDescriptor): NonNullable<MediaDescriptor["kind"]> {
  if (m.kind) return m.kind;
  const mime = m.mime_type ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function extensionOf(name: string): string {
  const ext = name.split(".").pop();
  return ext && ext !== name ? ext.toUpperCase() : "";
}

function formatBytes(size?: string | number): string {
  const value = typeof size === "number" ? size : Number(size ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}
