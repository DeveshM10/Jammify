import { useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Popover,
  Paper
} from "@mui/material";


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


  const [open, setOpen] = useState(false);
  const [chord, setChord] = useState("");
  const [chords, setChords] = useState([]);

  const [editIndex, setEditIndex] = useState(null);

  const [cardAnchor, setCardAnchor] = useState(null);
  const [selectedChordIndex, setSelectedChordIndex] = useState(null);
  const [mode, setMode] = useState("normal");
  const modeRef = useRef("normal");


  const chordsRef = useRef(chords);

  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);


  const playChord = async (chord) => {
    await fetch(
      `http://localhost:8000/play?chord=${chord}&mode=${modeRef.current}`
    );
  };


  const addChord = () => {

    if (chord.trim() === "") return;


    if (editIndex !== null) {

      setChords(
        chords.map((c, i) =>
          i === editIndex ? chord : c
        )
      );

    } else {

      setChords([
        ...chords,
        chord
      ]);

    }


    setChord("");
    setEditIndex(null);
    setOpen(false);
  };


  // Playback

  const currentIndexRef = useRef(0);
  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const timerRef = useRef(null);


  const [isPlaying, setIsPlaying] = useState(false);


  const sleep = (ms) =>
    new Promise(resolve => {
      timerRef.current = setTimeout(resolve, ms);
    });


  const playProgression = async () => {

    if (playingRef.current) {

      pausedRef.current = false;
      setIsPlaying(true);
      return;

    }


    playingRef.current = true;
    pausedRef.current = false;

    setIsPlaying(true);


    while (playingRef.current) {


      if (chordsRef.current.length === 0)
        break;


      if (pausedRef.current) {

        await sleep(100);
        continue;

      }


      const c =
        chordsRef.current[currentIndexRef.current];


      await playChord(c);


      currentIndexRef.current++;


      if (
        currentIndexRef.current >=
        chordsRef.current.length
      ) {

        currentIndexRef.current = 0;

      }


      await sleep(2000);

    }


    playingRef.current = false;
    setIsPlaying(false);

  };


  const pauseProgression = () => {

    pausedRef.current = true;
    setIsPlaying(false);

  };


  const stopProgression = () => {

    playingRef.current = false;
    pausedRef.current = false;

    clearTimeout(timerRef.current);

    currentIndexRef.current = 0;

    setIsPlaying(false);

  };



  // Card menu

  const handleCardClick = (event, index) => {

    setCardAnchor(event.currentTarget);
    setSelectedChordIndex(index);

  };


  const closeCardMenu = () => {

    setCardAnchor(null);
    setSelectedChordIndex(null);

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

            disabled={chords.length === 0}

            onClick={playProgression}

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

          onClick={() => {
            setChord("");
            setEditIndex(null);
            setOpen(true);
          }}

          style={{

            width:100,
            height:100,
            border:`2px dashed ${colors.border}`,
            background:colors.primaryLight,
            color:colors.primary,
            borderRadius:16,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            fontSize:50,
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
          flexWrap:"wrap",
          justifyContent:"center",
          gap:20,
          maxWidth:900
        }}

      >


        {chords.map((c,index)=>(


          <div

            key={index}

            onClick={(e) => {
                if (isPlaying) {
                  pauseProgression();
                }

                handleCardClick(e, index);
              }}

            style={{

              width:100,
              height:100,
              border:`2px solid ${colors.border}`,
              background:colors.card,
              color:colors.text,
              borderRadius:16,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              fontSize:30,
              cursor:"pointer",
              boxShadow:
              "0 6px 18px rgba(109,74,255,.12)",
              transition:".2s"

            }}


          >


            <div

              style={{
                fontWeight:700
              }}

            >

              {c}

            </div>


          </div>


        ))}


      </div>



      {/* Card menu */}


      <Popover

        open={Boolean(cardAnchor)}

        anchorEl={cardAnchor}

        onClose={closeCardMenu}

        anchorOrigin={{
          vertical:"bottom",
          horizontal:"center"
        }}

      >

        <Paper

          sx={{
            p:1.5,
            borderRadius:3,
            display:"flex",
            flexDirection:"column",
            gap:0.5,
            minWidth:160
          }}

        >

          <Button

            onClick={()=>{

              setChord(
                chords[selectedChordIndex]
              );

              setEditIndex(
                selectedChordIndex
              );

              setOpen(true);

              closeCardMenu();

            }}

          >

            ✏️ Edit

          </Button>


          <Button
            sx={{
              justifyContent:"flex-start",
              borderRadius:2
            }}
            onClick={() => {
              const newMode =
              modeRef.current === "normal"
                ? "strumming"
                : "normal";
            modeRef.current = newMode;
            setMode(newMode);
            }}
          >
            🎸 Mode: {mode === "normal" ? "Normal" : "Strumming"}
          </Button>

          <Button

            color="error"

            onClick={()=>{

              setChords(
                chords.filter(
                  (_,i)=>
                  i!==selectedChordIndex
                )
              );

              closeCardMenu();

            }}

          >

            🗑 Delete

          </Button>


        </Paper>


      </Popover>



      {/* Dialog */}


      <Dialog

        open={open}

        onClose={()=>setOpen(false)}

      >

        <DialogTitle>

          {editIndex !== null
          ? "Edit Chord"
          : "Add Chord"}

        </DialogTitle>


        <DialogContent>


          <TextField

            autoFocus

            value={chord}

            label="Chord name"

            onChange={
              e=>setChord(e.target.value)
            }

            fullWidth

          />


        </DialogContent>



        <DialogActions>


          <Button

            onClick={()=>{

              setOpen(false);
              setEditIndex(null);
              setChord("");

            }}

          >

            Cancel

          </Button>



          <Button

            variant="contained"

            onClick={addChord}

          >

            {editIndex !== null
            ? "Save"
            : "Add"}

          </Button>


        </DialogActions>


      </Dialog>



    </div>

  );

}


export default App;