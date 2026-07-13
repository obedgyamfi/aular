import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode-ai/ui/icon";

import { MemoryPanel } from "~/components/memory-panel";
import { ModelSettings } from "~/components/model-settings";
import { UsagePanel } from "~/components/usage-panel";
import { UserAvatar, userEmail, userName } from "~/components/user-avatar";
import { AVATAR_STYLES, type AvatarStyleId } from "~/lib/avatar";
import { fileToAvatarDataUrl, settings, settingsActions } from "~/lib/settings";
import { actions, state, type SettingsSection } from "~/lib/store";
import { colorScheme, setColorScheme, type ColorScheme } from "~/theme/theme";

/**
 * Settings — ported from the prototype's SettingsPage.
 *
 * Section nav on the left, cards on the right. The split matters: the account
 * sections (model, usage, memory) describe your organization and follow you to
 * any machine; the appearance section is this device only.
 */
type SectionId = SettingsSection;

const SECTIONS: { id: SectionId; label: string; keywords: string }[] = [
  { id: "general", label: "General", keywords: "profile name email account photo" },
  {
    id: "appearance",
    label: "Appearance",
    keywords: "theme dark light avatar motion animation",
  },
  {
    id: "chats",
    label: "Chats and notifications",
    keywords: "notifications muted agents alerts",
  },
  {
    id: "model",
    label: "Model and provider",
    keywords: "byok api key openai anthropic ollama openrouter",
  },
  { id: "usage", label: "Usage", keywords: "metering tokens messages metrics" },
  { id: "memory", label: "Memory", keywords: "remembered facts skills hermes" },
  { id: "about", label: "About AULAR", keywords: "version runtime engine" },
];

export function SettingsPanel() {
  // Whoever opened Settings decides where you land; you navigate from there.
  const [section, setSection] = createSignal<SectionId>(state.settingsSection);
  const [filter, setFilter] = createSignal("");

  const visible = createMemo(() => {
    const q = filter().trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.label.toLowerCase().includes(q) || s.keywords.includes(q),
    );
  });

  const current = () => SECTIONS.find((s) => s.id === section());

  return (
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-v2-background-bg-base">
      <aside class="flex w-[248px] shrink-0 flex-col overflow-hidden border-r border-v2-border-border-muted">
        <div class="flex h-11 shrink-0 items-center gap-1.5 px-2">
          <button
            type="button"
            aria-label="Back to chat"
            onClick={() => actions.setRegister("chat")}
            class="flex size-7 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base"
          >
            <Icon name="arrow-left" size="small" />
          </button>
          <h1 class="text-[13px] font-medium text-v2-text-text-base">Settings</h1>
        </div>

        <div class="shrink-0 px-2 pb-2">
          <input
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            placeholder="Find in settings"
            class="w-full rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2.5 py-1 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus"
          />
        </div>

        <nav class="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
          <For each={visible()}>
            {(s) => (
              <button
                type="button"
                aria-current={section() === s.id}
                onClick={() => setSection(s.id)}
                class="rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-v2-overlay-simple-overlay-hover aria-[current=false]:text-v2-text-text-muted aria-[current=true]:bg-v2-overlay-simple-overlay-pressed aria-[current=true]:text-v2-text-text-base"
              >
                {s.label}
              </button>
            )}
          </For>
          <Show when={!visible().length}>
            <p class="px-2.5 py-2 text-[11.5px] text-v2-text-text-faint">No matches.</p>
          </Show>
        </nav>
      </aside>

      <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-8 py-6">
          <h2 class="text-[15px] font-medium text-v2-text-text-base">
            {current()?.label}
          </h2>

          <Show when={section() === "general"}>
            <General />
          </Show>
          <Show when={section() === "appearance"}>
            <Appearance />
          </Show>
          <Show when={section() === "chats"}>
            <Chats />
          </Show>
          <Show when={section() === "model"}>
            <Card description="The model your agents run on. You bring the key; it stays on this machine.">
              <ModelSettings />
            </Card>
          </Show>
          <Show when={section() === "usage"}>
            <Card description="What this beta measures. Nothing here is enforced.">
              <UsagePanel />
            </Card>
          </Show>
          <Show when={section() === "memory"}>
            <Card description="What your agents remember, read live from the Hermes memory graph.">
              <MemoryPanel />
            </Card>
          </Show>
          <Show when={section() === "about"}>
            <About />
          </Show>
        </div>
      </div>
    </div>
  );
}

