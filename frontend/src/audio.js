// Audio.js
//
// Instrument sound source: smplr (https://github.com/danigb/smplr), a
// dependency-free library of real recorded samples (General MIDI soundfonts,
// a sampled Steinway grand, sampled electric pianos, and sampled drum
// machines). Previously this file used a hand-assembled mix of a few local/
// CDN sample files plus Tone.js synths as fallbacks -- that's exactly what
// produced the rock_guitar-plays-silence bug (a broken placeholder asset)
// and the "drums/guitar sound synthesized, not real" complaint (the
// fallback synths were plain oscillators, not real instrument recordings).
// smplr replaces all of that with one consistently-sourced, well-tested
// library instead of us re-curating sample files per instrument.
//
// Tone.js is kept only for: unlocking the AudioContext on a user gesture
// (Tone.start()), the shared AudioContext itself (Tone.getContext()),
// MIDI-number -> note-name conversion (Tone.Frequency), and the count-in
// metronome click (a transient click, not a "real instrument" so realism
// doesn't apply there).

import * as Tone from "tone";
import { Soundfont, SplendidGrandPiano, ElectricPiano, Versilian } from "smplr";

let activeVoices = [];
let trackGains = {};   // trackId -> native GainNode
let trackSamplers = {};
let initialized = false;

// ─── Instrument definitions ───────────────────────────────────────────────────
// Real General MIDI instrument names (from gleitz/midi-js-soundfonts, served
// by smplr's Soundfont player) or a dedicated sampled-instrument class.

const INSTRUMENT_CONFIG = {
    acoustic_grand_piano: { kind: "piano" },
    electric_grand_piano: { kind: "epiano",    name: "WurlitzerEP200" },
    // A real recorded pipe organ (VCSL), not a generic GM soundfont organ
    // patch -- same quality upgrade as the drum kit. Confirmed this SFZ maps
    // across a full playable range (not a single fixed hit like a drum).
    church_organ:         { kind: "versilian", name: "Aerophones/Edge-blown Aerophones/Pipe Organ - Loud" },
    finger_bass:          { kind: "soundfont", name: "electric_bass_finger" },
    rock_guitar:          { kind: "soundfont", name: "overdriven_guitar" },
    flute:                { kind: "soundfont", name: "flute" },
    violin:               { kind: "soundfont", name: "violin" },
    // These were previously marked "planned"/disabled because the old local
    // sample folders never covered them -- a real GM soundfont covers all of
    // General MIDI, so they now work like every other instrument.
    synth_bass:           { kind: "soundfont", name: "synth_bass_1" },
    string_ensemble:      { kind: "soundfont", name: "string_ensemble_1" },
    trumpet:              { kind: "soundfont", name: "trumpet" },
};

// Real acoustic drum kit pieces from VCSL (Versilian Community Sample
// Library, CC0), not a synthesized/vintage drum-machine sample -- this is
// what actually sounds like a real kit rather than a drum machine. Each
// entry's `note` is that piece's own trigger pitch, confirmed from its SFZ
// file (most are keycentered at MIDI 60; hi-hat is 44).
// `volume` is smplr's 0-127 MIDI-style scale (100 = default/unity per its
// shared API). The raw Bass Drum recording clips above full scale at default
// volume (measured peak ~1.18 against a ceiling of 1.0), so it's turned down
// here at the source rather than relying on the per-track gain stage, which
// would just make the whole drum track quieter instead of fixing the clip.
const ACOUSTIC_DRUM_PIECES = {
    kick:  { instrument: "Membranophones/Struck Membranophones/Bass Drum 1",          note: 60, volume: 78 },
    snare: { instrument: "Membranophones/Struck Membranophones/Snare Drum, Modern 1", note: 60 },
    hihat: { instrument: "Idiophones/Struck Idiophones/Hi-Hat Cymbal",                note: 44 },
    tom1:  { instrument: "Membranophones/Struck Membranophones/Tom 1",                note: 60 },
    crash: { instrument: "Idiophones/Struck Idiophones/Clash Cymbals 1",              note: 60 },
};
const DRUM_DEFAULT_HIT = "kick";

/*
 * A drum "kit" isn't one instrument, it's several independent real acoustic
 * recordings (kick, snare, hi-hat, ...) that need to be addressable by name.
 * This builds a small object exposing the same start/stop/dispose/ready
 * shape the rest of audio.js already expects from any instrument, backed by
 * one Versilian (VCSL) instance per piece, each hitting its own fixed pitch.
 */
