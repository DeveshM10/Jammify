# main.py
# Audio playback moved to Tone.js frontend - FluidSynth not needed

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from metronome import set_tempo, BPM, BEATS_PER_BAR

from song_chord_importer import import_chords_from_url
from supabase_service import save_jam_to_supabase, load_jams_from_supabase


class TempoSettings(BaseModel):
    bpm: int
    beats_per_bar: int

class ImportChordsRequest(BaseModel):
    url: str

class SaveJamRequest(BaseModel):
    name: str
    bpm: int = 120
    beats_per_bar: int = 4
    arrangement: dict = {}
    song_id: str | None = None
    user_id: str | None = None

app = FastAPI()

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
