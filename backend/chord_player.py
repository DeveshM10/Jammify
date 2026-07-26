# chord_player.py

import threading
import time

from instrument import play_instrument
from chord_engine import chord_to_notes
from metronome import BEATS_PER_BAR, musical_duration


stop_event = threading.Event()

def stop_chords():
    stop_event.set()

def play_chord(chord_name, octave, beats, volume, instrument, wait):
    stop_event.clear()
    notes = chord_to_notes(chord_name, octave)

    repetitions = int(BEATS_PER_BAR / beats)


    for _ in range(repetitions):

        if stop_event.is_set():
            return
        start_time = time.time()

        threads = []

        for note, octv in notes:
            t = threading.Thread(
                target=play_instrument,
                args=(
                    note,
                    octv,
                    beats,
                    volume,
                    instrument
                )
            )

            t.start()
            threads.append(t)

            time.sleep(wait)

        for t in threads:
            t.join()

        if stop_event.is_set():
            return

        # keep exact BPM timing
        elapsed = time.time() - start_time
        remaining = musical_duration(beats) - elapsed

        if remaining > 0:
            time.sleep(remaining)