from mingus.core import chords

def chord_to_notes(chord_name, octave=4):
    """
    Convert chord name to note names.
    Supports inversions like C/E.
    """

    if "/" in chord_name:
        base, bass = chord_name.split("/")
        notes = chords.from_shorthand(base)

        # Put the bass note first
        if bass in notes:
            notes.remove(bass)
        notes.insert(0, bass)

    else:
        notes = chords.from_shorthand(chord_name)

    return [(note, octave) for note in notes]