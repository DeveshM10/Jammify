import os
import subprocess
from mido import MidiFile, MidiTrack, Message


sf2_file = "/home/red/Documents/Projects/Jammify/utils/sf2files/Stereo_Rock_Guitar_FSBS.sf2"

output = "samples"

os.makedirs(output, exist_ok=True)


notes = {
    "E2":40,
    "A2":45,
    "D3":50,
    "G3":55,
    "B3":59,
    "E4":64
}


for name, midi_note in notes.items():

    midi_path = f"{output}/{name}.mid"
    wav_path = f"{output}/{name}.wav"


    mid = MidiFile(
        ticks_per_beat=480
    )

    track = MidiTrack()
    mid.tracks.append(track)


    # note on
    track.append(
        Message(
            "note_on",
            note=midi_note,
            velocity=100,
            time=0
        )
    )


    # hold note
    track.append(
        Message(
            "note_off",
            note=midi_note,
            velocity=0,
            time=1920
        )
    )


    mid.save(midi_path)


    subprocess.run([
        "fluidsynth",
        "-ni",
        sf2_file,
        midi_path,
        "-F",
        wav_path,
        "-r",
        "44100"
    ])


    print(
        "created:",
        wav_path
    )