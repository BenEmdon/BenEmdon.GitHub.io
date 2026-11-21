# Anchor and brief templates

## The anchor

Write this first, in the experiment's working notes, and build to it. Change the anchor on purpose or not at all.

```
Subject: <the one thing being drawn>
Grid: <width x height in cells, and display size>
Palette: <name, stored as data with hex values>
Colour budget: <hard cap, small pieces often 4 to 8, scenes 8 to 16>
Outline rule: <darkest shade of the outlined thing, or none>
Light: <one source, direction>
Layers, back to front: <sky / far / mid / subject / foreground>
Dither: <where allowed, between which shades, or none>
Motion, within the pixel rule: <what changes state, on what tick, or none>
```

## Scene brief for a coding agent

Fill the anchor slots, then add these working orders:

- Block the scene in flat clusters, back to front, before any detail or dither.
- Draw only from the palette data. Report the final colour count against the budget.
- Seed all variation. The same code must render the same picture every time.
- Render at 1x and at a large integer scale. Look at both, plus a black silhouette version and a greyscale version.
- Run at least three render, critique, fix passes against the critique checklist. Fix the worst thing per pass and log what changed.
- Deliver a page screenshot, a close screenshot, and a GIF of any reveal or state change, plus the branch and commit.

## Wordmark variant

- Treat letterforms as bitmap grids, one character per pixel map, drawn as solid clusters only.
- No dithering and no exterior anti-aliasing on letterforms. Hand-tune the curves and check for doubles.
- Test at the exact header size and at favicon size before calling it done. A wordmark that only works zoomed in does not work.

## Image model variant

- For a general image model, prompt with style first, then subject, era or console reference, view, named resolution, palette name plus colour count, outline and shading rules, and negations as plain sentences: no anti-aliasing, no blur, no gradients, no text.
- For a specialist pixel art model, describe the subject only and let the model own the rendering, then run the result through the deterministic conversion pipeline: nearest neighbour downscale, palette quantise, stray pixel cleanup.
