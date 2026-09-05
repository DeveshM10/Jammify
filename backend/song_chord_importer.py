import re
import html as html_lib

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

# One lyric/chord line is treated as one bar of music. This is the standard
# convention Ultimate Guitar transcribers follow for chords-over-lyrics sheets,
# and it's what lets us recover real chord *duration* instead of treating
# every [ch] tag as an identical 1-beat blip regardless of how long the tab
# actually holds it.
BEATS_PER_LINE = 4

CHORD_TAG_RE = re.compile(r"\[ch\](.*?)\[/ch\]", re.IGNORECASE | re.DOTALL)
TAB_BLOCK_RE = re.compile(r"\[tab\](.*?)\[/tab\]", re.IGNORECASE | re.DOTALL)
SECTION_HEADER_RE = re.compile(r"^\[([A-Za-z][A-Za-z0-9 \-'/]*)\]$")
REPEAT_SUFFIX_RE = re.compile(r"[xX]\s*(\d+)\s*$")

BPM_RE      = re.compile(r'"bpm"\s*:\s*(\d+)')
TONALITY_RE = re.compile(r'"tonality"\s*:\s*"([^"]*)"')
CAPO_RE     = re.compile(r'"capo"\s*:\s*(\d+)')
# The first community-contributed strumming pattern in full: its subdivision
# resolution (denuminator -- 8 = eighth notes, 16 = sixteenths) and the
# per-slot codes that drive Ultimate Guitar's own strum-pattern arrows.
FIRST_STRUMMING_RE = re.compile(
    r'"denuminator"\s*:\s*(\d+)\s*,\s*"bpm"\s*:\s*\d+\s*,\s*"is_triplet"\s*:\s*(\d+)\s*,'
    r'\s*"measures"\s*:\s*\[(.*?)\]\s*\}'
)
MEASURE_CODE_RE = re.compile(r'"measure"\s*:\s*(\d+)')

NOTE_TO_PC = {
    "C": 0, "B#": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4, "F": 5, "E#": 5, "F#": 6, "Gb": 6, "G": 7,
    "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11, "Cb": 11,
}
PC_TO_SHARP_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Ultimate Guitar section names collapsed down to the three buckets the
# arrangement engine understands (Verse / Chorus / Bridge dynamics).
SECTION_NAME_MAP = {
    "chorus": "Chorus",
    "refrain": "Chorus",
    "hook": "Chorus",
    "pre-chorus": "Verse",
    "prechorus": "Verse",
    "verse": "Verse",
    "intro": "Verse",
    "outro": "Verse",
    "instrumental": "Verse",
    "interlude": "Verse",
    "solo": "Verse",
    "bridge": "Bridge",
}


def fetch_page(url: str) -> str:
    """
    Download the webpage HTML.
    """

    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            "URL must start with http:// or https://"
        )

    response = requests.get(
        url,
        headers={
            "User-Agent": USER_AGENT
        },
        timeout=20
    )

    response.raise_for_status()

    return response.text


def get_page_title(html: str) -> str:
    """
    Get the page title.
    """

    soup = BeautifulSoup(
        html,
        "html.parser"
    )

    if soup.title:

        return soup.title.get_text(
            strip=True
        )

    return "Imported Song"


def extract_wiki_content(html: str) -> str:
    """
    Extract Ultimate Guitar's wiki_tab.content.

    Ultimate Guitar stores the actual chord sheet
    inside HTML-encoded application data.
    """

    # Ultimate Guitar uses &quot; around JSON keys/values.
    decoded = html_lib.unescape(html)

    # Find the wiki_tab content.
    match = re.search(
        r'"wiki_tab"\s*:\s*\{\s*"content"\s*:\s*"',
        decoded
    )

    if not match:
        raise ValueError(
            "Could not find Ultimate Guitar song content."
        )

    start = match.end()

    # The content is JSON-escaped.
    #
    # We need to find the closing quote while
    # respecting escaped quotes.
    content_chars = []

    escaped = False

    for char in decoded[start:]:

        if escaped:

            content_chars.append(char)
            escaped = False

            continue

        if char == "\\":
            escaped = True
            content_chars.append(char)
            continue

        if char == '"':
            break

        content_chars.append(char)

    raw_content = "".join(content_chars)

    # Decode JSON-style escaped characters.
    raw_content = bytes(
        raw_content,
        "utf-8"
    ).decode(
        "unicode_escape"
    )

    return raw_content


def _clean_chord_name(raw: str) -> str:
    return re.sub(r"\s+", "", raw.strip())


def _normalize_section_name(raw: str) -> str:
    key = raw.strip().lower()
    return SECTION_NAME_MAP.get(key, "Verse")


