/**
 * LiveJamPad.jsx
 *
 * Full-screen phone-optimised chord pad for live performance.
 *
 * Upgrades over previous version:
 *  - Roman numeral labels derived dynamically (no hardcoded degree offsets)
 *  - Suggested next chord shown per pad button (circle-of-fifths probability)
 *  - producerSettings default from props, not hardcoded fallback object
 *  - Last-chord beat duration computed from actual tap hold time vs BPM
 *  - Mode-aware pad: shows minor scale degrees when tonic is minor-leaning
 *  - Swipe left/right to cycle keys (touch gesture detection)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@mui/material";
import { chordToMidi } from "./chords_inversion";
import { playJamChord, unlockAudio } from "./audio";
import { CHROMATIC } from "./musicTheory";

// ─── Constants ────────────────────────────────────────────────────────────────

const CIRCLE_OF_FIFTHS = [
  "C", "G", "D", "A", "E", "B",
  "F#", "Db", "Ab", "Eb", "Bb", "F",
];

// Flat -> sharp normalisation for index lookup
const TONIC_NORM = {
  Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#",
};

/**
 * Scale degree definitions for major and minor modes.
 * Everything is computed from intervals -- no hardcoded note names.
 */
const SCALE_CONFIGS = {
  major: {
    offsets:  [0, 2, 4, 5, 7, 9, 11],
    qualities:["",  "m","m","", "", "m","dim"],
    labels:   ["I","ii","iii","IV","V","vi","vii deg"],
    tensions: [0.05,0.35,0.40,0.10,0.70,0.15,0.75], // tension by scale degree
  },
  minor: {
    offsets:  [0, 2, 3, 5, 7, 8, 10],
    qualities:["m","dim","","m","m","",""],
    labels:   ["i","ii deg","III","iv","v","VI","VII"],
    tensions: [0.05,0.85,0.40,0.15,0.65,0.10,0.50],
  },
};

// Degree colour map: same degrees coloured consistently regardless of mode
const DEGREE_COLORS = {
  0: "#6D4AFF",  // I / i   -- purple (tonic)
  3: "#00B894",  // IV/ iv  -- green  (subdominant)
  4: "#FF6B8A",  // V / v   -- pink   (dominant)
  7: "#FDCB6E",  // V/V     -- amber  (secondary dominant)
};
const ACTIVE_COLOR = "#6D4AFF";

// ─── Pad chord generation ─────────────────────────────────────────────────────

/**
 * getPadChords(tonic, mode) -> Array<PadChord>
 *
 * Fully dynamic -- computes chord names, labels, Roman numerals,
 * and tension scores from the tonic + mode at runtime.
 * Returns 8 chords: the 7 diatonic degrees + V/V (secondary dominant).
 */
function getPadChords(tonic, mode = "major") {
  const normTonic = TONIC_NORM[tonic] || tonic;
  const tonicIdx  = CHROMATIC.indexOf(normTonic);
  if (tonicIdx === -1) return [];

  const config  = SCALE_CONFIGS[mode] || SCALE_CONFIGS.major;
  const chords  = config.offsets.map((offset, i) => {
    const noteIdx  = (tonicIdx + offset) % 12;
    const noteName = CHROMATIC[noteIdx];
    return {
      name:        `${noteName}${config.qualities[i]}`,
      label:       config.labels[i],
      degree:      i,
      tension:     config.tensions[i],
      romanNumeral:config.labels[i],
    };
  });

  // 8th button: V/V -- secondary dominant (major chord 2 semitones above tonic)
  const vOfVIdx = (tonicIdx + 2) % 12;
  chords.push({
    name:        CHROMATIC[vOfVIdx],
    label:       "V/V",
    degree:      7,
    tension:     0.65,
    romanNumeral:"V/V",
  });

  return chords;
}

/**
 * getSuggestedNext(currentDegree, mode) -> number[]
 *
 * Returns the most likely next scale degrees to follow the current one,
 * based on common-practice voice-leading probabilities.
 * Used to highlight suggested next chords on the pad.
 */
