// Dynamic OpenRouter model catalog. Fetched from openrouter.ai's
// public /api/v1/models endpoint (no auth required), cached in
// localStorage for 24h so a returning user sees the picker
// instantly while we refresh in the background.
//
// Icons: OpenRouter doesn't ship icon URLs in the public API. We
// derive a provider favicon by mapping the model id's prefix
// (`anthropic/...`, `openai/...`, `google/...`) to the lab's
// website and asking Google's public favicon service for it. Falls
// back to a generic placeholder when the prefix is unknown.
//
// Reactivity: this is a $state-backed store. Components import
// `modelCatalog` and read `.models`, `.loading`, `.error`. Calling
// `.refresh()` forces a network round-trip; `.ensure()` only
// fetches when the cache is missing or stale.

const CACHE_KEY = "wb.colorwave.openrouterModels.v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const ENDPOINT = "https://openrouter.ai/api/v1/models";

// Prefix → favicon source. Domain choice prioritises the lab's
// canonical homepage so favicons stay recognizable. When OpenRouter
// adds a provider not in this table, the catalog falls back to a
// generic chip — no broken-image squares.
const PROVIDER_DOMAIN = {
  anthropic: "anthropic.com",
  openai: "openai.com",
  google: "google.com",
  "google-vertex": "google.com",
  mistralai: "mistral.ai",
  "meta-llama": "meta.com",
  meta: "meta.com",
  microsoft: "microsoft.com",
  qwen: "qwen.ai",
  minimax: "minimax.io",
  deepseek: "deepseek.com",
  cohere: "cohere.com",
  nvidia: "nvidia.com",
  "x-ai": "x.ai",
  xai: "x.ai",
  amazon: "amazon.com",
  "01-ai": "01.ai",
  perplexity: "perplexity.ai",
  "perplexity-ai": "perplexity.ai",
  togetherai: "together.ai",
  inflection: "inflection.ai",
  databricks: "databricks.com",
  ai21: "ai21.com",
  liquid: "liquid.ai",
  reka: "reka.ai",
  thudm: "tsinghua.edu.cn",
  cognitivecomputations: "cognitivecomputations.com",
  nousresearch: "nousresearch.com",
  openchat: "openchat.team",
  "neversleep": "huggingface.co",
  "moonshotai": "moonshot.cn",
  "baidu": "baidu.com",
  "alibaba": "alibaba.com",
};

function iconForModelId(id) {
  const prefix = (id ?? "").split("/")[0]?.toLowerCase();
  const host = PROVIDER_DOMAIN[prefix];
  if (!host) return null;
  // Google's favicon service is the most reliable cross-origin
  // anonymous source — it fetches and re-serves the favicon, so
  // we don't have to deal with CORS on the lab's own site.
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fetchedAt || !Array.isArray(parsed?.models)) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(models) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      models,
    }));
  } catch {}
}

function normalizeOne(raw) {
  if (!raw?.id) return null;
  const provider = raw.id.split("/")[0] ?? "";
  // OpenRouter's `name` is "Provider: Model Family", which is
  // perfect for display — strip the redundant "Provider: " when
  // we render alongside an icon, but keep the field intact.
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    provider,
    description: raw.description ?? "",
    contextLength: raw.context_length ?? raw.top_provider?.context_length ?? null,
    pricing: raw.pricing ?? null,
    iconUrl: iconForModelId(raw.id),
  };
}

class ModelCatalog {
  models = $state(/** @type {Array<any>} */ ([]));
  loading = $state(false);
  error = $state(/** @type {string | null} */ (null));
  fetchedAt = $state(/** @type {number | null} */ (null));

  constructor() {
    const cached = readCache();
    if (cached) {
      this.models = cached.models;
      this.fetchedAt = cached.fetchedAt;
    }
  }

  /** Fetch only when cache is stale or empty. */
  async ensure() {
    const fresh = this.fetchedAt && (Date.now() - this.fetchedAt < CACHE_TTL_MS);
    if (fresh && this.models.length) return;
    await this.refresh();
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true;
    this.error = null;
    try {
      const r = await fetch(ENDPOINT, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`OpenRouter /models: HTTP ${r.status}`);
      const j = await r.json();
      const arr = Array.isArray(j?.data) ? j.data : [];
      const normalized = arr.map(normalizeOne).filter(Boolean);
      // Pin Anthropic / OpenAI / Google to the top — the labs most
      // users reach for first. Everything else stays in OpenRouter's
      // returned order (rough usage popularity).
      const PIN_ORDER = ["anthropic", "openai", "google"];
      normalized.sort((a, b) => {
        const ai = PIN_ORDER.indexOf(a.provider);
        const bi = PIN_ORDER.indexOf(b.provider);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      this.models = normalized;
      this.fetchedAt = Date.now();
      writeCache(normalized);
    } catch (e) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  /** Look up a single entry by id; returns null when not in catalog. */
  get(id) {
    return this.models.find((m) => m.id === id) ?? null;
  }
}

export const modelCatalog = new ModelCatalog();
export { iconForModelId };
