import CalendarDays from "lucide-solid/icons/calendar-days";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import GanttChart from "lucide-solid/icons/chart-no-axes-gantt";
import SquareKanban from "lucide-solid/icons/square-kanban";
import Users from "lucide-solid/icons/users";

import { AgentsSection, ChannelSection, NavRow } from "~/components/sidebar/parts";
import type { Agent } from "~/lib/types";

/**
 * A project — a Discord community, with its own channels and its own team.
 *
 * The surfaces here are the delivery ones: the project itself, who's on it, the
 * plan, the cadence, and the work in flight. The knowledge bank isn't among
 * them — the company knows one set of things, and that lives at home.
 */
export function ProjectBody(props: {
  system: Agent[];
  team: Agent[];
  projectName: string;
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  onStaff?: () => void;
}) {
  return (
    <>
      <nav class="flex flex-col pb-1">
        <NavRow
          register="overview"
          label="Overview"
          icon={<ClipboardList size={20} stroke-width={1.9} />}
        />
        <NavRow register="org" label="Team" icon={<Users size={20} stroke-width={1.9} />} />
        <NavRow
          register="roadmap"
          label="Roadmap"
          icon={<GanttChart size={20} stroke-width={1.9} />}
        />
        <NavRow
          register="calendar"
          label="Schedules"
          icon={<CalendarDays size={20} stroke-width={1.9} />}
        />
        <NavRow
          register="work"
          label="Work board"
          icon={<SquareKanban size={20} stroke-width={1.9} />}
        />
      </nav>
      <div class="mx-1 my-1.5 h-px bg-[var(--line)]" />

      <ChannelSection agents={props.system} hint={`Talk ${props.projectName} into shape`} />

      <AgentsSection
        label="Team"
        agents={props.team}
        collapsed={!!props.collapsed.dms}
        onToggle={() => props.onToggle("dms")}
        onAdd={props.onStaff}
        addLabel="Staff this project"
        empty="Nobody on this project yet."
      />
    </>
  );
}