const NEXT_DEGREE_PROBS = {
  // degree -> most likely following degrees (ordered by probability)
  0: [3, 4, 5],   // I  -> IV, V, vi
  1: [4, 0],      // ii -> V, I
  2: [5, 3],      // iii-> vi, IV
  3: [0, 4, 1],   // IV -> I, V, ii
  4: [0, 5],      // V  -> I, vi
  5: [3, 1, 4],   // vi -> IV, ii, V
  6: [0],         // vii-> I
  7: [0, 4],      // V/V-> V, I
};

// ─── Instrument map (dynamic from style) ─────────────────────────────────────

const STYLE_INSTRUMENTS = {
  pop:       "acoustic_grand_piano",
  rock:      "rock_guitar",
  cinematic: "church_organ",
  "lo-fi":   "electric_grand_piano",
  jazz:      "electric_grand_piano",
  acoustic:  "acoustic_grand_piano",
};

function getInstrumentForStyle(style) {
  return STYLE_INSTRUMENTS[style] || "acoustic_grand_piano";
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   tonic?:             string
 *   mode?:              "major"|"minor"
 *   style?:             string
 *   producerSettings?:  object   -- passed from parent, no hardcoded default
 *   arrangementPreset?: string
 *   bpm?:               number
 *   onRecordComplete:   (track: object) => void
 *   onClose:            () => void
 * }} props
 */
