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
    "rock_organ",
    "church_organ",
    "clean_electric_guitar",
    "overdriven_guitar",
    "distortion_guitar",
    "guitar_harmonics",
    "finger_bass"
]



function App() {

  const colors = {
    background: "#F7F5FF",
    primary: "#6D4AFF",
    primaryLight: "#EDE7FF",
    card: "#FFFFFF",
    border: "#D8CCFF",
    text: "#372580",
    danger: "#FF6B8A",
  };


    // render
    const API_URL = "https://jammify-3.onrender.com";
    
 

  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);


  const [selectedProgression, setSelectedProgression] = useState(null);


  const [trackMenuAnchor, setTrackMenuAnchor] = useState(null);
  const [menuTrackId, setMenuTrackId] = useState(null);

  const [tempoDialogOpen, setTempoDialogOpen] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(4);


  const [editingTrack, setEditingTrack] = useState(null);
  const [chordInput, setChordInput] = useState("");
  
  const [selectedChord, setSelectedChord] = useState(null);
  const [editChord, setEditChord] = useState({
    name: "",
    octave: 4,
    beats: 1,
    instrument: "acoustic_grand_piano",
    wait: 0
    });

    

  const [newChord, setNewChord] = useState({
  name: "",
  octave: 4,
  beats: 1,
  instrument: "acoustic_grand_piano",
  wait: 0
    });

  const [mode, setMode] = useState("normal");
  const modeRef = useRef("normal");

  const [playhead, setPlayhead] = useState(0);
  

  const [bpm, setBpm] = useState(120);
  const bpmRef = useRef(120);
  const beatsPerBarRef = useRef(4);

  const playbackIdRef = useRef(0);

    useEffect(() => {
    bpmRef.current = bpm;
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


function getCurrentChord(track){

    let pos =
    playbackPositionRef.current[track.id];


    if(!pos){

        pos={
            progression:0,
            chord:0,
            repeat:0
        };

        playbackPositionRef.current[track.id]=pos;

    }


    const progression =
    track.progressions[pos.progression];


    if(!progression)
        return null;

    
    if (progression.chords.length === 0)
        return null;

    return progression.chords[pos.chord];

}

function advanceTrack(track){

    const pos = playbackPositionRef.current[track.id];

    const progression =
        track.progressions[pos.progression];


    if(!progression || progression.chords.length === 0)
        return;


    const currentChord =
        progression.chords[pos.chord];


    if(!currentChord)
        return;


    // count how many times this chord should play in the bar

    if(!pos.playCount){

        pos.playCount =
            beatsPerBarRef.current /
            currentChord.beats;

    }


    pos.playCount--;


    // still repeating this chord
    if(pos.playCount > 0)
        return;



    // move to next chord

    pos.playCount = 0;

    pos.chord++;


    if(pos.chord >= progression.chords.length){

        pos.chord = 0;

        pos.repeat++;


        if(pos.repeat >= progression.repeat){

            pos.repeat = 0;

            pos.progression++;


            if(pos.progression >= track.progressions.length){

                pos.progression = 0;

            }

        }

    }

}



  const addTrack = () => {

    const newTrack = {
        id: Date.now(),
        name: `Track ${tracks.length + 1}`,
        progressions:[
            {
                id: Date.now(),
                name:"Progression 1",
                repeat:4,
                chords:[]
            }
        ],
        muted: false,
        volume: 0.8
    };

    setTracks([
        ...tracks,
        newTrack
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
            progressions: original.progressions.map(progression => ({
                ...progression,
                id: Date.now() + Math.random(),
                chords: progression.chords.map(chord => ({
                    ...chord
                }))
            }))
        };

        return [
            ...prev.slice(0, index + 1),
            copy,
            ...prev.slice(index + 1)
        ];

    });

};



const deleteTrack = (id) => {

  const remainingTracks = tracks.filter(
    t => t.id !== id
  );

  setTracks(remainingTracks);
  delete playbackPositionRef.current[id];


  // Reset playhead
  playheadRef.current = 0;
  setPlayhead(0);


  // If no tracks left, stop playback UI
  if (remainingTracks.length === 0) {

    playingRef.current = false;
    pausedRef.current = false;

    if(abortControllerRef.current){
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    clearTimeout(timerRef.current);

    setIsPlaying(false);
  }

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




const addChordToProgression = () => {

    if (!newChord.name.trim()) return;


    setTracks(prev =>
        prev.map(track => {

            if(track.id !== editingTrack)
                return track;


            return {
                ...track,

                progressions:
                track.progressions.map(prog => {

                    if(prog.id !== selectedProgression)
                        return prog;


                    return {
                        ...prog,

                        chords:[
                            ...prog.chords,
                            {...newChord}
                        ]
                    };

                })

            };

        })
    );


    setNewChord({
        name:"",
        octave:4,
        beats:1,
        instrument:"acoustic_grand_piano",
        wait:0
    });

};


const addProgressionToTrack = (trackId)=>{

setTracks(prev =>
prev.map(track =>

track.id === trackId

? {

...track,

progressions:[
...track.progressions,

{
id:Date.now(),
name:`Progression ${track.progressions.length+1}`,
repeat:4,
chords:[]
}

]

}

:track

)

);

};

const deleteChordFromTrack = (
    trackId,
    progressionId,
    chordIndex
) => {

    setTracks(prev =>
        prev.map(track =>

            track.id !== trackId
                ? track
                : {
                    ...track,

                    progressions:
                        track.progressions.map(progression =>

                            progression.id !== progressionId
                                ? progression
                                : {

                                    ...progression,

                                    chords:
                                        progression.chords.filter(
                                            (_, i) =>
                                                i !== chordIndex
                                        )

                                }

                        )

                }

        )
    );

};



const editChordData = () => {

    if (!editChord.name.trim()) return;

    setTracks(prev =>
        prev.map(track =>

            track.id !== selectedChord.trackId
                ? track
                : {
                    ...track,

                    progressions:
                        track.progressions.map(progression =>

                            progression.id !== selectedChord.progressionId
                                ? progression
                                : {

                                    ...progression,

                                    chords:
                                        progression.chords.map((chord, index) =>

                                            index === selectedChord.index
                                                ? { ...editChord }
                                                : chord

                                        )

                                }

                        )

                }

        )
    );

    setSelectedChord(null);

    setEditChord({
        name: "",
        octave: 4,
        beats: 1,
        instrument: "acoustic_grand_piano",
        wait: 0
    });

};





const saveTempo = async () => {
    const finalBpm = Math.min(
        240,
        Math.max(40, Number(bpm))
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



const playStep = async (chords)=>{


    chords.forEach(chord=>{


        const midiNotes =
            chordToMidi(
                chord.name,
                chord.octave
            );


        playChord(
            midiNotes,
            chord.beats,
            bpmRef.current,
            chord.volume,
            chord.instrument,
            chord.trackId
        );


    });


};







  // Playback

  // const currentIndexRef = useRef(0);
  const playbackPositionRef = useRef({});
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


        if(pausedRef.current){

            await sleep(100);
            continue;

        }



        const activeTracks =
            tracksRef.current.filter(
                track =>
                    !track.muted &&
                    track.progressions &&
                    track.progressions.length > 0
            );



        if(activeTracks.length === 0){

            await sleep(100);
            continue;

        }




        const chordsAtStep =
            activeTracks
            .map(track => {


                const pos =
                    playbackPositionRef.current[track.id];


                const chord =
                    getCurrentChord(track);



                if(!chord)
                    return null;


                // first time playing this chord
                if(pos.beatsRemaining === 0){

                    pos.beatsRemaining = chord.beats;

                }





                return {

                    ...chord,

                    volume:
                        track.volume,

                    trackId:
                        track.id

                };


            })
            .filter(Boolean);





        console.log(
            "PLAYING:",
            chordsAtStep
        );




        try {


            if(chordsAtStep.length > 0){


                /*
                    Every track plays its current chord.
                    Duration is controlled by chord beats.
                */


                stopAllNotes();



                await playStep(
                    chordsAtStep
                );



                if(!playingRef.current)
                    break;



                await sleep(
                    (60 / bpmRef.current) *
                    1000
                );



                if(!playingRef.current)
                    break;



            }
            else{


                await sleep(50);


            }



        }
        catch(error){


            console.error(error);


        }





        /*
            Move every track forward independently

            Example:

            Track 1:
            Progression 1 chord 3

            Track 2:
            Progression 2 chord 1

            They do not have to be synchronized
        */


        activeTracks.forEach(track => {

            advanceTrack(track);

        });



    }





    if(playbackId === playbackIdRef.current){

        setIsPlaying(false);

    }


};


const startPlayback = async () => {

    await unlockAudio();

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

    // Stop playback
    playingRef.current = false;
    pausedRef.current = false;

    // Cancel any pending request
    if (abortControllerRef.current) {

        abortControllerRef.current.abort();
        abortControllerRef.current = null;

    }

    // Cancel pending timer
    clearTimeout(timerRef.current);

    // Reset every track back to Progression 1, Chord 1
    playbackPositionRef.current = {};

    // Reset UI
    setPlayhead(0);
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
                tracks.every(track =>
                    track.progressions.every(
                        p => p.chords.length === 0
                    )
                )
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
            background:
            selectedTrack === track.id
            ? colors.primaryLight
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
            position:"relative",
            overflowX:"auto",
            maxWidth:"80vw",
            paddingBottom:10
            }}
            >

        
        {
            track.progressions.map((prog)=>(
                
            <div
            key={prog.id}
            style={{
                width:180,
                minHeight:100,
                background:colors.card,
                border:`2px solid ${colors.border}`,
                borderRadius:12,
                padding:12,
                display:"flex",
                flexDirection:"column",
                gap:8,
                cursor:"pointer"
            }}

            >

                <div
                style={{
                    fontWeight:700,
                    color:colors.text,
                    fontSize:16
                }}
                >
                    {prog.name}
                </div>


                <div
                style={{
                    display:"flex",
                    gap:5,
                    flexWrap:"wrap"
                }}
                >

                {
                prog.chords.map((c, i) => (

                        <div
                            key={i}
                            style={{
                                position: "relative",
                                background: colors.primaryLight,
                                borderRadius: 8,
                                padding: "6px 26px 6px 10px",
                                fontSize: 14,
                                color: colors.text,
                                minWidth: 45
                            }}
                        >

                            {c.name}

                            <IconButton
                                size="small"
                                onClick={(e) => {

                                    e.stopPropagation();

                                    setSelectedChord({
                                        trackId: track.id,
                                        progressionId: prog.id,
                                        index: i
                                    });

                                    setEditChord({ ...c });

                                }}
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    right: 0,
                                    width: 20,
                                    height: 20,
                                    opacity: 0.5,
                                    "&:hover": {
                                        opacity: 1,
                                        backgroundColor: colors.card
                                    }
                                }}
                            >
                                <MoreVertIcon sx={{ fontSize: 14 }} />
                            </IconButton>

                        </div>

                    ))
                }


                </div>


                <div
                style={{
                    fontSize:13,
                    color:"#777"
                }}
                >
                    Repeat: {prog.repeat}
                    <Button
                        size="small"
                        onClick={()=>{

                        setEditingTrack(track.id);
                        setSelectedProgression(prog.id);

                        setNewChord({
                        name:"",
                        octave:4,
                        beats:1,
                        instrument:"acoustic_grand_piano",
                        wait:0
                        });

                        setOpen(true);

                        }}
                        >
                        + Chord
                        </Button>
                </div>


            </div>

            ))
            }



        <div
            onClick={(e)=>{

            e.stopPropagation();

            addProgressionToTrack(track.id);

            }}

            style={{
            width:70,
            height:70,
            border:`2px dashed ${colors.border}`,
            borderRadius:12,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            cursor:"pointer",
            fontSize:30
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
                    setBeatsPerBar(
                        Math.min(
                            12,
                            Math.max(1, Number(e.target.value))
                        )
                    )
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
                        type="number"
                        fullWidth
                        label="Octave"
                        value={editChord.octave}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                octave: Number(e.target.value)
                            })
                        }
                    />
                </Grid>

                <Grid size={6}>
                    <TextField
                        type="number"
                        fullWidth
                        label="Beats"
                        value={editChord.beats}
                        onChange={(e)=>
                            setEditChord({
                                ...editChord,
                                beats: Number(e.target.value)
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
                        selectedChord.progressionId,
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
                            octave:Math.min(
                                    4,
                                    Math.max(1, Number(e.target.value))
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
                            beats:Math.min(
                                4,
                                Math.max(1, Number(e.target.value))
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
                    octave:4,
                    beats:1,
                    instrument:"acoustic_grand_piano",
                    wait:0
                });
            }}
        >
            Cancel
        </Button>

        <Button
            variant="contained"
            onClick={()=>{
                addChordToProgression();
                setOpen(false);
            }}
        >
            Add Chord
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