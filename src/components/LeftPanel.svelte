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

  // Vertical icon rail on the left edge of the left panel.
  // Built-in panels stay mounted; inactives are CSS-hidden so chat
  // streaming, asset lists, MCP form values, and history cursors
  // survive a swap. Plugin-registered tabs (panelTabs) only mount
  // when active — they opt in to background-survival themselves.

  const mcpMode = isMcpMode();
</script>

<section class="flex min-h-0 flex-1">
  <!-- Vertical icon rail. Width fixed to 40px so icons stay
       square at 32px with even side padding. -->
  <nav class="lp-rail" aria-label="Left panel">
    {#if !mcpMode}
      <button
        onclick={() => layout.setLeftTab("chat")}
        class="lp-tab"
        class:active={layout.leftTab === "chat"}
        aria-pressed={layout.leftTab === "chat"}
        aria-label="Chat with the agent"
        title="Chat with the agent"
      >
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 3.5h10v6H8l-2.5 2v-2H2z"/>
        </svg>
        {#if agent.busy}<span class="lp-dot" aria-label="agent busy"></span>{/if}
      </button>
    {/if}
    <button
      onclick={() => layout.setLeftTab("assets")}
      class="lp-tab"
      class:active={layout.leftTab === "assets"}
      aria-pressed={layout.leftTab === "assets"}
      aria-label="Asset library"
      title="Asset library"
    >
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 2 H8 L9.5 4 H12 V11.5 H2 Z"/>
      </svg>
      {#if assets.items.length > 0}
        <span class="lp-count">{assets.items.length}</span>
      {/if}
    </button>
    <button
      onclick={() => layout.setLeftTab("plugins")}
      class="lp-tab"
      class:active={layout.leftTab === "plugins"}
      aria-pressed={layout.leftTab === "plugins"}
      aria-label="Installed plugins — inline UIs"
      title="Installed plugins"
    >
      <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.5" y="2.5" width="4" height="4" rx="0.5"/>
        <rect x="7.5" y="2.5" width="4" height="4" rx="0.5"/>
        <rect x="2.5" y="7.5" width="4" height="4" rx="0.5"/>
        <path d="M7.5 9.5h4M9.5 7.5v4"/>
      </svg>
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
        aria-label={tab.label}
        title={tab.label}
      >
        {#if tab.icon}
          <span class="lp-plugin-icon">{tab.icon}</span>
        {:else}
          <!-- Fallback glyph: first letter of the label, uppercase. -->
          <span class="lp-plugin-letter">{(tab.label ?? "?").trim().charAt(0).toUpperCase() || "?"}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Active panel column. min-w-0 so the panel can shrink past
       its content's natural width when the chat column is dragged. -->
  <div class="flex-1 flex flex-col min-w-0 min-h-0">
    <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "chat"}>
      <ChatPanel />
    </div>
    <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "assets"}>
      <AssetsPanel />
    </div>
    <div class="flex-1 flex flex-col min-h-0" class:hidden={layout.leftTab !== "plugins"}>
      <PluginsPanel />
    </div>
    {#each panelTabs as tab (tab.pluginId + ":" + tab.id)}
      {#if layout.leftTab === `plugin:${tab.id}`}
        <div class="flex-1 flex flex-col min-h-0">
          <tab.component />
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .hidden { display: none !important; }

  .lp-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 40px;
    flex-shrink: 0;
    padding: 6px 0;
    background: var(--color-page);
    border-right: 1px solid var(--color-border);
  }

  .lp-tab {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    color: var(--color-fg-muted);
    transition: color 120ms ease, background-color 120ms ease;
  }
  .lp-tab:hover {
    color: var(--color-fg);
    background: color-mix(in srgb, var(--color-fg) 6%, transparent);
  }
  .lp-tab.active {
    color: var(--color-fg);
    background: color-mix(in srgb, var(--color-fg) 10%, transparent);
  }
  /* Active indicator — small accent bar on the left edge. */
  .lp-tab.active::before {
    content: "";
    position: absolute;
    top: 50%;
    left: -6px;
    transform: translateY(-50%);
    width: 2px;
    height: 16px;
    border-radius: 2px;
    background: var(--color-accent);
  }

  .lp-plugin-icon {
    font-size: 16px;
    line-height: 1;
  }
  .lp-plugin-letter {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  }

  /* Counts / busy dot ride as small badges on the icon's
   * upper-right corner. */
  .lp-count {
    position: absolute;
    top: 2px; right: 2px;
    min-width: 13px; height: 13px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    font-feature-settings: "tnum";
    font-size: 9px; line-height: 13px;
    font-family: var(--font-mono);
    text-align: center;
  }
  .lp-dot {
    position: absolute;
    top: 4px; right: 4px;
    width: 6px; height: 6px; border-radius: 999px;
    background: var(--color-accent);
    animation: lp-pulse 1.2s ease-in-out infinite;
  }
  @keyframes lp-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }
</style>
