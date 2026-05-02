// In-chat permission requests from the ACP agent.
//
// Claude Code / Codex emit `session/request_permission` whenever they
// want to run a Bash command, write a file outside the seeded scratch
// dir, or use a tool the user hasn't pre-approved. The browser SDK
// surfaces these as an `onRequestPermission(req)` hook expecting a
// Promise<RequestPermissionResponse>. This module turns that
// callback into a UI signal: push the request into a runed store,
// the chat panel renders an inline card per pending request, the
// user clicks an option, the resolver fires and the agent continues.
//
// Only one request shape exists in ACP today: an `options[]` array
// with optionId/name/kind. We render those verbatim — the adapter
// (claude / codex) decides what options to offer (allow_once,
// allow_session, reject_once, etc.).

let _nextId = 1;

/** @typedef {{
 *   optionId: string,
 *   name: string,
 *   kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always",
 * }} AcpPermissionOption */

/** @typedef {{
 *   id: number,
 *   request: import("@work.books/runtime/agent-acp").RequestPermissionRequest,
 *   resolve: (response: import("@work.books/runtime/agent-acp").RequestPermissionResponse) => void,
 * }} PendingPermission */

/** Runed singleton: the chat panel reads `.pending`, the
 *  acpAgent module pushes via `request()`. */
function makeStore() {
  /** @type {{ pending: PendingPermission[] }} */
  const state = $state({ pending: [] });
  return state;
}

export const acpPermissions = makeStore();

/** Push a request into the queue and return a Promise that resolves
 *  when the user picks an option. Wired to `onRequestPermission`
 *  in acpAgent. */
export function request(req) {
  return /** @type {Promise<import("@work.books/runtime/agent-acp").RequestPermissionResponse>} */ (
    new Promise((resolve) => {
      const id = _nextId++;
      acpPermissions.pending.push({ id, request: req, resolve });
    })
  );
}

/** User clicked one of the offered options. Pop the entry, resolve
 *  the corresponding promise so the SDK forwards the response back
 *  to the adapter. */
export function answer(id, optionId) {
  const idx = acpPermissions.pending.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [entry] = acpPermissions.pending.splice(idx, 1);
  entry.resolve({ outcome: { outcome: "selected", optionId } });
}

/** User dismissed (e.g. closed the chat / cancelled). Treat as
 *  cancellation rather than picking an option — ACP defines a
 *  separate "cancelled" outcome for exactly this case. */
export function cancel(id) {
  const idx = acpPermissions.pending.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const [entry] = acpPermissions.pending.splice(idx, 1);
  entry.resolve({ outcome: { outcome: "cancelled" } });
}

/** Drop everything (used when the agent session is torn down). */
export function clearAll() {
  for (const e of acpPermissions.pending.splice(0)) {
    e.resolve({ outcome: { outcome: "cancelled" } });
  }
}
