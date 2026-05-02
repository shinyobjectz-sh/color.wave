<script>
  /**
   * Integration Manager — paste API keys for fal.ai / ElevenLabs /
   * Runway / HuggingFace. Keys live in the OS keychain via workbooksd
   * (see vendor/workbooks/packages/workbooksd/src/main.rs:secret/*),
   * never in browser localStorage. Sharing the .workbook.html file
   * never carries the keys (they're not in the file at all), and
   * other workbooks served by the same daemon CAN'T read them
   * (token-→-path scoping enforces that).
   *
   * Each card has a single CTA (Connect / Manage). Card flips inline
   * to reveal a write-only key field — once set, the value isn't
   * read back to the browser; users see "connected" and can rotate
   * by overwriting or clear with the Clear button.
   */
  import { wb } from "@work.books/runtime/storage";
  import { INTEGRATIONS } from "../lib/integrations.svelte.js";
  import Scrollbox from "./Scrollbox.svelte";

  let { open = $bindable(false) } = $props();

  let dialogEl;
  /** Map of integration.id → "expanded" boolean. Click a card to flip. */
  let expanded = $state(/** @type {Record<string, boolean>} */ ({}));
  /** Map of integration.id → string the user is typing (write-only;
   *  cleared once we POST to the daemon). */
  let pending = $state(/** @type {Record<string, string>} */ ({}));
  /** Set of secret ids the daemon currently has stored for this
   *  workbook. Refreshed on open + after each set/delete. */
  let configured = $state(/** @type {Set<string>} */ (new Set()));
  let busy = $state(false);
  let error = $state("");

  /** One-time migration: lift any pre-secrets-refactor localStorage
   *  keys into the daemon's keychain, then wipe localStorage. We
   *  do this before the first list() so the UI never shows
   *  "Connected" pulled from the now-deprecated path. */
  async function migrateLegacyKeys() {
    const PREFIX = "wb.env.colorwave.";
    const moved = [];
    try {
      for (const it of INTEGRATIONS) {
        if (!it.envKey) continue;
        const k = PREFIX + it.envKey;
        const v = localStorage.getItem(k);
        if (typeof v === "string" && v.trim()) {
          try {
            await wb.secret.set(it.envKey, v.trim());
            localStorage.removeItem(k);
            moved.push(it.envKey);
          } catch {
            // Daemon down or no token — leave the localStorage entry
            // in place so a later session can migrate. Don't surface
            // as an error; the user can still paste fresh.
          }
        }
      }
    } catch {
      // localStorage blocked (private mode); skip silently.
    }
    return moved;
  }

  async function refresh() {
    error = "";
    try {
      await migrateLegacyKeys();
      const ids = await wb.secret.list();
      configured = new Set(ids);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      refresh();
    }
    if (!open && dialogEl.open) dialogEl.close();
  });

  async function saveKey(envKey, value) {
    if (!envKey || !value?.trim()) return;
    busy = true; error = "";
    try {
      await wb.secret.set(envKey, value.trim());
      configured = new Set([...configured, envKey]);
      pending[envKey] = "";
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy = false;
  }

  async function clearKey(envKey) {
    if (!envKey) return;
    busy = true; error = "";
    try {
      await wb.secret.delete(envKey);
      const next = new Set(configured);
      next.delete(envKey);
      configured = next;
    } catch (e) {
      error = e?.message ?? String(e);
    }
    busy = false;
  }

  function close() { open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }
  function openDocs(url) { window.open(url, "_blank", "noopener,noreferrer"); }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="m-auto bg-surface text-fg rounded-xl border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(640px,calc(100vw-32px))] h-[min(640px,calc(100vh-64px))] p-0"
>
 <div class="flex flex-col h-full">
  <header class="flex items-center justify-between px-6 py-4">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-[15px] font-semibold leading-none m-0">Integrations</h2>
      <p class="text-[11px] text-fg-muted m-0">Connect services the agent can use. Keys stored in your OS keychain.</p>
    </div>
    <button
      onclick={close}
      class="text-fg-muted hover:text-fg cursor-pointer text-lg leading-none bg-transparent border-0 p-1 -mr-2"
      aria-label="Close"
    >×</button>
  </header>

  <Scrollbox class="flex-1">
    <div class="px-6 pb-6 flex flex-col gap-3">
    {#if error}
      <div class="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-md px-3 py-2">{error}</div>
    {/if}
    {#each INTEGRATIONS as it (it.id)}
      {@const connected = !it.envKey || configured.has(it.envKey)}
      {@const isOpen = expanded[it.id]}
      <div
        class="rounded-lg border transition-colors"
        class:border-border={!connected}
        class:border-accent={connected}
      >
        <button
          type="button"
          onclick={() => expanded[it.id] = !isOpen}
          class="w-full flex items-center gap-4 px-5 py-4
                 bg-transparent border-0 cursor-pointer text-left"
        >
          {#if it.logo}
            <img src={it.logo} alt="" class="w-9 h-9 shrink-0 rounded-md object-contain bg-bg/50 p-1" />
          {/if}
          <div class="flex flex-col gap-1 min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-[14px] font-medium">{it.name}</span>
              {#if connected}
                <span class="text-[10px] text-accent">●</span>
              {/if}
            </div>
            <p class="text-[12px] text-fg-muted m-0 truncate">{it.blurb}</p>
          </div>
          <span
            class="text-[11px] text-fg-muted shrink-0 select-none"
            aria-hidden="true"
          >{isOpen ? "▾" : "▸"}</span>
        </button>

        {#if isOpen}
          <div class="px-5 pb-5 pt-1 flex flex-col gap-4">
            {#if it.envKey}
              <div class="flex flex-col gap-1.5">
                <label class="text-[10px] uppercase tracking-wider text-fg-faint" for={`key-${it.id}`}>API key</label>
                <div class="flex items-center gap-2">
                  <input
                    id={`key-${it.id}`}
                    type="password"
                    value={pending[it.id] ?? ""}
                    oninput={(e) => pending[it.id] = e.currentTarget.value}
                    onkeydown={(e) => { if (e.key === "Enter" && pending[it.id]) saveKey(it.envKey, pending[it.id]); }}
                    placeholder={connected ? "•••••••• (stored — paste to replace)" : it.keyPrefix}
                    spellcheck="false"
                    autocomplete="off"
                    disabled={busy}
                    class="flex-1 font-mono text-[12px] px-3 py-2 bg-bg border border-border rounded-md
                           text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent
                           disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onclick={() => saveKey(it.envKey, pending[it.id])}
                    disabled={busy || !pending[it.id]?.trim()}
                    class="text-[11px] text-accent hover:text-fg cursor-pointer
                           bg-transparent border-0 px-2 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >save</button>
                  {#if connected}
                    <button
                      type="button"
                      onclick={() => clearKey(it.envKey)}
                      disabled={busy}
                      class="text-[11px] text-fg-muted hover:text-rose-400 cursor-pointer
                             bg-transparent border-0 px-2 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >clear</button>
                  {/if}
                </div>
                <button
                  type="button"
                  onclick={() => openDocs(it.docsUrl)}
                  class="self-start text-[11px] text-fg-muted hover:text-fg cursor-pointer
                         bg-transparent border-0 p-0 underline-offset-2 hover:underline"
                >Get a key →</button>
              </div>
            {/if}

            <div class="flex flex-col gap-1.5">
              <span class="text-[10px] uppercase tracking-wider text-fg-faint">Capabilities</span>
              <ul class="m-0 ps-4 flex flex-col gap-0.5 text-[12px] text-fg-muted leading-snug">
                {#each it.capabilities as c}
                  <li>{c}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>
    {/each}
    </div>
  </Scrollbox>
 </div>
</dialog>
