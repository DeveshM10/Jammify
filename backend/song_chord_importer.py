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
# Every community-contributed strumming pattern, in full: which part of the
# song it's for ("Intro / Verse main pattern", "Chorus...", or "" when a
# tab has just one undifferentiated pattern), its subdivision resolution
# (denuminator -- 8 = eighth notes, 16 = sixteenths), and the per-slot codes
# that drive Ultimate Guitar's own strum-pattern arrows.
STRUMMING_ENTRY_RE = re.compile(
    r'"part"\s*:\s*"([^"]*)"\s*,\s*"denuminator"\s*:\s*(\d+)\s*,\s*"bpm"\s*:\s*(\d+)\s*,'
    r'\s*"is_triplet"\s*:\s*\d+\s*,\s*"measures"\s*:\s*\[(.*?)\]\s*\}'
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


def _bucket_from_free_text(text: str):
    """
    Same Verse/Chorus/Bridge bucketing as _normalize_section_name(), but for
    a strumming pattern's free-text "part" label ("Intro / Verse main
    pattern", "Chorus (arranged in 3 bar sections)") instead of a clean
    [Section] tag -- keyword search instead of an exact match. Returns None
    when the label doesn't mention a recognizable section at all (a tab
    with just one undifferentiated pattern leaves "part" empty).
    """
    lowered = text.lower()
    for keyword, bucket in SECTION_NAME_MAP.items():
        if keyword in lowered:
            return bucket
    return None


def _chords_from_tab_block(block: str, section: str, beats_per_line: float = BEATS_PER_LINE):
    """
    Parse one [tab]...[/tab] block: a chord line (one or more [ch] tags,
    left-padded with spaces to visually align above the lyric line beneath)
    followed by the lyric line itself.

    The character column each chord tag sits at, measured against the length
    of the lyric line, tells us what *fraction* of the bar that chord holds
    for -- a chord written above the first word of a line is held far longer
    than one written just before the last syllable.

    beats_per_line defaults to the standard 4-beat bar, but a song can state
    (via its own strumming pattern's length) that a section's lines are
    actually a different length -- see extract_song_metadata().
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
        beats = max(1, round((span / lyric_len) * beats_per_line))
        result.append({"name": name, "beats": beats, "section": section})

    return result


def _chords_from_freeform_line(line: str, section: str, beats_per_line: float = BEATS_PER_LINE):
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

    one_pass = [{"name": n, "beats": round(beats_per_line), "section": section} for n in names]
    return one_pass * repeat_count


def extract_chords_from_content(content: str, beats_per_line_by_section: dict = None, default_beats_per_line: float = BEATS_PER_LINE):
    """
    Walk the Ultimate Guitar chord sheet top to bottom, tracking section
    headers ([Verse], [Chorus]/[Refrain], [Bridge], [Instrumental], ...) and
    reconstructing each chord's real duration from the tab's line layout,
    instead of treating every [ch] tag as an identical 1-beat hit.

    beats_per_line_by_section (Verse/Chorus/Bridge -> real bar length) comes
    from the song's own strumming pattern lengths when available -- see
    extract_song_metadata() -- since a song's bar length isn't always the
    standard 4 beats for every section (Radiohead's "Let Down" explicitly
    runs its Verse as a 5-beat pattern "superimposed over 4/4").
    """

    beats_per_line_by_section = beats_per_line_by_section or {}

    def beats_for(section):
        return beats_per_line_by_section.get(section, default_beats_per_line)

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
                result.extend(_chords_from_freeform_line(line, current_section, beats_for(current_section)))

        result.extend(_chords_from_tab_block(match.group(1), current_section, beats_for(current_section)))
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
            result.extend(_chords_from_freeform_line(line, current_section, beats_for(current_section)))

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

    # Real per-eighth/sixteenth-note strum data, PER SONG SECTION -- a tab
    # can have a different pattern for Verse vs Chorus (Let Down does: a
    # 5-beat pattern "superimposed over 4/4" for Intro/Verse per the tab's
    # own written note, and a plain 4-beat pattern for the Chorus). Using
    # just one global pattern/bar-length for the whole song was silently
    # wrong for exactly this kind of song: BEATS_PER_LINE=4 assumed every
    # lyric line was a 4-beat bar, but Verse lines here are actually 5 beats
    # -- chords were changing 20% too fast, which is a real, audible "this
    # doesn't match the recording's pace" bug distinct from the BPM itself
    # being right or wrong.
    #
    # Rather than parse that free-text note (fragile -- it won't exist in
    # that exact wording on every tab), the strumming pattern's own length
    # already encodes its real bar length: attacks-count / slotsPerBeat.
    # Let Down's Intro/Verse pattern is 10 slots at 2 slots/beat = 5 beats,
    # exactly matching what the page says in words.
    strum_patterns_by_section = {}
    beats_per_line_by_section = {}
    default_strum_pattern = None
    default_beats_per_line = None

    for match in STRUMMING_ENTRY_RE.finditer(decoded):
        part, denuminator_str, _bpm, measures_str = match.groups()
        denuminator = int(denuminator_str)
        codes = MEASURE_CODE_RE.findall(measures_str)
        if not codes or denuminator <= 0:
            continue

        slots_per_beat = denuminator / 4
        pattern = {
            "slotsPerBeat": slots_per_beat,
            # True = strike here, False = let the previous strike ring
            # through (the confirmed "3 = downbeat sustain" rule).
            "attacks": [code != "3" for code in codes],
        }
        bar_beats = len(codes) / slots_per_beat

        bucket = _bucket_from_free_text(part)
        if bucket:
            strum_patterns_by_section[bucket] = pattern
            beats_per_line_by_section[bucket] = bar_beats
        elif default_strum_pattern is None:
            # No section keyword in "part" -- a tab with just one
            # undifferentiated pattern for the whole song (e.g. Raabta,
            # Bohemian Rhapsody's "General Pattern"). Applies everywhere
            # nothing more specific matched.
            default_strum_pattern = pattern
            default_beats_per_line = bar_beats

    return {
        "bpm": bpm,
        "tonality": tonality,
        "capo": capo,
        "strumPatternsBySection": strum_patterns_by_section,
        "defaultStrumPattern": default_strum_pattern,
        "beatsPerLineBySection": beats_per_line_by_section,
        "defaultBeatsPerLine": default_beats_per_line,
    }


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

    # Metadata comes first now -- chord *durations* depend on it whenever a
    # section's real bar length (from its own strumming pattern) isn't the
    # standard 4 beats (see extract_chords_from_content / extract_song_metadata).
    metadata = extract_song_metadata(html)

    beats_per_line_by_section = dict(metadata["beatsPerLineBySection"])
    default_beats_per_line = metadata["defaultBeatsPerLine"] or BEATS_PER_LINE

    chords = extract_chords_from_content(
        content,
        beats_per_line_by_section=beats_per_line_by_section,
        default_beats_per_line=default_beats_per_line,
    )

    if not chords:
        raise ValueError(
            "No chords were found in the song."
        )

    capo = metadata["capo"]

    if capo:
        for chord in chords:
            chord["name"] = transpose_chord_name(chord["name"], capo)

    key = metadata["tonality"]
    if key and capo:
        key = transpose_chord_name(key, capo)

    # Strum patterns keyed by section (Verse/Chorus/Bridge), plus a
    # "default" entry for songs with just one undifferentiated pattern --
    # the arrangement engine picks whichever matches each chord's own
    # section (see aiBandEngine.js).
    strum_patterns = dict(metadata["strumPatternsBySection"])
    if metadata["defaultStrumPattern"]:
        strum_patterns["default"] = metadata["defaultStrumPattern"]

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
        "strumPatterns": strum_patterns,
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
