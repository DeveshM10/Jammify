# Requirements Document

## Introduction

This document specifies five intelligence upgrades to Jamify for the iQOO City Battles 2026 hackathon. The existing app already imports chord progressions from Ultimate Guitar, generates 7-track AI band arrangements across 6 styles and 5 arrangement presets, and persists jams to Supabase. These requirements add phone-native input modes (microphone, camera), a proper music theory engine, natural language arrangement control, and a real-time live jam pad — together covering all judged scoring axes: end product quality, novelty, creative phone use, technical depth, Office Kit bridge, and demo presentation.

## Glossary

- **Arranger**: The band generation subsystem (`aiBandEngine.js`) that produces multi-track arrangements from a chord list plus configuration.
- **Band_Generator**: The combined pipeline of input parsing, music theory analysis, and the Arranger; it produces a set of tracks ready for Tone.js playback.
- **BPM_Detector**: The in-browser audio analysis module that estimates tempo from a recorded audio buffer.
- **Camera_Scanner**: The in-browser module that captures a video frame via the MediaDevices API and runs Tesseract.js OCR to extract chord names.
- **Chord_Validator**: The pure-function module that tests whether a string matches a legal chord pattern (note letter + optional accidental + optional quality suffix).
- **Circle_of_Fifths_Scorer**: The function that scores each of the 12 candidate tonic keys by counting how many chords in a progression fit that key's diatonic set.
- **Live_Jam_Pad**: The phone-optimised real-time chord pad UI component.
- **Mood_Parser**: The module that interprets a free-text mood prompt and returns a structured arrangement configuration object.
- **Music_Theory_Engine**: The module that replaces the legacy `chooseStyle()` function; it performs key detection, Roman numeral analysis, tension scoring, and voice leading.
- **Ollama_Client**: The optional browser-to-backend HTTP adapter that sends a mood prompt to a locally running Ollama LLM endpoint.
- **Pitch_Detector**: The in-browser audio module that estimates the fundamental frequency of a hummed input using autocorrelation or the Pitchy.js library.
- **Producer_Settings**: The `{ energy, vocalIntensity, arrangementDensity }` object consumed by the Arranger.
- **Style**: One of the six named arrangement styles: `pop`, `rock`, `cinematic`, `lo-fi`, `jazz`, `acoustic`.
- **Tonic**: The root note of the detected key, expressed as a pitch-class string (e.g., `"C"`, `"F#"`).
- **Roman_Numeral**: A string label (e.g., `"I"`, `"ii"`, `"V"`, `"vii°"`) expressing a chord's scale-degree function relative to the detected tonic.
- **Tension_Score**: A numeric value in [0, 1] representing harmonic tension; 0 = fully stable, 1 = maximally tense.
- **Voice_Leading_Distance**: The absolute semitone interval between the melody note of chord N and the melody note of chord N+1.

---

## Requirements

---

### Requirement 1: Voice-to-Arrangement — Microphone Capture and Audio Routing

**User Story:** As a contestant demonstrating the app on a phone, I want to hum or speak a rhythm into the browser microphone and have the app detect my tempo and energy, so that I can generate a band arrangement hands-free without typing anything.

#### Acceptance Criteria

1. WHEN a user activates the voice input feature, THE Browser_Interface SHALL request microphone permission via the Web Audio API `getUserMedia` call with `audio: true`.
2. IF microphone permission is denied by the user or the browser, THEN THE Browser_Interface SHALL display a descriptive error message and present the manual BPM and style selector as a fallback.
3. WHEN microphone permission is granted, THE Browser_Interface SHALL record audio for a configurable duration between 3 and 10 seconds as set by the user, defaulting to 5 seconds.
4. WHEN recording ends, THE Browser_Interface SHALL pass the captured audio buffer to the BPM_Detector and to the Pitch_Detector without requiring any server round-trip.
5. WHEN audio analysis is complete, THE Band_Generator SHALL receive the detected tempo, energy level, and optional key as its input configuration and produce a full arrangement within 2 seconds of analysis completion on a Snapdragon 7-series or faster device.

---

### Requirement 2: Voice-to-Arrangement — Tempo Detection

**User Story:** As a user, I want the app to detect the BPM of my tapped or hummed rhythm, so that the generated band plays at the same tempo I had in my head.

