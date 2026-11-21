# Anchor: neon city

Subject: a neon rain city at night. Rooftops under haze, warm signs, rain, a wet street.
Grid: 120 x 45 cells, displayed full column width like the other gallery scenes.
Reference: Blade Runner's mood. Composition borrows Hyper Light Drifter's washed
far planes (distance goes pale toward the sky, the near plane keeps the contrast)
and Eastward's rationed warm accents (a few warm signs carry all the warmth).
Palette: stored as data in gallery-neoncity.js, one slot order for both themes.
Colour budget: 16 per theme, hard cap.
Outline rule: no drawn outlines. Planes separate by value alone; a rooftop's top
row takes the haze-lit edge slot, its own lightest shade.
Light: one story. The signs are the light. Warm sign blocks glow against
blue-grey haze and throw broken reflections into the street band. Everything
else is ambient dusk or night.
Layers, back to front: sky haze gradient / far skyline, washed / the spinner,
a small flying vehicle on the far plane / mid skyline / near rooftops with
signs, a water tank, one antenna with a beacon / wet street with reflections /
rain, as an overlay of single cells in fixed columns.
Dither: only in the sky, between the two neighbouring sky shades, sampled per
two-cell pair from the hash the way the seaside sky does it. Signs and windows
stay flat clusters. The street's breakup is flecks, not dither.
Motion, within the pixel rule: the spinner steps one whole cell on a sparse
seeded timer, holds off-frame for seconds, and re-enters. Rain columns are
fixed; on a tick, the lit cells in a few columns swap one shade in place and
swap back. The antenna beacon swaps between its lit and unlit slots on a slow
tick. Nothing drifts, nothing fades. Reduced motion gets one static frame.

## Pass log

Pass 1: cold read passed (city, signs, reflections), but the street was only
six rows and the reflections filled it at 0.8 density: the amber streak read
as a mirrored sign, almost lettering, and the coral streak was a smear at the
frame's bottom edge. The spinner could not be found at all, and the rain was
invisible.
Pass 2: reflections inset to the signs' own columns, density 0.62 falling
0.09 a row, highlight flecks cut to 0.15. The spinner's body moved to the
near shade, its lamp doubled, and its lane rose. Reflections now read as
shimmer. The spinner still hid among the far tower tops.
Pass 3: the far skyline's tops dropped below the spinner's lane, so the
spinner crosses open sky as a dark speck with a coral tail light. Mid and
near window warmth trimmed (0.05 to 0.035 and 0.04) so the signs own the
warmth. Rain: four cells a column, six columns lit a tick, the dark rain
shade one step brighter. Final count: exactly 16 colours per theme, all
on-palette, verified from the canvas. Reduced motion renders the full
static frame. Weak spots left: in a still frame the rain specks can read
as stars; the mid windows in the gap left of the amber sign cluster a
little like a small lit billboard; the dusk theme's parapet edge sits
close in value to the mid plane behind it.
