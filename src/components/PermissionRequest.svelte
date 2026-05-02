<script>
  /**
   * Permission card — inline chat element shown while the ACP agent
   * is awaiting `session/request_permission`. One card per pending
   * request; resolves the underlying Promise when the user clicks an
   * option (or auto-cancels on Esc / dismiss).
   *
   * Visual model: a flat card with the requested action (tool name +
   * one-line description from the request), then a row of option
   * buttons. Allow-style options take an accent color; reject-style
   * options stay neutral.
   */
  import { acpPermissions, answer, cancel } from "../lib/acpPermissions.svelte.js";

  /** Heuristic: the ACP spec defines option `kind` as one of
   *  allow_once / allow_always / reject_once / reject_always. Map
   *  to a primary/secondary visual treatment. */
  function isAllow(opt) {
    const k = opt?.kind ?? "";
    return k.startsWith("allow") || /^(allow|approve|yes)$/i.test(opt?.optionId ?? "");
  }

  /** Pull the human-readable summary the adapter sent. ACP's request
   *  shape is { sessionId, toolCall: { title?, content?, ... }?, options }.
   *  Different adapters fill different fields; surface what's there. */
  function summaryFor(req) {
    const tc = req?.toolCall ?? {};
    return tc.title || tc.kind || tc.toolName || "Permission requested";
  }
  function detailFor(req) {
    const tc = req?.toolCall ?? {};
    if (typeof tc.content === "string") return tc.content;
    if (Array.isArray(tc.content)) {
      return tc.content
        .map((c) => (typeof c === "string" ? c : c?.text ?? ""))
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }
</script>

{#each acpPermissions.pending as p (p.id)}
  {@const allow = (p.request.options ?? []).filter(isAllow)}
  {@const deny  = (p.request.options ?? []).filter((o) => !isAllow(o))}
  <div
    class="my-2 rounded-lg border border-amber-700/50 bg-amber-950/15 px-3.5 py-2.5"
    role="dialog"
    aria-label="Permission requested"
  >
    <div class="flex items-baseline gap-2 mb-1">
      <span class="text-[10px] uppercase tracking-wider font-mono text-amber-300">permission</span>
      <span class="text-[13px] font-medium text-fg">{summaryFor(p.request)}</span>
    </div>
    {#if detailFor(p.request)}
      <pre class="m-0 mb-2 whitespace-pre-wrap break-words text-[12px] text-fg-muted font-mono leading-snug">{detailFor(p.request)}</pre>
    {/if}
    <div class="flex flex-wrap gap-1.5">
      {#each allow as opt (opt.optionId)}
        <button
          type="button"
          onclick={() => answer(p.id, opt.optionId)}
          class="text-[11px] px-3 py-1 rounded-md cursor-pointer
                 bg-accent text-accent-fg border border-accent
                 hover:opacity-90"
        >{opt.name}</button>
      {/each}
      {#each deny as opt (opt.optionId)}
        <button
          type="button"
          onclick={() => answer(p.id, opt.optionId)}
          class="text-[11px] px-3 py-1 rounded-md cursor-pointer
                 bg-transparent text-fg-muted border border-border
                 hover:text-fg"
        >{opt.name}</button>
      {/each}
      <button
        type="button"
        onclick={() => cancel(p.id)}
        class="ml-auto text-[10px] px-2 py-1 rounded-md cursor-pointer
               bg-transparent text-fg-faint border border-transparent
               hover:text-fg-muted"
        title="Cancel this request — agent treats it as no-answer."
      >dismiss</button>
    </div>
  </div>
{/each}