def _chords_from_tab_block(block: str, section: str):
    """
    Parse one [tab]...[/tab] block: a chord line (one or more [ch] tags,
    left-padded with spaces to visually align above the lyric line beneath)
    followed by the lyric line itself.

    The character column each chord tag sits at, measured against the length
    of the lyric line, tells us what *fraction* of the bar that chord holds
    for -- a chord written above the first word of a line is held far longer
    than one written just before the last syllable.
    """

    lines = [ln for ln in re.split(r"\r\n|\r|\n", block) if ln.strip() != ""]

    chord_positions = []  # (start_col, chord_name)
    lyric_len = 0

    for line in lines:
        tags = list(CHORD_TAG_RE.finditer(line))
        if tags:
            # This is a chord line -- strip the [ch]/[/ch] wrappers so the
            # remaining text's column positions match where the chord names
            # visually sit above the lyric line.
            stripped = CHORD_TAG_RE.sub(lambda m: _clean_chord_name(m.group(1)), line)
            cursor = 0
            for tag in tags:
                name = _clean_chord_name(tag.group(1))
                if not name:
                    continue
                col = stripped.find(name, cursor)
                if col == -1:
                    col = cursor
                chord_positions.append([col, name])
                cursor = col + len(name)
            lyric_len = max(lyric_len, len(stripped))
        else:
            # A lyric line (no chords on it) -- its length is what we divide
            # the preceding chord line's columns against.
            lyric_len = max(lyric_len, len(line.rstrip()))

    if not chord_positions:
        return []

    lyric_len = max(lyric_len, chord_positions[-1][0] + 1)

    result = []
    for i, (col, name) in enumerate(chord_positions):
        next_col = chord_positions[i + 1][0] if i + 1 < len(chord_positions) else lyric_len
        span = max(1, next_col - col)
        beats = max(1, round((span / lyric_len) * BEATS_PER_LINE))
        result.append({"name": name, "beats": beats, "section": section})

    return result


def _chords_from_freeform_line(line: str, section: str):
    """
    Parse a bare chord line outside a [tab] block, e.g. an instrumental
    break: "[ch]C[/ch] [ch]F[/ch] [ch]Am[/ch] [ch]G[/ch] x2".

    There's no lyric line to weigh column positions against here, so each
    chord is assumed to hold for a full bar -- the standard convention for
    a plain progression listing -- and a trailing "xN" repeats the whole
    phrase N times.
    """

    tags = list(CHORD_TAG_RE.finditer(line))
    if not tags:
        return []

    names = [_clean_chord_name(t.group(1)) for t in tags]
    names = [n for n in names if n]
    if not names:
        return []

    remainder = line[tags[-1].end():]
    repeat_match = REPEAT_SUFFIX_RE.search(remainder)
    repeat_count = int(repeat_match.group(1)) if repeat_match else 1
    repeat_count = max(1, min(repeat_count, 8))  # sanity cap

    one_pass = [{"name": n, "beats": BEATS_PER_LINE, "section": section} for n in names]
    return one_pass * repeat_count


def extract_chords_from_content(content: str):
    """
    Walk the Ultimate Guitar chord sheet top to bottom, tracking section
    headers ([Verse], [Chorus]/[Refrain], [Bridge], [Instrumental], ...) and
    reconstructing each chord's real duration from the tab's line layout,
    instead of treating every [ch] tag as an identical 1-beat hit.
    """

    current_section = "Verse"
    result = []
    cursor = 0

    # Walk [tab]...[/tab] blocks in order, treating any text between them
    # (section headers, freeform instrumental chord lines) separately.
    for match in TAB_BLOCK_RE.finditer(content):

        between = content[cursor:match.start()]
        for raw_line in re.split(r"\r\n|\r|\n", between):
            line = raw_line.strip()
            if not line:
                continue
            header = SECTION_HEADER_RE.match(line)
            if header:
                current_section = _normalize_section_name(header.group(1))
                continue
            if "[ch]" in line.lower():
                result.extend(_chords_from_freeform_line(line, current_section))

        result.extend(_chords_from_tab_block(match.group(1), current_section))
        cursor = match.end()

    # Trailing content after the last [tab] block.
    tail = content[cursor:]
    for raw_line in re.split(r"\r\n|\r|\n", tail):
        line = raw_line.strip()
        if not line:
            continue
        header = SECTION_HEADER_RE.match(line)
        if header:
            current_section = _normalize_section_name(header.group(1))
            continue
        if "[ch]" in line.lower():
            result.extend(_chords_from_freeform_line(line, current_section))

    return result


