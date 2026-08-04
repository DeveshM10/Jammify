// chords.js
import { Chord, Note } from "tonal";


export function chordToMidi(
    chordName,
    octave
){

    const chord =
        Chord.get(chordName);


    return chord.notes.map(note=>{

        return Note.midi(
            `${note}${octave}`
        );

    });

}
