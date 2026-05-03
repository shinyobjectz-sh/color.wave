// Env contract — varlock-style. Reads manifest.env from the embedded
// workbook-spec script tag; resolves values from window.WORKBOOK_ENV,
// then localStorage. Exposes a Svelte-reactive view so the UI can
// gate on "key set?" and update LLM clients on change.

const SLUG = "colorwave";

function envStorageKey(key) {
  return `wb.env.${SLUG}.${key}`;
}

function readManifestEnv() {
  if (typeof document === "undefined") return {};
  const el = document.getElementById("workbook-spec");
  if (!el) return {};
  try {
    const spec = JSON.parse(el.textContent || "{}");
    return spec?.manifest?.env ?? {};
  } catch { return {}; }
}

function getStored(key) {
  const injected = (typeof window !== "undefined" && window.WORKBOOK_ENV) || null;
  if (injected && typeof injected[key] === "string" && injected[key]) return injected[key];
  return localStorage.getItem(envStorageKey(key)) ?? "";
}

// Static fallback list — used until the dynamic OpenRouter catalog
// (lib/modelCatalog.svelte.js) finishes its first fetch, and as a
// safety net if the network is unreachable. Kept short so the
// fallback picker isn't a wall of options the user can't scan.
export const MODEL_PRESETS = [
  { id: "google/gemini-3.1-pro-preview-customtools", label: "Gemini 3.1 Pro Preview · custom-tools (default)" },
  { id: "anthropic/claude-opus-4.7",   label: "Claude Opus 4.7" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-haiku-4.5",  label: "Claude Haiku 4.5" },
  { id: "openai/gpt-5.1",              label: "GPT-5.1" },
];
// Gemini 3.1 Pro (custom-tools preview) is currently the strongest
// pairing for our agent loop — long-context reasoning + tight
// tool-call adherence. Users can still pick anything via the
// dropdown; this just sets the out-of-the-box model.
const DEFAULT_MODEL = "google/gemini-3.1-pro-preview-customtools";

class EnvStore {
  decls = readManifestEnv();
  values = $state({});
  model  = $state(DEFAULT_MODEL);

  constructor() {
    // Default declaration if the manifest didn't provide one (dev mode).
    if (!this.decls.OPENROUTER_API_KEY) {
      this.decls.OPENROUTER_API_KEY = { required: true, secret: true };
    }
    for (const k of Object.keys(this.decls)) this.values[k] = getStored(k);
    const stored = localStorage.getItem(envStorageKey("MODEL"));
    if (stored) this.model = stored;
  }

  set(key, value) {
    const v = (value ?? "").trim();
    if (v) localStorage.setItem(envStorageKey(key), v);
    else localStorage.removeItem(envStorageKey(key));
    this.values[key] = v;
  }

  setModel(id) {
    const v = (id ?? "").trim() || DEFAULT_MODEL;
    this.model = v;
    localStorage.setItem(envStorageKey("MODEL"), v);
  }

  get satisfied() {
    for (const [k, decl] of Object.entries(this.decls)) {
      if (decl.required && !this.values[k]?.trim()) return false;
    }
    return true;
  }

  get openrouterKey() {
    return this.values.OPENROUTER_API_KEY ?? "";
  }
}

export const env = new EnvStore();
