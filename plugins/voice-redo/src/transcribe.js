// transcribe — HF whisper-large-v3 with word-level timestamps.

const ENDPOINT = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";

export async function transcribe(wavBlob, opts = {}) {
  const headers = { "Content-Type": "audio/wav", "Accept": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const init = { method: "POST", headers, body: wavBlob };
  let resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  if (resp.status === 503) {
    const eta = Math.min(30, Math.ceil(((await safeJson(resp)).estimated_time) ?? 6));
    await sleep(eta * 1000);
    resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`whisper ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const chunks = data.chunks ?? data.words ?? [];
  return chunks
    .map((c) => {
      const ts = c.timestamp ?? c.timestamps ?? null;
      if (!ts) return null;
      const w = (c.text ?? c.word ?? "").trim();
      if (!w) return null;
      return { t: ts[0], d: Math.max(0.05, (ts[1] ?? ts[0] + 0.2) - ts[0]), w };
    })
    .filter(Boolean);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function safeJson(r) { try { return await r.clone().json(); } catch { return {}; } }
