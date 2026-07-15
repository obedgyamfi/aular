import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { AddAgentModal } from "~/components/add-agent-modal";
import { Mark } from "~/components/logo";
import { Modal } from "~/components/modal";
import { ModelSettings } from "~/components/model-settings";
import { api } from "~/lib/api";
import { actions, state } from "~/lib/store";
import type { RuntimeStatus } from "~/lib/types";

/**
 * First run — ported from the prototype's Onboarding.
 *
 * Shown in the empty chat pane before there's a team. AULAR is BYOK-first, so
 * step one is connecting a model: without a key the agents can't reply, and an
 * org that can't reply is a very confusing first impression. Then hire — from a
 * role, or by describing what you need to the AULAR system agent.
 */
export function Onboarding() {
  const [modelOpen, setModelOpen] = createSignal(false);
  const [hireOpen, setHireOpen] = createSignal(false);

  // The agent runtime. On a machine that already runs Hermes this resolves
  // to installed on the first poll and the step never renders.
  const [runtime, setRuntime] = createSignal<RuntimeStatus | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let sawInstalling = false; // only a watched install earns a gateway restart
  const refreshRuntime = async () => {
    try {
      const st = await api.runtimeStatus();
      setRuntime(st);
      const stage = st.install.stage;
      if (!st.installed && (stage === "uv" || stage === "python" || stage === "hermes" || stage === "verify")) {
        sawInstalling = true;
        pollTimer = setTimeout(() => void refreshRuntime(), 2500);
      } else if (st.installed && stage === "done" && sawInstalling) {
        // Fresh install — bring the gateway up without an app relaunch.
        sawInstalling = false;
        void restartGateway();
      }
    } catch {
      // An older backend without the endpoint: treat as installed (it is —
      // that backend only exists where Hermes already runs).
      setRuntime({ installed: true, install: { stage: "idle" } });
    }
  };
  onMount(() => void refreshRuntime());
  onCleanup(() => clearTimeout(pollTimer));

  const needsRuntime = () => runtime() !== null && !runtime()!.installed;
  const installing = () => {
    const stage = runtime()?.install.stage;
    return stage === "uv" || stage === "python" || stage === "hermes" || stage === "verify";
  };
  const startInstall = async () => {
    await api.runtimeInstall().catch(() => undefined);
    void refreshRuntime();
  };

  const model = () => state.model;
  /** Ready = the provider needs no key (local Ollama) or a key is set. */
  const modelReady = () => {
    const m = model();
    if (!m) return false;
    return !m.key_env_var || m.key_set;
  };

  const systemAgent = () => state.agents.find((a) => a.role === "system");
  /** The runtime step takes the 1 spot when it's needed. */
  const base = () => (needsRuntime() ? 1 : 0);

  return (
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div class="w-full max-w-[460px]">
        <div class="flex flex-col items-center text-center">
          <Mark class="h-9 w-auto" />
          <h1 class="mt-4 text-[19px] font-medium text-v2-text-text-base">
            Welcome to AULAR
          </h1>
          <p class="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-v2-text-text-muted">
            You're the CEO. Hire agents that delegate to each other, report
            back, and keep working while you're away — on this machine, on
            your own model. Two steps and your org is live.
          </p>
        </div>

        <div class="mt-7 flex flex-col gap-2">
          <Show when={needsRuntime()}>
            <Step
              index={1}
              highlight={!installing()}
              title="Install the agent runtime"
              body={
                installing()
                  ? stageLabel(runtime()!.install.stage) +
                    (runtime()!.install.detail ? ` — ${runtime()!.install.detail}` : "")
                  : runtime()?.install.stage === "error"
                    ? `Install failed: ${runtime()?.install.error ?? "unknown error"}`
                    : "This machine doesn't run agents yet. One click installs the Hermes runtime into the app's own folder — nothing else on your system is touched."
              }
              action={installing() ? "Installing…" : runtime()?.install.stage === "error" ? "Retry" : "Install"}
              onAction={() => {
                if (!installing()) void startInstall();
              }}
            />
          </Show>

          <Step
            index={base() + 1}
            done={modelReady()}
            highlight={!needsRuntime() && !modelReady()}
            title="Connect your model"
            body={
              modelReady()
                ? `Ready — ${model()?.model || "model set"}${
                    model()?.provider ? ` · ${model()?.provider}` : ""
                  }`
                : "AULAR runs on your own key. Add a provider and key so your agents can reply."
            }
            action={modelReady() ? "Change" : "Connect model"}
            onAction={() => setModelOpen(true)}
          />

          <Step
            index={base() + 2}
            highlight={modelReady()}
            title="Hire your first agent"
            body="Pick a role — it arrives with a persona, operating rules and tools."
            action="Hire"
            onAction={() => setHireOpen(true)}
          />

          <Step
            index={base() + 3}
            title="Or just describe what you need"
            body="Tell the AULAR system agent in plain English and it builds the agent for you."
            action="Chat with AULAR"
            muted
            onAction={() => {
              const sys = systemAgent();
              if (sys) void actions.openAgent(sys.id);
            }}
          />
        </div>
      </div>

      <Show when={modelOpen()}>
        <Modal title="Connect your model" width={460} onClose={() => setModelOpen(false)}>
          <ModelSettings />
        </Modal>
      </Show>

      <Show when={hireOpen()}>
        <AddAgentModal onClose={() => setHireOpen(false)} />
      </Show>
    </div>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "uv": return "Preparing the installer";
    case "python": return "Installing Python";
    case "hermes": return "Installing the Hermes runtime";
    case "verify": return "Checking the install";
    default: return "Installing";
  }
}

/**
 * Start (or restart) the gateway after a managed install. Packaged app only —
 * in the dev browser there is no Tauri and the dev stack runs its own gateway.
 */
async function restartGateway(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_agent_runtime");
  } catch {
    // Dev browser — nothing to restart.
  }
}

function Step(props: {
  index: number;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  done?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      class="flex items-start gap-3 rounded-md border bg-v2-background-bg-layer-01 px-3.5 py-3 transition-colors"
      classList={{
        "border-v2-border-border-focus": !!props.highlight,
        "border-v2-border-border-muted": !props.highlight,
      }}
    >
      <span
        class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
        classList={{
          "bg-v2-background-bg-accent text-v2-text-text-inverse": !!props.done,
          "bg-v2-background-bg-layer-03 text-v2-text-text-muted": !props.done,
        }}
      >
        <Show when={props.done} fallback={props.index}>
          <Icon name="check-small" size="small" />
        </Show>
      </span>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[12.5px] font-medium text-v2-text-text-base">
          {props.title}
        </span>
        <span class="text-[11.5px] leading-relaxed text-v2-text-text-muted">
          {props.body}
        </span>
      </div>

      <button
        type="button"
        onClick={props.onAction}
        class="mt-0.5 shrink-0 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
        classList={{
          "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
            !!props.muted,
          "bg-v2-background-bg-accent text-v2-text-text-inverse hover:opacity-90":
            !props.muted,
        }}
      >
        {props.action}
      </button>
    </div>
  );
}