function createAcousticDrumKit(context, destination) {
    const voices = {};
    const ready = Promise.all(
        Object.entries(ACOUSTIC_DRUM_PIECES).map(async ([name, piece]) => {
            const voice = Versilian(context, { instrument: piece.instrument, destination, volume: piece.volume });
            await voice.ready;
            voices[name] = voice;
        })
    );

    return {
        ready,
        start({ note, time, velocity }) {
            const pieceName = ACOUSTIC_DRUM_PIECES[note] ? note : DRUM_DEFAULT_HIT;
            const voice = voices[pieceName];
            if (!voice) return;
            voice.start({ note: ACOUSTIC_DRUM_PIECES[pieceName].note, time, velocity });
        },
        stop() {
            Object.values(voices).forEach(v => v.stop());
        },
        dispose() {
            Object.values(voices).forEach(v => v.dispose());
        },
    };
}

function getAudioContext() {
    // Read Tone's context each call rather than caching it -- Tone.start()
    // (called from unlockAudio) resumes exactly this same singleton context,
    // so every smplr instrument stays on the one real-time AudioContext.
    return Tone.getContext().rawContext;
}

function createSmplrInstrument(config, context, destination) {
    switch (config.kind) {
        case "piano":
            return SplendidGrandPiano(context, { destination });
        case "epiano":
            return ElectricPiano(context, { instrument: config.name, destination });
        case "versilian":
            return Versilian(context, { instrument: config.name, destination });
        case "soundfont":
        default:
            return Soundfont(context, { instrument: config.name, destination });
    }
}

/*
 * Every instrument smplr ships (Soundfont, SplendidGrandPiano, ElectricPiano,
 * DrumMachine) implements the same start/stop/dispose/ready API, so unlike
 * the old Tone.Sampler-vs-Tone.MembraneSynth split, there is no longer a
 * "does this voice support releaseAll()" question -- .stop() always exists.
 */
function releaseAllNotes(sampler) {
    if (typeof sampler.stop === "function") {
        sampler.stop();
    }
}

/*
 * IMPORTANT:
 * Each TRACK gets its own sampled instrument instance, connected straight to
 * that track's own native GainNode (see getTrackGain) so per-track volume/
 * mute/solo keeps working exactly as before.
 */
export async function loadInstrumentForTrack(trackId, instrument) {
    const existing = trackSamplers[trackId];

    // Fast path: already loaded for this instrument
    if (existing && existing.instrument === instrument) {
        return existing.sampler;
    }

    const context = getAudioContext();
    const destination = getTrackGain(trackId, 0.8);
    const safeInstrument = instrument === "drums" || INSTRUMENT_CONFIG[instrument]
        ? instrument
        : "acoustic_grand_piano";

    let newInstrument;
    try {
        newInstrument = safeInstrument === "drums"
            ? createAcousticDrumKit(context, destination)
            : createSmplrInstrument(INSTRUMENT_CONFIG[safeInstrument], context, destination);
        await newInstrument.ready;
    } catch (error) {
        console.warn(`Failed to load instrument "${instrument}", falling back to piano:`, error);
        newInstrument = SplendidGrandPiano(context, { destination });
        await newInstrument.ready;
    }

    // Only NOW dispose the old instrument (after the new one is ready)
    if (existing) {
        try {
            existing.sampler.dispose();
        } catch (error) {
            console.warn("Could not dispose old instrument:", error);
        }
    }

    trackSamplers[trackId] = { sampler: newInstrument, instrument: safeInstrument };
    return newInstrument;
}


/**
 * preWarmSamplers(tracks)
 *
 * Load all instruments for a track list in parallel BEFORE playback starts.
 * Call this immediately after band generation so that when the user
 * presses Play, all samples are already loaded and the first beat
 * fires instantly with no load latency.
 *
 * Returns a Promise that resolves when all instruments are loaded (or failed).
 */
export async function preWarmSamplers(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;

    await Promise.all(
        tracks
            .filter(t => t.instrument && !t.muted)
            .map(t => loadInstrumentForTrack(t.id, t.instrument).catch(() => {}))
    );
}



/*
 * Unlock Web Audio.
 */
export async function unlockAudio() {

    await Tone.start();

    if (!initialized) {

        initialized = true;

    }
}


/*
 * MIDI -> note.
 */
function midiToNote(midi) {
    const value = Number(midi);
    if (!Number.isFinite(value) || value < 0 || value > 127) {
        return null;
    }

    return Tone.Frequency(
        value,
        "midi"
    ).toNote();
}


/*
 * Create/get a native GainNode for a track. Plain Web Audio (not Tone) so
 * that smplr instruments -- which take a native AudioNode as `destination`
 * at construction time -- can connect straight into it with no bridging.
 */
