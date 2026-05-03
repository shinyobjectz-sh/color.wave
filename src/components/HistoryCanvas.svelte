<script>
  /**
   * GitKraken-style history canvas — vertical SVG graph of the
   * Prolly-Tree edit chain with each commit slotted into a kind-
   * based lane, parent→child links drawn as smooth beziers, and
   * the detached-cursor "redo space" rendered as a translucent
   * abandoned-future branch on the right.
   *
   * Data model today is linear (single chain + cursor), so the
   * "branches" you see here are *visual decompositions* of one
   * chain by classification (composition / asset / turn / revert /
   * other / init) — not separate refs. When we add real branches
   * in a future pass, lane assignment will switch to ref-name and
   * the rendering primitives below stay the same.
   *
   * Layout:
   *   - newest at the top, oldest at the bottom (matches the log)
   *   - each kind gets a stable column (lane index)
   *   - cursor-detached redo-space lane sits to the right, dotted
   *   - reverts draw a dashed arc back to their source commit
   *
   * Selection is owned by the parent (modal) so the detail panel
   * can render alongside without prop-drilling state up/down.
   */

  import { setCursor } from "../lib/historyBackend.svelte.js";
  import { composition } from "../lib/composition.svelte.js";
  import { readCommit } from "../lib/historyBackend.svelte.js";

  let {
    entries = [],
    currentHash = "",
    cursorHash = null,
    selectedHash = $bindable(""),
  } = $props();

  const ROW_H = 28;            // vertical pixels per commit
  const LANE_W = 36;           // horizontal spacing between lanes
  const LANE_X0 = 28;          // first lane's center x
  const NODE_R = 5;            // commit dot radius
  const PAD_TOP = 24;
  const PAD_BOTTOM = 32;

  // Kind → lane index. Stable left-to-right ordering so the
  // composition lane sits at the leftmost, "main" position and
  // less-frequent kinds drift right. Init pinned to lane 0 so
  // the chain's anchor point is unmistakable.
  const KIND_LANE = {
    init:        0,
    composition: 1,
    asset:       2,
    turn:        3,
    revert:      4,
    other:       5,
  };
  const LANE_LABEL = {
    0: "init",
    1: "composition",
    2: "asset",
    3: "turn",
    4: "revert",
    5: "other",
  };

  function classifyEntry(e) {
    const msg = e.message ?? "";
    if (msg.startsWith("revert to ")) return "revert";
    if (msg.startsWith("composition")) return "composition";
    if (msg.startsWith("add asset") || msg.startsWith("remove asset")) return "asset";
    if (/turn \(/.test(msg)) return "turn";
    if (msg === "hyperframes session start") return "init";
    return "other";
  }

  function revertSourceShort(msg) {
    const m = /^revert to ([0-9a-f]+)/.exec(msg ?? "");
    return m ? m[1] : null;
  }

  // The canonical "current" index in entries[] — anything with a
  // smaller index (newer) is in the redo space when the cursor
  // is detached. When cursor === HEAD (entries[0]), redo is empty.
  let currentIdx = $derived(entries.findIndex((e) => e.hash === currentHash));
  let cursorDetached = $derived(!!cursorHash && currentIdx > 0);

  // Build a per-entry render record. We do this in one pass so
  // SVG paths can reference parent positions without re-walking.
  let nodes = $derived.by(() => {
    if (!entries.length) return [];
    return entries.map((e, i) => {
      const kind = classifyEntry(e);
      // Redo-space (commits newer than cursor) gets its own lane
      // to the right of all kind-lanes — visually marking them as
      // "abandoned future you can walk back to or commit over".
      const inRedo = cursorDetached && i < currentIdx;
      const lane = inRedo ? 6 : (KIND_LANE[kind] ?? KIND_LANE.other);
      return {
        idx: i,
        entry: e,
        kind,
        inRedo,
        lane,
        x: LANE_X0 + lane * LANE_W,
        y: PAD_TOP + i * ROW_H,
        isCurrent: e.hash === currentHash,
      };
    });
  });

  // Edges: parent→child for adjacent commits in entries[]. Since
  // entries is newest-first, entries[i].parent === entries[i+1].hash
  // when the chain is linear (which it always is today). We draw
  // FROM the older parent (lower y, larger i) TO the newer child
  // (higher y, smaller i), which reads as time flowing upward.
  let edges = $derived.by(() => {
    const out = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const child = nodes[i];
      const parent = nodes[i + 1];
      out.push({
        from: parent,
        to: child,
        // Visual subtype: redo-space links are dashed; hops between
        // different lanes get a swoop, same-lane stays straight.
        dashed: child.inRedo || parent.inRedo,
      });
    }
    return out;
  });

  // Revert arcs: when commit X's message says "revert to <prefix>",
  // draw a curving back-pointer from X to the revert source.
  let revertArcs = $derived.by(() => {
    const out = [];
    for (const n of nodes) {
      if (n.kind !== "revert") continue;
      const prefix = revertSourceShort(n.entry.message);
      if (!prefix) continue;
      const src = nodes.find((m) => m.entry.hash.startsWith(prefix));
      if (src) out.push({ from: n, to: src });
    }
    return out;
  });

  // Lane labels at the top — only show lanes that actually have
  // commits in them so the header isn't a wall of placeholder text.
  let usedLanes = $derived.by(() => {
    const seen = new Set();
    for (const n of nodes) seen.add(n.lane);
    return [...seen].sort((a, b) => a - b);
  });

  let canvasW = $derived.by(() => {
    const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
    return LANE_X0 + (maxLane + 1) * LANE_W + 12;
  });
  let canvasH = $derived(PAD_TOP + entries.length * ROW_H + PAD_BOTTOM);

  // Smooth bezier path between two nodes. Same-lane links are a
  // straight vertical run so the trunk reads as a clean spine;
  // cross-lane links get a gentle s-curve.
  function pathFor(from, to) {
    if (from.lane === to.lane) {
      return `M ${from.x} ${from.y - NODE_R} L ${to.x} ${to.y + NODE_R}`;
    }
    const midY = (from.y + to.y) / 2;
    return [
      `M ${from.x} ${from.y - NODE_R}`,
      `C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y + NODE_R}`,
    ].join(" ");
  }

  // Revert arc — bows out to the right (or left, whichever side
  // has room) so it's clearly distinct from forward edges.
  function revertPathFor(from, to) {
    const bow = 28;
    const mx = Math.max(from.x, to.x) + bow;
    const my1 = from.y;
    const my2 = to.y;
    return [
      `M ${from.x + NODE_R} ${my1}`,
      `C ${mx} ${my1}, ${mx} ${my2}, ${to.x + NODE_R} ${my2}`,
    ].join(" ");
  }

  function shortHash(h) {
    return h?.slice(0, 7) ?? "";
  }

  function pickNode(n) {
    selectedHash = n.entry.hash;
  }

  // Action: jump cursor to a given commit. Materialises the
  // composition state at that commit and detaches the cursor.
  // Identical semantics to HistoryPanel.moveCursorTo so we stay
  // consistent across both surfaces.
  async function jumpTo(hash) {
    try {
      const snapshot = await readCommit(hash);
      const html = snapshot?.["composition"];
      if (typeof html !== "string") return;
      composition.set(html, undefined, { suppressAudit: true });
      setCursor(hash);
    } catch (e) {
      console.warn("history-canvas: jumpTo failed", e);
    }
  }
