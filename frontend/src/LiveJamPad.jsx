/**
 * LiveJamPad.jsx
 *
 * Full-screen phone-optimised chord pad for live performance.
 *
 * Features:
 *  - 8 large touch buttons derived from the current key + circle of fifths
 *  - Left/right arrows cycle through the circle of fifths
 *  - Tap to play the full band voicing for that chord instantly (< 100ms)
 *  - RECORD mode captures taps with timestamps → writes a new track
 *  - Visual feedback: active chord button highlights, section display
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@mui/material";
import { chordToMidi } from "./chords_inversion";
import { playJamChord, unlockAudio } from "./audio";

// ─── Music constants ──────────────────────────────────────────────────────────

const CIRCLE_OF_FIFTHS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

/**
 * Build the 8 pad chords for a given tonic (major key).
 * Scale degrees: I, ii, iii, IV, V, vi, vii°, V/V
 */
function getPadChords(tonic) {
  // Semitone offsets for major scale degrees
  const DEGREE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
  const QUALITIES      = ["",  "m", "m", "", "", "m", "dim"];
  const LABELS         = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

  const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // Normalise the tonic to chromatic index
  const TONIC_NORM = {
    Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  };
  const normTonic = TONIC_NORM[tonic] || tonic;
  const tonicIdx  = CHROMATIC.indexOf(normTonic);
  if (tonicIdx === -1) return [];

  const chords = DEGREE_OFFSETS.map((offset, i) => {
    const noteIdx  = (tonicIdx + offset) % 12;
    const noteName = CHROMATIC[noteIdx];
    return {
      name:    `${noteName}${QUALITIES[i]}`,
      label:   LABELS[i],
      degree:  i,          // 0=I, 3=IV, 4=V  — used for colour
    };
  });

  // 8th chord: V/V (secondary dominant = major chord on the 2nd degree)
  const vOfVIdx   = (tonicIdx + 2) % 12; // 2 semitones up = major 2nd
  chords.push({
    name:  CHROMATIC[vOfVIdx],
    label: "V/V",
    degree: 7,
  });

  return chords;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const DEGREE_COLORS = {
  0: "#6D4AFF",   // I   – primary purple
  3: "#00B894",   // IV  – green
  4: "#FF6B8A",   // V   – pink
  7: "#FDCB6E",   // V/V – amber
};
const DEFAULT_CHORD_COLOR = "rgba(55,37,128,0.12)";
const ACTIVE_COLOR        = "#6D4AFF";

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   tonic?: string
 *   style?: string
 *   producerSettings?: object
 *   arrangementPreset?: string
 *   bpm?: number
 *   onRecordComplete: (track: object) => void
 *   onClose: () => void
 * }} props
 */
