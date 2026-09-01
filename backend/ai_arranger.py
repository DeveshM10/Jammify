from __future__ import annotations

from typing import List, Dict, Any

ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def normalize_root(root: str) -> str:
    if not root:
        return "C"
    value = str(root).strip().upper()
    aliases = {
        "CB": "C",
        "B#": "C",
        "DB": "C#",
        "EB": "D#",
        "GB": "F#",
        "AB": "G#",
        "BB": "A#",
    }
    return aliases.get(value, value)


def chord_quality(chord_name: str) -> str:
    name = str(chord_name or "C").upper().strip()
    if "DIM" in name or "°" in name:
        return "diminished"
    if "AUG" in name or "+" in name:
        return "augmented"
    if "MIN" in name or "-" in name or "M" not in name and "m" in name:
        return "minor"
    if "7" in name or "9" in name or "11" in name or "13" in name:
        return "dominant"
    if "M" in name and "7" not in name and "9" not in name and "6" not in name:
        return "major"
    return "major"


def parse_root(chord_name: str) -> str:
    cleaned = str(chord_name or "C").strip()
    match = next((part for part in [
        cleaned.split("/")[0],
        cleaned.split(" ")[0],
        cleaned,
    ] if part), "C")
    root = "".join(ch for ch in match if ch.isalpha() or ch in "#b")
    if not root:
        return "C"
    if len(root) == 1:
        return root.upper()
    return normalize_root(root)


def infer_bass_note(chord_name: str) -> str:
    return parse_root(chord_name)


def detect_sections(chords: List[str]) -> List[Dict[str, int | str]]:
    cleaned = [str(chord or "C").strip() for chord in (chords or []) if str(chord or "").strip()]
    if not cleaned:
        return [{"name": "Verse", "start": 0, "end": 0}]
    if len(cleaned) <= 4:
        return [{"name": "Verse", "start": 0, "end": len(cleaned) - 1}]

    repeats = []
    window = min(4, len(cleaned))
    for start in range(0, len(cleaned) - window + 1):
        key = "|".join(cleaned[start:start + window])
        for other in range(start + 1, len(cleaned) - window + 1):
            if key == "|".join(cleaned[other:other + window]):
                repeats.append((start, other))
                break

    if repeats:
        start = repeats[0][0]
        mid = max(start + 1, len(cleaned) // 2)
        return [
            {"name": "Verse", "start": 0, "end": max(0, mid - 1)},
            {"name": "Chorus", "start": mid, "end": len(cleaned) - 1},
        ]

    split = max(1, len(cleaned) // 2)
    return [
        {"name": "Verse", "start": 0, "end": max(0, split - 1)},
        {"name": "Chorus", "start": split, "end": len(cleaned) - 1},
    ]


def make_pattern_for_chord(chord_name: str, index: int) -> Dict[str, Any]:
    quality = chord_quality(chord_name)
    root = parse_root(chord_name)
    lead_base = root if root in ROOTS else "C"
    return {
        "name": chord_name,
        "root": root,
        "quality": quality,
        "bass": infer_bass_note(chord_name),
        "lead_note": lead_base,
        "beats": 1 if index % 3 else 2,
        "speed": 0.35 if quality == "minor" else 0.65,
        "volume": 0.7 if quality == "minor" else 0.85,
        "style": "pop" if quality in {"major", "minor"} else "cinematic",
        "mood": "warm" if quality in {"major", "minor"} else "tense",
    }


def make_track(base_name: str, instrument: str, volume: float, entries: List[Dict[str, Any]], pattern_key: str) -> Dict[str, Any]:
    return {
        "name": base_name,
        "instrument": instrument,
        "volume": volume,
        "pattern": [
            {pattern_key: entry[pattern_key], "beats": entry["beats"], "speed": entry["speed"]} for entry in entries
        ],
    }


def build_band_plan(chords: List[str], style: str = "pop") -> Dict[str, Any]:
    cleaned = [str(chord or "C").strip() for chord in (chords or []) if str(chord or "").strip()]
    if not cleaned:
        cleaned = ["C", "G", "Am", "F"]

    items = [make_pattern_for_chord(chord, idx) for idx, chord in enumerate(cleaned)]
    sections = detect_sections(cleaned)
    style_key = str(style or "pop").lower()
    summary = f"{style_key.title()} arrangement generated from {len(cleaned)} chords"

    plan = {
        "style": style_key,
        "summary": summary,
        "sections": sections,
        "tracks": [
            {
                "name": "Bass",
                "instrument": "finger_bass",
                "volume": 0.76,
                "pattern": [
                    {"root": item["bass"], "beats": item["beats"], "mood": item["mood"]} for item in items
                ],
            },
            {
                "name": "Piano",
                "instrument": "acoustic_grand_piano",
                "volume": 0.82,
                "pattern": [
                    {"chord": item["name"], "beats": item["beats"], "speed": item["speed"]} for item in items
                ],
            },
            {
                "name": "Lead",
                "instrument": "flute",
                "volume": 0.62,
                "pattern": [
                    {"note": item["lead_note"], "beats": item["beats"], "speed": item["speed"]} for item in items
                ],
            },
            {
                "name": "Pad",
                "instrument": "violin",
                "volume": 0.55,
                "pattern": [
                    {"chord": item["name"], "beats": item["beats"] * 2, "sustain": True} for item in items
                ],
            },
        ],
        "arrangement": {
            "section_count": len(sections),
            "energy": "uplift" if style_key in {"pop", "rock"} else "cinematic",
            "density": "medium" if style_key in {"pop", "acoustic"} else "high",
        },
        "chord_mood": items,
    }
    return plan


if __name__ == "__main__":
    print(build_band_plan(["C", "G", "Am", "F", "C", "G", "Am", "F"]))
