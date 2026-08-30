/**
 * musicTheory.js
 *
 * Pure music theory engine:
 *   - Key detection via circle-of-fifths scoring
 *   - Roman numeral analysis per chord
 *   - Tension scoring
 *   - Voice-leading-aware melody note resolution
 *
 * No side effects. No audio. No React.
 * Uses the tonal library (already in package.json).
 */

import { Note, Chord } from "tonal";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Semitone intervals for a major scale: W W H W W W H
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Semitone intervals for a natural minor scale: W H W W H W W
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Roman numeral labels by scale degree (0-based), major key
const MAJOR_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const MINOR_ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];

// Tension scores keyed by Roman numeral root label.
// Keys cover BOTH uppercase (major-quality degree) and lowercase (minor-quality degree)
// because analyzeChord uses MAJOR_ROMAN for major chords and MINOR_ROMAN for minor.
const TENSION_MAP = {
  // Stable — tonic/subdominant function
  I:   0.1,  i:   0.1,
  IV:  0.1,  iv:  0.15,
  VI:  0.15, vi:  0.15,
  // Mild tension — mediant / supertonic
  II:  0.35, ii:  0.35,
  III: 0.4,  iii: 0.4,
  // Dominant tension
  V:   0.7,  v:   0.6,
  VII: 0.75, vii: 0.75,
  // High tension
  "vii°": 0.9,
  chromatic: 0.9,
};

