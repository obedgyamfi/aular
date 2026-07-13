import { createMemo, createSignal, For, Show } from "solid-js";

import type { DailyTokens } from "~/lib/types";

/**
 * Tokens per day, as a curve.
 *
 * Two stacked areas — input beneath, output on top — under a smooth line, with
 * a gradient that fades into the card. A bar per day says "fourteen separate
 * events"; a curve says "this is one workload, and here is its shape", which is
 * the thing you actually want to read off an org's spend.
 *
 * Hovering snaps to the nearest day and reads it out, because a shape without
 * numbers is decoration.
 */
const W = 640; // viewBox units; the SVG scales to its container
const H = 150;
const PAD_T = 10;
const PAD_B = 18;

export function TokenChart(props: { days: DailyTokens[] }) {
  const [hover, setHover] = createSignal<number | null>(null);

  const total = (d: DailyTokens) => d.input_tokens + d.output_tokens;
  const max = () => Math.max(1, ...props.days.map(total));

  const x = (i: number) =>
    props.days.length <= 1 ? W / 2 : (i / (props.days.length - 1)) * W;
  const y = (v: number) => PAD_T + (1 - v / max()) * (H - PAD_T - PAD_B);

  const points = (pick: (d: DailyTokens) => number) =>
    props.days.map((d, i) => [x(i), y(pick(d))] as const);

  const outputLine = createMemo(() => smooth(points(total)));
  const inputLine = createMemo(() => smooth(points((d) => d.input_tokens)));

  const area = (line: string) =>
    props.days.length ? `${line} L ${W} ${H - PAD_B} L 0 ${H - PAD_B} Z` : "";

  const active = () => {
    const i = hover();
    return i === null ? undefined : props.days[i];
  };

  const onMove = (e: MouseEvent & { currentTarget: SVGSVGElement }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const i = Math.round(ratio * (props.days.length - 1));
    setHover(Math.min(props.days.length - 1, Math.max(0, i)));
  };

  return (
    <div class="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        class="h-[150px] w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="aular-out" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stop-color="var(--v2-icon-icon-accent)"
              stop-opacity="0.45"
            />
            <stop
              offset="100%"
              stop-color="var(--v2-icon-icon-accent)"
              stop-opacity="0.02"
            />
          </linearGradient>
          <linearGradient id="aular-in" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stop-color="var(--v2-icon-icon-accent)"
              stop-opacity="0.22"
            />
            <stop
              offset="100%"
              stop-color="var(--v2-icon-icon-accent)"
              stop-opacity="0"
            />
          </linearGradient>
        </defs>

        {/* A faint floor and two guides, so the curve has something to sit on. */}
        <For each={[0.5, 1]}>
          {(f) => (
            <line
              x1="0"
              x2={W}
              y1={PAD_T + f * (H - PAD_T - PAD_B)}
              y2={PAD_T + f * (H - PAD_T - PAD_B)}
              stroke="var(--v2-border-border-muted)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          )}
        </For>

        <path d={area(outputLine())} fill="url(#aular-out)" />
        <path d={area(inputLine())} fill="url(#aular-in)" />

        <path
          d={inputLine()}
          fill="none"
          stroke="var(--v2-icon-icon-accent)"
          stroke-opacity="0.35"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <path
          d={outputLine()}
          fill="none"
          stroke="var(--v2-icon-icon-accent)"
          stroke-width="2"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />

        <Show when={hover() !== null}>
          <line
            x1={x(hover()!)}
            x2={x(hover()!)}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="var(--v2-border-border-focus)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <circle
            cx={x(hover()!)}
            cy={y(total(props.days[hover()!]!))}
            r="3.5"
            fill="var(--v2-background-bg-base)"
            stroke="var(--v2-icon-icon-accent)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </Show>
      </svg>

      {/* The readout: the hovered day, or the window's total when idle. */}
      <div class="flex items-center justify-between pt-1">
        <div class="flex gap-4 text-[10px] text-v2-text-text-faint">
          <Legend opacity={1} label="output" />
          <Legend opacity={0.35} label="input" />
        </div>

        <Show
          when={active()}
          fallback={
            <span class="text-[10.5px] text-v2-text-text-faint">
              {props.days.length} days
            </span>
          }
        >
          {(d) => (
            <span class="flex items-center gap-2 text-[10.5px] tabular-nums">
              <span class="text-v2-text-text-faint">{dayLabel(d().date)}</span>
              <span class="font-medium text-v2-text-text-base">
                {total(d()).toLocaleString()}
              </span>
              <span class="text-v2-text-text-faint">
                in {d().input_tokens.toLocaleString()} · out{" "}
                {d().output_tokens.toLocaleString()}
              </span>
            </span>
          )}
        </Show>
      </div>
    </div>
  );
}

function Legend(props: { opacity: number; label: string }) {
  return (
    <span class="flex items-center gap-1.5">
      <span
        class="h-[3px] w-4 rounded-full bg-v2-icon-icon-accent"
        style={{ opacity: props.opacity }}
      />
      {props.label}
    </span>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * A monotone cubic spline (Fritsch–Carlson), emitted as béziers.
 *
 * Straight segments make a workload look like a seismograph; a spline shows the
 * trend. But the obvious spline (Catmull-Rom) overshoots after a spike — it dips
 * *below* the floor between a busy day and a quiet one, drawing negative tokens.
 * Monotone interpolation can't: between two samples the curve never leaves the
 * range those samples define.
 */
function smooth(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`;

  // Secant slopes between consecutive points.
  const dx: number[] = [];
  const dy: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]![0] - pts[i]![0];
    dy[i] = pts[i + 1]![1] - pts[i]![1];
    slope[i] = dx[i]! === 0 ? 0 : dy[i]! / dx[i]!;
  }

  // Tangents: one-sided at the ends, averaged inside — and forced flat wherever
  // the data turns, which is what kills the overshoot.
  const m: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  m[n - 1] = slope[n - 2] ?? 0;

  // Fritsch–Carlson: clamp each tangent into the monotone-safe circle.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / slope[i]!;
    const b = m[i + 1]! / slope[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = t * a * slope[i]!;
      m[i + 1] = t * b * slope[i]!;
    }
  }

  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i]! / 3;
    const c1x = pts[i]![0] + third;
    const c1y = pts[i]![1] + third * m[i]!;
    const c2x = pts[i + 1]![0] - third;
    const c2y = pts[i + 1]![1] - third * m[i + 1]!;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1]![0]} ${pts[i + 1]![1]}`;
  }
  return d;
}
