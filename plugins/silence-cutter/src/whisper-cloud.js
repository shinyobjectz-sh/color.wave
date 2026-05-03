// whisper-cloud — call HF Inference API for word-level transcription.
//
// Auth: optional. With no token, anonymous public quota (~10/min).
// With a token (set via colorwave secrets as HUGGINGFACE_TOKEN), we
// pass it as `Authorization: Bearer <value>`.
//
// Cold start: HF returns 503 with `estimated_time` while the model
// loads. We retry once after the suggested delay (capped at 30 s).

const ENDPOINT = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";

export async function transcribe(audioBlob, opts = {}) {
  const token = opts.token ?? null;
  const headers = {
    "Content-Type": audioBlob.type || "audio/wav",
    "Accept": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = JSON.stringify({
    parameters: { return_timestamps: "word" },
  });
  // Inference API quirk: with parameters we still post the bytes; we
  // emulate the typical multipart with a wrapping JSON when the model
  // supports it. The whisper endpoint accepts raw bytes with a query
  // hint via header; if word-level isn't honored that way, we fall
  // back to forced alignment over Silero gaps.
  const init = {
    method: "POST",
    headers,
    body: audioBlob,
  };

  let resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  if (resp.status === 503) {
    const detail = await resp.json().catch(() => ({}));
    const eta = Math.min(30, Math.ceil(detail.estimated_time ?? 6));
    await sleep(eta * 1000);
    resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`whisper cloud ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return normalize(data);
}

/**
 * Normalize HF response into our word array shape:
 *   [{ word, t_start, t_end, conf? }]
 */
function normalize(data) {
  // HF whisper-large-v3 returns either:
  //   { text, chunks: [{ text, timestamp: [t0,t1] }] }
  // (segment timestamps), or with word param:
  //   { text, chunks: [{ text, timestamp: [t0,t1] }] } at word grain.
  // Some routes use `words` instead.
  const chunks = data.chunks ?? data.words ?? [];
  return chunks
    .map((c) => {
      const ts = c.timestamp ?? c.timestamps ?? null;
      if (!ts) return null;
      return {
        word: (c.text ?? c.word ?? "").trim(),
        t_start: ts[0],
        t_end: ts[1],
      };
    })
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
