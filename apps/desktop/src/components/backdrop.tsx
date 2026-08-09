import { Show } from "solid-js";

/**
 * The sign-in backdrop: a still point-field over a dark gradient, drifting as
 * one slow plane.
 *
 * Chosen over three blurred colour blobs, which is the house style of every AI
 * product shipped since 2023 and reads as one. No blur, no bloom — near-black
 * with a *tint* of accent rather than a wash of it.
 *
 * The tint is `--blurple`, so the field takes on whatever colour the active
 * theme carries: this is what makes the accent themes (Crimson, Citron, Moss,
 * Tangerine) feel like themes rather than button recolours.
 *
 * It animates a transform only, so it never repaints, and the reduced-motion
 * rule in index.css freezes it to a still image.
 */
/**
 * The field itself — shared by the sign-in screen and, on an accent theme, by
 * the whole application behind every panel.
 */
export function Backdrop(props: {
  fixed?: boolean;
  /** What the field is tinted with. Defaults to the theme's accent; an agent's
   *  panel passes that agent's own colour so each profile reads as theirs. */
  tint?: string;
  /** 0–1. Panels sit closer to the eye than a full screen does, so they want
   *  less of everything. */
  strength?: number;
  /** Opt-in, and used in exactly one place: an agent's profile. A whole app
   *  that pulses is a distraction; one card that does reads as presence. */
  breathe?: boolean;
}) {
  const tint = () => props.tint ?? "var(--blurple)";
  const k = () => props.strength ?? 1;
  return (
    <div
      aria-hidden="true"
      class="pointer-events-none overflow-hidden"
      style={{ background: props.strength === undefined ? "#08080b" : "transparent" }}
      classList={{
        "fixed inset-0 z-0": !!props.fixed,
        "absolute inset-0": !props.fixed,
      }}
    >
      <div
        class="absolute inset-0"
        style={{
          background:
            `linear-gradient(180deg, color-mix(in srgb, ${tint()} ${Math.round(
              (props.fixed ? 30 : 16) * k(),
            )}%, transparent) 0%, transparent ${props.fixed ? 62 : 55}%)`,
          // Nine-second swell — slow enough to read as presence rather than
          // blinking. Only where it's asked for.
          animation: props.breathe ? "aular-glow 9s ease-in-out infinite" : undefined,
        }}
      />
      <div
        class="absolute -inset-[30%]"
        style={{
          "background-image": [
            "radial-gradient(1.5px 1.5px at 12% 22%, rgba(255,255,255,.95), transparent)",
            "radial-gradient(1.5px 1.5px at 68% 14%, rgba(255,255,255,.75), transparent)",
            "radial-gradient(1px 1px at 34% 68%, rgba(255,255,255,.82), transparent)",
            "radial-gradient(1.5px 1.5px at 82% 58%, rgba(255,255,255,.66), transparent)",
            "radial-gradient(1px 1px at 52% 40%, rgba(255,255,255,.88), transparent)",
            "radial-gradient(1px 1px at 22% 84%, rgba(255,255,255,.58), transparent)",
            "radial-gradient(1.5px 1.5px at 91% 30%, rgba(255,255,255,.75), transparent)",
            "radial-gradient(1px 1px at 6% 52%, rgba(255,255,255,.66), transparent)",
          ].join(","),
          "background-size": "440px 440px",
          animation: "aular-grid-pan 70s linear infinite",
          // Behind the app the field competes with ~80%-opaque panels, so it
          // has to be brighter than on the bare sign-in screen.
          opacity: String((props.fixed ? 1 : 0.6) * k()),
        }}
      />

      {/* The vignette focuses the sign-in card. Behind the app it would just
          darken the middle of the workspace, so it's sign-in only. */}
      <Show when={!props.fixed}>
        <div
          class="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 45%, transparent 0%, rgba(0,0,0,.45) 60%, rgba(0,0,0,.78) 100%)",
          }}
        />
      </Show>
    </div>
  );
}
