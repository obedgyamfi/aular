import BookOpen from "lucide-solid/icons/book-open";
import CalendarDays from "lucide-solid/icons/calendar-days";
import Network from "lucide-solid/icons/network";
import SquareKanban from "lucide-solid/icons/square-kanban";

import { AgentsSection, ChannelSection, NavRow } from "~/components/sidebar/parts";
import type { Agent } from "~/lib/types";

/**
 * Home — the organization entire, in Discord's Direct-Messages seat.
 *
 * The surfaces at the top are the org-wide ones: who reports to whom, what the
 * company knows, and what it's working on. Then the channel you build the
 * company in, then every agent as a DM. A project's roadmap and schedules are
 * deliberately absent — they belong to a project, and the rail is how you get
 * to one.
 */
export function HomeBody(props: {
  system: Agent[];
  staff: Agent[];
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
  onHire?: () => void;
  hireLabel: string;
}) {
  return (
    <>
      <nav class="flex flex-col pb-1">
        <NavRow register="org" label="Org chart" icon={<Network size={16} stroke-width={1.9} />} />
        <NavRow
          register="knowledge"
          label="Knowledge graph"
          icon={<BookOpen size={16} stroke-width={1.9} />}
        />
        <NavRow
          register="work"
          label="Mission control"
          icon={<SquareKanban size={16} stroke-width={1.9} />}
        />
        {/* Routines belong to agents, and most agents are on no project — so
            without an org-wide cut here, everything they run on their own would
            have no route at all. The project's Schedules row is the same panel
            filtered to that team. */}
        <NavRow
          register="calendar"
          label="Schedules"
          icon={<CalendarDays size={16} stroke-width={1.9} />}
        />
      </nav>
      <div class="mx-1 my-0.5 h-px bg-[var(--line)]" />

      <ChannelSection agents={props.system} />

      <AgentsSection
        label="Agents"
        agents={props.staff}
        collapsed={!!props.collapsed.dms}
        onToggle={() => props.onToggle("dms")}
        onAdd={props.onHire}
        addLabel={props.hireLabel}
        empty="Hire your first agent."
      />
    </>
  );
}
