/**
 * voiceAnalyzer.js
 *
 * In-browser microphone capture + audio analysis.
 * No server round-trips. Works entirely via Web Audio API.
 *
 * Exports:
 *   startRecording(durationSeconds?) -> Promise<Float32Array>
 *   analyzeBPM(samples, sampleRate)  -> { bpm, confidence }
 *   analyzePitch(samples, sampleRate)-> { frequency, clarity, pitchClass }
 *   analyzeEnergy(samples)           -> number  (0-1 normalised RMS)
 *   analyzeAll(durationSeconds?)     -> Promise<VoiceAnalysisResult>
 */

// ─── Types ────────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} VoiceAnalysisResult
 * @property {number|null} bpm
 * @property {number}      bpmConfidence   0-1
 * @property {string|null} pitchClass      e.g. "A", "C#"
 * @property {number|null} frequency       Hz
 * @property {number}      pitchClarity    0-1
 * @property {number}      energy          0-1 normalised RMS
 * @property {string}      suggestedStyle
 * @property {string}      suggestedPreset
 * @property {{ energy: number, vocalIntensity: number, arrangementDensity: number }} producerSettings
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROMATIC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

/**
 * ENERGY_STYLE_MAP -- dynamic: both style options are now used.
 *
 * pitchClass (detected key) picks between the two style options:
 *   - Minor-sounding keys (A, D, E, B -> frequent minor tonic roots) -> styles[1]
 *   - Everything else -> styles[0]
 * This replaces the previous dead code where styles[1] was never used.
 *
 * vocalIntensity is computed from a sigmoid curve on energy rather than
 * a fixed linear ramp (40 + energy*40), so it responds non-linearly:
 *   low energy  -> vocalIntensity stays low (breathy, quiet)
 *   mid energy  -> vocalIntensity rises quickly
 *   high energy -> vocalIntensity saturates near 90
 */
const ENERGY_STYLE_MAP = [
  { max: 0.35, styles: ["lo-fi",   "acoustic"],  preset: "lofi",      baseEnergy: 25, baseDensity: 38 },
  { max: 0.65, styles: ["pop",     "jazz"],       preset: "radio",     baseEnergy: 52, baseDensity: 58 },
  { max: 1.00, styles: ["rock",    "cinematic"],  preset: "live-band", baseEnergy: 82, baseDensity: 78 },
];

/**
 * Pitch classes whose natural minor tonal centre makes the
 * darker style option (styles[1]) a better fit.
 * e.g. "A" -> A minor is more common than A major in pop/rock.
 */
const MINOR_LEANING_ROOTS = new Set(["A", "D", "E", "B", "F#", "G#"]);

/**
 * Compute vocal intensity dynamically from energy using a sigmoid curve.
 * Returns an integer in [20, 92].
 *   energy 0   -> ~20
 *   energy 0.5 -> ~56
 *   energy 1   -> ~92
 */
function computeVocalIntensity(energy) {
  // Sigmoid: 1 / (1 + e^(-k*(x - 0.5))) stretched to [20, 92]
  const k          = 8;
  const sigmoid    = 1 / (1 + Math.exp(-k * (energy - 0.5)));
  return Math.round(20 + sigmoid * 72);
}

/**
 * Compute arrangement density dynamically from energy + BPM.
 * Fast BPM + high energy -> denser arrangement.
 * Returns an integer in [28, 92].
 */
function computeArrangementDensity(energy, bpm) {
  const energyContrib = energy * 50;                         // 0-50
  const bpmNorm       = bpm ? Math.min(1, (bpm - 60) / 140) : 0.5; // 0-1 for 60-200 BPM
  const bpmContrib    = bpmNorm * 20;                        // 0-20
  return Math.round(28 + energyContrib + bpmContrib);        // 28-98, capped below
}

// ─── Microphone Capture ───────────────────────────────────────────────────────

/**
 * Record from the microphone for `durationSeconds` seconds.
 * Returns a Float32Array of mono PCM samples + the sample rate.
 *
 * @param {number} durationSeconds  3-10, default 5
 * @returns {Promise<{ samples: Float32Array, sampleRate: number }>}
 */
