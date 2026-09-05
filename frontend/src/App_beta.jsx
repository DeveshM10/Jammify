// App beta jsx

import { useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Slider,
  Menu,
  Tabs,
  Tab
} from "@mui/material";

import IconButton from "@mui/material/IconButton";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import RepeatIcon from "@mui/icons-material/Repeat";

{
/*
import {
    chordToMidi
} from "./chords";
*/
}

import {
    chordToMidi,
    noteToMidi
} from "./chords_inversion";


import {
    unlockAudio,
    playChord,
    stopAllNotes,
    updateTrackVolume as updateAudioTrackVolume,
    muteTrackAudio,
    soloTrackAudio,
    unsoloAllAudio,
    preWarmSamplers,
    loadInstrumentForTrack,
    playCountIn
} from "./audio";

import {
    buildBandFromSong,
    buildDemoBand,
    styleOptions,
    DEFAULT_AI_BAND_SELECTION,
    aiBandInstrumentOptions,
    arrangementPresetOptions
} from "./aiBandEngine";

import { analyzeAll, mapVoiceAnalysisToSettings } from "./voiceAnalyzer";
import { openCamera, captureFrame, extractChords as ocrExtractChords, stopCamera } from "./cameraScanner";
import { parseMood } from "./moodParser";
import { queryOllama, isOllamaAvailable } from "./ollamaClient";
import LiveJamPad from "./LiveJamPad";
import { apiJson } from "./api";


const instrumentCatalog = [
    { value: "acoustic_grand_piano", label: "Acoustic Piano", status: "working" },
    { value: "electric_grand_piano", label: "Electric Piano", status: "working" },
    { value: "church_organ", label: "Church Organ", status: "working" },
    { value: "finger_bass", label: "Finger Bass", status: "working" },
    { value: "rock_guitar", label: "Rock Guitar", status: "working" },
    { value: "flute", label: "Flute", status: "working" },
    { value: "violin", label: "Violin", status: "working" },
    // audio.js has always had full support for "drums" (a dedicated MembraneSynth)
    // and aiBandEngine.js already creates tracks with instrument:"drums" -- but it
    // was missing from this list, so no dropdown had a matching option for it.
    { value: "drums", label: "Drums", status: "working" },
    { value: "synth_bass", label: "Synth Bass", status: "planned" },
    { value: "string_ensemble", label: "String Ensemble", status: "planned" },
    { value: "trumpet", label: "Trumpet", status: "planned" }
];

const instruments = instrumentCatalog
    .filter(entry => entry.status === "working")
    .map(entry => entry.value);

const getTrackInstrumentForIndex = (index) =>
    instruments[index % instruments.length];



function SortableChord({
    chord,
    index,
    track,
    activeChords,
    colors,
    onEdit,
    onDuplicate,
    onDelete
}) {

    const [chordMenuAnchor, setChordMenuAnchor] = useState(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition
    } = useSortable({
        id: `${track.id}-${index}`,
        data: {
            index
        }
    });


    const active = activeChords.includes(
        `${track.id}-${index}`
    );

    const activeColor =
    chord.type === "note"
        ? "#FF6B8A"
        : colors.primary;

    const style = {

        transform: CSS.Transform.toString(transform),

        width:70,
        height:70,

        background: active
            ? activeColor
            : colors.card,

        border:`2px solid ${
            active
                ? activeColor
                : colors.border
        }`,

        color: active
            ? "white"
            : colors.text,

        borderRadius:12,

        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"center",

        position:"relative",

        boxShadow: active
            ? chord.type === "note"
            ? "0 0 18px rgba(255,59,48,0.7)"
            : "0 0 18px rgba(109,74,255,0.7)"
        : "0 2px 8px rgba(0,0,0,0.05)",

        transition:"all 0.15s ease",

        cursor:"grab",
        userSelect:"none",
        touchAction:"pan-y"
    };


    return (

        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >

        <IconButton
            size="small"

            onPointerDown={(e) => {
                e.stopPropagation();
            }}

            onClick={(e) => {
                e.stopPropagation();
                setChordMenuAnchor(e.currentTarget);
            }}

            sx={{
                position:"absolute",
                top:2,
                right:2,
                width:26,
                height:26,
                color:active
                    ? "white"
                    : colors.text,
                opacity:0.7,

                "&:hover":{
                    opacity:1,
                    backgroundColor:colors.primaryLight
                }
            }}
        >
            <MoreVertIcon fontSize="small"/>
        </IconButton>

        <Menu
            anchorEl={chordMenuAnchor}
            open={Boolean(chordMenuAnchor)}
            onClose={() => setChordMenuAnchor(null)}
        >
            <MenuItem
                onClick={(e) => {
                    e.stopPropagation();

                    setChordMenuAnchor(null);

                    onEdit(index);
                }}
            >
                Edit
            </MenuItem>

            <MenuItem
                onClick={(e) => {
                    e.stopPropagation();

                    setChordMenuAnchor(null);

                    onDuplicate(index);
                }}
            >
                Duplicate
            </MenuItem>

            <MenuItem
                onClick={(e) => {
                    e.stopPropagation();

                    setChordMenuAnchor(null);

                    onDelete(index);
                }}
            >
                Delete
            </MenuItem>
        </Menu>



            <div
                style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: active ? "white" : colors.text
                }}
            >
                {chord.name}
            </div>

            <div
                style={{
                    fontSize: 10,
                    opacity: 0.65
                }}
            >
                {chord.type === "note" ? "NOTE" : "CHORD"}
            </div>

            {/* Fill indicators */}
            {chord.isFill && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 5,
                        left: 0,
                        right: 0,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 3,
                    }}
                >
                    {chord.fillType === "major-fill" && (
                        <span
                            style={{
                                fontSize: 8,
                                fontWeight: 900,
                                letterSpacing: 0.5,
                                color: active ? "rgba(255,255,255,0.9)" : "#FF6B8A",
                                textTransform: "uppercase",
                                lineHeight: 1,
                            }}
                        >
                            FILL
                        </span>
                    )}
                    {chord.fillType === "drum-roll" && (
                        <span
                            style={{
                                fontSize: 8,
                                fontWeight: 900,
                                letterSpacing: 0.5,
                                color: active ? "rgba(255,255,255,0.9)" : "#E17055",
                                textTransform: "uppercase",
                                lineHeight: 1,
                            }}
                        >
                            ROLL
                        </span>
                    )}
                    {chord.fillType === "bass-drop" && (
                        <span
                            style={{
                                fontSize: 8,
                                fontWeight: 900,
                                letterSpacing: 0.5,
                                color: active ? "rgba(255,255,255,0.9)" : "#0984E3",
                                textTransform: "uppercase",
                                lineHeight: 1,
                            }}
                        >
                            DROP
                        </span>
                    )}
                    {chord.fillType === "piano-run" && (
                        <span
                            style={{
                                fontSize: 8,
                                fontWeight: 900,
                                letterSpacing: 0.5,
                                color: active ? "rgba(255,255,255,0.9)" : "#6D4AFF",
                                textTransform: "uppercase",
                                lineHeight: 1,
                            }}
                        >
                            RUN
                        </span>
                    )}
                    {(chord.fillType === "build-up" || (!chord.fillType && chord.isFill)) && (
                        /* Animated dot for build-up and generic fills */
                        <span
                            style={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                background: active ? "rgba(255,255,255,0.85)" : "#A29BFE",
                                display: "inline-block",
                                animation: "fillPulse 0.7s ease-in-out infinite alternate",
                            }}
                        />
                    )}
                </div>
            )}

        </div>

    );

}


function App() {
    
    const colors = {
    background: "#F5F0FF",
    primary: "#7C3AED",
    primaryDark: "#5B21B6",
    primaryLight: "#EDE4FF",
    accent: "#FF4F93",
    accentLight: "#FFE1ED",
    success: "#16C79A",
    card: "#FFFFFF",
    surface: "#FAF7FF",
    border: "#E2D4FF",
    text: "#241748",
    textSoft: "rgba(36,23,72,0.62)",
    danger: "#FF5C7C",
    fontDisplay: "'Sora', 'Segoe UI', system-ui, sans-serif",
    fontBody: "'Inter', 'Segoe UI', system-ui, sans-serif",
  };

  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640;

  const trackColors = [
    "#6D4AFF",
    "#FF6B8A",
    "#00B894",
    "#0984E3",
    "#FDCB6E",
    "#E17055",
    "#A29BFE"
    ];

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8
        }
    }),

    useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250,
            tolerance: 8
        }
    })
  );

  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [trackMenuAnchor, setTrackMenuAnchor] = useState(null);
  const [menuTrackId, setMenuTrackId] = useState(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTrackName, setRenameTrackName] = useState("");

  const [tempoDialogOpen, setTempoDialogOpen] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [bandStyle, setBandStyle] = useState("pop");
  // True once the user explicitly picks a style from the dropdown. Until
  // then, a fresh import should let the theory engine auto-detect a style
  // from the song's actual harmonic content instead of forcing "pop".
  const styleManuallySetRef = useRef(false);
  const [arrangementPreset, setArrangementPreset] = useState("radio");
  const [aiBandSelection, setAiBandSelection] = useState(DEFAULT_AI_BAND_SELECTION);
  // Once the user manually toggles an instrument on/off, style changes must stop
  // silently overwriting that choice with the style's default recommendation.
  const bandSelectionCustomizedRef = useRef(false);
  const [userInstrument, setUserInstrument] = useState("nothing"); // Track what the user plays
  const [countingIn, setCountingIn] = useState(false);
  const [aiProducerSettings, setAiProducerSettings] = useState({
    energy: 74,
    vocalIntensity: 68,
    arrangementDensity: 72,
  });

  // ── Voice Analyzer state ────────────────────────────────────────────────
  const [voiceRecording,    setVoiceRecording]    = useState(false);
  const [voiceResult,       setVoiceResult]       = useState(null);   // VoiceAnalysisResult
  const [voiceDuration,     setVoiceDuration]     = useState(5);

  // ── Camera Scanner state ─────────────────────────────────────────────────
  const [cameraOpen,        setCameraOpen]        = useState(false);
  const [cameraStream,      setCameraStream]      = useState(null);
  const [cameraScanning,    setCameraScanning]    = useState(false);
  const [scanResult,        setScanResult]        = useState(null);  // CameraScanResult
  const [confirmedChords,   setConfirmedChords]   = useState([]);
  const videoRef = useRef(null);

  // ── Mood Parser state ────────────────────────────────────────────────────
  const [moodText,          setMoodText]          = useState("");
  const [moodResult,        setMoodResult]        = useState(null);  // MoodParseResult
  const [moodLoading,       setMoodLoading]       = useState(false);
  const [llmEnabled,        setLlmEnabled]        = useState(false);

  // ── Live Jam Pad state ───────────────────────────────────────────────────
  const [jamPadOpen,        setJamPadOpen]        = useState(false);

  // ── Theory intelligence state ─────────────────────────────────────────────
  // Populated from theoryMeta on the first track after every band generation.
  const [theoryMeta,        setTheoryMeta]        = useState(null);
  const [jamName, setJamName] = useState("My Jam");
  const [jamNameEditorOpen, setJamNameEditorOpen] = useState(false);
  const [savedJams, setSavedJams] = useState([]);
  const [savingJam, setSavingJam] = useState(false);
  const [loadingJams, setLoadingJams] = useState(false);


  const [editingTrack, setEditingTrack] = useState(null);
  const [chordInput, setChordInput] = useState("");
  
  const [addTab, setAddTab] = useState(0);

  const [selectedChord, setSelectedChord] = useState(null);
  const currentChordBeatsRef = useRef(1);
  const [editChord, setEditChord] = useState({
    type: "chord",
    name: "",
    octave: "4",
    inversion: "0",
    beats: "1",
    repeat: "1",
    instrument: "acoustic_grand_piano",
    wait: "0",
    speed: "1",
    pattern: [true]
    });

    
