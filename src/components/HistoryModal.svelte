<script>
  // Wraps HistoryPanel in a <dialog> so the edit log can be invoked
  // from the Edit menu (instead of a permanent left-rail tab). The
  // panel is mounted lazily — only when open — to avoid running the
  // history-store subscribe loop when the modal is closed.

  import HistoryPanel from "./HistoryPanel.svelte";

  let { open = $bindable(false) } = $props();

  let dialogEl;

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    if (!open && dialogEl.open) dialogEl.close();
  });

  function close() { open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="bg-page text-fg rounded-lg border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(720px,calc(100vw-32px))] h-[min(640px,calc(100vh-64px))]
         p-0 flex flex-col"
>
  <header class="flex items-baseline justify-between px-5 py-3 border-b border-border flex-shrink-0">
    <h3 class="font-mono text-[12px] uppercase tracking-wider text-fg-muted m-0 font-semibold">
      history
    </h3>
    <button
      onclick={close}
      class="text-fg-muted hover:text-fg cursor-pointer text-base leading-none bg-transparent border-0 p-1"
      aria-label="Close"
    >×</button>
  </header>

  <div class="flex-1 min-h-0 flex flex-col">
    {#if open}
      <HistoryPanel />
    {/if}
  </div>
</dialog>

<style>
  dialog { margin: auto; max-height: calc(100vh - 32px); }
  dialog:not([open]) { display: none !important; }
</style>
