// ACP-backed agent — runs the user's local Claude Code or Codex CLI
// (over their subscription) in place of colorwave's built-in
// OpenRouter-driven loop.
//
// Design (Phase 2-revised, May 2026):
//
// The underlying CLIs (claude, codex) use their OWN native Read /
// Write / Bash / Edit tools, which hit the real filesystem. ACP's
// `fs/read_text_file` / `fs/write_text_file` are client-side
// methods but adapter shims do NOT surface them to the wrapped
// agent as tools. So a virtualFs alone in the browser doesn't
// expose anything to the agent.
//
// The fix is bidirectional file sync between the workbook's live
// state and the daemon's per-session scratch dir:
//
//   1. Before connecting, browser POSTs the workbook's logical
//      files to /wb/<token>/agent/seed. Daemon writes them to the
//      scratch dir as REAL files.
//   2. Agent's cwd is the scratch dir, so its native Read /Bash
//      tools find composition.html, skills/fal-ai/SKILL.md, etc.
//   3. When the agent edits a file, the daemon's notify-rs
//      watcher fires, coalesces the burst, and sends a
//      _relay/file-changed notification over the WebSocket with
//      the new content.
//   4. Browser routes that notification to the right setter —
//      composition.html lands via composition.set(), other paths
//      are ignored (or read-only).
//
// Consequence: the substrate stays the source of truth, the agent
// works on real files (so its native tools just work), and edits
// flow live into the iframe player. Cmd+S persists via the
// existing substrate flow.

import { connect, seed } from "@work.books/runtime/agent-acp";
import { composition } from "./composition.svelte.js";
import { assets } from "./assets.svelte.js";
import { listSkillFiles, loadSkill } from "./skills.js";
import { userSkills } from "./userSkills.svelte.js";
import {
  request as requestPermission,
  clearAll as clearAllPermissions,
} from "./acpPermissions.svelte.js";

/** @type {import("@work.books/runtime/agent-acp").AcpSession | null} */
let _session = null;
let _adapter = null;
let _sessionId = null;

const SYSTEM_PROMPT = `\
You are running inside the colorwave workbook — a single-file HyperFrames composition editor.

YOUR WORKING DIRECTORY (cwd) IS PRE-SEEDED with the workbook's logical files:

  composition.html              — the live composition. Edit this; the
                                  user's iframe player updates immediately
                                  and ⌘S persists.
  meta.json                     — workbook metadata (size, clip count, etc.)
  skills/<name>/SKILL.md        — authoring skills you can read for guidance:
                                    skills/hyperframes/SKILL.md
                                    skills/hyperframes/house-style.md
                                    skills/hyperframes/data-in-motion.md
                                    skills/gsap/SKILL.md
                                    skills/fal-ai/SKILL.md
                                    skills/elevenlabs/SKILL.md
                                    skills/runway/SKILL.md
                                    skills/huggingface/SKILL.md

Use your native Read / Write / Edit / Bash tools normally — these are real
files on disk. When you write to composition.html, the daemon watches and
streams the change live into the workbook so the user sees the result in
the player as you save.

For external API calls (fal, ElevenLabs, etc.) the user has stored their
keys in the OS keychain. The skills describe the wb-fetch invocation shape.
This connection has real bash + real curl available, but the keys aren't in
your env — they're daemon-side. Phase 5 of the secrets work will expose a
small fetch tool that proxies through the daemon. For now, prefer
composition edits over network calls; for tasks that require network,
tell the user what you'd do and ask them to run it manually.

Default to small, surgical changes. Read composition.html first, plan the
edit, write it back. Don't rewrite the whole file when patching one scene.\
`;

/** Build the seed map: workbook's logical files → string contents.
 *  Sent to the daemon at session start and materialized into the
 *  scratch dir as real files. */
function buildSeedFiles() {
  /** @type {Record<string, string>} */
  const files = {
    "composition.html": composition.html,
    "meta.json": JSON.stringify(
      {
        name: "colorwave",
        slug: "colorwave",
        type: "spa",
        composition_chars: composition.html.length,
        clip_count: composition.clips?.length ?? 0,
        duration_seconds: composition.totalDuration ?? 0,
      },
      null,
      2,
    ),
  };
  for (const key of listSkillFiles()) {
    const md = loadSkill(key);
    if (typeof md === "string") {
      files[`skills/${key}.md`] = md;
    }
  }
  for (const us of userSkills.items ?? []) {
    files[`skills/user/${us.name}.md`] = us.content;
  }
  return files;
}

/** When the watcher reports a scratch file changed, route into the
 *  workbook's state.
 *  - composition.html → composition store
 *  - binary media files dropped by the agent (the cwd it sees is
 *    the scratch dir; tools that produce PNG/WAV/MP4 land them
 *    here) → asset store as base64 data URLs
 *  - everything else is ignored so a stray `npm install` can't
 *    pollute state. */
