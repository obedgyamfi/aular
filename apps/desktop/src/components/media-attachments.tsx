import { createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import type { MediaDescriptor, Message } from "~/lib/types";

/**
 * Attachments on a message — ported from the prototype's MediaAttachments.
 *
 * Images and video render inline (an image opens full-size on click); audio
 * gets a player; anything else becomes a file card with its extension and size.
 * The backend serves these from its own /media route, so nothing leaves the
 * machine.
 */
export function MediaAttachments(props: { message: Message }) {
  const items = () => mediaOf(props.message);
  const [lightbox, setLightbox] = createSignal<MediaDescriptor | null>(null);

  return (
    <Show when={items().length}>
      <div class="flex flex-col gap-1.5 pt-1.5">
        <For each={items()}>
          {(m) => {
            const kind = kindOf(m);
            return (
              <Show
                when={kind === "image"}
                fallback={
                  <Show
                    when={kind === "video"}
                    fallback={
                      <Show
                        when={kind === "audio"}
                        fallback={<FileCard media={m} />}
                      >
                        <audio
                          controls
                          src={absolute(m.url)}
                          class="w-full max-w-[320px]"
                        />
                      </Show>
                    }
                  >
                    <video
                      controls
                      src={absolute(m.url)}
                      class="max-h-[320px] max-w-full rounded-md border border-v2-border-border-muted"
                    />
                  </Show>
                }
              >
                <button
                  type="button"
                  onClick={() => setLightbox(m)}
                  class="block overflow-hidden rounded-md border border-v2-border-border-muted"
                  aria-label={`Open ${m.name ?? "image"}`}
                >
                  <img
                    src={absolute(m.url)}
                    alt={m.name ?? "attachment"}
                    class="max-h-[280px] max-w-full object-contain"
                  />
                </button>
              </Show>
            );
          }}
        </For>
      </div>

      <Show when={lightbox()}>
        {(m) => (
          <div
            class="fixed inset-0 z-[100] flex items-center justify-center bg-v2-overlay-simple-overlay-scrim p-8"
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

function FileCard(props: { media: MediaDescriptor }) {
  const m = () => props.media;
  return (
    <a
      href={absolute(m().url)}
      download={m().name}
      class="flex max-w-[320px] items-center gap-2.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-2 transition-colors hover:bg-v2-overlay-simple-overlay-hover"
    >
      <span class="flex size-8 shrink-0 items-center justify-center rounded bg-v2-background-bg-layer-03 font-mono text-[9px] font-semibold uppercase text-v2-text-text-muted">
        {extensionOf(m().name ?? "") || <Icon name="file-tree" size="small" />}
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-[12px] text-v2-text-text-base">
          {m().name ?? "attachment"}
        </span>
        <Show when={formatBytes(m().size)}>
          <span class="text-[10.5px] text-v2-text-text-weak">
            {formatBytes(m().size)}
          </span>
        </Show>
      </span>
    </a>
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
  return ext && ext !== name ? ext.slice(0, 4) : "";
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