#### Acceptance Criteria

1. WHEN an audio buffer of 3–10 seconds is provided to the BPM_Detector, THE BPM_Detector SHALL return an estimated BPM value in the range [40, 220].
2. FOR ALL rhythmic audio inputs with a true tempo between 60 BPM and 180 BPM, THE BPM_Detector SHALL return an estimated value within ±5 BPM of the true tempo.
3. IF the BPM_Detector cannot produce a confident estimate (autocorrelation peak below a defined confidence threshold), THEN THE BPM_Detector SHALL return a `null` confidence flag, and THE Browser_Interface SHALL fall back to the user's last manually set BPM value.
4. WHEN the BPM_Detector returns a valid estimate, THE Browser_Interface SHALL display the detected BPM to the user before generating the arrangement so the user may confirm or adjust it.

---

### Requirement 3: Voice-to-Arrangement — Pitch and Key Detection

**User Story:** As a musician humming a melody into my phone, I want the app to detect what key I am humming in, so that the generated arrangement is in the same key without me having to type anything.

#### Acceptance Criteria

1. WHEN an audio buffer is provided to the Pitch_Detector and the buffer contains a pitched (non-noise) signal, THE Pitch_Detector SHALL return an estimated fundamental frequency in Hz using autocorrelation or the Pitchy.js library, entirely in-browser.
2. WHEN a fundamental frequency is returned, THE Music_Theory_Engine SHALL map that frequency to the nearest MIDI note number and then to a pitch-class string (e.g., `"A"`, `"C#"`).
3. IF the Pitch_Detector determines the input is unpitched or has a clarity score below 0.8, THEN THE Pitch_Detector SHALL return `null` for the key, and THE Band_Generator SHALL select Style and Producer_Settings using only the detected tempo and energy level without a key constraint.
4. WHEN a pitch-class is detected with confidence ≥ 0.8, THE Band_Generator SHALL configure the Arranger to use that pitch-class as the root note for the generated arrangement's melody and bass lines.

---

### Requirement 4: Voice-to-Arrangement — Energy and Style Mapping

**User Story:** As a user, I want the loudness and intensity of my voice input to influence the vibe of the generated arrangement, so that a soft hum produces a calm arrangement and loud rhythmic input produces an energetic one.

#### Acceptance Criteria

1. WHEN audio analysis completes, THE BPM_Detector SHALL compute a normalised RMS energy value in the range [0.0, 1.0] from the audio buffer.
2. WHEN the energy value is in [0.0, 0.35), THE Band_Generator SHALL default Producer_Settings to `energy ≤ 40`, `arrangementDensity ≤ 50`, and SHALL prefer the styles `lo-fi` or `acoustic`.
3. WHEN the energy value is in [0.35, 0.65), THE Band_Generator SHALL default Producer_Settings to `energy` in [40, 65] and `arrangementDensity` in [50, 70], and SHALL prefer the styles `pop` or `jazz`.
4. WHEN the energy value is in [0.65, 1.0], THE Band_Generator SHALL default Producer_Settings to `energy ≥ 65`, `arrangementDensity ≥ 70`, and SHALL prefer the styles `rock` or `cinematic`.
5. WHEN voice analysis produces a complete configuration, THE Browser_Interface SHALL display a summary card showing the detected BPM, energy level, detected key (if any), and the selected style before the user triggers arrangement generation.

---

### Requirement 5: Camera Chord Scanner — Frame Capture

**User Story:** As a contestant at the hackathon, I want to point my phone camera at a chord chart written on a whiteboard or printed on paper, so that I can import the chords without typing them one by one.

#### Acceptance Criteria

1. WHEN a user activates the camera scanner feature, THE Browser_Interface SHALL request camera permission via `getUserMedia` with `video: { facingMode: "environment" }` to use the rear camera by default.
2. IF camera permission is denied, THEN THE Browser_Interface SHALL display a descriptive error and activate the manual chord text entry fallback.
3. WHEN camera permission is granted, THE Browser_Interface SHALL render a live video preview inside the page within 1 second of permission grant.
4. WHEN the user taps the capture button, THE Camera_Scanner SHALL freeze the current video frame into an `HTMLCanvasElement` and pass the canvas image data to the Chord_Validator pipeline without sending it to any remote server.
5. WHEN frame capture is complete, THE Browser_Interface SHALL display a loading indicator while OCR processing runs and SHALL hide the loading indicator when results are returned.

