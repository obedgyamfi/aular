# AULAR

**Your agent organization, running on your machine.**

AULAR is a desktop app for running a team of AI agents on your own computer,
with your own model key. Not a coding assistant — an organization: agents with
names and roles who take work, hand it to each other, and report back.

This repository is the **shell**: the desktop app, the chat and work surfaces,
the agent runtime bridge, and a backend that runs a small team locally. It is
complete and it is genuinely useful on its own.

The **org engine** — agent-to-agent dispatch, the report relay, the SLA
watchdog, the shared knowledge bank and roadmap, and the organization
dashboard — is the commercial part of AULAR and is not in this repository. See
[Editions](#editions).

---

## Editions

| | Shell (this repo) | AULAR Pro |
|---|---|---|
| Chat with agents, tool visibility | ✅ | ✅ |
| Your own model &amp; key (BYOK) | ✅ | ✅ |
| Runs entirely on your machine | ✅ | ✅ |
| Agents | up to 3 | unlimited |
| Agents delegate work to each other | — | ✅ |
| Shared knowledge bank &amp; roadmap | — | ✅ |
| Scheduled routines | — | ✅ |
| Organization dashboard | — | ✅ |
| Commercial use | requires a licence | ✅ |

The two builds differ in exactly one file (`core/cmd/aular-core/main.go` versus
its counterpart in the private engine repository). Everything else — this whole
shell — is shared. The seam is [`core/engine`](core/engine/engine.go), and it is
worth reading if you want to understand how the app is put together.

## Architecture

```
┌──────────────────────── Tauri 2 (Rust) ────────────────────────┐
│  window · native menu · sidecar supervision · licence check    │
│                                                                │
│  ┌── webview: SolidJS + Vite + Tailwind v4 ──────────────────┐ │
│  │  built on @opencode-ai/ui (MIT) — tokens, cascade layers  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │ HTTP (127.0.0.1)                │
│  ┌── sidecar: aular-core (Go) ──────────────────────────────┐  │
│  │  chat · agents · Hermes bridge   →  engine.Engine seam   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

Rust owns the window and the lifetime of the backend, and nothing else — the
layer that can take the whole app down stays boring on purpose. Product
behaviour lives in the webview or in the Go backend.

## Develop

Requires Rust, Node 20+, Go 1.24+, and (on Linux) the WebKit dev libraries:

```bash
sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev build-essential \
  curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
npm install
go -C core build -o apps/desktop/src-tauri/binaries/aular-core ./cmd/aular-core
npm run tauri dev
```

To iterate on the UI alone, run the backend and Vite separately:

```bash
go -C core run ./cmd/aular-core     # backend on :8787
npm run dev                          # UI on :1420
```

## Design system

The UI is built on [`@opencode-ai/ui`](https://www.npmjs.com/package/@opencode-ai/ui)
(MIT): CSS cascade layers so specificity never fights, and semantic design
tokens instead of hex codes in components. AULAR's palette and type live in
one file, [`apps/desktop/src/styles/index.css`](apps/desktop/src/styles/index.css).

**Components reference tokens (`var(--aular-text)`), never colors.** Changing
the entire look must remain a one-file edit.

## Licence

[Business Source License 1.1](LICENSE) — free for personal, educational and
non-commercial use; a commercial licence is required to use AULAR in work that
makes money. Each version becomes Apache 2.0 four years after publication.
