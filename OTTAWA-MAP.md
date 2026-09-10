# The Ottawa map

An ASCII map of Ottawa that lived at the bottom of the site for one day, in
the register [git-merge.com](https://git-merge.com) uses for Lisbon. Pulled
from `master` because the page reads better short, kept here whole in case it
ever gets a page of its own.

`tools/ottawa-map.py` is the source the art is generated from. Edit the grid
there and run it; it prints the HTML for both sizes to `/tmp/map/`. Do not
hand-edit the art in `index.html` — it is generated, and the whole thing falls
apart the moment two rows disagree on width.

```sh
python3 tools/ottawa-map.py
```

## What it draws

Terrain, not a diagram. Land is shaded `░`, the built-up core steps up to `▒`,
water is `~`, the Gatineau hills are `^`, and Parliament is the one block
landmark. The Rideau Canal leaves the river at the locks just east of it and
runs south; the Rideau River comes up from the south-east to meet the Ottawa.

The first attempt was a labelled schematic — a compass arrow, four place names
in a row, connecting bars — and it read as an org chart. That is the failure
mode to avoid. git-merge's map carries **no labels at all**; Ottawa's outline
is not iconic enough to get away with that, so the names here are stamped into
the terrain character for character. That is why naming something can never
change a row's width.

Two sizes: 58 columns for a real screen, 30 for a phone, switching at 34rem.
The narrow one is the same city with the outer suburbs cropped, not the wide
one shrunk to nothing.

## Traps, all of which cost a round trip

**Iosevka advances 0.6em per column, not 0.5em.** A canvas `measureText` will
tell you 0.5em, and that reading is a fallback font — the family name never
resolved in the canvas context. Measure off a rendered element instead. Sized
off the wrong number the art was 44px too wide and *nothing looked broken*:
`base.css` caps every `pre` at `max-width: 100%`, so it squared off at the
container width and `overflow: hidden` quietly ate the east end of the city.
The tell is `scrollWidth > clientWidth`, not anything you can see.

**`base.css` fills any hovered link's cell with the accent colour and inverts
the text.** The map is wrapped in an `<a>`, so hovering it flooded the whole
thing green and swapped land and water. If you re-add it, keep the
`background: none` override — the frame is the hover signal.

**`line-height` is 1 on the art, not the page's 24px.** This is a picture, and
leading between its rows is a gap torn through the middle of it. What has to
land on the `--step` grid is the block's own height, which the padding does.

**Check the glyphs before drawing with them.** Every character the map uses is
in Iosevka at one column, verified. `✓`, `✗`, `◓`, `→`, `●` and `■` are all
*double* width there and will shear a monospace grid apart.

## Bringing it back

Everything is in this branch's tip commit: the `<figure class="ottawa">` in
`index.html` and the `.ottawa*` rules at the end of
`assets/css/components.css`.

```sh
git show ottawa-map:index.html                  # the markup, art included
git show ottawa-map:assets/css/components.css   # the rules, at the end
```

Note that this branch also still has the `site-footer` wrapper and the shorter
`body` bottom padding, both of which existed only to let the map sit outside
the reading column. `master` has since retired them, so a straight cherry-pick
will not apply cleanly — take the figure and the CSS block, not the diff.
