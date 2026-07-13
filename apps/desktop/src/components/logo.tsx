/**
 * The AULAR mark.
 *
 * Drawn in the same grammar as opencode's logo — a two-tone block glyph on a
 * 16×20 grid with 4px strokes, so it reads like a character in a terminal font
 * rather than a startup wordmark. Ours is an "A": chamfered shoulders give it
 * the diagonal an A needs while everything else stays rectilinear, and the
 * counter carries a shadow layer for depth. Legible at 16px, holds at 512.
 *
 * Colors are theme tokens, so the mark inverts with the theme and can be
 * tinted (accent in a tile, muted when disabled).
 */
export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        data-slot="logo-mark-shadow"
        d="M12 14H4V10H12V14Z"
        fill="var(--v2-icon-icon-muted)"
      />
      <path
        data-slot="logo-mark-a"
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M5 0H11L16 5V20H12V16H4V20H0V5L5 0ZM4 6V12H12V6L10 4H6L4 6Z"
        fill="var(--v2-icon-icon-base)"
      />
    </svg>
  );
};

/** The mark, sized. */
export const Logo = (props: { size?: number; class?: string }) => (
  <span
    class="flex shrink-0 items-center justify-center"
    style={{ height: `${props.size ?? 16}px` }}
  >
    <Mark class={`h-full w-auto ${props.class ?? ""}`} />
  </span>
);
