// Capability checks against the linked backend engine. The UI asks "can I do
// this?", never "which tier is this?" — so a licensed build needs no frontend
// changes, and the free shell degrades honestly.
export const engine = {
  /** True when the org engine is absent or unlicensed (a finite agent cap). */
  isFree: (maxAgents?: number) => maxAgents !== undefined && maxAgents > 0,
  /** True when agents may dispatch work to each other. */
  canDelegate: (maxAgents?: number) => maxAgents === 0,
};