export async function startRecording(durationSeconds = 5) {
  const clampedDuration = Math.min(10, Math.max(3, durationSeconds));

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    throw new Error(`Microphone permission denied: ${err.message}`);
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source   = audioCtx.createMediaStreamSource(stream);

  // Use ScriptProcessorNode for broad browser compatibility
  const bufferSize  = 4096;
  const chunks      = [];
  const processor   = audioCtx.createScriptProcessor(bufferSize, 1, 1);

  source.connect(processor);
  processor.connect(audioCtx.destination);

  await new Promise((resolve) => {
    processor.onaudioprocess = (e) => {
      // Copy -- the buffer is reused
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    setTimeout(() => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      resolve();
    }, clampedDuration * 1000);
  });

  // Flatten chunks into a single Float32Array
  const totalLength = chunks.reduce((s, c) => s + c.length, 0);
  const samples     = new Float32Array(totalLength);
  let offset        = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return { samples, sampleRate: audioCtx.sampleRate };
}

// ─── Energy ───────────────────────────────────────────────────────────────────

/**
 * Compute normalised RMS energy of the buffer -> [0, 1].
 * @param {Float32Array} samples
 * @returns {number}
 */
export function analyzeEnergy(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  // Typical speech/humming RMS is ~0.01-0.3; clamp & normalise to [0,1]
  return Math.min(1, rms / 0.3);
}

// ─── BPM Detection (Onset Autocorrelation) ────────────────────────────────────

/**
 * Compute RMS energy in non-overlapping frames of `frameSizeSamples`.
 */
function computeOnsetEnvelope(samples, frameSizeSamples) {
  const frames = Math.floor(samples.length / frameSizeSamples);
  const envelope = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const start = i * frameSizeSamples;
    for (let j = start; j < start + frameSizeSamples; j++) {
      sum += samples[j] * samples[j];
    }
    envelope[i] = Math.sqrt(sum / frameSizeSamples);
  }
  return envelope;
}

/**
 * Autocorrelation of the onset envelope for lag range [lagMin, lagMax].
 */
function autocorrelate(signal, lagMin, lagMax) {
  const results = [];
  const n = signal.length;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += signal[i] * signal[i + lag];
    }
    results.push({ lag, value: sum / (n - lag) });
  }
  return results;
}

/**
 * analyzeBPM(samples, sampleRate) -> { bpm: number|null, confidence: number }
 *
 * Uses 10ms onset frames + autocorrelation to detect tempo.
 * Confidence is normalised peak height relative to signal energy.
 */
export function analyzeBPM(samples, sampleRate) {
  if (!samples || samples.length === 0 || !sampleRate) {
    return { bpm: null, confidence: 0 };
  }

  const frameSizeSamples = Math.round(sampleRate * 0.01); // 10ms frames
  const envelope          = computeOnsetEnvelope(samples, frameSizeSamples);
  const framesPerSecond   = sampleRate / frameSizeSamples; // frames per second

  // Convert BPM range to lag range in frames
  // bpm = 60 / (lag / framesPerSecond)  ->  lag = 60 * framesPerSecond / bpm
  const lagMin = Math.round(60 * framesPerSecond / 220); // 220 BPM
  const lagMax = Math.round(60 * framesPerSecond / 40);  // 40  BPM

  if (lagMin >= lagMax || lagMax >= envelope.length) {
    return { bpm: null, confidence: 0 };
  }

  const correlations = autocorrelate(envelope, lagMin, lagMax);

  // Find the dominant peak
  let maxVal   = -Infinity;
  let maxEntry = null;
  for (const entry of correlations) {
    if (entry.value > maxVal) {
      maxVal   = entry.value;
      maxEntry = entry;
    }
  }

  if (!maxEntry) return { bpm: null, confidence: 0 };

  const bpm = Math.round(60 * framesPerSecond / maxEntry.lag);
  const clampedBpm = Math.min(220, Math.max(40, bpm));

  // Confidence: ratio of max peak to mean of all correlation values
  const mean       = correlations.reduce((s, e) => s + e.value, 0) / correlations.length;
  const confidence = mean > 0 ? Math.min(1, maxVal / (mean * 3)) : 0;

  return { bpm: clampedBpm, confidence };
}

// ─── Pitch Detection (McLeod Pitch Method / Autocorrelation) ─────────────────

/**
 * Compute normalised square difference function (NSDF) for pitch detection.
 * This is the core of the McLeod Pitch Method.
 */
function computeNSDF(samples, lagMin, lagMax) {
  const n = samples.length;
  const results = [];

  for (let lag = lagMin; lag <= lagMax; lag++) {
    let acf = 0;
    let norm = 0;
    for (let i = 0; i < n - lag; i++) {
      acf  += samples[i] * samples[i + lag];
      norm += samples[i] * samples[i] + samples[i + lag] * samples[i + lag];
    }
    results.push({ lag, nsdf: norm > 0 ? (2 * acf) / norm : 0 });
  }
  return results;
}

