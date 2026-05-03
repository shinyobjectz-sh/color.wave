<script>
  /**
   * Agent Manager — Manage → Agents.
   *
   * Lists ACP-compatible agents the user has installed locally
   * (Anthropic Claude Code, OpenAI Codex). Shows whether each is
   * detected on PATH and whether the user is signed in. A "Test
   * connection" button opens a real WebSocket to the daemon, has
   * the daemon spawn the adapter, sends ACP `initialize`, and
   * surfaces the response — protocol version, agent name+version,
   * advertised capabilities, and the auth-methods array (empty =
   * subscription is active).
   *
   * Phase 1 is diagnostic only — wiring the agent into the chat
   * thread (replacing colorwave's built-in agent loop with the
   * external ACP one) is Phase 2.
   */
  import { onMount } from "svelte";
  import { listAdapters, connect, AcpError } from "@work.books/runtime/agent-acp";
  import { iconUrl } from "@work.books/runtime/storage";
  import Scrollbox from "./Scrollbox.svelte";
  import { agent } from "../lib/agent.svelte.js";
  import { env, MODEL_PRESETS } from "../lib/env.svelte.js";

  // OpenRouter key + model now live inside this manager — the
  // Workbooks-built-in row is the only thing that uses them, so
  // co-locating with the agent that consumes them is clearer than
  // a separate Settings modal. The legacy SettingsModal entry has
  // been removed; the gear button on the Workbooks-built-in row
  // exposes the same controls.
  let revealOpenRouterKey = $state(false);
  function openOpenRouterKeysPage() {
    window.open("https://openrouter.ai/keys", "_blank", "noopener,noreferrer");
  }

  let { open = $bindable(false) } = $props();

  /** Synthetic "Native" entry — colorwave's built-in agent loop.
   *  Same shape as a real ACP adapter so the UI can render it
   *  uniformly. Marked recommended/default; clicking "Use" sets
   *  agent.provider = "builtin". */
  const NATIVE_ENTRY = {
    id: "native",
    name: "Workbooks (built-in)",
    cliInstalled: true,
    cliVersion: "default",
    authPresent: true,
    npxAvailable: true,
    spawnCommand: [],
    hint: null,
    isNative: true,
    providerKey: "builtin",
    iconKey: "native",
  };

  /** Adapter id → daemon-served icon key. We could derive from a
   *  registry, but explicit mapping is fine for the small set we
   *  ship today. */
  const ICON_KEY = { claude: "claude", codex: "codex" };

  let dialogEl;
  let adapters = $state(/** @type {Array<any>} */ ([]));
  let testing = $state(/** @type {Record<string, boolean>} */ ({}));
  /** Per-adapter result of last "Test connection" — null if untested,
   *  { ok: true, info } on success, { ok: false, error } on failure. */
  let testResults = $state(/** @type {Record<string, any>} */ ({}));
  let listError = $state("");
  let busy = $state(false);

  async function refresh() {
    busy = true;
    listError = "";
    try {
      const acp = await listAdapters();
      // Native always first (recommended default), then ACP
      // adapters in the order the daemon returned them.
      adapters = [NATIVE_ENTRY, ...acp.map((a) => ({
        ...a,
        isNative: false,
        providerKey: a.id,            // "claude" / "codex"
        iconKey: ICON_KEY[a.id] ?? null,
      }))];
    } catch (e) {
      listError = e?.message ?? String(e);
    }
    busy = false;
  }

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      refresh();
    }
    if (!open && dialogEl.open) dialogEl.close();
  });

  function close() { open = false; }
  function onKeydown(e) { if (e.key === "Escape") close(); }

  async function testAdapter(adapter) {
    if (testing[adapter.id]) return;
    testing[adapter.id] = true;
    testResults[adapter.id] = null;
    try {
      const session = await connect({ adapter: adapter.id });
      const init = await Promise.race([
        session.initialize(),
        new Promise((_r, reject) =>
          setTimeout(() => reject(new AcpError("initialize timed out (30s) — adapter may be cold-fetching from npm")), 30_000),
        ),
      ]);
      testResults[adapter.id] = { ok: true, info: init };
      session.close();
    } catch (e) {
      testResults[adapter.id] = { ok: false, error: e?.message ?? String(e) };
    }
    testing[adapter.id] = false;
  }
