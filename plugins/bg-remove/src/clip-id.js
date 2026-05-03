export async function clipIdOf(src, start, duration) {
  const enc = new TextEncoder().encode(`${src}|${start.toFixed(3)}|${duration.toFixed(3)}`);
  if (crypto.subtle?.digest) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (let i = 0; i < enc.length; i++) h = ((h << 5) + h + enc[i]) >>> 0;
  return h.toString(16).padStart(8, "0");
}
