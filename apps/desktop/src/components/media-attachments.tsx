import { createMemo, createSignal, For, Show } from "solid-js";
import Download from "lucide-solid/icons/download";
import ExternalLink from "lucide-solid/icons/external-link";

import { downloadFile, openExternal } from "~/lib/external";
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

  /**
   * Images are a gallery; everything else is a list.
   *
   * Stacking every attachment in one column meant four screenshots took four
   * screens, and a turn that returned a set of images read as four unrelated
   * ones. Discord grids them for the same reason: a set is one thing, and the
   * relationship between the pictures is part of what is being said.
   */
  const images = createMemo(() => items().filter((m) => kindOf(m) === "image"));
  const rest = createMemo(() => items().filter((m) => kindOf(m) !== "image"));

  return (
    <Show when={items().length}>
      <div
        class="flex flex-col gap-2"
        classList={{ "mb-1.5": !!props.message.content.trim() }}
      >
        <Show when={images().length}>
          <ImageGallery images={images()} onOpen={setLightbox} />
        </Show>

        <For each={rest()}>
          {(m) => {
            const kind = kindOf(m);
            const label = () => m.name || m.url.split("/").pop() || "attachment";
            if (kind === "video")
              return (
                <div class="group/media relative overflow-hidden rounded-xl bg-[rgba(0,0,0,0.35)]">
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
                    <button
                      type="button"
                      onClick={() => void downloadFile(absolute(m.url), label())}
                      class="shrink-0 rounded-full bg-v2-background-bg-layer-02 px-3 py-1 text-[11.5px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
                    >
                      Save
                    </button>
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

/**
 * A set of images, laid out as a set.
 *
 * One image keeps its shape — contained, so a portrait screenshot is not cropped
 * to a letterbox. Two or more go into a grid of equal cells and are cropped to
 * fill them, which is what makes a set read as one object instead of a ragged
 * column. Past four, the fourth cell carries the remainder and opens the rest.
 *
 * Filenames only appear on a single image. On a grid they would be four captions
 * competing with four pictures, and the picture is the point.
 */
function ImageGallery(props: {
  images: MediaDescriptor[];
  onOpen: (m: MediaDescriptor) => void;
}) {
  const shown = () => (props.images.length > 4 ? props.images.slice(0, 4) : props.images);
  const overflow = () => props.images.length - shown().length;
  const nameOf = (m: MediaDescriptor) => m.name || m.url.split("/").pop() || "attachment";

  return (
    <Show
      when={props.images.length > 1}
      fallback={
        <div class="group/media relative overflow-hidden rounded-xl bg-[rgba(0,0,0,0.25)]">
          <button
            type="button"
            onClick={() => props.onOpen(props.images[0]!)}
            class="block w-full"
            aria-label={`View ${nameOf(props.images[0]!)}`}
          >
            <img
              src={absolute(props.images[0]!.url)}
              alt={nameOf(props.images[0]!)}
              loading="lazy"
              class="max-h-[420px] w-full object-contain"
            />
          </button>
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 text-[12px] text-[#ffffff]"
            style={{
              "background-image": "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
            }}
          >
            <span class="line-clamp-1">{nameOf(props.images[0]!)}</span>
          </div>
          <Overlay media={props.images[0]!} label={nameOf(props.images[0]!)} />
        </div>
      }
    >
      <div
        class="grid max-w-[520px] gap-1 overflow-hidden rounded-xl"
        classList={{
          "grid-cols-2": shown().length !== 3,
          "grid-cols-3": shown().length === 3,
        }}
      >
        <For each={shown()}>
          {(m, i) => (
            <div class="group/media relative aspect-[4/3] overflow-hidden bg-[rgba(0,0,0,0.25)]">
              <button
                type="button"
                onClick={() => props.onOpen(m)}
                class="block size-full"
                aria-label={`View ${nameOf(m)}`}
              >
                <img
                  src={absolute(m.url)}
                  alt={nameOf(m)}
                  loading="lazy"
                  class="size-full object-cover"
                />
              </button>
              {/* The remainder rides the last visible cell rather than adding a
                  fifth one, so the grid keeps its shape. */}
              <Show when={overflow() > 0 && i() === shown().length - 1}>
                <button
                  type="button"
                  onClick={() => props.onOpen(props.images[shown().length]!)}
                  class="absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.6)] text-[18px] font-semibold text-[#ffffff] transition-colors hover:bg-[rgba(0,0,0,0.45)]"
                  aria-label={`View ${overflow()} more image${overflow() === 1 ? "" : "s"}`}
                >
                  +{overflow()}
                </button>
              </Show>
              <Show when={!(overflow() > 0 && i() === shown().length - 1)}>
                <Overlay media={m} label={nameOf(m)} />
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/**
 * Open and download, on the card's corner.
 *
 * Icons rather than the words "Open" and "↓": the pair used to read as a label
 * beside a symbol, and the symbol did the same thing as the label — both called
 * openExternal, so neither one saved the file. They are two verbs now, and each
 * does its own.
 *
 * Literal rgba, not palette utilities: these sit on top of the image itself, so
 * they have to hold on a photograph in either theme — and bg-black/55 compiles
 * to nothing on this design system.
 */
function Overlay(props: { media: MediaDescriptor; label: string }) {
  const pill =
    "grid size-7 place-items-center rounded-full bg-[rgba(0,0,0,0.55)] text-[#ffffff] backdrop-blur transition-colors hover:bg-[rgba(0,0,0,0.82)]";
  return (
    <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/media:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void openExternal(absolute(props.media.url));
        }}
        class={pill}
        title={`Open ${props.label}`}
        aria-label={`Open ${props.label} with the system viewer`}
      >
        <ExternalLink size={13} stroke-width={2} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void downloadFile(absolute(props.media.url), props.label);
        }}
        class={pill}
        title={`Save ${props.label}`}
        aria-label={`Save ${props.label} to disk`}
      >
        <Download size={13} stroke-width={2} />
      </button>
    </div>
  );
}

function DocumentCard(props: { media: MediaDescriptor; label: string }) {
  const meta = () =>
    [extensionOf(props.label), formatBytes(props.media.size)]
      .filter(Boolean)
      .join(" · ");
  return (
    <div class="group/media relative flex min-w-0 items-center gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3">
      <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-layer-03 font-mono text-[10px] font-bold uppercase text-v2-text-text-muted">
        {extensionOf(props.label).slice(0, 4) || "FILE"}
      </div>
      <div class="min-w-0 flex-1 pr-16">
        <button
          type="button"
          onClick={() => void openExternal(absolute(props.media.url))}
          class="block w-full truncate text-left text-[12.5px] font-medium text-v2-text-text-base hover:underline"
        >
          {props.label}
        </button>
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
