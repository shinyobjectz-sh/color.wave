// User-uploaded skill registry — drag-and-drop markdown files the
// agent can load via `load_skill("user/<name>")`.
//
// Storage: a Yjs Array keyed "user-skills" inside the workbook's
// CRDT doc (see yjsBackend.svelte.js). Round-trips through the
// .workbook.html file on Cmd+S. Browser-side persistence via the
// y-indexeddb provider attached at boot.
//
// The agent's load_skill tool checks this registry alongside the
// vendored skills bundle (see skills.js). User skills are always
// prefixed `user/` to distinguish them from vendored ones.

import { wb } from "@work.books/runtime";
import { bootstrapYjs, getDoc } from "./yjsBackend.svelte.js";

// User skills are keyed by `name` (the load_skill agent tool prefixes
// `user/`). wb.collection requires `.id` — we adapt by storing
// records as `{ id: name, name, content }` so the SDK's dedupe-by-id
// pattern collapses duplicate uploads of the same skill name.
//
// Legacy wire format: pre-SDK workbooks stored `{name, content}`
// entries with no `id`. The SDK's reader skips ill-shaped entries,
// so legacy data would disappear. Our hydration step (see migrateLegacy
// below) reads the underlying Y.Array once and rewrites any legacy
// records into the new id-keyed shape, preserving the user's skills
// across the upgrade. Same intent as before; container API renamed.
const USER_SKILLS_LIST = "user-skills";
const userSkillsCollection = wb.collection(USER_SKILLS_LIST);

/** One-time migration: walk the raw Y.Array and rewrite any legacy
 *  `{name, content}` entries into `{id, name, content}` so the SDK
 *  reader picks them up. Idempotent. */
async function migrateLegacy() {
  await bootstrapYjs();
  const doc = getDoc();
  if (!doc) return;
  const list = doc.getArray(USER_SKILLS_LIST);
  let changed = false;
  const next = [];
  for (const v of list.toArray()) {
    if (typeof v !== "string") continue;
    let parsed;
    try { parsed = JSON.parse(v); } catch { continue; }
    if (!parsed || typeof parsed !== "object") continue;
    if (typeof parsed.id !== "string" || !parsed.id) {
      if (typeof parsed.name === "string" && parsed.name) {
        parsed = { id: parsed.name, ...parsed };
        changed = true;
      } else {
        continue; // unrecoverable
      }
    }
    next.push(parsed);
  }
  if (!changed) return;
  doc.transact(() => {
    if (list.length > 0) list.delete(0, list.length);
    if (next.length > 0) list.push(next.map((r) => JSON.stringify(r)));
  });
}

const MAX_SKILL_BYTES = 1 * 1024 * 1024; // 1 MB markdown file cap

class UserSkillsStore {
  // [{ name, content }]  where name is the unprefixed skill key
  // (e.g. "house-style") — the load_skill agent tool prefixes
  // "user/" automatically.
  items = $state([]);
  hydrated = $state(false);

  constructor() {
    // Run the legacy-shape migration BEFORE the SDK's first read so
    // pre-SDK workbooks don't appear empty on first open. The SDK
    // subscription below picks up the migrated entries on the next
    // commit fire.
    migrateLegacy().catch((e) => console.warn("user-skills: migrate failed:", e?.message ?? e));

    userSkillsCollection.subscribe((list) => {
      // Strip the synthesized `id` field on read so consumers (which
      // expect `{name, content}`) keep working. Items are returned
      // sorted by insertion order; the legacy code didn't sort either.
      this.items = list.map(({ name, content }) => ({ name, content }));
      this.hydrated = true;
    });
    userSkillsCollection.ready().then(() => { this.hydrated = true; })
      .catch(() => { this.hydrated = true; });
  }

  /** Add a skill from a markdown File object. The skill name is
   *  derived from the file name (stripped of .md) — must match
   *  /^[a-z0-9][a-z0-9_-]*$/ once normalized. */
  async addFromFile(file) {
    if (!file) throw new Error("no file");
    if (file.size > MAX_SKILL_BYTES) {
      throw new Error(`Skill too large (${(file.size / 1024).toFixed(1)} KB) — limit is 1 MB.`);
    }
    const text = await file.text();
    if (!text.trim()) throw new Error("Skill file is empty");

    const name = String(file.name)
      .replace(/\.md$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (!name) throw new Error("Couldn't derive a valid skill name from the file");

    if (this.items.some((s) => s.name === name)) {
      throw new Error(`A skill named '${name}' already exists. Remove it first or rename the file.`);
    }

    const skill = { name, content: text };
    this.items = [...this.items, skill];
    userSkillsCollection.upsert({ id: name, ...skill });
    return skill;
  }

  async addFromText(name, content) {
    const trimmed = String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    if (!trimmed) throw new Error("name is required");
    if (this.items.some((s) => s.name === trimmed)) {
      throw new Error(`A skill named '${trimmed}' already exists.`);
    }
    const skill = { name: trimmed, content: String(content ?? "") };
    this.items = [...this.items, skill];
    userSkillsCollection.upsert({ id: trimmed, ...skill });
    return skill;
  }

  remove(name) {
    this.items = this.items.filter((s) => s.name !== name);
    userSkillsCollection.remove(name);
  }

  /** Lookup by unprefixed name. The skills.js loadSkill checks here
   *  before falling back to the vendored bundle. */
  get(name) {
    return this.items.find((s) => s.name === name) ?? null;
  }
}

export const userSkills = new UserSkillsStore();
