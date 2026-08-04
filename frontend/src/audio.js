import * as Tone from "tone";

let activeVoices = [];
let instruments = {};
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
        "https://tonejs.github.io/audio/bass-electric/"

};



async function loadInstrument(name) {

    if (instruments[name]) {
        return instruments[name];
    }


    const sampler =
        new Tone.Sampler({

            urls:
                instrumentUrls[name] ||
                instrumentUrls.acoustic_grand_piano,

            baseUrl:
                baseUrls[name] ||
                baseUrls.acoustic_grand_piano

        }).toDestination();


    await Tone.loaded();


    instruments[name] = sampler;


    return sampler;

}




export async function unlockAudio() {

    await Tone.start();


    if (!initialized) {

        await loadInstrument(
            "acoustic_grand_piano"
        );

        initialized = true;

    }

}




function midiToNote(midi) {

    return Tone.Frequency(
        midi,
        "midi"
    ).toNote();

}




export async function playNote(
    midi,
    duration,
    volume = 0.8,
    instrument = "acoustic_grand_piano"
) {

    const sampler =
        await loadInstrument(instrument);


    const gain =
        new Tone.Gain(volume).toDestination();


    sampler.connect(gain);


    const noteName =
        midiToNote(midi);


    sampler.triggerAttackRelease(
        noteName,
        duration
    );


    setTimeout(() => {
        gain.dispose();
    }, duration * 1000);

}





export async function playChord(
    notes,
    beats,
    bpm,
    volume = 0.8,
    instrument = "acoustic_grand_piano"
) {

    const duration =
        (60 / bpm) * beats;


    const sampler =
        await loadInstrument(instrument);


    const gain =
        new Tone.Gain(volume).toDestination();


    sampler.connect(gain);



    notes.forEach(note => {

        const noteName =
            midiToNote(note);


        sampler.triggerAttack(
            noteName
        );


        activeVoices.push({
            sampler,
            gain,
            note: noteName
        });



        setTimeout(() => {

            sampler.triggerRelease(
                noteName
            );


            activeVoices =
                activeVoices.filter(
                    v =>
                    !(
                        v.sampler === sampler &&
                        v.note === noteName &&
                        v.gain === gain
                    )
                );


            if (
                !activeVoices.some(
                    v => v.gain === gain
                )
            ) {
                gain.dispose();
            }


        }, duration * 1000);


    });

}




export function stopAllNotes() {

    activeVoices.forEach(
        voice => {

            voice.sampler.triggerRelease(
                voice.note
            );

            voice.gain.dispose();

        }
    );


    activeVoices = [];

}