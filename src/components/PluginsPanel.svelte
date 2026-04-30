<script>
  /**
   * PluginsPanel — left-panel tab listing every installed plugin's
   * inline UI (formerly under Settings → Palette etc.).
   *
   * Each enabled plugin that registered a `wb.settings.addSection`
   * gets a collapsible card. Order matches plugins.items[] (which
   * the Plugin Manager lets the user reorder), so installed-list
   * reordering surfaces here directly.
   *
   * If a plugin is installed-but-disabled, we show the card header
   * with a disabled state — clicking the toggle re-enables it.
   * Empty-state nudges the user toward the Plugins menu / Plugin
   * Manager Browse tab.
   */

  import { plugins } from "../lib/plugins.svelte.js";
  import { settingsSections } from "../lib/pluginApi.svelte.js";

  // Sections come from pluginApi as-registered (push order = activation
  // order). To make user-controlled order win, we sort by plugins.items
  // index at render time. settingsSections itself stays first-come.
  let orderedSections = $derived.by(() => {
    const idx = new Map(plugins.items.map((p, i) => [p.id, i]));
    return [...settingsSections]
      .map((s) => ({ s, i: idx.has(s.pluginId) ? idx.get(s.pluginId) : 1e9 }))
      .sort((a, b) => a.i - b.i)
      .map(({ s }) => s);
  });

  // Map for installed-but-no-section state
  let pluginById = $derived(new Map(plugins.items.map((p) => [p.id, p])));

  // Search/filter — matches against section label, plugin name/id,
  // and description. Empty query → no filter.
  let query = $state("");
  let filteredSections = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedSections;
    return orderedSections.filter((s) => {
      const p = pluginById.get(s.pluginId);
      const hay = [
        s.label,
        s.pluginId,
        p?.name,
        p?.description,
        p?.id,
        ...(p?.surfaces ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  });

  // Collapsed cards (per-session, not persisted).
  let collapsed = $state(new Set());
  function toggle(id) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    collapsed = next;
  }

  // Plain-JS plugins that registered with `mount(el) -> cleanup`
  // (vs Svelte component) — apply via use:action.
  function mountSection(node, fn) {
    let cleanup;
    try { cleanup = fn(node); } catch (e) { console.warn("plugin section mount threw:", e); }
    return {
      destroy() {
        if (typeof cleanup === "function") {
          try { cleanup(); } catch (e) { console.warn("plugin section cleanup threw:", e); }
        }
      },
    };
  }
</script>

<section class="flex flex-col min-h-0 flex-1">
  {#if orderedSections.length > 0}
    <div class="pp-search">
      <input
        type="search"
        placeholder="filter plugins…"
        bind:value={query}
        spellcheck="false"
        autocomplete="off"
      />
      {#if query}
        <button class="pp-clear-q" onclick={() => query = ""} aria-label="Clear">×</button>
      {/if}
    </div>
  {/if}

  <div class="flex-1 min-h-0 overflow-y-auto">
  {#if orderedSections.length === 0}
    <div class="p-4 font-mono text-[11px] text-fg-faint">
      {#if plugins.items.length === 0}
        No plugins installed yet. Open <strong>Plugins → Plugin Manager…</strong> and try the Browse tab.
      {:else}
        No installed plugins exposed an inline panel. (Plugins can register a panel via <code>wb.settings.addSection</code>.)
      {/if}
    </div>
  {:else if filteredSections.length === 0}
    <div class="p-4 font-mono text-[11px] text-fg-faint">
      no matches for "{query}"
    </div>
  {:else}
    <ul class="pp-list">
      {#each filteredSections as section (section.pluginId + ":" + section.label)}
        {@const p = pluginById.get(section.pluginId)}
        <li class="pp-card">
          <header class="pp-head">
            <button
              class="pp-toggle"
              onclick={() => toggle(section.pluginId)}
              aria-expanded={!collapsed.has(section.pluginId)}
              title={collapsed.has(section.pluginId) ? "Expand" : "Collapse"}
            >
              <span class="pp-caret" class:open={!collapsed.has(section.pluginId)}>▸</span>
            </button>
            <div class="pp-head-meta">
              {#if p?.icon}<span class="pp-icon">{p.icon}</span>{/if}
              <code class="pp-name">{section.label}</code>
              {#if p}
                <span class="pp-plugin-id">· {p.name}{p.version ? ` v${p.version}` : ""}</span>
              {:else}
                <span class="pp-plugin-id">· {section.pluginId}</span>
              {/if}
            </div>
          </header>
          {#if !collapsed.has(section.pluginId)}
            <div class="pp-body">
              {#if section.component}
                <section.component />
              {:else if section.mount}
                <div use:mountSection={section.mount}></div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  </div>
</section>

<style>
  .pp-search {
    position: relative;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-page);
  }
  .pp-search input {
    width: 100%;
    height: 26px;
    padding: 0 26px 0 10px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-fg);
    font-family: var(--font-mono);
    font-size: 11px;
    outline: none;
  }
  .pp-search input::placeholder { color: var(--color-fg-faint); }
  .pp-search input:focus { border-color: var(--color-accent); }
  .pp-clear-q {
    position: absolute;
    right: 16px; top: 50%;
    transform: translateY(-50%);
    width: 18px; height: 18px;
    background: transparent;
    border: 0;
    color: var(--color-fg-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
  }
  .pp-clear-q:hover { color: var(--color-fg); }

  .pp-list { list-style: none; padding: 0; margin: 0; }
  .pp-card {
    border-bottom: 1px solid var(--color-border);
  }
  .pp-head {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    background: var(--color-page);
  }
  .pp-toggle {
    width: 18px; height: 18px;
    background: transparent; border: 0; cursor: pointer;
    color: var(--color-fg-muted);
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0;
  }
  .pp-toggle:hover { color: var(--color-fg); }
  .pp-caret {
    display: inline-block;
    transition: transform 100ms ease;
    font-size: 10px;
  }
  .pp-caret.open { transform: rotate(90deg); }
  .pp-head-meta {
    display: inline-flex; align-items: baseline; gap: 6px;
    flex-wrap: wrap;
    font-family: var(--font-mono);
    font-size: 11px;
    flex: 1; min-width: 0;
  }
  .pp-icon { font-size: 13px; }
  .pp-name { color: var(--color-fg); font-weight: 600; }
  .pp-plugin-id {
    color: var(--color-fg-faint);
    font-size: 10px;
  }
  .pp-body {
    padding: 10px 14px 14px;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }
</style>
