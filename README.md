# benemdon.github.io

My personal site. A static page served straight from this repo by GitHub Pages —
no build step, no dependencies, no framework.

## Layout

```
index.html            all of the copy
assets/css/tokens.css design tokens (colour, type, spacing)
assets/css/base.css   reset and element defaults
assets/css/layout.css page structure
assets/css/components.css  the dithered portrait
assets/js/wordmark.js the pixel-grid name
assets/js/dither.js   ordered dithering, shared by portrait and wordmark
assets/js/main.js     wiring and the theme toggle
```

## The two rules worth knowing

**Vertical rhythm.** `--step` is `1.5rem` (24px) and `line-height` is set to that
same absolute value, so every line of text — at any size — lands on a 24px grid.
Vertical spacing is only ever whole steps. Adding a half-step anywhere breaks the
grid for everything below it.

**Colour.** Each semantic token is declared once as `light-dark(light, dark)`.
Themes swap via `color-scheme`, which the OS sets and `[data-theme]` overrides,
so there is no second copy of the palette to keep in sync.

## Running it

Any static server will do:

```sh
python3 -m http.server 4321
```

Pushing to `master` publishes the site.
