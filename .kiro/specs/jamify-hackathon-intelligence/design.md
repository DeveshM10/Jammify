# Design Document — Jamify Hackathon Intelligence

## Overview

This document describes the technical design for five intelligence upgrades to Jamify (React + Vite + Tone.js frontend, FastAPI backend). Each feature maps directly to one or more requirements in `requirements.md`. The implementation targets in-browser execution with no mandatory server round-trips for the core audio/music paths, making it robust for live hackathon demos on a phone.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Feature A — Voice-to-Arrangement](#2-feature-a--voice-to-arrangement)
3. [Feature B — Camera Chord Scanner](#3-feature-b--camera-chord-scanner)
4. [Feature C — Music Theory Engine](#4-feature-c--music-theory-engine)
5. [Feature D — Mood Parser and Ollama Bridge](#5-feature-d--mood-parser-and-ollama-bridge)
6. [Feature E — Live Jam Pad](#6-feature-e--live-jam-pad)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)
8. [File and Package Summary](#8-file-and-package-summary)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                             │
│                                                                     │
│  App_beta.jsx                                                       │
│  ├── VoiceAnalyzer UI  ──→  voiceAnalyzer.js  ──→  aiBandEngine.js │
│  ├── CameraScanner UI  ──→  cameraScanner.js  ──→  aiBandEngine.js │
│  ├── MoodParser UI     ──→  moodParser.js                          │
│  │                         ollamaClient.js    ──→  aiBandEngine.js │
│  ├── LiveJamPad.jsx    ──→  audio.js (playJamChord)                │
│  │                         └── onRecordComplete → App state        │
│  └── Arranger (existing)                                           │
│       └── aiBandEngine.js  ←── musicTheory.js                      │
│             ↓                                                       │
│           audio.js  →  Tone.js  →  Web Audio API                   │
└─────────────────────────────────────────────────────────────────────┘
          │ optional
          ▼
┌─────────────────────────┐
│  FastAPI backend        │
│  POST /mood-llm         │
│  → Ollama localhost     │
└─────────────────────────┘
```

### Data flow for a typical chord-generation cycle

1. Input arrives: voice buffer / camera frame / mood text / live tap.
2. Input module produces a chord list + `{ style, producerSettings, bpm, tonic }`.
3. `aiBandEngine.js:buildBandFromSong()` calls `musicTheory.detectKey()` and `musicTheory.resolveVoiceLeading()` on the chord list.
4. Each `makeTrack()` call consumes `chordAnalysis` objects (romanNumeral, tensionScore, resolvedMelodyNote) to produce per-chord track data.
5. `audio.js:playChord()` or `playJamChord()` schedules the Tone.js samplers.

---

## 2. Feature A — Voice-to-Arrangement

**Requirements covered:** 1, 2, 3, 4

### 2.1 New file: `frontend/src/voiceAnalyzer.js`

#### 2.1.1 Recording

```js
/**
 * Request microphone access and record for `durationSeconds`.
 * Returns an AudioBuffer decoded from the captured media.
 * Throws a { code: 'PERMISSION_DENIED' | 'NOT_SUPPORTED', message } object
 * if permission is refused or the API is unavailable.
 *
 * @param {number} durationSeconds  3–10, default 5
 * @returns {Promise<AudioBuffer>}
 */
export async function startRecording(durationSeconds = 5) {
  // 1. navigator.mediaDevices.getUserMedia({ audio: true })
  //    — let the browser rejection propagate as-is; caller wraps in try/catch
  //      and maps MediaError codes to UI messages.
  // 2. Connect stream to a MediaRecorder (audio/webm or audio/ogg).
  // 3. Collect chunks in ondataavailable.
  // 4. After durationSeconds, call recorder.stop().
  // 5. Blob → ArrayBuffer → AudioContext.decodeAudioData → return AudioBuffer.
  // 6. Release the MediaStream tracks immediately after decoding.
}
```

**Error handling (Requirement 1.2):**
- `NotAllowedError` / `PermissionDeniedError` → emit `{ code: 'PERMISSION_DENIED' }`.
- `NotFoundError` / `NotSupportedError` → emit `{ code: 'NOT_SUPPORTED' }`.
- Caller in `App_beta.jsx` catches both and renders the fallback manual BPM/style UI.

#### 2.1.2 BPM Detection (Requirement 2)

```js
/**
 * Estimate tempo from an AudioBuffer using onset-envelope autocorrelation.
 *
 * Algorithm:
 *  1. Downmix to mono.
 *  2. Compute RMS energy in 10 ms non-overlapping frames → onset envelope E[n].
 *  3. Compute first-order difference D[n] = max(0, E[n] - E[n-1]) (half-wave rectify).
 *  4. Autocorrelate D over lag range L_min..L_max where:
 *       L_min = floor(sampleRate * 60 / (220 * frameSize))  (220 BPM)
 *       L_max = floor(sampleRate * 60 / (40  * frameSize))  (40  BPM)
 *  5. Find peak lag L_peak in autocorrelation array.
 *  6. bpm = sampleRate * 60 / (L_peak * frameSize).
 *  7. confidence = peakValue / maxPossiblePeakValue (normalised 0–1).
 *     If confidence < CONFIDENCE_THRESHOLD (0.3), return { bpm: null, confidence }.
 *
 * @param {AudioBuffer} buffer
 * @returns {{ bpm: number|null, confidence: number, energy: number }}
 *   energy is the normalised mean RMS of the entire buffer (used by Req 4).
 */
export function analyzeBPM(buffer) { ... }
```

Constants:
- `FRAME_SIZE_SECONDS = 0.010` (10 ms)
- `CONFIDENCE_THRESHOLD = 0.30`

BPM is clamped to [40, 220] before return (Requirement 2.1).

The `energy` field is the mean RMS across all frames normalised to [0, 1] by dividing by the peak theoretical RMS for a full-scale signal (Requirement 4.1).

#### 2.1.3 Pitch / Key Detection (Requirement 3)

```js
/**
 * Estimate the dominant fundamental frequency using the McLeod Pitch Method.
 *
 * Algorithm:
 *  1. Downmix to mono, use the first 0.5 s of the buffer (sufficient for key detection).
 *  2. Compute normalised square difference function (NSDF) — the MPM core.
 *  3. Find the first peak above KEY_THRESHOLD (0.8) in the NSDF.
 *     peak lag → frequency = sampleRate / lag.
 *  4. clarity = NSDF value at peak (0–1).
 *  5. If clarity < 0.8 return { frequency: null, clarity } (Requirement 3.3).
 *
 * @param {AudioBuffer} buffer
 * @returns {{ frequency: number|null, clarity: number }}
 */
export function analyzePitch(buffer) { ... }

/**
 * Convert Hz to MIDI note number, then to pitch-class string.
 *   midiNote = round(69 + 12 * log2(frequency / 440))
 *   pitchClass = CHROMATIC[midiNote % 12]
 *
 * @param {number} frequency
 * @returns {string}  e.g. "A", "C#"
 */
export function frequencyToPitchClass(frequency) { ... }
```

`CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`

If `pitchfinder` is in the dependency tree it can replace the NSDF implementation with `pitchfinder.AMDF()` or `pitchfinder.YIN()`, both exposing the same clarity/confidence signal.

#### 2.1.4 Energy Helper

```js
/**
 * Compute mean RMS over the entire buffer, normalised to [0, 1].
 * This is a standalone export so callers that already have a BPM
 * result do not need to call analyzeBPM just for energy.
 *
 * @param {AudioBuffer} buffer
 * @returns {number}  [0, 1]
 */
export function analyzeEnergy(buffer) { ... }
```

#### 2.1.5 Full exported API

```js
export async function startRecording(durationSeconds = 5)  // → AudioBuffer
export function analyzeBPM(buffer)                         // → { bpm, confidence, energy }
export function analyzePitch(buffer)                       // → { frequency, clarity }
export function analyzeEnergy(buffer)                      // → number [0,1]
export function frequencyToPitchClass(frequency)           // → string
```

### 2.2 Mapping function in `App_beta.jsx`

```js
/**
 * Translate raw voice analysis into Arranger configuration.
 *
 * Energy thresholds (Requirement 4):
 *   [0.00, 0.35) → lo-fi | acoustic,  energy ≤ 40, density ≤ 50
 *   [0.35, 0.65) → pop   | jazz,      energy 40–65, density 50–70
 *   [0.65, 1.00] → rock  | cinematic, energy ≥ 65, density ≥ 70
 *
 * Style is chosen deterministically: take the first option if the
 * chord list is empty (no additional context), otherwise let the
 * Music Theory Engine (Feature C) confirm via avgTension mapping.
 *
 * @param {{ bpm: number|null, energy: number, key: string|null }} analysis
 * @returns {{ bandStyle, arrangementPreset, aiProducerSettings, bpm }}
 */
function mapVoiceAnalysisToSettings({ bpm, energy, key }) {
  let bandStyle, arrangementPreset, energyVal, density;

  if (energy < 0.35) {
    bandStyle        = "lo-fi";
    arrangementPreset = "lofi";
    energyVal        = Math.round(energy * 100);          // maps into ≤ 40
    density          = Math.round(energy / 0.35 * 50);    // maps into ≤ 50
  } else if (energy < 0.65) {
    bandStyle        = "pop";
    arrangementPreset = "radio";
    energyVal        = Math.round(40 + (energy - 0.35) / 0.30 * 25); // 40–65
    density          = Math.round(50 + (energy - 0.35) / 0.30 * 20); // 50–70
  } else {
    bandStyle        = "rock";
    arrangementPreset = "live-band";
    energyVal        = Math.round(65 + (energy - 0.65) / 0.35 * 35); // 65–100
    density          = Math.round(70 + (energy - 0.65) / 0.35 * 30); // 70–100
  }

  return {
    bandStyle,
    arrangementPreset,
    aiProducerSettings: {
      energy:             energyVal,
      vocalIntensity:     Math.round(energyVal * 0.9),
      arrangementDensity: density,
    },
    bpm: bpm ?? 120,
    tonic: key,   // passed into buildBandFromSong so chord builder uses the right root
  };
}
```

### 2.3 UI in `App_beta.jsx` (Requirement 1, 2.4, 3, 4.5)

State variables added:
```js
const [voiceRecording, setVoiceRecording]   = useState(false);
const [voiceCountdown, setVoiceCountdown]   = useState(null);
const [voiceResult, setVoiceResult]         = useState(null); // { bpm, key, energy, style }
const [voiceError, setVoiceError]           = useState(null);
```

Button location: the import bar, left of the URL input field.

Flow:
1. User taps 🎙️ button → call `startRecording(recordDuration)`.
2. Countdown timer (3–10 s, configurable via a small slider) renders in a toast above the button.
3. On completion: run `analyzeBPM`, `analyzePitch`, `analyzeEnergy` in parallel (`Promise.all`).
4. If BPM null → show fallback UI (manual BPM input, current style selector). (Requirement 2.3)
5. If pitch clarity < 0.8 → key shown as "—".
6. Display result chip: `"🎙️ Detected: [bpm] BPM · Key: [key] · Energy: [low|medium|high] → [style]"`. (Requirement 4.5)
7. "Generate Band" button visible on the chip. Tapping it calls `buildBandFromSong` with the mapped settings. Must complete within 2 s of analysis on target device. (Requirement 1.5)

Permission error path: render inline alert with the error message and show manual BPM input + style selector. (Requirement 1.2)

---

## 3. Feature B — Camera Chord Scanner

**Requirements covered:** 5, 6

### 3.1 New file: `frontend/src/cameraScanner.js`

#### 3.1.1 Tesseract worker lifecycle

```js
// Module-level singleton — lazy-initialised on first extractChords() call.
let _worker = null;

async function getWorker() {
  if (_worker) return _worker;
  // Dynamic import so Tesseract WASM (~3 MB) is NOT in the initial bundle.
  const { createWorker } = await import('tesseract.js');
  _worker = await createWorker('eng');
  return _worker;
}
```

Worker is never terminated during the session (reuse is cheap; avoids re-downloading WASM). On page unload, `_worker.terminate()` is called via a `beforeunload` listener registered once on worker creation.

#### 3.1.2 Exported API

```js
/**
 * Open the rear camera.
 * Requests { video: { facingMode: "environment" } }.
 * Throws { code: 'PERMISSION_DENIED' | 'NOT_SUPPORTED', message } on failure.
 *
 * @returns {Promise<MediaStream>}
 */
export async function openCamera() { ... }

/**
 * Draw the current frame of a live <video> element onto a new
 * HTMLCanvasElement and return its ImageData.
 * Canvas size matches the video's intrinsic dimensions.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {ImageData}
 */
export function captureFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Run Tesseract OCR on imageData, extract chord tokens.
 *
 * Steps:
 *  1. Convert ImageData → data URL → pass to worker.recognize().
 *  2. Tesseract returns { data: { words: [{ text, confidence }] } }.
 *  3. For each word:
 *     - Strip leading/trailing punctuation.
 *     - Test against CHORD_REGEX.
 *     - confidence >= 60 → chords[].
 *     - confidence <  60 AND matches CHORD_REGEX → lowConfidence[].
 *     - No regex match → discarded.
 *  4. Collect all raw word text into rawText for the fallback pre-fill.
 *
 * @param {ImageData} imageData
 * @returns {Promise<{ chords: string[], lowConfidence: string[], rawText: string }>}
 */
export async function extractChords(imageData) { ... }

/**
 * Stop all tracks in a MediaStream returned by openCamera().
 * @param {MediaStream} stream
 */
export function stopCamera(stream) {
  stream.getTracks().forEach(t => t.stop());
}
```

**Chord validation regex (Requirement 6.2):**
```js
const CHORD_REGEX = /^[A-Ga-g][#b]?(maj|min|m|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+)*$/;
```

All validation happens in `extractChords`; nothing outside this module touches the regex.

#### 3.1.3 ImageData → data URL helper (internal)

Tesseract.js `worker.recognize()` accepts a URL, `File`, `Blob`, `HTMLImageElement`, `HTMLCanvasElement`, or `HTMLVideoElement` — but **not** an `ImageData` directly. The implementation converts via:
```js
function imageDataToCanvas(imageData) {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx    = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas;            // Tesseract accepts OffscreenCanvas
}
```

If `OffscreenCanvas` is unavailable, fall back to a regular `HTMLCanvasElement` appended off-screen.

### 3.2 UI in `App_beta.jsx` (Requirements 5, 6)

State variables:
```js
const [cameraOpen, setCameraOpen]         = useState(false);
const [cameraStream, setCameraStream]     = useState(null);
const [ocrLoading, setOcrLoading]         = useState(false);
const [ocrResult, setOcrResult]           = useState(null);
  // { chords: string[], lowConfidence: string[], rawText: string }
const [confirmedChords, setConfirmedChords] = useState(null);
const [cameraError, setCameraError]       = useState(null);
```

**Modal structure:**
```
┌─────────────────────────────────────────────┐
│  📷 Chord Scanner               [✕ Close]   │
├─────────────────────────────────────────────┤
│                                             │
│   ┌─────────────────────────────────┐       │
│   │  live <video> preview           │       │
│   │  ┌─── viewfinder overlay ────┐  │       │
│   │  │  centre crosshair         │  │       │
│   │  └───────────────────────────┘  │       │
│   └─────────────────────────────────┘       │
│                                             │
│   [📸 Capture]                              │
│                                             │
│   ── after capture ──                       │
│   ✅ Am   ✅ F   ✅ G   ⚠️ C7 (low conf)   │
│   Raw text: "Am F G C7 love song"           │
│                                             │
│   [Import 3 chords]                         │
└─────────────────────────────────────────────┘
```

Flow:
1. Tap "📷 Scan Chords" → call `openCamera()`.
   - On error: `setCameraError(e.message)`, render fallback manual entry. (Requirement 5.2)
2. Live `<video>` element is rendered via `srcObject = stream` within 1 s of permission grant. (Requirement 5.3)
3. Tap "📸 Capture":
   - Call `captureFrame(videoEl)`.
   - Show loading spinner (Requirement 5.5).
   - Await `extractChords(imageData)`.
   - Hide spinner; show checklist.
4. Checklist: full-confidence chords are checked; low-confidence ones are unchecked with a ⚠️ badge (Requirement 6.6). User can toggle any item.
5. Tap "Import N chords":
   - Collect checked chords into `confirmedChords`.
   - Call `buildBandFromSong({ chords: confirmedChords.map(name => ({ name })) }, ...)`.
   - Close modal, stop camera stream.
6. If `chords.length === 0` after OCR: show "No chords detected" and pre-fill manual input with `rawText`. (Requirement 6.5)

---

## 4. Feature C — Music Theory Engine

**Requirements covered:** 7, 8, 9, 10

### 4.1 New file: `frontend/src/musicTheory.js`

This module contains only pure functions. No imports from React, Tone.js, or any other stateful module.

#### 4.1.1 Chromatic constants

```js
const CHROMATIC    = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MAJOR_SCALE  = [0,2,4,5,7,9,11];   // intervals from tonic
const MINOR_SCALE  = [0,2,3,5,7,8,10];
const ROMAN_UPPER  = ["I","II","III","IV","V","VI","VII"];
const ROMAN_LOWER  = ["i","ii","iii","iv","v","vi","vii"];
```

#### 4.1.2 `detectKey(chords)` — Requirement 7

```js
/**
 * Detect the tonic key of a chord progression.
 *
 * @param {Array<{ name: string }>} chords
 * @returns {{ tonic: string, confidence: number, mode: "major"|"minor" }}
 */
export function detectKey(chords) {
  // 1. Extract root pitch-classes from each chord name.
  //    Use parseChordRoot() (imported from aiBandEngine, or duplicated here).
  // 2. For each of the 12 chromatic pitch-classes as candidate tonic:
  //      Build the 7-note diatonic set of that tonic's major scale.
  //      Score = (number of chord roots in the diatonic set) / chords.length.
  // 3. Track the maximum score. If tied, count root occurrences
  //    in the input — prefer the most frequently used root. (Req 7.3)
  // 4. Return { tonic, confidence: maxScore, mode: "major" }.
  //    (Minor-mode detection: re-score using MINOR_SCALE offsets. Return
  //     mode: "minor" if the minor-key score for the same tonic is ≥
  //     major score. This satisfies Req 7.4–7.5 for ii–V–I in a
  //     relative minor context.)
}
```

Covers Requirement 7.1–7.5: standard I–IV–V–I and ii–V–I progressions must resolve to the correct tonic.

#### 4.1.3 `analyzeChord(chordName, tonic)` — Requirements 8, 9

```js
/**
 * Assign Roman numeral and tension to a chord relative to a tonic.
 *
 * @param {string} chordName  e.g. "Am", "G7", "Bdim"
 * @param {string} tonic      e.g. "C"
 * @returns {{
 *   romanNumeral: string,
 *   tensionScore: number,
 *   scaleDegree:  number,   // 0–6, or -1 for chromatic
 *   quality:      "major"|"minor"|"diminished"|"augmented"|"dominant7"
 * }}
 */
export function analyzeChord(chordName, tonic) {
  // 1. Parse root pitch-class and quality suffix.
  //    Quality detection:
  //      contains "dim" or "°"  → "diminished"
  //      contains "aug" or "+"  → "augmented"
  //      contains "7" and is dominant context → "dominant7"
  //      lower-case "m" / "min" → "minor"
  //      else                    → "major"
  //
  // 2. Compute chromatic distance from tonic to chord root:
  //      tonicIdx  = CHROMATIC.indexOf(tonic)
  //      rootIdx   = CHROMATIC.indexOf(root)
  //      interval  = (rootIdx - tonicIdx + 12) % 12
  //
  // 3. Find scale degree: MAJOR_SCALE.indexOf(interval).
  //    If not found, scaleDegree = -1 → romanNumeral = "chromatic".
  //
  // 4. Map degree + quality to Roman numeral (Requirement 8.2):
  //      scaleDegree 0–6:
  //        major quality        → ROMAN_UPPER[degree]
  //        minor/dominant       → ROMAN_LOWER[degree]
  //        diminished           → ROMAN_LOWER[degree] + "°"
  //
  // 5. Tension score table (Requirement 9.1):
  //      "chromatic"           → 0.90
  //      ROMAN dim ("vii°")    → 0.90
  //      "V" or "VII"          → 0.70
  //      "ii","iii","vi"       → 0.40
  //      "I","IV","VI"         → 0.10
  //      default               → 0.40
}
```

#### 4.1.4 `resolveVoiceLeading(chordAnalyses, tonic)` — Requirement 10

```js
/**
 * Assign a melody note to each chord and enforce step-wise voice leading.
 *
 * @param {Array<{ chordName: string, romanNumeral: string,
 *                 tensionScore: number, sectionName: string }>} chordAnalyses
 * @param {string} tonic
 * @returns {Array<{
 *   index:              number,
 *   chordName:          string,
 *   resolvedMelodyNote: string,   // pitch-class, e.g. "E"
 *   romanNumeral:       string,
 *   tensionScore:       number
 * }>}
 */
export function resolveVoiceLeading(chordAnalyses, tonic) {
  // 1. For each chord, compute the initial melody note candidate:
  //      root + MAJOR_SCALE[2] semitones (the major third) maps to
  //      the most harmonically distinctive note of the chord.
  //      Convert MIDI offset to pitch-class.
  //
  // 2. For adjacent pairs (index N, N+1):
  //    a. Compute semitone distance between their MIDI note numbers
  //       (using octave 4 as baseline).
  //    b. If distance > 7 and NOT a section boundary
  //       (chordAnalyses[N].sectionName !== chordAnalyses[N+1].sectionName):
  //         Try the same pitch-class one octave up and one octave down.
  //         Pick the version that yields the smallest distance ≤ 7.
  //         If neither is ≤ 7, keep the closest available. (Req 10.2–10.3)
  //
  // 3. Return the resolved array with resolvedMelodyNote filled in.
  //    The resolvedMelodyNote is always a pitch-class string so downstream
  //    track builders can place it in any octave they choose. (Req 10.4)
}
```

#### 4.1.5 Internal helper: `parsePitchClass(chordName)`

```js
/**
 * Extract the root pitch-class from a chord name.
 * Returns a value from CHROMATIC[].
 * Converts flats to their enharmonic sharps:
 *   Bb→A#, Db→C#, Eb→D#, Gb→F#, Ab→G#.
 */
function parsePitchClass(chordName) { ... }
```

This avoids duplicating logic from `aiBandEngine.js`'s `parseChordRoot()`; the two files are kept independent (musicTheory.js must have no circular dependency on aiBandEngine.js).

### 4.2 Integration into `aiBandEngine.js` — Requirements 7.6, 8.4, 9.2–9.3, 10.4

#### 4.2.1 Import

```js
import { detectKey, analyzeChord, resolveVoiceLeading } from './musicTheory.js';
```

#### 4.2.2 Changes to `buildBandFromSong()`

```js
export function buildBandFromSong(song, style, selection, producerSettings, arrangementPreset) {
  // --- EXISTING: safeSong, songChords ---

  // NEW: key detection (Req 7.6)
  const { tonic, mode } = detectKey(songChords);

  // NEW: per-chord analysis
  const chordAnalyses = songChords.map((chord, index) => ({
    ...analyzeChord(chord.name, tonic),
    chordName:   chord.name,
    index,
    sectionName: getSectionForIndex(index, sections).name,
  }));

  // NEW: voice leading resolution (Req 10.4)
  const voiceLeadingResult = resolveVoiceLeading(chordAnalyses, tonic);
  const chordAnalysisMap   = Object.fromEntries(
    voiceLeadingResult.map(r => [r.index, r])
  );

  // NEW: style selection from average tension (replaces chooseStyle)
  const resolvedStyle = style && STYLE_PRESETS[style]
    ? style
    : chooseStyleFromTension(chordAnalyses);

  // Pass chordAnalysisMap down to makeTrack via producerSettings spread
  ...
}
```

#### 4.2.3 `chooseStyleFromTension()` — replaces `chooseStyle()`

```js
/**
 * Select a style based on mean harmonic tension. (Req 7.6)
 *
 * avgTension < 0.30 → "acoustic"  (stable, calm)
 * avgTension < 0.50 → "pop"       (gentle movement)
 * avgTension < 0.70 → "rock"      (driven)
 * avgTension ≥ 0.70 → "cinematic" (intense)
 */
function chooseStyleFromTension(chordAnalyses) { ... }
```

`chooseStyle()` is kept for backwards compatibility but is no longer called by `buildBandFromSong()`.

#### 4.2.4 Changes to `makeTrack()` — per-chord analysis

Each chord in the `chords.map()` loop receives a `chordAnalysis` object:

```js
const analysis = chordAnalysisMap[index] ?? {
  romanNumeral: "I", tensionScore: 0.1, resolvedMelodyNote: root
};
```

**Replacing `getChordMood()` (Requirement 8.4):**
```js
// OLD: const chordMood = getChordMood(chord.name);
// NEW:
const chordMood = romanNumeralToMood(analysis.romanNumeral);
// romanNumeralToMood maps:
//   I, IV, VI → "warm"
//   ii, iii   → "dreamy"
//   V, VII    → "bright"
//   vii°, chromatic → "tense"
//   default   → "neutral"
```

**Replacing `getLeadMelodyNote()` (Requirement 10.4):**
```js
// OLD: const melodyNote = getLeadMelodyNote(root, index);
// NEW:
const melodyNote = analysis.resolvedMelodyNote;
```

**Speed scaling by tension (Requirement 9.2):**
```js
// Applied to all track types when computing `speed`:
const tensionSpeedMult = 1 + 0.3 * analysis.tensionScore;
// speed = baseSpeed * tensionSpeedMult  (clamped to [0, 1])
```

**Bass held note for dominant tension (Requirement 9.3):**
```js
// In the "bass" preset branch:
const holdExtraBeats = (analysis.tensionScore >= 0.6 && section.name !== "Chorus") ? 1 : 0;
beats = Math.max(1, Math.round(bassBeatLength * densityMult)) + holdExtraBeats;
```

---

## 5. Feature D — Mood Parser and Ollama Bridge

**Requirements covered:** 11, 12

### 5.1 New file: `frontend/src/moodParser.js`

#### 5.1.1 MOOD_VOCABULARY (minimum 25 entries — Requirement 11.1)

```js
const MOOD_VOCABULARY = {
  // Ambient / calm
  "rainy":       { style:"jazz",      arrangementPreset:"lofi",      energy:30, vocalIntensity:40, arrangementDensity:40, bpm:72  },
  "chill":       { style:"lo-fi",     arrangementPreset:"lofi",      energy:25, vocalIntensity:30, arrangementDensity:35, bpm:80  },
  "peaceful":    { style:"acoustic",  arrangementPreset:"lofi",      energy:20, vocalIntensity:30, arrangementDensity:30, bpm:75  },
  "dreamy":      { style:"lo-fi",     arrangementPreset:"lofi",      energy:28, vocalIntensity:35, arrangementDensity:38, bpm:82  },
  "morning":     { style:"acoustic",  arrangementPreset:"radio",     energy:40, vocalIntensity:45, arrangementDensity:45, bpm:95  },
  "night":       { style:"jazz",      arrangementPreset:"lofi",      energy:35, vocalIntensity:40, arrangementDensity:40, bpm:78  },
  "cafe":        { style:"jazz",      arrangementPreset:"radio",     energy:42, vocalIntensity:50, arrangementDensity:48, bpm:100 },
  "nostalgic":   { style:"acoustic",  arrangementPreset:"cinematic", energy:38, vocalIntensity:55, arrangementDensity:42, bpm:88  },

  // Emotional
  "sad":         { style:"cinematic", arrangementPreset:"cinematic", energy:20, vocalIntensity:50, arrangementDensity:30, bpm:65  },
  "happy":       { style:"pop",       arrangementPreset:"radio",     energy:75, vocalIntensity:70, arrangementDensity:70, bpm:120 },
  "romantic":    { style:"jazz",      arrangementPreset:"radio",     energy:45, vocalIntensity:65, arrangementDensity:50, bpm:88  },
  "angry":       { style:"rock",      arrangementPreset:"live-band", energy:88, vocalIntensity:75, arrangementDensity:85, bpm:155 },
  "mysterious":  { style:"cinematic", arrangementPreset:"cinematic", energy:50, vocalIntensity:45, arrangementDensity:60, bpm:90  },
  "playful":     { style:"pop",       arrangementPreset:"radio",     energy:68, vocalIntensity:65, arrangementDensity:65, bpm:115 },

  // High-energy
  "epic":        { style:"cinematic", arrangementPreset:"epic",      energy:90, vocalIntensity:80, arrangementDensity:90, bpm:140 },
  "hype":        { style:"rock",      arrangementPreset:"live-band", energy:95, vocalIntensity:85, arrangementDensity:90, bpm:160 },
  "energetic":   { style:"rock",      arrangementPreset:"epic",      energy:90, vocalIntensity:80, arrangementDensity:85, bpm:145 },
  "battle":      { style:"cinematic", arrangementPreset:"epic",      energy:92, vocalIntensity:70, arrangementDensity:88, bpm:150 },
  "triumphant":  { style:"cinematic", arrangementPreset:"epic",      energy:85, vocalIntensity:75, arrangementDensity:85, bpm:135 },
  "driving":     { style:"rock",      arrangementPreset:"live-band", energy:80, vocalIntensity:70, arrangementDensity:78, bpm:138 },
  "party":       { style:"pop",       arrangementPreset:"radio",     energy:85, vocalIntensity:80, arrangementDensity:80, bpm:128 },

  // Textural / spiritual
  "dark":        { style:"cinematic", arrangementPreset:"cinematic", energy:60, vocalIntensity:40, arrangementDensity:70, bpm:100 },
  "tense":       { style:"cinematic", arrangementPreset:"cinematic", energy:70, vocalIntensity:55, arrangementDensity:75, bpm:110 },
  "worship":     { style:"cinematic", arrangementPreset:"epic",      energy:65, vocalIntensity:80, arrangementDensity:65, bpm:98  },
  "cinematic":   { style:"cinematic", arrangementPreset:"cinematic", energy:75, vocalIntensity:65, arrangementDensity:80, bpm:118 },
};
```

#### 5.1.2 `parseMood(text, currentConfig)` — Requirement 11.2–11.5

```js
/**
 * @param {string} text            User-entered mood prompt.
 * @param {object} currentConfig   Current { style, arrangementPreset, energy,
 *                                   vocalIntensity, arrangementDensity, bpm }.
 * @returns {{
 *   config:             object,
 *   interpretationText: string,
 *   confidence:         number,   // 0 = no match, 1 = full match
 *   source:             "local"
 * }}
 */
export function parseMood(text, currentConfig) {
  const t0 = performance.now();

  // 1. Tokenise: text.toLowerCase().split(/\s+/).
  // 2. Collect matched entries from MOOD_VOCABULARY.
  // 3. If no matches: return { config: currentConfig, confidence: 0,
  //      interpretationText: "Phrase not recognised. Using current settings.",
  //      source: "local" }.  (Req 11.4)
  // 4. Average numeric fields:
  //      energy = mean(matches.map(m => m.energy))
  //      vocalIntensity = mean(...)
  //      arrangementDensity = mean(...)
  //      bpm = mean(...)
  //    Round all to integers.
  // 5. Mode for categorical fields (style, arrangementPreset):
  //      tally occurrences, pick the most frequent.
  //      Tiebreak: first-matched entry wins.
  // 6. Build interpretationText:
  //      `Interpreted as: ${style}, ${arrangementPreset} preset, BPM ${bpm}, energy ${energy}`
  //      (Req 11.3)
  //
  // Requirement 11.5: total runtime < 50 ms guaranteed because
  // MOOD_VOCABULARY has ≤ 100 entries and tokenise is O(n).
  // assert performance.now() - t0 < 50  (dev-only)

  return { config, interpretationText, confidence, source: "local" };
}
```

### 5.2 New file: `frontend/src/ollamaClient.js` — Requirement 12

```js
const OLLAMA_URL    = 'http://localhost:11434/api/generate';
const VALID_STYLES  = ["pop","rock","cinematic","lo-fi","jazz","acoustic"];
const VALID_PRESETS = ["radio","live-band","epic","lofi","cinematic"];

const SYSTEM_PROMPT = `You are a music arranger. Given a mood description, return ONLY valid JSON with these exact keys:
{ "style": "pop"|"rock"|"cinematic"|"lo-fi"|"jazz"|"acoustic",
  "arrangementPreset": "radio"|"live-band"|"epic"|"lofi"|"cinematic",
  "energy": 0-100,
  "vocalIntensity": 0-100,
  "arrangementDensity": 0-100,
  "bpm": 60-200 }
No explanation, only JSON.`;

/**
 * Send a mood prompt to a locally running Ollama instance.
 *
 * @param {string} prompt
 * @param {string} model  "llama3" | "mistral"
 * @returns {Promise<object|null>}  Parsed + validated config, or null on any failure.
 */
export async function queryOllama(prompt, model = "llama3") {
  try {
    const response = await fetch(OLLAMA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model,
        prompt,
        system: SYSTEM_PROMPT,
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),   // 8 s timeout
    });

    if (!response.ok) return null;         // Req 12.3: non-200 → null

    const body = await response.json();
    const raw  = body.response ?? '';

    // Extract JSON substring even if model adds surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return validateOllamaResponse(parsed);  // null if invalid (Req 12.4)
  }
  catch {
    return null;                           // network error / timeout → null (Req 12.3)
  }
}

/**
 * Validate all six required fields are present and within range.
 * Returns the valid config object, or null if any field fails.
 */
function validateOllamaResponse(obj) {
  if (!VALID_STYLES.includes(obj.style))         return null;
  if (!VALID_PRESETS.includes(obj.arrangementPreset)) return null;
  if (typeof obj.energy           !== 'number'
    || obj.energy           < 0   || obj.energy           > 100) return null;
  if (typeof obj.vocalIntensity   !== 'number'
    || obj.vocalIntensity   < 0   || obj.vocalIntensity   > 100) return null;
  if (typeof obj.arrangementDensity !== 'number'
    || obj.arrangementDensity < 0 || obj.arrangementDensity > 100) return null;
  if (typeof obj.bpm !== 'number'
    || obj.bpm < 60 || obj.bpm > 200)                             return null;
  return obj;
}
```

### 5.3 UI in `App_beta.jsx` — Requirements 11.3, 12.5

State variables:
```js
const [moodText, setMoodText]           = useState('');
const [moodResult, setMoodResult]       = useState(null);
const [llmEnabled, setLlmEnabled]       = useState(false);
const [moodLoading, setMoodLoading]     = useState(false);
```

Flow:
1. "🎨 Vibe" text input sits below the Producer Controls panel.
2. User types and taps "🎨 Vibe" button:
   - If `llmEnabled`:
     - Call `queryOllama(moodText)`.
     - On null result: fall back to `parseMood(moodText, currentConfig)`.
     - On success: build interpretationText with `" (AI)"` suffix. (Req 12.5)
   - Else: call `parseMood(moodText, currentConfig)`.
3. Display chip: `"✨ Interpreted as: Jazz · Lo-fi · BPM 72 · Energy 30"` (and `" (AI)"` if LLM). (Req 11.3)
4. If confidence = 0: show "Phrase not recognised. Using current settings." (Req 11.4)
5. "Generate Band" uses the interpreted config object as `producerSettings`.

LLM mode toggle: a small switch in the settings panel labelled "🤖 AI (Ollama)". Enabling it shows a note: "Requires Ollama running at localhost:11434".

Backend endpoint `/mood-llm` in `backend/main.py` is an optional proxy for cases where direct `localhost:11434` is blocked by the browser's mixed-content policy in production. It is documented in section 7.3.

---

## 6. Feature E — Live Jam Pad

**Requirements covered:** 13, 14, 15

### 6.1 New file: `frontend/src/LiveJamPad.jsx`

#### 6.1.1 Constants

```js
const CIRCLE_OF_FIFTHS = ["C","G","D","A","E","B","F#","Db","Ab","Eb","Bb","F"];

// Scale degrees relative to major tonic (semitones):
//   I=0, ii=2, iii=4, IV=5, V=7, vi=9, vii°=11, V/V=14mod12=2 (but in ii context → secondary dominant)
const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_QUALITIES = ["maj","min","min","maj","maj","min","dim"];
const DEGREE_LABELS    = ["I","ii","iii","IV","V","vi","vii°"];
// V/V: semitone = (7 + 7) % 12 = 2, quality = "maj" (a major chord a fifth above V)
```

#### 6.1.2 `getPadChords(tonic)` — Requirement 13.2

```js
/**
 * Build the 8 chords for the pad grid: I ii iii IV V vi vii° V/V.
 *
 * @param {string} tonic  e.g. "C"
 * @returns {Array<{ label: string, chordName: string, degree: string, role: "tonic"|"subdominant"|"dominant"|"other" }>}
 */
function getPadChords(tonic) {
  const tonicIdx = CIRCLE_OF_FIFTHS.indexOf(tonic)
    ?? CHROMATIC.indexOf(tonic);
  const root = CHROMATIC[CHROMATIC.indexOf(tonic) ?? 0];

  const chords = DEGREE_SEMITONES.map((semitones, i) => {
    const chordRoot = CHROMATIC[(CHROMATIC.indexOf(root) + semitones) % 12];
    const chordName = chordRoot + (DEGREE_QUALITIES[i] === "maj" ? "" :
                                   DEGREE_QUALITIES[i] === "min" ? "m" : "dim");
    const role = i === 0 ? "tonic"
               : i === 3 ? "subdominant"
               : i === 4 ? "dominant"
               : "other";
    return { label: DEGREE_LABELS[i], chordName, degree: DEGREE_LABELS[i], role };
  });

  // Append V/V: major chord on the fifth of the fifth
  const vRoot  = CHROMATIC[(CHROMATIC.indexOf(root) + 7) % 12];
  const vvRoot = CHROMATIC[(CHROMATIC.indexOf(vRoot) + 7) % 12];
  chords.push({ label: "V/V", chordName: vvRoot, degree: "V/V", role: "dominant" });

  return chords; // 8 items
}
```

#### 6.1.3 Props and state

```jsx
/**
 * @param {object} props
 * @param {string}   props.tonic
 * @param {string}   props.style
 * @param {object}   props.producerSettings
 * @param {string}   props.arrangementPreset
 * @param {function} props.onRecordComplete  (track: object) => void
 * @param {function} props.onClose
 */
export default function LiveJamPad({
  tonic = "C",
  style = "pop",
  producerSettings = {},
  arrangementPreset = "radio",
  onRecordComplete,
  onClose,
}) {
  const [currentKeyIndex, setCurrentKeyIndex] = useState(
    () => Math.max(0, CIRCLE_OF_FIFTHS.indexOf(tonic))
  );
  const [isRecording, setIsRecording]     = useState(false);
  const [recordedChords, setRecordedChords] = useState([]);
    // Array<{ chordName: string, timestamp: number }>
  const [recordStartTime, setRecordStartTime] = useState(null);
  const [activeChord, setActiveChord]     = useState(null);

  const currentTonic = CIRCLE_OF_FIFTHS[currentKeyIndex];
  const padChords    = getPadChords(currentTonic);
  ...
}
```

#### 6.1.4 Chord tap handler — Requirement 14.1–14.3

```js
/**
 * Called on `pointerdown` for each chord button.
 * Target latency: ≤ 100 ms from event to audio output.
 */
function handleChordTap(chordName) {
  // 1. Stop any currently playing jam chord immediately (no gap > 20 ms).
  stopJamChord();
  // 2. Fire playJamChord — starts scheduling in Tone.now() + small lookahead.
  playJamChord(chordName, currentTonic, style, producerSettings);
  setActiveChord(chordName);
  // 3. If recording, append to recordedChords.
  if (isRecording) {
    setRecordedChords(prev => [...prev, { chordName, timestamp: Date.now() }]);
  }
}
```

Touch targets: all chord buttons have `minWidth: 64px; minHeight: 64px` via CSS (Requirement 13.1, accessibility).

#### 6.1.5 Key cycling — Requirement 13.4

```js
// Arrow buttons:
function shiftKeyLeft()  { setCurrentKeyIndex(i => (i - 1 + 12) % 12); }
function shiftKeyRight() { setCurrentKeyIndex(i => (i + 1) % 12); }

// Touch swipe (Req 13.4):
// useRef on the pad container. Track touchstart X; on touchend if delta > 40px:
//   swipe left → shiftKeyRight (move to next key clockwise)
//   swipe right → shiftKeyLeft
```

#### 6.1.6 Recording flow — Requirement 15

```js
function startRecording() {
  setRecordStartTime(Date.now());
  setRecordedChords([]);
  setIsRecording(true);
}

function stopRecording(bpm) {
  setIsRecording(false);
  // Req 15.5: no taps → show message, do not create track.
  if (recordedChords.length === 0) {
    showToast("Recording was empty — no chords captured.");
    return;
  }

  const beatMs  = 60000 / bpm;             // ms per beat at current BPM
  const stopTime = Date.now();

  const builtChords = recordedChords.map((entry, i) => {
    const nextTime  = i + 1 < recordedChords.length
      ? recordedChords[i + 1].timestamp
      : stopTime;
    const holdMs    = nextTime - entry.timestamp;
    // Round to nearest 0.5 beats, clamp to [0.5, 4] (Req 15.2)
    const rawBeats  = holdMs / beatMs;
    const beats     = Math.min(4, Math.max(0.5, Math.round(rawBeats * 2) / 2));
    return { name: entry.chordName, beats };
  });

  // Req 15.3: build track using current style's default instrument
  const track = {
    id:          Date.now() + Math.random(),
    name:        "Live Jam",
    instrument:  "acoustic_grand_piano",
    volume:      0.8,
    muted:       false,
    solo:        false,
    loop:        false,
    color:       "#A29BFE",
    chords:      builtChords,
  };

  onRecordComplete(track);  // Req 15.4: parent switches to arrangement editor
}
```

#### 6.1.7 Layout — Requirement 13

```
Fixed overlay (position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.92))

┌─────────────────────────────────────────────────────┐
│  ◀  Key of C major  ▶                    [✕ Close]  │   ← header row
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ I  C     │ │ ii Dm    │ │ iii Em   │ │ IV  F  │ │
│  │ [tonic]  │ │          │ │          │ │[subdom]│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ V  G     │ │ vi Am    │ │ vii° Bdim│ │ V/V  D │ │
│  │ [dom]    │ │          │ │          │ │ [dom]  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                     │
│  [⏺ RECORD]         [⏹ STOP RECORD]    [✕ CLOSE]   │   ← bottom bar
└─────────────────────────────────────────────────────┘
```

Colour distinction (Requirement 13.3):
- I, IV → `background: #6D4AFF` (purple, tonic/subdominant family)
- V, V/V → `background: #FF6B8A` (pink, dominant family)
- ii, iii, vi, vii° → `background: #2D3748` (dark neutral)

Active chord (pressed) → `filter: brightness(1.4)`.

### 6.2 Changes to `audio.js` — `playJamChord()`

```js
/**
 * Immediately play a single chord for live jam use.
 * Target: first audio output within 100 ms of call on Snapdragon 7+.
 *
 * Uses a dedicated gain node per-jam (trackId = "jam") to avoid
 * interfering with the arrangement tracks.
 *
 * @param {string} chordName        e.g. "Am"
 * @param {string} tonic            e.g. "C"
 * @param {string} style            e.g. "pop"
 * @param {object} producerSettings { energy, vocalIntensity, arrangementDensity }
 */
export async function playJamChord(chordName, tonic, style, producerSettings) {
  // 1. Resolve MIDI notes from chordName using musicTheory.analyzeChord
  //    + a simple MIDI note builder (root + third + fifth).
  // 2. Load sampler for trackId = "jam", instrument = STYLE_PRESETS[style].instruments.piano.
  //    The sampler must already be pre-loaded; call preloadJamSamplers() on LiveJamPad mount.
  // 3. triggerAttackRelease(midiNotes, "2n", Tone.now())
  //    "2n" = half note — sustains until next tap.
  // 4. Store the attack time so stopJamChord() can call releaseAll() precisely.
}

/**
 * Stop the currently sounding jam chord immediately.
 * Called before each new chord tap and on LiveJamPad unmount.
 */
export function stopJamChord() {
  const samplerData = trackSamplers["jam"];
  if (samplerData) samplerData.sampler.releaseAll();
}

/**
 * Pre-warm the sampler for the given style so the first tap has no latency.
 * Call this in LiveJamPad's useEffect on mount.
 *
 * @param {string} style
 */
export async function preloadJamSamplers(style) {
  const instrument = STYLE_PRESETS_INSTRUMENTS[style] ?? "acoustic_grand_piano";
  await loadInstrumentForTrack("jam", instrument);
}
```

The `STYLE_PRESETS_INSTRUMENTS` map is a simple re-export from `aiBandEngine.js` (or duplicated inline in `audio.js` to avoid circular dependency).

---

## 7. Cross-Cutting Concerns

### 7.1 Performance Budget

| Operation | Target | Mechanism |
|-----------|--------|-----------|
| BPM + Pitch analysis | ≤ 500 ms on Snapdragon 7 | All Float32Array work; no heavy allocations in hot path |
| `parseMood()` | ≤ 50 ms | Simple string split + object lookup; O(n×m) where n≤20 tokens, m≤25 vocab entries |
| `buildBandFromSong()` with theory engine | ≤ 200 ms | `detectKey` O(12 × N), `resolveVoiceLeading` O(N) |
| `playJamChord()` first audio output | ≤ 100 ms | Sampler pre-loaded; `Tone.now()` scheduling with zero lookahead |
| Tesseract OCR | 2–5 s (WASM) | Loading spinner shown; lazy-load so it doesn't affect initial paint |

### 7.2 Offline Operation (Requirement 14.4)

All core playback paths (voice analysis, music theory, mood parser local mode, live jam) run entirely in-browser with no network requests. The only optional network calls are:
- Tone.js sampler audio files (CDN, cached after first load via browser cache).
- `queryOllama()` → `localhost:11434` (LAN only, not internet).
- Backend `/mood-llm` proxy (only if LLM mode is active).

Live Jam Mode is fully offline once samplers are cached (Requirement 14.4).

### 7.3 Backend endpoint `POST /mood-llm` (Requirement 12 — optional proxy)

Added to `backend/main.py`:

```python
from fastapi import Request
from fastapi.responses import JSONResponse
import httpx

@app.post("/mood-llm")
async def mood_llm(request: Request):
    """
    Proxies a mood prompt to a locally running Ollama instance.
    Used when the browser cannot reach localhost:11434 directly
    (e.g. mixed-content or CORS restrictions in production).
    """
    body = await request.json()
    prompt = body.get("prompt", "")
    model  = body.get("model", "llama3")

    ollama_payload = {
        "model": model,
        "prompt": prompt,
        "system": OLLAMA_SYSTEM_PROMPT,  # same string as ollamaClient.js
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/generate",
                json=ollama_payload
            )
        if resp.status_code != 200:
            return JSONResponse({"error": "ollama_unavailable"}, status_code=503)
        return JSONResponse(resp.json())
    except Exception:
        return JSONResponse({"error": "ollama_unavailable"}, status_code=503)
```

The frontend `ollamaClient.js` tries `localhost:11434` directly first; only falls back to `/mood-llm` if the direct request fails (CORS/mixed-content error).

### 7.4 Dependency additions

```jsonc
// frontend/package.json additions
"tesseract.js": "^5.0.0",   // lazy-loaded; not in initial bundle
"pitchfinder":  "^2.0.3"    // optional; voiceAnalyzer.js uses it if present
```

`tesseract.js` must be dynamically imported (`import('tesseract.js')`) inside `cameraScanner.js` to keep the initial JS bundle lean. Vite will split it into a separate chunk automatically.

`pitchfinder` is a small pure-JS library. If it is already in the tree (check `node_modules`), import directly. If not, install with the exact version above.

### 7.5 Accessibility

- All chord pad buttons include `aria-label={chordName}` and `aria-pressed={activeChord === chordName}`.
- Camera modal includes `role="dialog"` and `aria-labelledby`.
- Voice recording countdown is announced via `aria-live="polite"`.
- Touch targets for all new interactive elements meet the 44×44 px minimum (Live Jam uses 64×64 per Requirement 13.1).

---

## 8. File and Package Summary

### New files

| File | Purpose |
|------|---------|
| `frontend/src/voiceAnalyzer.js` | Mic capture, BPM/pitch/energy analysis (pure Web Audio + MPM) |
| `frontend/src/cameraScanner.js` | Camera capture, Tesseract.js OCR, chord validation regex |
| `frontend/src/musicTheory.js` | `detectKey`, `analyzeChord`, `resolveVoiceLeading` — pure functions |
| `frontend/src/moodParser.js` | 25-entry MOOD_VOCABULARY, `parseMood()` local NLP |
| `frontend/src/ollamaClient.js` | `queryOllama()` + field validation, falls back to null |
| `frontend/src/LiveJamPad.jsx` | Full-screen tap-to-play chord pad + recording |

### Modified files

| File | Changes |
|------|---------|
| `frontend/src/aiBandEngine.js` | Import `musicTheory.js`; replace `chooseStyle` → `chooseStyleFromTension`; replace `getChordMood` → `romanNumeralToMood`; replace `getLeadMelodyNote` → `resolvedMelodyNote`; apply tension speed/beat multipliers in `makeTrack` |
| `frontend/src/App_beta.jsx` | Add mic button + recording flow; add camera button + modal; add mood input + vibe chip; add "🥁 Jam" button that opens `LiveJamPad`; handle `onRecordComplete` to append live-recorded track |
| `frontend/src/audio.js` | Add `playJamChord`, `stopJamChord`, `preloadJamSamplers` |
| `backend/main.py` | Add `POST /mood-llm` proxy endpoint (optional, for LLM mode) |

### npm packages

| Package | Version | Why |
|---------|---------|-----|
| `tesseract.js` | `^5.0.0` | In-browser OCR for camera chord scanner; lazy-loaded |
| `pitchfinder` | `^2.0.3` | MPM/YIN pitch detection for voice key analysis; small bundle impact |
