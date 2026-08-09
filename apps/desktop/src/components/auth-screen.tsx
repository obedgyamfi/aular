import { createEffect, createResource, createSignal, For, Show } from "solid-js";

import { Backdrop } from "~/components/backdrop";
import { Mark } from "~/components/logo";
import { api } from "~/lib/api";
import type { AuthUser } from "~/lib/types";
import { hasBackdrop } from "~/theme/theme";

/**
 * Sign in / create account.
 *
 * The account is the product: your agents, their roles, what they know, and how
 * they're organized belong to *you*, not to this machine — so they follow you to
 * another one, and later, to your team. Execution still happens right here, on
 * your hardware, with your own model key.
 *
 * The server tells us (via /healthz) whether it takes new accounts and on what
 * terms — open, invite-only, or closed — so we offer exactly what it will
 * accept. Offering someone an account we'd then reject is worse than not
 * offering one at all.
 *
 * Layout is a split canvas: a brand panel that shows what you're signing into
 * (the org, a glimpse of the team) beside the form. The brand panel folds away
 * below the md breakpoint so the form still stands alone on a narrow window.
 */
export function AuthScreen(props: { onAuthed: (user: AuthUser) => void }) {
  const [health, { refetch: recheckServer }] = createResource(() =>
    api.health().catch(() => null),
  );

  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  // A fresh install has nobody to sign in — open on "create account".
  // Only auto-switch before the user has touched the form.
  const [touched, setTouched] = createSignal(false);
  createEffect(() => {
    const h = health();
    if (!touched() && h && h.signup !== "closed" && h.has_accounts === false) {
      setMode("signup");
    }
  });
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [invite, setInvite] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  // Which server holds the account. Offered here rather than in settings
  // because the session token is issued by whichever server signs you in — by
  // the time you could reach settings, the choice has already been made.
  const [server, setServer] = createSignal(api.apiBase());
  const [editingServer, setEditingServer] = createSignal(false);
  const [serverDraft, setServerDraft] = createSignal(api.apiBase());

  const applyServer = () => {
    api.setApiBase(serverDraft());
    setServer(api.apiBase());
    setServerDraft(api.apiBase());
    setEditingServer(false);
    setError("");
    void recheckServer();
  };

  const signupMode = () => health()?.signup ?? "closed";
  const canSignUp = () => signupMode() !== "closed";
  const needsInvite = () => signupMode() === "invite";

  const isSignup = () => mode() === "signup";
  const ready = () =>
    !!email().trim() &&
    !!password() &&
    (!isSignup() || !needsInvite() || !!invite().trim());

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || !ready()) return;
    setBusy(true);
    setError("");
    try {
      const user = isSignup()
        ? await api.signup(email().trim(), password(), invite().trim() || undefined)
        : await api.login(email().trim(), password());
      props.onAuthed(user);
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        /not signed in|401/i.test(msg)
          ? "Wrong email or password."
          : /already exists|conflict/i.test(msg)
            ? "That email already has an account. Sign in instead."
            : /8 characters/.test(msg)
              ? "Password must be at least 8 characters."
              : /invite/i.test(msg)
                ? "That invite code isn't valid."
                : msg || "Something went wrong.",
      );
      setBusy(false);
    }
  };

  const switchMode = (next: "signin" | "signup") => {
    setTouched(true);
    setMode(next);
    setError("");
  };

  // A filled slab, no border at rest, the accent only on focus — the form stays
  // calm until you're in it.
  const field =
    "h-10 w-full rounded-[var(--r2)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent)]";

  return (
    <div
      class="relative flex h-full flex-1 overflow-hidden text-[var(--text)]"
      classList={{ "bg-[var(--rail)]": !hasBackdrop() }}
    >
      <Show when={hasBackdrop()}>
        <Backdrop />
      </Show>
      {/* Brand panel — what you're signing into. Folds away on a narrow window. */}
      <div
        class="relative hidden w-[45%] shrink-0 flex-col justify-between border-r border-[var(--line)] p-9 md:flex"
        classList={{ "bg-[var(--sidebar)]": !hasBackdrop() }}
      >
        <div class="flex items-center gap-2.5">
          <span
            class="grid size-8 place-items-center rounded-[var(--r2)] text-[var(--on-accent)]"
            style={{ background: "var(--accent-grad)" }}
          >
            <Mark class="h-[18px] w-auto [--v2-icon-icon-base:currentColor] [--v2-icon-icon-muted:color-mix(in_srgb,currentColor_40%,transparent)]" />
          </span>
          <span class="text-[15px] font-medium">Aular</span>
        </div>

        <div>
          <div
            class="max-w-[280px] text-[23px] font-[600] leading-[1.28]"
            style={{ "font-family": "var(--serif)" }}
          >
            An organization of agents that works while you're away.
          </div>
          <p class="mt-3 max-w-[270px] text-[13px] leading-relaxed text-[var(--muted)]">
            They run on this machine, on your own model, and answer to your account — not this laptop.
          </p>
        </div>

        <div>
          <div class="mb-2.5 text-[10.5px] tracking-[0.18em] text-[var(--faint)]">YOUR ORGANIZATION</div>
          <For each={ROSTER}>
            {(a) => (
              <div class="flex items-center gap-3 py-[7px]">
                <span
                  class="relative grid size-9 shrink-0 place-items-center rounded-full text-[13.5px] font-medium"
                  style={{ background: a.soft, "box-shadow": `inset 0 0 0 1px ${a.ring}`, color: a.ink }}
                >
                  {a.initial}
                  <span
                    class="absolute -bottom-px -right-px grid size-[13px] place-items-center rounded-full"
                    style={{ background: "#0b0b0e" }}
                  >
                    <span
                      class="size-[8px] rounded-full"
                      style={a.on ? { background: "#3ba55d" } : { "box-shadow": "inset 0 0 0 2px #6b6b73" }}
                    />
                  </span>
                </span>
                <div class="min-w-0 leading-tight">
                  <div class="text-[13.5px] font-medium text-[var(--text)]">{a.name}</div>
                  <div class="text-[11.5px] text-[var(--muted)]">{a.role}</div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Form panel. */}
      <div
        class="relative flex flex-1 items-center justify-center p-8"
        classList={{ "bg-[var(--bg)]": !hasBackdrop() }}
      >
        <div class="aular-rise flex w-full max-w-[320px] flex-col">
          <div class="mb-5 flex items-center gap-2.5 md:hidden">
            <span
              class="grid size-8 place-items-center rounded-[var(--r2)] text-[var(--on-accent)]"
              style={{ background: "var(--accent-grad)" }}
            >
              <Mark class="h-[18px] w-auto [--v2-icon-icon-base:currentColor] [--v2-icon-icon-muted:color-mix(in_srgb,currentColor_40%,transparent)]" />
            </span>
            <span class="text-[15px] font-medium">Aular</span>
          </div>

          <Show when={canSignUp()}>
            <div class="flex gap-1 rounded-[var(--r3)] border border-[var(--line)] bg-[var(--surface-2)] p-1">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                class="flex-1 rounded-[var(--r2)] py-1.5 text-[12.5px] transition-colors"
                classList={{
                  "bg-[var(--element)] font-medium text-[var(--text)]": !isSignup(),
                  "text-[var(--muted)]": isSignup(),
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                class="flex-1 rounded-[var(--r2)] py-1.5 text-[12.5px] transition-colors"
                classList={{
                  "bg-[var(--element)] font-medium text-[var(--text)]": isSignup(),
                  "text-[var(--muted)]": !isSignup(),
                }}
              >
                Create account
              </button>
            </div>
          </Show>

          <h1 class="mt-5 text-[19px] font-[600]">
            {isSignup() ? "Create your account" : "Welcome back"}
          </h1>
          <p class="mt-1 text-[12.5px] text-[var(--muted)]">
            {isSignup() ? "Two minutes to your own agent org." : "Sign in to your organization."}
          </p>

          <form onSubmit={submit} class="mt-4 flex flex-col gap-2.5">
            <input
              type="email"
              autocomplete="email"
              placeholder="name@company.com"
              value={email()}
              onInput={(e) => { setTouched(true); setEmail(e.currentTarget.value); }}
              class={field}
            />
            <input
              type="password"
              autocomplete={isSignup() ? "new-password" : "current-password"}
              placeholder={isSignup() ? "Create a password" : "Password"}
              value={password()}
              onInput={(e) => { setTouched(true); setPassword(e.currentTarget.value); }}
              class={field}
            />

            <Show when={isSignup() && needsInvite()}>
              <input
                type="text"
                placeholder="Invite code"
                value={invite()}
                onInput={(e) => setInvite(e.currentTarget.value)}
                class={`${field} font-mono`}
              />
            </Show>

            <Show when={error()}>
              <p class="aular-pop rounded-[var(--r2)] bg-[var(--red-soft)] px-3 py-2 text-[12.5px] text-[var(--red)]">
                {error()}
              </p>
            </Show>

            <button
              type="submit"
              disabled={busy() || !ready()}
              class="mt-1 flex h-[42px] w-full items-center justify-center rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] text-[13.5px] font-medium text-[var(--on-accent)] transition-all hover:brightness-110 disabled:bg-[var(--element)] disabled:bg-none disabled:text-[var(--faint)]"
            >
              {busy()
                ? isSignup()
                  ? "Creating…"
                  : "Signing in…"
                : isSignup()
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {/* Kept quiet: almost nobody changes this, but when the server is wrong
              nothing else on this screen can work, so it has to be reachable. */}
          <div class="mt-6 flex flex-col gap-2 border-t border-[var(--line)] pt-4">
            <Show
              when={editingServer()}
              fallback={
                <button
                  type="button"
                  onClick={() => {
                    setServerDraft(server());
                    setEditingServer(true);
                  }}
                  class="flex items-center justify-center gap-1.5 text-[12px] text-[var(--faint)] transition-colors hover:text-[var(--muted)]"
                >
                  <span
                    class="size-1.5 rounded-full"
                    style={{ background: health() ? "var(--green)" : "var(--red)" }}
                  />
                  <span class="max-w-[240px] truncate font-mono">{server()}</span>
                  <span class="text-[var(--muted)]">· Change</span>
                </button>
              }
            >
              <input
                type="url"
                autofocus
                spellcheck={false}
                placeholder="https://api.aular.app"
                value={serverDraft()}
                onInput={(e) => setServerDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyServer();
                  if (e.key === "Escape") setEditingServer(false);
                }}
                class={`${field} font-mono text-[12.5px]`}
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={applyServer}
                  class="h-8 flex-1 rounded-[var(--r2)] bg-[var(--element)] text-[12.5px] text-[var(--text)] transition-colors hover:brightness-110"
                >
                  Use this server
                </button>
                <button
                  type="button"
                  onClick={() => {
                    api.setApiBase(null);
                    setServer(api.apiBase());
                    setServerDraft(api.apiBase());
                    setEditingServer(false);
                    void recheckServer();
                  }}
                  class="h-8 rounded-[var(--r2)] px-3 text-[12.5px] text-[var(--faint)] transition-colors hover:text-[var(--text)]"
                >
                  Reset
                </button>
              </div>
            </Show>
            <Show when={!health() && !editingServer()}>
              <p class="text-center text-[11.5px] text-[var(--faint)]">
                Can&apos;t reach this server.
              </p>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

const ROSTER = [
  { name: "Atlas", role: "Operations", initial: "A", soft: "rgba(29,158,117,.18)", ring: "rgba(29,158,117,.5)", ink: "#63d6ab", on: true },
  { name: "Vega", role: "Research", initial: "V", soft: "rgba(127,119,221,.2)", ring: "rgba(127,119,221,.55)", ink: "#b3abf4", on: true },
  { name: "Echo", role: "Comms", initial: "E", soft: "rgba(212,83,126,.18)", ring: "rgba(212,83,126,.5)", ink: "#f2a0bd", on: false },
];
