import tiktok from "./tiktok.js";
import mrbeast from "./mrbeast.js";
import apple from "./apple-keynote.js";
import srt from "./srt.js";

export const PACKS = [tiktok, mrbeast, apple, srt];

export function findPack(id) {
  return PACKS.find((p) => p.id === id) ?? PACKS[0];
}

export const DEFAULT_PACK_ID = "tiktok";
