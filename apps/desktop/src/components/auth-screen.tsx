import { createEffect, createResource, createSignal, Show } from "solid-js";

import { Backdrop } from "~/components/backdrop";
import { Mark } from "~/components/logo";
import { api } from "~/lib/api";
import type { AuthUser } from "~/lib/types";

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

  // Discord's field: a filled slab, no border at rest, and the accent only
  // arrives on focus — the form should look calm until you're in it.
  const field =
    "h-10 w-full rounded-[var(--r2)] bg-[var(--rail)] px-3 text-[14px] text-[var(--text)] outline-none ring-1 ring-transparent transition-shadow placeholder:text-[var(--faint)] focus:ring-[var(--accent)]";

  return (
    <div class="relative flex h-full flex-1 items-center justify-center overflow-hidden bg-[var(--rail)] px-6">
      <Backdrop />

      {/* The card floats on the field rather than sitting in a flat page — the
          one place in the app where a little theatre is the right call. */}
      <div class="aular-rise relative flex w-full max-w-[400px] flex-col gap-5 rounded-[var(--r5)] border border-[var(--line)] bg-[var(--sidebar)]/95 p-8 shadow-[var(--shadow-2)] backdrop-blur-xl">
        <div class="flex flex-col items-center gap-3">
          <span
            class="grid size-14 place-items-center rounded-[var(--r4)] text-[var(--on-accent)] shadow-[var(--shadow-1)]"
            style={{ background: "var(--accent-grad)" }}
          >
            <Mark class="h-7 w-auto [--v2-icon-icon-base:currentColor] [--v2-icon-icon-muted:color-mix(in_srgb,currentColor_40%,transparent)]" />
          </span>
          <div class="flex flex-col items-center gap-1">
            <h1 class="text-[20px] font-semibold text-[var(--text)]">
              {isSignup() ? "Create your account" : "Welcome back"}
            </h1>
            <p class="max-w-[300px] text-center text-[13px] leading-relaxed text-[var(--muted)]">
              An organization of agents that works while you're away — running
              on this machine, answering to your account.
            </p>
          </div>
        </div>

        <form onSubmit={submit} class="flex flex-col gap-2.5">
          <input
            type="email"
            autocomplete="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => { setTouched(true); setEmail(e.currentTarget.value); }}
            class={field}
          />
          <input
            type="password"
            autocomplete={isSignup() ? "new-password" : "current-password"}
            placeholder="Password"
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
            class="mt-1 h-10 w-full rounded-[var(--r2)] bg-[var(--accent)] bg-[image:var(--accent-grad)] text-[14px] font-semibold text-[var(--on-accent)] transition-all hover:brightness-110 disabled:bg-[var(--element)] disabled:bg-none disabled:text-[var(--faint)]"
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

        {/* Only offer what the server will honor. */}
        <Show when={canSignUp()}>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              setMode(isSignup() ? "signin" : "signup");
              setError("");
            }}
            class="text-center text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            {isSignup()
              ? "Already have an account? Sign in"
              : needsInvite()
                ? "Have an invite? Create an account"
                : "New here? Create an account"}
          </button>
        </Show>

        {/* Kept quiet: almost nobody changes this, but when the server is wrong
            nothing else on this screen can work, so it has to be reachable. */}
        <div class="flex flex-col gap-2 border-t border-[var(--line)] pt-4">
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
                  style={{
                    background: health() ? "var(--green, #3ba55d)" : "var(--red)",
                  }}
                />
                <span class="max-w-[240px] truncate font-mono">{server()}</span>
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
  );
}
