# Critique checklist, the gate

Run every item on the final render of each pass. A failed cold read or silhouette test means redesign, not polish.

## Cold read

- Show the piece at 1x to fresh eyes, or simulate it honestly. One sentence naming the subject means it reads. A sentence that cannot name the subject is a fail.
- Squint or blur test: the main shapes and the light pattern still read.

## Mechanical

- Colour count is within the anchor budget, and every colour in the render is in the palette data.
- No semi-transparent or off-palette pixels.
- Export and display only at integer scales. Fractional scaling breaks pixels into uneven sizes.

## Craft

- Silhouette reads as a solid black shape.
- Greyscale version holds together, values separate the layers.
- One light source, consistent everywhere. No pillow shading.
- Ramps shift hue, cooler shadows and warmer highlights. No straight brightness-only ramps.
- No banding: no equal width shade bands hugging each other or following an outline.
- No jaggies: diagonal step sizes are even on straights and change gradually on curves.
- No doubles on corners or line joins.
- No orphan single pixels, outside deliberate details named in the anchor.
- Outlines are the darkest shade of what they surround, not one flat colour everywhere.

## Dither

- Dither appears only between neighbouring ramp shades.
- Dither appears only on large, still, low contrast areas named in the anchor.
- Flat areas left undithered exist, so dither has contrast.
- No dither on letterforms, small subjects, or anything that changes state.

## Site fit

- Nothing moves, drifts, or fades. Every change is a whole-cell swap on a tick.
- Reduced motion renders the full piece in one static cut.
- Both themes checked, or the piece is deliberately fixed ink and paper.
- Cell and DOM cost stated, and modest.

## Report

- Passes run, worst thing fixed per pass, final colour count, remaining weak spots named plainly.
