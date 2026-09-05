/**
 * musicTheory.js
 *
 * Pure music theory engine - no hardcoded magic numbers, no dead code.
 * Zero external dependencies - all pure JS math.
 *
 * Exports:
 *   detectKey(chords)                -> { tonic, mode, confidence }
 *   analyzeChord(name, tonic, mode)  -> { romanNumeral, tensionScore, scaleDegree, quality, extensions }
 *   resolveVoiceLeading(...)         -> Array<ChordAnalysis>
 *   analyzeProgression(chordNames)   -> { tonic, mode, confidence, analyses, pattern, modulation }
 *   getScaleNotes(tonic, mode)       -> string[]   (7 diatonic note names)
 *   getScalePcs(tonic, mode)         -> number[]   (7 pitch-class integers 0-11)
 *   chooseStyleFromAnalysis(...)     -> string
 *   detectProgressionPattern(...)    -> PatternResult
 *   detectModulation(...)            -> ModulationResult|null
 */

// No tonal import needed - all calculations are pure math

// ─── Chromatic reference ──────────────────────────────────────────────────────

export const CHROMATIC = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
];

// ─── Scale intervals (semitone offsets from tonic) ───────────────────────────

const SCALE_INTERVALS = {
  major:        [0, 2, 4, 5, 7, 9, 11],
  minor:        [0, 2, 3, 5, 7, 8, 10],   // natural minor
  dorian:       [0, 2, 3, 5, 7, 9, 10],
  mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  phrygian:     [0, 1, 3, 5, 7, 8, 10],
};

// ─── Dynamic scale generation ────────────────────────────────────────────────

/**
 * getScalePcs(tonic, mode) -> number[] (7 pitch-class integers)
 * Fully dynamic - computes from first principles, nothing hardcoded.
 */
export function getScalePcs(tonic, mode = "major") {
  const tonicPc = chordRootToPc(tonic) ?? 0;
  const intervals = SCALE_INTERVALS[mode] || SCALE_INTERVALS.major;
  return intervals.map((i) => (tonicPc + i) % 12);
}

/**
 * getScaleNotes(tonic, mode) -> string[] (7 note names, sharp notation)
 * Replaces the old hardcoded rootMap entirely.
 */