---

### Requirement 6: Camera Chord Scanner — OCR Extraction and Validation

**User Story:** As a user, I want the app to read chord names from the captured image and only import the ones that look like real chords, so that random words and punctuation do not corrupt the arrangement.

#### Acceptance Criteria

1. WHEN an `HTMLCanvasElement` is passed to the Camera_Scanner, THE Camera_Scanner SHALL run Tesseract.js in-browser with the `eng` language model to extract all text tokens from the image.
2. WHEN Tesseract.js returns a list of text tokens, THE Chord_Validator SHALL test each token against the pattern `/^[A-Ga-g][#b]?(maj|min|m|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+)*$/`.
3. FOR ALL tokens that do not match the Chord_Validator pattern, THE Camera_Scanner SHALL discard those tokens and SHALL NOT pass them to the Arranger.
4. WHEN the Chord_Validator produces a non-empty list of valid chord names, THE Band_Generator SHALL accept that list as the chord progression input and generate an arrangement in the same way as a URL-imported progression.
5. WHEN the Chord_Validator produces an empty list (no valid chords found), THE Camera_Scanner SHALL display a message indicating that no chords were detected and SHALL present the manual text entry fallback with any raw OCR text pre-filled for the user to correct.
6. WHEN OCR confidence for any individual token is below 60%, THE Camera_Scanner SHALL mark that token as low-confidence in the UI and SHALL NOT include it in the arrangement input without explicit user confirmation.

---

### Requirement 7: Real Music Theory Engine — Key Detection

**User Story:** As a developer, I want the band generator to detect the musical key of any imported chord progression using circle-of-fifths scoring, so that all arrangement decisions (melody notes, tension scoring, voice leading) are grounded in correct harmonic context.

#### Acceptance Criteria

1. WHEN a chord list is passed to the Music_Theory_Engine, THE Music_Theory_Engine SHALL score each of the 12 chromatic pitch-classes as a candidate tonic by counting how many chords in the list contain notes that belong to that tonic's major or natural-minor diatonic set.
2. WHEN scoring is complete, THE Music_Theory_Engine SHALL return the pitch-class with the highest score as the detected Tonic.
3. IF two or more pitch-classes share the highest score, THEN THE Music_Theory_Engine SHALL break the tie by preferring the pitch-class that appears most frequently as a chord root in the input list.
4. FOR ALL standard I–IV–V–I progressions (e.g., C–F–G–C, G–C–D–G), THE Music_Theory_Engine SHALL return the correct tonic matching a trained musician's analysis.
5. FOR ALL standard ii–V–I progressions (e.g., Dm–G–C, Am–D–G), THE Music_Theory_Engine SHALL return the correct tonic matching a trained musician's analysis.
6. WHEN the Music_Theory_Engine returns a Tonic, THE Arranger SHALL replace all usages of the legacy `chooseStyle()` string-matching logic with a call to the Music_Theory_Engine.

---

### Requirement 8: Real Music Theory Engine — Roman Numeral Analysis

**User Story:** As a developer, I want each chord in the progression to be labelled with its Roman numeral function relative to the detected key, so that the arranger can make musically intelligent decisions about tension, density, and melody note selection.

#### Acceptance Criteria

1. WHEN the Tonic is known, THE Music_Theory_Engine SHALL assign a Roman_Numeral label to each chord by comparing the chord's root to the seven scale degrees of the major scale built on the Tonic.
2. THE Music_Theory_Engine SHALL use uppercase Roman numerals (I, II, III, IV, V, VI, VII) for major-quality chords and lowercase (i, ii, iii, iv, v, vi, vii) for minor-quality chords, and SHALL append `°` for diminished chords.
3. IF a chord root does not fit any of the seven diatonic degrees of the detected key, THEN THE Music_Theory_Engine SHALL label it as `"chromatic"` rather than forcing an incorrect Roman numeral.
4. WHEN Roman_Numeral labels are assigned, THE Arranger SHALL use these labels as the primary source for chord mood and density decisions, replacing the legacy `getChordMood()` string-matching on chord name text.

