<script>
  import ChatPanel from "./ChatPanel.svelte";
  import AssetsPanel from "./AssetsPanel.svelte";
  import PluginsPanel from "./PluginsPanel.svelte";
  import { plugins } from "../lib/plugins.svelte.js";
  import { layout } from "../lib/layout.svelte.js";
  import { assets } from "../lib/assets.svelte.js";
  import { agent } from "../lib/agent.svelte.js";
  import { isMcpMode } from "../lib/mcpBridge.svelte.js";
  import { panelTabs } from "../lib/pluginApi.svelte.js";

  // Tab bar lives at the top of the left panel itself (Phase A.1
  // restructure). Built-in panels stay mounted; inactive ones are
  // CSS-hidden so chat streaming, asset lists, MCP form values,
  // and history cursors survive a swap.
  // Plugin-registered tabs (panelTabs) are appended after built-ins
  // and only mounted when active (plugins don't get the same
  // background-tick guarantee — they opt in by handling visibility
  // changes themselves).

  const mcpMode = isMcpMode();
</script>

<section class="flex flex-col min-h-0 flex-1">
  <!-- In-panel tab bar — primary navigation for whatever the user
       is currently doing in the left column. -->
  <nav class="flex items-center border-b border-border bg-page" aria-label="Left panel">
    {#if !mcpMode}
      <button
        onclick={() => layout.setLeftTab("chat")}
        class="lp-tab"
        class:active={layout.leftTab === "chat"}
        aria-pressed={layout.leftTab === "chat"}
        title="Chat with the agent"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3.5h10v6H8l-2.5 2v-2H2z"/>
        </svg>
        <span>chat</span>
        {#if agent.busy}<span class="lp-dot" aria-label="agent busy"></span>{/if}
      </button>
    {/if}
    <button
      onclick={() => layout.setLeftTab("assets")}
      class="lp-tab"
      class:active={layout.leftTab === "assets"}
      aria-pressed={layout.leftTab === "assets"}
      title="Asset library"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 2 H8 L9.5 4 H12 V11.5 H2 Z"/>
      </svg>
      <span>assets</span>
      {#if assets.items.length > 0}
        <span class="lp-count">{assets.items.length}</span>
      {/if}
    </button>
    <button
      onclick={() => layout.setLeftTab("plugins")}
      class="lp-tab"
      class:active={layout.leftTab === "plugins"}
      aria-pressed={layout.leftTab === "plugins"}
      title="Installed plugins — inline UIs"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.5" y="2.5" width="4" height="4" rx="0.5"/>
        <rect x="7.5" y="2.5" width="4" height="4" rx="0.5"/>
        <rect x="2.5" y="7.5" width="4" height="4" rx="0.5"/>
        <path d="M7.5 9.5h4M9.5 7.5v4"/>
      </svg>
      <span>plugins</span>
      {#if plugins.items.length > 0}
        <span class="lp-count">{plugins.items.length}</span>
      {/if}
    </button>
    {#each panelTabs as tab (tab.pluginId + ":" + tab.id)}
      <button
        onclick={() => layout.setLeftTab(`plugin:${tab.id}`)}
        class="lp-tab"
        class:active={layout.leftTab === `plugin:${tab.id}`}
        aria-pressed={layout.leftTab === `plugin:${tab.id}`}
        title={tab.label}
      >
        {#if tab.icon}<span>{tab.icon}</span>{/if}
        <span>{tab.label}</span>
      </button>
    {/each}
  </nav>

  <!-- Active panel. All four stay mounted; inactives are display:none. -->
  <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "chat"}>
    <ChatPanel />
  </div>
  <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "assets"}>
    <AssetsPanel />
  </div>
  <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "plugins"}>
    <PluginsPanel />
  </div>
  <!-- Plugin-registered tabs render lazily — only the active one
       mounts. Plugins decide their own state-survival strategy. -->
  {#each panelTabs as tab (tab.pluginId + ":" + tab.id)}
    {#if layout.leftTab === `plugin:${tab.id}`}
      <div class="flex-1 flex flex-col min-h-0">
        <tab.component />
      </div>
    {/if}
  {/each}
</section>

<style>
  .hidden { display: none !important; }

  .lp-tab {
    display: inline-flex; align-items: center; gap: 6px;
    height: 32px;
    padding: 0 12px;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-fg-muted);
    transition: color 120ms ease, border-color 120ms ease;
    white-space: nowrap;
    margin-bottom: -1px;
  }
  .lp-tab:hover { color: var(--color-fg); }
  .lp-tab.active {
    color: var(--color-fg);
    border-bottom-color: var(--color-accent);
  }
  .lp-count {
    display: inline-block;
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-accent) 22%, transparent);
    color: var(--color-accent);
    font-feature-settings: "tnum";
    font-size: 10px;
  }
  .lp-dot {
    width: 6px; height: 6px; border-radius: 999px;
    background: var(--color-accent);
    animation: lp-pulse 1.2s ease-in-out infinite;
  }
  @keyframes lp-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }
</style>
