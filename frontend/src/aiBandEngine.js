const rootMap = {
  C: ["C", "E", "G", "A", "B"],
  D: ["D", "F#", "A", "C", "E"],
  E: ["E", "G#", "B", "C#", "D"],
  F: ["F", "A", "C", "D", "E"],
  G: ["G", "B", "D", "E", "F"],
  A: ["A", "C#", "E", "G", "B"],
  B: ["B", "D#", "F#", "G#", "A"],
  "C#": ["C#", "E#", "G#", "A#", "B#"],
  "D#": ["D#", "F#", "A#", "C", "D"],
  "F#": ["F#", "A#", "C#", "D#", "E#"],
  "G#": ["G#", "B#", "D#", "E#", "F#"],
  "A#": ["A#", "C#", "E#", "G#", "B#"],
};

function parseChordRoot(chordName = "") {
  const cleaned = String(chordName || "").trim();
  if (!cleaned) return "C";
  const match = cleaned.match(/^([A-G](?:#|b)?)/i);
  if (!match) return "C";
  return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
}

function normalizeRoot(root) {
  const normalized = String(root || "C").trim();
  if (!normalized) return "C";
  const direct = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  const fixed = direct === "Bb" ? "B" : direct === "Db" ? "D" : direct === "Eb" ? "E" : direct === "Gb" ? "G" : direct === "Ab" ? "A" : direct;
  return fixed;
}

function getBassVariation(index) {
  const cycle = [0, 0, 1, 0, 0, 2, 0, 1];
  return cycle[index % cycle.length];
}

function getLeadMelodyNote(root, index) {
  const normalized = normalizeRoot(root);
  const notes = rootMap[normalized] || rootMap.C;
  return notes[index % notes.length];
}

const STYLE_PRESETS = {
  pop: {
    label: "Pop",
    instruments: {
      bass: "finger_bass",
      piano: "acoustic_grand_piano",
      rhythm: "church_organ",
      lead: "flute",
      pad: "violin",
    },
    volumes: { bass: 0.72, piano: 0.82, rhythm: 0.68, lead: 0.58, pad: 0.52 },
    colors: { bass: "#00B894", piano: "#6D4AFF", rhythm: "#FDCB6E", lead: "#FF6B8A", pad: "#0984E3" },
  },
  rock: {
    label: "Rock",
    instruments: {
      bass: "synth_bass",
      piano: "electric_grand_piano",
      rhythm: "rock_guitar",
      lead: "trumpet",
      pad: "string_ensemble",
    },
    volumes: { bass: 0.8, piano: 0.78, rhythm: 0.7, lead: 0.62, pad: 0.56 },
    colors: { bass: "#2D9CDB", piano: "#9B51E0", rhythm: "#F2994A", lead: "#EB5757", pad: "#56CCF2" },
  },
  cinematic: {
    label: "Cinematic",
    instruments: {
      bass: "finger_bass",
      piano: "church_organ",
      rhythm: "string_ensemble",
      lead: "violin",
      pad: "flute",
    },
    volumes: { bass: 0.7, piano: 0.74, rhythm: 0.6, lead: 0.54, pad: 0.5 },
    colors: { bass: "#6FCF97", piano: "#A78BFA", rhythm: "#BB6BD9", lead: "#F2C94C", pad: "#56CCF2" },
  },
  "lo-fi": {
    label: "Lo-fi",
    instruments: {
      bass: "synth_bass",
      piano: "electric_grand_piano",
      rhythm: "acoustic_grand_piano",
      lead: "flute",
      pad: "violin",
    },
    volumes: { bass: 0.68, piano: 0.7, rhythm: 0.6, lead: 0.45, pad: 0.42 },
    colors: { bass: "#7F8C8D", piano: "#9B59B6", rhythm: "#D5A6BD", lead: "#E67E22", pad: "#5DADE2" },
  },
  jazz: {
    label: "Jazz",
    instruments: {
      bass: "finger_bass",
      piano: "electric_grand_piano",
      rhythm: "church_organ",
      lead: "trumpet",
      pad: "string_ensemble",
    },
    volumes: { bass: 0.75, piano: 0.8, rhythm: 0.66, lead: 0.6, pad: 0.55 },
    colors: { bass: "#34C759", piano: "#8E7CC3", rhythm: "#F1C40F", lead: "#E67E22", pad: "#5DADE2" },
  },
  acoustic: {
    label: "Acoustic",
    instruments: {
      bass: "finger_bass",
      piano: "acoustic_grand_piano",
      rhythm: "rock_guitar",
      lead: "flute",
      pad: "violin",
    },
    volumes: { bass: 0.7, piano: 0.75, rhythm: 0.58, lead: 0.5, pad: 0.48 },
    colors: { bass: "#27AE60", piano: "#8E44AD", rhythm: "#F9C74F", lead: "#FF7F50", pad: "#4ECDC4" },
  },
};

function chooseStyle(song) {
  const chords = Array.isArray(song?.chords) ? song.chords : [];
  const compact = chords.map((item) => String(item?.name || "")).join(" ").toUpperCase();

  if (compact.includes("7") || compact.includes("DOM")) return "rock";
  if (compact.includes("M") || compact.includes("MIN")) return "cinematic";
  if (compact.includes("9") || compact.includes("11")) return "jazz";
  if (compact.includes("ADD") || compact.includes("SUS")) return "acoustic";
  return "pop";
}

function makeTrack(name, instrument, volume, chords, color, preset = "default", style = "pop") {
  const trackId = Date.now() + Math.random() + Math.random();

  return {
    id: trackId,
    name,
    instrument,
    volume,
    muted: false,
    loop: true,
    color,
    chords: chords.map((chord, index) => {
      const root = parseChordRoot(chord.name || "C");
      const bassVariation = getBassVariation(index);
      const melodyNote = getLeadMelodyNote(root, index);
      const chordDensity = style === "rock" ? 1 : style === "jazz" ? 2 : 1;
      const beatLength = index % 4 === 0 ? (style === "cinematic" ? 2 : 1) : 1;

      const base = {
        type: "chord",
        name: chord.name || "C",
        octave: 4,
        inversion: 0,
        beats: beatLength,
        repeat: 1,
        wait: 0,
        speed: 1,
        instrument,
        volume,
        pattern: [true],
        trackId,
      };

      if (preset === "bass") {
        return {
          ...base,
          name: root,
          inversion: bassVariation,
          octave: style === "rock" ? 2 : 3,
          beats: style === "jazz" ? 2 : 1,
          speed: bassVariation === 0 ? 0.25 : 0.55,
          pattern: [true],
        };
      }

      if (preset === "lead") {
        return {
          ...base,
          type: "note",
          name: melodyNote,
          octave: style === "cinematic" ? 6 : 5,
          beats: index % 3 === 0 ? 2 : 1,
          speed: style === "rock" ? 0.9 : 0.75,
          pattern: [true],
        };
      }

      if (preset === "pad") {
        return {
          ...base,
          name: chord.name || "C",
          octave: style === "cinematic" ? 6 : 5,
          beats: style === "lo-fi" ? 2 : 1,
          speed: chordDensity === 2 ? 0.4 : 0.5,
          pattern: [true],
        };
      }

      return {
        ...base,
        name: chord.name || "C",
        octave: style === "rock" ? 3 : 4,
        beats: beatLength + (index % 3 === 0 && style === "jazz" ? 1 : 0),
        speed: index % 2 === 0 ? 0.7 : 1,
      };
    }),
  };
}

export function buildBandFromSong(song, style = "pop") {
  const resolvedStyle = STYLE_PRESETS[style] ? style : chooseStyle(song);
  const preset = STYLE_PRESETS[resolvedStyle] || STYLE_PRESETS.pop;

  const safeSong = song && Array.isArray(song.chords) && song.chords.length > 0 ? song : {
    title: "Demo Jam",
    chords: [
      { name: "C" },
      { name: "G" },
      { name: "Am" },
      { name: "F" },
      { name: "C" },
      { name: "G" },
      { name: "Am" },
      { name: "F" },
    ],
  };

  const songChords = safeSong.chords.map((chord, index) => ({
    ...chord,
    name: chord.name || "C",
    beats: index % 4 === 0 ? 2 : 1,
  }));

  const leadPattern = songChords.map((chord, index) => ({
    ...chord,
    name: parseChordRoot(chord.name),
    beats: index % 4 === 0 ? 2 : 1,
    speed: index % 2 === 0 ? 0.4 : 0.75,
  }));

  const bassTrack = makeTrack(
    `${safeSong.title ? safeSong.title.split(" ")[0] : "Bass"} Bass`,
    preset.instruments.bass,
    preset.volumes.bass,
    songChords,
    preset.colors.bass,
    "bass",
    resolvedStyle
  );

  const pianoTrack = makeTrack(
    "Piano",
    preset.instruments.piano,
    preset.volumes.piano,
    songChords,
    preset.colors.piano,
    "default",
    resolvedStyle
  );

  const rhythmTrack = makeTrack(
    "Rhythm",
    preset.instruments.rhythm,
    preset.volumes.rhythm,
    leadPattern,
    preset.colors.rhythm,
    "default",
    resolvedStyle
  );

  const fluteTrack = makeTrack(
    "Lead",
    preset.instruments.lead,
    preset.volumes.lead,
    leadPattern,
    preset.colors.lead,
    "lead",
    resolvedStyle
  );

  const violinTrack = makeTrack(
    "Pad",
    preset.instruments.pad,
    preset.volumes.pad,
    leadPattern,
    preset.colors.pad,
    "pad",
    resolvedStyle
  );

  return [bassTrack, pianoTrack, rhythmTrack, fluteTrack, violinTrack];
}

export function buildDemoBand(style = "pop") {
  return buildBandFromSong({
    title: "Demo Jam",
    chords: [
      { name: "C" },
      { name: "G" },
      { name: "Am" },
      { name: "F" },
      { name: "C" },
      { name: "E7" },
      { name: "Am" },
      { name: "F" },
    ],
  }, style);
}

export const styleOptions = Object.entries(STYLE_PRESETS).map(([value, config]) => ({ value, label: config.label }));