def extract_song_metadata(html: str):
    """
    Ultimate Guitar embeds real tempo and key data on the same page as the
    chord sheet -- a "strummings" array (community-contributed strum
    patterns, each carrying a real bpm) and a "meta" object with the song's
    actual tonality and capo position. None of this was being read before;
    every import fell back to a generic default tempo and a from-scratch
    guessed key regardless of what Ultimate Guitar already knew.

    Not every tab has strumming-pattern data (it's community-contributed,
    so less-visited tabs can lack it entirely) -- bpm is None when absent.
    """

    decoded = html_lib.unescape(html)

    bpm_match = BPM_RE.search(decoded)
    bpm = int(bpm_match.group(1)) if bpm_match else None

    tonality_match = TONALITY_RE.search(decoded)
    tonality = tonality_match.group(1) or None if tonality_match else None

    capo_match = CAPO_RE.search(decoded)
    capo = int(capo_match.group(1)) if capo_match else 0

    # Real per-eighth/sixteenth-note strum data: which slots get struck, and
    # (from a confirmed pattern, not a guess -- every "3" code lines up
    # exactly with a downbeat across every example checked) which slots on
    # the beat should sustain the previous strum instead of re-striking.
    # Direction (down/up) isn't part of this data at all -- it's standard
    # alternating strokes by slot position, universal guitar technique, not
    # something that needs to be read from the page.
    strum_pattern = None
    strumming_match = FIRST_STRUMMING_RE.search(decoded)
    if strumming_match:
        denuminator = int(strumming_match.group(1))
        codes = MEASURE_CODE_RE.findall(strumming_match.group(3))
        if codes and denuminator > 0:
            strum_pattern = {
                "slotsPerBeat": denuminator / 4,
                # True = strike here, False = let the previous strike ring
                # through (the confirmed "3 = downbeat sustain" rule).
                "attacks": [code != "3" for code in codes],
            }

    return {"bpm": bpm, "tonality": tonality, "capo": capo, "strumPattern": strum_pattern}


def _transpose_note_name(name: str, semitones: int) -> str:
    """
    Shift a single note name (e.g. "F#", "Bb") up by `semitones`,
    preferring sharps for the result (matches the frontend's own
    normalizeRoot() convention in aiBandEngine.js).
    """

    match = re.match(r"^([A-G])([#b]?)(.*)$", name)
    if not match:
        return name

    letter, accidental, rest = match.groups()
    pc = NOTE_TO_PC.get(letter + accidental)
    if pc is None:
        return name

    new_pc = (pc + semitones) % 12
    return PC_TO_SHARP_NAME[new_pc] + rest


def _transpose_chord_symbol(symbol: str, semitones: int) -> str:
    """Transpose one chord symbol's root, keeping its quality suffix intact."""
    match = re.match(r"^([A-G])([#b]?)(.*)$", symbol)
    if not match:
        return symbol
    letter, accidental, suffix = match.groups()
    return _transpose_note_name(letter + accidental, semitones) + suffix


def transpose_chord_name(name: str, semitones: int) -> str:
    """
    Transpose a full chord symbol -- root, quality suffix, and slash bass
    note if present -- up by `semitones`. A capo shifts the actual sounding
    pitch above whatever's written in the chart (that's the whole point of
    a capo: play familiar open shapes, sound in a different key), so a
    chart written for "capo 3" with a G chord actually SOUNDS a minor third
    higher, at Bb. Playing the literal written chord name back as audio
    without this transform means a capo'd song is in the wrong key by
    construction, regardless of how accurate everything else is.
    """

    if semitones == 0:
        return name

    if "/" in name:
        top, bass = name.split("/", 1)
        return f"{_transpose_chord_symbol(top, semitones)}/{_transpose_chord_symbol(bass, semitones)}"

    return _transpose_chord_symbol(name, semitones)


def import_chords_from_url(url: str):

    parsed = urlparse(url)
    path = (parsed.path or "").lower()

    if "/backing_track/" in path:
        raise ValueError(
            "This URL is a backing track page, not a chord tab. Please paste a standard Ultimate Guitar song/chord page URL."
        )

    html = fetch_page(url)

    title = get_page_title(html)

    try:
        content = extract_wiki_content(html)
    except ValueError as exc:
        raise ValueError(
            "This Ultimate Guitar page does not contain a chord sheet. Please use a regular song tab/chord URL instead."
        ) from exc

    chords = extract_chords_from_content(
        content
    )

    if not chords:
        raise ValueError(
            "No chords were found in the song."
        )

    metadata = extract_song_metadata(html)
    capo = metadata["capo"]

    if capo:
        for chord in chords:
            chord["name"] = transpose_chord_name(chord["name"], capo)

    key = metadata["tonality"]
    if key and capo:
        key = transpose_chord_name(key, capo)

    return {
        "title": title,
        "chords": chords,
        # None when Ultimate Guitar has no community-contributed strumming
        # pattern for this tab (bpm) or no tonality set (key) -- the caller
        # falls back to its own genre-based guess / chord-based key
        # detection in that case, same as before this existed.
        "bpm": metadata["bpm"],
        "key": key,
        "capo": capo,
        "strumPattern": metadata["strumPattern"],
    }


def main():

    song_url = "https://tabs.ultimate-guitar.com/tab/misc-soundtrack/agent-vinod-raabta-chords-1179968"

    result = import_chords_from_url(
        song_url
    )

    for c in result["chords"]:
        print(c)


if __name__ == "__main__":
    main()