</script>

<div class="canvas-shell">
  {#if !entries.length}
    <div class="empty">
      <div class="empty-title">No history yet</div>
      <div class="empty-body">
        Every composition save, asset change, and agent turn appends a
        cryptographically-chained commit here. Make any edit and the
        graph populates.
      </div>
    </div>
  {:else}
    <div class="lane-header" style="width: {canvasW}px;">
      {#each usedLanes as ln}
        <span class="lane-label" style="left: {LANE_X0 + ln * LANE_W}px;">
          {ln === 6 ? "redo" : LANE_LABEL[ln]}
        </span>
      {/each}
    </div>

    <div class="scroll">
      <svg
        class="canvas"
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="hc-glow-current" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="var(--color-accent, #fff)" stop-opacity="0.55" />
            <stop offset="100%" stop-color="var(--color-accent, #fff)" stop-opacity="0" />
          </radialGradient>
        </defs>

        <!-- lane vertical guidelines -->
        {#each usedLanes as ln}
          {@const x = LANE_X0 + ln * LANE_W}
          <line
            x1={x} y1={PAD_TOP - 6}
            x2={x} y2={canvasH - PAD_BOTTOM + 6}
            class="lane-rule"
            class:redo={ln === 6}
          />
        {/each}

        <!-- parent→child edges -->
        {#each edges as e}
          <path
            d={pathFor(e.from, e.to)}
            class="edge"
            class:dashed={e.dashed}
            class:lane-jump={e.from.lane !== e.to.lane}
            stroke-linecap="round"
            fill="none"
          />
        {/each}

        <!-- revert arcs (drawn behind nodes so the dot lands on top) -->
        {#each revertArcs as a}
          <path
            d={revertPathFor(a.from, a.to)}
            class="revert-arc"
            stroke-linecap="round"
            fill="none"
          />
        {/each}

        <!-- nodes -->
        {#each nodes as n (n.entry.hash)}
          <g
            class="node"
            class:current={n.isCurrent}
            class:redo={n.inRedo}
            class:selected={selectedHash === n.entry.hash}
            transform="translate({n.x} {n.y})"
            onclick={() => pickNode(n)}
            ondblclick={() => jumpTo(n.entry.hash)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickNode(n); }
            }}
          >
            {#if n.isCurrent}
              <circle r={NODE_R * 2.4} fill="url(#hc-glow-current)" class="glow" />
            {/if}
            <circle r={NODE_R} class={`core kind-${n.kind}`} />
            {#if n.isCurrent}
              <circle r={NODE_R + 3} class="current-ring" />
            {/if}
            {#if selectedHash === n.entry.hash && !n.isCurrent}
              <circle r={NODE_R + 3} class="selected-ring" />
            {/if}
          </g>
        {/each}

        <!-- inline commit summaries to the right of the rightmost
             lane — newest at top so the eye scans the same direction
             as the graph -->
        {#each nodes as n (n.entry.hash)}
          {@const labelX = LANE_X0 + 7 * LANE_W + 4}
          <text
            x={labelX}
            y={n.y + 3}
            class="row-label"
            class:current={n.isCurrent}
            class:redo={n.inRedo}
            class:selected={selectedHash === n.entry.hash}
            onclick={() => pickNode(n)}
            ondblclick={() => jumpTo(n.entry.hash)}
            role="button"
            tabindex="0"
          >
            <tspan class="row-hash">{shortHash(n.entry.hash)}</tspan>
            <tspan dx="8">{n.entry.message || "(no message)"}</tspan>
          </text>
        {/each}
      </svg>
    </div>
  {/if}
</div>

<style>
  .canvas-shell {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--color-page, #0a0a0a);
  }

  .lane-header {
    position: relative;
    height: 24px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--color-hairline, #1f1f1f);
  }
  .lane-label {
    position: absolute;
    top: 4px;
    transform: translateX(-50%);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-fg-faint, #666);
    pointer-events: none;
  }

  .scroll {
    flex: 1; min-height: 0;
    overflow: auto;
  }

  .canvas {
    display: block;
    background: var(--color-page, #0a0a0a);
  }

  .lane-rule {
    stroke: var(--color-hairline, #1f1f1f);
    stroke-width: 1;
    stroke-dasharray: 1 5;
  }
  .lane-rule.redo {
    stroke: rgba(180, 130, 70, 0.25);
  }

  .edge {
    stroke: var(--color-fg-muted, #888);
    stroke-width: 1.4;
    opacity: 0.6;
  }
  .edge.lane-jump { opacity: 0.7; }
  .edge.dashed {
    stroke-dasharray: 3 4;
    opacity: 0.45;
    stroke: rgba(180, 130, 70, 0.55);
  }

  .revert-arc {
    stroke: rgba(168, 124, 220, 0.55);
    stroke-width: 1.2;
    stroke-dasharray: 2 4;
  }

  /* Commit-kind colors — composition/asset/turn/revert get a
   * distinct hue so a quick scan tells the story of the workbook
   * (heavy compositions vs heavy turns vs heavy assets, etc). */
  .core { stroke: rgba(0,0,0,0.4); stroke-width: 0.8; }
  .core.kind-init        { fill: #facc15; }
  .core.kind-composition { fill: #5eead4; }
  .core.kind-asset       { fill: #fb923c; }
  .core.kind-turn        { fill: #c084fc; }
  .core.kind-revert      { fill: #f472b6; }
  .core.kind-other       { fill: #94a3b8; }

  .node { cursor: pointer; }
  .node.redo .core { opacity: 0.45; }
  .node:hover .core { stroke: rgba(255,255,255,0.6); }

  .current-ring  { fill: none; stroke: var(--color-accent, #fff); stroke-width: 1.5; }
  .selected-ring { fill: none; stroke: var(--color-fg, #e5e5e5); stroke-width: 1; opacity: 0.65; }

  .row-label {
    fill: var(--color-fg-muted, #888);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
    cursor: pointer;
    dominant-baseline: middle;
  }
  .row-label:hover { fill: var(--color-fg, #e5e5e5); }
  .row-label.redo { fill: var(--color-fg-faint, #666); opacity: 0.7; }
  .row-label.current { fill: var(--color-fg, #e5e5e5); }
  .row-label.selected { fill: var(--color-accent, #fff); }
  .row-hash { fill: var(--color-fg-faint, #666); }

  .empty {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 40px 24px;
    text-align: center;
    gap: 8px;
  }
  .empty-title {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
    color: var(--color-fg-muted, #888);
  }
  .empty-body {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 11px;
    color: var(--color-fg-faint, #666);
    max-width: 50ch;
    line-height: 1.5;
  }
</style>
