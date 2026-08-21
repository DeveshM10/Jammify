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
        "/rock_guitar/"
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

    if (
        !notes ||
        notes.length === 0
    ) {
        return;
    }

    const sampler =
        await loadInstrumentForTrack(
            trackId,
            instrument
        );

    const gain =
        getTrackGain(
            trackId,
            volume
        );

    /*
     * Connect sampler to track gain.
     */
    if (
        sampler.output &&
        !sampler.__connectedToTrack
    ) {

        sampler.connect(gain);

        sampler.__connectedToTrack = true;
    }

    /*
     * Update volume.
     */
    gain.gain.rampTo(
        Number(volume),
        0.02
    );


    /*
     * Clamp speed between 0 and 1.
     */
    speed = Math.max(
        0,
        Math.min(
            1,
            Number(speed) || 0
        )
    );


    /*
     * Duration of one beat.
     */
    const beatDuration =
        60 / Number(bpm);


    /*
     * Total duration of this chord.
     */
    const totalDuration =
        beatDuration *
        Number(durationBeats);


    const noteNames =
        notes.map(midiToNote);


    /*
     * SPEED 0
     *
     * Only play the bass note.
     */
    if (speed === 0) {

        sampler.triggerAttackRelease(
            noteNames[0],
            totalDuration
        );

        activeVoices.push({
            trackId,
            sampler
        });

        return;
    }


    /*
     * SPEED 1
     *
     * Play the entire chord simultaneously.
     */
    if (speed >= 1) {

        sampler.triggerAttackRelease(
            noteNames,
            totalDuration
        );

        activeVoices.push({
            trackId,
            sampler
        });

        return;
    }


    /*
     * Determine notes-per-beat.
     *
     * 0.25 -> 0.5 notes/beat
     * 0.5  -> 2 notes/beat
     * 0.75 -> 3 notes/beat
     */
    let notesPerBeat;

    if (speed < 0.5) {

        notesPerBeat =
            speed * 2;

    }
    else {

        notesPerBeat =
            speed * 4;

    }


    /*
     * Time between arpeggio notes.
     */
    const interval =
        beatDuration /
        notesPerBeat;


    /*
     * Schedule the arpeggio.
     *
     * Notes cycle through the chord:
     *
     * C E G C E G...
     */
    let noteIndex = 0;

    let elapsed = 0;

    while (
        elapsed < totalDuration
    ) {

        const note =
            noteNames[
                noteIndex %
                noteNames.length
            ];


        /*
         * How long this individual
         * note should sustain.
         *
         * It ends when the next
         * arpeggio note starts.
         */
        const noteDuration =
            Math.min(
                interval,
                totalDuration - elapsed
            );


        sampler.triggerAttackRelease(
            note,
            noteDuration,
            Tone.now() + elapsed
        );


        noteIndex++;

        elapsed += interval;
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