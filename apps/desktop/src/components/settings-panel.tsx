import { createSignal, ErrorBoundary, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import BrainCircuit from "lucide-solid/icons/brain-circuit";
import Cpu from "lucide-solid/icons/cpu";
import Gauge from "lucide-solid/icons/gauge";
import Info from "lucide-solid/icons/info";
import Palette from "lucide-solid/icons/palette";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Search from "lucide-solid/icons/search";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import UserRound from "lucide-solid/icons/user-round";

import { avatarGradient, AVATAR_STYLES, portrait, SWATCHES } from "~/components/avatar";
import { MemoryPanel } from "~/components/memory-panel";
import { Modal } from "~/components/modal";
import { ModelSettings } from "~/components/model-settings";
import { UsageReport } from "~/components/usage-report";
import { UserAvatar, userEmail, userName } from "~/components/user-avatar";
import {
  fileToAvatarDataUrl,
  settings,
  settingsActions,
} from "~/lib/settings";
import { actions, state, type SettingsSection } from "~/lib/store";
import { accent, colorScheme, setAccent, setColorScheme, type ColorScheme } from "~/theme/theme";

/**
 * Settings — Discord's shape: a dialog over the app, not a place you navigate
 * to. Identity and a grouped nav down the left, the section on the right, and
 * closing it puts you back exactly where you were instead of somewhere you have
 * to navigate out of.
 *
 * Every real control survives the reframe: the model config, usage metering,
 * the memory graph, notifications, and the appearance switches.
 */
type SectionId = SettingsSection;

/**
 * Flat nav rows — a header, or a section link. Kept flat (not a group with a
 * nested <For>) on purpose: a <For> that returns a Fragment wrapping another
 * <For> drops Solid's delegated click handlers, and the links go dead.
 */
type NavRow =
  | { header: string }
  | { id: SectionId; label: string; icon: () => JSX.Element };

/**
 * Discord's grouping: an ungrouped block of the things that are *yours* on top,
 * then labelled groups under hairlines. Renamed to match its vocabulary —
 * "Profile" became "Account", because that's the row everyone reaches for.
 */
const ICON = { size: 18, "stroke-width": 1.9 } as const;

const NAV: NavRow[] = [
  { id: "general", label: "Account", icon: () => <UserRound {...ICON} /> },
  { id: "chats", label: "Preferences", icon: () => <SlidersHorizontal {...ICON} /> },
  { header: "Organization" },
  { id: "model", label: "Model & provider", icon: () => <Cpu {...ICON} /> },
  { id: "memory", label: "Memory & knowledge", icon: () => <BrainCircuit {...ICON} /> },
  { id: "usage", label: "Usage & limits", icon: () => <Gauge {...ICON} /> },
  { header: "App" },
  { id: "appearance", label: "Appearance", icon: () => <Palette {...ICON} /> },
  { id: "about", label: "About", icon: () => <Info {...ICON} /> },
];

const TITLES: Record<SectionId, { title: string; sub: string }> = {
  general: { title: "Account", sub: "Who you are and how the organization should treat you." },
  chats: { title: "Preferences", sub: "How the org assists you day to day." },
  usage: { title: "Usage & limits", sub: "What this beta measures. Nothing here is enforced." },
  model: { title: "Model & provider", sub: "The model your organization thinks with — your own key." },
  appearance: { title: "Appearance", sub: "How the app looks on this machine." },
  memory: { title: "Memory & knowledge", sub: "What your agents remember, read live from the memory graph." },
  about: { title: "About", sub: "This build, its engine, and the way out." },
};

export function SettingsPanel(props: { onClose: () => void }) {
  // Whoever opened Settings decides where you land; you navigate from there.
  const [section, setSection] = createSignal<SectionId>(state.settingsSection);
  const [query, setQuery] = createSignal("");

  /** Filtering hides links, never headers with nothing under them. */
  const rows = () => {
    const q = query().trim().toLowerCase();
    if (!q) return NAV;
    const kept = NAV.filter((r) => !("header" in r) && r.label.toLowerCase().includes(q));
    return kept.length ? kept : [];
  };

  return (
    // Near the whole window, as Discord's is — settings there is a place you
    // are, not a box you peer into. The Modal caps at the viewport, so this is
    // "as large as fits" on anything smaller.
    <Modal bare width={1240} onClose={props.onClose}>
      <div class="flex h-[92vh] min-h-0 w-full">
        {/* ── identity + nav ── */}
        <div class="aular-no-scrollbar flex w-[268px] shrink-0 flex-col overflow-y-auto bg-[var(--sidebar)] px-3 py-4">
          <div class="mb-3 flex items-center gap-2.5 px-2">
            <UserAvatar size={40} />
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold leading-5 text-[var(--text)]">
                {userName()}
              </div>
              <button
                type="button"
                onClick={() => setSection("general")}
                class="truncate text-[12px] leading-4 text-[var(--muted)] transition-colors hover:text-[var(--text-2)] hover:underline"
              >
                Edit account
              </button>
            </div>
          </div>

          <div class="relative mb-2">
            <Search
              size={14}
              stroke-width={2.2}
              class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--faint)]"
            />
            <input
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder="Search"
              aria-label="Search settings"
              class="h-8 w-full rounded-[var(--r1)] bg-[var(--rail)] pl-7 pr-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
            />
          </div>

          {/* the grouped nav — one flat <For>, one element per row */}
          <nav class="flex flex-col">
            <For each={rows()}>
              {(row) =>
                "header" in row ? (
                  // Discord rules off each group before naming it.
                  <>
                    <span class="mx-2 my-2 h-px bg-[var(--line)]" />
                    <div class="px-2 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)]">
                      {row.header}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSection(row.id)}
                    aria-current={section() === row.id}
                    class="group/set mb-0.5 flex h-[34px] w-full items-center gap-3 rounded-[var(--r1)] px-2 text-left text-[14px] font-medium transition-colors hover:bg-[var(--element-hover)] aria-[current=true]:bg-[var(--element-active)] aria-[current=true]:text-[var(--text)] aria-[current=false]:text-[var(--muted)]"
                  >
                    <span class="flex-none opacity-90">{row.icon()}</span>
                    <span class="min-w-0 flex-1 truncate">{row.label}</span>
                  </button>
                )
              }
            </For>
            <Show when={!rows().length}>
              <p class="px-2 pt-2 text-[12px] text-[var(--faint)]">Nothing matches that.</p>
            </Show>
          </nav>
        </div>

        {/* ── the section ── */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]">
          {/* Discord's header bar: the section's name pinned above the scroll,
              so it stays put while the content moves under it. The ✕ the Modal
              draws lands in this row's right end. */}
          <header class="flex h-[52px] shrink-0 items-center border-b border-[var(--line)] px-8 pr-14">
            <h2 class="min-w-0 truncate text-[16px] font-semibold text-[var(--text)]">
              {TITLES[section()].title}
            </h2>
          </header>

          <div class="aular-hover-scrollbar min-h-0 flex-1 overflow-y-auto px-8 py-7">
            <div class="mx-auto min-w-0 max-w-[660px]">
            <p class="mb-5 text-[13px] text-[var(--muted)]">{TITLES[section()].sub}</p>

            {/* A per-section boundary: keyed on the section so it re-tries when
                you navigate, and a throwing section is caught here instead of
                aborting the whole update. */}
            <Show when={section()} keyed>
              {(sec) => (
                <ErrorBoundary
                  fallback={(err: Error) => (
                    <div class="rounded-[var(--r3)] border border-[var(--red)] bg-[var(--red-soft)] p-4 text-[12px] text-[var(--red)]">
                      <div class="font-[650]">This section couldn't load.</div>
                      <div class="mt-1 text-[11px] text-[var(--text-2)]">
                        {err?.message ?? "Unknown error"}
                      </div>
                    </div>
                  )}
                >
                  <Show when={sec === "general"}>
                    <Profile />
                  </Show>
                  <Show when={sec === "chats"}>
                    <Preferences />
                  </Show>
                  <Show when={sec === "usage"}>
                    <UsageReport />
                  </Show>
                  <Show when={sec === "model"}>
                    <SectionCard>
                      <ModelSettings />
                    </SectionCard>
                  </Show>
                  <Show when={sec === "appearance"}>
                    <Appearance />
                  </Show>
                  <Show when={sec === "memory"}>
                    <SectionCard>
                      <MemoryPanel />
                    </SectionCard>
                  </Show>
                  <Show when={sec === "about"}>
                    <About />
                  </Show>
                </ErrorBoundary>
              )}
            </Show>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── You / Profile ───────────────────────────────────────────────────────────

