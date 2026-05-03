// panel — Voice Redo: transcript editor + voice picker + Regenerate.

export function mountVoicePanel(root, deps) {
  const { onTranscribe, onRegenerate, onVoiceChange, getDefaults, getVoices } = deps;

  root.innerHTML = `
    <div class="vr-wrap">
      <header class="vr-head">
        <div class="vr-title">voice-redo</div>
        <div class="vr-clip">— pick a clip from the timeline —</div>
      </header>
      <div class="vr-row">
        <button class="vr-trans" disabled>Transcribe</button>
        <select class="vr-voice"></select>
      </div>
      <div class="vr-section">
        <div class="vr-section-label">transcript (edit freely)</div>
        <textarea class="vr-text" placeholder="(transcript will appear here)" spellcheck="false"></textarea>
      </div>
      <div class="vr-stats"></div>
      <button class="vr-regen" disabled>Regenerate VO</button>
      <div class="vr-status"></div>
    </div>
    <style>
      .vr-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .vr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .vr-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .vr-clip { color: var(--color-fg); }
      .vr-row { display: grid; grid-template-columns: auto 1fr; gap: 6px; margin-bottom: 8px; }
      .vr-row button, .vr-row select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .vr-row button:disabled { opacity: 0.4; cursor: not-allowed; }
      .vr-section { margin-bottom: 8px; }
      .vr-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .vr-text { width: 100%; height: 140px; padding: 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); font: 11px ui-monospace, monospace; resize: vertical; }
      .vr-stats { font-size: 10px; color: var(--color-fg); margin-bottom: 6px; min-height: 14px; font-variant-numeric: tabular-nums; }
      .vr-regen { width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .vr-regen:disabled { opacity: 0.4; cursor: not-allowed; }
      .vr-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .vr-status.err { color: rgb(255, 120, 120); }
      .vr-status.warn { color: rgb(255, 180, 80); }
    </style>
  `;

  const transBtn = root.querySelector(".vr-trans");
  const regenBtn = root.querySelector(".vr-regen");
  const voiceSel = root.querySelector(".vr-voice");
  const textEl = root.querySelector(".vr-text");
  const statsEl = root.querySelector(".vr-stats");
  const statusEl = root.querySelector(".vr-status");
  const clipEl = root.querySelector(".vr-clip");

  function refreshVoices(voices) {
    voiceSel.innerHTML = voices.map((v) => `<option value="${v.id}">${v.name}${v.description ? " — " + v.description : ""}</option>`).join("");
    const d = getDefaults();
    if (d.voiceId) voiceSel.value = d.voiceId;
  }

  refreshVoices(getVoices());

  transBtn.addEventListener("click", () => onTranscribe?.());
  regenBtn.addEventListener("click", () => onRegenerate?.(textEl.value));
  voiceSel.addEventListener("change", () => onVoiceChange?.(voiceSel.value));
  textEl.addEventListener("input", () => deps.onTextEdit?.(textEl.value));

  function setStatus(msg, kind = null) {
    statusEl.textContent = msg;
    statusEl.classList.remove("err", "warn");
    if (kind === "err") statusEl.classList.add("err");
    else if (kind === "warn") statusEl.classList.add("warn");
  }

  return {
    setClip(label) { clipEl.textContent = label; transBtn.disabled = false; },
    setTranscript(text) { textEl.value = text; regenBtn.disabled = !text; },
    setStats(stats) {
      if (!stats) { statsEl.textContent = ""; return; }
      const changed = stats.inserted + stats.removed;
      const pct = stats.originalLen > 0 ? Math.round(100 * changed / Math.max(1, stats.originalLen)) : 0;
      statsEl.textContent = `kept ${stats.kept}/${stats.originalLen} · +${stats.inserted} / -${stats.removed} · Δ ${pct}%`;
    },
    setStatus,
    setBusy(b) { transBtn.disabled = b; regenBtn.disabled = b; voiceSel.disabled = b; },
    refreshVoices,
    destroy() { root.innerHTML = ""; },
  };
}
