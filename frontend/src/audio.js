// audio.js

let audioContext = null;


function getAudioContext(){

    if(!audioContext){
        audioContext =
            new AudioContext();
    }

    return audioContext;
}


export async function unlockAudio(){

    const ctx = getAudioContext();

    if(ctx.state === "suspended"){
        await ctx.resume();
    }

}


function midiToFrequency(midi){

    return 440 *
        Math.pow(
            2,
            (midi - 69) / 12
        );
}



export function playNote(
    midi,
    duration,
    volume = 0.5
){

    const ctx = getAudioContext();


    const oscillator =
        ctx.createOscillator();


    const gain =
        ctx.createGain();


    oscillator.type = "sine";


    oscillator.frequency.value =
        midiToFrequency(midi);


    gain.gain.value =
        volume;


    oscillator.connect(gain);

    gain.connect(
        ctx.destination
    );


    oscillator.start();


    gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + duration
    );


    oscillator.stop(
        ctx.currentTime + duration
    );
}



export function playChord(
    notes,
    beats,
    bpm,
    volume
){

    const duration =
        (60 / bpm) * beats;


    notes.forEach(note=>{

        playNote(
            note,
            duration,
            volume
        );

    });

}
