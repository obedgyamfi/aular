import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

/**
 * The dashboard's time-series chart: two named series over days, stacked
 * (tokens: what you fed + what came back = the day's total) or overlaid
 * (messages: yours vs theirs, compared).
 *
 * Series identity is fixed app-wide — blue (--viz-1) is what the user puts in,
 * orange (--viz-2) is what agents produce — so every chart in AULAR reads the
 * same way. A crosshair + tooltip carries the exact numbers; the axes carry
 * clean rounded ticks so the shape has a scale.
 */
export interface ChartPoint {
  date: string; // ISO day
  a: number; // blue series — user-fed
  b: number; // orange series — agent-produced
}

const H = 170;
const PAD_T = 14;
const PAD_B = 20; // room for the date labels

export function DualAreaChart(props: {
  points: ChartPoint[];
  aLabel: string;
  bLabel: string;
  /** true: B rides on top of A (the curve's top edge is the day's total). */
  stacked?: boolean;
  format?: (n: number) => string;
}) {
  const fmt = () => props.format ?? compact;
  const [hover, setHover] = createSignal<number | null>(null);

  // Real pixel units: text distorts under preserveAspectRatio="none", so the
  // viewBox tracks the rendered width instead.
  const [width, setWidth] = createSignal(640);
  const ro = new ResizeObserver((es) => {
    const w = es[0]?.contentRect.width;
    if (w) setWidth(w);
  });
  onCleanup(() => ro.disconnect());

  const top = (p: ChartPoint) => (props.stacked ? p.a + p.b : Math.max(p.a, p.b));
  const yMax = createMemo(() => niceCeil(Math.max(1, ...props.points.map(top))));

  const x = (i: number) =>
    props.points.length <= 1
      ? width() / 2
      : (i / (props.points.length - 1)) * width();
  const y = (v: number) => PAD_T + (1 - v / yMax()) * (H - PAD_T - PAD_B);
  const floor = H - PAD_B;

  const pts = (pick: (p: ChartPoint) => number) =>
    props.points.map((p, i) => [x(i), y(pick(p))] as const);

  const lineA = createMemo(() => smooth(pts((p) => p.a)));
  const lineB = createMemo(() =>
    smooth(pts((p) => (props.stacked ? p.a + p.b : p.b))),
  );

  /** Area under a line, down to the baseline. */
  const under = (line: string) =>
    props.points.length ? `${line} L ${width()} ${floor} L 0 ${floor} Z` : "";
  /** The stacked band between A's edge and the total's edge. */
  const band = createMemo(() => {
    if (!props.points.length) return "";
    const lower = pts((p) => p.a);
    const back = smooth([...lower].reverse());
    return `${lineB()} L ${back.slice(2)} Z`;
  });

  // ── the crosshair ────────────────────────────────────────────────────────
  const snap = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    const i = Math.round(ratio * (props.points.length - 1));
    setHover(Math.min(props.points.length - 1, Math.max(0, i)));
  };
  const active = () => {
    const i = hover();
    return i === null ? undefined : props.points[i];
  };

  const onKey = (e: KeyboardEvent) => {
    const n = props.points.length;
    if (!n) return;
    const i = hover();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      setHover(Math.min(n - 1, Math.max(0, (i ?? n - 1) + d)));
    } else if (e.key === "Escape") setHover(null);
  };

  // ~4 date labels, always including the ends.
  const xTicks = createMemo(() => {
    const n = props.points.length;
    if (n < 2) return n ? [0] : [];
    const want = Math.min(4, n);
    return [...new Set(
      Array.from({ length: want }, (_, k) =>
        Math.round((k / (want - 1)) * (n - 1)),
      ),
    )];
  });

  const last = () => props.points.length - 1;

  return (
    <div
      ref={(el) => ro.observe(el)}
      class="relative"
    >
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${width()} ${H}`}
        role="img"
        aria-label={`${props.aLabel} and ${props.bLabel} per day`}
        tabindex="0"
        class="block outline-none focus-visible:rounded focus-visible:ring-1 focus-visible:ring-v2-border-border-focus"
        onMouseMove={(e) => snap(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => hover() === null && setHover(last())}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {/* Grid: baseline + two guides, each carrying its value. */}
        <For each={[1, 0.5]}>
          {(f) => (
            <>
              <line
                x1="0"
                x2={width()}
                y1={y(yMax() * f)}
                y2={y(yMax() * f)}
                stroke="var(--v2-border-border-muted)"
                stroke-width="1"
              />
              {/* Left-anchored: the newest data (and its end-dots) live at the
                  right edge, so labels there collide with the story. */}
              <text
                x={0}
                y={y(yMax() * f) - 4}
                text-anchor="start"
                fill="var(--v2-text-text-faint)"
                style={{ "font-size": "9.5px" }}
              >
                {fmt()(yMax() * f)}
              </text>
            </>
          )}
        </For>
        <line
          x1="0"
          x2={width()}
          y1={floor}
          y2={floor}
          stroke="var(--v2-border-border-base)"
          stroke-width="1"
        />

        {/* Washes first, edges on top. */}
        <Show
          when={props.stacked}
          fallback={
            <>
              <path d={under(lineA())} fill="var(--viz-1)" opacity="0.1" />
              <path d={under(lineB())} fill="var(--viz-2)" opacity="0.1" />
            </>
          }
        >
          <path d={under(lineA())} fill="var(--viz-1)" opacity="0.12" />
          <path d={band()} fill="var(--viz-2)" opacity="0.14" />
        </Show>

        <path
          d={lineA()}
          fill="none"
          stroke="var(--viz-1)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d={lineB()}
          fill="none"
          stroke="var(--viz-2)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        {/* Date labels. */}
        <For each={xTicks()}>
          {(i) => (
            <text
              x={x(i)}
              y={H - 6}
              text-anchor={i === 0 ? "start" : i === last() ? "end" : "middle"}
              fill="var(--v2-text-text-faint)"
              style={{ "font-size": "9.5px" }}
            >
              {dayLabel(props.points[i]!.date)}
            </text>
          )}
        </For>

        {/* End-dots with a surface ring, so the newest value is findable. */}
        <Show when={props.points.length}>
          <circle
            cx={x(last())}
            cy={y(props.stacked ? top(props.points[last()]!) : props.points[last()]!.b)}
            r="4"
            fill="var(--viz-2)"
            stroke="var(--v2-background-bg-layer-01)"
            stroke-width="2"
          />
          <circle
            cx={x(last())}
            cy={y(props.points[last()]!.a)}
            r="4"
            fill="var(--viz-1)"
            stroke="var(--v2-background-bg-layer-01)"
            stroke-width="2"
          />
        </Show>

        {/* The crosshair. */}
        <Show when={hover() !== null}>
          <line
            x1={x(hover()!)}
            x2={x(hover()!)}
            y1={PAD_T - 4}
            y2={floor}
            stroke="var(--v2-border-border-focus)"
            stroke-width="1"
          />
        </Show>
      </svg>

      {/* Tooltip — every series at the hovered day, values leading. */}
      <Show when={active()}>
        {(p) => (
          <div
            class="pointer-events-none absolute top-0 z-10 flex min-w-[132px] flex-col gap-1 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 px-2.5 py-2 shadow-md"
            style={tooltipPos(x(hover()!), width())}
          >
            <span class="text-[10px] font-medium text-v2-text-text-faint">
              {fullDayLabel(p().date)}
            </span>
            <Show when={props.stacked}>
              <Row label="Total" value={fmt()(p().a + p().b)} />
            </Show>
            <Row label={props.aLabel} value={fmt()(p().a)} color="var(--viz-1)" />
            <Row label={props.bLabel} value={fmt()(p().b)} color="var(--viz-2)" />
          </div>
        )}
      </Show>

      {/* Legend — two series, identity never color-alone (labels ride it). */}
      <div class="flex items-center gap-4 pt-1.5">
        <Key color="var(--viz-1)" label={props.aLabel} />
        <Key color="var(--viz-2)" label={props.bLabel} />
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string; color?: string }) {
  return (
    <span class="flex items-center gap-1.5 text-[11px]">
      <Show
        when={props.color}
        fallback={<span class="h-[3px] w-3 shrink-0 rounded-full bg-v2-text-text-faint" />}
      >
        <span
          class="h-[3px] w-3 shrink-0 rounded-full"
          style={{ background: props.color }}
        />
      </Show>
      <span class="font-medium tabular-nums text-v2-text-text-base">
        {props.value}
      </span>
      <span class="text-v2-text-text-faint">{props.label}</span>
    </span>
  );
}

function Key(props: { color: string; label: string }) {
  return (
    <span class="flex items-center gap-1.5 text-[10.5px] text-v2-text-text-faint">
      <span
        class="h-[8px] w-[12px] rounded-[3px]"
        style={{ background: props.color, opacity: 0.85 }}
      />
      {props.label}
    </span>
  );
}

/** Keep the tooltip inside the card: flip sides past the middle. */
function tooltipPos(px: number, width: number): Record<string, string> {
  return px < width / 2
    ? { left: `${Math.round(px + 10)}px` }
    : { right: `${Math.round(width - px + 10)}px` };
}

export function compact(n: number): string {
  if (n >= 1_000_000) return trimZero((n / 1_000_000).toFixed(1)) + "M";
  if (n >= 1_000) return trimZero((n / 1_000).toFixed(1)) + "k";
  return String(Math.round(n));
}
const trimZero = (s: string) => s.replace(/\.0$/, "");

/** Round a maximum up to a clean tick value: 1/2/2.5/5 × 10^k. */
function niceCeil(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fullDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
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
export function smooth(pts: readonly (readonly [number, number])[]): string {
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
