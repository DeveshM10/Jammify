/**
 * moodParser.js
 *
 * Local keyword-based NLP: maps free-text mood prompts to Arranger configurations.
 * Zero network requests. Completes in < 50ms for any prompt under 200 chars.
 *
 * Exports:
 *   parseMood(text, currentConfig?) → MoodParseResult
 *   MOOD_VOCABULARY                  (exported for testing)
 */

// ─── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * 30 mood/vibe keywords each mapped to a partial ArrangementConfig.
 * Numeric fields are averaged when multiple keywords match.
 * Categorical fields use the most-frequent match (mode).
 *
 * @type {Record<string, Partial<ArrangementConfig>>}
 */
export const MOOD_VOCABULARY = {
  // ── Calm / Relaxed ──────────────────────────────────────────────────────
  rainy:       { style: "jazz",      arrangementPreset: "lofi",     energy: 28, vocalIntensity: 35, arrangementDensity: 35, bpm: 72  },
  chill:       { style: "lo-fi",     arrangementPreset: "lofi",     energy: 22, vocalIntensity: 28, arrangementDensity: 30, bpm: 80  },
  lofi:        { style: "lo-fi",     arrangementPreset: "lofi",     energy: 20, vocalIntensity: 25, arrangementDensity: 28, bpm: 78  },
  calm:        { style: "acoustic",  arrangementPreset: "lofi",     energy: 18, vocalIntensity: 25, arrangementDensity: 25, bpm: 70  },
  peaceful:    { style: "acoustic",  arrangementPreset: "lofi",     energy: 15, vocalIntensity: 20, arrangementDensity: 22, bpm: 68  },
  sleep:       { style: "lo-fi",     arrangementPreset: "lofi",     energy: 12, vocalIntensity: 15, arrangementDensity: 18, bpm: 60  },
  lazy:        { style: "lo-fi",     arrangementPreset: "lofi",     energy: 20, vocalIntensity: 22, arrangementDensity: 25, bpm: 75  },
  soft:        { style: "acoustic",  arrangementPreset: "lofi",     energy: 22, vocalIntensity: 30, arrangementDensity: 28, bpm: 76  },
  gentle:      { style: "acoustic",  arrangementPreset: "lofi",     energy: 20, vocalIntensity: 28, arrangementDensity: 25, bpm: 72  },

  // ── Happy / Upbeat ──────────────────────────────────────────────────────
  happy:       { style: "pop",       arrangementPreset: "radio",    energy: 75, vocalIntensity: 72, arrangementDensity: 70, bpm: 120 },
  fun:         { style: "pop",       arrangementPreset: "radio",    energy: 78, vocalIntensity: 75, arrangementDensity: 72, bpm: 124 },
  upbeat:      { style: "pop",       arrangementPreset: "radio",    energy: 80, vocalIntensity: 78, arrangementDensity: 75, bpm: 128 },
  cheerful:    { style: "pop",       arrangementPreset: "radio",    energy: 72, vocalIntensity: 70, arrangementDensity: 68, bpm: 118 },
  playful:     { style: "jazz",      arrangementPreset: "radio",    energy: 65, vocalIntensity: 65, arrangementDensity: 62, bpm: 115 },
  bright:      { style: "pop",       arrangementPreset: "radio",    energy: 74, vocalIntensity: 72, arrangementDensity: 70, bpm: 120 },

  // ── Romantic / Jazz ─────────────────────────────────────────────────────
  romantic:    { style: "jazz",      arrangementPreset: "radio",    energy: 42, vocalIntensity: 62, arrangementDensity: 48, bpm: 88  },
  cafe:        { style: "jazz",      arrangementPreset: "radio",    energy: 38, vocalIntensity: 45, arrangementDensity: 45, bpm: 92  },
  jazz:        { style: "jazz",      arrangementPreset: "radio",    energy: 55, vocalIntensity: 60, arrangementDensity: 58, bpm: 100 },
  evening:     { style: "jazz",      arrangementPreset: "lofi",     energy: 35, vocalIntensity: 42, arrangementDensity: 40, bpm: 85  },
  night:       { style: "jazz",      arrangementPreset: "lofi",     energy: 30, vocalIntensity: 38, arrangementDensity: 38, bpm: 82  },

  // ── Sad / Melancholic ───────────────────────────────────────────────────
  sad:         { style: "cinematic", arrangementPreset: "cinematic",energy: 18, vocalIntensity: 48, arrangementDensity: 28, bpm: 64  },
  melancholy:  { style: "cinematic", arrangementPreset: "cinematic",energy: 20, vocalIntensity: 50, arrangementDensity: 30, bpm: 66  },
  nostalgic:   { style: "acoustic",  arrangementPreset: "cinematic",energy: 30, vocalIntensity: 52, arrangementDensity: 35, bpm: 80  },
  lonely:      { style: "cinematic", arrangementPreset: "cinematic",energy: 15, vocalIntensity: 40, arrangementDensity: 25, bpm: 62  },

  // ── Epic / Powerful ─────────────────────────────────────────────────────
  epic:        { style: "cinematic", arrangementPreset: "epic",     energy: 92, vocalIntensity: 85, arrangementDensity: 90, bpm: 140 },
  cinematic:   { style: "cinematic", arrangementPreset: "cinematic",energy: 75, vocalIntensity: 70, arrangementDensity: 80, bpm: 120 },
  triumphant:  { style: "cinematic", arrangementPreset: "epic",     energy: 90, vocalIntensity: 82, arrangementDensity: 88, bpm: 138 },
  dramatic:    { style: "cinematic", arrangementPreset: "epic",     energy: 80, vocalIntensity: 78, arrangementDensity: 82, bpm: 128 },
  powerful:    { style: "cinematic", arrangementPreset: "epic",     energy: 88, vocalIntensity: 80, arrangementDensity: 85, bpm: 135 },
  battle:      { style: "cinematic", arrangementPreset: "epic",     energy: 95, vocalIntensity: 88, arrangementDensity: 92, bpm: 150 },
  war:         { style: "cinematic", arrangementPreset: "epic",     energy: 95, vocalIntensity: 85, arrangementDensity: 90, bpm: 148 },

  // ── Energy / Rock ───────────────────────────────────────────────────────
  hype:        { style: "rock",      arrangementPreset: "live-band",energy: 95, vocalIntensity: 88, arrangementDensity: 90, bpm: 160 },
  energetic:   { style: "rock",      arrangementPreset: "live-band",energy: 90, vocalIntensity: 82, arrangementDensity: 88, bpm: 148 },
  intense:     { style: "rock",      arrangementPreset: "live-band",energy: 88, vocalIntensity: 80, arrangementDensity: 85, bpm: 145 },
  angry:       { style: "rock",      arrangementPreset: "epic",     energy: 92, vocalIntensity: 75, arrangementDensity: 88, bpm: 155 },
  driving:     { style: "rock",      arrangementPreset: "live-band",energy: 85, vocalIntensity: 78, arrangementDensity: 82, bpm: 142 },
  fast:        { style: "rock",      arrangementPreset: "live-band",energy: 88, vocalIntensity: 80, arrangementDensity: 85, bpm: 155 },

  // ── Mysterious / Dark ───────────────────────────────────────────────────
  dark:        { style: "cinematic", arrangementPreset: "cinematic",energy: 58, vocalIntensity: 38, arrangementDensity: 65, bpm: 98  },
  mysterious:  { style: "cinematic", arrangementPreset: "cinematic",energy: 48, vocalIntensity: 40, arrangementDensity: 55, bpm: 90  },
  tense:       { style: "cinematic", arrangementPreset: "epic",     energy: 72, vocalIntensity: 45, arrangementDensity: 75, bpm: 115 },
  haunting:    { style: "cinematic", arrangementPreset: "cinematic",energy: 40, vocalIntensity: 42, arrangementDensity: 50, bpm: 82  },

  // ── Acoustic / Folk ─────────────────────────────────────────────────────
  acoustic:    { style: "acoustic",  arrangementPreset: "radio",    energy: 45, vocalIntensity: 55, arrangementDensity: 45, bpm: 100 },
  folk:        { style: "acoustic",  arrangementPreset: "radio",    energy: 42, vocalIntensity: 58, arrangementDensity: 42, bpm: 96  },
  morning:     { style: "acoustic",  arrangementPreset: "radio",    energy: 50, vocalIntensity: 55, arrangementDensity: 48, bpm: 105 },
  country:     { style: "acoustic",  arrangementPreset: "radio",    energy: 55, vocalIntensity: 62, arrangementDensity: 52, bpm: 108 },

  // ── Worship / Inspirational ─────────────────────────────────────────────
  worship:     { style: "cinematic", arrangementPreset: "epic",     energy: 68, vocalIntensity: 75, arrangementDensity: 65, bpm: 108 },
  inspirational: { style: "cinematic", arrangementPreset: "epic",   energy: 72, vocalIntensity: 78, arrangementDensity: 68, bpm: 112 },
  uplifting:   { style: "pop",       arrangementPreset: "radio",    energy: 70, vocalIntensity: 72, arrangementDensity: 65, bpm: 116 },

  // ── Party / Dance ────────────────────────────────────────────────────────
  party:       { style: "pop",       arrangementPreset: "live-band",energy: 88, vocalIntensity: 80, arrangementDensity: 85, bpm: 132 },
  dance:       { style: "pop",       arrangementPreset: "live-band",energy: 85, vocalIntensity: 78, arrangementDensity: 82, bpm: 128 },
  club:        { style: "pop",       arrangementPreset: "live-band",energy: 90, vocalIntensity: 82, arrangementDensity: 88, bpm: 136 },
};

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

