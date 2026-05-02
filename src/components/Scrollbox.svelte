<script>
  /**
   * Scrollbox — wraps a scrollable region and renders a custom
   * overlay scrollbar that paints consistently across Safari /
   * Chromium / Firefox.
   *
   * Why a JS scrollbar: macOS Safari ignores ::-webkit-scrollbar
   * styling for overlay-style scrollbars, and the OS-level
   * "Show scroll bars: Automatically" preference forces overlay
   * mode for most users. Custom CSS (even with !important and
   * -webkit-appearance: none) silently no-ops in that path. The
   * only reliable cross-browser fix is to hide the native bar
   * (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`)
   * and draw our own thumb on top.
   *
   * Usage:
   *   <Scrollbox class="...">
   *     {scroll content}
   *   </Scrollbox>
   *
   * The wrapper takes the parent's height (default block size) —
   * pair with `flex-1` or an explicit height in the consumer for
   * predictable sizing inside flex containers.
   */
  let { children, class: cls = "" } = $props();

  let scroller = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let scrollTop = $state(0);
  let scrollHeight = $state(0);
  let clientHeight = $state(0);
  let dragging = $state(false);
  let hovering = $state(false);

  let dragStartY = 0;
  let dragStartScroll = 0;
  let hideTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  let recentScroll = $state(false);

  function measure() {
    if (!scroller) return;
    scrollTop = scroller.scrollTop;
    scrollHeight = scroller.scrollHeight;
    clientHeight = scroller.clientHeight;
  }

  function onScroll() {
    measure();
    recentScroll = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { recentScroll = false; }, 900);
  }

  $effect(() => {
    if (!scroller) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    // Also observe the first child since content height drives
    // scrollHeight independent of the scroller's own size.
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => {
      ro.disconnect();
      if (hideTimer) clearTimeout(hideTimer);
    };
  });

  // Thumb size proportional to viewport / total. Min 28 so it's
  // always grabbable even on tall content.
  let thumbH = $derived(
    scrollHeight > 0 && clientHeight > 0
      ? Math.max(28, (clientHeight / scrollHeight) * clientHeight)
      : 0,
  );
  let thumbY = $derived(
    scrollHeight > clientHeight
      ? (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbH)
      : 0,
  );
  let needsThumb = $derived(scrollHeight > clientHeight + 1);
  let visible = $derived(needsThumb && (hovering || dragging || recentScroll));

  function onThumbPointerDown(ev) {
    if (!scroller) return;
    ev.preventDefault();
    dragging = true;
    dragStartY = ev.clientY;
    dragStartScroll = scroller.scrollTop;
    /** @type {HTMLElement} */ (ev.currentTarget).setPointerCapture(ev.pointerId);
  }
  function onThumbPointerMove(ev) {
    if (!dragging || !scroller) return;
    const trackUsable = clientHeight - thumbH;
    if (trackUsable <= 0) return;
    const dy = ev.clientY - dragStartY;
    const scrollDelta = (dy / trackUsable) * (scrollHeight - clientHeight);
    scroller.scrollTop = dragStartScroll + scrollDelta;
  }
  function onThumbPointerUp(ev) {
    dragging = false;
    try { /** @type {HTMLElement} */ (ev.currentTarget).releasePointerCapture(ev.pointerId); } catch {}
  }
</script>

<div
  class="sb-root {cls}"
  onpointerenter={() => hovering = true}
  onpointerleave={() => hovering = false}
>
  <div
    bind:this={scroller}
    onscroll={onScroll}
    class="sb-scroller"
  >
    {@render children?.()}
  </div>
  {#if needsThumb}
    <div
      class="sb-thumb"
      class:sb-thumb-visible={visible}
      class:sb-thumb-active={dragging}
      style:height="{thumbH}px"
      style:transform="translateY({thumbY}px)"
      onpointerdown={onThumbPointerDown}
      onpointermove={onThumbPointerMove}
      onpointerup={onThumbPointerUp}
      onpointercancel={onThumbPointerUp}
    ></div>
  {/if}
</div>

<style>
  .sb-root {
    position: relative;
    overflow: hidden;
    /* Default to filling the parent — most use sites are inside
     * a flex column where the scrollbox is the flex-grow child. */
    height: 100%;
    min-height: 0;
  }
  .sb-scroller {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    /* Hide the native bar — Firefox + Chromium + Safari. */
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .sb-scroller::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .sb-thumb {
    position: absolute;
    top: 0;
    right: 4px;
    width: 6px;
    border-radius: 999px;
    background: var(--color-border-2);
    cursor: pointer;
    user-select: none;
    touch-action: none;
    opacity: 0;
    transition: opacity 160ms ease, background-color 120ms ease, width 120ms ease;
    will-change: transform, opacity;
  }
  .sb-thumb-visible {
    opacity: 1;
  }
  .sb-thumb:hover,
  .sb-thumb-active {
    background: var(--color-fg-faint);
    width: 8px;
  }
</style>
