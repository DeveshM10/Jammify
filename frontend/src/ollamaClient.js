/**
 * ollamaClient.js
 *
 * Optional LLM bridge to a locally running Ollama instance.
 * Falls back gracefully to null on any error so the caller can
 * use moodParser.js local matching instead.
 *
 * LLM model: tries llama3.2 → llama3.1 → llama3 in order.
 * The first available model on the local Ollama instance is used.
 *
 * Exports:
 *   queryOllama(prompt, model?)  → Promise<ArrangementConfig | null>
 *   isOllamaAvailable()          → Promise<boolean>
 *   detectAvailableModel()       → Promise<string|null>
 */

const OLLAMA_BASE_URL = "http://localhost:11434";

// Model preference order — newest first, widest fallback last
const MODEL_PREFERENCE = ["llama3.2", "llama3.1", "llama3", "mistral", "gemma2"];

const TIMEOUT_MS = 10000; // 10s — enough for first-token on a mid-range laptop

// Valid value sets for field validation
const VALID_STYLES  = ["pop", "rock", "cinematic", "lo-fi", "jazz", "acoustic"];
const VALID_PRESETS = ["radio", "live-band", "epic", "lofi", "cinematic"];

// Style aliases the LLM might return instead of our exact keys
const STYLE_ALIASES = {
  lofi: "lo-fi",
  "lo fi": "lo-fi",
  hiphop: "pop",
  "hip-hop": "pop",
  "hip hop": "pop",
  orchestral: "cinematic",
  classical: "cinematic",
  rnb: "pop",
  "r&b": "pop",
  funk: "jazz",
  blues: "jazz",
  country: "acoustic",
  folk: "acoustic",
};

// Preset aliases
const PRESET_ALIASES = {
  "live band": "live-band",
  liveband: "live-band",
  "lo-fi": "lofi",
  lofi: "lofi",
};

const SYSTEM_PROMPT = `You are a music arranger assistant. Given a mood or vibe description, respond ONLY with a single valid JSON object and nothing else — no explanation, no markdown, no code block.

The JSON must have exactly these keys with these allowed values:
{
  "style": one of ["pop", "rock", "cinematic", "lo-fi", "jazz", "acoustic"],
  "arrangementPreset": one of ["radio", "live-band", "epic", "lofi", "cinematic"],
  "energy": integer 0-100,
  "vocalIntensity": integer 0-100,
  "arrangementDensity": integer 0-100,
  "bpm": integer 60-200
}

Example response for "rainy café jazz evening":
{"style":"jazz","arrangementPreset":"lofi","energy":28,"vocalIntensity":35,"arrangementDensity":38,"bpm":72}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from a string, even if surrounded by prose
 * or wrapped in a markdown code block.
 */
function extractJSON(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "");
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Normalise and validate all fields of a raw LLM response object.
 * Handles common LLM variants (lofi/lo-fi, live band/live-band, etc.)
 * Returns a clean ArrangementConfig or null if required fields are missing.
 */
function validateConfig(raw) {
  if (!raw || typeof raw !== "object") return null;

  // Normalise style — handle aliases
  const rawStyle = String(raw.style || "").toLowerCase().trim();
  const style = VALID_STYLES.includes(rawStyle)
    ? rawStyle
    : STYLE_ALIASES[rawStyle]
    || VALID_STYLES.find(s => rawStyle.includes(s))
    || null;

  // Normalise preset — handle aliases
  const rawPreset = String(raw.arrangementPreset || raw.preset || "").toLowerCase().trim();
  const preset = VALID_PRESETS.includes(rawPreset)
    ? rawPreset
    : PRESET_ALIASES[rawPreset]
    || VALID_PRESETS.find(p => rawPreset.includes(p))
    || null;

  if (!style || !preset) return null;

  const clamp = (v, min, max) => {
    const n = Number(v);
    return isNaN(n) ? Math.round((min + max) / 2) : Math.min(max, Math.max(min, Math.round(n)));
  };

  return {
    style,
    arrangementPreset:  preset,
    energy:             clamp(raw.energy,             0,   100),
    vocalIntensity:     clamp(raw.vocalIntensity,     0,   100),
    arrangementDensity: clamp(raw.arrangementDensity ?? raw.density ?? raw.arrangement_density, 0, 100),
    bpm:                clamp(raw.bpm,                60,  200),
  };
}

// ─── Availability + Model Detection ──────────────────────────────────────────

/**
 * Quick check: returns true if Ollama is running locally.
 * Times out in 2 seconds.
 */
export async function isOllamaAvailable() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Detect which model to use from the local Ollama instance.
 * Tries MODEL_PREFERENCE in order, picks the first one available.
 * Returns the model name string, or null if none found.
 *
 * @returns {Promise<string|null>}
 */
export async function detectAvailableModel() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) return null;

    const data = await res.json();
    // data.models is an array of { name, ... }
    const installed = (data.models || []).map(m => String(m.name || "").split(":")[0].toLowerCase());

    for (const preferred of MODEL_PREFERENCE) {
      if (installed.some(m => m.includes(preferred))) {
        return preferred;
      }
    }

    // Fall back to whatever is first installed
    return installed[0] || null;
  } catch {
    return null;
  }
}

// ─── Main Query ───────────────────────────────────────────────────────────────

/**
 * queryOllama(prompt, model?) → Promise<ArrangementConfig | null>
 *
 * Auto-detects the best available local model if none is specified.
 * Returns null on any error so caller can fall back to moodParser.js.
 *
 * @param {string}  prompt
 * @param {string}  [model]   Override the auto-detected model
 * @returns {Promise<import('./moodParser.js').ArrangementConfig | null>}
 */
export async function queryOllama(prompt, model = null) {
  // Auto-detect model if not specified
  const resolvedModel = model || await detectAvailableModel();
  if (!resolvedModel) return null; // no models installed

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = JSON.stringify({
    model:  resolvedModel,
    prompt: `${SYSTEM_PROMPT}\n\nMood description: "${prompt}"\n\nJSON response:`,
    stream: false,
    options: {
      temperature: 0.2,  // very low — we want deterministic JSON
      num_predict: 256,  // enough for any valid 6-field JSON response
      stop: ["\n\n", "```"],
    },
  });

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal:  controller.signal,
    });

    clearTimeout(timerId);

    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.response || "";

    const raw    = extractJSON(text);
    const config = validateConfig(raw);

    return config; // null if invalid fields
  } catch {
    clearTimeout(timerId);
    return null;
  }
}