---

### Requirement 9: Real Music Theory Engine — Tension Scoring

**User Story:** As a developer, I want each chord to carry a numeric tension score based on its harmonic function, so that the arranger can increase or decrease density, fill intensity, and velocity at structurally tense moments.

#### Acceptance Criteria

1. WHEN a chord is labelled with a Roman_Numeral, THE Music_Theory_Engine SHALL assign it a Tension_Score according to the following rules: I, IV, VI → 0.0–0.2 (stable); ii, iii, vi → 0.3–0.5 (mild tension); V, VII → 0.6–0.8 (dominant tension); vii°, chromatic chords → 0.85–1.0 (high tension).
2. WHEN the Arranger generates a track chord, THE Arranger SHALL scale the chord's `speed` multiplier upward by `(1 + 0.3 × Tension_Score)` relative to the base speed for that section and style.
3. WHEN the Arranger generates a bass track chord, THE Arranger SHALL increase `beats` by 1 if `Tension_Score ≥ 0.6` and the section is not Chorus, to create a held, resolving bass note effect.

---

### Requirement 10: Real Music Theory Engine — Voice Leading

**User Story:** As a developer, I want the lead and vocal melody lines to move by step between adjacent chords wherever possible, so that the generated melody sounds smooth and musical rather than jumping randomly between notes.

#### Acceptance Criteria

1. WHEN the Arranger assigns a melody note to a chord at position N, THE Music_Theory_Engine SHALL compute the Voice_Leading_Distance between the melody note for chord N and the melody note for chord N+1 using the chromatic semitone interval.
2. WHERE Voice_Leading_Distance > 7 semitones, THE Music_Theory_Engine SHALL substitute an alternative scale-degree note for chord N+1 that reduces the Voice_Leading_Distance to ≤ 7 semitones, unless the transition occurs at a section boundary (Verse→Chorus, Chorus→Bridge).
3. FOR ALL adjacent chord pairs not at a section boundary, THE Music_Theory_Engine SHALL guarantee that the Voice_Leading_Distance of the produced melody does not exceed 7 semitones.
4. THE Music_Theory_Engine SHALL expose the selected melody note per chord as a named field `resolvedMelodyNote` on the chord object so the lead and vocal tracks can consume it directly without re-computing scale membership.

---

### Requirement 11: Mood-to-Music — Local Keyword NLP

**User Story:** As a user, I want to type a phrase like "rainy evening jazz café" and have the app immediately translate it into arrangement settings without needing internet or an AI server, so that it works reliably during the hackathon demo.

#### Acceptance Criteria

1. THE Mood_Parser SHALL maintain a static vocabulary map of at least 20 distinct mood phrases (or individual mood keywords) each mapped to a valid `{ style, arrangementPreset, energy, vocalIntensity, arrangementDensity, bpm }` configuration object.
2. WHEN a user submits a free-text prompt to the Mood_Parser, THE Mood_Parser SHALL tokenise the prompt into lowercase words, match each token against the vocabulary map, and aggregate the matched configurations by averaging numeric values and choosing the most frequently matched categorical values.
3. WHEN the Mood_Parser produces a configuration object, THE Browser_Interface SHALL display an interpretation summary string in the format `"Interpreted as: [style], [arrangementPreset] preset, BPM [bpm], energy [energy]"` before the user triggers arrangement generation.
4. IF no vocabulary tokens match the input prompt, THEN THE Mood_Parser SHALL return the current user-selected configuration unchanged and SHALL display a message indicating that the phrase was not recognised.
5. THE Mood_Parser SHALL complete local keyword matching within 50 milliseconds for prompts up to 200 characters on any modern browser.

---

### Requirement 12: Mood-to-Music — Optional LLM Mode via Ollama

**User Story:** As a developer demonstrating on-device AI for the hackathon's creative phone use axis, I want to optionally route mood prompts to a locally running Ollama LLM, so that richer and more nuanced mood descriptions produce more accurate arrangement configurations.

#### Acceptance Criteria

