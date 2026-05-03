<script>
  /**
   * Right-side panel of the history modal — shows the selected
   * commit's full metadata and the actions you can take from it.
   * Stays in sync with HistoryCanvas via the parent's selectedHash
   * binding, so clicking a node here lights up the detail and
   * vice-versa with no prop ping-pong.
   */
  import { setCursor, readCommit } from "../lib/historyBackend.svelte.js";
  import { composition } from "../lib/composition.svelte.js";

  let { entry, currentHash, cursorHash } = $props();

  let busy = $state(false);
  let error = $state("");

  let isCurrent = $derived(entry?.hash === currentHash);
  let isHead = $derived(!cursorHash && isCurrent);

  function classifyEntry(e) {
    const msg = e?.message ?? "";
    if (msg.startsWith("revert to ")) return "revert";
    if (msg.startsWith("composition")) return "composition";
    if (msg.startsWith("add asset") || msg.startsWith("remove asset")) return "asset";
    if (/turn \(/.test(msg)) return "turn";
    if (msg === "hyperframes session start") return "init";
    return "other";
  }

  function fmtAbsolute(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "";
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  async function jumpHere() {
    if (!entry || busy) return;
    busy = true;
    error = "";
    try {
      const snapshot = await readCommit(entry.hash);
      const html = snapshot?.["composition"];
      if (typeof html !== "string") {
        error = "no composition recorded at this commit";
        return;
      }
      composition.set(html, undefined, { suppressAudit: true });
      setCursor(entry.hash);
    } catch (e) {
      error = e?.message ?? String(e);
    } finally {
      busy = false;
    }
  }

  async function releaseToHead() {
    setCursor(null);
  }
</script>

<aside class="detail">
  {#if !entry}
    <div class="placeholder">
      <div class="hint">Select a commit on the graph to inspect it.</div>
      <ul class="legend">
        <li><span class="dot kind-composition"></span>composition</li>
        <li><span class="dot kind-asset"></span>asset</li>
        <li><span class="dot kind-turn"></span>agent turn</li>
        <li><span class="dot kind-revert"></span>revert</li>
        <li><span class="dot kind-init"></span>init</li>
        <li><span class="dot kind-other"></span>other</li>
      </ul>
      <div class="hint sub">Double-click a node to jump the playhead there.</div>
    </div>
  {:else}
    {@const kind = classifyEntry(entry)}
    <header class="hd">
      <div class="row">
        <span class="dot kind-{kind}" aria-hidden="true"></span>
        <span class="kind">{kind}</span>
        {#if isCurrent}
          <span class="badge cur">{isHead ? "head" : "cursor"}</span>
        {/if}
      </div>
      <code class="hash" title={entry.hash}>{entry.hash}</code>
    </header>

    <dl class="kv">
      <dt>at</dt>
      <dd>{fmtAbsolute(entry.timestamp_ms)}</dd>
      {#if entry.parent}
        <dt>parent</dt>
        <dd><code>{entry.parent.slice(0, 12)}…</code></dd>
      {/if}
      {#if entry.key}
        <dt>key</dt>
        <dd><code>{entry.key}</code></dd>
      {/if}
    </dl>

    <section class="msg">
      <div class="msg-h">message</div>
      <div class="msg-body">{entry.message || "(no message)"}</div>
    </section>

    <footer class="actions">
      {#if isCurrent}
        <button class="btn ghost" disabled>you are here</button>
      {:else}
        <button class="btn primary" onclick={jumpHere} disabled={busy}>
          {busy ? "jumping…" : "jump playhead here"}
        </button>
      {/if}
      {#if cursorHash}
        <button class="btn ghost" onclick={releaseToHead} title="Return to the newest commit (HEAD)">
          ↥ release to latest
        </button>
      {/if}
    </footer>

    {#if error}
      <div class="err">{error}</div>
    {/if}
  {/if}
</aside>

<style>
  .detail {
    display: flex; flex-direction: column;
    gap: 16px;
    padding: 18px 18px;
    height: 100%;
    overflow-y: auto;
    background: var(--color-surface-1, #0e0e0e);
    border-left: 1px solid var(--color-hairline, #1f1f1f);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
    color: var(--color-fg, #e5e5e5);
  }

  .placeholder { display: flex; flex-direction: column; gap: 16px; }
  .hint {
    color: var(--color-fg-faint, #666);
    font-size: 11px;
    line-height: 1.55;
  }
  .hint.sub { font-size: 10.5px; opacity: 0.85; }

  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .legend li { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--color-fg-muted, #888); }

  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .dot.kind-init        { background: #facc15; }
  .dot.kind-composition { background: #5eead4; }
  .dot.kind-asset       { background: #fb923c; }
  .dot.kind-turn        { background: #c084fc; }
  .dot.kind-revert      { background: #f472b6; }
  .dot.kind-other       { background: #94a3b8; }

  .hd { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .kind { text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; color: var(--color-fg-muted, #888); }
  .hash { color: var(--color-fg-muted, #888); font-size: 10px; word-break: break-all; }

  .badge {
    font-size: 9.5px;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--color-surface-3, #222);
    color: var(--color-fg, #e5e5e5);
  }
  .badge.cur { background: var(--color-accent, #444); color: var(--color-accent-fg, #000); }

  .kv {
    display: grid;
    grid-template-columns: 60px 1fr;
    column-gap: 12px;
    row-gap: 4px;
    margin: 0;
    font-size: 11px;
  }
  .kv dt { color: var(--color-fg-faint, #666); }
  .kv dd { margin: 0; color: var(--color-fg, #e5e5e5); word-break: break-word; }
  .kv code { font-size: 10.5px; }

  .msg { display: flex; flex-direction: column; gap: 4px; }
  .msg-h {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-fg-faint, #666);
  }
  .msg-body {
    background: var(--color-page, #0a0a0a);
    border: 1px solid var(--color-hairline, #1f1f1f);
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 11.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-fg, #e5e5e5);
  }

  .actions { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
  .btn {
    background: transparent;
    border: 1px solid var(--color-border, #2a2a2a);
    color: var(--color-fg, #e5e5e5);
    padding: 7px 10px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 80ms ease, border-color 80ms ease;
  }
  .btn:hover:not(:disabled) { background: var(--color-surface-2, #181818); border-color: var(--color-fg-muted, #888); }
  .btn.primary {
    background: var(--color-accent, #444);
    color: var(--color-accent-fg, #000);
    border-color: var(--color-accent, #444);
  }
  .btn.primary:hover:not(:disabled) { opacity: 0.92; }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .err {
    background: rgba(244, 114, 182, 0.08);
    border: 1px solid rgba(244, 114, 182, 0.3);
    color: #fda4af;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 11px;
  }
</style>