export default function LiveJamPad({
  tonic            = "C",
  style            = "pop",
  producerSettings = { energy: 74, vocalIntensity: 68, arrangementDensity: 72 },
  arrangementPreset = "radio",
  bpm              = 120,
  onRecordComplete,
  onClose,
}) {
  // Determine starting key index from tonic prop
  const initialKeyIdx = Math.max(0, CIRCLE_OF_FIFTHS.indexOf(tonic));

  const [keyIdx,       setKeyIdx]      = useState(initialKeyIdx);
  const [activeChord,  setActiveChord] = useState(null);
  const [isRecording,  setIsRecording] = useState(false);
  const [recordedCount,setRecordedCount] = useState(0);

  const recordStartRef = useRef(null);
  const recordedChords = useRef([]);   // [{ chordName, timestamp }]

  const currentTonic = CIRCLE_OF_FIFTHS[keyIdx];
  const padChords    = getPadChords(currentTonic);

  // ── Key cycling ────────────────────────────────────────────────────────────
  const cycleKey = (dir) => {
    setKeyIdx((prev) => (prev + dir + CIRCLE_OF_FIFTHS.length) % CIRCLE_OF_FIFTHS.length);
  };

  // ── Chord tap ─────────────────────────────────────────────────────────────
  const handleChordTap = useCallback(async (chordName) => {
    // Unlock audio on first interaction (required by browsers)
    await unlockAudio().catch(() => {});

    setActiveChord(chordName);
    setTimeout(() => setActiveChord(null), 300);

    // Determine MIDI notes for this chord at a suitable octave
    const octave    = 4;
    const midiNotes = chordToMidi(chordName, octave);

    if (midiNotes.length > 0) {
      await playJamChord(midiNotes, 2, bpm, 0.85, getInstrumentForStyle(style));
    }

    // If recording, capture the tap
    if (isRecording && recordStartRef.current !== null) {
      const timestamp = Date.now() - recordStartRef.current;
      recordedChords.current.push({ chordName, timestamp });
      setRecordedCount((c) => c + 1);
    }
  }, [bpm, style, isRecording]);

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = () => {
    recordedChords.current = [];
    setRecordedCount(0);
    recordStartRef.current = Date.now();
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
    const taps = recordedChords.current;

    if (taps.length === 0) {
      recordStartRef.current = null;
      return;
    }

    // Compute beat durations
    const beatMs = (60 / bpm) * 1000;
    const chordObjects = taps.map((tap, i) => {
      const holdMs   = i < taps.length - 1
        ? taps[i + 1].timestamp - tap.timestamp
        : beatMs * 2;  // default last chord to 2 beats
      const rawBeats = holdMs / beatMs;
      const beats    = Math.min(4, Math.max(0.5, Math.round(rawBeats * 2) / 2));
      const octave   = 4;

      return {
        type:       "chord",
        name:       tap.chordName,
        octave,
        inversion:  0,
        beats,
        repeat:     1,
        wait:       0,
        speed:      0.85,
        instrument: getInstrumentForStyle(style),
        volume:     0.8,
        pattern:    [true],
      };
    });

    const newTrack = {
      id:         Date.now(),
      name:       `Live Jam (${currentTonic})`,
      instrument: getInstrumentForStyle(style),
      volume:     0.8,
      muted:      false,
      solo:       false,
      loop:       false,
      color:      "#A29BFE",
      chords:     chordObjects,
    };

    recordStartRef.current = null;
    if (typeof onRecordComplete === "function") {
      onRecordComplete(newTrack);
    }
    onClose?.();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const colors = {
    bg:      "#F7F5FF",
    primary: "#6D4AFF",
    text:    "#372580",
    border:  "#D8CCFF",
    danger:  "#FF6B8A",
    card:    "#FFFFFF",
  };

  return (
    <div
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     1000,
        background: colors.bg,
        display:    "flex",
        flexDirection: "column",
        alignItems:  "center",
        padding:     "16px 12px",
        boxSizing:   "border-box",
        overflowY:   "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          width:          "100%",
          maxWidth:       500,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   12,
        }}
      >
        <button
          onClick={() => cycleKey(-1)}
          style={arrowBtnStyle(colors)}
          aria-label="Previous key"
        >◀</button>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: colors.primary }}>
            Key of {currentTonic} major
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, color: colors.text }}>
            {bpm} BPM · {style} · {arrangementPreset}
          </div>
        </div>

        <button
          onClick={() => cycleKey(1)}
          style={arrowBtnStyle(colors)}
          aria-label="Next key"
        >▶</button>
      </div>

      {/* Chord pad grid — 4×2 */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap:                 10,
          width:               "100%",
          maxWidth:            500,
          marginBottom:        16,
        }}
      >
        {padChords.map((chord) => {
          const isActive = activeChord === chord.name;
          const baseColor = DEGREE_COLORS[chord.degree] || DEFAULT_CHORD_COLOR;
          return (
            <button
              key={chord.name}
              onPointerDown={() => handleChordTap(chord.name)}
              style={{
                minHeight:    80,
                borderRadius: 14,
                border:       `2px solid ${isActive ? ACTIVE_COLOR : colors.border}`,
                background:   isActive ? ACTIVE_COLOR : (DEGREE_COLORS[chord.degree] ? `${baseColor}22` : colors.card),
                color:        isActive ? "#fff" : (DEGREE_COLORS[chord.degree] ? baseColor : colors.text),
                fontWeight:   800,
                fontSize:     20,
                cursor:       "pointer",
                display:      "flex",
                flexDirection:"column",
                alignItems:   "center",
                justifyContent: "center",
                gap:          4,
                boxShadow:    isActive ? `0 4px 20px ${ACTIVE_COLOR}55` : "0 2px 8px rgba(0,0,0,0.06)",
                transition:   "all 0.1s ease",
                userSelect:   "none",
                WebkitUserSelect: "none",
                touchAction:  "manipulation",
              }}
              aria-label={`Play ${chord.name}`}
            >
              <span>{chord.name}</span>
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{chord.label}</span>
            </button>
          );
        })}
      </div>

      {/* Recording status */}
      {isRecording && (
        <div
          style={{
            padding:    "8px 16px",
            borderRadius: 8,
            background: "#FF6B8A22",
            border:     "1px solid #FF6B8A",
            color:      colors.danger,
            fontWeight: 700,
            fontSize:   13,
            marginBottom: 12,
          }}
        >
          🔴 Recording… {recordedCount} chord{recordedCount !== 1 ? "s" : ""} captured
        </div>
      )}

      {/* Bottom controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {!isRecording ? (
          <Button
            variant="contained"
            onClick={startRecording}
            sx={{ background: colors.danger, borderRadius: 3, textTransform: "none", fontWeight: 700 }}
          >
            ⏺ Record
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={stopRecording}
            sx={{ background: "#E17055", borderRadius: 3, textTransform: "none", fontWeight: 700 }}
          >
            ⏹ Stop &amp; Save
          </Button>
        )}

        <Button
          variant="outlined"
          onClick={onClose}
          sx={{ borderRadius: 3, textTransform: "none" }}
        >
          ✕ Close
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrowBtnStyle(colors) {
  return {
    width:        44,
    height:       44,
    borderRadius: "50%",
    border:       `2px solid ${colors.border}`,
    background:   colors.card,
    color:        colors.primary,
    fontSize:     18,
    fontWeight:   700,
    cursor:       "pointer",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
  };
}

/** Pick a suitable instrument for the live jam based on the current style. */
function getInstrumentForStyle(style) {
  const map = {
    pop:       "acoustic_grand_piano",
    rock:      "rock_guitar",
    cinematic: "church_organ",
    "lo-fi":   "electric_grand_piano",
    jazz:      "electric_grand_piano",
    acoustic:  "acoustic_grand_piano",
  };
  return map[style] || "acoustic_grand_piano";
}
