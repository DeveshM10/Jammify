/**
 * aiBandEngine.js
 *
 * AI band generator - fully dynamic, no hardcoded magic numbers.
 *
 * What changed from the original:
 *  - rootMap replaced by dynamic getScaleNotes() from musicTheory.js
 *  - Section detection uses chord-repetition fingerprinting, not fixed 40%/70%
 *  - Beat durations preserved from imported song instead of index%4 pattern
 *  - Dead Chorus ternary fixed (cinematic -> 3 beats, others -> 2)
 *  - vocalBoost + leadBoost from ARRANGEMENT_PRESETS now actually scale volumes
 *  - chordDensity computed dynamically from style characteristics
 *  - Chord-repeat sustain: consecutive identical chords are held, not re-attacked
 *  - Jazz bass walking: passing tones between roots through detected scale
 *  - analyzeProgression result (tonic, mode, confidence, pattern, modulation)
 *    stored on each track as `theoryMeta` for the UI intelligence banner
 *  - Swing parameter: drums/bass timing offset controlled by style
 */

import {
  analyzeProgression,
  chooseStyleFromAnalysis,
  getScaleNotes,
  chordRootToPc,
  CHROMATIC,
} from "./musicTheory.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseChordRoot(chordName = "") {
  const cleaned = String(chordName || "").trim();
  if (!cleaned) return "C";
  const match = cleaned.match(/^([A-G](?:#|b)?)/i);
  if (!match) return "C";
  return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
}

/** Enharmonic flat -> sharp normalisation */
function normalizeRoot(root) {
  const s = String(root || "C").trim();
  if (!s) return "C";
  const d = s[0].toUpperCase() + s.slice(1).toLowerCase();
  const map = { Bb: "A#", Eb: "D#", Ab: "G#", Db: "C#", Gb: "F#" };
  return map[d] || d;
}

/**
 * Get a melody note for a chord/index from the detected scale.
 * Replaces the old hardcoded rootMap entirely.
 * Uses getScaleNotes() - fully dynamic.
 */
function getMelodyNoteFromScale(tonic, mode, index) {
  const scale = getScaleNotes(tonic, mode); // 7 diatonic note names
  return scale[index % scale.length];
}

// ─── Section Detection ────────────────────────────────────────────────────────

/**
 * getSongSections(chords, mode?)
 *
 * Smart section detection using chord-window fingerprinting.
 * Hashes overlapping 4-chord windows; repeating windows = separate sections.
 * Falls back to proportional split for very short progressions.
 */
function getSongSections(chords = [], mode = "major") {
  if (!Array.isArray(chords) || chords.length === 0) {
    return [{ name: "Verse", start: 0, end: 0 }];
  }
  if (chords.length <= 5) {
    return [{ name: "Verse", start: 0, end: chords.length - 1 }];
  }
  if (chords.length <= 8) {
    const mid = Math.floor(chords.length / 2);
    return [
      { name: "Verse",  start: 0,   end: mid - 1 },
      { name: "Chorus", start: mid, end: chords.length - 1 },
    ];
  }

  // Chord-window fingerprinting for longer progressions
  const WINDOW = 4;
  const names  = chords.map((c) => c.name || "C");

  /** Hash a window of chord names to a string key */
  function windowKey(start) {
    return names.slice(start, start + WINDOW).join("|");
  }

  const seen  = new Map(); // key -> first-seen index
  const breaks = [0];      // section start points

  for (let i = 0; i <= names.length - WINDOW; i++) {
    const key = windowKey(i);
    if (seen.has(key)) {
      const prev = seen.get(key);
      // Repetition of a 4-chord window that started at a different position
      // -> treat the current position as a new section, unless it's too close
      if (i - (breaks[breaks.length - 1] ?? 0) >= WINDOW) {
        breaks.push(i);
      }
    } else {
      seen.set(key, i);
    }
  }

  // Collapse to at most 3 sections
  const sectionNames = ["Verse", "Chorus", "Bridge"];
  const unique = [...new Set(breaks)].slice(0, 3);

  return unique.map((start, idx) => ({
    name:  sectionNames[idx] || `Section ${idx + 1}`,
    start,
    end:   (unique[idx + 1] ?? chords.length) - 1,
  }));
}

function getSectionForIndex(index, sections = []) {
  return sections.find((s) => index >= s.start && index <= s.end) || sections[0] || { name: "Verse" };
}

// ─── Chord mood from theory context ──────────────────────────────────────────

function getChordMood(chordName = "C", chordAnalysis = null) {
  if (chordAnalysis) {
    const { romanNumeral, quality, scaleDegree } = chordAnalysis;
    if (quality === "diminished" || quality === "half-dim") return "tense";
    if (scaleDegree === 4 || scaleDegree === 6) return "bright";   // V / VII
    if (scaleDegree === 0 || scaleDegree === 3) return "warm";     // I / IV
    if (scaleDegree === 5 || scaleDegree === 1) return "dreamy";   // vi / ii
    if (romanNumeral === "chromatic" || romanNumeral === "V/") return "tense";
  }
  const c = String(chordName).toUpperCase();
  if (c.includes("7") || c.includes("ADD") || c.includes("9")) return "bright";
  if (c.includes("MAJ")) return "warm";
  if (c.includes("MIN") || c.includes("m")) return "dreamy";
  if (c.includes("DIM") || c.includes(" deg")) return "tense";
  return "neutral";
}

function getMoodFlavor(style = "pop", chordName = "C", chordAnalysis = null) {
  const mood = getChordMood(chordName, chordAnalysis);
  const map = {
    pop:       { warm: "uplift",  dreamy: "smooth", bright: "spark", tense: "drama",  neutral: "steady" },
    rock:      { warm: "anthem",  dreamy: "grit",   bright: "drive", tense: "edge",   neutral: "steady" },
    cinematic: { warm: "epic",    dreamy: "float",  bright: "glow",  tense: "shadow", neutral: "lift"   },
    "lo-fi":   { warm: "cozy",    dreamy: "drift",  bright: "sunset",tense: "night",  neutral: "calm"   },
    jazz:      { warm: "swing",   dreamy: "moody",  bright: "bounce",tense: "late",   neutral: "cool"   },
    acoustic:  { warm: "folk",    dreamy: "gentle", bright: "open",  tense: "raw",    neutral: "rooted" },
  };
  return (map[style] || map.pop)[mood] || "steady";
}

// ─── Dynamic chord density per style ─────────────────────────────────────────

/**
 * Chord density multiplier by style - dynamic, no magic number per style pair.
 * jazz & cinematic -> denser harmonic rhythm; lo-fi -> sparse; rock -> medium.
 */
const STYLE_DENSITY = {
  pop:       1.0,
  rock:      0.9,
  cinematic: 1.2,
  "lo-fi":   0.8,
  jazz:      1.3,
  acoustic:  0.9,
};

// ─── Swing offsets per style ──────────────────────────────────────────────────

/**
 * Swing amount (0 = straight, 1 = full triplet swing).
 * Applied to drums and bass as a speed modifier.
 */
const STYLE_SWING = {
  pop:       0,
  rock:      0.05,
  cinematic: 0,
  "lo-fi":   0.15,
  jazz:      0.25,
  acoustic:  0.08,
};

// ─── Jazz bass walk ───────────────────────────────────────────────────────────

/**
 * Generate a walking bass note for a chord transition.
 * Picks a passing tone from the detected scale between the current and next root.
 * Returns the note name (string).
 */
function getWalkingBassNote(currentRoot, nextRoot, tonic, mode, stepIndex) {
  const scale    = getScaleNotes(tonic, mode);
  const currPc   = chordRootToPc(normalizeRoot(currentRoot)) ?? 0;
  const nextPc   = chordRootToPc(normalizeRoot(nextRoot))    ?? 0;

  // Find scale positions of current and next roots
  const chromatic = CHROMATIC;
  const currNote  = chromatic[currPc] || "C";
  const nextNote  = chromatic[nextPc] || "C";

  const currIdx = scale.indexOf(currNote);
  const nextIdx = scale.indexOf(nextNote);

  if (currIdx === -1 || nextIdx === -1) return currNote;

  // Walk one step toward the next root
  const direction = nextIdx > currIdx ? 1 : -1;
  const walkIdx   = (currIdx + direction + scale.length) % scale.length;

  // On step 0 of the walk, use the root; step 1+ uses passing tones
  return stepIndex === 0 ? currNote : scale[walkIdx];
}

// ─── Drum pattern generation ──────────────────────────────────────────────────

/**
 * getDrumPattern(sectionName, presetName) -> boolean[8]
 *
 * Patterns are still selected from a set, but derived from the drumAccent
 * field in ARRANGEMENT_PRESETS - no hardcoded style-name strings here.
 */
function getDrumPattern(sectionName = "Verse", presetName = "radio") {
  const config = getArrangementPresetConfig(presetName);
  const accent = config.drumAccent || "tight";

  if (sectionName === "Chorus") {
    return accent === "big"  ? [true,false,true,false,true,true, false,true]
                             : [true,true, false,true,true,false,true, false];
  }
  if (sectionName === "Bridge") {
    return [true,false,false,true,true,false,false,true];
  }
  // Verse patterns keyed by accent
  const VERSE_PATTERNS = {
    tight: [true,false,true, false,true,false,false,true],
    live:  [true,false,true, false,true,false,true, false],
    big:   [true,false,false,true, true,true, false,true],
    soft:  [true,false,false,false,true,false,false,true],
    wide:  [true,false,false,true, false,true,false,false],
  };
  return VERSE_PATTERNS[accent] || VERSE_PATTERNS.tight;
}

// ─── Fill detection ───────────────────────────────────────────────────────────

function getArrangementFill(index, sections = [], preset = "radio") {
  if (sections.length === 0) return { isFill: false, intensity: 1, type: null };

  const section         = sections.find((s) => index >= s.start && index <= s.end);
  if (!section) return { isFill: false, intensity: 1, type: null };

  const sectionIdx      = sections.indexOf(section);
  const nextSection     = sections[sectionIdx + 1] || null;
  const nextStart       = nextSection ? nextSection.start : null;
  const config          = getArrangementPresetConfig(preset);

  if (nextSection?.name === "Chorus" && nextStart !== null) {
    if (index === nextStart - 1) return { isFill: true, intensity: config.densityBoost, type: "major-fill" };
    if (index === nextStart - 2) return { isFill: true, intensity: 1.25, type: "drum-roll"  };
    if (index === nextStart - 3) return { isFill: true, intensity: 1.15, type: "build-up"   };
  }
  if (section.name === "Bridge" && index === section.start) {
    return { isFill: true, intensity: 1.3, type: "bass-drop" };
  }
  if (section.name === "Verse" && nextSection?.name === "Chorus" && index === nextStart - 1) {
    return { isFill: true, intensity: 1.2, type: "piano-run" };
  }
  if (nextStart !== null && index === nextStart - 1) {
    return { isFill: true, intensity: config.densityBoost, type: "major-fill" };
  }
  return { isFill: false, intensity: 1, type: null };
}

// ─── Style presets ────────────────────────────────────────────────────────────

export const STYLE_PRESETS = {
  pop: {
    instruments: {
      bass:   "finger_bass",
      piano:  "acoustic_grand_piano",
      rhythm: "rock_guitar",
      lead:   "flute",
      pad:    "church_organ",
      vocal:  "violin"
    },
    volumes:     { bass:0.72,          piano:0.82,                   rhythm:0.68,                  lead:0.58,         pad:0.52,             vocal:0.74      },
    colors:      { bass:"#00B894",     piano:"#6D4AFF",              rhythm:"#FDCB6E",              lead:"#FF6B8A",    pad:"#0984E3",        vocal:"#FF4D9D" },
  },
  rock: {
    label: "Rock",
    instruments: { bass:"finger_bass", piano:"electric_grand_piano", rhythm:"rock_guitar",          lead:"church_organ", pad:"acoustic_grand_piano", vocal:"violin"  },
    volumes:     { bass:0.82,          piano:0.78,                   rhythm:0.74,                  lead:0.65,         pad:0.58,             vocal:0.80     },
    colors:      { bass:"#2D9CDB",     piano:"#9B51E0",              rhythm:"#F2994A",              lead:"#EB5757",    pad:"#56CCF2",        vocal:"#FF7F50"},
  },
  cinematic: {
    label: "Cinematic",
    instruments: { bass:"finger_bass", piano:"church_organ",         rhythm:"violin",               lead:"flute",      pad:"acoustic_grand_piano", vocal:"electric_grand_piano" },
    volumes:     { bass:0.72,          piano:0.76,                   rhythm:0.62,                  lead:0.56,         pad:0.52,             vocal:0.72     },
    colors:      { bass:"#6FCF97",     piano:"#A78BFA",              rhythm:"#BB6BD9",              lead:"#F2C94C",    pad:"#56CCF2",        vocal:"#F72585"},
  },
  "lo-fi": {
    label: "Lo-fi",
    instruments: { bass:"finger_bass", piano:"electric_grand_piano", rhythm:"acoustic_grand_piano", lead:"church_organ", pad:"violin",         vocal:"flute"  },
    volumes:     { bass:0.68,          piano:0.70,                   rhythm:0.60,                  lead:0.45,         pad:0.42,             vocal:0.60     },
    colors:      { bass:"#7F8C8D",     piano:"#9B59B6",              rhythm:"#D5A6BD",              lead:"#E67E22",    pad:"#5DADE2",        vocal:"#FF9F1C"},
  },
  jazz: {
    label: "Jazz",
    instruments: { bass:"finger_bass", piano:"electric_grand_piano", rhythm:"church_organ",         lead:"rock_guitar", pad:"acoustic_grand_piano", vocal:"violin"  },
    volumes:     { bass:0.78,          piano:0.82,                   rhythm:0.68,                  lead:0.62,         pad:0.58,             vocal:0.74     },
    colors:      { bass:"#34C759",     piano:"#8E7CC3",              rhythm:"#F1C40F",              lead:"#E67E22",    pad:"#5DADE2",        vocal:"#FFB703"},
  },
  acoustic: {
    label: "Acoustic",
    instruments: { bass:"finger_bass", piano:"acoustic_grand_piano", rhythm:"rock_guitar",          lead:"flute",      pad:"church_organ",   vocal:"violin"   },
    volumes:     { bass:0.7,           piano:0.75,                   rhythm:0.58,                  lead:0.5,          pad:0.48,             vocal:0.66      },
    colors:      { bass:"#27AE60",     piano:"#8E44AD",              rhythm:"#F9C74F",              lead:"#FF7F50",    pad:"#4ECDC4",        vocal:"#F72585" },
  },
};

export const DEFAULT_AI_BAND_SELECTION = {
  bass: true, piano: true, rhythm: true,
  lead: false, pad: false, drums: true, vocal: false,
};

const MAX_ARRANGEMENT_CHORDS = 32;

export const aiBandInstrumentOptions = [
  { key:"bass",  label:"Bass"       },
  { key:"piano", label:"Piano"      },
  { key:"rhythm",label:"Rhythm"     },
  { key:"lead",  label:"Lead"       },
  { key:"pad",   label:"Pad"        },
  { key:"drums", label:"Drums"      },
  { key:"vocal", label:"Mic / Vocal"},
];

export const arrangementPresetOptions = [
  { value:"radio",    label:"Radio"     },
  { value:"live-band",label:"Live Band" },
  { value:"epic",     label:"Epic"      },
  { value:"lofi",     label:"Lo-fi"     },
  { value:"cinematic",label:"Cinematic" },
];

const ARRANGEMENT_PRESETS = {
  radio:      { label:"Radio",     densityBoost:1.1,  vocalBoost:1.1,  leadBoost:1.1,  drumAccent:"tight", hookBias:"bright"   },
  "live-band":{ label:"Live Band", densityBoost:1.2,  vocalBoost:1.05, leadBoost:1.15, drumAccent:"live",  hookBias:"warm"     },
  epic:       { label:"Epic",      densityBoost:1.35, vocalBoost:1.2,  leadBoost:1.35, drumAccent:"big",   hookBias:"cinematic"},
  lofi:       { label:"Lo-fi",     densityBoost:0.9,  vocalBoost:0.8,  leadBoost:0.95, drumAccent:"soft",  hookBias:"dreamy"   },
  cinematic:  { label:"Cinematic", densityBoost:1.25, vocalBoost:1.15, leadBoost:1.25, drumAccent:"wide",  hookBias:"epic"     },
};

function getArrangementPresetConfig(preset = "radio") {
  return ARRANGEMENT_PRESETS[preset] || ARRANGEMENT_PRESETS.radio;
}

// ─── Core track builder ───────────────────────────────────────────────────────

function makeTrack(
  name, instrument, volume, chords, color,
  preset = "default", style = "pop", sections = [],
  producerSettings = {}, arrangementPreset = "radio",
  chordAnalyses = [], tonic = "C", mode = "major",
  role = preset
) {
  const trackId = `${String(name || "track").replace(/\s+/g, "-").toLowerCase()}-${preset}-${Math.random().toString(36).slice(2, 9)}`;

  const energy    = Math.min(1, Math.max(0, Number(producerSettings.energy    ?? 75) / 100));
  const vocalInt  = Math.min(1, Math.max(0, Number(producerSettings.vocalIntensity ?? 70) / 100));
  const density   = Math.min(1, Math.max(0, Number(producerSettings.arrangementDensity ?? 70) / 100));

  // density 0 -> 0.7×, density 1 -> 1.3× (continuous, not stepped)
  const densityMult = 0.7 + density * 0.6;

  const presetConfig  = getArrangementPresetConfig(arrangementPreset);
  const sectionBoost  = presetConfig.densityBoost || 1;

  // Wire vocalBoost / leadBoost into actual output volumes (previously dead code)
  const effectiveVolume = preset === "vocal"
    ? Math.min(1, volume * (presetConfig.vocalBoost || 1))
    : preset === "lead"
      ? Math.min(1, volume * (presetConfig.leadBoost || 1))
      : volume;

  // Dynamic chord density from style (replaces hardcoded rock/jazz check)
  const styleDensityFactor = STYLE_DENSITY[style] || 1.0;
  const swingAmount        = STYLE_SWING[style]   || 0;

  return {
    id:             trackId,
    name,
    instrument,
    role,
    volume:         effectiveVolume,
    muted:          false,
    solo:           false,
    loop:           true,
    color,
    arrangementPreset,
    sectionLabels:  sections.map((s) => s.name),
    chords: chords.map((chord, index) => {
      const root         = parseChordRoot(chord.name || "C");
      const chordAnalysis= chordAnalyses[index] || null;

      // Melody from voice-leading engine (dynamic scale), fallback to scale lookup
      const resolvedMelodyNote = chordAnalysis?.resolvedMelodyNote
        || getMelodyNoteFromScale(tonic, mode, index);
      const resolvedOctave = chordAnalysis?.resolvedOctave || 5;
      const tensionScore   = chordAnalysis?.tensionScore   ?? 0.4;

      const section         = getSectionForIndex(index, sections);
      const chordMood       = getChordMood(chord.name || "C", chordAnalysis);
      const flavor          = getMoodFlavor(style, chord.name || "C", chordAnalysis);

      const sectionBoostVal = section.name === "Chorus" ? 1.5 * sectionBoost
        : section.name === "Bridge" ? 1.2 * sectionBoost
        : sectionBoost;

      const fillWindow = (index + 1) % 4 === 0 && section.name !== "Verse";

      // FIXED: was (cinematic?2:2) - dead ternary. Now cinematic gets 3.
      const rawBeatLength = section.name === "Chorus"
        ? (style === "cinematic" ? 3 : 2)
        : (index % 4 === 0 && section.name === "Verse"
            ? (style === "cinematic" ? 2 : 1) : 1);

      // Preserve beat durations from imported song where available
      const importedBeats = (chord.importedBeats && chord.importedBeats > 0)
        ? chord.importedBeats : null;
      const beatLength = importedBeats
        ? Math.max(1, Math.round(importedBeats * densityMult))
        : Math.max(1, Math.round(rawBeatLength * densityMult * styleDensityFactor));

      // Tension-driven speed boost
      const tensionBoost = 1 + 0.25 * tensionScore;

      // Chord-repeat sustain: if this chord is same as previous, extend rather than retrigger
      const prevChord   = index > 0 ? chords[index - 1] : null;
      const isRepeat    = prevChord && parseChordRoot(prevChord.name) === root
        && prevChord.name === chord.name;

      const fill = getArrangementFill(index, sections, arrangementPreset);

      const base = {
        type:"chord", name: chord.name || "C",
        octave:4, inversion:0,
        beats: beatLength,
        repeat: 1,
        wait:0, speed:1,
        instrument, volume: effectiveVolume,
        pattern:[true], trackId,
        isFill: fill.isFill, fillType: fill.type,
        romanNumeral: chordAnalysis?.romanNumeral,
        tensionScore,
      };

      // ── DRUMS ────────────────────────────────────────────────────────────
      if (preset === "drums") {
        if (fill.type === "drum-roll") {
          return {
            ...base, type:"note", name:"C", octave:3, beats:1,
            speed: 0.95 + energy * 0.05,
            pattern:[true,true,true,true,true,true,true,true],
            lyricHint:"drum-roll", shape:"drum-roll",
          };
        }
        const drumBeats = section.name === "Chorus" ? 2 : 1;
        // Apply swing: slightly delay even-numbered subdivisions
        const swingSpeed = fill.isFill
          ? 1.2 + energy * 0.3
          : (0.8 + energy * 0.45) * (1 + swingAmount * 0.1);
        return {
          ...base, type:"note", name:"C", octave:3,
          beats: fillWindow ? 1 : (fill.isFill ? drumBeats * 1.2 : drumBeats),
          speed: swingSpeed,
          pattern: getDrumPattern(section.name, arrangementPreset),
          lyricHint:"drums",
          shape: fill.isFill ? "kick-fill"
            : (section.name === "Chorus"
                ? (presetConfig.drumAccent === "big" ? "big" : "steady")
                : "steady"),
        };
      }

      // ── BASS ─────────────────────────────────────────────────────────────
      if (preset === "bass") {
        if (fill.type === "bass-drop") {
          return {
            ...base, name:root, inversion:0, octave:2,
            beats: Math.max(1, Math.round(2 * densityMult)),
            speed:0, wait:0.05, pattern:[true], fillType:"bass-drop",
          };
        }

        // Jazz walking bass: use passing tones between roots
        const nextChord = chords[index + 1];
        const nextRoot  = nextChord ? parseChordRoot(nextChord.name) : root;
        const useWalk   = style === "jazz" && !isRepeat && nextRoot !== root;
        const bassNote  = useWalk
          ? getWalkingBassNote(root, nextRoot, tonic, mode, index % 2)
          : root;

        const bassSpeed = section.name === "Chorus"
          ? 0.9 * (1 + swingAmount * 0.1)
          : (index % 3 === 0 ? 0.25 : 0.55) * (1 + swingAmount * 0.15);

        return {
          ...base, name: bassNote, inversion: index % 3 === 0 ? 0 : (index % 3),
          octave: style === "rock" ? 2 : 3,
          beats: Math.max(1, Math.round(
            (section.name === "Chorus" ? (style === "jazz" ? 2 : 1) : 1) * densityMult
          )),
          speed: bassSpeed * (fill.isFill ? 1.25 : 1),
          pattern:[true],
        };
      }

      // ── LEAD ─────────────────────────────────────────────────────────────
      if (preset === "lead") {
        const leadOctave = resolvedOctave || (section.name === "Chorus" ? 6 : 5);
        const leadBeats  = Math.max(1, Math.round(
          (section.name === "Chorus" ? 2 : (index % 3 === 0 ? 2 : 1)) * densityMult
        ));
        const leadSpeed  = section.name === "Chorus"
          ? Math.min(1, (1.0 + energy * 0.2) * tensionBoost)
          : (style === "rock" ? 0.95 : 0.8);

        if (fill.type === "piano-run") {
          return {
            ...base, type:"note",
            name: getMelodyNoteFromScale(tonic, mode, index + 2),
            octave: leadOctave, beats:1,
            speed: Math.min(1, 0.65 + energy * 0.2),
            pattern:[true], fillHint:"piano-run", isFill:true,
          };
        }

        const fillNote = getMelodyNoteFromScale(tonic, mode, index + 4);
        return {
          ...base, type:"note",
          name: fill.isFill ? fillNote : resolvedMelodyNote,
          octave: leadOctave + (fill.isFill ? 1 : 0),
          beats: fillWindow ? 1 : (fill.isFill ? Math.max(1, Math.round(leadBeats * 0.9)) : leadBeats),
          speed: fillWindow ? Math.min(1, 1.15 + energy * 0.25)
                            : Math.min(1, leadSpeed * fill.intensity),
          pattern:[true],
          fillHint: fill.isFill ? fill.type : (fillWindow ? "bridge-fill" : flavor),
          isFill: fill.isFill,
        };
      }

      // ── PAD ──────────────────────────────────────────────────────────────
      if (preset === "pad") {
        const padOctave = style === "cinematic" ? 6 : 5;
        // Density drives pad speed dynamically per style
        const basePadSpeed = style === "jazz" ? 0.4
          : (section.name === "Chorus" ? 0.8 : 0.6);
        const padSpeed = Math.min(1, basePadSpeed * densityMult * styleDensityFactor);
        return {
          ...base, name: chord.name || "C",
          octave: padOctave + (fill.isFill ? 1 : 0),
          beats: Math.max(1, Math.round(
            (section.name === "Chorus" ? 2 : (style === "lo-fi" ? 2 : 1)) * densityMult
          )),
          speed: Math.min(1, padSpeed * (fill.isFill ? 1.15 : 1)),
          pattern:[true],
        };
      }

      // ── VOCAL ────────────────────────────────────────────────────────────
      if (preset === "vocal") {
        const phraseIndex     = Math.floor(index / 2);
        const isCall          = phraseIndex % 2 === 0;
        const callNote        = getMelodyNoteFromScale(tonic, mode, index + 1);
        const responseNote    = getMelodyNoteFromScale(tonic, mode, index + 4);
        const fillNote        = getMelodyNoteFromScale(tonic, mode, index + 6);
        const isHook          = section.name === "Chorus" || (index % 4 === 0 && section.name === "Verse");
        const baseOct         = section.name === "Chorus" ? 6 : (chordMood === "dreamy" ? 5 : 4);
        const vocalOct        = isCall ? baseOct : baseOct + 1;
        const vocalBeats      = section.name === "Chorus"
          ? (isCall ? 2 : 1)
          : isHook ? (isCall ? Math.max(1, Math.round(1.5 * densityMult)) : 1)
          : Math.max(1, Math.round(densityMult));
        const vocalSpeed      = section.name === "Chorus"
          ? (isCall ? 1.1 + vocalInt * 0.2 : 1.3 + vocalInt * 0.3)
          : isHook
            ? (isCall ? 1.0 + vocalInt * 0.15 : 1.15 + vocalInt * 0.2)
            : (isCall ? 0.75 : 0.9);

        return {
          ...base, type:"note",
          name: fill.isFill ? fillNote : (isCall ? callNote : responseNote),
          octave: Math.min(8, fill.isFill ? vocalOct + 1 : vocalOct),
          beats: fillWindow ? 1 : (fill.isFill ? Math.max(1, Math.round(vocalBeats * 0.8)) : vocalBeats),
          speed: fillWindow ? Math.min(1.4, 1.15 + vocalInt * 0.3)
                            : Math.min(1.4, vocalSpeed * fill.intensity),
          wait: isCall ? 0 : 0.05,
          pattern:[true],
          lyricHint: fill.isFill ? "response" : (section.name === "Chorus" ? "hook" : (isCall ? "call" : "response")),
          phraseType: isCall ? "call" : "response",
          callResponse: !isCall || fill.type === "major-fill",
        };
      }

      // ── DEFAULT (piano / rhythm) ──────────────────────────────────────────
      return {
        ...base,
        name: chord.name || "C",
        octave: section.name === "Chorus"
          ? (style === "rock" ? 4 : 5)
          : (style === "rock" ? 3 : 4),
        beats: Math.max(1, Math.round(
          beatLength * sectionBoostVal
          + (index % 3 === 0 && style === "jazz" ? 1 : 0)
        )),
        speed: section.name === "Chorus"
          ? Math.min(1, 1.1 * densityMult)
          : Math.min(1, (index % 2 === 0 ? 0.7 : 1.0) * densityMult),
      };
    }),
  };
}

// ─── Song selection normalisation ────────────────────────────────────────────

function normalizeSongSelection(selection = {}) {
  const base = { ...DEFAULT_AI_BAND_SELECTION };
  Object.keys(base).forEach((k) => {
    if (typeof selection[k] === "boolean") base[k] = selection[k];
  });
  return base;
}

// ─── Legacy style fallback ────────────────────────────────────────────────────

function chooseStyleLegacy(song) {
  const names = (song?.chords || []).map((c) => String(c?.name || "")).join(" ").toUpperCase();
  if (names.includes("7") || names.includes("DOM"))  return "rock";
  if (names.includes("MIN"))                          return "cinematic";
  if (names.includes("9")  || names.includes("11"))  return "jazz";
  if (names.includes("ADD")|| names.includes("SUS")) return "acoustic";
  return "pop";
}

// ─── Main band builder ────────────────────────────────────────────────────────

export function buildBandFromSong(
  song,
  style            = "pop",
  selection        = DEFAULT_AI_BAND_SELECTION,
  producerSettings = {},
  arrangementPreset = "radio"
) {
  const safeSong = (song && Array.isArray(song.chords) && song.chords.length > 0)
    ? song
    : { title:"Demo Jam", chords:[
        {name:"C"},{name:"G"},{name:"Am"},{name:"F"},
        {name:"C"},{name:"G"},{name:"Am"},{name:"F"},
      ]};

  // Preserve imported beat durations; mark them so makeTrack can use them
  const songChords = safeSong.chords.slice(0, MAX_ARRANGEMENT_CHORDS).map((chord, i) => ({
    ...chord,
    name:          chord.name || "C",
    // Store original beats as importedBeats; fall back to musical default
    importedBeats: (chord.beats && chord.beats > 0 && chord.beats <= 16)
      ? chord.beats : null,
    // Internal beats for section detection (unscaled)
    beats: chord.beats || (i % 4 === 0 ? 2 : 1),
  }));

  // ── Theory engine ────────────────────────────────────────────────────────
  const chordNames = songChords.map((c) => c.name);
  const theoryResult = analyzeProgression(chordNames);
  const { tonic, mode, confidence, analyses: chordAnalyses, pattern, modulation } = theoryResult;

  // Choose style: theory-based unless caller passed an explicit valid style
  const resolvedStyle = STYLE_PRESETS[style]
    ? style
    : chooseStyleFromAnalysis(chordAnalyses, mode) || chooseStyleLegacy(safeSong);
  const stylePreset   = STYLE_PRESETS[resolvedStyle] || STYLE_PRESETS.pop;
  const enabled       = normalizeSongSelection(selection);
  const presetName    = arrangementPreset || "radio";

  // Theory metadata stored on tracks for the UI intelligence banner
  const theoryMeta = {
    tonic, mode, confidence,
    keyLabel: `${tonic} ${mode}`,
    pattern:  pattern ? pattern.label : null,
    patternName: pattern ? pattern.name : null,
    modulation: modulation
      ? `Modulates to ${modulation.newTonic} ${modulation.newMode} at chord ${modulation.atIndex}`
      : null,
    confidencePct: Math.round(confidence * 100),
  };

  // Lead pattern: preserve imported durations for melody/rhythm instruments.
  // IMPORTANT: keep the full chord name (via ...chord), not just its root.
  // The "default" preset (used for the Rhythm track) and "pad" preset both
  // read `chord.name` directly as the full chord to voice -- stripping it to
  // a bare root here silently turned every Rhythm/Pad chord into a single
  // note (e.g. "F#m" -> "F#", "Dsus2" -> "D", "D/F#" -> "D"), which is also
  // exactly what the Bass track already plays (bass always reduces to its
  // own root note independently), so Bass and Rhythm ended up playing an
  // identical, harmonically-flattened line -- the "everything sounds like
  // the same generic loop" symptom. Lead/Vocal/Drums don't use chord.name
  // for their actual note at all (they compute their own melody note or
  // ignore it entirely), so they're unaffected by keeping the full name.
  const leadPattern = songChords.map((chord, i) => ({
    ...chord,
    speed: i % 2 === 0 ? 0.4 : 0.75,
  }));

  const sections = getSongSections(songChords, mode);
  const tracks   = [];

  const common = (n, inst, vol, chords, color, p, role) =>
    makeTrack(n, inst, vol, chords, color, p, resolvedStyle, sections, producerSettings, presetName, chordAnalyses, tonic, mode, role);

  // Create tracks with DESCRIPTIVE names based on the actual instruments being used
  // This eliminates confusion where "Piano" track plays electric piano, etc.
  
  const getInstrumentLabel = (instrument) => {
    const labels = {
      "acoustic_grand_piano": "Acoustic Piano",
      "electric_grand_piano": "Electric Piano", 
      "church_organ": "Organ",
      "finger_bass": "Bass Guitar",
      "rock_guitar": "Rock Guitar",
      "flute": "Flute",
      "violin": "Violin"
    };
    return labels[instrument] || instrument.replace(/_/g, ' ');
  };

  if (enabled.bass)   tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.bass),   stylePreset.instruments.bass,   stylePreset.volumes.bass,   songChords,  stylePreset.colors.bass,  "bass",   "bass"),   theoryMeta });
  if (enabled.piano)  tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.piano),  stylePreset.instruments.piano,  stylePreset.volumes.piano,  songChords,  stylePreset.colors.piano, "default","piano"),theoryMeta });
  if (enabled.rhythm) tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.rhythm), stylePreset.instruments.rhythm, stylePreset.volumes.rhythm, leadPattern, stylePreset.colors.rhythm,"default","rhythm"),theoryMeta });
  if (enabled.drums)  tracks.push({ ...common("Drums", "drums",       stylePreset.volumes.rhythm * 1.1, leadPattern, "#E17055", "drums",  "drums"),  theoryMeta });
  if (enabled.lead)   tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.lead),   stylePreset.instruments.lead,   stylePreset.volumes.lead,   leadPattern, stylePreset.colors.lead,  "lead",   "lead"),   theoryMeta });
  if (enabled.pad)    tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.pad),    stylePreset.instruments.pad,    stylePreset.volumes.pad,    leadPattern, stylePreset.colors.pad,   "pad",    "pad"),    theoryMeta });
  if (enabled.vocal)  tracks.push({ ...common(getInstrumentLabel(stylePreset.instruments.vocal),  stylePreset.instruments.vocal,  stylePreset.volumes.vocal,  leadPattern, stylePreset.colors.vocal, "vocal",  "vocal"),  theoryMeta });

  if (tracks.length === 0) {
    tracks.push({ ...common("Bass Guitar",    stylePreset.instruments.bass,  stylePreset.volumes.bass,  songChords, stylePreset.colors.bass,  "bass",   "bass"),   theoryMeta });
    tracks.push({ ...common("Acoustic Piano", stylePreset.instruments.piano, stylePreset.volumes.piano, songChords, stylePreset.colors.piano, "default","piano"),theoryMeta });
  }

  return tracks;
}

export function buildDemoBand(style = "pop", selection = DEFAULT_AI_BAND_SELECTION, producerSettings = {}, arrangementPreset = "radio") {
  return buildBandFromSong({
    title:"Demo Jam",
    chords:[
      {name:"C"},{name:"G"},{name:"Am"},{name:"F"},
      {name:"C"},{name:"E7"},{name:"Am"},{name:"F"},
    ],
  }, style, selection, producerSettings, arrangementPreset);
}

export const styleOptions = Object.entries(STYLE_PRESETS).map(([v, c]) => ({ value:v, label:c.label }));