const input =
  "h-[38px] w-full rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] text-[13.5px] text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";

function Profile() {
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
    <div class="flex max-w-[560px] flex-col gap-3.5">
      {/* the identity card */}
      <Card>
        <div class="flex items-center gap-4 px-[15px] py-3.5">
          <UserAvatar size={52} />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13.5px] font-[650] text-[var(--text)]">{userName()}</div>
            <div class="truncate text-[11.5px] text-[var(--muted)]">{userEmail()}</div>
            <Show when={error()}>
              <div class="text-[11px] text-[var(--red)]">{error()}</div>
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
            <button type="button" onClick={() => picker?.click()} class={smallButton}>
              Upload photo
            </button>
            <Show when={settings.profile.avatarDataUrl}>
              <button
                type="button"
                onClick={() => settingsActions.setProfile({ avatarDataUrl: "" })}
                class="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
              >
                Use generated avatar
              </button>
            </Show>
          </div>
        </div>
      </Card>

      <Field label="Name">
        <input
          value={settings.profile.name}
          onInput={(e) => settingsActions.setProfile({ name: e.currentTarget.value })}
          placeholder={state.user?.display_name ?? ""}
          class={input}
        />
      </Field>
      <Field label="Email">
        <input
          value={settings.profile.email}
          onInput={(e) => settingsActions.setProfile({ email: e.currentTarget.value })}
          placeholder={state.user?.email ?? ""}
          class={input}
        />
      </Field>
      <Field label="Working style — how the org should treat you">
        <textarea
          value={settings.profile.bio}
          onInput={(e) => settingsActions.setProfile({ bio: e.currentTarget.value })}
          class="min-h-[100px] w-full resize-y rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-[11px] py-2.5 text-[12.5px] leading-normal text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </Field>
    </div>
  );
}

