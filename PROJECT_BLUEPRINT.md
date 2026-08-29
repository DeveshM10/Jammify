# Jamify Project Blueprint

## 1. Project goal
Jamify is a browser-based music arrangement tool and AI-assisted band generator. The product lets a user import a song progression, generate a band arrangement, edit tracks, and play harmonies using local synthesised audio in the browser.

## 1A. Hackathon requirement and demo rule
Jamify must be built as a demo-first product for a live hackathon environment. The app should be easy to explain, easy to run, and visibly impressive within the first minute of the demo.

### Non-negotiable hackathon criteria
- Browser-first experience with no heavy setup friction during the demo
- One-click flow: paste a song URL, generate a band, press play
- Clear value proposition visible in the first 30 seconds
- Local AI arrangement generation should feel musical even without external APIs
- The interface should look polished enough to present on a live screen
- Demo must work reliably even when the user is not technical
- Product story must be understandable in under two minutes
- The app should be resilient if one import fails by falling back to a demo run

### Hackathon demo story
"Jamify turns any song progression into a playable AI band in seconds. Paste a chord URL, generate a band, and remix the arrangement live in-browser."

## 2. Current achieved state

### Frontend
- React + Vite app compiles successfully and runs in the browser.
- Multi-track progression UI is stable enough for arrangement editing and playback.
- Tone.js playback is live and supports restart/pause/stop without stale state.
- A reusable AI band generator is in place for song-based arrangement generation with multiple styles.
- Jam save/load controls are now visible in the editing view and wired to the backend.

### Backend
- FastAPI backend is working for song import scripts and chord extraction.
- Import routes exist for Ultimate Guitar song links.
- The backend includes save/load endpoints for Supabase persistence.
- The live backend is validated against the real Supabase project.

### Data layer
- Supabase project link for project ref `idistovgxuvvxxtwrbio` is active.
- The database schema has been pushed successfully to the remote project.
- Tables created include: `users`, `songs`, `jams`, `tracks`, and `progressions`.
- The app can authenticate to the project using the live service-role JWT set in the backend environment.

## 3. What the app does today
- Imports valid Ultimate Guitar chord pages
- Converts imported songs into a local multi-track band arrangement
- Generates band arrangements across multiple styles: `pop`, `rock`, `cinematic`, `lo-fi`, `jazz`, and `acoustic`
- Produces layered bass, piano, rhythm, lead, and pad tracks from the imported chord progression
- Allows the user to play, pause, and stop the progression reliably
- Provides fallback demo arrangements when no valid import is present
- Can persist and restore saved jams to Supabase via backend endpoints
- Shows a live saved-jam list in the editor for quick retrieval

## 4. What was fixed in this phase
- DB password and connection validated
- Supabase tables created successfully
- Generation logic extracted into a reusable AI band engine
- Missing fallback behavior added when no song is imported
- Backend save/load API hooks added for Supabase persistence
- Browser playback reset and replay edge cases hardened in the main app flow
- Save/load controls added to the UI so jams can be stored and restored from the live backend
- Multi-style arrangement generation added to the band builder
- Blueprint updated to reflect the current milestone and next planned feature push

## 5. Remaining work

### Phase A — AI arrangement depth
- Add section-aware arrangement logic for verse / chorus / bridge changes
- Make lead and bass patterns respond more strongly to chord quality and phrase length
- Add more musical fills and transitions between progression sections

### Phase B — app workflow polish
- Add richer user feedback for import and save states
- Improve visual status for jam restore and generation success
- Make the arrangement builder more expressive for rapid musical experimentation

### Phase C — account and user persistence
- Connect saved jams to a real user identity instead of a null user_id placeholder
- Add per-user organisation and jam filtering in Supabase
- Support editing existing jams and version history

### Phase D — launch readiness
- Improve production env validation and deployment checks
- Finalize live deployment URLs and health checks
- Add final UX polish and onboarding flow for first-time users

## 6. Step-by-step execution plan

### Step 1 — style-aware generation
- Validate the selected style against the imported chord quality
- Adjust note and rhythm choices by track role and song mood
- Continue improving the generated arrangement patterns

### Step 2 — session persistence
- Save imported songs and generated arrangements to Supabase
- Load saved sessions from the database
- Restore jam state cleanly into the arrangement editor

### Step 3 — deeper AI structure
- Add song-section analysis for verse / chorus / bridge detection
- Build dynamic fill patterns and transitions
- Create adaptive arrangement density per section

### Step 4 — deployment polish
- Finalize the production env setup
- Confirm live app health for import, playback, and save/load flows
- Finish UX polishing and launch checklist

## 7. Immediate next tasks
1. Add section-aware arrangement generation for verse/chorus/bridge structure
2. Connect real user identity into jam persistence and filtering
3. Improve save/load UX and validation messaging
4. Finalize production checks and deployment hardening

## 8. Core principle
The app should behave like a local AI band partner: import a song, understand the chords, generate a sensible arrangement, and let the user remix and refine it quickly.

## 9. Project values
- Keep the app browser-first and lightweight
- Prefer local generation before heavy external API calls
- Use Supabase as the persistence layer and project data store
- Make arrangement generation feel musical and responsive rather than generic
- Build in phases so the product remains stable while it grows
