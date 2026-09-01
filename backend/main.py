# main.py
# Audio playback moved to Tone.js frontend - FluidSynth not needed
# from chord_player import play_chord, stop_chords

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import threading
from pydantic import BaseModel
from metronome import set_tempo, BPM, BEATS_PER_BAR


from song_chord_importer import import_chords_from_url
from supabase_service import save_jam_to_supabase, load_jams_from_supabase
from ai_arranger import build_band_plan


class TempoSettings(BaseModel):
    bpm: int
    beats_per_bar: int

class Chord(BaseModel):
    name: str
    octave: int
    beats: float
    instrument: str
    volume: float
    wait: float

class ImportChordsRequest(BaseModel):
    url: str

class SaveJamRequest(BaseModel):
    name: str
    bpm: int = 120
    beats_per_bar: int = 4
    arrangement: dict = {}
    song_id: str | None = None
    user_id: str | None = None

class BandPlanRequest(BaseModel):
    chords: list[str] = []
    style: str = "pop"

app = FastAPI()

'''
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
'''

# render online
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
def root():
    return {"message": "Jammify API is running"}


@app.get("/health")
def health():
    return {"ok": True, "service": "jammify-api"}


@app.get("/play")
def play(chord: str, mode: str = "normal"):

    if mode == "strumming":
        wait = 0.05
    else:
        wait = 0.0

    '''
    threading.Thread(
        target=play_chord,
        args=(
            chord,
            4,   # octave
            1,   # beats
            0.8, # volume,
            "acoustic_grand_piano",
            wait
        )
    ).start()
    '''
    

    return {
        "message": "playing",
        "chord": chord,
        "mode": mode
    }

@app.get("/stop")
def stop():
    # Audio playback moved to Tone.js frontend
    # stop_chords()

    return {
        "message": "stopped"
    }


@app.get("/tempo")
def get_tempo():

    return {
        "bpm": BPM,
        "beats_per_bar": BEATS_PER_BAR
    }


@app.post("/tempo")
def update_tempo(settings: TempoSettings):

    set_tempo(
        settings.bpm,
        settings.beats_per_bar
    )

    return {
        "bpm": settings.bpm,
        "beats_per_bar": settings.beats_per_bar
    }


#@app.get("/play_step")
@app.post("/play_step")
def play_step(chords: list[Chord]):

    print("RECEIVED:", chords)

    return {
        "message": "received",
        "chords": chords
    }


@app.post("/import-chords")
@app.post("/import-song")  # Alias for frontend compatibility
def import_chords(request: ImportChordsRequest):

    try:

        result = import_chords_from_url(
            request.url
        )

        return result

    except Exception as e:

        print(
            "IMPORT ERROR:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@app.post("/generate-band-plan")
@app.post("/ai-band-plan")
def generate_band_plan(request: BandPlanRequest):
    try:
        return build_band_plan(request.chords, request.style)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/save-jam")
def save_jam(request: SaveJamRequest):
    try:
        result = save_jam_to_supabase(
            name=request.name,
            bpm=request.bpm,
            beats_per_bar=request.beats_per_bar,
            arrangement=request.arrangement,
            song_id=request.song_id,
            user_id=request.user_id,
        )
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/load-jams")
def load_jams(user_id: str | None = None):
    try:
        result = load_jams_from_supabase(user_id=user_id)
        return {"success": True, "data": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


'''
def play_step(chords: list[Chord]):

    print("RECEIVED:", chords)
    threads = []

    for chord in chords:

        t = threading.Thread(
            target=play_chord,
            args=(
                chord.name,
                chord.octave,
                chord.beats,
                chord.volume,
                chord.instrument,
                chord.wait
            )
        )

        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    return {
        "message": "finished"
    }
'''