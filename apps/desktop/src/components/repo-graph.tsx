import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { Avatar } from "~/components/avatar";
import { api } from "~/lib/api";
import type { RepoCommit } from "~/lib/types";

/**
 * The commit graph — the org's git work drawn as rails, the way GitKraken
 * draws it: one colored lane per line of history, dots for commits, curves
 * where branches fork and merge. Agents commit as themselves (the identity
 * doctrine), so their avatars ride their own commits — you can watch Forge's
 * branch grow next to Pixel's.
 */
const ROW_H = 40;
const LANE_W = 14;
const laneColor = (lane: number) => `var(--graph-${(lane % 6) + 1})`;

interface Row {
  c: RepoCommit;
  lane: number;
  /** a child above already rides this lane — draw the incoming rail */
  incoming: boolean;
  /** lanes that flow through this row untouched */
  through: number[];
  /** lanes closing into this commit (children merging up into it) */
  closing: number[];
  /** this commit's outgoing edges: lane → parent's lane */
  out: { from: number; to: number }[];
}

/** Classic lane assignment over date-ordered commits, newest first. */
function layout(commits: RepoCommit[]): { rows: Row[]; width: number } {
  const lanes: (string | null)[] = []; // hash each lane expects next
  let maxLane = 0;
  const alloc = (hash: string) => {
    let i = lanes.indexOf(null);
    if (i === -1) i = lanes.length;
    lanes[i] = hash;
    return i;
  };

  const rows: Row[] = [];
  for (const c of commits) {
    let lane = lanes.indexOf(c.hash);
    const incoming = lane !== -1;
    if (lane === -1) lane = alloc(c.hash);

    const closing: number[] = [];
    lanes.forEach((h, i) => {
      if (h === c.hash && i !== lane) {
        closing.push(i);
        lanes[i] = null;
      }
    });

    const before = lanes.map((h, i) => (h !== null && i !== lane ? i : -1));
    const out: Row["out"] = [];
    const parents = c.parents ?? [];
    lanes[lane] = parents[0] ?? null;
    if (parents[0]) out.push({ from: lane, to: lane });
    for (const p of parents.slice(1)) {
      let t = lanes.indexOf(p);
      if (t === -1) t = alloc(p);
      out.push({ from: lane, to: t });
    }

    const through = before.filter((i) => i >= 0 && lanes[i] !== null);
    rows.push({ c, lane, incoming, through, closing, out });
    maxLane = Math.max(maxLane, lane, lanes.length - 1);
  }
  return { rows, width: (maxLane + 1) * LANE_W + LANE_W / 2 };
}

const x = (lane: number) => lane * LANE_W + LANE_W / 2 + 2;

