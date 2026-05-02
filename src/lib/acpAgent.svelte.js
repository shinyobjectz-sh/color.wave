// ACP-backed agent — runs the user's local Claude Code or Codex CLI
// (over their subscription) in place of colorwave's built-in
// OpenRouter-driven loop.
//
// Architectural choice: the workbook's composition + skills are
// projected as virtual files via the ACP `fs/*` client methods.
// When the agent reads `/workbook/composition.html` it gets the
// LIVE composition state from the running workbook, not a stale
// extract. When it writes, the change goes through composition.set
// — same path as the built-in agent uses, so the iframe player
// updates immediately and Cmd+S persists.
//
// This means we don't need to extract files into the daemon's
// scratch dir, don't need a file watcher, don't need a yjs decode
// in Rust. The substrate stays the source of truth; the agent
// just gets a virtual fs layered on top of it.
//
// One ACP session is reused per (workbook, adapter) pair across
// many user turns — `session/prompt` re-uses the established
// session id.

import { connect } from "@work.books/runtime/agent-acp";
import { composition } from "./composition.svelte.js";
import { listSkillFiles, loadSkill } from "./skills.js";
import { userSkills } from "./userSkills.svelte.js";

/** @type {import("@work.books/runtime/agent-acp").AcpSession | null} */
let _session = null;
let _adapter = null;
let _sessionId = null;
let _onSessionUpdate = null;

function buildVirtualFs() {
  /** @type {Record<string, import("@work.books/runtime/agent-acp").VirtualFsEntry>} */
  const entries = {
    // The composition is the workbook's primary editable surface.
    // Read returns the live string from the composition store;
    // write applies via composition.set, which fires the same
    // substrate WAL + iframe-remount path the built-in agent uses.
    "/workbook/composition.html": {
      read: () => composition.html,
      write: (next) => {
        composition.set(typeof next === "string" ? next : "");
      },
    },
    // Read-only meta — agents can grep the workbook's name + size.
    "/workbook/meta.json": {
      read: () =>
        JSON.stringify(
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
    },
  };
  // Built-in skills (hyperframes, gsap, fal-ai, elevenlabs, ...).
  for (const key of listSkillFiles()) {
    const md = loadSkill(key);
    if (typeof md === "string") {
      entries[`/workbook/skills/${key}.md`] = { read: () => md };
    }
  }
  // User-added skills from the SkillManager.
  for (const us of userSkills.items ?? []) {
    entries[`/workbook/skills/user/${us.name}.md`] = { read: () => us.content };
  }
  return { entries };
}

const SYSTEM_PROMPT = `\
You are running inside the colorwave workbook — a single-file HyperFrames composition editor.

The user's composition lives at /workbook/composition.html. Read or edit it via the ACP fs/read_text_file and fs/write_text_file methods (NOT via shell — those route through the workbook's substrate so the iframe player updates live and the user's ⌘S persists your edits).

Skills you can use:
  /workbook/skills/hyperframes/SKILL.md       — main authoring rules
  /workbook/skills/hyperframes/house-style.md — motion + sizing defaults
  /workbook/skills/hyperframes/data-in-motion.md — stats / charts patterns
  /workbook/skills/gsap/SKILL.md              — GSAP timeline patterns
  /workbook/skills/fal-ai/SKILL.md            — image / video gen via fal.ai
  /workbook/skills/elevenlabs/SKILL.md        — TTS / voice cloning
  /workbook/skills/runway/SKILL.md            — Gen-3/4 video
  /workbook/skills/huggingface/SKILL.md       — Inference API

For external API calls (fal, ElevenLabs, etc.) the user has stored their keys in the OS keychain; the daemon proxies. The skills tell you the wb-fetch invocation shape — but you are running as Claude Code / Codex with REAL bash, so where the skill says "wb-fetch" you can use real curl with the keychain-stored value… EXCEPT the value lives in the daemon, not your environment. Phase 3 of the secrets work will expose those via a dedicated tool; for now, prefer composition edits over network calls.

Default to small, surgical changes. Pull the composition first, plan your edit, write back.\
`;

async function ensureSession(adapter, onSessionUpdate) {
  if (_session && _adapter === adapter) {
    // Re-bind the update callback in case the chat panel mounted
    // a new agent store instance.
    _onSessionUpdate = onSessionUpdate;
    _session.setHooks({
      virtualFs: buildVirtualFs(),
      onSessionUpdate,
    });
    return _session;
  }

  if (_session) {
    try { _session.close(); } catch {}
    _session = null;
    _sessionId = null;
  }

  const session = await connect({
    adapter,
    hooks: {
      virtualFs: buildVirtualFs(),
      onSessionUpdate,
    },
  });
  _onSessionUpdate = onSessionUpdate;

  await session.initialize();
  const newSess = await session.newSession({ cwd: "/", mcpServers: [] });
  _session = session;
  _adapter = adapter;
  _sessionId = newSess.sessionId;
  return session;
}

/** Send a user message through the ACP session.
 *
 *  @param {object} args
 *  @param {"claude"|"codex"} args.adapter Which CLI to run.
 *  @param {string} args.text User's message.
 *  @param {(n: import("@work.books/runtime/agent-acp").SessionNotification) => void} args.onUpdate
 *      Callback for streaming text deltas / tool call updates.
 *  @returns {Promise<{stopReason: string}>}
 */
export async function promptAcp({ adapter, text, onUpdate }) {
  // Capture the original system prompt as the FIRST turn — ACP
  // sessions don't expose a "system" role directly; the convention
  // is to send a leading user message containing setup. Subsequent
  // turns just send the user text.
  const session = await ensureSession(adapter, onUpdate);
  const prompt = [{ type: "text", text }];

  // We send the system context only on the first turn of a new
  // session. Once we have a sessionId already, subsequent prompts
  // skip it.
  const isFirstTurn = !_systemSeeded.has(_sessionId);
  if (isFirstTurn) {
    _systemSeeded.add(_sessionId);
    prompt.unshift({
      type: "text",
      text: `<workbook-context>\n${SYSTEM_PROMPT}\n</workbook-context>\n\n`,
    });
  }

  const result = await session.prompt({
    sessionId: _sessionId,
    prompt,
  });
  return result;
}

const _systemSeeded = new Set();

/** Cancel the in-flight prompt, if any. */
export function cancelAcp() {
  if (_session && _sessionId) {
    _session.cancel(_sessionId);
  }
}

/** Tear down the ACP connection. The user explicitly switched
 *  providers or closed the workbook. */
export function closeAcp() {
  if (_session) {
    try { _session.close(); } catch {}
    _session = null;
    _sessionId = null;
    _adapter = null;
    _onSessionUpdate = null;
    _systemSeeded.clear();
  }
}
