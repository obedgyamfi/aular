import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Plus } from "lucide-solid";

import { Tooltip } from "~/components/tooltip";
import { Mark } from "~/components/logo";
import { NewProjectModal } from "~/components/new-project-modal";
import {
  actions,
  atHome,
  homeUnread,
  HOME_PROJECT,
  projectUnread,
  railProjects,
  state,
} from "~/lib/store";

/**
 * The rail — Discord's server column, and the app's spine.
 *
 * One tile per *place you can be*: home, which is the organization entire, then
 * one per project. That's the whole model. A project is a community — its team,
 * its roadmap, its schedules, its channels all live inside its tile — so the
 * rail is the only project switcher there is, and there's no "Projects" screen
 * listing what the rail is already showing.
 *
 * 72px column, 48px tiles, a red count badge straddling the tile's corner, and
 * the white edge pill that is a bar when you're there, a dot when something's
 * waiting, and a nub under the cursor.
 *
 * One departure from Discord: the tiles keep their squircle at all times rather
 * than morphing circle→rounded-square on hover. Selection is carried by the
 * accent fill and the edge pill, which say it twice already — the shape change
 * was a third voice, and it made a column of mixed circles and squares.
 */
export function CommunityRail() {
  const [newProject, setNewProject] = createSignal(false);

  /** A project the AULAR agent has drafted — it shows as a tile before it's real. */
  const ghost = () => (state.draft?.kind === "project" ? state.draft : null);

  return (
    <aside class="flex w-[72px] shrink-0 flex-col items-center bg-[var(--rail)] pt-3">
      {/* Home — the whole company. Discord's DM button, in the same seat. */}
      <RailTile
        label="Your Organization"
        active={atHome()}
        unread={homeUnread()}
        onClick={() => actions.setActiveProject(HOME_PROJECT.id)}
      >
        {/* The mark follows the tile's text colour rather than the icon tokens,
            so it inverts on the accent fill instead of staying dark on blurple. */}
        <Mark class="h-[22px] w-auto [--v2-icon-icon-base:currentColor] [--v2-icon-icon-muted:color-mix(in_srgb,currentColor_40%,transparent)]" />
      </RailTile>

      <span class="my-2.5 h-0.5 w-8 flex-none rounded-full bg-[var(--line)]" />

      {/* The projects, with the add tile after them — scrolling so a big org
          doesn't push New project off the bottom. */}
      <div class="aular-no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto pb-[60px]">
        <For each={railProjects()}>
          {(p) => (
            <RailTile
              label={p.name}
              active={state.activeProjectId === p.id}
              unread={projectUnread(p)}
              onClick={() => actions.setActiveProject(p.id)}
            >
              <span class="text-[12px] font-bold tracking-tight">{initials(p.name)}</span>
            </RailTile>
          )}
        </For>

        <Show when={ghost()}>
          {(g) => (
            <RailTile
              label={`${g().name} — drafted, not yet applied`}
              active={state.register === "overview"}
              ghost
              onClick={() => actions.setRegister("overview")}
            >
              <span class="text-[18px] font-bold tracking-tight">{initials(g().name)}</span>
            </RailTile>
          )}
        </Show>

        {/* The green add tile, exactly where Discord keeps it. */}
        <Tooltip label="New project">
          <button
            type="button"
            onClick={() => setNewProject(true)}
            aria-label="New project"
            class="grid size-8 flex-none place-items-center rounded-[var(--r4)] bg-[var(--tile)] text-[var(--green)] transition-colors duration-200 hover:bg-[var(--green)] hover:text-white"
          >
            <Plus size={16} stroke-width={2.2} />
          </button>
        </Tooltip>
      </div>

      {/* No settings tile and no portrait down here: your account lives in one
          place, the user panel at the foot of the sidebar — and now that the
          sidebar never hides, that place is always on screen. */}

      <Show when={newProject()}>
        <NewProjectModal onClose={() => setNewProject(false)} />
      </Show>
    </aside>
  );
}

/**
 * One tile, with its edge pill and count badge.
 *
 * The pill sits on the rail's outer edge rather than the tile's, which is what
 * makes it read as "you are here" for the column instead of decoration on a
 * button.
 */
function RailTile(props: {
  label: string;
  active: boolean;
  unread?: number;
  /** A drafted project — outlined, not filled, until it's applied. */
  ghost?: boolean;
  onClick?: () => void;
  children: JSX.Element;
}) {
  const unread = () => props.unread ?? 0;

  return (
    <div class="group/tile relative flex w-full flex-none justify-center">
      <span
        aria-hidden="true"
        class="absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-[var(--text)] transition-all duration-200"
        classList={{
          "h-10": props.active,
          "h-2": !props.active && unread() > 0,
          "h-0 group-hover/tile:h-5": !props.active && unread() === 0,
        }}
      />

      <Tooltip label={props.label}>
        <button
          type="button"
          onClick={props.onClick}
          aria-current={props.active}
          aria-label={props.label}
          class="grid size-8 place-items-center rounded-[var(--r4)] transition-colors duration-200 hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
          classList={{
            "bg-[var(--accent)] bg-[image:var(--accent-grad)] text-[var(--on-accent)]": props.active,
            "border border-dashed border-[var(--accent)] bg-transparent text-[var(--accent-text)]":
              !props.active && !!props.ghost,
            "bg-[var(--tile)] text-[var(--text-2)]": !props.active && !props.ghost,
          }}
        >
          {props.children}
        </button>
      </Tooltip>

      {/* Discord's count: red, ringed in the rail so it reads as sitting on top
          of the tile rather than punched into it. */}
      <Show when={unread() > 0}>
        <span class="pointer-events-none absolute bottom-0 right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-[var(--pill)] bg-[var(--red)] px-1.5 text-[11px] font-bold leading-none text-white ring-[3px] ring-[var(--rail)]">
          {unread() > 99 ? "99+" : unread()}
        </span>
      </Show>
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "AU";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
