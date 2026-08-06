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
  Menu
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



import {
    chordToMidi
} from "./chords";

import {
    unlockAudio,
    playChord,
    stopAllNotes,
    updateTrackVolume as updateAudioTrackVolume

} from "./audio";


const instruments = [
    "acoustic_grand_piano",
    "electric_grand_piano",
    "church_organ",
    "finger_bass",
    "rock_guitar"
];



function SortableChord({
    chord,
    index,
    track,
    activeChords,
    colors,
    onEdit
}) {

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition
    } = useSortable({
        id: `${track.id}-${index}`
    });


    const active = activeChords.includes(
        `${track.id}-${chord.name}`
    );


    const style = {

        transform: CSS.Transform.toString(transform),

        transition,

        width:70,
        height:70,

        background: active
            ? colors.primary
            : colors.card,

        border:`2px solid ${
            active
                ? colors.primary
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
            ? "0 0 18px rgba(109,74,255,0.7)"
            : "0 2px 8px rgba(0,0,0,0.05)",

        transition:"all 0.15s ease",

        cursor:"grab",
        userSelect:"none",
        touchAction:"none",
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
                onPointerDown={(e)=>{
                    e.stopPropagation();
                }}

                size="small"

                onClick={(e)=>{

                    e.stopPropagation();

                    onEdit(index);

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


            <div
                style={{
                    fontSize:18,
                    fontWeight:700,
                    color:active
                        ? "white"
                        : colors.text
                }}
            >

                {chord.name}

            </div>


        </div>

    );

}


function App() {


    // render
    const API_URL = "https://jammify-3.onrender.com";
    
    const colors = {
    background: "#F7F5FF",
    primary: "#6D4AFF",
    primaryLight: "#EDE7FF",
    card: "#FFFFFF",
    border: "#D8CCFF",
    text: "#372580",
    danger: "#FF6B8A",
  };

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
            distance: 5
        }
    }),

    useSensor(TouchSensor, {
        activationConstraint: {
            delay: 150,
            tolerance: 5
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


  const [editingTrack, setEditingTrack] = useState(null);
  const [chordInput, setChordInput] = useState("");
  
  const [selectedChord, setSelectedChord] = useState(null);
  const [editChord, setEditChord] = useState({
    name: "",
    octave: "4",
    beats: "1",
    instrument: "acoustic_grand_piano",
    wait: "0"
    });

    
const handleDragEnd = (trackId, event)=>{

    const {
        active,
        over
    } = event;


    if(!over) return;


    if(active.id === over.id)
        return;


    setTracks(prev =>

        prev.map(track=>{


            if(track.id !== trackId)
                return track;


            const oldIndex =
                Number(active.id.split("-")[1]);


            const newIndex =
                Number(over.id.split("-")[1]);


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
  name: "",
  octave: "4",
  beats: "1",
  instrument: "acoustic_grand_piano",
  wait: "0"
    });

  const [activeChords, setActiveChords] = useState([]);

  const [mode, setMode] = useState("normal");
  const modeRef = useRef("normal");

  const [playhead, setPlayhead] = useState(0);
  

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



const addTrack = () => {

    setTracks(prev => [
        ...prev,
        {
            id: Date.now(),
            name: `Track ${prev.length + 1}`,
            chords: [],
            muted: false,
            volume: 0.8,
            color: trackColors[prev.length % trackColors.length]
        }
    ]);

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
      t => t.id !== id
    );

    if (remainingTracks.length === 0) {
      playingRef.current = false;
      pausedRef.current = false;
      clearTimeout(timerRef.current);
      setIsPlaying(false);
    }

    return remainingTracks;

  });

  playheadRef.current = 0;
  setPlayhead(0);

};


const toggleMuteTrack = (id) => {

  setTracks(prevTracks =>
    prevTracks.map(track =>
      track.id === id
        ? {
            ...track,
            muted: !track.muted
          }
        : track
    )
  );

};


const addChordToTrack = () => {

  if (!newChord.name.trim()) return;

  setTracks(
    tracks.map(track =>
      track.id === editingTrack
        ? {
            ...track,
            chords: [
              ...track.chords,
              {
                ...newChord,

                // convert back to numbers
                octave: Number(newChord.octave),
                beats: Number(newChord.beats),
                wait: Number(newChord.wait)
              }
            ]
          }
        : track
    )
  );


  setNewChord({
    name: "",
    octave: "4",
    beats: "1",
    instrument: "acoustic_grand_piano",
    wait: "0"
  });
};


const deleteChordFromTrack = (trackId, chordIndex) => {

  setTracks(
    tracks.map(track =>
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



const editChordData = () => {

    if (!editChord.name.trim()) return;

    setTracks(
        tracks.map(track =>
            track.id === selectedChord.trackId
                ? {
                    ...track,
                    chords: track.chords.map((chord, index) =>
                        index === selectedChord.index
                            ? {
                                ...editChord,

                                // convert strings back to numbers
                                octave: Number(editChord.octave),
                                beats: Number(editChord.beats),
                                wait: Number(editChord.wait)
                            }
                            : chord
                    )
                }
                : track
        )
    );

    setSelectedChord(null);

    setEditChord({
        name: "",
        octave: "4",
        beats: "1",
        instrument: "acoustic_grand_piano",
        wait: "0"
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

    // await fetch("http://localhost:8000/tempo", {
    await fetch(`${API_URL}/tempo`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            bpm: finalBpm,
            beats_per_bar: finalBeats
        })
    });

    setTempoDialogOpen(false);
};



const playStep = async (chords) => {

    setActiveChords(
        chords.map(chord => `${chord.trackId}-${chord.name}`)
    );

    await Promise.all(
        chords.map(async chord => {

            const midiNotes =
                chordToMidi(
                    chord.name,
                    chord.octave
                );

            await playChord(
                midiNotes,
                chord.beats,
                bpmRef.current,
                chord.volume,
                chord.instrument,
                chord.trackId,
                chord.wait
            );

        })
    );

    // remove highlight after playing
    setTimeout(() => {
        setActiveChords([]);
    }, (60 / bpmRef.current) * 1000);

};






  // Playback

  // const currentIndexRef = useRef(0);
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const timerRef = useRef(null);

  const abortControllerRef = useRef(null);



  const [isPlaying, setIsPlaying] = useState(false);


  const sleep = (ms) =>
    new Promise(resolve => {

        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            resolve();
        }, ms);
    });


    const tracksRef = useRef([]);

    useEffect(()=>{
    tracksRef.current = tracks;
    },[tracks]);



const playAllTracks = async () => {

  if (playingRef.current)
    return;


  const playbackId = ++playbackIdRef.current;

  playingRef.current = true;
  pausedRef.current = false;
  setIsPlaying(true);


  while(
    playingRef.current &&
    playbackId === playbackIdRef.current
  ){

    const maxLength = Math.max(
    0,
        ...tracksRef.current.map(
        t => t.chords.length
        )
    );

    if(maxLength === 0){
        await sleep(50);
        continue;
    }

    if(pausedRef.current){

      await sleep(100);
      continue;

    }


    const step = playheadRef.current;


    const chordsAtStep = tracksRef.current
    .filter(track =>
        track.chords.length > 0 &&
        !track.muted
    )
    .map(track => ({
        ...track.chords[step % track.chords.length],
        volume: track.volume,
        trackId: track.id
    })
    );



    console.log("STEP:", step, chordsAtStep);


    try {

    if (chordsAtStep.length > 0) {

        stopAllNotes();

        await playStep(chordsAtStep);

        await sleep(
    (60 / bpmRef.current) *
    chordsAtStep[0].beats *
    1000
);

    }
    else {

        await sleep(50);
        if (!playingRef.current) break;

    }

    }
    catch(error){

    if(error.name === "AbortError"){
        break;
    }

    console.error(error);

    }



    playheadRef.current++;
    if(playheadRef.current >= maxLength){
        playheadRef.current = 0;
    }
    
    setPlayhead(playheadRef.current);

    


  }


  if (playbackId === playbackIdRef.current) {
    setIsPlaying(false);
    }

};


const startPlayback = async () => {

    await unlockAudio();
    
    // Give WebAudio time to wake up
    await new Promise(resolve => setTimeout(resolve, 100));

    if (playingRef.current) {

        pausedRef.current = false;
        setIsPlaying(true);
        return;

    }

    playAllTracks();

};





  const pauseProgression = () => {

    pausedRef.current = true;
    stopAllNotes();
    setIsPlaying(false);

  };


const stopProgression = () => {

    playbackIdRef.current++;
  stopAllNotes();
  // stop loop
  playingRef.current = false;

  // release pause
  pausedRef.current = false;


  // cancel current HTTP request
  if(abortControllerRef.current){

    abortControllerRef.current.abort();

    abortControllerRef.current = null;

  }


  // cancel sleep timer
  clearTimeout(timerRef.current);


  // reset position
  playheadRef.current = 0;
  setPlayhead(0);


  // reset UI
  setIsPlaying(false);

};






  return (

    <div

      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 30,
        padding: 20,
        boxSizing: "border-box",
        background: colors.background
      }}

    >


      {/* Controls */}

      <div

        style={{
          display: "flex",
          alignItems: "center",
          gap: 20
        }}

      >


        {!isPlaying ? (

          <Button

            variant="contained"

            sx={{
              backgroundColor: colors.primary,
              borderRadius: 3,
              textTransform: "none",
              fontWeight: 600,
              "&:hover": {
                backgroundColor: "#5635E8"
              }
            }}

            disabled={
                tracks.every(track => track.chords.length === 0)
            }


            // onClick={playAllTracks}
            onClick={startPlayback}


          >

            ▶ Play

          </Button>


        ) : (


          <Button

            variant="contained"

            sx={{
              backgroundColor: colors.primary,
              borderRadius: 3,
              textTransform: "none",
              fontWeight: 600
            }}

            onClick={pauseProgression}

          >

            ⏸ Pause

          </Button>


        )}

        <Button
            variant="outlined"
            onClick={() => setTempoDialogOpen(true)}
        >
            ♩ {bpm} BPM
        </Button>




        <Button

          variant="contained"

          sx={{
            backgroundColor: colors.danger,
            borderRadius: 3,
            textTransform: "none"
          }}

          onClick={stopProgression}

        >

          ■ Stop

        </Button>


        <div
        onClick={addTrack}
        style={{
            width:70,
            height:70,
            border:`2px dashed ${colors.border}`,
            background:colors.primaryLight,
            color:colors.primary,
            borderRadius:12,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            fontSize:40,
            cursor:"pointer"
        }}
        >
        +
        </div>




      </div>



      {/* Chords */}


        <div
        style={{
        display:"flex",
        flexDirection:"column",
        gap:20,
        width:"90%",
        position:"relative"
        }}
        >
        



        {
        tracks.map(track=>(

        <div
        key={track.id}
        onClick={()=>{
            setSelectedTrack(track.id)
            }}
        style={{
            display:"flex",
            alignItems:"center",
            gap:15,
            padding:10,
            borderRadius:12,
            borderLeft:`6px solid ${track.color}`,
            background:
            selectedTrack === track.id
            ? `${track.color}22`
            : "transparent"
        }}

        >


        <div
            onClick={(e)=>{

                e.stopPropagation();

                setMenuTrackId(track.id);
                setTrackMenuAnchor(e.currentTarget);

            }}

            style={{
                width:120,
                fontWeight:700,
                color:colors.text,
                cursor:"pointer",
                padding:8,
                borderRadius:8
            }}

            >
            {track.name}
        </div>

        <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={(e, value) => {
                e.stopPropagation();
                changeTrackVolume(track.id, value);
            }}
            sx={{
                height: 90,
                color: colors.primary
            }}
        />


        <div
            style={{
            display:"flex",
            gap:5
            }}
            >



           <Button
            size="small"
            variant="contained"
            sx={{
            backgroundColor:
            track.muted
            ? "#999"
            : colors.primary,
            minWidth:50
            }}
            onClick={(e)=>{
            e.stopPropagation();
            toggleMuteTrack(track.id);
            }}
            >
            {track.muted ? "🔇" : "🔊"}
            </Button>


            </div>



        <div
            style={{
            display:"flex",
            gap:10,
            position:"relative"
            }}
            >

            <div
                style={{
                    position:"absolute",
                    left:`${(playhead % Math.max(track.chords.length, 1)) * 80 + (isPlaying ? 70 : 0)}px`,
                    top:-5,
                    height:80,
                    width:3,
                    background:colors.primary,
                    transition:`left ${60000 / bpmRef.current}ms linear`,
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

            onEdit={(index)=>{


                setSelectedChord({

                    trackId:track.id,

                    index

                });


                const chord =
                    track.chords[index];


                setEditChord({

                    ...chord,

                    octave:String(chord.octave),

                    beats:String(chord.beats),

                    wait:String(chord.wait)

                });


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
            name: "",
            octave: "4",
            beats: "1",
            instrument: "acoustic_grand_piano",
            wait: "0"
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


        <Button
            color="error"
            onClick={(e)=>{
            e.stopPropagation();
            deleteTrack(track.id);
            }}
            >
            Delete
            </Button>



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

        <DialogTitle>Edit Chord</DialogTitle>

        <DialogContent>

            <Grid container spacing={2} sx={{ mt: 1 }}>

                <Grid size={12}>
                    <TextField
                        fullWidth
                        label="Chord Name"
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
                            max:4,
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
                                        4,
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

                <Grid size={6}>
                    <TextField
                        fullWidth
                        label="Beats"
                        type="number"
                        value={editChord.beats}
                        inputProps={{
                            min:1,
                            max:4,
                            inputMode:"numeric"
                        }}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                beats:e.target.value
                            })
                        }
                        onBlur={() =>
                            setEditChord({
                                ...editChord,
                                beats:String(
                                    Math.min(
                                        4,
                                        Math.max(
                                            1,
                                            Number(editChord.beats) || 1
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
    <DialogTitle>Add Chord</DialogTitle>

    <DialogContent>

        <Grid container spacing={2} sx={{ mt: 1 }}>

            <Grid size={12}>
                <TextField
                    fullWidth
                    label="Chord Name"
                    value={newChord.name}
                    onChange={(e)=>
                        setNewChord({
                            ...newChord,
                            name:e.target.value
                        })
                    }
                    placeholder="Cm7, F#, Bbmaj7..."
                />
            </Grid>

            <Grid size={6}>
                <TextField
                    type="number"
                    fullWidth
                    label="Octave"
                    inputProps={{
                        min:1,
                        max:4,
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
                                    4,
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
                    label="Beats"
                    inputProps={{
                        min: 1,
                        max: 4,
                        step: 1
                    }}
                    value={newChord.beats}
                    onChange={(e)=>
                        setNewChord({
                            ...newChord,
                            beats:e.target.value
                        })
                    }
                    onBlur={() =>
                        setNewChord({
                            ...newChord,
                            beats:String(
                                Math.min(
                                    4,
                                    Math.max(
                                        1,
                                        Number(newChord.beats) || 1
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
                    {instruments.map(inst=>(
                        <MenuItem
                            key={inst}
                            value={inst}
                        >
                            {inst.replaceAll("_"," ")}
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
                    beats:"1",
                    instrument:"acoustic_grand_piano",
                    wait:"0"
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
            Add Chord
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

  );

}


export default App;