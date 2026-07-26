# -----------------------------
# METRONOME SETTINGS
# -----------------------------

BPM = 120
BEATS_PER_BAR = 4

def set_tempo(bpm: int, beats_per_bar: int):
    global BPM, BEATS_PER_BAR

    BPM = bpm
    BEATS_PER_BAR = beats_per_bar

def beat_duration():
    """Seconds per beat."""
    return 60 / BPM


def musical_duration(beats):
    """
    Convert musical beats into seconds.

    Examples:
        quarter note = 1 beat
        half note    = 2 beats
        whole note   = 4 beats
    """
    return beats * beat_duration()