// Average tension threshold → preferred styles
const TENSION_STYLE_MAP = [
  { maxTension: 0.3, styles: ["acoustic", "lo-fi"] },
  { maxTension: 0.5, styles: ["pop", "jazz"] },
  { maxTension: 0.7, styles: ["rock", "pop"] },
  { maxTension: 1.0, styles: ["cinematic", "rock"] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a chord name to a pitch-class index 0–11.
 * Returns null if unparseable.
 */
function chordRootToPc(chordName) {
  if (!chordName) return null;
  const n = Note.get(Note.pitchClass(chordName.match(/^[A-Ga-g][#b]?/)?.[0] || "C"));
  return n.chroma ?? null;
}

/**
 * Return the 7 diatonic pitch-class indices for a given tonic pc
 * and a scale interval array.
 */
function diatonicSet(tonicPc, intervals) {
  return intervals.map((i) => (tonicPc + i) % 12);
}

/**
 * Detect chord quality from a chord name string.
 * Returns: "major" | "minor" | "diminished" | "augmented" | "dominant" | "major7" | "minor7"
 */
function detectQuality(chordName) {
  const name = String(chordName).replace(/^[A-Ga-g][#b]?/, "");
  // Order matters: more-specific patterns must come before their subsets.
  if (/dim|°/.test(name)) return "diminished";
  if (/aug|\+/.test(name)) return "augmented";
  // minor7 MUST come before minor (m7 contains m)
  if (/m7b?5?|min7/.test(name)) return "minor7";
  if (/maj7|Δ/.test(name)) return "major7";
  if (/^m[^a]|^min|^-/.test(name)) return "minor";
  // dominant 7 (plain 7 without maj)
  if (/[0-9]/.test(name) && !/maj/.test(name) && !/min/.test(name)) return "dominant";
  // sus, add, aug with numbers → still major quality root
  if (/sus|add/.test(name)) return "major";
  // empty suffix → plain major
  if (name === "") return "major";
  return "major";
}

// ─── Key Detection ────────────────────────────────────────────────────────────

/**
 * detectKey(chords: string[]) → { tonic: string, confidence: number, mode: "major"|"minor" }
 *
 * Scores all 12 pitch-classes as candidate tonics (both major and minor mode).
 * Returns the best-scoring tonic + mode.
 * Tiebreak: prefer the pitch-class that appears most as a chord root in the input.
 */
export function detectKey(chords) {
  if (!chords || chords.length === 0) return { tonic: "C", confidence: 0, mode: "major" };

  // Parse roots to pitch-class indices
  const rootPcs = chords.map((c) => chordRootToPc(c)).filter((pc) => pc !== null);
  const total = rootPcs.length || 1;

  let bestScore = -1;
  let bestTonic = "C";
  let bestMode = "major";

  for (let tonicPc = 0; tonicPc < 12; tonicPc++) {
    for (const [mode, intervals] of [
      ["major", MAJOR_SCALE_INTERVALS],
      ["minor", MINOR_SCALE_INTERVALS],
    ]) {
      const diatonic = new Set(diatonicSet(tonicPc, intervals));
      const score = rootPcs.filter((pc) => diatonic.has(pc)).length / total;

      if (score > bestScore) {
        bestScore = score;
        bestTonic = CHROMATIC[tonicPc];
        bestMode = mode;
      } else if (score === bestScore) {
        // Tiebreak: pick the tonic pitch-class that appears most as a chord root
        const tonicFreq = rootPcs.filter((pc) => pc === tonicPc).length;
        const bestTonicPc = CHROMATIC.indexOf(bestTonic); // integer 0-11, always valid since bestTonic comes from CHROMATIC[x]
        const bestFreq = rootPcs.filter((pc) => pc === bestTonicPc).length;
        if (tonicFreq > bestFreq) {
          bestTonic = CHROMATIC[tonicPc];
          bestMode = mode;
        }
      }
    }
  }

  return { tonic: bestTonic, confidence: bestScore, mode: bestMode };
}

// ─── Roman Numeral Analysis ───────────────────────────────────────────────────

/**
 * analyzeChord(chordName: string, tonic: string, mode?: "major"|"minor")
 * → { romanNumeral: string, tensionScore: number, scaleDegree: number|null, quality: string }
 */
export function analyzeChord(chordName, tonic, mode = "major") {
  const rootPc = chordRootToPc(chordName);
  const tonicPc = chordRootToPc(tonic);
  const quality = detectQuality(chordName);
  const intervals = mode === "minor" ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
  const diatonic = diatonicSet(tonicPc ?? 0, intervals);

  if (rootPc === null || tonicPc === null) {
    return { romanNumeral: "chromatic", tensionScore: 0.9, scaleDegree: null, quality };
  }

  const degree = diatonic.indexOf(rootPc); // 0-based scale degree, or -1 if chromatic

  if (degree === -1) {
    return { romanNumeral: "chromatic", tensionScore: 0.9, scaleDegree: null, quality };
  }

  // Assign Roman numeral based on quality
  let romanNumeral;
  if (quality === "diminished") {
    romanNumeral = MINOR_ROMAN[degree] + "°";
  } else if (quality === "minor" || quality === "minor7") {
    romanNumeral = MINOR_ROMAN[degree];
  } else {
    romanNumeral = MAJOR_ROMAN[degree];
  }

  // Compute tension score
  const baseLabel = degree === 6 && quality === "diminished"
    ? "vii°"
    : (quality === "minor" || quality === "minor7" ? MINOR_ROMAN[degree] : MAJOR_ROMAN[degree]);

  const tensionScore = TENSION_MAP[baseLabel] ?? TENSION_MAP[romanNumeral] ?? 0.5;

  return { romanNumeral, tensionScore, scaleDegree: degree, quality };
}

// ─── Style Selection from Average Tension ────────────────────────────────────

/**
 * chooseStyleFromAnalysis(chordAnalyses: Array<{tensionScore}>) → string
 *
 * Replaces the old chooseStyle() string-matching function.
 */
export function chooseStyleFromAnalysis(chordAnalyses) {
  if (!chordAnalyses || chordAnalyses.length === 0) return "pop";
  const avg = chordAnalyses.reduce((sum, a) => sum + (a.tensionScore ?? 0.4), 0) / chordAnalyses.length;
  for (const entry of TENSION_STYLE_MAP) {
    if (avg <= entry.maxTension) return entry.styles[0];
  }
  return "cinematic";
}

// ─── Voice Leading ────────────────────────────────────────────────────────────

/**
 * Get the available melody notes for a chord name + tonic as MIDI pitch-classes.
 * Returns up to 3 candidate note names (root, 3rd, 5th in the key scale).
 */
function getCandidateMelodyNotes(chordName, tonic, mode = "major") {
  const tonicPc = chordRootToPc(tonic) ?? 0;
  const intervals = mode === "minor" ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
  const scale = intervals.map((i) => (tonicPc + i) % 12);

  // Try tonal first
  const chordData = Chord.get(chordName);
  let notePcs = [];
  if (chordData.notes && chordData.notes.length > 0) {
    notePcs = chordData.notes
      .map((n) => Note.get(n).chroma)
      .filter((pc) => pc !== undefined && pc !== null);
  }

  // Filter to scale members, fallback to scale notes near the root
  const scaleMemberPcs = notePcs.filter((pc) => scale.includes(pc));
  if (scaleMemberPcs.length === 0) {
    // Use scale degree closest to root
    const rootPc = chordRootToPc(chordName) ?? tonicPc;
    scaleMemberPcs.push(rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12);
  }

  // Convert pitch-classes back to note names
  return scaleMemberPcs.map((pc) => CHROMATIC[pc]);
}

/**
 * noteNameToMidi(noteName: string, octave: number) → number
 */
function noteNameToMidi(noteName, octave) {
  return Note.midi(`${noteName}${octave}`) ?? 60;
}

/**
 * resolveVoiceLeading(chordNames: string[], tonic: string, mode?: "major"|"minor", sections?: Array<{name,start,end}>)
 * → Array<{ index, chordName, resolvedMelodyNote, romanNumeral, tensionScore }>
 *
 * Picks melody notes for each chord so adjacent steps are ≤ 7 semitones apart.
 * Allows jumps at section boundaries (Verse→Chorus, Chorus→Bridge).
 */
export function resolveVoiceLeading(chordNames, tonic, mode = "major", sections = []) {
  if (!chordNames || chordNames.length === 0) return [];

  const result = [];
  let prevMidi = null;

  for (let i = 0; i < chordNames.length; i++) {
    const chordName = chordNames[i];
    const analysis = analyzeChord(chordName, tonic, mode);
    const candidates = getCandidateMelodyNotes(chordName, tonic, mode);

    // Check if this chord is at a section boundary (allow big jumps)
    const isBoundary = sections.some((s) => s.start === i && i > 0);

    let chosenNote = candidates[0] ?? "C";
    let chosenOctave = 5;

    if (prevMidi !== null && !isBoundary && candidates.length > 0) {
      // Find the octave + candidate that minimises distance from prevMidi
      let bestMidi = null;
      let bestDist = Infinity;

      for (const noteName of candidates) {
        for (const oct of [4, 5, 6]) {
          const midi = noteNameToMidi(noteName, oct);
          const dist = Math.abs(midi - prevMidi);
          if (dist < bestDist && dist <= 7) {
            bestDist = dist;
            bestMidi = midi;
            chosenNote = noteName;
            chosenOctave = oct;
          }
        }
      }

      // If nothing is within 7 semitones, pick the closest overall
      if (bestMidi === null) {
        for (const noteName of candidates) {
          for (const oct of [4, 5, 6]) {
            const midi = noteNameToMidi(noteName, oct);
            const dist = Math.abs(midi - prevMidi);
            if (dist < bestDist) {
              bestDist = dist;
              chosenNote = noteName;
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
      resolvedOctave: chosenOctave,
      romanNumeral: analysis.romanNumeral,
      tensionScore: analysis.tensionScore,
      scaleDegree: analysis.scaleDegree,
      quality: analysis.quality,
    });
  }

  return result;
}

/**
 * analyzeProgression(chordNames: string[])
 * → { tonic, mode, confidence, analyses: Array<ChordAnalysis> }
 *
 * Full pipeline: detect key → resolve voice leading → return everything.
 */
export function analyzeProgression(chordNames) {
  const { tonic, mode, confidence } = detectKey(chordNames);
  const analyses = resolveVoiceLeading(chordNames, tonic, mode);
  return { tonic, mode, confidence, analyses };
}