function getTrackGain(
    trackId,
    volume
) {

    if (!trackGains[trackId]) {

        const context = getAudioContext();
        const gainNode = context.createGain();
        gainNode.gain.value = Number(volume ?? 0.8);
        gainNode.connect(context.destination);
        trackGains[trackId] = gainNode;

    }

    return trackGains[trackId];
}


/*
 * Ramp a native GainNode's gain smoothly (replaces Tone.Gain's .rampTo()).
 */
function rampGain(gainNode, value, duration = 0.04) {
    const now = gainNode.context.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(Number(value), now + duration);
}


/*
 * Change one track's volume.
 */
export function updateTrackVolume(
    trackId,
    volume
) {

    const gain =
        trackGains[trackId];

    if (!gain) {
        return;
    }

    rampGain(gain, Number(volume), 0.05);
}


/*
 * PLAY CHORD
 *
 * Schedules note(s) via smplr's `instrument.start({ note, time, duration,
 * velocity })`, which -- like Tone's old triggerAttackRelease(note,
 * duration, time) -- schedules both the attack and its own release, so:
 *
 * 1 beat  = note lasts 1 beat
 * 2 beats = note lasts 2 beats
 * 4 beats = note lasts 4 beats
 */

export async function playChord(
    notes,
    durationBeats,
    bpm,
    volume = 0.8,
    instrument = "acoustic_grand_piano",
    trackId,
    speed = 1,
    drumHint
) {

    const isDrums = instrument === "drums";

    /*
     * Nothing to play. Drums are addressed by name ("kick", "snare", ...),
     * not by the MIDI-derived `notes` array -- upstream, a drum piece name
     * like "snare" isn't a parseable note letter, so it converts to an empty
     * `notes` array. That's expected for drums and must not short-circuit
     * the hit; only bail here for melodic instruments.
     */
    if (
        !isDrums && (
        !notes ||
        notes.length === 0)
    ) {
        return;
    }


    /*
     * Load the instrument for this track.
     */
    let instrumentVoice;
    try {
        instrumentVoice = await loadInstrumentForTrack(
            trackId,
            instrument
        );
    } catch (error) {
        console.warn("Instrument load failed:", error);
        return;
    }

    if (!instrumentVoice) {
        return;
    }


    /*
     * Get this track's gain and keep it following the
     * current track volume (it's already connected as
     * this instrument's `destination` at load time).
     */
    const gain =
        getTrackGain(
            trackId,
            volume
        );

    rampGain(gain, Number(volume), 0.02);


    const context = getAudioContext();

    /*
     * Calculate exact chord duration.
     *
     * Example:
     *
     * BPM 120
     *
     * 1 beat = 0.5 sec
     * 2 beats = 1 sec
     * 4 beats = 2 sec
     */
    const duration =
        (
            60 /
            Number(bpm)
        ) *
        Number(durationBeats);


    /*
     * Drums are real acoustic kit pieces addressed by name ("kick", "snare",
     * "hihat", ...) via drumHint (aiBandEngine.js sets chord.name to the
     * piece to hit; App_beta.jsx passes it through here as drumHint since
     * the MIDI-number pipeline can't carry a non-pitch string). Fall back to
     * a plain kick if drumHint is missing or not a real piece name.
     */
    const noteNames = isDrums
        ? [ACOUSTIC_DRUM_PIECES[drumHint] ? drumHint : DRUM_DEFAULT_HIT]
        : notes.map(midiToNote).filter(Boolean);

    if (noteNames.length === 0) {
        return;
    }


    /*
     * Clamp speed between 0 and 1.
     */
    const normalizedSpeed =
        Math.min(
            1,
            Math.max(
                0,
                Number(speed ?? 1)
            )
        );

    const VELOCITY = 100;

    try {

    /*
     * ------------------------------------------------
     * DRUMS
     * ------------------------------------------------
     *
     * Percussive one-shot -- no sustain/duration to control, and only
     * ever one hit regardless of speed (see noteNames above).
     */
    if (isDrums) {

        instrumentVoice.start({
            note: noteNames[0],
            time: context.currentTime,
            velocity: VELOCITY,
        });

    }


    /*
     * ------------------------------------------------
     * SPEED 0
     * ------------------------------------------------
     *
     * Only play the bass note.
     *
     * notes[0] is assumed to be the
     * lowest/bass note of the chord.
     */
    else if (normalizedSpeed === 0) {

        instrumentVoice.start({
            note: noteNames[0],
            time: context.currentTime,
            duration,
            velocity: VELOCITY,
        });

    }


    /*
     * ------------------------------------------------
     * SPEED 1
     * ------------------------------------------------
     *
     * Maximum speed.
     *
     * Play every note simultaneously.
     */
    else if (normalizedSpeed >= 1) {

        const startTime = context.currentTime;

        noteNames.forEach(note => {
            instrumentVoice.start({
                note,
                time: startTime,
                duration,
                velocity: VELOCITY,
            });
        });

    }


    /*
     * ------------------------------------------------
     * BETWEEN 0 AND 1
     * ------------------------------------------------
     *
     * Arpeggio.
     */
    else {

        /*
         * Convert speed to notes per beat.
         *
         * 0.25 -> 1 note / beat
         * 0.50 -> 2 notes / beat
         * 0.75 -> 3 notes / beat
         */
        const notesPerBeat =
            Math.max(
                1,
                Math.round(
                    normalizedSpeed * 4
                )
            );


        /*
         * Length of one beat in seconds.
         */
        const beatDuration =
            60 /
            Number(bpm);


        /*
         * Time between arpeggio notes.
         */
        const noteInterval =
            beatDuration /
            notesPerBeat;


        /*
         * Use one shared timestamp.
         *
         * This is important because it makes
         * all notes schedule accurately relative
         * to the same audio clock.
         */
        const startTime =
            context.currentTime;


        /*
         * Play notes one after another.
         */
        noteNames.forEach(
            (note, index) => {

                /*
                 * Calculate when this note
                 * should begin.
                 */
                const offset =
                    index *
                    noteInterval;


                /*
                 * Never start a note after
                 * the chord has finished.
                 */
                if (
                    offset >= duration
                ) {
                    return;
                }


                /*
                 * The note should sustain
                 * until the chord ends.
                 *
                 * Example:
                 *
                 * chord duration = 2 sec
                 *
                 * note 1 starts at 0 sec
                 * duration = 2 sec
                 *
                 * note 2 starts at 0.5 sec
                 * duration = 1.5 sec
                 *
                 * note 3 starts at 1 sec
                 * duration = 1 sec
                 */
                const noteDuration =
                    duration -
                    offset;


                instrumentVoice.start({
                    note,
                    time: startTime + offset,
                    duration: noteDuration,
                    velocity: VELOCITY,
                });

            }
        );

    }
    } catch (error) {
        console.warn("Unable to trigger notes:", error);
        return;
    }


    /*
     * Keep track of this instrument for emergency stopping.
     *
     * MEMORY LEAK FIX: prune entries whose instrument has been disposed
     * (trackSamplers[id] no longer references them) before pushing,
     * so the array never grows unboundedly over a long session.
     */
    const activeSamplers = new Set(
        Object.values(trackSamplers).map(s => s.sampler)
    );
    activeVoices = activeVoices.filter(v => activeSamplers.has(v.sampler));

    // Cap to 200 entries as an absolute safety net
    if (activeVoices.length > 200) {
        activeVoices = activeVoices.slice(-100);
    }

    activeVoices.push({
        trackId,
        sampler: instrumentVoice
    });

}


