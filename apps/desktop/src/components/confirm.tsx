import { createSignal, Show } from "solid-js";

import { Modal } from "~/components/modal";

/**
 * Confirmation for the things you can't take back — ported from the prototype's
 * ConfirmHost.
 *
 * Removing an agent destroys its history; deleting a routine unschedules real
 * cron work. Those deserve a question, and an `await`-able one, so the caller
 * reads straight down instead of splitting into callbacks.
 */
interface Request {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const [request, setRequest] = createSignal<Request | null>(null);

export function confirmDialog(input: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => setRequest({ ...input, resolve }));
}

/** Mounted once, at the root. */
export function ConfirmHost() {
  const settle = (ok: boolean) => {
    request()?.resolve(ok);
    setRequest(null);
  };

  return (
    <Show when={request()}>
      {(r) => (
        <Modal
          title={r().title}
          width={400}
          onClose={() => settle(false)}
          footer={
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                class="rounded-md px-3 py-1.5 text-[12px] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                autofocus
                onClick={() => settle(true)}
                class="rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
                classList={{
                  "bg-v2-state-bg-danger text-v2-state-fg-danger": !!r().danger,
                  "bg-v2-background-bg-accent text-v2-text-text-inverse": !r().danger,
                }}
              >
                {r().confirmLabel ?? "Confirm"}
              </button>
            </div>
          }
        >
          <p class="text-[12px] leading-relaxed text-v2-text-text-muted">
            {r().message}
          </p>
        </Modal>
      )}
    </Show>
  );
}
