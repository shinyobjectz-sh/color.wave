<script>
  /**
   * Plugins Manager.
   *
   * Two tabs:
   *   • Browse   — auto-fetched from the default registry (shinyobjectz-sh/color-wave-plugins).
   *                One-click install; "update available" badge when a newer version ships.
   *   • Installed — current plugins with toggle, update, remove.
   *
   * Custom-source install (URL / local file) is tucked behind an
   * advanced disclosure at the bottom of the Installed tab — most
   * users should never need it.
   *
   * The registry is fetched once per session on first open; manual
   * refresh button forces a re-fetch.
   */
  import { plugins } from "../lib/plugins.svelte.js";

  let { open = $bindable(false) } = $props();

  let tab = $state("browse"); // "browse" | "installed"
  let url = $state("");
  let error = $state("");
  let success = $state("");
  let fileInputEl;

  // Auto-load the registry the first time this modal opens. Cheap
  // (single small JSON fetch) and idempotent — `loadRegistry()`
  // returns the cached entries on subsequent calls.
  let _autoloaded = false;
  $effect(() => {
    if (open && !_autoloaded) {
      _autoloaded = true;
      plugins.loadRegistry().catch(() => { /* surfaced via plugins.registry.error */ });
    }
  });

  // Quick lookup of installed entries by id — lets the Browse tab
  // show "installed" / "update available" badges without scanning.
  let installedById = $derived(new Map(plugins.items.map((p) => [p.id, p])));

  async function onInstallFromRegistry(entryId) {
    error = ""; success = "";
    try {
      const e = await plugins.installFromRegistry(entryId);
      success = `installed ${e.name} v${e.version}`;
      setTimeout(() => { success = ""; }, 2200);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }

  async function onInstallFromUrl() {
    error = ""; success = "";
    try {
      const e = await plugins.install(url.trim());
      success = `installed ${e.name}${e.version ? ` v${e.version}` : ""}`;
      url = "";
      setTimeout(() => { success = ""; }, 2200);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }
  function onKey(ev) { if (ev.key === "Enter") onInstallFromUrl(); }

  async function onPickFile(ev) {
    error = ""; success = "";
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const code = await file.text();
      const e = await plugins.installFromCode(code, { sourceLabel: file.name });
      success = `installed ${e.name}${e.version ? ` v${e.version}` : ""} (from file)`;
      setTimeout(() => { success = ""; }, 2200);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }

  async function onUpdate(id) {
    error = ""; success = "";
    try {
      const e = await plugins.update(id);
      success = `updated ${e.name} → v${e.version}`;
      setTimeout(() => { success = ""; }, 2200);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }
  async function onToggle(id, ev) {
    error = "";
    try {
      await plugins.setEnabled(id, ev.currentTarget.checked);
    } catch (e) {
      error = e?.message ?? String(e);
    }
  }
  async function onRemove(id) {
    if (!confirm(`Remove plugin '${id}'? Its embedded bytes are deleted; reinstall from the registry or URL to recover.`)) return;
    await plugins.remove(id);
  }
  async function onRefreshRegistry() {
    error = "";
    try { await plugins.loadRegistry({ force: true }); }
    catch (e) { error = e?.message ?? String(e); }
  }

  function fmtAge(ts) {
    if (!ts) return "";
    const d = Date.now() - ts;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return `${Math.floor(d / 86_400_000)}d ago`;
  }
</script>

{#if open}
  <div class="modal-overlay" onclick={() => open = false}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <header class="modal-head">
        <h2 class="font-mono text-[12px] font-semibold uppercase tracking-widest text-fg-muted">Plugins</h2>
        <button class="modal-close" onclick={() => open = false} aria-label="Close">×</button>
      </header>

      <nav class="tabs" role="tablist">
        <button
          class="tab" class:active={tab === "browse"}
          onclick={() => tab = "browse"}
          role="tab" aria-selected={tab === "browse"}
        >
          Browse
          {#if plugins.registry.status === "loaded"}
            <span class="tab-count">{plugins.registry.entries.length}</span>
          {/if}
        </button>
        <button
          class="tab" class:active={tab === "installed"}
          onclick={() => tab = "installed"}
          role="tab" aria-selected={tab === "installed"}
        >
          Installed
          {#if plugins.items.length > 0}
            <span class="tab-count">{plugins.items.length}</span>
          {/if}
        </button>
      </nav>

      <div class="modal-body">
        {#if error}<div class="msg msg-err">{error}</div>{/if}
        {#if success}<div class="msg msg-ok">{success}</div>{/if}

        {#if tab === "browse"}
          <div class="browse-head">
            <p class="text-fg-muted font-mono text-[11px] leading-relaxed">
              Plugins from the default registry. Click install — bytes
              get embedded in this workbook so they keep working when
              the file is shared.
            </p>
            <button
              class="ghost"
              onclick={onRefreshRegistry}
              disabled={plugins.registry.status === "loading"}
              title="Re-fetch the registry"
            >
              {plugins.registry.status === "loading" ? "loading…" : "refresh"}
            </button>
          </div>

          {#if plugins.registry.status === "loading" && plugins.registry.entries.length === 0}
            <p class="font-mono text-[10px] text-fg-faint mt-3">loading catalog…</p>
          {:else if plugins.registry.status === "error"}
            <div class="msg msg-err mt-3">
              couldn't load registry: {plugins.registry.error}
            </div>
          {:else if plugins.registry.entries.length === 0}
            <p class="font-mono text-[10px] text-fg-faint mt-3">
              the registry is empty for now — check back later, or use the advanced installer below to load from a custom URL.
            </p>
          {:else}
            <ul class="plugin-list">
              {#each plugins.registry.entries as e (e.id)}
                {@const installed = installedById.get(e.id)}
                {@const update = installed ? plugins.getRegistryUpdate(e.id) : null}
                <li class="plugin-row">
                  <div class="browse-icon">
                    {#if e.icon}<span class="plugin-icon-lg">{e.icon}</span>{/if}
                  </div>

                  <div class="plugin-meta">
                    <div class="plugin-head">
                      <code class="plugin-name">{e.name}</code>
                      <span class="plugin-version">v{e.latest?.version}</span>
                      {#if installed && !update}<span class="badge badge-ok">installed</span>{/if}
                      {#if update}<span class="badge badge-update">update → v{update.version}</span>{/if}
                    </div>
                    {#if e.description}<div class="plugin-desc">{e.description}</div>{/if}
                    <div class="plugin-aux">
                      {#if e.author}<span>by {e.author}</span>{/if}
                      {#if e.surfaces?.length}<span>surfaces: {e.surfaces.join(", ")}</span>{/if}
                      {#if e.permissions?.length}<span>permissions: {e.permissions.join(", ")}</span>{/if}
                    </div>
                  </div>

                  <div class="plugin-actions">
                    {#if !installed}
                      <button
                        class="primary"
                        onclick={() => onInstallFromRegistry(e.id)}
                        disabled={plugins.busy}
                      >install</button>
                    {:else if update}
                      <button
                        class="primary"
                        onclick={() => onUpdate(e.id)}
                        disabled={plugins.busy}
                        title={`update from v${installed.version} to v${update.version}`}
                      >update</button>
                    {:else}
                      <button disabled title="already on latest">up to date</button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <!-- Installed tab -->
          {#if plugins.items.length === 0}
            <p class="font-mono text-[11px] text-fg-faint">no plugins installed yet — head to the Browse tab.</p>
          {:else}
            <ul class="plugin-list">
              {#each plugins.items as p (p.id)}
                {@const update = plugins.getRegistryUpdate(p.id)}
                <li class="plugin-row">
                  <label class="plugin-toggle" title="{p.enabled ? 'enabled — click to disable' : 'disabled — click to enable'}">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onchange={(ev) => onToggle(p.id, ev)}
                    />
                    <span class="track"></span>
                  </label>

                  <div class="plugin-meta">
                    <div class="plugin-head">
                      {#if p.icon}<span class="plugin-icon">{p.icon}</span>{/if}
                      <code class="plugin-name">{p.name}</code>
                      {#if p.version}<span class="plugin-version">v{p.version}</span>{/if}
                      {#if update}<span class="badge badge-update">update → v{update.version}</span>{/if}
                    </div>
                    {#if p.description}<div class="plugin-desc">{p.description}</div>{/if}
                    <div class="plugin-aux">
                      {#if p.surfaces?.length}<span>surfaces: {p.surfaces.join(", ")}</span>{/if}
                      {#if p.permissions?.length}<span>permissions: {p.permissions.join(", ")}</span>{/if}
                      <span title={`installed ${fmtAge(p.installedAt)}`}>updated {fmtAge(p.updatedAt)}</span>
                    </div>
                    {#if p.source?.url}<code class="plugin-url">{p.source.url}</code>{/if}
                  </div>

                  <div class="plugin-actions">
                    <button onclick={() => onUpdate(p.id)} disabled={plugins.busy || !p.source?.url} title="Re-fetch source URL and replace embedded bytes">update</button>
                    <button onclick={() => onRemove(p.id)} class="danger" title="Uninstall">remove</button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}

          <details class="advanced">
            <summary>Install from custom source (advanced)</summary>
            <p class="text-fg-muted font-mono text-[10px] leading-relaxed my-2">
              Install a plugin not in the registry by pasting a URL or
              uploading a local <code>.js</code> file. Bytes are
              embedded in the workbook just like registry installs.
            </p>
            <div class="install-row">
              <input
                type="url"
                placeholder="https://raw.githubusercontent.com/.../plugin.js"
                bind:value={url}
                onkeydown={onKey}
                disabled={plugins.busy}
              />
              <button
                onclick={onInstallFromUrl}
                disabled={plugins.busy || !url.trim()}
              >
                {plugins.busy ? "installing…" : "install"}
              </button>
            </div>
            <div class="file-row">
              <span>or pick a local file:</span>
              <input
                type="file"
                accept=".js,.mjs,application/javascript,text/javascript"
                bind:this={fileInputEl}
                onchange={onPickFile}
                style="display: none"
              />
              <button class="ghost" onclick={() => fileInputEl?.click()} disabled={plugins.busy}>
                choose file…
              </button>
            </div>
          </details>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .modal {
    width: min(720px, 92vw);
    max-height: 86vh;
    background: var(--color-page);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    display: flex; flex-direction: column;
  }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--color-border);
  }
  .modal-close {
    width: 24px; height: 24px;
    background: transparent; border: 0; color: var(--color-fg-muted);
    cursor: pointer; font-size: 20px; line-height: 1;
  }
  .modal-close:hover { color: var(--color-fg); }
  .modal-body { padding: 16px; overflow-y: auto; }

  .tabs {
    display: flex; gap: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .tab {
    flex: 0 0 auto;
    height: 32px; padding: 0 14px;
    background: transparent; border: 0; cursor: pointer;
    color: var(--color-fg-muted);
    font: 600 11px var(--font-mono);
    text-transform: uppercase; letter-spacing: 0.08em;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .tab:hover { color: var(--color-fg); }
  .tab.active { color: var(--color-fg); border-bottom-color: var(--color-accent); }
  .tab-count {
    font-weight: 400; font-size: 9px;
    padding: 1px 6px; border-radius: 999px;
    background: var(--color-surface); color: var(--color-fg-faint);
  }

  .browse-head {
    display: flex; gap: 12px; align-items: flex-start;
    justify-content: space-between;
  }
  .browse-head .ghost {
    flex-shrink: 0;
    height: 24px; padding: 0 10px;
    border: 1px solid var(--color-border); border-radius: 4px;
    background: transparent; color: var(--color-fg-muted);
    font: 10px var(--font-mono); cursor: pointer;
  }
  .browse-head .ghost:hover:not(:disabled) { color: var(--color-fg); border-color: var(--color-fg); }
  .browse-head .ghost:disabled { opacity: 0.4; cursor: wait; }

  .install-row { display: flex; gap: 8px; }
  .install-row input {
    flex: 1; height: 28px; padding: 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-fg);
    font-family: var(--font-mono); font-size: 11px;
    outline: none;
  }
  .install-row input:focus { border-color: var(--color-accent); }
  .install-row button {
    height: 28px; padding: 0 14px;
    border: 1px solid var(--color-accent);
    border-radius: 4px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    cursor: pointer;
  }
  .install-row button:disabled { opacity: 0.4; cursor: wait; }
  .file-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-top: 6px;
    font: 10px var(--font-mono); color: var(--color-fg-faint);
  }
  .file-row button {
    height: 24px; padding: 0 10px;
    border: 1px solid var(--color-border); border-radius: 4px;
    background: transparent; color: var(--color-fg-muted);
    font: 10px var(--font-mono); cursor: pointer;
  }
  .file-row button:hover:not(:disabled) { color: var(--color-fg); border-color: var(--color-fg); }
  .file-row button:disabled { opacity: 0.4; cursor: not-allowed; }

  .msg { margin-bottom: 8px; padding: 6px 10px; border-radius: 4px; font: 11px var(--font-mono); }
  .msg-err { color: rgb(248 113 113); border: 1px solid rgba(220, 38, 38, 0.4); background: rgba(127, 29, 29, 0.18); }
  .msg-ok { color: rgb(74 222 128); border: 1px solid rgba(34, 197, 94, 0.4); background: rgba(20, 83, 45, 0.18); }

  .plugin-list { list-style: none; padding: 0; margin: 8px 0 0; }
  .plugin-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-border);
    align-items: start;
  }
  .browse-icon { width: 28px; display: flex; align-items: flex-start; justify-content: center; padding-top: 2px; }
  .plugin-icon-lg { font-size: 18px; }
  .plugin-toggle {
    width: 28px; height: 16px;
    position: relative; flex-shrink: 0;
    margin-top: 2px;
  }
  .plugin-toggle input { position: absolute; opacity: 0; pointer-events: none; }
  .plugin-toggle .track {
    position: absolute; inset: 0;
    background: var(--color-border);
    border-radius: 999px;
    cursor: pointer;
    transition: background 100ms ease;
  }
  .plugin-toggle .track::after {
    content: "";
    position: absolute;
    top: 2px; left: 2px;
    width: 12px; height: 12px;
    background: white;
    border-radius: 999px;
    transition: transform 100ms ease;
  }
  .plugin-toggle input:checked ~ .track { background: var(--color-accent); }
  .plugin-toggle input:checked ~ .track::after { transform: translateX(12px); }
  .plugin-meta { font-family: var(--font-mono); font-size: 11px; min-width: 0; }
  .plugin-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .plugin-icon { font-size: 14px; }
  .plugin-name { color: var(--color-fg); font-weight: 600; }
  .plugin-version { color: var(--color-fg-faint); font-size: 10px; }
  .plugin-desc { color: var(--color-fg-muted); font-size: 11px; margin: 4px 0 0; }
  .plugin-aux { display: flex; gap: 12px; flex-wrap: wrap; color: var(--color-fg-faint); font-size: 10px; margin: 4px 0 0; }
  .plugin-url { color: var(--color-fg-faint); font-size: 10px; word-break: break-all; display: block; margin: 4px 0 0; }

  .badge {
    font-size: 9px; padding: 1px 6px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
  }
  .badge-ok    { color: rgb(74 222 128); background: rgba(20, 83, 45, 0.22); }
  .badge-update{ color: rgb(251 191 36); background: rgba(120, 53, 15, 0.28); }

  .plugin-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .plugin-actions button {
    height: 24px; padding: 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-fg-muted);
    font-family: var(--font-mono); font-size: 10px;
    cursor: pointer;
  }
  .plugin-actions button:hover:not(:disabled) { color: var(--color-fg); border-color: var(--color-fg); }
  .plugin-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
  .plugin-actions .primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-fg);
    font-weight: 600;
  }
  .plugin-actions .primary:hover:not(:disabled) {
    color: var(--color-accent-fg);
    border-color: var(--color-accent);
    filter: brightness(1.1);
  }
  .plugin-actions .danger:hover:not(:disabled) {
    color: rgb(248 113 113);
    border-color: rgba(220, 38, 38, 0.6);
  }

  .advanced {
    margin-top: 18px; padding-top: 12px;
    border-top: 1px dashed var(--color-border);
  }
  .advanced summary {
    cursor: pointer; user-select: none;
    color: var(--color-fg-muted);
    font: 600 10px var(--font-mono);
    text-transform: uppercase; letter-spacing: 0.08em;
    list-style: none;
  }
  .advanced summary::-webkit-details-marker { display: none; }
  .advanced summary::before {
    content: "▸ "; display: inline-block;
    transition: transform 100ms ease;
  }
  .advanced[open] summary::before {
    transform: rotate(90deg) translateX(2px);
  }
  .advanced summary:hover { color: var(--color-fg); }
</style>
