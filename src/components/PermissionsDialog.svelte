<script>
  /**
   * Per-workbook permissions panel. Each declared permission gets
   * its own row with state (approved / not approved) plus the
   * appropriate single-action button (Allow / Revoke). The dialog
   * auto-pops the first time a workbook with un-granted
   * permissions is opened, but it stays accessible via Manage →
   * Permissions so the user can revoke or grant later.
   *
   * Why per-row not checklist: the user wants surgical control —
   * "give me secrets but not network" is a real ask, and being
   * able to revoke a single permission later (without un-granting
   * everything else) is the trust model that makes this safe to
   * leave on long-running workbooks. The checklist UX implied
   * "submit the whole form" semantics; the per-row UX makes each
   * decision its own commit.
   */
  import {
    listPermissions,
    approvePermissions,
    revokePermissions,
  } from "@work.books/runtime/storage";
  import { permissionsPanel } from "../lib/permissionsPanel.svelte.js";

  let dialogEl;
  let busy = $state(/** @type {Record<string, boolean>} */ ({}));
  let error = $state("");
  /** @type {Array<{id: string, reason: string}>} */
  let requested = $state([]);
  let granted = $state(/** @type {string[]} */ ([]));
  let needsApproval = $state(false);

  const LABELS = {
    agents: "Run external coding agents (Claude Code / Codex)",
    autosave: "Save changes back to this file",
    secrets: "Store API keys for connected services",
    network: "Make outbound HTTPS calls to allowlisted domains",
    c2pa: "Sign saves with a C2PA content credential (sidecar)",
  };

  async function refresh() {
    try {
      const p = await listPermissions();
      requested = p.requested;
      granted = p.granted;
      needsApproval = p.needsApproval;
      // Auto-pop on first load if anything's still un-decided.
      if (needsApproval && !permissionsPanel.open) {
        permissionsPanel.open = true;
      }
    } catch (e) {
      // file:// or daemon unreachable — silently skip; the install
      // toast handles those cases separately.
    }
  }

  $effect(() => {
    refresh();
  });

  $effect(() => {
    if (!dialogEl) return;
    if (permissionsPanel.open && !dialogEl.open) dialogEl.showModal();
    if (!permissionsPanel.open && dialogEl.open) dialogEl.close();
  });

  async function allow(id) {
    if (busy[id]) return;
    busy[id] = true; error = "";
    try {
      const p = await approvePermissions([id]);
      requested = p.requested;
      granted = p.granted;
      needsApproval = p.needsApproval;
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy[id] = false;
  }

  async function revoke(id) {
    if (busy[id]) return;
    busy[id] = true; error = "";
    try {
      const p = await revokePermissions([id]);
      requested = p.requested;
      granted = p.granted;
      needsApproval = p.needsApproval;
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy[id] = false;
  }

  function close() { permissionsPanel.open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="m-auto bg-surface text-fg rounded-xl border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(560px,calc(100vw-32px))] p-0"
>
 <div class="flex flex-col">
  <header class="px-6 py-5 flex items-start justify-between gap-3">
    <div>
      <h2 class="text-[16px] font-semibold leading-none m-0">Permissions</h2>
      <p class="text-[12px] text-fg-muted mt-2 m-0 leading-snug">
        This workbook asks for the capabilities below. Approve or revoke each
        independently — every grant is reversible from this panel.
      </p>
    </div>
    <button
      type="button"
      onclick={close}
      aria-label="Close"
      class="text-fg-muted hover:text-fg cursor-pointer text-lg leading-none bg-transparent border-0 p-1"
    >×</button>
  </header>

  {#if requested.length === 0}
    <p class="text-[12px] text-fg-faint px-6 pb-6 m-0">This workbook hasn't requested any capabilities.</p>
  {:else}
    <ul class="flex flex-col gap-2 px-6 pb-3 m-0 list-none">
      {#each requested as r (r.id)}
        {@const isGranted = granted.includes(r.id)}
        <li class="rounded-lg border p-3 flex items-start gap-3"
            class:border-accent={isGranted}
            class:border-border={!isGranted}>
          <span class="shrink-0 w-1.5 h-1.5 rounded-full mt-2"
                class:bg-emerald-400={isGranted}
                class:bg-fg-faint={!isGranted}
                aria-hidden="true"></span>
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-medium">{LABELS[r.id] ?? r.id}</div>
            <p class="text-[12px] text-fg-muted m-0 mt-0.5 leading-snug">{r.reason}</p>
            <div class="text-[10px] uppercase tracking-wider mt-1.5"
                 class:text-emerald-400={isGranted}
                 class:text-fg-faint={!isGranted}>
              {isGranted ? "approved" : "not approved"}
            </div>
          </div>
          {#if isGranted}
            <button
              type="button"
              onclick={() => revoke(r.id)}
              disabled={busy[r.id]}
              class="text-[11px] px-3 py-1.5 rounded-md cursor-pointer shrink-0
                     bg-transparent text-fg-muted hover:text-fg
                     border border-border disabled:opacity-50"
              title="Revoke this capability — daemon stops honoring it for this workbook."
            >Revoke</button>
          {:else}
            <button
              type="button"
              onclick={() => allow(r.id)}
              disabled={busy[r.id]}
              class="text-[11px] px-3 py-1.5 rounded-md cursor-pointer shrink-0
                     bg-accent text-accent-fg border border-accent disabled:opacity-50"
              title="Grant this capability."
            >Allow</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if error}
    <div class="mx-6 mb-3 text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-md px-3 py-2">{error}</div>
  {/if}

  <footer class="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
    <button
      type="button"
      onclick={close}
      class="text-[12px] px-3 py-1.5 rounded-md text-fg-muted hover:text-fg cursor-pointer bg-transparent border border-border"
    >Done</button>
  </footer>
 </div>
</dialog>
