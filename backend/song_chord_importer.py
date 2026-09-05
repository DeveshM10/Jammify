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

    return {
        "title": title,
        "chords": chords,
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