// ── sections ────────────────────────────────────────────────────────────────

function General() {
  const [error, setError] = createSignal("");
  let picker: HTMLInputElement | undefined;

  const pick = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      settingsActions.setProfile({ avatarDataUrl: await fileToAvatarDataUrl(file) });
    } catch {
      setError("Couldn't read that image — try a JPG or PNG.");
    }
  };

  return (
    <>
      <div class="flex items-center gap-4 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3.5">
        <UserAvatar size={52} />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[13.5px] font-medium text-v2-text-text-base">
            {userName()}
          </span>
          <span class="truncate text-[11.5px] text-v2-text-text-muted">
            {userEmail()}
          </span>
          <Show when={error()}>
            <span class="text-[11px] text-v2-state-fg-danger">{error()}</span>
          </Show>
        </div>

        <div class="flex shrink-0 flex-col items-end gap-1">
          <input
            ref={picker}
            type="file"
            accept="image/*"
            class="hidden"
            onChange={(e) => {
              void pick(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => picker?.click()}
            class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[11.5px] font-medium text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
          >
            Upload photo
          </button>
          <Show when={settings.profile.avatarDataUrl}>
            <button
              type="button"
              onClick={() => settingsActions.setProfile({ avatarDataUrl: "" })}
              class="text-[11px] text-v2-text-text-muted hover:text-v2-text-text-base"
            >
              Use generated avatar
            </button>
          </Show>
        </div>
      </div>

      <Row title="Display name" description="How you appear across the shell.">
        <input
          value={settings.profile.name}
          onInput={(e) => settingsActions.setProfile({ name: e.currentTarget.value })}
          placeholder={state.user?.display_name ?? ""}
          class={control}
        />
      </Row>
      <Row title="Email" description="Shown on your profile card.">
        <input
          value={settings.profile.email}
          onInput={(e) => settingsActions.setProfile({ email: e.currentTarget.value })}
          placeholder={state.user?.email ?? ""}
          class={control}
        />
      </Row>
      <Row title="Bio" description="A line about this workspace.">
        <input
          value={settings.profile.bio}
          onInput={(e) => settingsActions.setProfile({ bio: e.currentTarget.value })}
          class={control}
        />
      </Row>
    </>
  );
}

function Appearance() {
  const SCHEMES: { id: ColorScheme; label: string }[] = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  return (
    <>
      <Row title="Theme" description="Follow the system, or pin it.">
        <div class="flex gap-1 rounded-md bg-v2-background-bg-layer-02 p-0.5">
          <For each={SCHEMES}>
            {(s) => (
              <button
                type="button"
                aria-current={colorScheme() === s.id}
                onClick={() => setColorScheme(s.id)}
                class="rounded px-2.5 py-1 text-[11.5px] transition-colors aria-[current=false]:text-v2-text-text-muted aria-[current=true]:bg-v2-background-bg-layer-03 aria-[current=true]:text-v2-text-text-base"
              >
                {s.label}
              </button>
            )}
          </For>
        </div>
      </Row>

      <Row title="Avatar style" description="How agent portraits are drawn.">
        <select
          value={settings.avatarStyle}
          onChange={(e) =>
            settingsActions.setAvatarStyle(e.currentTarget.value as AvatarStyleId)
          }
          class={control}
        >
          <For each={AVATAR_STYLES}>
            {(s) => <option value={s.id}>{s.label}</option>}
          </For>
        </select>
      </Row>

      <Row title="Reduce motion" description="Turn off animation across the app.">
        <Toggle
          on={settings.reduceMotion}
          onChange={() => settingsActions.setReduceMotion(!settings.reduceMotion)}
        />
      </Row>
    </>
  );
}

function Chats() {
  const muted = () => state.agents.filter((a) => settingsActions.isMuted(a.id));

  const toggleNotifications = () => {
    const on = !settings.notifications;
    if (on && typeof Notification !== "undefined") {
      void Notification.requestPermission().catch(() => {});
    }
    settingsActions.setNotifications(on);
  };

  return (
    <>
      <Row
        title="Desktop notifications"
        description="Notify me when an agent replies and the window isn't focused."
      >
        <Toggle on={settings.notifications} onChange={toggleNotifications} />
      </Row>

      <Row
        title="Muted agents"
        description={
          muted().length
            ? "These agents won't notify you."
            : "None. Mute an agent from its profile."
        }
      >
        <div class="flex max-w-[280px] flex-wrap justify-end gap-1.5">
          <For each={muted()}>
            {(a) => (
              <button
                type="button"
                title="Unmute"
                onClick={() => settingsActions.toggleMute(a.id)}
                class="flex items-center gap-1.5 rounded-full bg-v2-background-bg-layer-03 px-2.5 py-1 text-[11.5px] text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
              >
                {a.name}
                <span class="text-v2-text-text-faint">✕</span>
              </button>
            )}
          </For>
        </div>
      </Row>
    </>
  );
}

function About() {
  const engine = () => state.health?.engine ?? "—";
  const cap = () => {
    const max = state.health?.max_agents ?? 0;
    return max > 0 ? `${max} agents` : "Unlimited agents";
  };

  return (
    <>
      <Row
        title="AULAR"
        description="Your agent organization — hire, delegate, and let it run."
      >
        <span class="text-[12px] text-v2-text-text-muted">v0.1.0</span>
      </Row>
      <Row title="Engine" description="What's orchestrating your team right now.">
        <span class="text-[12px] text-v2-text-text-muted">
          {engine()} · {cap()}
        </span>
      </Row>
      <Row
        title="Runtime"
        description="Agents run on this machine. The organization belongs to your account."
      >
        <span class="text-[12px] text-v2-text-text-muted">Hermes · core-api</span>
      </Row>
      <div class="mt-1 flex items-center justify-between gap-6 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3.5">
        <div class="min-w-0 flex-1">
          <div class="text-[12.5px] font-medium text-v2-text-text-base">Sign out</div>
          <div class="pt-0.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
            Your agents stay on this machine; the org comes back when you sign in.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void actions.signOut()}
          class="shrink-0 rounded-md border border-v2-border-border-muted px-3 py-1.5 text-[12px] text-v2-state-fg-danger transition-colors hover:bg-v2-overlay-simple-overlay-hover"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────

const control =
  "w-56 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 text-[12px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint focus:border-v2-border-border-focus";

function Row(props: { title: string; description: string; children?: any }) {
  return (
    <div class="flex items-center gap-6 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3.5">
      <div class="min-w-0 flex-1">
        <div class="text-[12.5px] font-medium text-v2-text-text-base">
          {props.title}
        </div>
        <div class="pt-0.5 text-[11.5px] leading-relaxed text-v2-text-text-muted">
          {props.description}
        </div>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}

/** The section heading already names it, so the card carries only the subtitle. */
function Card(props: { description: string; children: any }) {
  return (
    <div class="flex flex-col gap-3.5 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-3.5">
      <p class="text-[11.5px] text-v2-text-text-muted">{props.description}</p>
      {props.children}
    </div>
  );
}

function Toggle(props: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={props.onChange}
      class="relative h-5 w-9 rounded-full border transition-colors"
      classList={{
        "border-v2-border-border-focus bg-v2-background-bg-accent": props.on,
        "border-v2-border-border-muted bg-v2-background-bg-layer-03": !props.on,
      }}
    >
      <span
        class="absolute top-[2px] size-3.5 rounded-full bg-[#ffffff] shadow-sm transition-all"
        classList={{ "left-[18px]": props.on, "left-[2px]": !props.on }}
      />
    </button>
  );
}
