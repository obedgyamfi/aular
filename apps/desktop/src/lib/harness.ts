/**
 * The harness on this machine.
 *
 * The server holds the organization but cannot reach us — no server opens a
 * connection to a laptop behind NAT. So a turn arrives as a `turn.requested`
 * event on the socket we already hold open, and this is what hands it to the
 * Hermes gateway running beside the app.
 *
 * The reply does not come back through here. Hermes posts it straight to the
 * server's /internal/deliver with the account's runtime token, and it reaches
 * the UI as an ordinary `message.created` — the same path a reply has always
 * taken. This module is one-way on purpose.
 */

import type { RuntimeCredentials, TurnRequest } from "./types";

/** Where the Tauri shell starts the gateway. Fixed, and loopback only. */
const HARNESS = "http://127.0.0.1:8644";

// The account's runtime token, issued by the server at sign-in. Held in memory
// rather than localStorage: it authenticates the harness, and the session token
// is the thing that is supposed to survive a reload — this can be re-fetched.
let token = "";
let userId = "";

export function armHarness(runtimeToken: string, signedInUserId: string) {
  token = runtimeToken;
  userId = signedInUserId;
}

export function disarmHarness() {
  token = "";
  userId = "";
}

export function harnessReady(): boolean {
  return token !== "" && userId !== "";
}

/**
 * Give a turn to the local gateway. Resolves once it has been accepted, not
 * when the agent has finished — a turn runs for minutes and the reply arrives
 * later, over the socket.
 */
export async function runTurnLocally(req: TurnRequest): Promise<void> {
  if (!harnessReady()) {
    throw new Error("harness not configured — sign in first");
  }
  const res = await fetch(`${HARNESS}/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Aular-Internal-Token": token,
    },
    body: JSON.stringify({
      conversation_id: req.conversation_id,
      user_id: userId,
      content: req.content,
      // The assembled organization for this one turn. Never stored: it is the
      // thing the subscription pays for, and it arrives fresh each time.
      system_prompt: req.persona,
    }),
  });
  if (!res.ok) {
    throw new Error(`harness rejected the turn: ${res.status} ${res.statusText}`);
  }
}

/**
 * Hand the credentials to the shell so it can write them beside the Hermes
 * profile and restart the gateway against them.
 *
 * A no-op in the dev browser, which has no Tauri to invoke — there the gateway
 * is whatever the developer already had running.
 */
export async function configureAgentRuntime(c: RuntimeCredentials): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("configure_agent_runtime", {
      coreApiUrl: c.core_api_url,
      internalToken: c.internal_token,
      homeChannelId: c.home_channel_id ?? "",
    });
  } catch {
    /* dev browser */
  }
}

/** Stop the harness and forget the credentials, on sign-out. */
export async function signOutAgentRuntime(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("sign_out_agent_runtime");
  } catch {
    /* dev browser */
  }
}