</script>

<dialog
  bind:this={dialogEl}
  onclose={close}
  onkeydown={onKeydown}
  class="m-auto bg-surface text-fg rounded-xl border border-border shadow-2xl
         backdrop:bg-black/60 backdrop:backdrop-blur-sm
         w-[min(680px,calc(100vw-32px))] h-[min(680px,calc(100vh-64px))] p-0"
>
 <div class="flex flex-col h-full">
  <header class="flex items-center justify-between px-6 py-4">
    <div class="flex flex-col gap-0.5">
      <h2 class="text-[15px] font-semibold leading-none m-0">Agents</h2>
      <p class="text-[11px] text-fg-muted m-0">Use your Claude Code or Codex CLI subscription to run the workbook agent.</p>
    </div>
    <div class="flex items-center gap-3">
      <button
        type="button"
        onclick={refresh}
        disabled={busy}
        class="text-[11px] text-fg-muted hover:text-fg cursor-pointer bg-transparent border-0 disabled:opacity-40 disabled:cursor-wait"
      >{busy ? "loading…" : "refresh"}</button>
      <button
        onclick={close}
        class="text-fg-muted hover:text-fg cursor-pointer text-lg leading-none bg-transparent border-0 p-1 -mr-2"
        aria-label="Close"
      >×</button>
    </div>
  </header>

  <Scrollbox class="flex-1">
    <div class="px-6 pb-6 flex flex-col gap-3">
      {#if listError}
        <div class="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-md px-3 py-2">{listError}</div>
      {/if}

      {#if adapters.length === 0 && !busy && !listError}
        <p class="text-[12px] text-fg-faint text-center py-8">No ACP adapters detected. The Workbooks daemon expects <code class="font-mono">claude</code> or <code class="font-mono">codex</code> on PATH.</p>
      {/if}

      {#each adapters as a (a.id)}
        {@const result = testResults[a.id]}
        {@const ready = a.cliInstalled && a.authPresent && a.npxAvailable}
        {@const isActive = agent.provider === a.providerKey}
        <div class="rounded-lg border"
             class:border-border={!ready && !isActive}
             class:border-accent={ready || isActive}>
          <div class="flex items-center gap-4 px-5 py-4">
            {#if a.iconKey}
              {@const src = iconUrl(a.iconKey)}
              {#if src}
                {#if a.iconKey === "claude"}
                  <!-- Claude is a colored brand mark (Anthropic orange);
                       keep it as an image so its color survives. -->
                  <img src={src} alt="" class="w-7 h-7 shrink-0 object-contain opacity-90" />
                {:else}
                  <!-- Native / codex are monochrome marks. We CSS-mask
                       them and tint via currentColor so the same SVG
                       works on both light and dark themes — no need
                       to ship two files or sniff prefers-color-scheme. -->
                  <span
                    class="icon-mono w-7 h-7 shrink-0 text-fg/90"
                    style="--icon-src: url('{src}')"
                    aria-hidden="true"
                  ></span>
                {/if}
              {/if}
            {/if}
            <div class="flex-1 flex flex-col gap-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-[14px] font-medium">{a.name}</span>
                {#if a.isNative}
                  <span class="text-[10px] text-fg-muted font-mono">recommended</span>
                {:else if ready}
                  <span class="text-[10px] text-accent font-mono">ready</span>
                {:else}
                  <span class="text-[10px] text-fg-faint font-mono">not ready</span>
                {/if}
                {#if !a.isNative && a.cliVersion}
                  <span class="text-[10px] text-fg-faint font-mono">{a.cliVersion}</span>
                {/if}
              </div>
              {#if a.isNative}
                <div class="text-[11px] text-fg-muted">
                  Built into the workbook. Routes through OpenRouter — set your key + model below.
                </div>
              {:else}
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
                  <span>cli {a.cliInstalled ? "✓" : "✗"}</span>
                  <span>signed in {a.authPresent ? "✓" : "✗"}</span>
                  <span>npx {a.npxAvailable ? "✓" : "✗"}</span>
                </div>
              {/if}
            </div>

            {#if ready}
              <button
                type="button"
                onclick={() => agent.setProvider(isActive ? "builtin" : a.providerKey)}
                class="text-[11px] px-3 py-1.5 rounded-md cursor-pointer border shrink-0"
                class:bg-accent={isActive}
                class:text-accent-fg={isActive}
                class:border-accent={isActive}
                class:bg-transparent={!isActive}
                class:text-fg-muted={!isActive}
                class:border-border={!isActive}
                title={isActive
                  ? `Currently active. Click to switch.`
                  : `Use ${a.name} as the chat agent for this workbook.`}
              >{isActive ? "✓ active" : "Use"}</button>
              {#if !a.isNative}
                <button
                  type="button"
                  onclick={() => testAdapter(a)}
                  disabled={!!testing[a.id]}
                  class="text-[11px] px-3 py-1.5 rounded-md text-fg-muted hover:text-fg cursor-pointer bg-transparent border border-border disabled:opacity-50 disabled:cursor-wait shrink-0"
                  title="Open a session and run ACP `initialize` to verify the connection."
                >{testing[a.id] ? "testing…" : "Test"}</button>
              {/if}
            {/if}
          </div>

          {#if a.hint}
            <p class="text-[11px] text-amber-200 bg-amber-950/20 border-t border-amber-900/40 px-5 py-3 m-0">
              {a.hint}
            </p>
          {/if}

          {#if a.isNative}
            <!-- OpenRouter config — only visible on the built-in
                 Workbooks Agent row. Used to live in a separate
                 SettingsModal; consolidated here so the agent picker
                 + the agent's auth + model live in one place. -->
            <div class="border-t border-border px-5 py-4 flex flex-col gap-4">
              <!-- Connected status pill -->
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-mono"
                      class:text-accent={env.satisfied}
                      class:text-fg-faint={!env.satisfied}>
                  {env.satisfied ? "● connected" : "○ no key"}
                </span>
                <span class="text-[11px] text-fg-muted">
                  {env.satisfied
                    ? "OpenRouter key is set; this agent is ready to chat."
                    : "Add your OpenRouter API key to enable the built-in agent."}
                </span>
              </div>

              <!-- API key -->
              <div class="flex flex-col gap-1.5">
                <label for="am-or-key" class="block font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                  openrouter api key
                </label>
                <div class="flex gap-2">
                  <input
                    id="am-or-key"
                    type={revealOpenRouterKey ? "text" : "password"}
                    placeholder="sk-or-…"
                    autocomplete="off"
                    spellcheck="false"
                    value={env.values.OPENROUTER_API_KEY ?? ""}
                    oninput={(e) => env.set("OPENROUTER_API_KEY", e.currentTarget.value)}
                    class="flex-1 bg-page border border-border rounded px-3 py-2 font-mono text-[12px] text-fg
                           focus:outline-1 focus:outline-accent focus:border-accent"
                  />
                  <button
                    type="button"
                    onclick={() => revealOpenRouterKey = !revealOpenRouterKey}
                    class="px-3 rounded border border-border bg-page text-fg-muted hover:text-fg hover:border-border-2 cursor-pointer font-mono text-[11px]"
                    title={revealOpenRouterKey ? "Hide" : "Show"}
                  >{revealOpenRouterKey ? "hide" : "show"}</button>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onclick={openOpenRouterKeysPage}
                    class="font-mono text-[11px] text-fg-muted hover:text-fg cursor-pointer underline underline-offset-2 bg-transparent border-0 p-0"
                  >Open openrouter.ai/keys ↗</button>
                  <span class="font-mono text-[10px] text-fg-faint">
                    Stored locally · sent only to OpenRouter.
                  </span>
                </div>
              </div>

              <!-- Model -->
              <div class="flex flex-col gap-1.5">
                <label for="am-model" class="block font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                  model
                </label>
                <input
                  id="am-model"
                  type="text"
                  list="am-model-presets"
                  placeholder="anthropic/claude-haiku-4.5"
                  spellcheck="false"
                  autocomplete="off"
                  value={env.model}
                  oninput={(e) => env.setModel(e.currentTarget.value)}
                  class="w-full bg-page border border-border rounded px-3 py-2 font-mono text-[12px] text-fg
                         focus:outline-1 focus:outline-accent focus:border-accent"
                />
                <datalist id="am-model-presets">
                  {#each MODEL_PRESETS as m}
                    <option value={m.id}>{m.label}</option>
                  {/each}
                </datalist>
                <span class="font-mono text-[10px] text-fg-faint">
                  Any OpenRouter model id works · see openrouter.ai/models for the full list.
                </span>
              </div>
            </div>
          {/if}

          {#if result && result.ok}
            {@const info = result.info}
            <div class="border-t border-border px-5 py-3 flex flex-col gap-2 text-[11px]">
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <span><span class="text-fg-faint">agent:</span> <code class="font-mono text-fg">{info.agentInfo?.name} v{info.agentInfo?.version}</code></span>
                <span><span class="text-fg-faint">protocol:</span> <code class="font-mono text-fg">v{info.protocolVersion}</code></span>
              </div>
              <div>
                <span class="text-fg-faint">auth methods:</span>
                {#if !info.authMethods || info.authMethods.length === 0}
                  <span class="text-emerald-300 font-mono">[]</span>
                  <span class="text-fg-muted">— signed in via subscription, no API key needed</span>
                {:else}
                  <span class="font-mono">{info.authMethods.map((m) => m.id ?? m.name).join(", ")}</span>
                {/if}
              </div>
              {#if info.agentCapabilities}
                <details class="text-fg-muted">
                  <summary class="cursor-pointer hover:text-fg">capabilities</summary>
                  <pre class="font-mono text-[10px] text-fg-muted mt-1 overflow-x-auto">{JSON.stringify(info.agentCapabilities, null, 2)}</pre>
                </details>
              {/if}
            </div>
          {:else if result && !result.ok}
            <div class="border-t border-rose-900/40 bg-rose-950/20 px-5 py-3 text-[11px] text-rose-300">
              {result.error}
            </div>
          {/if}
        </div>
      {/each}

      <p class="text-[11px] text-fg-faint mt-2 leading-relaxed">
        Workbooks spawns the official ACP adapter shim
        (<code class="font-mono">@agentclientprotocol/claude-agent-acp</code>
        / <code class="font-mono">@zed-industries/codex-acp</code>)
        as a subprocess of the daemon. Your CLI's existing login session
        in <code class="font-mono">~/.claude</code> /
        <code class="font-mono">~/.codex</code> is what authenticates,
        so usage bills against your subscription — not against an API key.
      </p>
    </div>
  </Scrollbox>
 </div>
</dialog>

<style>
  /* Monochrome icon — pure-shape SVG masked by currentColor so the
   * same asset renders correctly on light and dark themes. The SVG
   * itself can be any opaque fill (mask uses alpha, not color). */
  .icon-mono {
    display: inline-block;
    background-color: currentColor;
    mask: var(--icon-src) center / contain no-repeat;
    -webkit-mask: var(--icon-src) center / contain no-repeat;
  }
</style>
