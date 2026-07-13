import { createSignal, Show } from "solid-js";

import { Mark } from "~/components/logo";
import { api } from "~/lib/api";
import type { AuthUser } from "~/lib/types";

/**
 * Sign in / create account.
 *
 * The account is the product: your agents, their roles, what they know, and
 * how they're organized belong to *you*, not to this machine — so they follow
 * you to another one, and later, to your team. Execution still happens right
 * here, on your hardware, with your own model key.
 */
export function AuthScreen(props: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || !email().trim() || !password()) return;
    setBusy(true);
    setError("");
    try {
      const user =
        mode() === "signup"
          ? await api.signup(email().trim(), password())
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
              {mode() === "signup" ? "Create your account" : "Sign in to AULAR"}
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
            autocomplete={mode() === "signup" ? "new-password" : "current-password"}
            placeholder="Password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            class={field}
          />

          <Show when={error()}>
            <p class="text-[12px] text-v2-text-text-danger">{error()}</p>
          </Show>

          <button
            type="submit"
            disabled={busy() || !email().trim() || !password()}
            class="mt-1 w-full rounded-md bg-v2-background-bg-accent py-2 text-[13px] font-medium text-v2-text-text-inverse transition-opacity disabled:opacity-50"
          >
            {busy()
              ? mode() === "signup"
                ? "Creating…"
                : "Signing in…"
              : mode() === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode() === "signup" ? "signin" : "signup");
            setError("");
          }}
          class="text-center text-[12px] text-v2-text-text-muted transition-colors hover:text-v2-text-text-base"
        >
          {mode() === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
