// clip-id — derive a stable id for a clip by hashing src + start + duration.
// Independent of clip position in the timeline; survives drag.

export async function clipIdOf(src, start, duration) {
  const enc = new TextEncoder().encode(`${src}|${start.toFixed(3)}|${duration.toFixed(3)}`);
  if (crypto.subtle?.digest) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: djb2
  let h = 5381;
  for (let i = 0; i < enc.length; i++) h = ((h << 5) + h + enc[i]) >>> 0;
  return h.toString(16).padStart(8, "0");
}
