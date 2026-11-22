# Anchor: a pixel art header for the Mochi page

An experiment (Ben, 2026-11-22): wordmarks may be harder than the
pixel art scenes, so try a scene in the header slot instead of the
MOCHI wordmark. Branch only, no merge without Ben's call.

Subject: Mochi, the blue plush blob from this page's portrait,
  sitting on a grassy rise in the meadow, under a big quiet sky.
Reference: Hyper Light Drifter, cliff vista. The device stolen: a
  small figure on a rise at one side gives the layered distance its
  scale, and the sky takes most of the frame and stays quiet.
Grid: 120 x 18 cells, displayed at the page column width (about
  358 x 54 at phone width, 576 x 86 on desktop), in the wordmark's
  slot above the divider.
Palette: slot palette as data in the module. The landscape slots
  borrow the gallery highland hexes; Mochi's slots are the
  portrait's own blue ramp hexes, so the header Mochi is the
  portrait Mochi in miniature. Both themes.
Colour budget: 16 slots, at most 15 unique hexes per theme. The
  sun slot wears the sky hex at night and the moon slot wears it
  by day, so the hidden orb costs nothing.
Outline rule: Mochi uses the portrait's graded outline, one ramp
  step deeper at its boundary and the full step at the base. The
  landscape has no outlines; each plane shades with its own
  darkest shade.
Light: one source, upper right. The sun sits upper right by day;
  the moon and stars take the upper left at night, the highland's
  arrangement. Mochi's form shading is computed once from the
  upper right and does not flip, the portrait's own behaviour.
Layers, back to front: sky with sun or moon and stars / one small
  cloud / the far hill, washed toward the sky / the near ground
  with its rise / Mochi on the rise / foreground tufts and two
  flower pairs.
Dither: none on the landscape. Flat clusters and a tip-shade rim
  row on each hill. Mochi's shade bands get the portrait's 2x2
  Bayer jitter at their boundaries, neighbouring ramp shades
  only, the way the portrait itself does it.
Motion, within the pixel rule: gusts in the meadow manner, a band
  rolling from the far hill toward the viewer while grass steps
  one rung up its ladder and back down, seeded rests between;
  Mochi blinks, the portrait's own swap, eyes to a flat line for
  240ms on seeded gaps of 5 to 12 seconds; one small cloud steps
  one column at a time on slow seeded holds, drawn over sky cells
  only, wrapping with a gap. Nothing drifts, nothing fades; every
  change is a whole-cell swap on a tick. Reduced motion: one
  static frame, eyes open, no timers.
Reads as a header, not a tenth scene: one subject, generous sky,
  quiet edges, nothing within a few cells of the left and right
  edges but sky and ground.
