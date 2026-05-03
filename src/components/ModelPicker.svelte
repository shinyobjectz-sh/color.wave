<script>
  /**
   * Custom combobox for OpenRouter model selection.
   *
   * Why not <datalist>: native datalist can't render images next to
   * options, so we'd lose the per-provider icons that make the list
   * scannable. This component renders a button-trigger + a popover
   * list with [favicon · name · model id], filtered by typed query.
   *
   * Source of options: modelCatalog.svelte.js. Falls back to the
   * static MODEL_PRESETS array when the dynamic fetch hasn't
   * resolved yet (offline, first load before cache, etc.) so the
   * picker is never empty.
   *
   * Free-text behavior preserved: typing in the search box updates
   * env.model immediately on Enter / blur, so users can still drop
   * in any OpenRouter model id we don't list.
   */
  import { env, MODEL_PRESETS } from "../lib/env.svelte.js";
  import { modelCatalog } from "../lib/modelCatalog.svelte.js";

  let open = $state(false);
  let query = $state("");
  let triggerEl;
  let popoverEl;

  // Trigger a fetch the first time the picker mounts; subsequent
  // mounts hit the cache. Refresh when the popover opens too so a
  // user who left the panel sitting overnight gets fresh data.
  $effect(() => { modelCatalog.ensure(); });
  $effect(() => { if (open) modelCatalog.ensure(); });

  // Close on outside click or Escape. Mounted only when open so the
  // listeners don't run for the lifetime of the page.
  $effect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (popoverEl?.contains(e.target)) return;
      if (triggerEl?.contains(e.target)) return;
      open = false;
    };
    const onKey = (e) => { if (e.key === "Escape") open = false; };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  });

  // Combine the dynamic catalog with the static fallback. Dedupe
  // by id (catalog wins, since it has icons + name + ctx-len).
  let entries = $derived.by(() => {
    const fromCatalog = modelCatalog.models;
    if (fromCatalog.length > 0) return fromCatalog;
    return MODEL_PRESETS.map((p) => ({
      id: p.id,
      name: p.label,
      provider: p.id.split("/")[0] ?? "",
      iconUrl: null,
      contextLength: null,
    }));
  });

  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 80); // cap initial render
    return entries
      .filter((m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
      )
      .slice(0, 80);
  });

  let active = $derived(modelCatalog.get(env.model) ?? {
    id: env.model,
    name: env.model,
    provider: env.model.split("/")[0] ?? "",
    iconUrl: null,
  });

  function pick(id) {
    env.setModel(id);
    open = false;
    query = "";
  }

  function commitTyped() {
    const v = query.trim();
    if (v) env.setModel(v);
    open = false;
    query = "";
  }

  function fmtContext(n) {
    if (!n) return "";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ctx`;
    if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
    return `${n} ctx`;
  }
</script>

<div class="picker">
  <button
    type="button"
    bind:this={triggerEl}
    class="trigger"
    onclick={() => { open = !open; if (open) query = ""; }}
    title={active.id}
  >
    {#if active.iconUrl}
      <img src={active.iconUrl} alt="" class="icon" />
    {:else}
      <span class="icon-placeholder" aria-hidden="true"></span>
    {/if}
    <code class="trigger-id">{active.id}</code>
    <span class="caret" aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div class="popover" bind:this={popoverEl}>
      <div class="search-row">
        <input
          class="search"
          type="text"
          placeholder="filter or paste any openrouter model id…"
          autofocus
          spellcheck="false"
          autocomplete="off"
          bind:value={query}
          onkeydown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitTyped(); }
          }}
        />
        {#if modelCatalog.loading}
          <span class="status">loading…</span>
        {:else if modelCatalog.error}
          <span class="status err" title={modelCatalog.error}>offline · using fallback</span>
        {:else if modelCatalog.fetchedAt}
          <span class="status">{entries.length} models</span>
        {/if}
      </div>

      <ul class="list" role="listbox">
        {#each filtered as m (m.id)}
          <li>
            <button type="button" class="row" class:active={m.id === active.id} onclick={() => pick(m.id)}>
              {#if m.iconUrl}
                <img src={m.iconUrl} alt="" class="icon" />
              {:else}
                <span class="icon-placeholder" aria-hidden="true"></span>
              {/if}
              <div class="row-text">
                <div class="row-name">{m.name}</div>
                <code class="row-id">{m.id}</code>
              </div>
              {#if m.contextLength}
                <span class="row-ctx tnum">{fmtContext(m.contextLength)}</span>
              {/if}
            </button>
          </li>
        {/each}
        {#if filtered.length === 0}
          <li class="empty">no match — press enter to use “{query}”</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .picker { position: relative; }
  .trigger {
    width: 100%;
    display: flex; align-items: center; gap: 8px;
    background: var(--color-page, #0a0a0a);
    border: 1px solid var(--color-border, #2a2a2a);
    border-radius: 4px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
    color: var(--color-fg, #e5e5e5);
    cursor: pointer;
    text-align: left;
    transition: border-color 80ms ease, background 80ms ease;
  }
  .trigger:hover { border-color: var(--color-fg-muted, #888); }
  .trigger-id { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .caret { color: var(--color-fg-faint, #666); font-size: 10px; }

  .icon { width: 14px; height: 14px; flex-shrink: 0; object-fit: contain; }
  .icon-placeholder {
    width: 14px; height: 14px; flex-shrink: 0;
    border-radius: 3px;
    background: var(--color-surface-3, #2a2a2a);
  }

  .popover {
    position: absolute;
    top: calc(100% + 4px); left: 0; right: 0;
    z-index: 50;
    background: var(--color-surface-1, #111);
    border: 1px solid var(--color-border, #2a2a2a);
    border-radius: 6px;
    box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.6);
    max-height: 360px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .search-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-hairline, #1f1f1f);
  }
  .search {
    flex: 1;
    background: transparent;
    border: 0;
    color: var(--color-fg, #e5e5e5);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
    padding: 4px 4px;
    outline: none;
  }
  .search::placeholder { color: var(--color-fg-faint, #666); }
  .status {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10px;
    color: var(--color-fg-faint, #666);
    flex-shrink: 0;
  }
  .status.err { color: var(--color-amber, #c08c46); }

  .list {
    list-style: none;
    margin: 0; padding: 4px 0;
    overflow-y: auto;
  }
  .row {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    background: transparent;
    border: 0;
    padding: 6px 10px;
    cursor: pointer;
    color: var(--color-fg, #e5e5e5);
    text-align: left;
    transition: background 60ms ease;
  }
  .row:hover { background: var(--color-surface-2, #181818); }
  .row.active { background: var(--color-surface-3, #222); }
  .row-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .row-name {
    font-size: 12px;
    color: var(--color-fg, #e5e5e5);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row-id {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10px;
    color: var(--color-fg-faint, #666);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row-ctx {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10px;
    color: var(--color-fg-faint, #666);
  }
  .empty {
    padding: 12px 10px;
    color: var(--color-fg-faint, #666);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
  }
</style>
