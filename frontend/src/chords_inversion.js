/**
 * chords_inversion.js
 *
 * Convert chord names and note names to MIDI numbers.
 * Pure JavaScript math — no external library dependency.
 * This avoids Vercel tree-shaking the tonal library imports.
 */

// Chromatic scale (sharp notation)
const CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// Base pitch class per letter
const BASE_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

/**
 * Parse a note/chord root name to a MIDI pitch-class (0-11).
 * Handles sharps (#) and flats (b).
 */
function nameToPc(name) {
  if (!name) return 0;
  const s      = String(name).trim();
  const letter = s[0].toUpperCase();
  const acc    = s[1] || "";
  const base   = BASE_PC[letter];
  if (base === undefined) return 0;
  const shift  = acc === "#" ? 1 : acc === "b" ? -1 : 0;
  return ((base + shift) + 12) % 12;
}

/**
 * Convert pitch-class + octave to MIDI number.
 * MIDI: C4 = 60, formula = (octave + 1) * 12 + pc
 */
function pcOctaveToMidi(pc, octave) {
  return (Number(octave) + 1) * 12 + pc;
}

/**
 * Chord quality -> semitone intervals from root.
 */
function getIntervals(suffix) {
  // dim / diminished
  if (/dim| deg/.test(suffix))           return [0, 3, 6];
  // augmented
  if (/aug|\+/.test(suffix))             return [0, 4, 8];
  // half-dim
  if (/m7b5|ø/.test(suffix))             return [0, 3, 6, 10];
  // minor 7
  if (/m7|min7/.test(suffix))            return [0, 3, 7, 10];
  // major 7
  if (/maj7|Maj7|M7|Δ/.test(suffix))    return [0, 4, 7, 11];
  // minor
  if (/^m(?!aj)|^min/.test(suffix))      return [0, 3, 7];
  // dominant 9/11/13
  if (/13/.test(suffix))                 return [0, 4, 7, 10, 14, 17, 21];
  if (/11/.test(suffix))                 return [0, 4, 7, 10, 14, 17];
  if (/9/.test(suffix) && !/maj/.test(suffix)) return [0, 4, 7, 10, 14];
  // dominant 7
  if (/7/.test(suffix) && !/maj/.test(suffix)) return [0, 4, 7, 10];
  // add9
  if (/add9|add2/.test(suffix))          return [0, 4, 7, 14];
  // sus4 / sus2
  if (/sus4|sus/.test(suffix))           return [0, 5, 7];
  if (/sus2/.test(suffix))               return [0, 2, 7];
  // major 6
  if (/^6/.test(suffix))                 return [0, 4, 7, 9];
  // plain major
  return [0, 4, 7];
}

/**
 * chordToMidi(chordName, octave, inversion?)
 *
 * Returns an array of MIDI numbers for the chord.
 * Supports inversions: 0 = root position, 1 = first inversion, 2 = second.
 */
export function chordToMidi(chordName, octave, inversion = 0) {
  if (!chordName) return [];

  // Parse root and suffix
  const match = String(chordName).match(/^([A-Ga-g][#b]?)(.*)/);
  if (!match) return [];

  const rootName = match[1];
  const suffix   = match[2] || "";
  const rootPc   = nameToPc(rootName);
  const intervals = getIntervals(suffix);

  // Build MIDI array from root octave
  const midi = intervals.map((semitones) => {
    const pc  = (rootPc + semitones % 12) % 12;
    const oct = Number(octave) + Math.floor(semitones / 12);
    return pcOctaveToMidi(pc, oct);
  });

  // Apply inversion: move lowest notes up an octave
  const amount = Number(inversion) % midi.length;
  for (let i = 0; i < amount; i++) {
    midi.push(midi.shift() + 12);
  }

  return midi;
}

/**
 * noteToMidi(noteName, octave)
 *
 * Returns [midiNumber] for a single note, or [] if invalid.
 */
export function noteToMidi(noteName, octave) {
  if (!noteName) return [];
  const pc   = nameToPc(String(noteName).trim());
  const midi = pcOctaveToMidi(pc, octave);
  return [midi];
}
