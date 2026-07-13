import { createResource, createSignal, Show } from "solid-js";

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
  const [health] = createResource(() => api.health().catch(() => null));

  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [invite, setInvite] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

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

  const field =
    "w-full rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-weak focus:border-v2-border-border-focus";

  return (
    <div class="flex h-full flex-1 items-center justify-center bg-v2-background-bg-base px-6">
      <div class="flex w-full max-w-[340px] flex-col gap-6">
        <div class="flex flex-col items-center gap-3">
          <Mark class="h-8 w-auto" />
          <div class="flex flex-col items-center gap-1">
            <h1 class="text-[15px] font-medium text-v2-text-text-base">
              {isSignup() ? "Create your account" : "Sign in to AULAR"}
            </h1>
            <p class="text-center text-[12px] leading-relaxed text-v2-text-text-muted">
              Your agents run on this machine. Your organization — who they are,
              what they know — travels with your account.
            </p>
          </div>
        </div>

        <form onSubmit={submit} class="flex flex-col gap-2.5">
          <input
            type="email"
            autocomplete="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class={field}
          />
          <input
            type="password"
            autocomplete={isSignup() ? "new-password" : "current-password"}
            placeholder="Password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
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
            <p class="text-[12px] text-v2-text-text-danger">{error()}</p>
          </Show>

          <button
            type="submit"
            disabled={busy() || !ready()}
            class="mt-1 w-full rounded-md bg-v2-background-bg-accent py-2 text-[13px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
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
              setMode(isSignup() ? "signin" : "signup");
              setError("");
            }}
            class="text-center text-[12px] text-v2-text-text-muted transition-colors hover:text-v2-text-text-base"
          >
            {isSignup()
              ? "Already have an account? Sign in"
              : needsInvite()
                ? "Have an invite? Create an account"
                : "New here? Create an account"}
          </button>
        </Show>
      </div>
    </div>
  );
}