const handleDragEnd = (trackId, event) => {

    const { active, over } = event;

    if (!over || active.id === over.id) {
        return;
    }

    const oldIndex = active.data.current?.index;
    const newIndex = over.data.current?.index;

    if (
        oldIndex == null ||
        newIndex == null ||
        oldIndex === newIndex
    ) {
        return;
    }

    setTracks(prev =>
        prev.map(track => {

            if (track.id !== trackId) {
                return track;
            }

            return {
                ...track,
                chords: arrayMove(
                    track.chords,
                    oldIndex,
                    newIndex
                )
            };

        })
    );
};

    

  const [newChord, setNewChord] = useState({
  type: "chord",
  name: "",
  octave: "4",
  inversion: "0",
  beats: "1",
  repeat: "1",
  instrument: "acoustic_grand_piano",
  wait: "0",
  speed: "1",
  pattern: [true]
    });

  const [activeChords, setActiveChords] = useState([]);

  const [mode, setMode] = useState("normal");
  const modeRef = useRef("normal");

  const [playhead, setPlayhead] = useState(0);
  const [trackPlayheads, setTrackPlayheads] = useState({});
  

  const [bpm, setBpm] = useState("120");
  const bpmRef = useRef(120);
  const beatsPerBarRef = useRef(4);

  const playbackIdRef = useRef(0);

    useEffect(() => {
    bpmRef.current = Number(bpm);
    }, [bpm]);

    useEffect(() => {
        beatsPerBarRef.current = beatsPerBar;
    }, [beatsPerBar]);

    



const changeTrackVolume = (id, volume) => {
    setTracks(prev =>
        prev.map(track =>
            track.id === id
                ? {
                    ...track,
                    volume
                }
                : track
        )
    );
    updateAudioTrackVolume(id, volume);
};

const changeTrackInstrument = async (id, instrument) => {
    // Update the track default AND re-voice every chord already on this track.
    // Each chord carries its own `instrument` field (set at creation time, or
    // overridden per-chord via the Add/Edit Chord dialog) which now takes
    // priority during playback -- so without this cascade, changing the
    // track's instrument here would only affect chords added afterward.
    setTracks(prev =>
        prev.map(track =>
            track.id === id
                ? {
                    ...track,
                    instrument,
                    chords: track.chords.map(chord => ({ ...chord, instrument }))
                }
                : track
        )
    );

    // If currently playing, immediately preload the new instrument
    // The improved loadInstrumentForTrack will handle hot-swapping smoothly
    if (playingRef.current) {
        try {
            await loadInstrumentForTrack(id, instrument);
        } catch (error) {
            console.warn("Failed to switch instrument:", error);
        }
    }
};

const addTrack = () => {

    const newTrack = {
        id: Date.now(),
        name: `Track ${tracksRef.current.length + 1}`,
        chords: [],
        muted: false,
        volume: 0.8,
        instrument: getTrackInstrumentForIndex(tracksRef.current.length),
        loop: true,
        color: trackColors[
            tracksRef.current.length % trackColors.length
        ]
    };

    setTracks(prev => [
        ...prev,
        newTrack
    ]);

    setTrackPlayheads(prev => ({
        ...prev,
        [newTrack.id]: 0
    }));
};



const duplicateTrack = (id) => {

    setTracks(prev => {

        const index = prev.findIndex(
            track => track.id === id
        );

        if (index === -1) return prev;

        const original = prev[index];

        const copy = {
            ...original,
            id: Date.now(),
            name: `${original.name} Copy`,
            instrument: original.instrument || "acoustic_grand_piano",
            chords: original.chords.map(chord => ({
                ...chord
            }))
        };

        return [
            ...prev.slice(0, index + 1),
            copy,
            ...prev.slice(index + 1)
        ];

    });

};

const renameTrack = () => {

    if (!menuTrackId || !renameTrackName.trim()) {
        return;
    }

    setTracks(prev =>
        prev.map(track =>
            track.id === menuTrackId
                ? {
                    ...track,
                    name: renameTrackName.trim()
                }
                : track
        )
    );

    setRenameDialogOpen(false);
    setRenameTrackName("");

};


const deleteTrack = (id) => {

    setTracks(prev => {

        const remainingTracks = prev.filter(
            track => track.id !== id
        );

        if (remainingTracks.length === 0) {
            stopProgression();
        }

        return remainingTracks;
    });

    setTrackPlayheads(prev => {

        const next = { ...prev };

        delete next[id];

        return next;
    });

    // Remove deleted track from playback state.
    delete playbackStateRef.current[id];

    currentStepRef.current = 0;
};



const toggleMuteTrack = (id) => {
  setTracks(prevTracks => {
    const updated = prevTracks.map(track =>
      track.id === id
        ? { ...track, muted: !track.muted }
        : track
    );

    // Apply audio-level gain ramp immediately.
    const target = updated.find(t => t.id === id);
    if (target) {
      muteTrackAudio(id, target.muted, target.volume);
    }

    return updated;
  });
};

const toggleSoloTrack = (id) => {
  setTracks(prevTracks => {
    // Determine if we're turning solo ON or OFF.
    const current = prevTracks.find(t => t.id === id);
    const turningOn = !current?.solo;

    const updated = prevTracks.map(track => {
      if (track.id === id) return { ...track, solo: turningOn };
      // Clear solo on any other track when solo is activated.
      if (turningOn) return { ...track, solo: false };
      return track;
    });

    // Build a volume map for every track so the audio layer
    // knows what to restore each track to.
    const volMap = {};
    updated.forEach(t => { volMap[t.id] = t.volume; });

    if (turningOn) {
      // Silence all other tracks at the gain level.
      soloTrackAudio(id, volMap);
    } else {
      // Restore all tracks.
      unsoloAllAudio(volMap);
    }

    return updated;
  });
};

const toggleTrackLoop = (id) => {

    setTracks(prevTracks =>
        prevTracks.map(track =>
            track.id === id
                ? {
                    ...track,
                    loop: track.loop === false
                        ? true
                        : false
                }
                : track
        )
    );

};



const addChordToTrack = () => {

    if (!newChord.name.trim()) return;

    const selectedTrack = tracksRef.current.find(track => track.id === editingTrack);
    const trackInstrument = selectedTrack?.instrument || "acoustic_grand_piano";
    const chordInstrument = newChord.instrument || trackInstrument;

    setTracks(prev =>
        prev.map(track =>
            track.id === editingTrack
                ? {
                    ...track,
                    chords: [
                        ...track.chords,
                        {
                            ...newChord,
                            instrument: chordInstrument,

                            type:
                                addTab === 0
                                    ? "chord"
                                    : "note",

                            octave: Number(newChord.octave),

                            inversion:
                                addTab === 0
                                    ? Number(newChord.inversion)
                                    : 0,

                            beats: Number(newChord.beats),

                            repeat: Number(newChord.repeat),

                            wait: Number(newChord.wait),

                            speed: Number(newChord.speed)
                        }
                    ]
                }
                : track
        )
    );

    setNewChord({
        type: "chord",
        name: "",
        octave: "4",
        inversion: "0",
        beats: "1",
        repeat: "1",
        instrument: "acoustic_grand_piano",
        wait: "0",
        speed: "1",
        pattern: [true]
    });

    setAddTab(0);
};


const duplicateChordInTrack = (trackId, chordIndex) => {

    setTracks(prev =>
        prev.map(track => {

            if (track.id !== trackId) {
                return track;
            }

            const chord = track.chords[chordIndex];

            if (!chord) {
                return track;
            }

            const copy = {
                ...chord
            };

            return {
                ...track,
                chords: [
                    ...track.chords.slice(0, chordIndex + 1),
                    copy,
                    ...track.chords.slice(chordIndex + 1)
                ]
            };

        })
    );

};


const deleteChordFromTrack = (trackId, chordIndex) => {

    setTracks(prev =>
        prev.map(track =>
            track.id === trackId
                ? {
                    ...track,
                    chords: track.chords.filter(
                        (_, i) => i !== chordIndex
                    )
                }
                : track
        )
    );

};



const createPattern = (beats, existingPattern = []) => {

    const length = Math.max(
        1,
        Number(beats) || 1
    );

    return Array.from(
        { length },
        (_, index) =>
            existingPattern[index] ?? index === 0
    );
};


const editChordData = () => {

    if (!editChord.name.trim()) return;

    setTracks(prev =>
        prev.map(track =>
            track.id === selectedChord.trackId
                ? {
                    ...track,
                    chords: track.chords.map((chord, index) =>
                        index === selectedChord.index
                            ? {
                                ...editChord,

                                type:
                                    editChord.type === "note"
                                        ? "note"
                                        : "chord",

                                octave:
                                    Number(editChord.octave),

                                inversion:
                                    editChord.type === "note"
                                        ? 0
                                        : Number(editChord.inversion),

                                beats:
                                    Number(editChord.beats),

                                repeat:
                                    Number(editChord.repeat),

                                wait:
                                    Number(editChord.wait),

                                speed:
                                    Number(editChord.speed)
                            }
                            : chord
                    )
                }
                : track
        )
    );

    setSelectedChord(null);

    setEditChord({
        type: "chord",
        name: "",
        octave: "4",
        inversion: "0",
        beats: "1",
        repeat: "1",
        instrument: "acoustic_grand_piano",
        wait: "0",
        speed: "1",
        pattern: [true]
    });
};






const saveTempo = async () => {
    const finalBpm = Math.min(
        240,
        Math.max(40, Number(bpm) || 120)
    );

    const finalBeats = Math.min(
        12,
        Math.max(1, Number(beatsPerBar))
    );

    setBpm(finalBpm);
    setBeatsPerBar(finalBeats);

    try {
        await apiJson("/tempo", {
            method: "POST",
            body: JSON.stringify({
                bpm: finalBpm,
                beats_per_bar: finalBeats
            }),
            timeoutMs: 8000,
        });
    } catch (error) {
        console.warn("Tempo sync skipped:", error);
    }

    setTempoDialogOpen(false);
};


const itemToMidi = (item) => {
    try {
        const raw = item.type === "note"
            ? [noteToMidi(item.name, item.octave)]
            : chordToMidi(item.name, item.octave, item.inversion);

        return (Array.isArray(raw) ? raw : [raw]).filter(
            (value) => Number.isFinite(Number(value))
        );
    } catch (error) {
        console.warn("MIDI conversion failed:", item?.name, error);
        return [];
    }
};

const playStep = async (chords, playbackId) => {

    if (
        !playingRef.current ||
        playbackId !== playbackIdRef.current
    ) {
        return;
    }

    setActiveChords(
        chords.map(chord => chord.uiId)
    );

    await Promise.all(
        chords.map(async chord => {

            const midiNotes = itemToMidi(chord);

            const pattern =
                chord.pattern ||
                createPattern(chord.beats);

            const currentBeat =
                chord.state.beat;

            let durationBeats = 1;

            for (
                let i = currentBeat + 1;
                i < chord.beats;
                i++
            ) {

                if (pattern[i] === true) {
                    break;
                }

                durationBeats++;
            }

            await playChord(
                midiNotes,
                durationBeats,
                bpmRef.current,
                chord.volume,
                chord.instrument,
                chord.trackId,
                Number(chord.speed ?? 1),
                chord.name,
                { isFill: !!chord.isFill, tensionScore: chord.tensionScore }
            );

        })
    );

    /*
     * Playback may have been stopped while
     * playChord() was running.
     */
    if (
        !playingRef.current ||
        playbackId !== playbackIdRef.current
    ) {
        return;
    }

    setTimeout(() => {

        if (
            playingRef.current &&
            playbackId === playbackIdRef.current
        ) {
            setActiveChords([]);
        }

    }, (60 / bpmRef.current) * 1000);

};






  // Playback

  // const currentIndexRef = useRef(0);
  const currentStepRef = useRef(0);
  const currentBeatInStepRef = useRef(0);
  const playbackStateRef = useRef({});
  const playingRef = useRef(false);
  const currentBeatRef = useRef(0);
  const pausedRef = useRef(false);
  const timerRef = useRef(null);

  const abortControllerRef = useRef(null);



  const [isPlaying, setIsPlaying] = useState(false);


  const sleep = (ms, playbackId) =>
    new Promise(resolve => {

        timerRef.current = setTimeout(() => {

            timerRef.current = null;

            resolve(
                playingRef.current &&
                playbackId === playbackIdRef.current
            );

        }, ms);

    });



    const tracksRef = useRef([]);

    useEffect(()=>{
    tracksRef.current = tracks;
    },[tracks]);