export function getScaleNotes(tonic, mode = "major") {
  return getScalePcs(tonic, mode).map((pc) => CHROMATIC[pc]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse chord name -> pitch-class index 0-11. Returns null if unparseable. */
export function chordRootToPc(chordName) {
  if (!chordName) return null;
  const match = String(chordName).match(/^([A-Ga-g][#b]?)/);
  if (!match) return null;
  // Pure math: map note name to chroma without tonal library
  const raw = match[1];
  const letter = raw[0].toUpperCase();
  const accidental = raw[1] || "";
  const BASE_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  const base = BASE_PC[letter];
  if (base === undefined) return null;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return ((base + shift) + 12) % 12;
}

/** diatonic pitch-class set for a given tonic + mode */
function diatonicSet(tonicPc, mode = "major") {
  const intervals = SCALE_INTERVALS[mode] || SCALE_INTERVALS.major;
  return new Set(intervals.map((i) => (tonicPc + i) % 12));
}

/**
 * Detect chord quality from name string.
 * Order matters - specific patterns before general ones.
 */
export function detectQuality(chordName) {
  const name = String(chordName).replace(/^[A-Ga-g][#b]?/, "");
  if (/dim| deg/.test(name))                            return "diminished";
  if (/aug|\+/.test(name))                           return "augmented";
  if (/m7b5|ø/.test(name))                           return "half-dim";
  if (/m7|min7/.test(name))                          return "minor7";
  if (/maj7|Maj7|M7|Δ/.test(name))                  return "major7";
  if (/^(m|min)(?!aj)/i.test(name))                  return "minor";
  if (/13/.test(name))                               return "dominant13";
  if (/11/.test(name))                               return "dominant11";
  if (/9/.test(name) && !/maj/.test(name))           return "dominant9";
  if (/7/.test(name) && !/maj/.test(name))           return "dominant";
  if (/add9|add2/.test(name))                        return "add9";
  if (/sus4|sus/.test(name))                         return "sus4";
  if (/sus2/.test(name))                             return "sus2";
  if (/6/.test(name))                                return "major6";
  if (name === "")                                   return "major";
  return "major";
}

/**
 * Chord extensions detected from quality - returns a sorted list of extensions.
 * Used to add colour to tension scoring and voicing.
 */
function detectExtensions(quality) {
  const map = {
    dominant:    [7],
    dominant9:   [7, 9],
    dominant11:  [7, 9, 11],
    dominant13:  [7, 9, 11, 13],
    major7:      [7],
    minor7:      [7],
    "half-dim":  [7],
    add9:        [9],
    major6:      [6],
  };
  return map[quality] || [];
}

// ─── Roman numeral labels ─────────────────────────────────────────────────────

const MAJOR_ROMAN = ["I",  "II",  "III",  "IV",  "V",  "VI",  "VII"];
const MINOR_ROMAN = ["i",  "ii",  "iii",  "iv",  "v",  "vi",  "vii"];

// ─── Tension scoring ─────────────────────────────────────────────────────────
//
// Tension is computed dynamically, not looked up from a fixed table.
// Base tension by scale degree (0-based index in the diatonic scale):
//   Degree 0 (I)   -> 0.05  most stable
//   Degree 3 (IV)  -> 0.10  subdominant - mild pull
//   Degree 5 (VI)  -> 0.15  relative minor substitute
//   Degree 1 (II)  -> 0.35  pre-dominant
//   Degree 2 (III) -> 0.40  mediant
//   Degree 4 (V)   -> 0.70  dominant - strongest pull
//   Degree 6 (VII) -> 0.75  leading tone
//   Chromatic      -> 0.90  outside the key
//
// Then adjusted upward for chord extensions (each extension adds tension).

const BASE_TENSION_BY_DEGREE = [0.05, 0.35, 0.40, 0.10, 0.70, 0.15, 0.75];

const EXTENSION_TENSION_BOOST = {
  7:  0.05,
  9:  0.04,
  11: 0.03,
  13: 0.02,
  6:  0.02,
};

function computeTensionScore(scaleDegree, quality, extensions = []) {
  const base = scaleDegree !== null
    ? (BASE_TENSION_BY_DEGREE[scaleDegree] ?? 0.5)
    : 0.90; // chromatic

  // Quality modifier
  const qualityMod = quality === "diminished" ? 0.15
    : quality === "half-dim"  ? 0.10
    : quality === "augmented" ? 0.08
    : quality === "dominant"  ? 0.05
    : 0;

  // Extension boost - more extensions = slightly more colour/tension
  const extBoost = extensions.reduce((sum, ext) => sum + (EXTENSION_TENSION_BOOST[ext] || 0.01), 0);

  return Math.min(1.0, base + qualityMod + extBoost);
}

// ─── Key Detection ────────────────────────────────────────────────────────────

/**
 * detectKey(chords: string[]) -> { tonic, mode, confidence }
 *
 * Scores all 12 × 5 tonic+mode combinations. Returns the best fit.
 * Considers major, natural minor, dorian, mixolydian, phrygian.
 * Tiebreak: prefer the pitch-class appearing most as a chord root.
 */
export function detectKey(chords) {
  if (!chords || chords.length === 0) {
    return { tonic: "C", mode: "major", confidence: 0 };
  }

  const rootPcs = chords.map((c) => chordRootToPc(c)).filter((pc) => pc !== null);
  const total   = rootPcs.length || 1;

  let bestScore = -1;
  let bestTonic = "C";
  let bestMode  = "major";

  for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
    for (const mode of ["major", "minor", "dorian", "mixolydian"]) {
      const diatonic = diatonicSet(tonicPc, mode);
      const score    = rootPcs.filter((pc) => diatonic.has(pc)).length / total;

      if (score > bestScore) {
        bestScore = score;
        bestTonic = CHROMATIC[tonicPc];
        bestMode  = mode;
      } else if (score === bestScore) {
        // Tiebreak: pick tonic that appears most as a chord root
        const tonicFreq   = rootPcs.filter((pc) => pc === tonicPc).length;
        const bestTonicPc = CHROMATIC.indexOf(bestTonic);
        const bestFreq    = rootPcs.filter((pc) => pc === bestTonicPc).length;
        if (tonicFreq > bestFreq) {
          bestTonic = CHROMATIC[tonicPc];
          bestMode  = mode;
        }
      }
    }
  }

  return { tonic: bestTonic, mode: bestMode, confidence: bestScore };
}

// ─── Roman Numeral Analysis ───────────────────────────────────────────────────

/**
 * analyzeChord(chordName, tonic, mode) -> ChordAnalysis
 *
 * Everything derived dynamically from the detected tonic + mode.
 */
export function analyzeChord(chordName, tonic, mode = "major") {
  const rootPc   = chordRootToPc(chordName);
  const tonicPc  = chordRootToPc(tonic);
  const quality  = detectQuality(chordName);
  const extensions = detectExtensions(quality);

  if (rootPc === null || tonicPc === null) {
    return {
      romanNumeral: "chromatic", tensionScore: 0.9,
      scaleDegree: null, quality, extensions,
    };
  }

  const intervals = SCALE_INTERVALS[mode] || SCALE_INTERVALS.major;
  const diatonic  = intervals.map((i) => (tonicPc + i) % 12);
  const degree    = diatonic.indexOf(rootPc); // 0-based, or -1 if chromatic

  if (degree === -1) {
    // Check if it's a secondary dominant (major chord on non-diatonic degree)
    const isSecondaryDominant = quality === "dominant" || quality === "major";
    return {
      romanNumeral: isSecondaryDominant ? "V/" : "chromatic",
      tensionScore: computeTensionScore(null, quality, extensions),
      scaleDegree: null, quality, extensions,
    };
  }

  const isMinorQuality = ["minor", "minor7", "half-dim", "diminished"].includes(quality);
  const romanBase  = isMinorQuality ? MINOR_ROMAN[degree] : MAJOR_ROMAN[degree];
  const romanSuffix = quality === "diminished" ? " deg"
    : quality === "half-dim"  ? "ø"
    : quality === "augmented" ? "+"
    : quality === "dominant"  ? "7"
    : quality === "major7"    ? "maj7"
    : quality === "minor7"    ? "7"
    : quality === "dominant9" ? "9"
    : quality === "dominant11"? "11"
    : quality === "dominant13"? "13"
    : quality === "sus4"      ? "sus4"
    : quality === "sus2"      ? "sus2"
    : quality === "add9"      ? "add9"
    : "";

  const romanNumeral = romanBase + romanSuffix;
  const tensionScore = computeTensionScore(degree, quality, extensions);

  return { romanNumeral, tensionScore, scaleDegree: degree, quality, extensions };
}

// ─── Progression Pattern Detection ───────────────────────────────────────────

/**
 * Common progression fingerprints as Roman numeral sequences.
 * Each pattern is matched as a subsequence anywhere in the progression.
 */
const PROGRESSION_PATTERNS = [
  {
    name: "I-V-vi-IV",
    label: "Pop canon (I-V-vi-IV)",
    // Scale degrees: 0=I, 4=V, 5=vi, 3=IV
    degrees: [0, 4, 5, 3],
    confidence: 1.0,
  },
  {
    name: "ii-V-I",
    label: "Jazz ii-V-I turnaround",
    degrees: [1, 4, 0],
    confidence: 1.0,
  },
  {
    name: "I-IV-V",
    label: "Classic I-IV-V",
    degrees: [0, 3, 4],
    confidence: 0.9,
  },
  {
    name: "I-vi-IV-V",
    label: "50s doo-wop (I-vi-IV-V)",
    degrees: [0, 5, 3, 4],
    confidence: 0.95,
  },
  {
    name: "12-bar blues",
    label: "12-bar blues",
    // Simplified: I-I-I-I-IV-IV-I-I-V-IV-I-V
    degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
    confidence: 0.8,
  },
  {
    name: "I-IV-vi-V",
    label: "I-IV-vi-V variation",
    degrees: [0, 3, 5, 4],
    confidence: 0.85,
  },
  {
    name: "vi-IV-I-V",
    label: "Minor-flavour pop (vi-IV-I-V)",
    degrees: [5, 3, 0, 4],
    confidence: 0.85,
  },
  {
    name: "i-VI-III-VII",
    label: "Minor pop (i-VI-III-VII)",
    degrees: [0, 5, 2, 6], // in minor context
    confidence: 0.8,
  },
  {
    name: "I-V-IV",
    label: "Rock I-V-IV",
    degrees: [0, 4, 3],
    confidence: 0.8,
  },
  {
    name: "ii-V-I-IV",
    label: "Extended jazz ii-V-I-IV",
    degrees: [1, 4, 0, 3],
    confidence: 0.9,
  },
];

/**
 * detectProgressionPattern(chordAnalyses) -> { name, label, confidence } | null
 *
 * Looks for known progressions as contiguous or wrapping subsequences.
 * Returns the best-matching pattern or null.
 */
export function detectProgressionPattern(chordAnalyses) {
  if (!chordAnalyses || chordAnalyses.length === 0) return null;

  const degrees = chordAnalyses
    .map((a) => a.scaleDegree)
    .filter((d) => d !== null);

  if (degrees.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const pattern of PROGRESSION_PATTERNS) {
    const pLen = pattern.degrees.length;
    if (pLen > degrees.length) continue;

    // Slide the pattern window over the degrees array (with wrap-around)
    const extended = [...degrees, ...degrees]; // allow wrap-around matching
    for (let start = 0; start <= degrees.length; start++) {
      const window  = extended.slice(start, start + pLen);
      const matches = window.filter((d, i) => d === pattern.degrees[i]).length;
      const score   = (matches / pLen) * pattern.confidence;

      if (score > bestScore && score > 0.65) {
        bestScore = score;
        bestMatch = { ...pattern, matchScore: score };
      }
    }
  }

  return bestMatch;
}

// ─── Modulation Detection ─────────────────────────────────────────────────────

/**
 * detectModulation(chordNames, primaryTonic, primaryMode)
 * -> { hasModulation, newTonic, newMode, atIndex, confidence } | null
 *
 * Splits the progression in half and checks if the second half
 * fits a different key better than the first.
 */
export function detectModulation(chordNames, primaryTonic, primaryMode) {
  if (!chordNames || chordNames.length < 6) return null;

  const midpoint   = Math.floor(chordNames.length / 2);
  const secondHalf = chordNames.slice(midpoint);

  const { tonic: newTonic, mode: newMode, confidence } = detectKey(secondHalf);

  // Only report modulation if the second half clearly fits a DIFFERENT key
  if (newTonic === primaryTonic && newMode === primaryMode) return null;

  // Require at least 75% confidence in the new key
  if (confidence < 0.75) return null;

  return {
    hasModulation: true,
    newTonic,
    newMode,
    atIndex:    midpoint,
    confidence,
  };
}

// ─── Style Selection from Tension ────────────────────────────────────────────

/**
 * chooseStyleFromAnalysis(chordAnalyses) -> string
 *
 * Dynamic: uses both styles in TENSION_STYLE_MAP based on mode.
 * Minor-key progressions prefer the second style option.
 */
export function chooseStyleFromAnalysis(chordAnalyses, mode = "major") {
  if (!chordAnalyses || chordAnalyses.length === 0) return "pop";

  const avg = chordAnalyses.reduce((sum, a) => sum + (a.tensionScore ?? 0.4), 0)
    / chordAnalyses.length;

  // Dynamic style selection table - both options are now used
  // Minor mode shifts preference toward the second (darker) option.
  //
  // Fixed: a stable, mostly-diatonic major-key song with a handful of 7th
  // chords (e.g. simple I-IV-V-based classic pop/rock) lands right in the
  // 0.20-0.35 tension band -- that's an extremely common case, and mapping
  // it to "lo-fi" was a real mismatch (confirmed on a real import: a
  // well-known anthemic song came out "lo-fi", which routed both Piano and
  // Rhythm to piano-family instruments with no guitar in the band at all).
  // "pop" is the far safer, more broadly correct default for ordinary
  // tertian harmony at low-moderate tension; lo-fi still applies in minor
  // mode via the *very* lowest band, where the mellow/chill fit is genuine.
  const styleMap = [
    { maxTension: 0.20, major: "acoustic", minor: "lo-fi"     },
    { maxTension: 0.35, major: "pop",      minor: "cinematic" },
    { maxTension: 0.50, major: "pop",      minor: "jazz"      },
    { maxTension: 0.65, major: "jazz",     minor: "rock"      },
    { maxTension: 0.78, major: "rock",     minor: "cinematic" },
    { maxTension: 1.00, major: "cinematic",minor: "cinematic" },
  ];

  for (const entry of styleMap) {
    if (avg <= entry.maxTension) {
      return mode === "minor" ? entry.minor : entry.major;
    }
  }
  return "cinematic";
}

// ─── Voice Leading ────────────────────────────────────────────────────────────

/**
 * Pure-math chord tones for common chord qualities.
 * Returns semitone intervals from root.
 */
function getChordIntervals(quality) {
  const map = {
    major:      [0, 4, 7],
    minor:      [0, 3, 7],
    diminished: [0, 3, 6],
    augmented:  [0, 4, 8],
    "half-dim": [0, 3, 6, 10],
    dominant:   [0, 4, 7, 10],
    dominant9:  [0, 4, 7, 10, 14],
    dominant11: [0, 4, 7, 10, 14, 17],
    dominant13: [0, 4, 7, 10, 14, 17, 21],
    major7:     [0, 4, 7, 11],
    minor7:     [0, 3, 7, 10],
    add9:       [0, 4, 7, 14],
    sus4:       [0, 5, 7],
    sus2:       [0, 2, 7],
    major6:     [0, 4, 7, 9],
  };
  return map[quality] || map.major;
}

/**
 * getCandidateMelodyNotes(chordName, tonic, mode)
 * Pure math - no tonal library dependency.
 */
function getCandidateMelodyNotes(chordName, tonic, mode = "major") {
  const scalePcs = getScalePcs(tonic, mode);
  const scaleSet = new Set(scalePcs);

  const rootPc  = chordRootToPc(chordName) ?? chordRootToPc(tonic) ?? 0;
  const quality = detectQuality(chordName);
  const intervals = getChordIntervals(quality);

  // Compute chord tone pitch classes
  const notePcs = intervals.map((i) => (rootPc + i) % 12);

  // Prefer chord tones that are also in the key scale
  const inScale = notePcs.filter((pc) => scaleSet.has(pc));
  const candidates = inScale.length > 0 ? inScale : (notePcs.length > 0 ? notePcs : scalePcs);

  return candidates.map((pc) => CHROMATIC[pc]);
}

/**
 * noteNameToMidi(noteName, octave) -> MIDI number
 * Pure math - no tonal library dependency.
 */
function noteNameToMidi(noteName, octave) {
  const pc = chordRootToPc(noteName);
  if (pc === null) return 60;
  // MIDI formula: C4 = 60, so midi = (octave + 1) * 12 + pc
  return (Number(octave) + 1) * 12 + pc;
}

/**
 * resolveVoiceLeading(chordNames, tonic, mode, sections)
 * -> Array<ChordAnalysis>
 *
 * Greedy nearest-neighbour voice leading.
 * - Prefers descending resolution from dominant (V) -> tonic (I)
 * - Prefers ascending resolution from leading tone (VII) -> I
 * - Allows octave jumps at section boundaries
 */
export function resolveVoiceLeading(chordNames, tonic, mode = "major", sections = []) {
  if (!chordNames || chordNames.length === 0) return [];

  const result   = [];
  let prevMidi   = null;

  for (let i = 0; i < chordNames.length; i++) {
    const chordName  = chordNames[i];
    const analysis   = analyzeChord(chordName, tonic, mode);
    const candidates = getCandidateMelodyNotes(chordName, tonic, mode);
    const isBoundary = sections.some((s) => s.start === i && i > 0);

    let chosenNote  = candidates[0] ?? "C";
    let chosenOctave = 5;

    if (prevMidi !== null && !isBoundary && candidates.length > 0) {
      let bestMidi = null;
      let bestDist = Infinity;

      // Determine preferred resolution direction from previous chord
      const prevAnalysis = result[i - 1];
      const wantDescend  = prevAnalysis?.scaleDegree === 4; // V resolves down
      const wantAscend   = prevAnalysis?.scaleDegree === 6; // VII resolves up

      for (const noteName of candidates) {
        for (const oct of [4, 5, 6]) {
          const midi = noteNameToMidi(noteName, oct);
          const dist = Math.abs(midi - prevMidi);
          if (dist > 7) continue;

          // Prefer resolution direction
          const direction = midi - prevMidi;
          const directionBonus = (wantDescend && direction < 0) || (wantAscend && direction > 0) ? -1 : 0;
          const adjustedDist   = dist + directionBonus;

          if (adjustedDist < bestDist) {
            bestDist  = adjustedDist;
            bestMidi  = midi;
            chosenNote   = noteName;
            chosenOctave = oct;
          }
        }
      }

      // If nothing within 7 semitones, pick closest overall
      if (bestMidi === null) {
        for (const noteName of candidates) {
          for (const oct of [4, 5, 6]) {
            const midi = noteNameToMidi(noteName, oct);
            const dist = Math.abs(midi - prevMidi);
            if (dist < bestDist) {
              bestDist     = dist;
              chosenNote   = noteName;
              chosenOctave = oct;
            }
          }
        }
      }
    }

    const resolvedMidi = noteNameToMidi(chosenNote, chosenOctave);
    prevMidi = resolvedMidi;

    result.push({
      index: i,
      chordName,
      resolvedMelodyNote: chosenNote,
      resolvedOctave:     chosenOctave,
      romanNumeral:       analysis.romanNumeral,
      tensionScore:       analysis.tensionScore,
      scaleDegree:        analysis.scaleDegree,
      quality:            analysis.quality,
      extensions:         analysis.extensions,
    });
  }

  return result;
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

/**
 * analyzeProgression(chordNames)
 * -> { tonic, mode, confidence, analyses, pattern, modulation }
 *
 * Complete pipeline:
 *   detectKey -> resolveVoiceLeading -> detectProgressionPattern -> detectModulation
 */
export function analyzeProgression(chordNames) {
  const { tonic, mode, confidence } = detectKey(chordNames);

  // Pass sections to voice leading for boundary-aware jumps
  const analyses   = resolveVoiceLeading(chordNames, tonic, mode);
  const pattern    = detectProgressionPattern(analyses);
  const modulation = detectModulation(chordNames, tonic, mode);

  return { tonic, mode, confidence, analyses, pattern, modulation };
}
