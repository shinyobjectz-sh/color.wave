<script>
  /**
   * Plugins Manager — Browse + Installed tabs.
   *
   * Browse: registry-fetched cards. One CTA per card (install / update /
   * up-to-date). Click a card to expand for details (description,
   * surfaces, permissions, version, author).
   *
   * Installed: enabled-toggle + name + version up front; expand for the
   * full metadata + remove/update actions.
   *
   * Custom-source install (URL / local file) is tucked into a small
   * disclosure at the bottom of Installed — most users never need it.
   */
  import { plugins } from "../lib/plugins.svelte.js";

  let { open = $bindable(false) } = $props();

  let dialogEl;
  let tab = $state(/** @type {"browse" | "installed"} */ ("browse"));
  let expanded = $state(/** @type {Record<string, boolean>} */ ({}));
  let url = $state("");
  let error = $state("");
  let success = $state("");
  let fileInputEl;

  // Auto-load registry on first open. loadRegistry caches; idempotent.
  let _autoloaded = false;
  $effect(() => {
    if (open && !_autoloaded) {
      _autoloaded = true;
      plugins.loadRegistry().catch(() => { /* surfaced via plugins.registry.error */ });
    }
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    if (!open && dialogEl.open) dialogEl.close();
  });

  function close() { open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }

  let installedById = $derived(new Map(plugins.items.map((p) => [p.id, p])));

  function flashSuccess(msg) {
    success = msg;
    setTimeout(() => { if (success === msg) success = ""; }, 2200);
  }
  function clearMsg() { error = ""; success = ""; }

  async function onInstallFromRegistry(entryId) {
    clearMsg();
    try {
      const e = await plugins.installFromRegistry(entryId);
      flashSuccess(`Installed ${e.name} v${e.version}`);
    } catch (e) { error = e?.message ?? String(e); }
  }
  async function onInstallFromUrl() {
    clearMsg();
    try {
      const e = await plugins.install(url.trim());
      flashSuccess(`Installed ${e.name}${e.version ? ` v${e.version}` : ""}`);
      url = "";
    } catch (e) { error = e?.message ?? String(e); }
  }
  async function onPickFile(ev) {
    clearMsg();
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const code = await file.text();
      const e = await plugins.installFromCode(code, { sourceLabel: file.name });
      flashSuccess(`Installed ${e.name}${e.version ? ` v${e.version}` : ""}`);
    } catch (e) { error = e?.message ?? String(e); }
  }
  async function onUpdate(id) {
    clearMsg();
    try {
      const e = await plugins.update(id);
      flashSuccess(`Updated ${e.name} → v${e.version}`);
    } catch (e) { error = e?.message ?? String(e); }
  }
  async function onToggle(id, ev) {
    await plugins.toggle(id, ev.target.checked);
  }
  async function onRemove(id) {
    if (!confirm(`Remove plugin '${id}'? Reinstall to recover.`)) return;
    await plugins.remove(id);
  }
  async function onRefreshRegistry() {
    clearMsg();
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

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="m-auto bg-surface text-fg rounded-xl border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(640px,calc(100vw-32px))] h-[min(720px,calc(100vh-64px))] p-0
         flex flex-col"
>
  <header class="flex items-center justify-between px-6 py-4">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-[15px] font-semibold leading-none m-0">Plugins</h2>
      <p class="text-[11px] text-fg-muted m-0">Extend the studio. Bytes embed in the file when shared.</p>
    </div>
    <button
      onclick={close}
      class="text-fg-muted hover:text-fg cursor-pointer text-lg leading-none bg-transparent border-0 p-1 -mr-2"
      aria-label="Close"
    >×</button>
  </header>

  <!-- Tabs -->
  <div class="flex items-center gap-1 px-5 mb-3" role="tablist">
    <button
      role="tab"
      aria-selected={tab === "browse"}
      onclick={() => tab = "browse"}
      class="text-[12px] px-3 py-1.5 rounded-md cursor-pointer bg-transparent border-0 transition-colors"
      class:text-fg={tab === "browse"}
      class:bg-bg={tab === "browse"}
      class:text-fg-muted={tab !== "browse"}
    >
      Browse
      {#if plugins.registry.status === "loaded"}
        <span class="ms-1 text-[10px] text-fg-faint">{plugins.registry.entries.length}</span>
      {/if}
    </button>
    <button
      role="tab"
      aria-selected={tab === "installed"}
      onclick={() => tab = "installed"}
      class="text-[12px] px-3 py-1.5 rounded-md cursor-pointer bg-transparent border-0 transition-colors"
      class:text-fg={tab === "installed"}
      class:bg-bg={tab === "installed"}
      class:text-fg-muted={tab !== "installed"}
    >
      Installed
      {#if plugins.items.length > 0}
        <span class="ms-1 text-[10px] text-fg-faint">{plugins.items.length}</span>
      {/if}
    </button>
    <span class="flex-1"></span>
    {#if tab === "browse"}
      <button
        type="button"
        onclick={onRefreshRegistry}
        disabled={plugins.registry.status === "loading"}
        class="text-[11px] text-fg-muted hover:text-fg cursor-pointer bg-transparent border-0 disabled:opacity-40 disabled:cursor-wait"
      >
        {plugins.registry.status === "loading" ? "loading…" : "refresh"}
      </button>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-3">
    {#if error}
      <div class="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-md px-3 py-2">{error}</div>
    {/if}
    {#if success}
      <div class="text-[11px] text-emerald-300 bg-emerald-950/30 border border-emerald-900/60 rounded-md px-3 py-2">{success}</div>
    {/if}

    {#if tab === "browse"}
      {#if plugins.registry.status === "loading" && plugins.registry.entries.length === 0}
        <p class="text-[12px] text-fg-faint text-center py-8">Loading catalog…</p>
      {:else if plugins.registry.status === "error"}
        <p class="text-[12px] text-rose-300 text-center py-4">Couldn't load registry: {plugins.registry.error}</p>
      {:else if plugins.registry.entries.length === 0}
        <p class="text-[12px] text-fg-faint text-center py-8">Registry is empty. Use the custom installer in Installed → Advanced.</p>
      {:else}
        {#each plugins.registry.entries as e (e.id)}
          {@const installed = installedById.get(e.id)}
          {@const update = installed ? plugins.getRegistryUpdate(e.id) : null}
          {@const isOpen = expanded[e.id]}
          <div class="rounded-lg border border-border">
            <div class="flex items-center gap-4 px-5 py-4">
              <button
                type="button"
                onclick={() => expanded[e.id] = !isOpen}
                class="flex-1 flex items-center gap-3 min-w-0 bg-transparent border-0 cursor-pointer text-left p-0"
              >
                {#if e.icon}<span class="text-[20px] shrink-0">{e.icon}</span>{/if}
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="text-[14px] font-medium truncate">{e.name}</span>
                  {#if e.description}
                    <p class="text-[12px] text-fg-muted m-0 truncate">{e.description}</p>
                  {/if}
                </div>
              </button>

              {#if !installed}
                <button
                  type="button"
                  onclick={() => onInstallFromRegistry(e.id)}
                  disabled={plugins.busy}
                  class="text-[12px] font-medium px-3 py-1.5 rounded-md
                         bg-accent text-accent-fg cursor-pointer border-0
                         disabled:opacity-50 disabled:cursor-wait shrink-0"
                >Install</button>
              {:else if update}
                <button
                  type="button"
                  onclick={() => onUpdate(e.id)}
                  disabled={plugins.busy}
                  title={`update from v${installed.version} to v${update.version}`}
                  class="text-[12px] font-medium px-3 py-1.5 rounded-md
                         bg-accent text-accent-fg cursor-pointer border-0
                         disabled:opacity-50 disabled:cursor-wait shrink-0"
                >Update</button>
              {:else}
                <span class="text-[11px] text-fg-faint shrink-0">Installed</span>
              {/if}
            </div>

            {#if isOpen}
              <div class="px-5 pb-4 -mt-1 flex flex-col gap-2 text-[12px] text-fg-muted">
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  <span class="text-fg-faint">v{e.latest?.version}</span>
                  {#if e.author}<span>by {e.author}</span>{/if}
                </div>
                {#if e.surfaces?.length || e.permissions?.length}
                  <div class="flex flex-col gap-1 text-[11px]">
                    {#if e.surfaces?.length}<div><span class="text-fg-faint">Surfaces:</span> {e.surfaces.join(", ")}</div>{/if}
                    {#if e.permissions?.length}<div><span class="text-fg-faint">Permissions:</span> {e.permissions.join(", ")}</div>{/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    {:else}
      <!-- Installed tab -->
      {#if plugins.items.length === 0}
        <p class="text-[12px] text-fg-faint text-center py-8">No plugins installed yet — head to Browse.</p>
      {:else}
        {#each plugins.items as p, idx (p.id)}
          {@const update = plugins.getRegistryUpdate(p.id)}
          {@const isOpen = expanded[p.id]}
          <div class="rounded-lg border border-border">
            <div class="flex items-center gap-4 px-5 py-4">
              <label class="relative shrink-0 w-9 h-5" title={p.enabled ? "enabled" : "disabled"}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onchange={(ev) => onToggle(p.id, ev)}
                  class="absolute opacity-0 pointer-events-none"
                />
                <span class="absolute inset-0 rounded-full transition-colors cursor-pointer"
                      class:bg-border={!p.enabled}
                      class:bg-accent={p.enabled}>
                </span>
                <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      class:translate-x-4={p.enabled}>
                </span>
              </label>

              <button
                type="button"
                onclick={() => expanded[p.id] = !isOpen}
                class="flex-1 flex items-center gap-3 min-w-0 bg-transparent border-0 cursor-pointer text-left p-0"
              >
                {#if p.icon}<span class="text-[18px] shrink-0">{p.icon}</span>{/if}
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <span class="text-[14px] font-medium truncate">{p.name}</span>
                    {#if update}<span class="text-[10px] text-amber-300">update available</span>{/if}
                  </div>
                  {#if p.description}<p class="text-[12px] text-fg-muted m-0 truncate">{p.description}</p>{/if}
                </div>
              </button>

              <div class="flex items-center gap-1 shrink-0">
                {#if idx > 0}
                  <button
                    type="button"
                    onclick={() => plugins.move(p.id, -1)}
                    disabled={plugins.busy}
                    aria-label="Move up"
                    title="Move up"
                    class="text-[10px] text-fg-muted hover:text-fg cursor-pointer bg-transparent border-0 px-1 py-1"
                  >▲</button>
                {/if}
                {#if idx < plugins.items.length - 1}
                  <button
                    type="button"
                    onclick={() => plugins.move(p.id, +1)}
                    disabled={plugins.busy}
                    aria-label="Move down"
                    title="Move down"
                    class="text-[10px] text-fg-muted hover:text-fg cursor-pointer bg-transparent border-0 px-1 py-1"
                  >▼</button>
                {/if}
              </div>
            </div>

            {#if isOpen}
              <div class="px-5 pb-4 -mt-1 flex flex-col gap-3 text-[12px] text-fg-muted">
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  {#if p.version}<span class="text-fg-faint">v{p.version}</span>{/if}
                  <span title={`installed ${fmtAge(p.installedAt)}`}>updated {fmtAge(p.updatedAt)}</span>
                </div>
                {#if p.surfaces?.length || p.permissions?.length}
                  <div class="flex flex-col gap-1 text-[11px]">
                    {#if p.surfaces?.length}<div><span class="text-fg-faint">Surfaces:</span> {p.surfaces.join(", ")}</div>{/if}
                    {#if p.permissions?.length}<div><span class="text-fg-faint">Permissions:</span> {p.permissions.join(", ")}</div>{/if}
                  </div>
                {/if}
                {#if p.source?.url}
                  <code class="text-[10px] text-fg-faint break-all">{p.source.url}</code>
                {/if}
                <div class="flex gap-2 pt-1">
                  <button
                    type="button"
                    onclick={() => onUpdate(p.id)}
                    disabled={plugins.busy || !p.source?.url}
                    title="Re-fetch source URL and replace embedded bytes"
                    class="text-[11px] px-3 py-1.5 rounded-md border border-border text-fg-muted hover:text-fg hover:border-fg cursor-pointer bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
                  >Update</button>
                  <button
                    type="button"
                    onclick={() => onRemove(p.id)}
                    class="text-[11px] px-3 py-1.5 rounded-md border border-border text-fg-muted hover:text-rose-300 hover:border-rose-900 cursor-pointer bg-transparent"
                  >Remove</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}

      <details class="mt-2 pt-3 border-t border-dashed border-border">
        <summary class="text-[11px] text-fg-muted hover:text-fg cursor-pointer select-none">Advanced — install from URL or file</summary>
        <div class="flex flex-col gap-2 mt-3">
          <div class="flex items-center gap-2">
            <input
              type="url"
              placeholder="https://raw.githubusercontent.com/.../plugin.js"
              bind:value={url}
              onkeydown={(e) => e.key === "Enter" && onInstallFromUrl()}
              disabled={plugins.busy}
              class="flex-1 font-mono text-[11px] px-3 py-2 bg-bg border border-border rounded-md text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onclick={onInstallFromUrl}
              disabled={plugins.busy || !url.trim()}
              class="text-[11px] font-medium px-3 py-2 rounded-md bg-accent text-accent-fg cursor-pointer border-0 disabled:opacity-40 disabled:cursor-wait"
            >{plugins.busy ? "Installing…" : "Install"}</button>
          </div>
          <div class="flex items-center justify-between text-[11px] text-fg-faint">
            <span>or pick a local file:</span>
            <input
              type="file"
              accept=".js,.mjs,application/javascript,text/javascript"
              bind:this={fileInputEl}
              onchange={onPickFile}
              class="hidden"
            />
            <button
              type="button"
              onclick={() => fileInputEl?.click()}
              disabled={plugins.busy}
              class="text-[11px] px-3 py-1.5 rounded-md border border-border text-fg-muted hover:text-fg hover:border-fg cursor-pointer bg-transparent disabled:opacity-40"
            >Choose file…</button>
          </div>
        </div>
      </details>
    {/if}
  </div>
</dialog>
