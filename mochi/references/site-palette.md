# Palettes

## Ben's site, verified values

The site is a terminal page with a blue accent family and an ink and paper duotone for the portrait. Pull theme values from the site's CSS variables at build time where the piece is theme-aware, these hex values are the recorded anchors.

- Accent, light theme: #1e5aa8
- Accent, dark theme: #6ea8e1
- Accent pulse, light theme: #6ea8e1
- Accent pulse, dark theme: #a9cdf2
- Portrait treatment: fixed ink on paper duotone, Bayer dither for tone, scrambled block reveal. New photo-based pieces should match this treatment.

Build ramps from these anchors with hue shifting: rotate shadow steps toward blue and purple and lower their saturation, blend highlight steps a little toward warm yellow and raise saturation slightly. The shift can stay subtle inside the site's blue family, it still separates layers better than a straight brightness ramp.

## Reference palettes, names and sizes

Use these as starting points when a piece wants its own palette, then store the chosen palette as hex data in the piece itself. A name alone is not data.

- PICO-8, 16 colours
- Game Boy, 4 shades
- DawnBringer 16 and DawnBringer 32
- Endesga 32 and Endesga 64
- Sweetie 16
- Resurrect 64
- AAP-64

## Budget guidance

- Small marks and wordmarks: 3 to 5 colours, including a tinted dark instead of pure black.
- Single subject pieces: 2 to 4 shades per colour ramp.
- Layered scenes: 8 to 16 colours total, shared across layers so the scene harmonises. Reuse ramp colours between objects instead of giving every object its own ramp.