function Field(props: { label: string; children: any }) {
  return (
    <label class="flex flex-col gap-[5px]">
      <span class="text-[11px] text-[var(--muted)]">{props.label}</span>
      {props.children}
    </label>
  );
}

// ── You / Preferences ───────────────────────────────────────────────────────

function Preferences() {
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
      <GroupLabel>Assistance</GroupLabel>
      <Card>
        <CardRow
          title="Desktop notifications"
          sub="Notify you when an agent replies and the window isn't focused."
        >
          <Toggle on={settings.notifications} onChange={toggleNotifications} />
        </CardRow>
        <CardRow
          title="Muted agents"
          sub={muted().length ? "These agents won't notify you." : "None. Mute an agent from its profile."}
        >
          <div class="flex max-w-[280px] flex-wrap justify-end gap-1.5">
            <For each={muted()}>
              {(a) => (
                <button
                  type="button"
                  title="Unmute"
                  onClick={() => settingsActions.toggleMute(a.id)}
                  class="flex items-center gap-1.5 rounded-[var(--pill)] bg-[var(--element)] px-2.5 py-1 text-[11.5px] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]"
                >
                  {a.name}
                  <span class="text-[var(--faint)]">✕</span>
                </button>
              )}
            </For>
          </div>
        </CardRow>
      </Card>

      <GroupLabel>Personal</GroupLabel>
      <Card>
        <CardRow title="Theme" sub="Follow the system, or pin the light or dark paper.">
          <Segmented
            options={[
              { id: "system", label: "System" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
            value={colorScheme()}
            onChange={(id) => setColorScheme(id as ColorScheme)}
          />
        </CardRow>
        <CardRow title="Reduce motion" sub="Turn off animation across the app.">
          <Toggle
            on={settings.reduceMotion}
            onChange={() => settingsActions.setReduceMotion(!settings.reduceMotion)}
          />
        </CardRow>
      </Card>
    </>
  );
}

// ── Organization / Appearance ───────────────────────────────────────────────

/**
 * Discord picks a theme from swatches, not a dropdown — you're choosing how the
 * app looks, so the control should look like it. Each chip previews its own
 * stack: rail, sidebar, conversation.
 *
 * No avatar-shape row any more: portraits are round everywhere, full stop.
 */
type Swatch = { id: ColorScheme; label: string; rail: string; side: string; bg: string };

/**
 * Themes decide SURFACES. Colour is a separate axis below, so a scheme no
 * longer has to be re-declared once per accent.
 */
const THEMES: Swatch[] = [
  { id: "light", label: "Light", rail: "#e3e5e8", side: "#f2f3f5", bg: "#ffffff" },
  { id: "dark", label: "Dark", rail: "#1e1f22", side: "#2b2d31", bg: "#313338" },
  { id: "ash", label: "Ash", rail: "#26282d", side: "#34363c", bg: "#3b3d44" },
  { id: "onyx", label: "Onyx", rail: "#000000", side: "#0e0e11", bg: "#131316" },
  { id: "constellation", label: "Constellation", rail: "#07070a", side: "#0b0b0f", bg: "#0e0e12" },
];

function Appearance() {
  return (
    <div class="flex flex-col gap-5">
      <section>
        <h4 class="mb-2 text-[12px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)]">
          Theme
        </h4>
        <div class="flex flex-wrap items-center gap-2.5">
          <For each={THEMES}>
            {(t) => (
              <button
                type="button"
                onClick={() => setColorScheme(t.id)}
                aria-current={colorScheme() === t.id}
                title={t.label}
                aria-label={t.label}
                class="relative size-[52px] overflow-hidden rounded-[var(--r2)] ring-offset-2 ring-offset-[var(--bg)] transition-all aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--accent)] aria-[current=false]:ring-1 aria-[current=false]:ring-[var(--line-strong)]"
              >
                <span class="flex h-full w-full">
                  <span class="w-[22%]" style={{ background: t.rail }} />
                  <span class="w-[30%]" style={{ background: t.side }} />
                  <span class="flex-1" style={{ background: t.bg }} />
                </span>
                {/* No accent dot: the accent is its own control below, and a
                    theme no longer implies one. */}
                <Show when={colorScheme() === t.id}>
                  <span class="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--on-accent)]">
                    ✓
                  </span>
                </Show>
              </button>
            )}
          </For>

          {/* Discord's "sync with computer" — the same seat, at the end. */}
          <button
            type="button"
            onClick={() => setColorScheme("system")}
            aria-current={colorScheme() === "system"}
            title="Sync with computer"
            aria-label="Sync with computer"
            class="grid size-[52px] place-items-center rounded-[var(--r2)] bg-[var(--element)] text-[var(--text-2)] ring-offset-2 ring-offset-[var(--bg)] transition-all aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--accent)] aria-[current=false]:ring-1 aria-[current=false]:ring-[var(--line-strong)]"
          >
            <RefreshCw size={18} stroke-width={2} />
          </button>
        </div>
        <p class="mt-2 text-[12px] text-[var(--muted)]">
          {colorScheme() === "system"
            ? "Following your computer's light/dark setting."
            : THEMES.find((t) => t.id === colorScheme())?.label}
        </p>

        <h4 class="mb-1 mt-5 text-[12px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)]">
          Accent
        </h4>
        <p class="mb-2.5 text-[12px] text-[var(--muted)]">
          The colour the app is built around — buttons, the active tile, the
          field behind a profile. These are the same twelve hues your agents'
          portraits are drawn on.
        </p>

        <div class="mb-3 flex flex-wrap items-center gap-2">
          {/* Hand colour back to the theme's own block. */}
          <button
            type="button"
            onClick={() => setAccent(null)}
            aria-current={!accent()}
            disabled={settings.dynamicAccent}
            title="Match the theme"
            aria-label="Match the theme"
            class="grid size-8 place-items-center rounded-full text-[11px] font-bold text-[var(--muted)] ring-1 ring-[var(--line-strong)] transition-all disabled:opacity-40 aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--accent)]"
          >
            ✕
          </button>
          <For each={SWATCHES}>
            {(hex) => (
              <button
                type="button"
                onClick={() => setAccent(hex)}
                aria-current={accent() === hex}
                disabled={settings.dynamicAccent}
                title={hex}
                aria-label={hex}
                class="size-8 rounded-full ring-offset-2 ring-offset-[var(--bg)] transition-all disabled:opacity-40 aria-[current=true]:ring-2 aria-[current=true]:ring-[var(--accent)]"
                style={{ background: hex }}
              />
            )}
          </For>
        </div>

        <label class="flex cursor-pointer items-start gap-3 rounded-[var(--r2)] px-1 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={settings.dynamicAccent}
            onClick={() => settingsActions.setDynamicAccent(!settings.dynamicAccent)}
            class="mt-0.5 flex h-[20px] w-9 flex-none rounded-full p-[2px] transition-colors"
            style={{
              background: settings.dynamicAccent ? "var(--accent)" : "var(--element-active)",
              "justify-content": settings.dynamicAccent ? "flex-end" : "flex-start",
            }}
          >
            <span class="size-4 rounded-full bg-white" style={{ "box-shadow": "var(--shadow-1)" }} />
          </button>
          <span class="min-w-0">
            <span class="block text-[14px] font-medium text-[var(--text)]">Dynamic accent</span>
            <span class="block text-[12px] leading-4 text-[var(--muted)]">
              The app takes the colour of whoever you're talking to, easing from
              one agent to the next. With it off, the accent you picked above is
              used everywhere — including each agent's profile panel.
            </span>
          </span>
        </label>
      </section>

      <section>
        <h4 class="mb-1 text-[12px] font-semibold uppercase tracking-[0.02em] text-[var(--muted)]">
          Agent portraits
        </h4>
        <p class="mb-3 text-[12px] text-[var(--muted)]">
          The illustration style every agent's face is drawn in. Each one is
          generated from the agent's name, so a face never changes on its own.
        </p>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2">
          <For each={AVATAR_STYLES}>
            {(st) => (
              <button
                type="button"
                onClick={() => settingsActions.setAvatarStyle(st.id)}
                aria-current={settings.avatarStyle === st.id}
                title={`${st.label} — ${st.by}`}
                class="flex flex-col items-center gap-1.5 rounded-[var(--r2)] p-2 transition-colors hover:bg-[var(--element-hover)] aria-[current=true]:bg-[var(--element-active)]"
              >
                {/* A real preview, not a swatch: three faces, so you can see
                    what a roster in this style actually looks like. */}
                <span class="flex -space-x-2">
                  <For each={["Mira", "Theo", "Nova"]}>
                    {(seed) => (
                      <img
                        src={portrait(seed, st.id)}
                        alt=""
                        class="size-7 rounded-full ring-2 ring-[var(--bg)]"
                        style={{ background: avatarGradient(seed) }}
                      />
                    )}
                  </For>
                </span>
                <span
                  class="truncate text-[11.5px]"
                  classList={{
                    "font-semibold text-[var(--text)]": settings.avatarStyle === st.id,
                    "text-[var(--muted)]": settings.avatarStyle !== st.id,
                  }}
                >
                  {st.label}
                </span>
              </button>
            )}
          </For>
        </div>

        {/* CC BY styles require crediting the designer wherever they appear.
            Naming the active one here is what discharges that. */}
        <p class="mt-3 text-[11.5px] text-[var(--faint)]">
          {(() => {
            const st = AVATAR_STYLES.find((x) => x.id === settings.avatarStyle);
            return st ? `${st.label} by ${st.by} — ${st.license}.` : "";
          })()}{" "}
          Portraits generated with DiceBear.
        </p>
      </section>
    </div>
  );
}

// ── Organization / About ────────────────────────────────────────────────────

function About() {
  const engine = () => state.health?.engine ?? "—";
  const cap = () => {
    const max = state.health?.max_agents ?? 0;
    return max > 0 ? `${max} agents` : "Unlimited agents";
  };

  return (
    <>
      <Card>
        <CardRow title="AULAR" sub="Your agent organization — hire, delegate, and let it run.">
          <span class="text-[12px] text-[var(--muted)]">v0.1.0</span>
        </CardRow>
        <CardRow title="Engine" sub="What's orchestrating your team right now.">
          <span class="text-[12px] text-[var(--muted)]">{engine()} · {cap()}</span>
        </CardRow>
        <CardRow title="Runtime" sub="Agents run on this machine. The organization belongs to your account.">
          <span class="text-[12px] text-[var(--muted)]">Hermes · core-api</span>
        </CardRow>
      </Card>

      <div class="mt-3.5">
        <Card>
          <CardRow title="Sign out" sub="Your agents stay on this machine; the org comes back when you sign in.">
            <button
              type="button"
              onClick={() => void actions.signOut()}
              class="rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2 text-[12px] font-[650] text-[var(--red)] transition-colors hover:bg-[var(--element-hover)]"
            >
              Sign out
            </button>
          </CardRow>
        </Card>
      </div>
    </>
  );
}

// ── the design's pieces ─────────────────────────────────────────────────────

const smallButton =
  "rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[11.5px] font-[650] text-[var(--text)] transition-colors hover:bg-[var(--element-hover)]";

function GroupLabel(props: { children: any }) {
  return (
    <div class="mb-2.5 mt-5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--faint)] first:mt-0">
      {props.children}
    </div>
  );
}

/** A design surface card whose rows separate with hairlines. */
function Card(props: { children: any }) {
  return (
    <div
      class="overflow-hidden rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)]"
      style={{ "box-shadow": "var(--shadow-1)" }}
    >
      {props.children}
    </div>
  );
}

/** One row: title + sub on the left, the control on the right. */
function CardRow(props: { title: string; sub: string; children?: any }) {
  return (
    <div class="flex items-center gap-4 border-b border-[var(--line)] px-[15px] py-3.5 last:border-b-0">
      <div class="min-w-0 flex-1">
        <div class="text-[12.5px] font-[650] text-[var(--text)]">{props.title}</div>
        <div class="mt-[3px] text-[11px] text-[var(--muted)]">{props.sub}</div>
      </div>
      <div class="shrink-0">{props.children}</div>
    </div>
  );
}

/** A full-width section body inside a card (usage, model, memory). */
function SectionCard(props: { children: any }) {
  return (
    <div
      class="rounded-[var(--r4)] border border-[var(--line)] bg-[var(--surface)] p-4"
      style={{ "box-shadow": "var(--shadow-1)" }}
    >
      {props.children}
    </div>
  );
}

/** The design's 40×23 switch — a white knob sliding on a colored track.
 *  Named Toggle, not Switch: SolidJS has a first-class <Switch> control-flow
 *  component, and a local <Switch> resolves to *that*, exploding at render. */
function Toggle(props: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={props.onChange}
      class="flex h-[23px] w-10 flex-none rounded-xl p-[2px] transition-colors"
      style={{
        background: props.on ? "var(--accent)" : "var(--element-active)",
        "justify-content": props.on ? "flex-end" : "flex-start",
      }}
    >
      <span class="size-[19px] rounded-full bg-white" style={{ "box-shadow": "var(--shadow-1)" }} />
    </button>
  );
}

/** A bordered segmented control, element-filled on the active option. */
function Segmented(props: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div class="flex gap-0.5 rounded-[var(--r2)] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            aria-pressed={props.value === o.id}
            onClick={() => props.onChange(o.id)}
            class="rounded-[5px] px-2.5 py-1 text-[12px] font-[650] transition-colors aria-[pressed=true]:bg-[var(--element)] aria-[pressed=true]:text-[var(--text)] aria-[pressed=false]:text-[var(--muted)] aria-[pressed=false]:hover:text-[var(--text)]"
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}
