# Ottawa, drawn the way git-merge draws Lisbon: terrain first, not a diagram.
# Land is shaded, water is ~, the built-up core steps up to ▒, the Gatineau
# hills are ^, and Parliament is the one block landmark.
#
# Geography this is trying to be true to:
#   - the Ottawa River runs west to east across the top; Gatineau, QC is the
#     far bank
#   - Parliament Hill sits on the bluff on the south bank
#   - the Rideau Canal leaves the river at the locks just east of Parliament
#     and runs south, widening at Dow's Lake
#   - the Rideau River comes up from the south-east to meet the Ottawa
#   - Westboro is west along the river, outside the dense core
#
# Place names are stamped into the terrain character for character rather than
# laid out around it, so a label can never change a row's width and pull the
# columns apart.

FULL = [
    "  ^^^   ^^^^^^   ^^^  ^^^^^^^^   ^^^^^  ^^^   ^^^^^^^   ^",
    " ^^^^^^^  ^^^  ^^^^^^^^^   ^^^^^^^  ^^^^^^^   ^^^  ^^^^^^",
    "░░░░ ^^ ░░░░░░░░ ^^^^ ░░░░░░░░ ^^^ ░░░░░░ ^^^^ ░░░░░░░ ^^░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
    "═════════╗░░░░╔═════════════╗░░░░░░░░░░░╔═══╗░░░░░╔═══════",
    "~~~~~~~~~╚════╝~~~~~~~~~~~~~╚═══════════╝~~~╚═════╝~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~~~▄~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~~~█~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    "════════════╗~~~~~~~~~~╔═▄█▄═╗~~╔═══════════╗~~~~~~~~~~~~~",
    "░░░░░░░░░░░░╚══════════╝░███░║~~║░░░░░░░░░░░╚═══════╗~~~~~",
    "░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒███▒║~~║▒▒▒▒▒░░░░░░░░░░░░░░╚═════",
    "░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒║~~║▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░",
    "░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║~~║▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░",
    "░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒╚╗~╚╗▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░",
    "░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒░║~~║▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░",
    "░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒░░╚╗~~╚╗▒▒░░░░░░░░░░░░░░░~~~░░░",
    "░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒░░░░░║~~~~║░░░░░░░░░░░░░░~~~~░░░░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╔╝~~~~╚╗░░░░░░░░░░░~~~~░░░░░░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░║~~~~~~║░░░░░░░░░~~~~░░░░░░░░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╚╗~~~~╔╝░░░░░░░~~~~░░░░░░░░░░",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░╚═╗~╔╝░░░░░░~~~~░░░░░░░░░░░░",
]

# (row, col, text) — stamped over the terrain in place.
FULL_LABELS = [
    (4,  25, "gatineau"),
    (8,  10, "ottawa river"),
    (14, 21, "parliament"),
    (15, 1,  "westboro"),
    (20, 39, "rideau canal"),
]

# The same city with the outer suburbs cropped, for a phone.
COMPACT = [
    " ^^^  ^^^^^   ^^^  ^^^^^^  ^^^",
    "░░ ^^ ░░░░ ^^^ ░░░░░ ^^^ ░░░░ ",
    "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
    "═════╗░░░╔═════════╗░░░╔══════",
    "~~~~~╚═══╝~~~~~~~~~╚═══╝~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~▄~~~~~~~~~~~~~~~~",
    "══════╗~~~~╔═█═╗~~╔═══════════",
    "░░░░░░╚════╝▄█▄║~~║░░░░░░░░░░░",
    "░░░░░░░░░▒▒▒███▒║~~║▒▒▒░░░░░░░",
    "░░░░░░░▒▒▒▒▒▒▒▒▒║~~║▒▒▒▒▒░░░░░",
    "░░░░░░░░▒▒▒▒▒▒▒▒╚╗~╚╗▒▒▒░░░░░░",
    "░░░░░░░░░░▒▒▒▒▒▒░║~~║░░░░░~~░░",
    "░░░░░░░░░░░░░░░░░╚╗~~╚╗░░~~~░░",
    "░░░░░░░░░░░░░░░░░░║~~~║░~~~░░░",
    "░░░░░░░░░░░░░░░░░░╚═╗~╚╗~~░░░░",
]

COMPACT_LABELS = [
    (5,  1,  "ottawa river"),
    (10, 0,  "westboro"),
    (9,  20, "parliament"),
    (14, 1,  "canal"),
]

import html

WATER, MARK = set("~"), set("█▄▀")


def stamp(rows, labels):
    grid = [list(r) for r in rows]
    marks = [[None] * len(r) for r in rows]
    for row, col, text in labels:
        assert row < len(grid), f"label row {row} past the art"
        assert col + len(text) <= len(grid[row]), f"label {text!r} runs off row {row}"
        for k, ch in enumerate(text):
            grid[row][col + k] = ch
            marks[row][col + k] = "label"
    return grid, marks


def classify(ch, mark):
    if mark == "label":
        return "ottawa__label"
    if ch in WATER:
        return "ottawa__water"
    if ch in MARK:
        return "ottawa__pin"
    return None


def render(rows, labels):
    grid, marks = stamp(rows, labels)
    out = []
    for line, mline in zip(grid, marks):
        parts, i = [], 0
        while i < len(line):
            cls = classify(line[i], mline[i])
            j = i
            while j < len(line) and classify(line[j], mline[j]) == cls:
                j += 1
            chunk = html.escape("".join(line[i:j]))
            parts.append(f'<span class="{cls}">{chunk}</span>' if cls else chunk)
            i = j
        out.append("".join(parts))
    return "\n".join(out)


def normalize(name, rows):
    """Pad or trim to the most common width, repeating each row's own last
    character. Every row here ends in open terrain, so extending one adds more
    of the same ground rather than smearing a coastline glyph sideways."""
    from collections import Counter
    target = Counter(len(r) for r in rows).most_common(1)[0][0]
    out = []
    for i, r in enumerate(rows):
        if len(r) != target:
            print(f"  {name} row {i:2d}: {len(r)} -> {target}")
            r = r[:target] if len(r) > target else r + r[-1] * (target - len(r))
        out.append(r)
    return out


for name, rows, labels in (("full", FULL, FULL_LABELS), ("compact", COMPACT, COMPACT_LABELS)):
    rows = normalize(name, rows)
    widths = {len(r) for r in rows}
    assert len(widths) == 1
    open(f"/tmp/map/{name}.html", "w").write(render(rows, labels))
    print(f"{name}: {len(rows)} rows x {widths.pop()} cols  OK")
