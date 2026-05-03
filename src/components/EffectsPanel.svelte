<script>
  import { effects } from "../lib/effects.svelte.js";
  import { composition } from "../lib/composition.svelte.js";

  // Bump the iframe revision after each value change so the new srcdoc
  // (which includes effects state) gets re-rendered. effects state is
  // already reactive so the panel itself updates without this bump —
  // it's strictly for the iframe player.
  function bump() {
    composition.revision += 1;
  }

  function setValue(id, v) {
    effects.setValue(id, v);
    bump();
  }

  function remove(id) {
    if (!confirm("Delete this effect?")) return;
    effects.remove(id);
    bump();
  }

  function bindingSummary(fx) {
    const n = fx.bindings?.length ?? 0;
    if (n === 0) return "no bindings";
    const first = fx.bindings[0];
    const tail = n > 1 ? ` +${n - 1}` : "";
    if (first.kind === "css-property") return `${first.selector} { ${first.property} }${tail}`;
    if (first.kind === "css-variable") return `${first.selector ?? ":root"} { ${first.property} }${tail}`;
    if (first.kind === "attribute") return `${first.selector} [${first.property}]${tail}`;
    if (first.kind === "text-content") return `${first.selector} text${tail}`;
    return `${first.kind}${tail}`;
  }
</script>

<section class="flex flex-col min-h-0 flex-1">
  <header class="px-4 py-2.5 border-b border-border flex items-center justify-between">
    <div class="font-mono text-[11px] text-fg-muted">
      <span class="uppercase tracking-wider text-fg-faint">effects</span>
      <span class="ml-2 text-fg">{effects.items.length}</span>
    </div>
    <div class="font-mono text-[10px] text-fg-faint">
      ask the agent → tools knobs
    </div>
  </header>

  <div class="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
    {#if effects.items.length === 0}
      <div class="px-3 py-6 rounded-lg border border-dashed border-border text-center">
        <div class="font-mono text-[12px] text-fg">no effects yet</div>
        <div class="font-mono text-[10px] text-fg-faint mt-1.5 leading-relaxed">
          ask the agent in chat — e.g.<br/>
          "add a knob to swap the hero color"<br/>
          or "let me toggle the subtitle"
        </div>
      </div>
    {/if}

    {#each effects.items as fx (fx.id)}
      <article class="bg-page border border-border rounded-md overflow-hidden">
        <header class="px-3 py-2 flex items-start justify-between gap-2 border-b border-border">
          <div class="min-w-0 flex-1">
            <div class="font-mono text-[12px] text-fg truncate">{fx.name ?? fx.id}</div>
            {#if fx.description}
              <div class="font-mono text-[10px] text-fg-muted mt-0.5 leading-snug">{fx.description}</div>
            {/if}
            <div class="font-mono text-[9px] text-fg-faint mt-1 truncate" title={bindingSummary(fx)}>
              {bindingSummary(fx)}
            </div>
          </div>
          <button
            type="button"
            onclick={() => remove(fx.id)}
            title="Delete"
            aria-label="Delete effect"
            class="text-fg-faint hover:text-fg transition shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M3 3.5h8M5 3.5V2.5h4v1M4.5 3.5l.5 8h4l.5-8"/>
            </svg>
          </button>
        </header>

        <div class="px-3 py-2.5">
          {#if fx.control?.kind === "color"}
            <label class="flex items-center gap-2.5">
              <input
                type="color"
                value={fx.value ?? fx.control?.default ?? "#000000"}
                oninput={(e) => setValue(fx.id, e.currentTarget.value)}
                class="w-9 h-9 rounded cursor-pointer border border-border bg-transparent"
              />
              <input
                type="text"
                value={fx.value ?? fx.control?.default ?? ""}
                oninput={(e) => setValue(fx.id, e.currentTarget.value)}
                class="flex-1 font-mono text-[11px] px-2 py-1 rounded bg-bg border border-border text-fg"
              />
            </label>

          {:else if fx.control?.kind === "number"}
            <label class="space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-[10px] text-fg-faint uppercase tracking-wider">{fx.control?.label ?? "value"}</span>
                <span class="font-mono text-[11px] text-fg">{fx.value ?? fx.control?.default ?? 0}</span>
              </div>
              <input
                type="range"
                min={fx.control?.min ?? 0}
                max={fx.control?.max ?? 100}
                step={fx.control?.step ?? 1}
                value={fx.value ?? fx.control?.default ?? 0}
                oninput={(e) => setValue(fx.id, parseFloat(e.currentTarget.value))}
                class="w-full"
              />
            </label>

          {:else if fx.control?.kind === "text"}
            <input
              type="text"
              value={fx.value ?? fx.control?.default ?? ""}
              placeholder={fx.control?.placeholder ?? ""}
              oninput={(e) => setValue(fx.id, e.currentTarget.value)}
              class="w-full font-mono text-[11px] px-2 py-1.5 rounded bg-bg border border-border text-fg"
            />

          {:else if fx.control?.kind === "select"}
            <select
              value={fx.value ?? fx.control?.default ?? ""}
              onchange={(e) => setValue(fx.id, e.currentTarget.value)}
              class="w-full font-mono text-[11px] px-2 py-1.5 rounded bg-bg border border-border text-fg"
            >
              {#each (fx.control?.options ?? []) as opt}
                <option value={opt.value}>{opt.label ?? opt.value}</option>
              {/each}
            </select>

          {:else if fx.control?.kind === "boolean"}
            <label class="flex items-center justify-between gap-2 cursor-pointer">
              <span class="font-mono text-[11px] text-fg">{fx.control?.label ?? "enabled"}</span>
              <button
                type="button"
                onclick={() => setValue(fx.id, !(fx.value ?? fx.control?.default ?? false))}
                class="cw-toggle"
                role="switch"
                aria-checked={!!(fx.value ?? fx.control?.default)}
              >
                <span class="cw-toggle-track"><span class="cw-toggle-knob"></span></span>
              </button>
            </label>

          {:else}
            <div class="font-mono text-[10px] text-fg-faint">unknown control kind: {fx.control?.kind}</div>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .cw-toggle { background: transparent; border: 0; padding: 0; cursor: pointer; }
  .cw-toggle-track {
    position: relative; display: inline-block;
    width: 30px; height: 16px;
    background: var(--color-border);
    border-radius: 999px;
  }
  .cw-toggle-knob {
    position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px;
    background: var(--color-fg-muted);
    border-radius: 999px;
    transition: transform 120ms ease, background 120ms ease;
  }
  .cw-toggle[aria-checked="true"] .cw-toggle-track { background: var(--color-accent); }
  .cw-toggle[aria-checked="true"] .cw-toggle-knob { background: var(--color-accent-fg); transform: translateX(14px); }
</style>