/** Compute numeric mean, ignoring undefined values. */
function mean(values) {
  const valid = values.filter((v) => v !== undefined && v !== null);
  if (valid.length === 0) return undefined;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}

/** Return the most-frequent value in an array (mode). */
function mode(values) {
  const freq = {};
  let maxFreq = 0;
  let winner  = undefined;
  for (const v of values) {
    if (v === undefined) continue;
    freq[v] = (freq[v] || 0) + 1;
    if (freq[v] > maxFreq) {
      maxFreq = freq[v];
      winner  = v;
    }
  }
  return winner;
}

// ─── Core Parser ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ArrangementConfig
 * @property {string} style
 * @property {string} arrangementPreset
 * @property {number} energy
 * @property {number} vocalIntensity
 * @property {number} arrangementDensity
 * @property {number} bpm
 */

/**
 * @typedef {Object} MoodParseResult
 * @property {ArrangementConfig} config
 * @property {string}            interpretationText
 * @property {number}            confidence           0–1
 * @property {"local"|"llm"}    source
 * @property {string[]}         matchedKeywords
 */

/**
 * parseMood(text, currentConfig?) → MoodParseResult
 *
 * Tokenises the input, looks up each word in MOOD_VOCABULARY,
 * aggregates matched configs, returns a MoodParseResult.
 *
 * @param {string}             text
 * @param {ArrangementConfig}  currentConfig  Fallback if nothing matches
 * @returns {MoodParseResult}
 */
