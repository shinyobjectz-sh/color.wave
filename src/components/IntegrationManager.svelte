<script>
  /**
   * Integration Manager — paste API keys for fal.ai / ElevenLabs /
   * Runway / HuggingFace. Keys live in browser localStorage (via
   * env.svelte.js's standard envKey path) and never get serialized
   * into the .workbook.html file. Sharing the file is safe.
   *
   * Each card has a single CTA (Connect / Manage). Card flips inline
   * to reveal the key field and per-service capabilities — no nested
   * modals, no jammed metadata.
   */
  import { env } from "../lib/env.svelte.js";
  import { INTEGRATIONS } from "../lib/integrations.svelte.js";
  import Scrollbox from "./Scrollbox.svelte";

  let { open = $bindable(false) } = $props();

  let dialogEl;
  /** Map of integration.id → "expanded" boolean. Click a card to flip. */
  let expanded = $state(/** @type {Record<string, boolean>} */ ({}));
  /** Map of integration.id → "key visible" boolean for the input. */
  let reveal = $state(/** @type {Record<string, boolean>} */ ({}));

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    if (!open && dialogEl.open) dialogEl.close();
  });

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
      <p class="text-[11px] text-fg-muted m-0">Connect services the agent can use. Keys stay in your browser.</p>
    </div>
    <button
      onclick={close}
      class="text-fg-muted hover:text-fg cursor-pointer text-lg leading-none bg-transparent border-0 p-1 -mr-2"
      aria-label="Close"
    >×</button>
  </header>

  <Scrollbox class="flex-1">
    <div class="px-6 pb-6 flex flex-col gap-3">
    {#each INTEGRATIONS as it (it.id)}
      {@const value = it.envKey ? (env.values[it.envKey] ?? "") : ""}
      {@const connected = !it.envKey || Boolean(value.trim())}
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
                    type={reveal[it.id] ? "text" : "password"}
                    value={value}
                    oninput={(e) => env.set(it.envKey, e.currentTarget.value)}
                    placeholder={it.keyPrefix}
                    spellcheck="false"
                    autocomplete="off"
                    class="flex-1 font-mono text-[12px] px-3 py-2 bg-bg border border-border rounded-md
                           text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onclick={() => reveal[it.id] = !reveal[it.id]}
                    class="text-[11px] text-fg-muted hover:text-fg cursor-pointer
                           bg-transparent border-0 px-2 py-2"
                  >{reveal[it.id] ? "hide" : "show"}</button>
                  {#if value.trim()}
                    <button
                      type="button"
                      onclick={() => env.set(it.envKey, "")}
                      class="text-[11px] text-fg-muted hover:text-rose-400 cursor-pointer
                             bg-transparent border-0 px-2 py-2"
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
