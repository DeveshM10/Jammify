/**
 * ollamaClient.js
 *
 * Optional LLM bridge to a locally running Ollama instance.
 * Falls back gracefully to null on any error so the caller can
 * use moodParser.js local matching instead.
 *
 * Exports:
 *   queryOllama(prompt, model?)  → Promise<ArrangementConfig | null>
 *   isOllamaAvailable()          → Promise<boolean>
 */

const OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL   = "llama3";
const TIMEOUT_MS      = 8000; // Don't block the demo for > 8s

// Valid value sets for field validation
const VALID_STYLES   = ["pop", "rock", "cinematic", "lo-fi", "jazz", "acoustic"];
const VALID_PRESETS  = ["radio", "live-band", "epic", "lofi", "cinematic"];

const SYSTEM_PROMPT = `You are a music arranger assistant. Given a mood or vibe description, respond ONLY with valid JSON and nothing else. The JSON must have exactly these keys:
{
  "style": one of ["pop","rock","cinematic","lo-fi","jazz","acoustic"],
  "arrangementPreset": one of ["radio","live-band","epic","lofi","cinematic"],
  "energy": integer 0-100,
  "vocalIntensity": integer 0-100,
  "arrangementDensity": integer 0-100,
  "bpm": integer 60-200
}
Do not include any explanation, markdown, or text outside the JSON object.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the first JSON object from a string, even if surrounded by prose.
 */
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Validate and clamp all fields of a raw LLM response object.
 * Returns the cleaned config or null if required fields are missing.
 */
function validateConfig(raw) {
  if (!raw || typeof raw !== "object") return null;

  const style   = VALID_STYLES.includes(raw.style)  ? raw.style  : null;
  const preset  = VALID_PRESETS.includes(raw.arrangementPreset) ? raw.arrangementPreset : null;

  if (!style || !preset) return null;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));

  return {
    style,
    arrangementPreset:  preset,
    energy:             clamp(raw.energy,             0,   100),
    vocalIntensity:     clamp(raw.vocalIntensity,     0,   100),
    arrangementDensity: clamp(raw.arrangementDensity ?? raw.density, 0, 100),
    bpm:                clamp(raw.bpm,                60,  200),
  };
}

// ─── Availability Check ──────────────────────────────────────────────────────

/**
 * Quick check: returns true if the Ollama server responds to /api/tags.
 * Times out in 2 seconds to avoid blocking the UI.
 *
 * @returns {Promise<boolean>}
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

// ─── Main Query ───────────────────────────────────────────────────────────────

/**
 * queryOllama(prompt, model?) → Promise<ArrangementConfig | null>
 *
 * Sends the mood prompt to Ollama and returns a validated ArrangementConfig.
 * Returns null on any error (network failure, timeout, invalid JSON, missing fields).
 *
 * @param {string} prompt
 * @param {string} [model]
 * @returns {Promise<import('./moodParser.js').ArrangementConfig | null>}
 */
export async function queryOllama(prompt, model = DEFAULT_MODEL) {
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const body = JSON.stringify({
    model,
    prompt: `${SYSTEM_PROMPT}\n\nMood: ${prompt}`,
    stream: false,
    options: {
      temperature: 0.3,  // low temperature for more predictable JSON output
      num_predict: 150,
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

    return config; // null if invalid
  } catch {
    clearTimeout(timerId);
    return null;
  }
}
