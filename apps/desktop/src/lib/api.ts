// Client for the Go core, which Tauri runs as a sidecar on 127.0.0.1.
// Nothing here knows whether the licensed org engine is linked — the backend
// reports its own capabilities, and the UI adapts to them.

const BASE = import.meta.env.VITE_AULAR_API ?? "http://127.0.0.1:8787";

export interface Health {
  status: string;
  engine: string;
  /** 0 means unlimited — the org engine is linked and licensed. */
  max_agents: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<Health>("/healthz"),
};
