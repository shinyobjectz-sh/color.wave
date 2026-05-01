// Integrations registry — third-party services the agent can call
// via the bash tool when their API key is configured.
//
// Each entry is a static description (id, name, blurb, docs URL,
// envKey) plus a runtime-derived "active" flag (envKey is set in
// localStorage). The matching skill markdown lives at
// src/skills/<id>/SKILL.md and gets surfaced to the agent's system
// prompt automatically via skills.js's import.meta.glob.
//
// Why localStorage and not the workbook file: the .workbook.html is
// shareable by design — saving an API key into it would leak it the
// moment the user sent the file to someone else. Keys live in the
// browser only, scoped per-origin (the daemon URL token).

import { env } from "./env.svelte.js";

/**
 * @typedef {object} Integration
 * @property {string} id           Stable id, matches src/skills/<id>/ dir.
 * @property {string} name         User-facing label.
 * @property {string} blurb        One-line capability summary.
 * @property {string} docsUrl      Where to get the API key + docs.
 * @property {string|null} envKey  EnvStore key for the API key, or
 *                                 null if the service has a useful
 *                                 free tier without auth.
 * @property {string} keyPrefix    Hint shown in the input field.
 * @property {string[]} capabilities  Short bullets of what the
 *                                 agent can do once enabled.
 */

/** @type {Integration[]} */
export const INTEGRATIONS = [
  {
    id: "fal-ai",
    name: "fal.ai",
    blurb: "Hosted inference for image, video, and audio models.",
    docsUrl: "https://fal.ai/dashboard/keys",
    envKey: "FAL_API_KEY",
    keyPrefix: "fal_…",
    capabilities: [
      "image-to-video (Veo, Kling, MiniMax, Runway, Sora)",
      "text-to-image (Flux, SDXL, Imagen)",
      "image edit, upscale, background removal",
      "voice + music generation models",
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    blurb: "High-quality TTS, voice cloning, sound effects, dubbing.",
    docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    envKey: "ELEVENLABS_API_KEY",
    keyPrefix: "sk_…",
    capabilities: [
      "text-to-speech in 30+ languages",
      "voice cloning from short audio samples",
      "sound effect synthesis from text prompts",
      "dubbing video into other languages",
    ],
  },
  {
    id: "runway",
    name: "Runway",
    blurb: "Gen-3 / Gen-4 video generation, image-to-video, lipsync.",
    docsUrl: "https://app.runwayml.com/developer/api",
    envKey: "RUNWAY_API_KEY",
    keyPrefix: "key_…",
    capabilities: [
      "Gen-3 Alpha / Gen-4 text-to-video and image-to-video",
      "lipsync to existing video with new audio",
      "video-to-video style transfer",
    ],
  },
  {
    id: "huggingface",
    name: "HuggingFace",
    blurb: "Inference Endpoints + Hub APIs. Token optional but boosts limits.",
    docsUrl: "https://huggingface.co/settings/tokens",
    envKey: "HUGGINGFACE_TOKEN",
    keyPrefix: "hf_… (optional)",
    capabilities: [
      "Inference API for any public model on the Hub",
      "Spaces API to call hosted demos",
      "Datasets / Models metadata search",
    ],
  },
];

/** Lookup by id. */
export function getIntegration(id) {
  return INTEGRATIONS.find((i) => i.id === id) ?? null;
}

/** Reactive state via Svelte rune — `integrationActive('fal-ai')`
 *  is truthy whenever the localStorage key is present. */
class IntegrationsStore {
  /** Returns true if the integration's API key is configured (or
   *  if it doesn't require one). */
  isActive(id) {
    const it = getIntegration(id);
    if (!it) return false;
    if (!it.envKey) return true;
    return Boolean(env.values[it.envKey]?.trim());
  }

  /** Returns ids of every integration whose key is set — useful for
   *  surfacing "you have these enabled" to the agent's system prompt. */
  get activeIds() {
    return INTEGRATIONS.filter((i) => this.isActive(i.id)).map((i) => i.id);
  }
}

export const integrations = new IntegrationsStore();
