import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import {
  CustomEndpointMark,
  HermesMark,
  OpenAIMark,
} from "~/components/brand-icons";
import { Backdrop } from "~/components/backdrop";
import { OnboardingModelConnect } from "~/components/onboarding-model-connect";
import { actions, state } from "~/lib/store";
import { hasBackdrop } from "~/theme/theme";

/**
 * First-run setup — the full flow that runs BEFORE the chat, once per account.
 *
 * The order is deliberate: sign-in already happened (the account gate), so this
 * covers the two remaining decisions — the runtime the agents think on (Hermes
 * is bundled and default; the rest arrive later) and the model key. The key is
 * LAST and skippable: a new user reaches their org in a couple of taps and can
 * wire a provider now or from Settings whenever they're ready.
 *
 * Rendered by app.tsx between the auth gate and the shell, so the titlebar stays
 * but nothing of the org is visible yet. `onDone` marks the account onboarded
 * and hands control back to the shell.
 */
export function OnboardingFlow(props: { onDone: () => void }) {
  const [step, setStep] = createSignal<"runtime" | "model">("runtime");
  const stepIndex = () => (step() === "runtime" ? 2 : 3);

  const rt = () => state.runtime;
  onMount(() => void actions.refreshRuntime());

  const needsRuntime = () => rt() !== null && !rt()!.installed;
  const installing = () => {
    const s = rt()?.install.stage;
    return s === "uv" || s === "python" || s === "hermes" || s === "verify";
  };

  // The install bar creeps asymptotically within each stage's band so pip's
  // minutes read as motion, never a hang — and it never moves backward.
  const BANDS: Record<string, [number, number]> = {
    uv: [2, 12], python: [12, 30], hermes: [30, 92], verify: [92, 98],
  };
  const [stageAt, setStageAt] = createSignal({ stage: "", at: 0 });
  createEffect(() => {
    const s = rt()?.install.stage ?? "";
    if (s !== stageAt().stage) setStageAt({ stage: s, at: Date.now() });
  });
  const pct = () => {
    const s = rt()?.install.stage ?? "";
    if (s === "done") return 100;
    const band = BANDS[s];
    if (!band) return 0;
    const elapsed = (Date.now() - stageAt().at) / 1000;
    return band[0] + (band[1] - band[0]) * (1 - Math.exp(-elapsed / 60));
  };

  return (
    <div
      class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col text-[var(--text)]"
      classList={{ "bg-[var(--bg)]": !hasBackdrop() }}
    >
      <Show when={hasBackdrop()}>
        <Backdrop />
      </Show>
      <div class="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex items-center gap-3.5 px-9 pt-6">
        <div class="flex flex-1 gap-1.5">
          <span class="h-[3px] flex-1 rounded-full bg-[var(--accent)]" />
          <span
            class="h-[3px] flex-1 rounded-full transition-colors"
            style={{ background: stepIndex() >= 2 ? "var(--accent)" : "var(--element)" }}
          />
          <span
            class="h-[3px] flex-1 rounded-full transition-colors"
            style={{ background: stepIndex() >= 3 ? "var(--accent)" : "var(--element)" }}
          />
        </div>
        <span class="whitespace-nowrap text-[11px] text-[var(--faint)]">Step {stepIndex()} of 3</span>
      </div>

      <div
        class="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-6"
        classList={{ "items-center": step() === "runtime", "items-start pt-8": step() !== "runtime" }}
      >
        <div
          class="aular-rise flex w-full flex-col items-center"
          classList={{ "max-w-[500px] text-center": step() === "runtime", "max-w-[900px]": step() !== "runtime" }}
        >
          <span class="grid size-12 place-items-center rounded-[var(--r3)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <Show when={step() === "runtime"} fallback={<KeyGlyph />}>
              <BoltGlyph />
            </Show>
          </span>

          <Show
            when={step() === "runtime"}
            fallback={
              <>
                <h1 class="mt-4 text-center text-[24px] font-[600] tracking-[-0.01em]">Connect a model</h1>
                <p class="mt-2 max-w-[420px] text-center text-[13px] leading-relaxed text-[var(--muted)]">
                  Pick a provider — your Hermes runtime connects to 30, and each signs in its own way.
                  Do it now, or skip and add it in Settings.
                </p>

                <div class="mt-6 w-full">
                  <OnboardingModelConnect />
                </div>
              </>
            }
          >
            <h1 class="mt-4 text-[24px] font-[600] tracking-[-0.01em]">Choose your agent runtime</h1>
            <p class="mt-2 max-w-[390px] text-[13px] leading-relaxed text-[var(--muted)]">
              This is the engine your agents think on. Hermes is bundled and recommended — you can switch
              later in Settings.
            </p>

            <div class="mt-6 flex w-full flex-col gap-2.5 text-left">
              <For each={RUNTIMES}>
                {(r) => (
                  <div
                    class="flex items-center gap-3.5 rounded-[var(--r3)] px-4 py-3.5 transition-colors"
                    classList={{
                      "border-2 border-[var(--accent)] bg-[var(--surface-2)]": r.available,
                      "border border-[var(--line)] opacity-50": !r.available,
                    }}
                  >
                    <span
                      class="grid size-10 shrink-0 place-items-center rounded-[var(--r3)] text-[15px] font-medium"
                      classList={{
                        "bg-[var(--accent-soft)] text-[var(--accent)]": r.available,
                        "bg-[var(--element)] text-[var(--muted)]": !r.available,
                      }}
                    >
                      <Dynamic component={r.icon} size={21} />
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-[14px] font-medium">{r.name}</span>
                        <Show
                          when={r.available}
                          fallback={
                            <span class="rounded-full border border-[var(--line)] bg-[var(--element)] px-2 py-0.5 text-[9.5px] text-[var(--faint)]">
                              Soon
                            </span>
                          }
                        >
                          <span class="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9.5px] font-medium text-[var(--accent-text)]">
                            Recommended
                          </span>
                        </Show>
                      </div>
                      <div class="mt-0.5 text-[12px] text-[var(--muted)]">{r.desc}</div>
                    </div>
                    <Show when={r.available}>
                      <span class="grid size-[22px] shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
                        <CheckGlyph />
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <Show when={needsRuntime() && installing()}>
              <div class="mt-4 w-full">
                <div class="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>{stageLabel(rt()!.install.stage)}…</span>
                  <span class="tabular-nums text-[var(--faint)]">{Math.round(pct())}%</span>
                </div>
                <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--element)]">
                  <div
                    class="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
                    style={{ width: `${pct()}%` }}
                  />
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-[var(--line)] px-9 py-4">
        <Show
          when={step() === "model"}
          fallback={
            <span class="text-[11.5px] text-[var(--faint)]">Runs on this machine · answers to your account</span>
          }
        >
          <button
            type="button"
            onClick={() => setStep("runtime")}
            class="flex h-[38px] items-center gap-1 rounded-[var(--r2)] pr-3 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            Back
          </button>
        </Show>

        <Show
          when={step() === "runtime"}
          fallback={
            <div class="flex items-center gap-3">
              <button
                type="button"
                onClick={props.onDone}
                class="text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={props.onDone}
                class="flex h-[42px] items-center gap-2 rounded-[var(--r2)] bg-[var(--accent)] px-5 text-[13.5px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110"
              >
                Finish setup
              </button>
            </div>
          }
        >
          <Show
            when={needsRuntime() && !installing()}
            fallback={
              <button
                type="button"
                disabled={installing()}
                onClick={() => setStep("model")}
                class="flex h-[42px] items-center gap-2 rounded-[var(--r2)] bg-[var(--accent)] px-5 text-[13.5px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110 disabled:opacity-60"
              >
                {installing() ? "Installing…" : "Continue"}
              </button>
            }
          >
            <button
              type="button"
              onClick={() => void actions.installRuntime()}
              class="flex h-[42px] items-center gap-2 rounded-[var(--r2)] bg-[var(--accent)] px-5 text-[13.5px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110"
            >
              Install Hermes
            </button>
          </Show>
        </Show>
      </div>
      </div>
    </div>
  );
}