const playAllTracks = async () => {

    if (playingRef.current) {
        return;
    }

    const playbackId = ++playbackIdRef.current;

    playingRef.current = true;
    pausedRef.current = false;

    // Metronome Count-In
    setCountingIn(true);
    await playCountIn(bpmRef.current);
    setCountingIn(false);
    
    // Check if stopped during count-in
    if (playbackId !== playbackIdRef.current) {
        return;
    }

    setIsPlaying(true);
    setActiveChords([]);

    // Reset playback state
    playbackStateRef.current = {};

    tracksRef.current.forEach(track => {

        playbackStateRef.current[track.id] = {
            trackId: track.id,
            step: 0,
            beat: 0,
            repeat: 0,
            finished: false
        };

    });

    currentBeatRef.current = 0;
    currentBeatInStepRef.current = 0;
    currentBeatRef.current = 0;
    setProgressionIndex(0);
    setPlayhead(0);

    setTrackPlayheads(() => {

        const reset = {};

        tracksRef.current.forEach(track => {
            reset[track.id] = 0;
        });

        return reset;
    });


    while (
        playingRef.current &&
        playbackId === playbackIdRef.current
    ) {

        // Pause — poll every 100ms, pass playbackId so the loop can exit if stopped
        if (pausedRef.current) {
            await sleep(100, playbackId);
            continue;
        }


        const maxLength = Math.max(
            0,
            ...tracksRef.current.map(
                track => track.chords.length
            )
        );


        // Nothing to play
        if (maxLength === 0) {
            playingRef.current = false;
            setIsPlaying(false);
            setActiveChords([]);
            stopAllNotes();
            break;
        }


        /*
        * Make sure every current track has
        * a playback state.
        */
        tracksRef.current.forEach(track => {

            if (!playbackStateRef.current[track.id]) {

                playbackStateRef.current[track.id] = {
                    trackId: track.id,
                    step: 0,
                    beat: 0,
                    repeat: 0,
                    finished: false
                };

            }

        });


        const currentTrackIds = new Set(
            tracksRef.current.map(track => String(track.id))
        );

        Object.keys(playbackStateRef.current).forEach(id => {

            if (!currentTrackIds.has(String(id))) {
                delete playbackStateRef.current[id];
            }

        });

        /*
         * Get the current chord from every track.
         * Respect solo mode: if any track is soloed, play only solos; otherwise respect mute.
         */
        const soloTrack = tracksRef.current.find(t => t.solo);
        const shouldShowOnly = !!soloTrack;

        const chordsAtStep = tracksRef.current
            .filter(track => {
              if (track.chords.length === 0 || playbackStateRef.current[track.id]?.finished) {
                return false;
              }
              if (shouldShowOnly) {
                return track.solo;
              }
              return !track.muted;
            })

            .map(track => {

                const state =
                    playbackStateRef.current[track.id];

                const chordIndex = state.step;

                const chord =
                    track.chords[chordIndex];

                return {
                    ...chord,

                    volume: track.volume,

                    // A chord's own instrument (set via the Add/Edit Chord dialog)
                    // must win over the track default -- previously this always
                    // forced track.instrument, so picking a per-chord instrument
                    // in the dialog had no audible effect at all.
                    instrument: chord.instrument || track.instrument,

                    trackId: track.id,

                    state,

                    /*
                    * This is the ID used by SortableChord
                    * for its active state.
                    */
                    uiId: `${track.id}-${chordIndex}`

                };

            });


        /*
         * Determine whether at least one track
         * is starting a new chord.
         */
        const chordsToPlay = chordsAtStep.filter(chord => {

            const pattern =
                chord.pattern ||
                createPattern(chord.beats);

            return pattern[chord.state.beat] === true;

        });

        const shouldPlay = chordsToPlay.length > 0;

        try {

            if (shouldPlay) {

                await playStep(chordsToPlay, playbackId);

            }


            /*
             * One beat.
             */
            const shouldContinue =
                await sleep(
                    (60 / bpmRef.current) * 1000,
                    playbackId
                );

            if (!shouldContinue) {
                break;
            }


        }
        catch (error) {

            if (error.name === "AbortError") {
                break;
            }

            console.error(
                "Playback error:",
                error
            );

        }


        /*
         * Advance every track independently.
         */
        Object.values(
            playbackStateRef.current
        ).forEach(state => {

            const track =
                tracksRef.current.find(
                    track =>
                        track.id === state.trackId
                );


            if (
                !track ||
                track.chords.length === 0
            ) {
                return;
            }


            const chord =
                track.chords[state.step];

            if (!chord) {

                state.step = 0;
                state.beat = 0;
                state.repeat = 0;

                return;
            }



            state.beat++;


            /*
             * Move to the next chord when
             * this chord has finished.
             */
            
            if (state.beat >= chord.beats) {

                state.beat = 0;

                state.repeat++;

                const repeatCount = Math.max(
                    1,
                    Number(chord.repeat) || 1
                );


                if (state.repeat >= repeatCount) {

                    state.repeat = 0;

                    state.step++;

                    if (state.step >= track.chords.length) {

                        if (track.loop === false) {

                            // Track is finished.
                            state.finished = true;

                            // Keep it at the last position.
                            state.step = track.chords.length - 1;

                        } else {

                            // Normal track: loop back to beginning.
                            state.step = 0;

                        }

                    }


                }

            }

        });


        /*
         * Advance global beat.
         */
        currentBeatRef.current++;


        if (
            currentBeatRef.current >=
            beatsPerBarRef.current
        ) {

            currentBeatRef.current = 0;

        }


        const nextPlayheads = {};
        tracksRef.current.forEach(track => {
            const state = playbackStateRef.current[track.id];
            nextPlayheads[track.id] = state ? state.step : 0;
        });
        setTrackPlayheads(nextPlayheads);

        const liveSteps = Object.values(playbackStateRef.current)
            .filter(state => {
                const track = tracksRef.current.find(t => t.id === state.trackId);
                return !!track && !track.muted;
            })
            .map(state => state.step);

        if (liveSteps.length > 0) {
            const minStep = Math.min(...liveSteps);
            setProgressionIndex(minStep);

            const firstTrack = tracksRef.current[0];
            if (firstTrack?.sectionLabels && firstTrack.chords[minStep]) {
                const totalChords = firstTrack.chords.length;
                const chordLength = Math.ceil(totalChords / (firstTrack.sectionLabels.length || 1));
                const sectionIdx = Math.floor(minStep / chordLength);
                setCurrentSection(firstTrack.sectionLabels[sectionIdx] || null);
            }
        }


    }


    /*
     * Playback ended normally.
     */
    if (
        playbackId ===
        playbackIdRef.current
    ) {

        playingRef.current = false;

        setIsPlaying(false);

    }

};


const startPlayback = async () => {

    const hasPlayableTrack = tracksRef.current.some(
        track =>
            Array.isArray(track.chords) &&
            track.chords.length > 0 &&
            !track.muted
    );

    if (!hasPlayableTrack) {
        setImportError("Import a song or generate a band before pressing Play.");
        return;
    }

    try {
        await unlockAudio();
    } catch (error) {
        console.error("Audio unlock failed:", error);
        setImportError("Audio failed to unlock. Please tap Play once more.");
        return;
    }

    // No artificial delay — samplers are pre-warmed after generation.
    // Just ensure we're not double-starting.
    if (playingRef.current) {
        pausedRef.current = false;
        setIsPlaying(true);
        return;
    }

    playAllTracks();
};




const pauseProgression = () => {

    /*
     * Tell the playback loop to pause.
     */
    pausedRef.current = true;


    /*
     * Immediately stop currently
     * sounding notes.
     */
    stopAllNotes();


    /*
     * Change the UI from Pause
     * back to Play.
     */
    setIsPlaying(false);

};


const stopProgression = () => {

    // Invalidate the currently running playback loop.
    playbackIdRef.current++;

    // Stop all currently sounding notes immediately.
    stopAllNotes();

    // Stop playback loop.
    playingRef.current = false;
    pausedRef.current = false;

    // Cancel any pending timer.
    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }

    // Cancel pending HTTP/audio operation if one exists.
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }

    // Reset all playback positions.
    currentStepRef.current = 0;
    currentBeatInStepRef.current = 0;
    currentBeatRef.current = 0;

    playbackStateRef.current = {};

    // Reset global playhead.
    setPlayhead(0);

    // IMPORTANT:
    // Reset every track's playhead.
    setTrackPlayheads(() => {
        const reset = {};

        tracksRef.current.forEach(track => {
            reset[track.id] = 0;
        });

        return reset;
    });

    // Remove active chord highlighting.
    setActiveChords([]);

    // Reset section display.
    setCurrentSection(null);

    // Reset UI.
    setIsPlaying(false);
};

const saveCurrentJam = async () => {
    const trimmedName = jamName.trim() || `Jam ${new Date().toLocaleString()}`;

    const payload = {
        name: trimmedName,
        bpm: Number(bpm) || 120,
        beats_per_bar: Number(beatsPerBar) || 4,
        arrangement: {
            tracks,
            importedSong,
            bpm: Number(bpm) || 120,
            beats_per_bar: Number(beatsPerBar) || 4,
            selectedTrack,
            progressionIndex,
            bandStyle,
            arrangementPreset,
            aiBandSelection,
            aiProducerSettings,
        },
        song_id: importedSong?.id ?? null,
        user_id: null,
    };

    setSavingJam(true);

    try {
        const data = await apiJson("/save-jam", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        const savedRecord = Array.isArray(data?.data) ? data.data[0] : data?.data;
        if (savedRecord) {
            setSavedJams(prev => [savedRecord, ...prev.filter(item => item.id !== savedRecord.id)]);
        }

        setJamName(trimmedName);
        setImportError("");
    } catch (error) {
        console.error("Save jam failed:", error);
        setImportError(error.message || "Unable to save the jam.");
    } finally {
        setSavingJam(false);
    }
};

const loadSavedJams = async () => {
    setLoadingJams(true);

    try {
        const data = await apiJson("/load-jams", {
            method: "GET",
        });

        const items = Array.isArray(data?.data) ? data.data : [];
        setSavedJams(items);
    } catch (error) {
        console.error("Load jams failed:", error);
        setImportError(error.message || "Unable to load saved jams.");
    } finally {
        setLoadingJams(false);
    }
};

const restoreSavedJam = (jam) => {
    const arrangement = jam?.arrangement || {};
    const restoreTracks = Array.isArray(arrangement.tracks) && arrangement.tracks.length > 0
        ? arrangement.tracks
        : tracks;

    stopProgression();

    if (Array.isArray(restoreTracks)) {
        setTracks(restoreTracks);
        setSelectedTrack(restoreTracks[0]?.id ?? null);
    }

    if (typeof arrangement.bpm === "number") {
        setBpm(String(arrangement.bpm));
    }

    if (typeof arrangement.beats_per_bar === "number") {
        setBeatsPerBar(arrangement.beats_per_bar);
    }

    if (jam?.name) {
        setJamName(jam.name);
    }

    if (arrangement.bandStyle) {
        setBandStyle(arrangement.bandStyle);
    }

    if (arrangement.arrangementPreset) {
        setArrangementPreset(arrangement.arrangementPreset);
    }

    if (arrangement.aiBandSelection) {
        setAiBandSelection(arrangement.aiBandSelection);
    }

    if (arrangement.aiProducerSettings) {
        setAiProducerSettings(arrangement.aiProducerSettings);
    }
};

// get chords from url

const [songUrl, setSongUrl] = useState("");
const [importedSong, setImportedSong] = useState(null);
const [importing, setImporting] = useState(false);
const [importError, setImportError] = useState("");
const [progressionIndex, setProgressionIndex] = useState(0);
  const [currentSection, setCurrentSection] = useState(null);
// ── Voice Analyzer handlers ──────────────────────────────────────────────
const handleVoiceRecord = async () => {
  setVoiceRecording(true);
  setVoiceResult(null);
  try {
    const result = await analyzeAll(voiceDuration);
    setVoiceResult(result);
  } catch (err) {
    setImportError(err.message || "Microphone analysis failed.");
  } finally {
    setVoiceRecording(false);
  }
};

const applyVoiceResult = () => {
  if (!voiceResult) return;
  const settings = mapVoiceAnalysisToSettings(voiceResult);
  setBandStyle(settings.bandStyle);
  setArrangementPreset(settings.arrangementPreset);
  setAiProducerSettings(settings.producerSettings);
  if (settings.bpm) setBpm(settings.bpm);
  setVoiceResult(null);
  generateLocalBand(importedSong, settings.bandStyle);
};

// ── Camera Scanner handlers ──────────────────────────────────────────────
const handleOpenCamera = async () => {
  setScanResult(null);
  setConfirmedChords([]);
  try {
    const stream = await openCamera();
    setCameraStream(stream);
    setCameraOpen(true);
    // Attach stream to video element after the next render
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }, 100);
  } catch (err) {
    setImportError(err.message || "Camera permission denied.");
  }
};

