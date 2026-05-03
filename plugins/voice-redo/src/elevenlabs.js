// elevenlabs — TTS + voices listing.
//
// Endpoints:
//   GET  /v1/voices                   → list available voices (incl. user clones)
//   POST /v1/text-to-speech/{voice_id} → synthesize MP3 bytes
//
// Auth: header `xi-api-key: <key>`. The key is stored in wb.storage
// under "apiKey" (settings panel), encrypted by Cmd+S like any other
// per-workbook secret.

const BASE = "https://api.elevenlabs.io/v1";

export const STOCK_VOICES = [
  // Curated subset of well-known stock voice IDs. Full list comes from
  // /v1/voices once the user provides a key; this is the offline default.
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",    description: "Calm narrator female" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",      description: "Strong female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",     description: "Soft female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",      description: "Deep male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",    description: "Crisp male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",      description: "Narrator male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",       description: "Raspy male" },
];

export async function listVoices(apiKey) {
  if (!apiKey) return STOCK_VOICES;
  const resp = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": apiKey, "Accept": "application/json" },
  });
  if (!resp.ok) throw new Error(`voices ${resp.status}`);
  const data = await resp.json();
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: v.description ?? v.labels?.description ?? "",
  }));
}

export async function synthesize(text, opts = {}) {
  const { apiKey, voiceId, modelId, stability, similarity, style } = opts;
  if (!apiKey) throw new Error("ElevenLabs API key not set — open Settings → Voice Redo.");
  if (!voiceId) throw new Error("voice not selected");
  const body = {
    text,
    model_id: modelId ?? "eleven_turbo_v2_5",
    voice_settings: {
      stability: stability ?? 0.5,
      similarity_boost: similarity ?? 0.75,
      style: style ?? 0.0,
      use_speaker_boost: true,
    },
  };
  const resp = await fetch(`${BASE}/text-to-speech/${voiceId}?optimize_streaming_latency=0`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`elevenlabs ${resp.status}: ${t.slice(0, 200)}`);
  }
  return await resp.blob();
}
