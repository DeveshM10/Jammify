# instrument.py

from metronome import beat_duration, musical_duration
import fluidsynth
import time


fs = fluidsynth.Synth()
fs.start(driver="pulseaudio")

sfid = fs.sfload(
    "soundfonts/FluidR3_GM.sf2"
)

def note_to_midi(note, octave):
    """Convert note name and octave to MIDI note number."""
    notes = {
        "C": 0,
        "C#": 1,
        "D": 2,
        "D#": 3,
        "E": 4,
        "F": 5,
        "F#": 6,
        "G": 7,
        "G#": 8,
        "A": 9,
        "A#": 10,
        "B": 11,
    }

    return 12 * (octave + 1) + notes[note]


def play_note(midi_note, beats, volume):
    """
    Play a MIDI note.

    Args:
        midi_note: MIDI note number (C4 = 60)
        duration: seconds
        volume: 0.0 - 1.0
    """
    channel = 0
    velocity = int(volume * 127)

    duration = musical_duration(beats)

    fs.noteon(channel, midi_note, velocity)

    time.sleep(duration)

    fs.noteoff(channel, midi_note)



instruments = {
    # Piano
    "acoustic_grand_piano": 0,
    "bright_acoustic_piano": 1,
    "electric_grand_piano": 2,
    "honky_tonk_piano": 3,
    "electric_piano_1": 4,
    "electric_piano_2": 5,
    "harpsichord": 6,
    "clavinet": 7,

    # Chromatic Percussion
    "celesta": 8,
    "glockenspiel": 9,
    "music_box": 10,
    "vibraphone": 11,
    "marimba": 12,
    "xylophone": 13,
    "tubular_bells": 14,
    "dulcimer": 15,

    # Organ
    "drawbar_organ": 16,
    "percussive_organ": 17,
    "rock_organ": 18,
    "church_organ": 19,
    "reed_organ": 20,
    "accordion": 21,
    "harmonica": 22,
    "tango_accordion": 23,

    # Guitar
    "nylon_string_guitar": 24,
    "steel_string_guitar": 25,
    "jazz_guitar": 26,
    "clean_electric_guitar": 27,
    "muted_electric_guitar": 28,
    "overdriven_guitar": 29,
    "distortion_guitar": 30,
    "guitar_harmonics": 31,

    # Bass
    "acoustic_bass": 32,
    "finger_bass": 33,
    "pick_bass": 34,
    "fretless_bass": 35,
    "slap_bass_1": 36,
    "slap_bass_2": 37,
    "synth_bass_1": 38,
    "synth_bass_2": 39,

    # Strings
    "violin": 40,
    "viola": 41,
    "cello": 42,
    "contrabass": 43,
    "tremolo_strings": 44,
    "pizzicato_strings": 45,
    "orchestral_harp": 46,
    "timpani": 47,

    # Ensemble
    "string_ensemble_1": 48,
    "string_ensemble_2": 49,
    "synth_strings_1": 50,
    "synth_strings_2": 51,
    "choir_aahs": 52,
    "voice_oohs": 53,
    "synth_voice": 54,
    "orchestra_hit": 55,

    # Brass
    "trumpet": 56,
    "trombone": 57,
    "tuba": 58,
    "muted_trumpet": 59,
    "french_horn": 60,
    "brass_section": 61,
    "synth_brass_1": 62,
    "synth_brass_2": 63,

    # Reed
    "soprano_sax": 64,
    "alto_sax": 65,
    "tenor_sax": 66,
    "baritone_sax": 67,
    "oboe": 68,
    "english_horn": 69,
    "bassoon": 70,
    "clarinet": 71,

    # Pipe
    "piccolo": 72,
    "flute": 73,
    "recorder": 74,
    "pan_flute": 75,
    "blown_bottle": 76,
    "shakuhachi": 77,
    "whistle": 78,
    "ocarina": 79,

    # Synth Lead
    "lead_square": 80,
    "lead_sawtooth": 81,
    "lead_calliope": 82,
    "lead_chiff": 83,
    "lead_charang": 84,
    "lead_voice": 85,
    "lead_fifths": 86,
    "lead_bass_lead": 87,

    # Synth Pad
    "pad_new_age": 88,
    "pad_warm": 89,
    "pad_poly_synth": 90,
    "pad_choir": 91,
    "pad_bowed": 92,
    "pad_metallic": 93,
    "pad_halo": 94,
    "pad_sweep": 95,

    # Synth Effects
    "fx_rain": 96,
    "fx_soundtrack": 97,
    "fx_crystal": 98,
    "fx_atmosphere": 99,
    "fx_brightness": 100,
    "fx_goblins": 101,
    "fx_echoes": 102,
    "fx_scifi": 103,

    # Ethnic
    "sitar": 104,
    "banjo": 105,
    "shamisen": 106,
    "koto": 107,
    "kalimba": 108,
    "bagpipe": 109,
    "fiddle": 110,
    "shanai": 111,

    # Percussive
    "tinkle_bell": 112,
    "agogo": 113,
    "steel_drums": 114,
    "woodblock": 115,
    "taiko_drum": 116,
    "melodic_tom": 117,
    "synth_drum": 118,
    "reverse_cymbal": 119,

    # Sound Effects
    "guitar_fret_noise": 120,
    "breath_noise": 121,
    "seashore": 122,
    "bird_tweet": 123,
    "telephone_ring": 124,
    "helicopter": 125,
    "applause": 126,
    "gunshot": 127,
}

def play_instrument(note, octave, beats, volume, instrument):
    """
    Select an instrument and play a note.
    """
    

    if instrument not in instruments:
        raise ValueError(f"Unknown instrument: {instrument}")

    channel = 0

    # Select General MIDI instrument
    fs.program_select(
        channel,
        sfid,
        0,
        instruments[instrument]
    )

    midi_note = note_to_midi(note, octave)

    # Delegate actual playing
    play_note(midi_note, beats, volume)