/**
 * analyzePitch(samples, sampleRate) -> { frequency: number|null, clarity: number, pitchClass: string|null }
 *
 * Returns fundamental frequency in Hz and clarity (0-1).
 * pitchClass is the nearest note name (e.g. "A", "C#").
 */
export function analyzePitch(samples, sampleRate) {
  if (!samples || samples.length === 0 || !sampleRate) {
    return { frequency: null, clarity: 0, pitchClass: null };
  }

  // Pitch range: 80 Hz (E2) to 1200 Hz (roughly D6)
  const lagMin = Math.round(sampleRate / 1200);
  const lagMax = Math.round(sampleRate / 80);

  if (lagMax >= samples.length) {
    return { frequency: null, clarity: 0, pitchClass: null };
  }

  const nsdfResults = computeNSDF(samples, lagMin, lagMax);

  // NSDF clarity threshold for mic/voice input.
  // McLeod's original paper uses 0.8 for clean instrument recordings.
  // For browser mic + human voice, 0.55 is the practical threshold --
  // anything lower causes too many false positives from breath/noise.
  const CLARITY_THRESHOLD = 0.55;
  let bestLag     = null;
  let bestClarity = 0;

  for (let i = 1; i < nsdfResults.length - 1; i++) {
    const prev = nsdfResults[i - 1].nsdf;
    const curr = nsdfResults[i].nsdf;
    const next = nsdfResults[i + 1].nsdf;

    // Local maximum
    if (curr >= prev && curr >= next && curr >= CLARITY_THRESHOLD) {
      if (curr > bestClarity) {
        bestClarity = curr;
        bestLag     = nsdfResults[i].lag;
      }
    }
  }

  if (bestLag === null) {
    return { frequency: null, clarity: bestClarity, pitchClass: null };
  }

  const frequency = sampleRate / bestLag;

  // Convert frequency to MIDI note number: midi = 69 + 12 * log2(f / 440)
  const midiFloat  = 69 + 12 * Math.log2(frequency / 440);
  const midiRound  = Math.round(midiFloat);
  const pitchClass = CHROMATIC[((midiRound % 12) + 12) % 12];

  return { frequency, clarity: bestClarity, pitchClass };
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

/**
 * mapVoiceAnalysisToSettings({ energy, bpm, pitchClass })
 *
 * Dynamic style selection:
 *   - Both styles[0] and styles[1] are now used based on detected pitch class
 *   - vocalIntensity computed from sigmoid curve, not hardcoded linear ramp
 *   - arrangementDensity accounts for BPM as well as energy
 *   - detectedKey forwarded so buildBandFromSong can use it as the tonic
 */
export function mapVoiceAnalysisToSettings({ energy, bpm, pitchClass }) {
  const bucket = ENERGY_STYLE_MAP.find((b) => energy <= b.max) || ENERGY_STYLE_MAP[2];

  // Pick style based on detected pitch class (minor-leaning keys -> darker style)
  const useDarkerStyle = pitchClass && MINOR_LEANING_ROOTS.has(pitchClass);
  const bandStyle      = useDarkerStyle ? bucket.styles[1] : bucket.styles[0];

  // Energy setting: scale from bucket base linearly within bucket's energy range
  const energySetting = Math.round(bucket.baseEnergy + (energy - 0) * 15);

  return {
    bandStyle,
    arrangementPreset:  bucket.preset,
    producerSettings: {
      energy:              Math.min(98, energySetting),
      vocalIntensity:      computeVocalIntensity(energy),
      arrangementDensity:  Math.min(92, computeArrangementDensity(energy, bpm)),
    },
    bpm:         bpm ? Math.round(bpm) : null,
    detectedKey: pitchClass,   // forwarded to buildBandFromSong as tonic hint
  };
}

/**
 * analyzeAll(durationSeconds?) -> Promise<VoiceAnalysisResult>
 *
 * Records mic input, runs all analyses, returns the combined result.
 */
export async function analyzeAll(durationSeconds = 5) {
  const { samples, sampleRate } = await startRecording(durationSeconds);

  const energy               = analyzeEnergy(samples);
  const { bpm, confidence: bpmConfidence } = analyzeBPM(samples, sampleRate);
  const { frequency, clarity: pitchClarity, pitchClass } = analyzePitch(samples, sampleRate);
  const settings             = mapVoiceAnalysisToSettings({ energy, bpm, pitchClass });

  return {
    bpm,
    bpmConfidence,
    pitchClass,
    frequency,
    pitchClarity,
    energy,
    suggestedStyle:  settings.bandStyle,
    suggestedPreset: settings.arrangementPreset,
    producerSettings: settings.producerSettings,
    detectedKey:     pitchClass,
  };
}