const handleCaptureFrame = async () => {
  if (!videoRef.current || !cameraStream) return;
  setCameraScanning(true);
  try {
    const imageData = captureFrame(videoRef.current);
    const result    = await ocrExtractChords(imageData);
    setScanResult(result);
    // Pre-confirm high-confidence chords
    setConfirmedChords([...result.chords]);
  } catch (err) {
    setImportError("OCR failed: " + (err.message || "unknown error"));
  } finally {
    setCameraScanning(false);
  }
};

const handleImportScannedChords = () => {
  if (confirmedChords.length === 0) return;
  const fakeSong = {
    title:  "Camera Scan",
    chords: confirmedChords.map((name) => ({ name, beats: 1 })),
  };
  setImportedSong(fakeSong);
  generateLocalBand(fakeSong);
  handleCloseCamera();
};

const handleCloseCamera = () => {
  stopCamera(cameraStream);
  setCameraStream(null);
  setCameraOpen(false);
  setScanResult(null);
};

// ── Mood Parser handlers ─────────────────────────────────────────────────
const handleParseMood = async () => {
  if (!moodText.trim()) return;
  setMoodLoading(true);
  setMoodResult(null);
  try {
    let result = null;
    if (llmEnabled) {
      const available = await isOllamaAvailable();
      if (available) {
        const llmConfig = await queryOllama(moodText);
        if (llmConfig) {
          result = {
            config:            llmConfig,
            interpretationText: `Interpreted as: ${llmConfig.style}, ${llmConfig.arrangementPreset} preset, BPM ${llmConfig.bpm}, energy ${llmConfig.energy} (AI)`,
            confidence:        1,
            source:            "llm",
            matchedKeywords:   [],
          };
        }
      }
    }
    if (!result) {
      result = parseMood(moodText, {
        style:              bandStyle,
        arrangementPreset,
        energy:             aiProducerSettings.energy,
        vocalIntensity:     aiProducerSettings.vocalIntensity,
        arrangementDensity: aiProducerSettings.arrangementDensity,
        bpm:                Number(bpm),
      });
    }
    setMoodResult(result);
    // Apply config
    setBandStyle(result.config.style);
    setArrangementPreset(result.config.arrangementPreset);
    setAiProducerSettings({
      energy:             result.config.energy,
      vocalIntensity:     result.config.vocalIntensity,
      arrangementDensity: result.config.arrangementDensity,
    });
    if (result.config.bpm) setBpm(String(result.config.bpm));
    generateLocalBand(importedSong, result.config.style);
  } catch (err) {
    setImportError("Mood parsing failed: " + (err.message || ""));
  } finally {
    setMoodLoading(false);
  }
};

// ── Live Jam Pad handler ─────────────────────────────────────────────────
const handleJamRecordComplete = (newTrack) => {
  setTracks((prev) => [...prev, newTrack]);
  setSelectedTrack(newTrack.id);
  setJamPadOpen(false);
};

const generateLocalBand = async (song = importedSong, style = bandStyle, statusMessage) => {
  try {
    stopProgression();

    let activeSong = song;
    // If no song is imported, but the user has manually edited chords in the first track, use those chords.
    if ((!activeSong || !Array.isArray(activeSong.chords) || activeSong.chords.length === 0) && tracks.length > 0 && tracks[0].chords && tracks[0].chords.length > 0) {
        activeSong = {
            title: "My Jam",
            chords: tracks[0].chords.map(c => ({ name: c.name, beats: c.beats }))
        };
    }

    const hasSong = activeSong && Array.isArray(activeSong.chords) && activeSong.chords.length > 0;

    // Arrangement generation is entirely local (aiBandEngine.js + musicTheory.js).
    // A backend /generate-band-plan endpoint used to be called here too, but its
    // result was only ever used to (re)populate the intelligence banner, and with
    // a *less* capable analysis than the local engine already produces (no real
    // key detection, no Roman numerals, naive section splitting) -- it was a
    // needless network round-trip that, when it succeeded, actually downgraded
    // the banner instead of improving it. Removed.
    let nextTracks = hasSong
      ? buildBandFromSong(activeSong, style, aiBandSelection, aiProducerSettings, arrangementPreset)
      : buildDemoBand(style, aiBandSelection, aiProducerSettings, arrangementPreset);

    if (!Array.isArray(nextTracks) || nextTracks.length === 0) {
      throw new Error("The arranger returned no tracks.");
    }

    // Map what the user says they play to the track ROLE it corresponds to.
    // Matching by role (set once at track creation in aiBandEngine.js) instead of by
    // instrument timbre avoids false positives: several roles can share the same
    // sample (e.g. Rhythm and Lead can both be "rock_guitar"), so matching on
    // instrument name used to mute the wrong track.
    const roleForUserInstrument = {
      drums: "drums",
      bass_guitar: "bass",
      rhythm_guitar: "rhythm",
      lead_guitar: "lead",
      piano: "piano",
      keyboards: "piano",
      vocals: "vocal",
    };

    const reservedRole = roleForUserInstrument[userInstrument];

    // Mark the user's track as reserved and muted
    nextTracks = nextTracks.map(track => {
      if (reservedRole && track.role === reservedRole) {
        return {
          ...track,
          name: `You: ${track.name}`,
          muted: true,
          reservedForUser: true
        };
      }
      return track;
    });

    setTracks(nextTracks);
    setSelectedTrack(nextTracks[0]?.id ?? null);
    setTheoryMeta(nextTracks[0]?.theoryMeta || null);
    // Reflect whatever style the theory engine actually resolved to (auto-
    // detected or the user's own explicit pick) back into the dropdown.
    const resolvedStyle = nextTracks[0]?.theoryMeta?.resolvedStyle;
    if (resolvedStyle) setBandStyle(resolvedStyle);

    if (statusMessage !== undefined) {
      setImportError(statusMessage);
    } else {
      setImportError(hasSong ? "AI arrangement generated locally." : "Demo band loaded. Paste an Ultimate Guitar URL to replace it.");
    }
    preWarmSamplers(nextTracks).catch(() => {});
  } catch (error) {
    console.error(error);
    setImportError("Band generation failed: " + (error.message || "unknown error"));
  }
};

