<script>
  /**
   * Big-modal history surface — full-bleed dialog hosting the
   * GitKraken-style branch canvas (left) and the per-commit detail
   * panel (right). Replaces the older 720x640 pop-up that just
   * scrolled HistoryPanel; we kept the modal shell because the
   * editor surface behind it is still useful (Cmd+W stays bound,
   * autosave keeps running) and the dialog backdrop dims everything
   * else so the focus is unambiguous.
   *
   * Mounting strategy: render the canvas + detail only when open
   * to keep the readLog / WASM-decode work off the critical path
   * for users who never crack open the history view.
   */
  import HistoryCanvas from "./HistoryCanvas.svelte";
  import HistoryDetail from "./HistoryDetail.svelte";
  import {
    readLog,
    onHistoryChange,
    onCursorChange,
    getCursor,
    setCursor,
  } from "../lib/historyBackend.svelte.js";

  let { open = $bindable(false) } = $props();

  let dialogEl;
  let entries = $state(/** @type {Array<any>} */ ([]));
  let loading = $state(false);
  let error = $state("");
  let cursorHash = $state(/** @type {string | null} */ (null));
  let selectedHash = $state("");

  // Selected entry resolution — defaults to the current commit
  // (cursor or HEAD) if nothing has been clicked yet, so the right
  // pane always has *something* to show as soon as you open the
  // modal.
  let currentHash = $derived(cursorHash ?? entries[0]?.hash ?? "");
  let effectiveSelected = $derived(selectedHash || currentHash);
  let selectedEntry = $derived(entries.find((e) => e.hash === effectiveSelected) ?? null);

  let unsubHistory;
  let unsubCursor;

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      bootstrap();
    }
    if (!open && dialogEl.open) dialogEl.close();
  });

  function bootstrap() {
    refresh();
    cursorHash = getCursor();
    unsubHistory ??= onHistoryChange(() => refresh());
    unsubCursor ??= onCursorChange(() => { cursorHash = getCursor(); });
  }

  function refresh() {
    loading = true;
    error = "";
    readLog()
      .then((log) => {
        entries = log;
        loading = false;
        // If the selectedHash points at a commit that no longer
        // exists (e.g. truncate-on-edit dropped it), reset.
        if (selectedHash && !log.some((e) => e.hash === selectedHash)) {
          selectedHash = "";
        }
      })
      .catch((e) => {
        error = e?.message ?? String(e);
        loading = false;
      });
  }

  function close() { open = false; }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  async function releaseToHead() {
    setCursor(null);
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="hist-modal"
>
  <header class="hd">
    <div class="hd-l">
      <h3 class="title">history</h3>
      {#if entries.length > 0}
        <span class="count">{entries.length} commit{entries.length === 1 ? "" : "s"}</span>
      {/if}
      {#if cursorHash}
        <span class="badge detached" title="Cursor is detached from HEAD — the next edit truncates the redo space.">
          ◌ detached
        </span>
      {/if}
    </div>
    <div class="hd-r">
      {#if cursorHash}
        <button class="action" onclick={releaseToHead} title="Return to the newest commit">
          ↥ release to latest
        </button>
      {/if}
      <button class="close" onclick={close} aria-label="Close">×</button>
    </div>
  </header>

  <div class="body">
    {#if open}
      {#if loading && entries.length === 0}
        <div class="state">loading…</div>
      {:else if error}
        <div class="state err">{error}</div>
      {:else}
        <div class="canvas-pane">
          <HistoryCanvas
            {entries}
            {currentHash}
            {cursorHash}
            bind:selectedHash
          />
        </div>
        <div class="detail-pane">
          <HistoryDetail
            entry={selectedEntry}
            {currentHash}
            {cursorHash}
          />
        </div>
      {/if}
    {/if}
  </div>
</dialog>

<style>
  .hist-modal {
    background: var(--color-page, #0a0a0a);
    color: var(--color-fg, #e5e5e5);
    border: 1px solid var(--color-border, #2a2a2a);
    border-radius: 10px;
    box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.7);
    width: min(1280px, calc(100vw - 32px));
    height: min(840px, calc(100vh - 48px));
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: auto;
  }
  .hist-modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }
  .hist-modal:not([open]) { display: none !important; }

  .hd {
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-hairline, #1f1f1f);
  }
  .hd-l, .hd-r { display: flex; align-items: center; gap: 10px; }
  .title {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-fg-muted, #888);
    font-weight: 600;
  }
  .count {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10.5px;
    color: var(--color-fg-faint, #666);
  }
  .badge {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 9.5px;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge.detached {
    background: rgba(180, 130, 70, 0.12);
    color: #fbbf75;
    border: 1px solid rgba(180, 130, 70, 0.3);
  }

  .action {
    background: transparent;
    border: 1px solid var(--color-border, #2a2a2a);
    color: var(--color-fg-muted, #888);
    padding: 4px 10px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10.5px;
    cursor: pointer;
  }
  .action:hover { color: var(--color-fg, #e5e5e5); border-color: var(--color-fg-muted, #888); }

  .close {
    background: transparent;
    border: 0;
    color: var(--color-fg-muted, #888);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 4px 8px;
  }
  .close:hover { color: var(--color-fg, #e5e5e5); }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
  }
  .canvas-pane { min-height: 0; min-width: 0; overflow: hidden; }
  .detail-pane { min-height: 0; overflow: hidden; }

  .state {
    grid-column: 1 / -1;
    display: flex; align-items: center; justify-content: center;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
    color: var(--color-fg-faint, #666);
  }
  .state.err { color: #fda4af; }

  /* Stack panes vertically on narrow screens (e.g. iPad in chat) so
   * neither the graph nor the detail gets squeezed below usefulness. */
  @media (max-width: 720px) {
    .body { grid-template-columns: 1fr; grid-template-rows: 1fr 220px; }
  }
</style>