/*
 * Stop ONLY one track.
 *
 * This is important for independent tracks.
 */
export function stopTrackNotes(
    trackId
) {

    const trackVoices =
        activeVoices.filter(
            voice =>
                voice.trackId === trackId
        );


    trackVoices.forEach(
        voice => {

            try {

                releaseAllNotes(voice.sampler);

            }
            catch (error) {

                console.warn(
                    "Unable to stop track:",
                    error
                );

            }

        }
    );


    activeVoices =
        activeVoices.filter(
            voice =>
                voice.trackId !== trackId
        );
}


/*
 * Stop EVERYTHING.
 *
 * This is ONLY for:
 *
 * - Stop button
 * - deleting everything
 * - emergency shutdown
 *
 * DO NOT call this when a new chord starts.
 */
export function stopAllNotes() {

    Object.values(
        trackSamplers
    ).forEach(
        ({ sampler }) => {

            try {

                releaseAllNotes(sampler);

            }
            catch (error) {

                console.warn(
                    "Unable to stop sampler:",
                    error
                );

            }

        }
    );


    activeVoices = [];
}


/*
 * playJamChord — for Live Jam Mode.
 *
 * Plays a single chord immediately across a dedicated "jam" instrument.
 * Stops the previous jam chord first.
 *
 * Unlike playChord(), this doesn't need a trackId — it uses a single
 * shared "jam" gain/instrument pair so taps feel instant.
 */
const JAM_TRACK_ID = "__jam__";

