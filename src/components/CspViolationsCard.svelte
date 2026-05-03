<script>
  // Floating, dismissible diagnostics card for CSP violations.
  // Mounts only when there's something to show (otherwise it's a
  // zero-DOM no-op). Lives at the App.svelte root.
  import { cspMonitor } from "../lib/cspMonitor.svelte.js";

  let copied = $state(false);
  let collapsed = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cspMonitor.formatForClipboard());
      copied = true;
      setTimeout(() => { copied = false; }, 1600);
    } catch {
      // Clipboard API can fail in non-secure contexts. Fallback:
      // textarea + execCommand. Worst case the user reads the panel.
      const ta = document.createElement("textarea");
      ta.value = cspMonitor.formatForClipboard();
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); copied = true; setTimeout(() => { copied = false; }, 1600); } catch {}
      ta.remove();
    }
  }

  function shortURI(uri) {
    if (!uri) return "(inline)";
    if (uri.length <= 64) return uri;
    return uri.slice(0, 30) + "…" + uri.slice(-30);
  }
</script>

{#if cspMonitor.violations.length > 0}
  <div class="card" role="alert" aria-live="polite">
    <div class="head">
      <span class="dot" aria-hidden="true"></span>
      <span class="title">
        Content-Security-Policy blocked {cspMonitor.violations.length}
        {cspMonitor.violations.length === 1 ? "request" : "requests"}
      </span>
      <button class="ghost" onclick={() => collapsed = !collapsed}>
        {collapsed ? "expand" : "collapse"}
      </button>
      <button class="ghost" onclick={() => cspMonitor.dismissAll()}>dismiss</button>
    </div>

    {#if !collapsed}
      <p class="hint">
        The workbook runtime restricts network access by design. Bundle the
        dependency at build time or route through the daemon proxy.
      </p>

      <ul>
        {#each cspMonitor.violations as v (v.directive + v.blockedURI)}
          <li>
            <code class="dir">{v.directive}</code>
            <span class="arrow">→</span>
            <code class="uri" title={v.blockedURI}>{shortURI(v.blockedURI)}</code>
            {#if v.count > 1}
              <span class="count">×{v.count}</span>
            {/if}
            <button
              class="ghost dismiss-one"
              aria-label="Dismiss this violation"
              onclick={() => cspMonitor.dismiss(v.directive, v.blockedURI)}
            >×</button>
          </li>
        {/each}
      </ul>

      <div class="actions">
        <button class="primary" onclick={copy}>
          {copied ? "copied ✓" : "copy report"}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 9999;
    max-width: 480px;
    min-width: 320px;
    background: #18181b;
    color: #fafafa;
    border: 1px solid #3f3f46;
    border-radius: 10px;
    padding: 10px 12px 12px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 999px;
    background: #f43f5e;
    box-shadow: 0 0 0 3px rgba(244,63,94,0.18);
    flex: 0 0 auto;
  }
  .title { font-weight: 600; flex: 1; }
  .hint {
    margin: 6px 0 8px;
    color: #a1a1aa;
    font-size: 11px;
  }
  ul { margin: 0; padding: 0; list-style: none; max-height: 280px; overflow: auto; }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-top: 1px dashed #3f3f46;
  }
  li:first-child { border-top: 0; }
  code {
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 11px;
  }
  .dir { color: #d4d4d8; }
  .uri { color: #fca5a5; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrow { color: #71717a; }
  .count {
    background: #3f3f46;
    color: #d4d4d8;
    border-radius: 999px;
    padding: 1px 7px;
    font-size: 10px;
  }
  .actions { display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end; }
  button {
    background: transparent;
    color: #d4d4d8;
    border: 1px solid #3f3f46;
    border-radius: 6px;
    padding: 4px 10px;
    font: inherit;
    cursor: pointer;
  }
  button:hover { background: #27272a; }
  .primary {
    background: #fafafa;
    color: #09090b;
    border-color: #fafafa;
  }
  .primary:hover { background: #e4e4e7; border-color: #e4e4e7; }
  .ghost { font-size: 11px; padding: 2px 8px; }
  .dismiss-one { padding: 0 6px; line-height: 1; font-size: 14px; }
</style>
