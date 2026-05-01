<script>
  /**
   * Integration Manager — paste API keys for fal.ai / ElevenLabs /
   * Runway / HuggingFace. Keys live in browser localStorage (via
   * env.svelte.js's standard envKey path) and never get serialized
   * into the .workbook.html file. Sharing the file is safe.
   *
   * When a key is set, the matching skill (built into the workbook
   * via src/skills/<id>/SKILL.md) becomes useful: the agent can read
   * it via load_skill and call the service through the bash tool's
   * curl, with the key already in $ENV_KEY.
   */
  import { env } from "../lib/env.svelte.js";
  import { INTEGRATIONS } from "../lib/integrations.svelte.js";

  let { open = $bindable(false) } = $props();

  let dialogEl;
  /** Map of integration.id → boolean revealing the key field. */
  let reveal = $state({});

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    if (!open && dialogEl.open) dialogEl.close();
  });

  function close() { open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }

  function openDocs(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="bg-surface text-fg rounded-lg border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(560px,calc(100vw-32px))] max-h-[calc(100vh-64px)] p-0
         flex flex-col"
>
  <div class="flex items-baseline justify-between px-5 py-3 border-b border-border">
    <h3 class="font-mono text-[12px] uppercase tracking-wider text-fg-muted m-0 font-semibold">
      integrations
    </h3>
    <button
      onclick={close}
      class="text-fg-muted hover:text-fg cursor-pointer text-base leading-none bg-transparent border-0 p-1"
      aria-label="Close"
    >×</button>
  </div>

  <div class="px-5 py-3 text-[11px] text-fg-muted border-b border-border leading-relaxed">
    Connect third-party services so the agent can use them. Keys are stored in your
    browser only — the <code class="font-mono">.workbook.html</code> file you share never carries them.
  </div>

  <div class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
    {#each INTEGRATIONS as it (it.id)}
      {@const value = it.envKey ? (env.values[it.envKey] ?? "") : ""}
      {@const active = !it.envKey || Boolean(value.trim())}
      <div class="border border-border rounded-md p-3 flex flex-col gap-2"
           class:border-accent={active}>
        <div class="flex items-baseline justify-between gap-3">
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-[13px] font-semibold">{it.name}</span>
            {#if active}
              <span class="font-mono text-[9px] uppercase tracking-wider text-accent">connected</span>
            {/if}
          </div>
          <button
            type="button"
            onclick={() => openDocs(it.docsUrl)}
            class="font-mono text-[10px] text-fg-muted hover:text-fg cursor-pointer bg-transparent border-0 p-0"
          >get key →</button>
        </div>
        <p class="text-[11px] text-fg-muted m-0 leading-snug">{it.blurb}</p>

        {#if it.envKey}
          <div class="flex items-center gap-2">
            <input
              type={reveal[it.id] ? "text" : "password"}
              value={value}
              oninput={(e) => env.set(it.envKey, e.currentTarget.value)}
              placeholder={it.keyPrefix}
              spellcheck="false"
              autocomplete="off"
              class="flex-1 font-mono text-[11px] px-2 py-1 bg-bg border border-border rounded
                     text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onclick={() => reveal[it.id] = !reveal[it.id]}
              class="font-mono text-[10px] text-fg-muted hover:text-fg cursor-pointer
                     bg-transparent border-0 px-2 py-1"
              title={reveal[it.id] ? "hide" : "show"}
            >{reveal[it.id] ? "hide" : "show"}</button>
            {#if value.trim()}
              <button
                type="button"
                onclick={() => env.set(it.envKey, "")}
                class="font-mono text-[10px] text-fg-muted hover:text-rose-400 cursor-pointer
                       bg-transparent border-0 px-2 py-1"
              >clear</button>
            {/if}
          </div>
        {/if}

        <details class="text-[10px] text-fg-muted">
          <summary class="cursor-pointer select-none hover:text-fg">capabilities</summary>
          <ul class="m-0 mt-1 ps-4 leading-snug">
            {#each it.capabilities as c}
              <li>{c}</li>
            {/each}
          </ul>
          <p class="mt-2 mb-0 leading-snug">
            Skill loaded automatically when the agent calls
            <code class="font-mono">load_skill("{it.id}")</code>.
          </p>
        </details>
      </div>
    {/each}
  </div>
</dialog>
