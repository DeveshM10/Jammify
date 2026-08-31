# AGENTS.md

Jammify / Jamify — browser-based AI band + chord-progression sequencer. React (Vite) frontend, FastAPI backend, Supabase persistence. The product name is spelled both "Jammify" (README) and "Jamify" (blueprint / `VITE_APP_NAME`); treat them as the same app.

## Layout & entrypoints (read this first)
- `frontend/` — the real Vite app. **Active entrypoint is `src/App_beta.jsx`** (~3500 lines), selected in `src/main.jsx`. `App.jsx`, `App_new.jsx`, `App_prog.jsx`, and `Router.jsx` are legacy/alternate versions that are NOT mounted. Don't edit them assuming they run.
- `backend/` — FastAPI app, entrypoint `main:app` in `backend/main.py`.
- Root `package.json` is a near-empty stub. Real frontend deps live in `frontend/package.json`. Run npm from `frontend/`, not the repo root.
- `supabase/` — schema (`schema.sql`) and migrations. Tables: `users`, `songs`, `jams`, `tracks`, `progressions`.
- `utils/`, `atomic/` — one-off scripts/notebooks (`sf2towav.py`, `scripts.ipynb`), not part of the app runtime.
- `.kiro/specs/` — design/requirements specs for planned features (not code).

## Commands
Frontend (run from `frontend/`):
- `npm install`
- `npm run dev` (Vite, http://localhost:5173)
- `npm run build`
- `npm run lint` (ESLint — the only automated check in the repo)

Backend (run from `backend/`):
- `python -m venv .venv` then `.venv\Scripts\activate` (Windows) / `source .venv/bin/activate`
- `pip install -r requirements.txt`
- `uvicorn main:app --reload --port 8000` (http://localhost:8000)

There is **no test framework** configured (no pytest/vitest/jest). "Verification" = lint + manual run. Don't assume a test command exists.

## Architecture quirks (non-obvious)
- **All audio playback is client-side via Tone.js** (`frontend/src/audio.js`). The backend FluidSynth engine is disabled: `/play`, `/play_step`, `/stop` are commented-out stubs that return static JSON. Don't wire real playback through the backend.
- `pyFluidSynth` / `FluidR3_GM.sf2` remain in `requirements.txt` and the Dockerfile but are not used at runtime. `backend/soundfonts/` is gitignored.
- Frontend talks to the backend via `import.meta.env.VITE_API_URL` (default `http://localhost:8000`), used in `App_beta.jsx`.
- Real backend endpoints that matter: `POST /import-chords` (alias `/import-song`) scrapes Ultimate Guitar via `song_chord_importer.py`; `POST /save-jam`, `GET /load-jams`, `GET`/`POST /tempo`.
- AI arrangement (`src/aiBandEngine.js`) optionally calls a **local Ollama** instance at `localhost:11434` (`ollamaClient.js`) and falls back to local heuristics in `moodParser.js`. Ollama is optional — never assume it's running.
- Supabase writes use the **service-role key on the backend** (`supabase_service.py`), not the frontend anon key. Backend requires `SUPABASE_SERVICE_ROLE_KEY` or it raises.

## Environment & secrets
- `.env` files exist in `frontend/` and `backend/` and are gitignored (`.env`, `.env.*`). They currently hold **real Supabase service-role JWT and DB password** locally — never commit them or print their contents.
- Backend reads `backend/.env` (see `supabase_service.py`); frontend reads `VITE_*` vars.

## Deployment
- `vercel.json` defines two services (frontend Vite root `frontend`, backend `main:app` root `backend`) and rewrites `/api/*` → backend, everything else → frontend.
- `Dockerfile` builds the backend only (installs FluidSynth, `EXPOSE 10000`, runs uvicorn on `$PORT`) — Render/container-style deploy.
