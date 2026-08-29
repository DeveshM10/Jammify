from __future__ import annotations

from typing import List, Dict, Any

ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def normalize_root(root: str) -> str:
    if not root:
        return "C"
    value = str(root).strip().upper()
    if value in {"CB", "B#"}:
        return "C"
    if value == "DB":
        return "C#"
    if value == "EB":
        return "D#"
    if value == "GB":
        return "F#"
    if value == "AB":
        return "G#"
    if value == "BB":
        return "A#"
    return value


def chord_quality(chord_name: str) -> str:
    name = str(chord_name or "C").upper().strip()
    if "M" in name and "7" not in name and "9" not in name and "6" not in name:
        return "major"
    if "MIN" in name or "-" in name or "m" in name:
        return "minor"
    if "7" in name:
        return "dominant"
    if "DIM" in name or "°" in name:
        return "diminished"
    if "AUG" in name or "+" in name:
        return "augmented"
    return "major"


def parse_root(chord_name: str) -> str:
    cleaned = str(chord_name or "C").strip()
    match = next((part for part in [
        cleaned.split("/")[0],
        cleaned.split(" ")[0],
        cleaned
    ] if part), "C")
    root = "".join(ch for ch in match if ch.isalpha() or ch in "#b")
    if not root:
        return "C"
    if len(root) == 1:
        return root.upper()
    return normalize_root(root)


def infer_bass_note(chord_name: str) -> str:
    root = parse_root(chord_name)
    return root


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
    }


def build_band_plan(chords: List[str], style: str = "pop") -> Dict[str, Any]:
    items = [make_pattern_for_chord(chord, idx) for idx, chord in enumerate(chords or [])]
    plan = {
        "style": style,
        "summary": f"{style.title()} arrangement generated from {len(items)} chords",
        "tracks": [
            {
                "name": "Bass",
                "instrument": "finger_bass",
                "volume": 0.75,
                "pattern": [
                    {"root": item["bass"], "beats": item["beats"]} for item in items
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
                "volume": 0.6,
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
        "chord_mood": items,
    }
    return plan


if __name__ == "__main__":
    print(build_band_plan(["C", "G", "Am", "F", "C", "G", "Am", "F"]))