1. WHEN the user enables LLM mode in the settings, THE Ollama_Client SHALL send the mood prompt to `http://localhost:11434/api/generate` using the model `llama3` or `mistral` with a system prompt instructing the model to return a JSON object `{ style, arrangementPreset, energy, vocalIntensity, density, bpm }`.
2. WHEN the Ollama_Client receives a response, THE Ollama_Client SHALL parse the JSON payload and validate that all six fields are present and within their allowed ranges before passing the configuration to the Arranger.
3. IF the Ollama endpoint is unreachable or returns a non-200 HTTP status, THEN THE Ollama_Client SHALL fall back to the local Mood_Parser keyword matching and SHALL display a message indicating that LLM mode is unavailable.
4. IF the LLM response JSON is malformed or fails field validation, THEN THE Ollama_Client SHALL fall back to the local Mood_Parser result for the same input prompt.
5. WHEN LLM mode is active and a valid response is received, THE Browser_Interface SHALL display the interpretation summary using data from the LLM response, annotated with `"(AI)"` to distinguish it from the local keyword result.

---

### Requirement 13: Live Jam Mode — Chord Pad UI

**User Story:** As a performer at the hackathon, I want a phone-optimised grid of large chord buttons that I can tap to play chords instantly, so that I can perform live without needing a physical instrument.

#### Acceptance Criteria

1. WHEN a user opens Live Jam Mode, THE Live_Jam_Pad SHALL render at least 8 chord buttons per screen in a grid layout with each button occupying at least 64 × 64 logical pixels to meet touch-target accessibility guidelines.
2. THE Live_Jam_Pad SHALL derive the 8 displayed chords from the detected tonic and the circle-of-fifths: I, ii, iii, IV, V, vi, vii°, and V/V (secondary dominant).
3. THE Live_Jam_Pad SHALL visually distinguish the I, IV, and V chords (tonic, subdominant, dominant) from the remaining chords using a distinct colour or weight.
4. WHEN the user swipes left or right on the pad, THE Live_Jam_Pad SHALL shift the displayed chords to the adjacent key on the circle of fifths, updating all 8 buttons accordingly.
5. THE Live_Jam_Pad SHALL display the current key name (e.g., `"Key of G major"`) prominently at the top of the pad.

---

### Requirement 14: Live Jam Mode — Real-Time Playback

**User Story:** As a performer tapping chords on my phone, I want the band to respond to each tap within 100 ms so that the performance feels tight and responsive.

#### Acceptance Criteria

1. WHEN a user taps a chord button on the Live_Jam_Pad, THE Band_Generator SHALL begin playing that chord across all active (non-muted) tracks within 100 milliseconds of the `touchstart` or `pointerdown` event on a device with a Snapdragon 7-series CPU or better.
2. WHEN a chord button is tapped, THE Arranger SHALL use the current Producer_Settings, active Style, and active Arrangement_Preset to generate the full-band voicing for that single chord before playing it.
3. WHEN a new chord tap is received while a previous chord is playing, THE Band_Generator SHALL stop the previous chord immediately and start the new chord without overlap or silence gaps exceeding 20 milliseconds.
4. WHILE Live Jam Mode is active, THE Live_Jam_Pad SHALL work fully offline with no network requests required for core playback.

---

### Requirement 15: Live Jam Mode — Recording to Timeline

**User Story:** As a user who has performed a live chord sequence on the pad, I want to capture my performance as a track in the arrangement editor, so that I can refine it with the existing editing tools.

#### Acceptance Criteria

1. WHEN the user taps the RECORD button on the Live_Jam_Pad, THE Live_Jam_Pad SHALL begin capturing every subsequent chord tap with its timestamp relative to the recording start time.
2. WHEN the user taps the STOP RECORD button, THE Live_Jam_Pad SHALL compute the beat duration of each captured chord by dividing its hold time (time until the next tap or stop) by the current BPM's beat length, rounded to the nearest 0.5 beats.
3. WHEN recording ends, THE Live_Jam_Pad SHALL create a new track in the arrangement editor pre-populated with the captured chord sequence, using the instrument and Style of the currently selected track as defaults.
4. WHEN the recorded track is created, THE Browser_Interface SHALL switch the view from the Live_Jam_Pad to the arrangement editor with the new track visible and selected.
5. IF no chord taps were captured during the recording window, THEN THE Live_Jam_Pad SHALL display a message indicating that the recording was empty and SHALL NOT create a new track.
