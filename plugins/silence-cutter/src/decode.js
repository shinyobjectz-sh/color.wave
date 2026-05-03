// decode — Blob → mono Float32 PCM at 16 kHz (Whisper's input rate).
//
// We don't ship FFmpeg; we use the browser's WebAudio decoder. Most
// .mp4/.webm/.mov containers decode fine on Chrome/Safari. For cases
// where decodeAudioData refuses, callers are expected to extract audio
// upstream (the timeline-clip-action surfaces an error and offers
// ffmpeg.wasm as a future opt-in).

const TARGET_RATE = 16000;

export async function decodeToMono16k(blob) {
  const arrayBuf = await blob.arrayBuffer();
  // Use a temporary AudioContext just for decoding. Sample-rate hints
  // aren't honored by all browsers, so we resample manually.
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await ac.decodeAudioData(arrayBuf.slice(0));
  } finally {
    ac.close().catch(() => {});
  }
  const ch0 = decoded.getChannelData(0);
  const monoMix = decoded.numberOfChannels > 1
    ? mixToMono(decoded)
    : ch0;
  return resampleLinear(monoMix, decoded.sampleRate, TARGET_RATE);
}

function mixToMono(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  const chs = buf.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  for (let i = 0; i < n; i++) out[i] /= chs;
  return out;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Repackage a mono Float32Array as a 16-bit PCM WAV blob — the
 * format HF whisper-large-v3 accepts most reliably.
 */
export function pcmToWav(pcm, sampleRate = TARGET_RATE) {
  const numSamples = pcm.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // PCM format
  view.setUint16(22, 1, true);             // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);            // bits per sample
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function writeStr(view, offset, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export const SAMPLE_RATE = TARGET_RATE;