const RUNTIMES = [
  { id: "hermes", name: "Hermes", icon: HermesMark, desc: "Runs locally · full tool access · async delivery", available: true },
  { id: "openclaw", name: "OpenClaw", icon: OpenClawMark, desc: "Open agent harness · tools + MCP", available: false },
  { id: "codex", name: "Codex CLI", icon: OpenAIMark, desc: "OpenAI's coding-agent runtime", available: false },
  { id: "custom", name: "Custom endpoint", icon: CustomEndpointMark, desc: "Point at your own gateway", available: false },
];

function stageLabel(stage: string): string {
  switch (stage) {
    case "uv": return "Preparing the installer";
    case "python": return "Installing Python";
    case "hermes": return "Installing the Hermes runtime";
    case "verify": return "Checking the install";
    default: return "Installing";
  }
}

function OpenClawMark(props: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={props.size ?? 20} height={props.size ?? 20} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.4" r="1.6" />
      <path d="M12 6v5" />
      <path d="M12 11c-3.3 0-5.1 2.4-4.6 6.2" />
      <path d="M12 11c3.3 0 5.1 2.4 4.6 6.2" />
      <path d="M12 11v6.6" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" />
    </svg>
  );
}

function KeyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8 20 3M17 6l2.5 2.5M14.5 8.5 17 11" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-11" />
    </svg>
  );
}
