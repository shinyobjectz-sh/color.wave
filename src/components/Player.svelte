<script>
  import { onMount, onDestroy } from "svelte";
  import { composition } from "../lib/composition.svelte.js";
  import { layout, ASPECT_PRESETS } from "../lib/layout.svelte.js";
  import {
    registerSender,
    togglePlay,
    restart,
  } from "../lib/transport.svelte.js";
  let frameEl;
  let containerEl;

  // Compute the largest box with the chosen aspect ratio that fits
  // inside the container. Pure-CSS aspect-ratio + max-height/width
  // works in flex parents that have a definite cross-axis size, but
  // our parent's height comes from a flex chain with min-h-0 — that
  // resolves to 0 in some Chromium minor versions, which collapses
  // the canvas. ResizeObserver gives us the actual container box,
  // so we set explicit width/height on the frame and never rely on
  // browser intrinsic-sizing heuristics.
  let frameW = $state(0);
  let frameH = $state(0);

  function recomputeFrame() {
    if (!containerEl) return;
    const { clientWidth: cw, clientHeight: ch } = containerEl;
    if (cw <= 0 || ch <= 0) return;
    const a = ASPECT_PRESETS.find((p) => p.id === layout.aspect) ?? ASPECT_PRESETS[0];
    const ar = a.w / a.h;
    let w = cw, h = cw / ar;
    if (h > ch) { h = ch; w = ch * ar; }
    frameW = Math.floor(w);
    frameH = Math.floor(h);
  }

  function onMessage(ev) {
    if (ev.source !== frameEl?.contentWindow) return;
    const m = ev.data || {};
    if (m.type === "tick") {
      composition.curTime = m.t;
    } else if (m.type === "ended") {
      composition.playing = false;
    } else if (m.type === "ready") {
      // Restore playhead. The iframe's content reloads any time the
      // srcdoc string changes — effect-value tweaks, agent edits,
      // clip add/remove, timeline reorders, etc. Each reload would
      // otherwise restart playback at t=0. Instead we treat
      // `composition.curTime` + `composition.playing` as the source
      // of truth (they're updated continuously by tick events) and
      // seek the new iframe back to where the old one was, preserving
      // play state. Restart() in transport.svelte.js still works: it
      // sets curTime=0 and playing=false BEFORE sending the "restart"
      // message, so the next ready event reads zeros.
      const t = composition.curTime;
      if (t > 0) frameEl?.contentWindow?.postMessage({ type: "seek", value: t }, "*");
      if (composition.playing) frameEl?.contentWindow?.postMessage({ type: "play" }, "*");
    }
  }
  let ro;
  onMount(() => {
    window.addEventListener("message", onMessage);
    if (containerEl) {
      recomputeFrame();
      ro = new ResizeObserver(recomputeFrame);
      ro.observe(containerEl);
    }
  });
  onDestroy(() => {
    window.removeEventListener("message", onMessage);
    ro?.disconnect();
  });
  // Re-fit whenever the user picks a new aspect.
  $effect(() => { void layout.aspect; recomputeFrame(); });

  let srcdoc = $derived(composition.html ? composition.buildSrcdoc() : "");

  function send(msg) { frameEl?.contentWindow?.postMessage(msg, "*"); }

  // Register this Player's iframe as the transport target so the
  // timeline-header buttons (and the keyboard shortcuts below) drive
  // playback from outside this component.
  let unregister;
  onMount(() => { unregister = registerSender(send); });
  onDestroy(() => { unregister?.(); });

  // Spacebar = play/pause, R = restart. Only when no input/textarea
  // is active.
  function onKey(e) {
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "r" || e.key === "R") restart();
  }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));
</script>

<div
  bind:this={containerEl}
  class="relative bg-stage px-4 py-8 flex items-center justify-center min-h-0 min-w-0 overflow-hidden flex-1"
>
  <div
    class="bg-black border border-border-2 rounded-md overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    style="width: {frameW}px; height: {frameH}px;"
  >
    <!--
      No {#key} wrapper. We deliberately do NOT destroy + recreate
      the iframe on revision bump. Modern browsers reload iframe
      content automatically when srcdoc changes (which is what we
      want — effects / html / clip edits should be visible), but the
      DOM element itself stays put. Combined with the seek-on-ready
      logic in onMessage above, that means playhead + play state
      survive any state-change that flows through the composition.
    -->
    <iframe
      bind:this={frameEl}
      srcdoc={srcdoc}
      sandbox="allow-scripts"
      title="HyperFrames preview"
      class="w-full h-full block bg-black"
      referrerpolicy="no-referrer"
    ></iframe>
  </div>
</div>

