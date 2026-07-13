import { createSignal, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { AddAgentModal } from "~/components/add-agent-modal";
import { Mark } from "~/components/logo";
import { Modal } from "~/components/modal";
import { ModelSettings } from "~/components/model-settings";
import { actions, state } from "~/lib/store";

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

  const model = () => state.model;
  /** Ready = the provider needs no key (local Ollama) or a key is set. */
  const modelReady = () => {
    const m = model();
    if (!m) return false;
    return !m.key_env_var || m.key_set;
  };

  const systemAgent = () => state.agents.find((a) => a.role === "system");

  return (
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div class="w-full max-w-[460px]">
        <div class="flex flex-col items-center text-center">
          <Mark class="h-9 w-auto" />
          <h1 class="mt-4 text-[19px] font-medium text-v2-text-text-base">
            Welcome to AULAR
          </h1>
          <p class="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-v2-text-text-muted">
            Build a team of agents that work for you — they run on this machine,
            on your own model key. Two steps and you're talking to them.
          </p>
        </div>

        <div class="mt-7 flex flex-col gap-2">
          <Step
            index={1}
            done={modelReady()}
            highlight={!modelReady()}
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
            index={2}
            highlight={modelReady()}
            title="Hire your first agent"
            body="Pick a role — it arrives with a persona, operating rules and tools."
            action="Hire"
            onAction={() => setHireOpen(true)}
          />

          <Step
            index={3}
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
