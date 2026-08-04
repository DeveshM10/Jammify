import * as Tone from "tone";

let activeVoices = [];
let instruments = {};
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


    const sampler = new Tone.Sampler({

        urls: instrumentUrls[name],

        baseUrl: baseUrls[name],

    });


    sampler.toDestination();


    await Tone.loaded();


    instruments[name] = sampler;


    return sampler;

}




export async function unlockAudio(){

    await Tone.start();


    if(!initialized){

        await loadInstrument(
            "acoustic_grand_piano"
        );

        initialized = true;
    }

}




function midiToNote(midi){

    return Tone.Frequency(
        midi,
        "midi"
    ).toNote();

}




export function updateTrackVolume(
    trackId,
    volume
){

    if(trackGains[trackId]){

        trackGains[trackId]
            .gain
            .rampTo(
                volume,
                0.05
            );

    }

}





export async function playChord(
    notes,
    beats,
    bpm,
    volume = 0.8,
    instrument = "acoustic_grand_piano",
    trackId
){

    const duration =
        (60 / bpm) * beats;



    // create track audio chain once

    if(!trackGains[trackId]){

        trackGains[trackId] =
            new Tone.Gain(volume)
            .toDestination();

    }



    if(!trackSamplers[trackId]){


        const sampler =
            await loadInstrument(
                instrument
            );


        trackSamplers[trackId] =
            new Tone.Sampler({

                urls:
                instrumentUrls[instrument],

                baseUrl:
                baseUrls[instrument]

            });


        await Tone.loaded();


        trackSamplers[trackId]
            .connect(
                trackGains[trackId]
            );

    }



    const sampler =
        trackSamplers[trackId];



    notes.forEach(note=>{


        const noteName =
            midiToNote(note);



        sampler.triggerAttack(
            noteName
        );



        activeVoices.push({

            sampler,

            note: noteName,

            trackId

        });



        setTimeout(()=>{


            sampler.triggerRelease(
                noteName
            );


            activeVoices =
                activeVoices.filter(
                    v =>
                    !(
                        v.sampler === sampler &&
                        v.note === noteName &&
                        v.trackId === trackId
                    )
                );


        }, duration * 1000);


    });

}




export function stopAllNotes(){


    activeVoices.forEach(
        voice=>{

            voice.sampler.triggerRelease(
                voice.note
            );

        }
    );


    activeVoices=[];

}