function applyFileChange(notification) {
  const { path, binary, content, content_b64, mime, size } = notification;
  if (!path) return;

  if (path === "composition.html") {
    if (typeof content === "string" && content !== composition.html) {
      composition.set(content);
    }
    return;
  }

  // Binary asset round-trip. The agent's tool wrote a PNG / WAV /
  // MP4 / etc. into its cwd; rebuild a Blob from the base64 and let
  // the asset store handle classification + duration probing +
  // dataUrl conversion. Path is preserved as the asset's name so
  // the agent can subsequently reference it (a follow-up turn that
  // edits composition.html with the same filename will Just Work).
  if (binary === true && typeof content_b64 === "string") {
    if (typeof size === "number" && size > 50 * 1024 * 1024) {
      console.warn(`[acp] skipping oversized binary asset ${path} (${size} bytes)`);
      return;
    }
    const mimeStr = mime || "application/octet-stream";
    if (!/^(image|audio|video)\//.test(mimeStr) && mimeStr !== "image/svg+xml") {
      // Unsupported binary kind — don't pollute the asset library
      // with random binary blobs the agent leaves around.
      return;
    }
    try {
      const bin = atob(content_b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: mimeStr });
      // Mirror a File so addFromFile's `file.name` / `.type` lookups
      // work (Blob alone doesn't expose name).
      const fname = path.split("/").pop() || path;
      const file = new File([blob], fname, { type: mimeStr });
      assets.addFromFile(file).catch((e) => {
        console.warn(`[acp] addFromFile failed for ${path}:`, e?.message ?? e);
      });
    } catch (e) {
      console.warn(`[acp] base64 decode failed for ${path}:`, e?.message ?? e);
    }
    return;
  }

  // Skills are agent-readable but not agent-writable in this phase.
  // Any other text path is ignored.
}

async function ensureSession(adapter, onSessionUpdate) {
  if (_session && _adapter === adapter) {
    _session.setHooks({
      onSessionUpdate,
      onFileChanged: applyFileChange,
    });
    return _session;
  }

  if (_session) {
    try { _session.close(); } catch {}
    _session = null;
    _sessionId = null;
    // Cancel any outstanding permission prompts from the prior
    // session so they don't dangle in the UI when the user switches
    // adapters mid-thread.
    clearAllPermissions();
  }

  // Seed the scratch dir BEFORE the WebSocket upgrade so the
  // adapter's spawn finds files already in place.
  await seed({ files: buildSeedFiles() });

  const session = await connect({
    adapter,
    hooks: {
      onSessionUpdate,
      onFileChanged: applyFileChange,
      // Surfaces session/request_permission as an inline chat card
      // instead of auto-approving the first option (the SDK default).
      // The Promise here is what the SDK forwards back to the
      // adapter — it doesn't resolve until the user clicks.
      onRequestPermission: requestPermission,
    },
  });

  await session.initialize();
  const newSess = await session.newSession({ cwd: ".", mcpServers: [] });
  _session = session;
  _adapter = adapter;
  _sessionId = newSess.sessionId;
  return session;
}

const _systemSeeded = new Set();

/** Send a user message through the ACP session. */
export async function promptAcp({ adapter, text, onUpdate }) {
  const session = await ensureSession(adapter, onUpdate);
  const prompt = [{ type: "text", text }];

  // Seed the system context only on the first turn of a fresh session.
  // Subsequent turns reuse the same sessionId — Claude / Codex carry
  // the prior turn's system message via their session memory.
  if (!_systemSeeded.has(_sessionId)) {
    _systemSeeded.add(_sessionId);
    prompt.unshift({
      type: "text",
      text: `<workbook-context>\n${SYSTEM_PROMPT}\n</workbook-context>\n\n`,
    });
  }

  // Refresh the seed before each turn so the agent sees the user's
  // most recent composition state (e.g. they dragged a clip
  // between turns). The daemon overwrites the existing scratch
  // file in place; if the agent's mid-turn it might race, but
  // that's an edge case we'll address with proper diff-based
  // sync in a later phase.
  try { await seed({ files: buildSeedFiles() }); } catch { /* best-effort */ }

  const result = await session.prompt({
    sessionId: _sessionId,
    prompt,
  });
  return result;
}

/** Cancel the in-flight prompt, if any. */
export function cancelAcp() {
  if (_session && _sessionId) {
    _session.cancel(_sessionId);
  }
}

/** Tear down the ACP connection. */
export function closeAcp() {
  if (_session) {
    try { _session.close(); } catch {}
    _session = null;
    _sessionId = null;
    _adapter = null;
    _systemSeeded.clear();
    clearAllPermissions();
  }
}