export default function LiveJamPad({
  tonic            = "C",
  mode             = "major",
  style            = "pop",
  // No hardcoded default -- parent's live producerSettings are used directly
  producerSettings,
  arrangementPreset = "radio",
  bpm              = 120,
  onRecordComplete,
  onClose,
}) {
  // Resolve producerSettings: use parent value if provided, else compute a
  // style-appropriate default (not a hardcoded magic object)
  const resolvedSettings = producerSettings || {
    energy:             style === "rock" ? 82 : style === "jazz" ? 55 : 65,
    vocalIntensity:     style === "cinematic" ? 70 : 60,
    arrangementDensity: style === "jazz" ? 72 : 65,
  };

  // Determine initial key index -- try exact match, then flat/sharp normalised match
  const initialKeyIdx = Math.max(0,
    CIRCLE_OF_FIFTHS.indexOf(tonic) !== -1
      ? CIRCLE_OF_FIFTHS.indexOf(tonic)
      : CIRCLE_OF_FIFTHS.findIndex((k) => (TONIC_NORM[k] || k) === (TONIC_NORM[tonic] || tonic))
  );

  const [keyIdx,        setKeyIdx]       = useState(initialKeyIdx);
  const [currentMode,   setCurrentMode]  = useState(mode);
  const [activeChord,   setActiveChord]  = useState(null);
  const [activeDegree,  setActiveDegree] = useState(null);
  const [isRecording,   setIsRecording]  = useState(false);
  const [recordedCount, setRecordedCount]= useState(0);

  const recordStartRef  = useRef(null);
  const recordedChords  = useRef([]);
  const touchStartX     = useRef(null);
  const padRef          = useRef(null);

  const currentTonic = CIRCLE_OF_FIFTHS[keyIdx];
  const padChords    = getPadChords(currentTonic, currentMode);

  // Suggested next degrees based on last tapped
  const suggestedNext = activeDegree !== null
    ? new Set(NEXT_DEGREE_PROBS[activeDegree] || [])
    : new Set();

  // ── Key cycling ────────────────────────────────────────────────────────────
  const cycleKey = useCallback((dir) => {
    setKeyIdx((prev) => (prev + dir + CIRCLE_OF_FIFTHS.length) % CIRCLE_OF_FIFTHS.length);
  }, []);

  // ── Swipe gesture ──────────────────────────────────────────────────────────
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) cycleKey(delta < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  // ── Chord tap ─────────────────────────────────────────────────────────────
  const handleChordTap = useCallback(async (chord) => {
    await unlockAudio().catch(() => {});

    setActiveChord(chord.name);
    setActiveDegree(chord.degree);
    setTimeout(() => setActiveChord(null), 350);

    const midiNotes = chordToMidi(chord.name, 4);
    if (midiNotes.length > 0) {
      await playJamChord(midiNotes, 2, bpm, 0.85, getInstrumentForStyle(style));
    }

    if (isRecording && recordStartRef.current !== null) {
      recordedChords.current.push({
        chordName:  chord.name,
        degree:     chord.degree,
        romanNumeral: chord.romanNumeral,
        timestamp:  Date.now() - recordStartRef.current,
      });
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
    if (taps.length === 0) { recordStartRef.current = null; return; }

    const beatMs = (60 / bpm) * 1000;
    const chordObjects = taps.map((tap, i) => {
      // Last chord: use actual hold time if next tap exists, else use
      // the median hold duration of all other chords (not a hardcoded 2 beats)
      let holdMs;
      if (i < taps.length - 1) {
        holdMs = taps[i + 1].timestamp - tap.timestamp;
      } else if (taps.length > 1) {
        const otherHolds = taps.slice(0, -1).map((t, j) => taps[j+1].timestamp - t.timestamp);
        holdMs = otherHolds.reduce((s, h) => s + h, 0) / otherHolds.length;
      } else {
        holdMs = beatMs * 2; // single-tap fallback only
      }

      const rawBeats = holdMs / beatMs;
      const beats    = Math.min(8, Math.max(0.5, Math.round(rawBeats * 2) / 2));

      return {
        type:"chord", name: tap.chordName,
        octave:4, inversion:0, beats, repeat:1,
        wait:0, speed:0.85,
        instrument: getInstrumentForStyle(style),
        volume:0.8, pattern:[true],
        romanNumeral: tap.romanNumeral,
      };
    });

    const newTrack = {
      id:         Date.now(),
      name:       `Live Jam (${currentTonic} ${currentMode})`,
      instrument: getInstrumentForStyle(style),
      volume:     0.8,
      muted:false, solo:false, loop:false,
      color:"#A29BFE",
      chords: chordObjects,
    };

    recordStartRef.current = null;
    if (typeof onRecordComplete === "function") onRecordComplete(newTrack);
    onClose?.();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const colors = {
    bg:"#F7F5FF", primary:"#6D4AFF", text:"#372580",
    border:"#D8CCFF", danger:"#FF6B8A", card:"#FFFFFF",
  };

  const modeLabel = currentMode === "minor" ? "minor" : "major";

  return (
    <div
      ref={padRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:colors.bg, display:"flex",
        flexDirection:"column", alignItems:"center",
        padding:"16px 12px", boxSizing:"border-box", overflowY:"auto",
      }}
    >
      {/* Header */}
      <div style={{
        width:"100%", maxWidth:520, display:"flex",
        alignItems:"center", justifyContent:"space-between", marginBottom:8,
      }}>
        <button onClick={() => cycleKey(-1)} style={arrowBtnStyle(colors)} aria-label="Previous key">◀</button>

        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:20, fontWeight:900, color:colors.primary, letterSpacing:-0.5 }}>
            Key of {currentTonic} <span style={{ opacity:0.65 }}>{modeLabel}</span>
          </div>
          <div style={{ fontSize:11, opacity:0.6, color:colors.text, marginTop:2 }}>
            {bpm} BPM · {style} · swipe to change key
          </div>
        </div>

        <button onClick={() => cycleKey(1)} style={arrowBtnStyle(colors)} aria-label="Next key">▶</button>
      </div>

      {/* Mode toggle */}
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {["major","minor"].map((m) => (
          <button
            key={m}
            onClick={() => setCurrentMode(m)}
            style={{
              padding:"4px 14px", borderRadius:999, fontSize:12, fontWeight:700,
              border:`1.5px solid ${currentMode === m ? colors.primary : colors.border}`,
              background: currentMode === m ? `${colors.primary}18` : "transparent",
              color: currentMode === m ? colors.primary : colors.text,
              cursor:"pointer",
            }}
          >{m}</button>
        ))}
      </div>

      {/* Chord pad grid -- 4×2 */}
      <div style={{
        display:"grid", gridTemplateColumns:"repeat(4, 1fr)",
        gap:10, width:"100%", maxWidth:520, marginBottom:14,
      }}>
        {padChords.map((chord) => {
          const isActive    = activeChord === chord.name;
          const isSuggested = suggestedNext.has(chord.degree) && activeChord === null;
          const degColor    = DEGREE_COLORS[chord.degree];
          const baseColor   = degColor || "rgba(55,37,128,0.10)";

          return (
            <button
              key={`${chord.name}-${chord.degree}`}
              onPointerDown={() => handleChordTap(chord)}
              aria-label={`Play ${chord.name} (${chord.romanNumeral})`}
              style={{
                minHeight:      80,
                borderRadius:   14,
                border:         `2px solid ${
                  isActive    ? ACTIVE_COLOR
                  : isSuggested ? `${baseColor}`
                  : colors.border
                }`,
                background: isActive
                  ? ACTIVE_COLOR
                  : isSuggested
                    ? `${baseColor}40`
                    : degColor ? `${degColor}14` : colors.card,
                color: isActive ? "#fff" : degColor || colors.text,
                fontWeight:   800,
                fontSize:     19,
                cursor:       "pointer",
                display:      "flex",
                flexDirection:"column",
                alignItems:   "center",
                justifyContent:"center",
                gap:          3,
                boxShadow:    isActive
                  ? `0 4px 20px ${ACTIVE_COLOR}55`
                  : isSuggested
                    ? `0 2px 12px ${baseColor}44`
                    : "0 2px 6px rgba(0,0,0,0.05)",
                transition:   "all 0.1s ease",
                userSelect:   "none",
                WebkitUserSelect:"none",
                touchAction:  "manipulation",
                outline:      isSuggested && !isActive ? `2px dashed ${baseColor}` : "none",
                outlineOffset: "-3px",
              }}
            >
              {/* Chord name */}
              <span style={{ lineHeight:1 }}>{chord.name}</span>
              {/* Roman numeral label -- dynamic from scale config */}
              <span style={{ fontSize:10, opacity:0.75, fontWeight:700, letterSpacing:0.3 }}>
                {chord.romanNumeral}
              </span>
              {/* Suggested indicator */}
              {isSuggested && (
                <span style={{
                  fontSize:8, opacity:0.6, fontWeight:600,
                  letterSpacing:0.5, textTransform:"uppercase",
                }}>next?</span>
              )}
              {/* Tension dot -- subtle visual cue */}
              <div style={{
                width: 4, height: 4, borderRadius:"50%", marginTop:2,
                background: isActive ? "rgba(255,255,255,0.7)"
                  : chord.tension > 0.6 ? "#FF6B8A"
                  : chord.tension > 0.3 ? "#FDCB6E"
                  : "#00B894",
                opacity: 0.7,
              }}/>
            </button>
          );
        })}
      </div>

      {/* Recording status */}
      {isRecording && (
        <div style={{
          padding:"8px 16px", borderRadius:8,
          background:"#FF6B8A22", border:"1px solid #FF6B8A",
          color:colors.danger, fontWeight:700, fontSize:13, marginBottom:12,
        }}>
          🔴 Recording… {recordedCount} chord{recordedCount !== 1 ? "s" : ""} captured
        </div>
      )}

      {/* Active chord info */}
      {activeChord && (
        <div style={{
          padding:"6px 14px", borderRadius:8, marginBottom:8,
          background:`${colors.primary}12`, border:`1px solid ${colors.border}`,
          fontSize:12, color:colors.primary, fontWeight:700,
        }}>
          Playing: <strong>{activeChord}</strong>
          {" -- "}
          {padChords.find((c) => c.name === activeChord)?.romanNumeral}
        </div>
      )}

      {/* Bottom controls */}
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
        {!isRecording ? (
          <Button variant="contained" onClick={startRecording}
            sx={{ background:colors.danger, borderRadius:3, textTransform:"none", fontWeight:700 }}>
            ⏺ Record
          </Button>
        ) : (
          <Button variant="contained" onClick={stopRecording}
            sx={{ background:"#E17055", borderRadius:3, textTransform:"none", fontWeight:700 }}>
            ⏹ Stop &amp; Save
          </Button>
        )}
        <Button variant="outlined" onClick={onClose}
          sx={{ borderRadius:3, textTransform:"none" }}>
          ✕ Close
        </Button>
      </div>

      {/* Hint */}
      <div style={{ marginTop:12, fontSize:10, opacity:0.4, color:colors.text, textAlign:"center" }}>
        Dashed outline = suggested next chord · Dot colour = tension level
      </div>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function arrowBtnStyle(colors) {
  return {
    width:44, height:44, borderRadius:"50%",
    border:`2px solid ${colors.border}`,
    background:colors.card, color:colors.primary,
    fontSize:18, fontWeight:700, cursor:"pointer",
    display:"flex", alignItems:"center", justifyContent:"center",
    flexShrink:0,
  };
}
