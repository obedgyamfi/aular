# Architecture

## Why the shell and the engine are separate repositories

AULAR's shell is public so that people can read the code before letting an
autonomous agent run commands on their machine. The org engine is private
because it is the product.

The split is not a licence trick — it is a real boundary in the code. The shell
depends on one interface, [`core/engine.Engine`](../core/engine/engine.go), and
never on the engine's implementation. Two binaries satisfy it:

| binary | repo | engine | agents |
|---|---|---|---|
| `aular-core` | public | `engine.Noop` | 3 |
| `aular-pro` | private | `org.Engine` | unlimited when licensed |

Both link the same `core/server`. That is the only file that differs between
the free and paid products, which means the paid build cannot silently drift
away from the open one.

### What this buys us

* **Auditability where it counts.** The scary code — what tools an agent has,
  what commands it can run, how it touches your files — is in the shell and in
  Hermes (MIT). Both are readable. The closed part only decides *which agent
  gets which task*.
* **No dead code in the open repo.** The shell doesn't ship disabled paid
  features; it ships a smaller, honest product.
* **A licence lapse is never destructive.** An unlicensed Pro build degrades to
  shell behaviour. It does not lock anyone out of their own agents or data.

## Process model

Tauri (Rust) owns the window, the native menu, and the lifetime of the Go
backend, which it runs as a **sidecar** — the same pattern opencode uses to
bundle its CLI. Rust holds no product logic. If the backend dies it is
restarted; when the window closes the backend is killed, so no orphan can hold
the port or a database lock.

## Frontend

SolidJS + Vite + Tailwind v4 on `@opencode-ai/ui` (MIT). Their token and
cascade-layer architecture is adopted wholesale; the palette and typography are
ours. Note that opencode ships Berkeley Mono, which is commercially licensed —
AULAR uses IBM Plex Mono (OFL) instead, and must not ship Berkeley Mono.

### The one gotcha

`@opencode-ai/ui/styles/tailwind` pins Tailwind's content scanning to *their*
repo root. Imported from `node_modules` that path resolves nowhere, and Tailwind
emits none of our utility classes — every layout silently collapses with no
error. `apps/desktop/src/styles/index.css` therefore declares `@source "../"`.
Do not remove it.