export function parseMood(text = "", currentConfig = {}) {
  const tokens  = String(text).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const matched = [];

  for (const token of tokens) {
    if (MOOD_VOCABULARY[token]) {
      matched.push({ keyword: token, config: MOOD_VOCABULARY[token] });
    }
  }

  if (matched.length === 0) {
    return {
      config:            currentConfig,
      interpretationText: `"${text}" — no matching mood keywords found`,
      confidence:        0,
      source:            "local",
      matchedKeywords:   [],
    };
  }

  const configs = matched.map((m) => m.config);

  // Aggregate
  const config = {
    style:               mode(configs.map((c) => c.style))               ?? currentConfig.style               ?? "pop",
    arrangementPreset:   mode(configs.map((c) => c.arrangementPreset))   ?? currentConfig.arrangementPreset   ?? "radio",
    energy:              mean(configs.map((c) => c.energy))              ?? currentConfig.energy              ?? 70,
    vocalIntensity:      mean(configs.map((c) => c.vocalIntensity))      ?? currentConfig.vocalIntensity      ?? 65,
    arrangementDensity:  mean(configs.map((c) => c.arrangementDensity))  ?? currentConfig.arrangementDensity  ?? 65,
    bpm:                 mean(configs.map((c) => c.bpm))                 ?? currentConfig.bpm                 ?? 120,
  };

  const keywords     = matched.map((m) => m.keyword).join(", ");
  const confidence   = Math.min(1, matched.length / tokens.length);
  const interpretation = `Interpreted as: ${config.style}, ${config.arrangementPreset} preset, BPM ${config.bpm}, energy ${config.energy}`;

  return {
    config,
    interpretationText: interpretation,
    confidence,
    source:           "local",
    matchedKeywords:  matched.map((m) => m.keyword),
  };
}
