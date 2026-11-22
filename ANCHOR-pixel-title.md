# Anchor: a drawn pixel title for the Mochi page

Subject: the word MOCHI as hand-drawn pixel letterforms, the page's title.
It replaces the cell-built font wordmark in this experiment only.

Reference: game title lettering, the Owlboy and Celeste logo family.
Device stolen: the carved-logo bevel. Letters are thick solid blocks with
a lit top edge, a full dark outline, shade pooled at the base, and an
offset drop shade behind them, so the word reads as one lit object
before any detail registers. From Owlboy's art itself: two-tone clusters
for any foliage detail, and warm accents rationed to a couple of cells.

Grid: 120 x 20 cells. Displayed at full column width: 358px on a 390px
phone (cell about 3px), 576px on desktop (cell 4.8px). Letters 13 cells
tall, stroke 3, on a shared baseline, rows 3 to 15 of the grid.

Palette: the portrait's blue ramp, the site accent family, stored as
data in the module. One map, two themes, same slot order as the
portrait's palettes. Letters use five slots: outline (the ramp's darkest
blue), shade (deep), face (mid/body), highlight (pale, leaning warm at
the very top skin), drop (a pale blue-grey by day, near-black blue by
night). Details borrow three more: flower red, flower centre gold,
tuft green, the meadow's accents, rationed to a handful of cells.
Colour budget: 8 per theme, hard cap.

Outline rule: the darkest shade of the letter ramp, one cell, full ring.
The top skin of each column trades outline-adjacent face cells for
highlight instead, so the light reads as coming from above.

Light: from above, slightly left. Highlight on the top skin of every
column, shade on the bottom skin plus a second cell where the column
reaches the letter's bottom band, and on the right skin's lower half.

Layers, back to front: drop shade (the letter silhouettes shifted two
cells down, showing only where the letters do not cover it), the letters
(outline, shade, face, highlight), then the details: two tiny flowers
and three grass tufts along the baseline, one twinkle star high right.

Dither: none. The checklist forbids dither on letterforms, and the
details are too small to carry it. Flat clusters only.

Motion, within the pixel rule: a boot reveal, columns lighting in bands
of eight per 75ms tick, left to right, whole cells swapping from the
page background to their final colour. Then stillness, except the
twinkle star, which swaps between a five-cell cross and its centre cell
on a slow seeded tick. Nothing drifts, nothing fades. Reduced motion
gets the full title in one static render, no timers.

Deliberate single-purpose details, named here so they are not orphans:
the twinkle star, two flowers, three tufts. A mini blob at the baseline
is a prototype question, not part of the anchor; it joins only if the
critique says the composition wants it.
