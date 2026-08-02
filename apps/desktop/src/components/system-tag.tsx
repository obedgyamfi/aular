/**
 * The SYSTEM tag.
 *
 * AULAR ships with every account and can do things no hired agent can — build
 * the org, write the knowledge bank, edit other agents. It used to be marked as
 * a `#channel`, which said "this is a room" about something that is plainly
 * someone you talk to. This is the honest version, and it borrows the shape of
 * the APP chip Discord puts on bots for exactly the same reason: in a roster of
 * voices, the one that isn't a hire should say so.
 *
 * Same idiom as the AGENT chip on a message row — uppercase, accent-filled,
 * small enough to sit beside a name without competing with it.
 */
export function SystemTag(props: { size?: "sm" | "md" }) {
  const small = () => props.size !== "md";
  return (
    <span
      class="flex-none rounded-[3px] bg-[var(--accent)] font-bold uppercase tracking-[0.02em] text-[var(--on-accent)]"
      classList={{
        "px-1 py-px text-[9px] leading-[12px]": small(),
        "px-1 py-px text-[10px] leading-[13px]": !small(),
      }}
    >
      System
    </span>
  );
}