useEffect(() => {
  generateLocalBand(null, "pop", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

async function importSong() {
  if (!songUrl.trim()) return;

  setImporting(true);
  setImportError("");

  try {
    const data = await apiJson("/import-song", {
      method: "POST",
      body: JSON.stringify({
        url: songUrl,
      }),
      timeoutMs: 30000,
    });

    setImportedSong(data);
    // Let the theory engine auto-detect style from this song's actual chords
    // unless the user has already explicitly chosen one from the dropdown.
    generateLocalBand(data, styleManuallySetRef.current ? bandStyle : null);

  } catch (error) {
    console.error(error);

    generateLocalBand(
      null,
      bandStyle,
      (error.message || "Failed to import song") + " — loaded a demo band so you can still play."
    );

  } finally {
    setImporting(false);
  }
}








  return (

    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        boxSizing: "border-box",
        background: `linear-gradient(180deg, ${colors.primaryLight} 0%, ${colors.background} 320px)`,
        fontFamily: colors.fontBody,
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >

    {/* ── App Header ───────────────────────────────────────────────────── */}
    <div
      style={{
        width: "100%",
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        background: "rgba(245,240,255,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 17, boxShadow: `0 4px 12px ${colors.primary}55`,
      }}>🎧</div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
        <span style={{ fontFamily: colors.fontDisplay, fontWeight: 800, fontSize: 17, color: colors.text }}>Jammify</span>
        <span style={{ fontSize: 11, color: colors.textSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Paste a song, meet your AI band
        </span>
      </div>
    </div>

    <div
      style={{
        width: "100%",
        maxWidth: 640,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        padding: "16px 14px",
        paddingBottom: 110, // space for sticky bottom transport bar
        boxSizing: "border-box",
      }}
    >

    {/* ── Import a song ───────────────────────────────────────────────── */}
    <div className="jf-card" style={{ width: "100%", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: colors.fontDisplay, fontWeight: 700, fontSize: 14, color: colors.text }}>
        🔗 Import a song
      </div>
      <TextField
          fullWidth
          size="small"
          label="Ultimate Guitar URL"
          placeholder="Paste Ultimate Guitar song URL here"
          value={songUrl}
          onChange={(e) => setSongUrl(e.target.value)}
          disabled={importing}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <Button
            variant="contained"
            onClick={importSong}
            disabled={!songUrl.trim() || importing}
            fullWidth
            sx={{ backgroundColor: colors.primary, borderRadius: 999, textTransform:"none", fontWeight: 700, py: 1 }}
        >
            {importing ? "Importing..." : "🎵 Import"}
        </Button>
        <TextField
            select
            size="small"
            label="Style"
            value={bandStyle}
            onChange={(e) => {
              const newStyle = e.target.value;
              setBandStyle(newStyle);
              styleManuallySetRef.current = true;

              // Recommend optimal band setup based on style
              const recs = {
                pop: { bass: true, piano: true, rhythm: true, drums: true, lead: false, pad: false, vocal: false },
                rock: { bass: true, piano: false, rhythm: true, drums: true, lead: false, pad: false, vocal: false },
                jazz: { bass: true, piano: true, rhythm: false, drums: true, lead: true, pad: false, vocal: false },
                cinematic: { bass: true, piano: false, rhythm: true, drums: false, lead: true, pad: true, vocal: false },
                "lo-fi": { bass: true, piano: true, rhythm: false, drums: true, lead: true, pad: false, vocal: false },
                acoustic: { bass: true, piano: false, rhythm: true, drums: false, lead: true, pad: false, vocal: false },
              };
              // Only auto-apply the recommendation if the user hasn't manually
              // customised their band selection yet -- otherwise this would
              // silently discard their choices every time they try a new style.
              if (recs[newStyle] && !bandSelectionCustomizedRef.current) {
                setAiBandSelection(recs[newStyle]);
              }
            }}
            sx={{ minWidth: 128, flexShrink: 0 }}
        >
            {styleOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      </div>

      {/* Arrangement presets -- horizontal scroll strip, never wraps/overflows */}
      <div className="jf-hscroll" style={{ paddingTop: 2 }}>
        {arrangementPresetOptions.map((option) => (
          <Button
            key={option.value}
            variant={arrangementPreset === option.value ? "contained" : "outlined"}
            size="small"
            onClick={() => setArrangementPreset(option.value)}
            sx={{
              borderRadius:999, minWidth:0, px:1.8, py:0.5,
              textTransform:"none", fontSize:12, fontWeight: 600,
              backgroundColor: arrangementPreset === option.value ? colors.primary : "transparent",
              borderColor: colors.border,
              color: arrangementPreset === option.value ? "white" : colors.text,
            }}
          >{option.label}</Button>
        ))}
      </div>
    </div>

    {/* ── Choose Your Band ────────────────────────────────────────────── */}
    <div className="jf-card" style={{ width: "100%", padding: 16, display:"flex", flexDirection:"column", gap:14 }}>

        {/* Header */}
        <div style={{ display:"flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: colors.fontDisplay, fontSize:15, fontWeight:700, color:colors.text }}>🎵 Choose your band</span>
          <span style={{ fontSize:12, color:colors.textSoft }}>Pick what you play, and what the AI fills in</span>
        </div>

        {/* User Instrument Section */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:colors.textSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>What do you play?</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap:8 }}>
            {["drums", "bass_guitar", "rhythm_guitar", "lead_guitar", "piano", "keyboards", "vocals", "nothing"].map((instrument) => {
              const active = userInstrument === instrument;
              const icon = {
                drums:"🥁", bass_guitar:"🎸", rhythm_guitar:"🎸", lead_guitar:"🎸",
                piano:"🎹", keyboards:"🎹", vocals:"🎤", nothing:"👂",
              }[instrument] || "🎵";
              return (
                <button
                  key={instrument}
                  onClick={() => setUserInstrument(instrument)}
                  style={{
                    borderRadius: 14, padding: "10px 6px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    background: active ? colors.primary : colors.surface,
                    border: `1.5px solid ${active ? colors.primary : colors.border}`,
                    color: active ? "white" : colors.text,
                    fontSize: 11, fontWeight: 700, textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  {instrument === "nothing" ? "Just Listen" :
                   instrument === "bass_guitar" ? "Bass" :
                   instrument === "rhythm_guitar" ? "Rhythm Gtr" :
                   instrument === "lead_guitar" ? "Lead Gtr" :
                   instrument.charAt(0).toUpperCase() + instrument.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Band Section */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:colors.textSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>What should the AI band play?</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap:8 }}>
            {aiBandInstrumentOptions.map((option) => {
              // aiBandInstrumentOptions keys line up 1:1 with aiBandSelection and
              // with each track's `role` -- no more guessing/relabeling here.
              // (Previously this list used fixed instrument names like "Organ" /
              // "Violin" / "Flute" for the lead/pad/vocal roles, which was wrong
              // whenever the active style used a different instrument for that role.)
              const active = !!aiBandSelection[option.key];
              const icon = {
                bass:"🎸", piano:"🎹", rhythm:"🎸",
                lead:"🎺", pad:"🎻", drums:"🥁", vocal:"🎤",
              }[option.key] || "🎵";

              return (
                <button
                  key={option.key}
                  onClick={() => {
                    bandSelectionCustomizedRef.current = true;
                    setAiBandSelection(prev => ({ ...prev, [option.key]: !prev[option.key] }));
                  }}
                  style={{
                    borderRadius: 14, padding: "10px 6px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    background: active ? `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` : colors.surface,
                    border: `1.5px solid ${active ? colors.primary : colors.border}`,
                    color: active ? "white" : colors.text,
                    fontSize: 11, fontWeight: 700, textAlign: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
    </div>

    {/* ── AI Producer sliders + Generate ──────────────────────────────── */}
    <div className="jf-card" style={{ width: "100%", padding: 16, display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14 }}>
          {[
            { key:"energy",             label:"Energy",  value:aiProducerSettings.energy },
            { key:"vocalIntensity",     label:"Vocal",   value:aiProducerSettings.vocalIntensity },
            { key:"arrangementDensity", label:"Density", value:aiProducerSettings.arrangementDensity },
          ].map((ctrl) => (
            <div key={ctrl.key}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, fontWeight: 700, color:colors.text, marginBottom:4 }}>
                <span>{ctrl.label}</span><span style={{ color: colors.primary }}>{ctrl.value}</span>
              </div>
              <input type="range" min={0} max={100} value={ctrl.value}
                onChange={(e) => setAiProducerSettings(prev => ({ ...prev, [ctrl.key]: Number(e.target.value) }))}
                style={{ width:"100%", accentColor: colors.primary }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
        <Button variant="contained"
          fullWidth
          onClick={() => generateLocalBand(importedSong, bandStyle)}
          sx={{
            borderRadius:999, textTransform:"none", whiteSpace:"nowrap", fontWeight:700,
            background: `linear-gradient(135deg, ${colors.primary}, #A855F7)`,
            boxShadow: `0 4px 14px ${colors.primary}44`,
          }}
        >🤖 Generate Band</Button>

        <Button variant="outlined"
          onClick={() => {
            const fresh = buildDemoBand(bandStyle, aiBandSelection, aiProducerSettings, arrangementPreset);
            stopProgression();
            setTracks(fresh);
            setSelectedTrack(fresh[0]?.id ?? null);
            setTheoryMeta(fresh[0]?.theoryMeta || null);
            setImportError("Demo arrangement refreshed.");
            preWarmSamplers(fresh).catch(() => {});
          }}
          sx={{ borderRadius:999, textTransform:"none", whiteSpace:"nowrap", borderColor: colors.border, color: colors.text }}
        >🎛 Refresh</Button>
      </div>

    </div>

    {/* ── AI Feature Toolbar ─────────────────────────────────────────── */}
    <div className="jf-card" style={{ width: "100%", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="jf-hscroll">
        {/* Voice Input */}
        <Button
            variant={voiceRecording ? "contained" : "outlined"}
            size="small"
            onClick={handleVoiceRecord}
            disabled={voiceRecording}
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12,
                  backgroundColor: voiceRecording ? colors.danger : "transparent",
                  borderColor: colors.border, color: voiceRecording ? "white" : colors.text }}
        >
            {voiceRecording ? `🎙️ Listening (${voiceDuration}s)…` : "🎙️ Hum to Generate"}
        </Button>

        {/* Camera Scan */}
        <Button
            variant="outlined"
            size="small"
            onClick={handleOpenCamera}
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12,
                  borderColor: colors.border, color: colors.text }}
        >
            📷 Scan Chords
        </Button>

        {/* LLM toggle */}
        <Button
            variant={llmEnabled ? "contained" : "outlined"}
            size="small"
            onClick={() => setLlmEnabled((v) => !v)}
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12,
                  backgroundColor: llmEnabled ? "#6D4AFF" : "transparent",
                  borderColor: colors.border,
                  color: llmEnabled ? "white" : colors.text }}
        >
            {llmEnabled ? "🤖 AI On" : "🤖 AI Off"}
        </Button>

        {/* Live Jam */}
        <Button
            variant="contained"
            size="small"
            onClick={() => setJamPadOpen(true)}
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12,
                  backgroundColor: colors.accent }}
        >
            🎹 Live Jam
        </Button>
      </div>

      {/* Mood Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
            type="text"
            placeholder="Describe a vibe… e.g. rainy jazz café"
            value={moodText}
            onChange={(e) => setMoodText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleParseMood()}
            style={{
                flex:         1,
                minWidth:     0,
                padding:      "8px 12px",
                borderRadius: 999,
                border:       `1px solid ${colors.border}`,
                fontSize:     13,
                outline:      "none",
                background:   colors.surface,
                color:        colors.text,
            }}
        />
        <Button
            variant="outlined"
            size="small"
            onClick={handleParseMood}
            disabled={moodLoading || !moodText.trim()}
            sx={{ borderRadius: 999, textTransform: "none", fontSize: 12, flexShrink: 0,
                  borderColor: colors.border, color: colors.text }}
        >
            {moodLoading ? "…" : "🎨 Vibe"}
        </Button>
      </div>
    </div>

    {/* Voice result chip */}
    {voiceResult && (
        <div style={{
            width: "100%", maxWidth: 800,
            padding: "10px 16px", borderRadius: 12,
            background: "rgba(109,74,255,0.1)",
            border: `1px solid ${colors.primary}`,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
        }}>
            <span style={{ fontSize: 13, color: colors.primary, fontWeight: 700, flex: 1 }}>
                🎙️ {voiceResult.bpm ? `${voiceResult.bpm} BPM` : "?"} ·{" "}
                Key: {voiceResult.detectedKey || "unknown"} ·{" "}
                Energy: {Math.round(voiceResult.energy * 100)}% →{" "}
                <strong>{voiceResult.suggestedStyle}</strong>
            </span>
            <Button size="small" variant="contained"
                onClick={applyVoiceResult}
                sx={{ borderRadius: 999, textTransform: "none", fontSize: 11,
                      backgroundColor: colors.primary }}>
                Apply &amp; Generate
            </Button>
            <Button size="small" variant="text"
                onClick={() => setVoiceResult(null)}
                sx={{ textTransform: "none", fontSize: 11, color: colors.text }}>
                Dismiss
            </Button>
        </div>
    )}

    {/* Mood result chip */}
    {moodResult && (
        <div style={{
            width: "100%", maxWidth: 800,
            padding: "10px 16px", borderRadius: 12,
            background: moodResult.source === "llm" ? "rgba(0,184,148,0.1)" : "rgba(109,74,255,0.08)",
            border: `1px solid ${moodResult.source === "llm" ? "#00B894" : colors.border}`,
            fontSize: 13, color: colors.text, fontWeight: 600,
        }}>
            ✨ {moodResult.interpretationText}
        </div>
    )}

    {/* Camera Scanner Modal */}
    {cameraOpen && (
        <div style={{
            position: "fixed", inset: 0, zIndex: 900,
            background: "rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12,
            padding: 20,
        }}>
            <div style={{ color: "white", fontSize: 18, fontWeight: 800 }}>
                📷 Point at a chord chart
            </div>

            {/* Live video preview */}
            {!scanResult && (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                        width: "100%", maxWidth: 480,
                        borderRadius: 12,
                        border: "2px solid rgba(255,255,255,0.3)",
                    }}
                />
            )}

            {/* Scan result */}
            {scanResult && (
                <div style={{
                    background: "white", borderRadius: 14,
                    padding: 16, width: "100%", maxWidth: 480,
                }}>
                    <div style={{ fontWeight: 800, color: colors.text, marginBottom: 8 }}>
                        {scanResult.chords.length + scanResult.lowConfidence.length === 0
                            ? "No chords detected. Try again or type them manually."
                            : `Found ${scanResult.chords.length} chord${scanResult.chords.length !== 1 ? "s" : ""}:`
                        }
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                        {scanResult.chords.map((c) => (
                            <button key={c}
                                onClick={() => setConfirmedChords((prev) =>
                                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                                )}
                                style={{
                                    padding: "5px 12px", borderRadius: 999,
                                    border: `2px solid ${confirmedChords.includes(c) ? colors.primary : colors.border}`,
                                    background: confirmedChords.includes(c) ? `${colors.primary}22` : "white",
                                    fontWeight: 700, cursor: "pointer", fontSize: 14,
                                    color: colors.text,
                                }}
                            >{c}</button>
                        ))}
                        {scanResult.lowConfidence.map((c) => (
                            <button key={`lc-${c}`}
                                onClick={() => setConfirmedChords((prev) =>
                                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                                )}
                                style={{
                                    padding: "5px 12px", borderRadius: 999,
                                    border: `2px solid ${confirmedChords.includes(c) ? "#FDCB6E" : "#eee"}`,
                                    background: confirmedChords.includes(c) ? "#FDCB6E22" : "#fafafa",
                                    fontWeight: 600, cursor: "pointer", fontSize: 13,
                                    color: "#888", opacity: 0.85,
                                }}
                            >{c} ⚠️</button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="contained" size="small"
                            disabled={confirmedChords.length === 0}
                            onClick={handleImportScannedChords}
                            sx={{ borderRadius: 999, textTransform: "none",
                                  backgroundColor: colors.primary }}>
                            Import {confirmedChords.length} Chord{confirmedChords.length !== 1 ? "s" : ""}
                        </Button>
                        <Button variant="outlined" size="small"
                            onClick={() => { setScanResult(null); setConfirmedChords([]); }}
                            sx={{ borderRadius: 999, textTransform: "none" }}>
                            Retry
                        </Button>
                    </div>
                </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
                {!scanResult && (
                    <Button variant="contained" onClick={handleCaptureFrame}
                        disabled={cameraScanning}
                        sx={{ borderRadius: 999, textTransform: "none",
                              backgroundColor: colors.primary }}>
                        {cameraScanning ? "Scanning…" : "📸 Capture"}
                    </Button>
                )}
                <Button variant="outlined" onClick={handleCloseCamera}
                    sx={{ borderRadius: 999, textTransform: "none",
                          borderColor: "rgba(255,255,255,0.4)", color: "white" }}>
                    Cancel
                </Button>
            </div>
        </div>
    )}

    {/* Live Jam Pad */}
    {jamPadOpen && (
        <LiveJamPad
            tonic={voiceResult?.detectedKey || theoryMeta?.tonic || "C"}
            mode={theoryMeta?.mode || "major"}
            style={bandStyle}
            producerSettings={aiProducerSettings}
            arrangementPreset={arrangementPreset}
            bpm={Number(bpm) || 120}
            onRecordComplete={handleJamRecordComplete}
            onClose={() => setJamPadOpen(false)}
        />
    )}

    {importError && (
        <div
            style={{
                color: colors.danger,
                fontSize: 14
            }}
        >
            {importError}
        </div>
    )}

    {importedSong && (
      <div
        style={{
          width: "100%",
          maxWidth: 1000,
          background: "rgba(255,255,255,0.72)",
          border: `1px solid ${colors.border}`,
          borderRadius: 18,
          padding: 18,
          boxSizing: "border-box",
          boxShadow: "0 10px 30px rgba(109,74,255,0.08)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap"
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: colors.text,
              letterSpacing: 1,
              textTransform: "uppercase",
              opacity: 0.8
            }}
          >
            Live progression
          </div>

          <div
            style={{
              fontSize: 13,
              color: colors.text,
              opacity: 0.8,
              fontWeight: 600
            }}
          >
            {importedSong.title || "Imported Song"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          {importedSong.chords.slice(progressionIndex, progressionIndex + 10).map((chord, index) => (
            <div
              key={`${chord.name}-${index}-${progressionIndex}`}
              style={{
                minWidth: 72,
                textAlign: "center",
                padding: "8px 12px",
                borderRadius: 12,
                background: index === 0 ? colors.primary : index === 1 ? "#A29BFE" : colors.primaryLight,
                color: index === 0 ? "white" : colors.text,
                fontWeight: 800,
                fontSize: 12,
                border: `1px solid ${index === 0 ? colors.primary : colors.border}`,
                boxShadow: index === 0 ? "0 8px 20px rgba(109,74,255,0.18)" : "none"
              }}
            >
              {index === 0 ? "Now" : index === 1 ? "Next" : "Then"}
              <div style={{ fontSize: 13, marginTop: 4 }}>{chord.name}</div>
            </div>
          ))}
        </div>
      </div>
    )}



      {/* Add-track shortcut lives with the track list itself now -- the
          transport controls (play/pause/BPM/save/stop) moved to the sticky
          bottom bar below so they're always reachable, not buried mid-scroll
          and no longer overflowing narrow screens (see the bottom bar near
          the end of this component). */}
      <button
        onClick={addTrack}
        style={{
          width: "100%",
          maxWidth: 640,
          border: `2px dashed ${colors.border}`,
          background: colors.primaryLight,
          color: colors.primary,
          borderRadius: 14,
          padding: "10px 14px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add track
      </button>

      {/* ── Intelligence Banner ─────────────────────────────────────────── */}
      {theoryMeta && (
        <div style={{
          width: "100%", maxWidth: 800,
          background: "rgba(109,74,255,0.07)",
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          padding: "12px 18px",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}>
          {/* Key + mode */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 999,
            background: theoryMeta.mode === "minor"
              ? "rgba(255,107,138,0.12)"
              : "rgba(109,74,255,0.12)",
            border: `1px solid ${theoryMeta.mode === "minor" ? colors.danger : colors.primary}`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: theoryMeta.mode === "minor" ? colors.danger : colors.primary }}>
              🎵 {theoryMeta.tonic} {theoryMeta.mode}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              color: theoryMeta.mode === "minor" ? colors.danger : colors.primary,
              opacity: 0.75, textTransform: "uppercase",
            }}>
              {theoryMeta.confidencePct}% match
            </span>
          </div>

          {/* Progression pattern */}
          {theoryMeta.pattern && (
            <div style={{
              padding: "4px 12px", borderRadius: 999,
              background: "rgba(0,184,148,0.10)",
              border: "1px solid #00B894",
              fontSize: 12, fontWeight: 700, color: "#00897B",
            }}>
              📐 {theoryMeta.pattern}
            </div>
          )}

          {/* Modulation */}
          {theoryMeta.modulation && (
            <div style={{
              padding: "4px 12px", borderRadius: 999,
              background: "rgba(253,203,110,0.15)",
              border: "1px solid #FDCB6E",
              fontSize: 12, fontWeight: 700, color: "#B7791F",
            }}>
              🔀 {theoryMeta.modulation}
            </div>
          )}

          {/* Dismiss */}
          <button
            onClick={() => setTheoryMeta(null)}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              cursor: "pointer", fontSize: 14, opacity: 0.4, color: colors.text,
              padding: "2px 6px",
            }}
            aria-label="Dismiss intelligence banner"
          >✕</button>
        </div>
      )}

      {isPlaying && currentSection && (
        <div
            style={{
                width: "100%",
                maxWidth: 800,
                padding: "16px 20px",
                borderRadius: 12,
                background: currentSection === "Chorus"
                    ? "rgba(109,74,255,0.22)"
                    : currentSection === "Bridge"
                        ? "rgba(255,107,138,0.16)"
                        : "rgba(109,74,255,0.12)",
                border: `1px solid ${
                    currentSection === "Chorus"
                        ? colors.primary
                        : currentSection === "Bridge"
                            ? colors.danger
                            : colors.primary
                }`,
                color: currentSection === "Bridge" ? colors.danger : colors.primary,
                textAlign: "center",
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: "uppercase",
                transition: "background 0.4s ease, border-color 0.4s ease, color 0.4s ease",
            }}
        >
            Now playing: {currentSection}
        </div>
      )}

      {savedJams.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 1000,
            background: "rgba(255,255,255,0.72)",
            border: `1px solid ${colors.border}`,
            borderRadius: 18,
            padding: 18,
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1,
              color: colors.text,
              textTransform: "uppercase",
              marginBottom: 12,
              opacity: 0.8
            }}
          >
            Saved jams
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {savedJams.map((jam) => (
              <button
                key={jam.id || jam.name}
                type="button"
                onClick={() => restoreSavedJam(jam)}
                style={{
                  border: `1px solid ${colors.border}`,
                  background: colors.card,
                  color: colors.text,
                  borderRadius: 12,
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  minWidth: 150,
                  textAlign: "left"
                }}
              >
                <div>{jam.name || "Untitled Jam"}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  {jam.bpm || 120} BPM
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chords */}

        <div
        style={{
        display:"flex",
        flexDirection:"column",
        gap:14,
        width: "100%",
        position:"relative",
        }}
        >

        <div className="jf-hscroll" style={{ marginBottom: 2 }}>
          {tracks.map((track) => (
            <button
              key={`band-${track.id}`}
              onClick={() => setSelectedTrack(track.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: selectedTrack === track.id ? (track.color || colors.primary) : colors.surface,
                color: selectedTrack === track.id ? "white" : colors.text,
                fontSize: 12,
                fontWeight: 700,
                border: `1.5px solid ${track.color || colors.primary}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {track.name}
            </button>
          ))}
        </div>

        {
        tracks.map(track=>(

        <div
        key={track.id}
        className="jf-card"
        onClick={()=>{ setSelectedTrack(track.id) }}
        style={{
            width: "100%",
            overflow: "hidden",
            border: selectedTrack === track.id ? `1.5px solid ${track.color}` : `1px solid ${colors.border}`,
            boxShadow: selectedTrack === track.id ? `0 8px 24px ${track.color}33` : "var(--jf-shadow-card)",
        }}
        >
        <div style={{ height: 4, background: track.color }} />
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Header: name + reserved tag + mute/solo/loop */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div
            onClick={(e)=>{

                e.stopPropagation();

                setMenuTrackId(track.id);
                setTrackMenuAnchor(e.currentTarget);

            }}

            style={{
                flex: 1,
                minWidth: 0,
                fontWeight:700,
                fontFamily: colors.fontDisplay,
                fontSize: 14,
                color:colors.text,
                cursor:"pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
            }}

            >
            {track.name}
            {track.reservedForUser && (
                <div style={{
                    fontSize: 10,
                    color: colors.primary,
                    marginTop: 2,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    whiteSpace: "normal",
                }}>
                    Reserved for you
                </div>
            )}
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {/* Mute */}
        <button
            style={{
                width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer",
                background: track.muted ? "#C7C2D6" : colors.primary,
                color: "white", fontSize: 14,
            }}
            onClick={(e) => {
                e.stopPropagation();
                toggleMuteTrack(track.id);
            }}
            aria-label={track.muted ? "Unmute" : "Mute"}
        >
            {track.muted ? "🔇" : "🔊"}
        </button>

        <button
            style={{
                width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                background: track.solo ? colors.accent : "transparent",
                border: `1.5px solid ${track.solo ? colors.accent : colors.border}`,
                color: track.solo ? "white" : colors.text,
                fontSize: 10, fontWeight: 800,
            }}
            onClick={(e) => {
                e.stopPropagation();
                toggleSoloTrack(track.id);
            }}
        >
            S
        </button>

        {/* Loop */}
        <button
            style={{
                width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                border: `1.5px solid ${track.loop === false ? "#ccc" : colors.border}`,
                background: "transparent",
                color: track.loop === false ? "#999" : colors.primary,
                display: "flex", alignItems: "center", justifyContent: "center",
            }}

            onClick={(e) => {
                e.stopPropagation();
                toggleTrackLoop(track.id);
            }}
        >
            <span
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
            >
                <RepeatIcon fontSize="small" />

                {track.loop === false && (
                    <span
                        style={{
                            position: "absolute",
                            width: 24,
                            height: 2,
                            background: "#999",
                            transform: "rotate(-45deg)",
                            borderRadius: 2
                        }}
                    />
                )}
            </span>
        </button>
        </div>
        </div>

        {/* Instrument + volume */}
        <div
            style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                opacity: track.reservedForUser ? 0.4 : 1,
                pointerEvents: track.reservedForUser ? "none" : "auto"
            }}
        >
            <TextField
                select
                size="small"
                value={track.instrument || "acoustic_grand_piano"}
                onChange={(e) => {
                    e.stopPropagation();
                    changeTrackInstrument(track.id, e.target.value);
                }}
                sx={{
                    flex: 1,
                    minWidth: 0,
                    backgroundColor: colors.surface,
                    borderRadius: 1
                }}
            >
                {instrumentCatalog.map(inst => (
                    <MenuItem
                        key={inst.value}
                        value={inst.value}
                        disabled={inst.status === "planned"}
                    >
                        {inst.label}
                        {inst.status === "planned" ? " (next)" : ""}
                    </MenuItem>
                ))}
            </TextField>

            <div style={{ display: "flex", alignItems: "center", gap: 6, width: 96, flexShrink: 0 }}>
                <span style={{ fontSize: 13, opacity: 0.6 }}>🔈</span>
                <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.volume}
                    onChange={(e, value) => {
                        e.stopPropagation();
                        changeTrackVolume(track.id, value);
                    }}
                    sx={{
                        color: colors.primary
                    }}
                />
            </div>
        </div>

        {Array.isArray(track.sectionLabels) && track.sectionLabels.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {track.sectionLabels.map((section) => (
                    <span key={`${track.id}-${section}`} style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "3px 7px",
                        borderRadius: 999,
                        background: section === "Chorus" ? "rgba(109,74,255,0.16)" : "rgba(16,24,40,0.06)",
                        color: section === "Chorus" ? colors.primary : colors.text,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                    }}>
                        {section}
                    </span>
                ))}
            </div>
        )}

        <div
            style={{
            display:"flex",
            gap:10,
            position:"relative",
            overflowX:"auto",
            paddingBottom: 4,
            WebkitOverflowScrolling: "touch"
            }}
            >

            <div
                style={{
                    position:"absolute",
                    left:`${
                        (
                            (trackPlayheads[track.id] ?? 0) %
                            Math.max(track.chords.length, 1)
                        ) * 80
                        + (isPlaying ? 80 : 0)
                    }px`,
                    top:-5,
                    height:80,
                    width:3,
                    background:colors.primary,
                    transition:`left ${60000 / Number(bpm)}ms linear`,
                    zIndex:5
                }}
            />



        <DndContext

            sensors={sensors}

            collisionDetection={closestCenter}

            onDragEnd={(event)=>
                handleDragEnd(track.id,event)
            }

        >


        <SortableContext

            items={
                track.chords.map(
                    (_,i)=>`${track.id}-${i}`
                )
            }

            strategy={
                horizontalListSortingStrategy
            }

        >


        {
        track.chords.map((c,i)=>(


        <SortableChord
            key={`${track.id}-${i}`}
            chord={c}
            index={i}
            track={track}
            activeChords={activeChords}
            colors={colors}

            onEdit={(index) => {

                setSelectedChord({
                    trackId: track.id,
                    index
                });

                const chord = track.chords[index];

                setEditChord({
                    ...chord,
                    octave: String(chord.octave),
                    inversion: String(chord.inversion),
                    beats: String(chord.beats),
                    repeat: String(chord.repeat ?? 1),
                    wait: String(chord.wait),
                    pattern: createPattern(
                        chord.beats,
                        chord.pattern
                    )
                });

            }}

            onDuplicate={(index) => {
                duplicateChordInTrack(
                    track.id,
                    index
                );
            }}

            onDelete={(index) => {
                deleteChordFromTrack(
                    track.id,
                    index
                );
            }}
        />



        ))
        }


        </SortableContext>


        </DndContext>


        <div
        onClick={(e)=>{
        e.stopPropagation();
        setEditingTrack(track.id);
        setNewChord({
            type: "chord",
            name: "",
            octave: "4",
            inversion: "0",
            beats: "1",
            repeat: "1",
            instrument: track.instrument || "acoustic_grand_piano",
            wait: "0",
            speed: "1",
            pattern: [true]
        });

        setOpen(true);
        }}
        style={{
        width:70,
        height:70,
        border:`2px dashed ${colors.border}`,
        borderRadius:12,
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        cursor:"pointer"
        }}
        >
        +
        </div>

        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
            onClick={(e)=>{
            e.stopPropagation();
            deleteTrack(track.id);
            }}
            style={{
                background: "none", border: "none", cursor: "pointer",
                color: colors.textSoft, fontSize: 11, fontWeight: 600,
                padding: "4px 6px",
            }}
            >
            Delete track
            </button>
        </div>

        </div>
        </div>

        ))

        }


        </div>


    <Dialog
        open={tempoDialogOpen}
        onClose={() => setTempoDialogOpen(false)}
    >
        <DialogTitle>Tempo Settings</DialogTitle>



        <DialogContent
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                pt: 2
            }}
        >
            <TextField
                label="BPM"
                type="number"
                value={bpm}
                inputProps={{
                    min: 40,
                    max: 240
                }}
                onChange={(e) =>
                    setBpm(e.target.value)
                
                }
            />

            <TextField
                label="Beats per Bar"
                type="number"
                value={beatsPerBar}
                inputProps={{
                    min: 1,
                    max: 12
                }}
                onChange={(e) =>
                    setBeatsPerBar(e.target.value)
                }
            />
        </DialogContent>

        <DialogActions>

            <Button onClick={() => setTempoDialogOpen(false)}>
                Cancel
            </Button>

            <Button
                variant="contained"
                onClick={saveTempo}
            >
                Save
            </Button>

        </DialogActions>

    </Dialog>


    <Dialog
        open={selectedChord !== null}
        onClose={() => setSelectedChord(null)}
        maxWidth="sm"
        fullWidth
    >

    <DialogTitle>
        Edit {editChord.type === "note" ? "Note" : "Chord"}
    </DialogTitle>

    <Tabs
        value={editChord.type === "chord" ? 0 : 1}
        onChange={(e, value) => {

            const newType =
                value === 0
                    ? "chord"
                    : "note";

            setEditChord(prev => ({
                ...prev,
                type: newType,
                inversion:
                    newType === "note"
                        ? "0"
                        : prev.inversion
            }));

        }}
        centered
    >
        <Tab label="Edit Chord" />
        <Tab label="Edit Note" />
    </Tabs>

    <DialogContent>


            <Grid container spacing={2} sx={{ mt: 1 }}>

                <Grid size={12}>
                    <TextField
                        fullWidth
                        label={editChord.type === "note" ? "Note" : "Chord Name"}
                        value={editChord.name}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                name: e.target.value
                            })
                        }
                    />
                </Grid>

                <Grid size={6}>
                    <TextField
                        fullWidth
                        label="Octave"
                        type="number"
                        value={editChord.octave}
                        inputProps={{
                            min:1,
                            max:8,
                            inputMode:"numeric"
                        }}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                octave:e.target.value
                            })
                        }
                        onBlur={()=>
                            setEditChord({
                                ...editChord,
                                octave:String(
                                    Math.min(
                                        8,
                                        Math.max(
                                            1,
                                            Number(editChord.octave) || 1
                                        )
                                    )
                                )
                            })
                        }
                    />
                </Grid>

                {editChord.type === "chord" && (
                <Grid size={6}>
                    <TextField
                        fullWidth
                        label="Inversion"
                        type="number"
                        value={editChord.inversion}
                        inputProps={{
                            min:0,
                            max:2,
                            inputMode:"numeric"
                        }}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                inversion:e.target.value
                            })
                        }
                        onBlur={()=>
                            setEditChord({
                                ...editChord,
                                inversion:String(
                                    Math.min(
                                        2,
                                        Math.max(
                                            0,
                                            Number(editChord.inversion) || 0
                                        )
                                    )
                                )
                            })
                        }
                    />
                </Grid>
                )}


                <Grid size={6}>

                    <TextField
                        type="number"
                        fullWidth
                        label="Beats"
                        inputProps={{
                            min: 1,
                            max: 16,
                            step: 1
                        }}
                        value={editChord.beats}

                        onChange={(e) => {

                            const beats = e.target.value;

                            setEditChord(prev => ({
                                ...prev,
                                beats,
                                pattern: createPattern(
                                    beats,
                                    prev.pattern
                                )
                            }));

                        }}

                        onBlur={() => {

                            const beats = Math.min(
                                16,
                                Math.max(
                                    1,
                                    Number(editChord.beats) || 1
                                )
                            );

                            setEditChord(prev => ({
                                ...prev,
                                beats: String(beats),
                                pattern: createPattern(
                                    beats,
                                    prev.pattern
                                )
                            }));

                        }}
                    />

                    {/* Beat Pattern */}

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 10,
                            marginTop: 12,
                            minHeight: 20
                        }}
                    >

                        {editChord.pattern.map((active, index) => (

                            <div
                                key={index}

                                onClick={() => {

                                    setEditChord(prev => ({
                                        ...prev,

                                        pattern: prev.pattern.map(
                                            (value, i) =>
                                                i === index
                                                    ? !value
                                                    : value
                                        )
                                    }));

                                }}

                                style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    backgroundColor:
                                        active
                                            ? colors.primary
                                            : "white",

                                    border: `2px solid ${
                                        active
                                            ? colors.primary
                                            : colors.border
                                    }`,

                                    cursor: "pointer",

                                    boxSizing: "border-box",

                                    transition:
                                        "all 0.15s ease"
                                }}
                            />

                        ))}

                    </div>

                </Grid>


                <Grid size={12}>

                    <div
                        style={{
                            marginTop: 10,
                            padding: "0 10px"
                        }}
                    >

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                color: colors.text,
                                fontWeight: 600,
                                marginBottom: 4
                            }}
                        >
                            <span>Speed</span>

                            <span>
                                {Number(editChord.speed).toFixed(2)}
                            </span>
                        </div>

                        <Slider
                            value={Number(editChord.speed)}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(e, value) =>
                                setEditChord(prev => ({
                                    ...prev,
                                    speed: value
                                }))
                            }
                            sx={{
                                color: colors.primary
                            }}
                        />

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 11,
                                opacity: 0.6,
                                color: colors.text
                            }}
                        >
                            <span>Bass</span>
                            <span>Arpeggio</span>
                            <span>Full</span>
                        </div>

                    </div>

                </Grid>

                <Grid size={6}>
                    <TextField
                        fullWidth
                        label="Repeat"
                        type="number"
                        value={editChord.repeat}
                        inputProps={{
                            min: 1,
                            max: 16,
                            step: 1,
                            inputMode: "numeric"
                        }}
                        onChange={(e) =>
                            setEditChord({
                                ...editChord,
                                repeat: e.target.value
                            })
                        }
                        onBlur={() =>
                            setEditChord({
                                ...editChord,
                                repeat: String(
                                    Math.min(
                                        16,
                                        Math.max(
                                            1,
                                            Number(editChord.repeat) || 1
                                        )
                                    )
                                )
                            })
                        }
                    />
                </Grid>

                <Grid size={12}>
                    <TextField
                        select
                        fullWidth
                        label="Instrument"
                        value={editChord.instrument}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                instrument: e.target.value
                            })
                        }
                    >
                        {instruments.map(inst => (
                            <MenuItem
                                key={inst}
                                value={inst}
                            >
                                {inst.replaceAll("_", " ")}
                            </MenuItem>
                        ))}
                    </TextField>
                </Grid>

                <Grid size={12}>
                    <TextField
                        type="number"
                        fullWidth
                        label="Wait Time"
                        value={editChord.wait}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                wait: Number(e.target.value)
                            })
                        }
                    />
                </Grid>

            </Grid>

        </DialogContent>

        <DialogActions>

            <Button
                color="error"
                onClick={() => {

                    deleteChordFromTrack(
                        selectedChord.trackId,
                        selectedChord.index
                    );

                    setSelectedChord(null);

                }}
            >
                Delete
            </Button>

            <Button
                variant="contained"
                onClick={editChordData}
            >
                Save
            </Button>

        </DialogActions>

    </Dialog>





      {/* Dialog */}


<Dialog
    open={open}
    onClose={() => setOpen(false)}
    maxWidth="sm"
    fullWidth
>
    <DialogTitle>
        {addTab === 0 ? "Add Chord" : "Add Note"}
    </DialogTitle>

        <Tabs
            value={addTab}
            onChange={(e, value) => {
                setAddTab(value);

                setNewChord(prev => ({
                    ...prev,
                    type: value === 0 ? "chord" : "note",
                    inversion: value === 0
                        ? prev.inversion
                        : "0"
                }));
            }}
            centered
        >
            <Tab label="Add Chord" />
            <Tab label="Add Note" />
        </Tabs>

    <DialogContent>

        <Grid container spacing={2} sx={{ mt: 1 }}>

            <Grid size={12}>
                <TextField
                    fullWidth
                    label={addTab === 0 ? "Chord Name" : "Note"}
                    value={newChord.name}
                    onChange={(e) =>
                        setNewChord({
                            ...newChord,
                            name: e.target.value
                        })
                    }
                    placeholder={
                        addTab === 0
                            ? "Cm7, F#, Bbmaj7..."
                            : "C, C#, D, Eb..."
                    }
                />
            </Grid>

            <Grid size={6}>
                <TextField
                    type="number"
                    fullWidth
                    label="Octave"
                    inputProps={{
                        min:1,
                        max:8,
                        step:1
                    }}
                    value={newChord.octave}
                    onChange={(e)=>
                        setNewChord({
                            ...newChord,
                            octave:e.target.value
                        })
                    }
                    onBlur={() =>
                        setNewChord({
                            ...newChord,
                            octave:String(
                                Math.min(
                                    8,
                                    Math.max(
                                        1,
                                        Number(newChord.octave) || 1
                                    )
                                )
                            )
                        })
                    }
                />
            </Grid>


            <Grid size={6}>
                <TextField
                    type="number"
                    fullWidth
                    label="Inversion"
                    inputProps={{
                        min:0,
                        max:2,
                        step:1
                    }}
                    value={newChord.inversion}
                    onChange={(e)=>
                        setNewChord({
                            ...newChord,
                            inversion:e.target.value
                        })
                    }
                    onBlur={() =>
                        setNewChord({
                            ...newChord,
                            inversion:String(
                                Math.min(
                                    2,
                                    Math.max(
                                        0,
                                        Number(newChord.inversion) || 0
                                    )
                                )
                            )
                        })
                    }
                />
            </Grid>


            <Grid size={6}>

                <TextField
                    type="number"
                    fullWidth
                    label="Beats"
                    inputProps={{
                        min: 1,
                        max: 16,
                        step: 1
                    }}
                    value={newChord.beats}

                    onChange={(e) => {

                        const beats = e.target.value;

                        setNewChord(prev => ({
                            ...prev,
                            beats,
                            pattern: createPattern(
                                beats,
                                prev.pattern
                            )
                        }));

                    }}

                    onBlur={() => {

                        const beats = Math.min(
                            16,
                            Math.max(
                                1,
                                Number(newChord.beats) || 1
                            )
                        );

                        setNewChord(prev => ({
                            ...prev,
                            beats: String(beats),
                            pattern: createPattern(
                                beats,
                                prev.pattern
                            )
                        }));

                    }}
                />

                {/* Beat Pattern */}

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        marginTop: 12,
                        minHeight: 20
                    }}
                >

                    {newChord.pattern.map((active, index) => (

                        <div
                            key={index}

                            onClick={() => {

                                setNewChord(prev => ({
                                    ...prev,

                                    pattern: prev.pattern.map(
                                        (value, i) =>
                                            i === index
                                                ? !value
                                                : value
                                    )
                                }));

                            }}

                            style={{
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                backgroundColor:
                                    active
                                        ? colors.primary
                                        : "white",

                                border: `2px solid ${
                                    active
                                        ? colors.primary
                                        : colors.border
                                }`,

                                cursor: "pointer",

                                boxSizing: "border-box",

                                transition:
                                    "all 0.15s ease"
                            }}
                        />

                    ))}

                </div>

            </Grid>

                <Grid size={12}>

                    <div
                        style={{
                            marginTop: 10,
                            padding: "0 10px"
                        }}
                    >

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                color: colors.text,
                                fontWeight: 600,
                                marginBottom: 4
                            }}
                        >
                            <span>Speed</span>

                            <span>
                                {Number(newChord.speed).toFixed(2)}
                            </span>
                        </div>

                        <Slider
                            value={Number(newChord.speed)}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(e, value) =>
                                setNewChord(prev => ({
                                    ...prev,
                                    speed: value
                                }))
                            }
                            sx={{
                                color: colors.primary
                            }}
                        />

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 11,
                                opacity: 0.6,
                                color: colors.text
                            }}
                        >
                            <span>Bass</span>
                            <span>Arpeggio</span>
                            <span>Full</span>
                        </div>

                    </div>

                </Grid>

            <Grid size={6}>
                <TextField
                    type="number"
                    fullWidth
                    label="Repeat"
                    inputProps={{
                        min: 1,
                        max: 16,
                        step: 1
                    }}
                    value={newChord.repeat}
                    onChange={(e) =>
                        setNewChord({
                            ...newChord,
                            repeat: e.target.value
                        })
                    }
                    onBlur={() =>
                        setNewChord({
                            ...newChord,
                            repeat: String(
                                Math.min(
                                    16,
                                    Math.max(
                                        1,
                                        Number(newChord.repeat) || 1
                                    )
                                )
                            )
                        })
                    }
                />
            </Grid>

            <Grid size={12}>
                <TextField
                    select
                    fullWidth
                    label="Instrument"
                    value={newChord.instrument}
                    onChange={(e)=>
                        setNewChord({
                            ...newChord,
                            instrument:e.target.value
                        })
                    }
                >
                    {instrumentCatalog.map(inst => (
                        <MenuItem
                            key={inst.value}
                            value={inst.value}
                            disabled={inst.status === "planned"}
                        >
                            {inst.label}
                            {inst.status === "planned" ? " (next)" : ""}
                        </MenuItem>
                    ))}
                </TextField>
            </Grid>

            <Grid size={12}>
                <TextField
                    type="number"
                    fullWidth
                    label="Wait Time (seconds)"
                    inputProps={{
                        min: 0,
                        max: 0.9,
                        step: 0.05,
                    }}
                    value={newChord.wait}
                    onChange={(e) =>
                        setNewChord({
                            ...newChord,
                            wait: e.target.value
                        })
                    }
                    onBlur={() =>
                        setNewChord({
                            ...newChord,
                            wait: Math.min(
                                0.9,
                                Math.max(0, Number(newChord.wait))
                            )
                        })
                    }
                />
            </Grid>

        </Grid>

    </DialogContent>

    <DialogActions>

        <Button
            onClick={()=>{
                setOpen(false);
                setNewChord({
                    name:"",
                    octave:"4",
                    inversion: "0",
                    beats:"1",
                    repeat: "1",
                    instrument:"acoustic_grand_piano",
                    wait:"0",
                    speed: "1",
                    pattern: [true]
                });
            }}
        >
            Cancel
        </Button>

        <Button
            variant="contained"
            onClick={()=>{
                addChordToTrack();
                setOpen(false);
            }}
        >
            {addTab === 0 ? "Add Chord" : "Add Note"}
        </Button>

    </DialogActions>
</Dialog>

<Dialog
    open={renameDialogOpen}
    onClose={()=>{
        setRenameDialogOpen(false);
    }}
>

    <DialogTitle>
        Rename Track
    </DialogTitle>


    <DialogContent>

        <TextField
            autoFocus
            fullWidth
            label="Track Name"
            value={renameTrackName}
            onChange={(e)=>
                setRenameTrackName(e.target.value)
            }
            sx={{
                mt:1
            }}
        />

    </DialogContent>


    <DialogActions>

        <Button
            onClick={()=>{
                setRenameDialogOpen(false);
            }}
        >
            Cancel
        </Button>


        <Button
            variant="contained"
            onClick={renameTrack}
        >
            Save
        </Button>

    </DialogActions>

</Dialog>



<Menu
    anchorEl={trackMenuAnchor}
    open={Boolean(trackMenuAnchor)}
    onClose={()=>{
        setTrackMenuAnchor(null);
        setMenuTrackId(null);
    }}
>

<MenuItem
    onClick={()=>{

        const track = tracks.find(
            t => t.id === menuTrackId
        );

        setRenameTrackName(
            track?.name || ""
        );

        setRenameDialogOpen(true);

        setTrackMenuAnchor(null);

    }}
>
    Rename Track
</MenuItem>

<MenuItem
    onClick={()=>{

        duplicateTrack(menuTrackId);

        setTrackMenuAnchor(null);
        setMenuTrackId(null);

    }}
>
    Duplicate Track
</MenuItem>


<MenuItem
    onClick={()=>{

        deleteTrack(menuTrackId);

        setTrackMenuAnchor(null);
        setMenuTrackId(null);

    }}
>
    Delete Track
</MenuItem>


</Menu>

    </div>
    {/* end scrollable content column */}

    {/* ── Sticky bottom transport bar ─────────────────────────────────────
        Play/Pause, BPM, Save, Stop used to live inline mid-scroll in a
        non-wrapping flex row -- on a real phone width that row ran off the
        right edge (Save/Live Jam got clipped). Pinning it to the bottom as
        a compact icon bar keeps it always reachable and always fits. */}
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: `1px solid ${colors.border}`,
        boxShadow: "0 -10px 28px rgba(124,58,237,0.14)",
      }}
    >
      {!isPlaying ? (
        <button
          onClick={startPlayback}
          disabled={!tracks.some(track => Array.isArray(track.chords) && track.chords.length > 0)}
          style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
            color: "white", fontSize: 20,
            boxShadow: `0 6px 16px ${colors.accent}55`,
            opacity: !tracks.some(track => Array.isArray(track.chords) && track.chords.length > 0) ? 0.4 : 1,
          }}
          aria-label="Play"
        >▶</button>
      ) : (
        <button
          onClick={pauseProgression}
          style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            border: "none", cursor: "pointer",
            background: colors.primary, color: "white", fontSize: 20,
            boxShadow: `0 6px 16px ${colors.primary}55`,
          }}
          aria-label="Pause"
        >⏸</button>
      )}

      <button
        onClick={stopProgression}
        style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          border: "none", cursor: "pointer",
          background: colors.danger, color: "white", fontSize: 15,
        }}
        aria-label="Stop"
      >■</button>

      <button
        onClick={() => setTempoDialogOpen(true)}
        style={{
          height: 40, borderRadius: 999, flexShrink: 0,
          border: `1px solid ${colors.border}`, background: colors.surface,
          color: colors.text, fontWeight: 700, fontSize: 13, padding: "0 12px",
          cursor: "pointer",
        }}
      >♩ {bpm}</button>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {jamNameEditorOpen ? (
          <TextField
            size="small"
            autoFocus
            value={jamName}
            onChange={(event) => setJamName(event.target.value)}
            onBlur={() => setJamNameEditorOpen(false)}
            onKeyDown={(e) => e.key === "Enter" && setJamNameEditorOpen(false)}
            sx={{ width: "100%" }}
          />
        ) : (
          <button
            onClick={() => setJamNameEditorOpen(true)}
            style={{
              width: "100%", textAlign: "left", background: "none", border: "none",
              cursor: "pointer", color: colors.textSoft, fontSize: 12, fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: 0,
            }}
          >✎ {jamName || "Name this jam"}</button>
        )}
      </div>

      <button
        onClick={saveCurrentJam}
        disabled={savingJam || tracks.every(track => track.chords.length === 0)}
        style={{
          height: 40, borderRadius: 999, flexShrink: 0,
          border: "none", cursor: "pointer",
          background: colors.primary, color: "white", fontWeight: 700, fontSize: 13,
          padding: "0 16px",
          opacity: (savingJam || tracks.every(track => track.chords.length === 0)) ? 0.5 : 1,
        }}
      >{savingJam ? "Saving…" : "Save"}</button>
    </div>

    </div>

  );

}


export default App;