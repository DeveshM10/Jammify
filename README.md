# 🎵 Jammify

A lightweight browser-based music progression and chord sequencer built with **React** and **FastAPI**.

Jammify lets you create multiple instrument tracks, arrange chord progressions, control tempo, and play musical ideas in real time. It is designed as a simple but powerful playground for experimenting with harmony, rhythm, and arrangement.

---

# ✨ Features

## 🎹 Multi-track chord sequencing

- Create unlimited tracks
- Add chord progressions independently to each track
- Mute/unmute individual tracks
- Play multiple tracks simultaneously

## 🎼 Chord configuration

Each chord can have:

- Chord name (e.g. `Cm7`, `F#`, `Bbmaj7`)
- Octave selection
- Beat duration
- Instrument selection
- Wait time between notes

## 🥁 Tempo control

Global musical timing controls:

- Adjustable BPM
- Adjustable beats per bar
- Synchronized playback timing

## 🎻 Instrument support

Supports MIDI-style instruments including:

- Piano
- Electric piano
- Guitar
- Bass
- Strings
- Brass
- Woodwinds

## ▶ Playback controls

- Play progression
- Pause playback
- Stop and reset
- Visual playhead tracking

---

# 🏗 Architecture

Jammify is split into two parts:


Jammify
│
├── frontend/
│ └── React + Material UI
│
└── backend/
└── FastAPI + Python audio engine


---

# 💻 Tech Stack

## Frontend

Built with:

- React
- Vite
- Material UI

Responsible for:

- User interface
- Track management
- Chord editing
- Tempo controls
- API communication

---

## Backend

Built with:

- FastAPI
- Python
- Threading
- Custom audio engine

Responsible for:

- Chord processing
- Note generation
- Instrument playback
- Timing and metronome control

---

# 🚀 Running Locally

## Requirements

Install:

- Node.js
- Python 3.10+
- npm
- pip

---

# Frontend Setup

Navigate to the frontend:

```bash
cd frontend

Install dependencies:

npm install

Start the development server:

npm run dev

Frontend runs at:

http://localhost:5173

Backend Setup
Navigate to the backend:

cd backend

Create a virtual environment:

python -m venv .venv

Activate it:

Linux / macOS
source .venv/bin/activate

Windows
.venv\Scripts\activate

Install dependencies:

pip install -r requirements.txt

Run FastAPI:

uvicorn main:app --reload --port 8000

Backend runs at:

http://localhost:8000

🔌 API Overview
Play chord
GET /play

Example:

/play?chord=Cm7

Play progression step
POST /play_step

Plays multiple chords together as one progression step.

Update tempo
POST /tempo

Example request:

{
  "bpm": 120,
  "beats_per_bar": 4
}

🎶 How It Works
Create a track
Add chords to the track
Configure:
chord name
octave
beats
instrument
wait time
Add more tracks if desired
Adjust BPM and beats per bar
Press play
Jammify combines all active tracks and sends playback instructions to the Python audio engine.

🛠 Roadmap
Future improvements:

 Save and load projects
 Export MIDI files
 Drag-and-drop chord arrangement
 More detailed instrument controls
 Drum tracks
 Audio recording
 User accounts
 Cloud project storage
 Automated CI/CD pipeline
🤝 Contributing
Contributions are welcome.

Steps:

Fork the repository

Create a feature branch:

git checkout -b feature/my-feature

Commit changes:
git commit -m "Add my feature"

Push your branch:
git push origin feature/my-feature

Open a Pull Request
📜 License
This project is licensed under the MIT License.

🎧 About
Jammify is a music experimentation tool designed to make composing and exploring chord progressions more interactive.

Built with ❤️ using React and Python.


One small GitHub tip: after you add this, your repository page will immediately look much better if you add a screenshot under the title:

```markdown
![Jammify Screenshot](./screenshots/main.png)

with a screenshots folder containing an image of your app.


## Soundfont Setup

Download FluidR3_GM.sf2 and place it here:

backend/soundfonts/FluidR3_GM.sf2