export function RepoGraph() {
  const [path, setPath] = createSignal(
    localStorage.getItem("aular-repo-path") ?? "",
  );
  const [loadedPath, setLoadedPath] = createSignal(path());

  const [commits] = createResource(loadedPath, (p) =>
    p ? api.repoLog(p, 120) : Promise.resolve([]),
  );

  const load = () => {
    const p = path().trim();
    localStorage.setItem("aular-repo-path", p);
    setLoadedPath(p);
  };

  const graph = createMemo(() => layout(commits() ?? []));

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-4 py-2">
        <input
          value={path()}
          onInput={(e) => setPath(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Repository path — e.g. ~/code/myproject"
          class="w-[360px] rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-1.5 font-mono text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
        />
        <button
          type="button"
          onClick={load}
          class="rounded-md bg-v2-background-bg-accent px-3 py-1.5 text-[12px] font-medium text-v2-text-text-inverse transition-opacity hover:opacity-90"
        >
          Load
        </button>
        <span class="text-[11px] text-v2-text-text-faint">
          agents commit as themselves — their avatars ride their commits
        </span>
      </div>

      <Show
        when={loadedPath()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
            <p class="max-w-[420px] text-[11.5px] leading-relaxed text-v2-text-text-muted">
              Point this at any repository your agents work in and watch the
              history as a graph — branch-per-task rails, merges, and who did
              what.
            </p>
          </div>
        }
      >
        <Show
          when={!commits.error}
          fallback={
            <p class="px-4 py-6 text-[12px] text-v2-state-fg-danger">
              {String(commits.error?.message ?? commits.error)}
            </p>
          }
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <div class="mx-auto w-full max-w-[980px] px-4 py-3">
              <For each={graph().rows}>
                {(row) => <CommitRow row={row} width={graph().width} />}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function CommitRow(props: { row: Row; width: number }) {
  const r = () => props.row;
  const agent = () => /^(.+) \(AULAR\)$/.exec(r().c.author)?.[1];

  return (
    <div
      class="flex items-center gap-3 rounded-md pr-2 transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      style={{ height: `${ROW_H}px` }}
      title={`${r().c.hash.slice(0, 10)} — ${r().c.author}`}
    >
      <svg
        width={props.width}
        height={ROW_H}
        class="shrink-0"
        aria-hidden="true"
      >
        {/* rails flowing through untouched */}
        <For each={r().through}>
          {(lane) => (
            <line
              x1={x(lane)}
              y1="0"
              x2={x(lane)}
              y2={ROW_H}
              stroke={laneColor(lane)}
              stroke-width="2"
              opacity="0.75"
            />
          )}
        </For>
        {/* children closing into this dot from other lanes */}
        <For each={r().closing}>
          {(lane) => (
            <path
              d={`M ${x(lane)} 0 C ${x(lane)} ${ROW_H / 2}, ${x(r().lane)} ${ROW_H / 4}, ${x(r().lane)} ${ROW_H / 2}`}
              fill="none"
              stroke={laneColor(lane)}
              stroke-width="2"
              opacity="0.9"
            />
          )}
        </For>
        {/* this commit's edges to its parents */}
        <For each={r().out}>
          {(e) => (
            <Show
              when={e.from !== e.to}
              fallback={
                <line
                  x1={x(e.from)}
                  y1={ROW_H / 2}
                  x2={x(e.from)}
                  y2={ROW_H}
                  stroke={laneColor(e.from)}
                  stroke-width="2"
                />
              }
            >
              <path
                d={`M ${x(e.from)} ${ROW_H / 2} C ${x(e.from)} ${ROW_H}, ${x(e.to)} ${ROW_H / 2}, ${x(e.to)} ${ROW_H}`}
                fill="none"
                stroke={laneColor(e.to)}
                stroke-width="2"
                opacity="0.9"
              />
            </Show>
          )}
        </For>
        {/* the rail arriving from the commit's child above */}
        <Show when={r().incoming}>
          <line
            x1={x(r().lane)}
            y1="0"
            x2={x(r().lane)}
            y2={ROW_H / 2}
            stroke={laneColor(r().lane)}
            stroke-width="2"
          />
        </Show>
        {/* the commit itself, ringed in the surface so rails never cut it */}
        <circle
          cx={x(r().lane)}
          cy={ROW_H / 2}
          r="4.5"
          fill={laneColor(r().lane)}
          stroke="var(--v2-background-bg-base)"
          stroke-width="2"
        />
      </svg>

      <div class="flex min-w-0 flex-1 items-center gap-2">
        <For each={r().c.refs ?? []}>
          {(ref) => (
            <span class="shrink-0 rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 px-2 py-0.5 font-mono text-[10px] text-v2-text-text-accent">
              {ref}
            </span>
          )}
        </For>
        <span class="min-w-0 truncate text-[12px] text-v2-text-text-base">
          {r().c.subject}
        </span>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Show
          when={agent()}
          fallback={
            <span class="text-[10.5px] text-v2-text-text-faint">{r().c.author}</span>
          }
        >
          {(name) => (
            <span class="flex items-center gap-1.5 text-[10.5px] text-v2-text-text-muted">
              <Avatar name={name()} size={16} />
              {name()}
            </span>
          )}
        </Show>
        <span class="font-mono text-[10px] text-v2-text-text-faint">
          {r().c.hash.slice(0, 7)}
        </span>
        <span class="w-[34px] text-right text-[10px] tabular-nums text-v2-text-text-faint">
          {relAge(r().c.date)}
        </span>
      </div>
    </div>
  );
}

function relAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(m, 0)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}