export async function playJamChord(midiNotes, durationBeats = 2, bpm = 120, volume = 0.85, instrument = "acoustic_grand_piano") {
  if (!midiNotes || midiNotes.length === 0) return;

  // Stop previous jam notes immediately
  stopTrackNotes(JAM_TRACK_ID);

  const instrumentVoice = await loadInstrumentForTrack(JAM_TRACK_ID, instrument);
  const gain = getTrackGain(JAM_TRACK_ID, volume);
  rampGain(gain, Number(volume), 0.01);

  const context = getAudioContext();
  const duration = (60 / bpm) * durationBeats;
  const noteNames = midiNotes.map(midiToNote).filter(Boolean);

  // Schedule immediately for lowest latency
  const startTime = context.currentTime;
  noteNames.forEach(note => {
    instrumentVoice.start({ note, time: startTime, duration, velocity: 100 });
  });

  activeVoices.push({ trackId: JAM_TRACK_ID, sampler: instrumentVoice });
}


/*
 * Mute or unmute one track at the audio level.
 *
 * When muted  → ramp gain to 0 over 40ms so any
 *               sustaining notes fade immediately.
 * When unmuted → ramp back to the track's saved
 *               volume.
 */
export function muteTrackAudio(trackId, muted, volume = 0.8) {

    const gain = trackGains[trackId];

    if (!gain) {
        return;
    }

    rampGain(gain, muted ? 0 : Number(volume), 0.04);
}


/*
 * Solo one track at the audio level.
 *
 * Ramps all OTHER known tracks to 0 instantly,
 * and restores the soloed track's volume.
 *
 * trackVolumes is a map of { trackId → volume }
 * passed in from React state so we know what to
 * restore each track to.
 */
export function soloTrackAudio(soloedId, trackVolumes = {}) {

    Object.keys(trackGains).forEach(id => {

        // Skip the special jam track — it should not be affected by solo
        if (id === "__jam__") return;

        const numId = Number(id);
        const gain  = trackGains[id]; // use string key directly

        if (!gain) return;

        if (numId === soloedId) {
            rampGain(gain, Number(trackVolumes[numId] ?? 0.8), 0.04);
        } else {
            rampGain(gain, 0, 0.04);
        }

    });
}


/*
 * Un-solo — restore every track to its saved volume.
 *
 * Called when solo is toggled off.
 */
export function unsoloAllAudio(trackVolumes = {}) {

    Object.keys(trackGains).forEach(id => {

        // Skip the special jam track
        if (id === "__jam__") return;

        const numId = Number(id);
        const gain  = trackGains[id]; // use string key directly

        if (!gain) return;

        rampGain(gain, Number(trackVolumes[numId] ?? 0.8), 0.04);

    });
}


/*
 * Remove all audio resources
 * belonging to one deleted track.
 */
export function removeTrackAudio(
    trackId
) {

    stopTrackNotes(trackId);


    const samplerData =
        trackSamplers[trackId];


    if (samplerData) {

        try {
            samplerData.sampler.dispose();
        }
        catch (error) {
            console.warn(
                "Unable to dispose sampler:",
                error
            );
        }

        delete trackSamplers[trackId];
    }


    const gain =
        trackGains[trackId];


    if (gain) {

        try {
            gain.disconnect();
        }
        catch (error) {
            console.warn(
                "Unable to disconnect gain:",
                error
            );
        }

        delete trackGains[trackId];
    }
}

/*
 * playCountIn
 *
 * Plays a 4-beat metronome count-in to give the user time to get ready.
 * Resolves when the count-in is complete.
 *
 * This stays a plain Tone.js synth click (not a smplr instrument) since a
 * metronome tick isn't standing in for a real instrument -- it's a UI cue.
 */
export async function playCountIn(bpm) {
    if (!bpm || bpm <= 0) bpm = 120;
    const beatDuration = 60 / bpm;

    // Create a sharp, clicking synth for the metronome
    const clickSynth = new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 10,
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
    }).toDestination();

    const startTime = Tone.now() + 0.1; // Small buffer to ensure timing

    // Schedule 4 clicks
    for (let i = 0; i < 4; i++) {
        const time = startTime + (i * beatDuration);
        // First click (downbeat) is higher pitch
        const note = i === 0 ? "C6" : "G5";
        const velocity = i === 0 ? 1 : 0.7;
        clickSynth.triggerAttackRelease(note, "32n", time, velocity);
    }

    // Wait for the 4 beats to complete before resolving
    return new Promise(resolve => {
        setTimeout(() => {
            clickSynth.dispose();
            resolve();
        }, (beatDuration * 4 * 1000) + 150); // Add slight buffer
    });
}
