<script>
  /**
   * Per-workbook permissions dialog. Pops on first open if the
   * workbook declared permissions in workbook.config.mjs and the
   * user hasn't approved them yet. Daemon parses the `<meta
   * name="wb-permissions">` tag at serve time, persists approvals
   * keyed by workbook path, so this only shows once per file.
   *
   * Workbooks that don't declare permissions get a transparent-pass
   * — `needsApproval` is false and the dialog stays dismissed.
   */
  import { listPermissions, approvePermissions } from "@work.books/runtime/storage";

  let dialogEl;
  let open = $state(false);
  let busy = $state(false);
  let error = $state("");
  /** @type {Array<{id: string, reason: string}>} */
  let requested = $state([]);
  /** Set of selected ids — defaults to ALL requested. User can
   *  uncheck individual capabilities they don't want to grant. */
  let selected = $state(/** @type {Set<string>} */ (new Set()));

  const LABELS = {
    agents: "Run external coding agents (Claude Code / Codex)",
    autosave: "Save changes back to this file",
    secrets: "Store API keys for connected services",
    network: "Make outbound HTTPS calls to allowlisted domains",
  };

  async function check() {
    try {
      const p = await listPermissions();
      if (p.needsApproval) {
        requested = p.requested;
        selected = new Set(p.requested.map((r) => r.id));
        open = true;
      }
    } catch (e) {
      // file:// (no daemon) or daemon unreachable — silently
      // skip; the install-toast handles those cases separately.
    }
  }

  // Run the check on mount.
  $effect(() => {
    check();
  });

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    if (!open && dialogEl.open) dialogEl.close();
  });

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  async function approveSelected() {
    busy = true; error = "";
    try {
      await approvePermissions([...selected]);
      open = false;
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy = false;
  }

  async function approveAll() {
    selected = new Set(requested.map((r) => r.id));
    await approveSelected();
  }

  async function denyAll() {
    busy = true; error = "";
    try {
      await approvePermissions([]);
      open = false;
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy = false;
  }
</script>

<dialog
  bind:this={dialogEl}
  class="m-auto bg-surface text-fg rounded-xl border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(540px,calc(100vw-32px))] p-0"
>
 <div class="flex flex-col">
  <header class="px-6 py-5">
    <h2 class="text-[16px] font-semibold leading-none m-0">
      Permission requested
    </h2>
    <p class="text-[12px] text-fg-muted mt-2 m-0 leading-snug">
      This workbook is asking to do the following on your machine. Approve
      only what makes sense — you can revisit anytime in
      <span class="font-mono text-fg">Manage → Agents</span>.
    </p>
  </header>

  <ul class="flex flex-col gap-2 px-6 pb-3 m-0 list-none">
    {#each requested as r (r.id)}
      <li class="rounded-lg border p-3 flex items-start gap-3"
          class:border-accent={selected.has(r.id)}
          class:border-border={!selected.has(r.id)}>
        <button
          type="button"
          onclick={() => toggle(r.id)}
          class="shrink-0 w-4 h-4 rounded border cursor-pointer"
          class:bg-accent={selected.has(r.id)}
          class:border-accent={selected.has(r.id)}
          class:border-border={!selected.has(r.id)}
          aria-label={`toggle ${r.id}`}
          aria-pressed={selected.has(r.id)}
        ></button>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium">{LABELS[r.id] ?? r.id}</div>
          <p class="text-[12px] text-fg-muted m-0 mt-0.5 leading-snug">{r.reason}</p>
        </div>
      </li>
    {/each}
  </ul>

  {#if error}
    <div class="mx-6 mb-3 text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-md px-3 py-2">{error}</div>
  {/if}

  <footer class="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
    <button
      type="button"
      onclick={denyAll}
      disabled={busy}
      class="text-[12px] px-3 py-1.5 rounded-md text-fg-muted hover:text-fg cursor-pointer bg-transparent border border-border disabled:opacity-50"
    >Deny all</button>
    <span class="flex-1"></span>
    <button
      type="button"
      onclick={approveSelected}
      disabled={busy}
      class="text-[12px] px-3 py-1.5 rounded-md text-fg-muted hover:text-fg cursor-pointer bg-transparent border border-border disabled:opacity-50"
    >Approve selected ({selected.size})</button>
    <button
      type="button"
      onclick={approveAll}
      disabled={busy}
      class="text-[12px] font-medium px-3 py-1.5 rounded-md bg-accent text-accent-fg cursor-pointer border-0 disabled:opacity-50"
    >Approve all</button>
  </footer>
 </div>
</dialog>
