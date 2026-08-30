// Audio.js

import * as Tone from "tone";

let activeVoices = [];
let trackGains = {};
let trackSamplers = {};
let initialized = false;

const instrumentUrls = {
    acoustic_grand_piano: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    },

    electric_grand_piano: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    },

    church_organ: {
        "C4": "C4.mp3",
        "F4": "F4.mp3",
        "A4": "A4.mp3",
    },

    finger_bass: {
        "E2": "E2.mp3",
        "A2": "A2.mp3",
        "D3": "D3.mp3",
        "G3": "G3.mp3",
    },

    rock_guitar: {
        "E2": "E2.wav",
        "A2": "A2.wav",
        "D3": "D3.wav",
        "G3": "G3.wav",
        "B3": "B3.wav",
        "E4": "E4.wav",
    },

    flute: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    },

    violin: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    },

    synth_bass: {
        "E2": "E2.mp3",
        "A2": "A2.mp3",
        "D3": "D3.mp3",
        "G3": "G3.mp3",
    },

    string_ensemble: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    },

    trumpet: {
        "C4": "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        "A4": "A4.mp3",
    }
};

const baseUrls = {
    acoustic_grand_piano:
        "https://tonejs.github.io/audio/salamander/",

    electric_grand_piano:
        "https://tonejs.github.io/audio/salamander/",

    church_organ:
        "https://tonejs.github.io/audio/Organ/",

    finger_bass:
        "https://tonejs.github.io/audio/bass-electric/",

    rock_guitar:
        "/rock_guitar/",

    flute:
        "https://tonejs.github.io/audio/flute/",

    violin:
        "https://tonejs.github.io/audio/violin/",

    synth_bass:
        "https://tonejs.github.io/audio/synth/",

    string_ensemble:
        "https://tonejs.github.io/audio/strings/",

    trumpet:
        "https://tonejs.github.io/audio/trumpet/"
};


/*
 * IMPORTANT:
 *
 * Each TRACK gets its own Sampler.
 *
 * This means:
 *
 * Track 1 piano
 * Track 2 piano
 *
 * are completely independent voices.
 */
async function loadInstrumentForTrack(
    trackId,
    instrument
) {

    const existing =
        trackSamplers[trackId];

    /*
     * Reuse sampler if this track is
     * already using the requested instrument.
     */
    if (
        existing &&
        existing.instrument === instrument
    ) {
        return existing.sampler;
    }


    /*
     * If this track previously had another
     * instrument, dispose its sampler.
     */
    if (existing) {

        try {
            existing.sampler.dispose();
        }
        catch (error) {
            console.warn(
                "Unable to dispose old sampler:",
                error
            );
        }
    }


    const sampler =
        new Tone.Sampler({
            urls: instrumentUrls[instrument],
            baseUrl: baseUrls[instrument],
            release: 0.1
        });


    await Tone.loaded();


    trackSamplers[trackId] = {
        sampler,
        instrument
    };


    return sampler;
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

    return Tone.Frequency(
        midi,
        "midi"
    ).toNote();
}


/*
 * Create/get a gain node for a track.
 */
function getTrackGain(
    trackId,
    volume
) {

    if (!trackGains[trackId]) {

        trackGains[trackId] =
            new Tone.Gain(volume)
                .toDestination();

    }

    return trackGains[trackId];
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

    gain.gain.rampTo(
        Number(volume),
        0.05
    );
}


/*
 * PLAY CHORD
 *
 * The important part here is:
 *
 *     triggerAttackRelease(notes, duration)
 *
 * instead of:
 *
 *     triggerAttack()
 *     setTimeout(triggerRelease)
 *
 * Tone schedules the release itself.
 *
 * So:
 *
 * 1 beat  = note lasts 1 beat
 * 2 beats = note lasts 2 beats
 * 4 beats = note lasts 4 beats
 *
 * This fixes multi-beat sustain.
 */

export async function playChord(
    notes,
    durationBeats,
    bpm,
    volume = 0.8,
    instrument = "acoustic_grand_piano",
    trackId,
    speed = 1
) {

    /*
     * Nothing to play.
     */
    if (
        !notes ||
        notes.length === 0
    ) {
        return;
    }


    /*
     * Load the sampler for this track.
     */
    const sampler =
        await loadInstrumentForTrack(
            trackId,
            instrument
        );


    /*
     * Get this track's gain.
     */
    const gain =
        getTrackGain(
            trackId,
            volume
        );


    /*
     * Connect sampler to this track's
     * gain node.
     */
    if (
        sampler.output &&
        !sampler.__connectedToTrack
    ) {

        sampler.connect(gain);

        sampler.__connectedToTrack = true;
    }


    /*
     * Make sure volume follows the
     * current track volume.
     */
    gain.gain.rampTo(
        Number(volume),
        0.02
    );


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
     * Convert MIDI numbers to Tone
     * note names.
     */
    const noteNames =
        notes.map(
            midiToNote
        );


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
    if (normalizedSpeed === 0) {

        sampler.triggerAttackRelease(
            noteNames[0],
            duration
        );

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

        sampler.triggerAttackRelease(
            noteNames,
            duration
        );

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
         * Use one shared Tone timestamp.
         *
         * This is important because it makes
         * all notes schedule accurately relative
         * to the same audio clock.
         */
        const startTime =
            Tone.now();


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


                sampler.triggerAttackRelease(
                    note,
                    noteDuration,
                    startTime + offset
                );

            }
        );

    }


    /*
     * Keep track of this sampler for emergency stopping.
     *
     * MEMORY LEAK FIX: prune entries whose sampler has been disposed
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
        sampler
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

                voice.sampler.releaseAll();

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

                sampler.releaseAll();

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
 * Plays a single chord immediately across a dedicated "jam" sampler.
 * Uses Tone.now() for minimal latency. Stops the previous jam chord first.
 *
 * Unlike playChord(), this doesn't need a trackId — it uses a single
 * shared "jam" gain/sampler pair so taps feel instant.
 */
const JAM_TRACK_ID = "__jam__";

export async function playJamChord(midiNotes, durationBeats = 2, bpm = 120, volume = 0.85, instrument = "acoustic_grand_piano") {
  if (!midiNotes || midiNotes.length === 0) return;

  // Stop previous jam notes immediately
  stopTrackNotes(JAM_TRACK_ID);

  const sampler = await loadInstrumentForTrack(JAM_TRACK_ID, instrument);
  const gain    = getTrackGain(JAM_TRACK_ID, volume);

  if (sampler.output && !sampler.__connectedToTrack) {
    sampler.connect(gain);
    sampler.__connectedToTrack = true;
  }

  gain.gain.rampTo(Number(volume), 0.01);

  const duration  = (60 / bpm) * durationBeats;
  const noteNames = midiNotes.map(midi => Tone.Frequency(midi, "midi").toNote());

  // Schedule immediately for lowest latency
  sampler.triggerAttackRelease(noteNames, duration, Tone.now());

  activeVoices.push({ trackId: JAM_TRACK_ID, sampler });
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

    if (muted) {
        gain.gain.rampTo(0, 0.04);
    } else {
        gain.gain.rampTo(Number(volume), 0.04);
    }
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
            gain.gain.rampTo(Number(trackVolumes[numId] ?? 0.8), 0.04);
        } else {
            gain.gain.rampTo(0, 0.04);
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

        gain.gain.rampTo(Number(trackVolumes[numId] ?? 0.8), 0.04);

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
            gain.dispose();
        }
        catch (error) {
            console.warn(
                "Unable to dispose gain:",
                error
            );
        }

        delete trackGains[trackId];
    }
}