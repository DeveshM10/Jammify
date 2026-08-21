import { Chord, Note } from "tonal";

export function chordToMidi(chordName, octave, inversion = 0) {
    const notes = Chord.get(chordName).notes;

    if (!notes.length) return [];

    const midi = notes.map(note =>
        Note.midi(`${note}${octave}`)
    );

    const amount = inversion % midi.length;

    for (let i = 0; i < amount; i++) {
        midi.push(midi.shift() + 12);
    }

    return midi;
}


export function noteToMidi(noteName, octave) {
    if (!noteName) return [];

    const midi = Note.midi(`${noteName}${octave}`);

    return midi === null ? [] : [midi];
}