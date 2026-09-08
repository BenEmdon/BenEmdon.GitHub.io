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

## Analytics

Visits are counted by [GoatCounter](https://www.goatcounter.com), free for
personal sites. The dashboard is at <https://benemdon.goatcounter.com>. It sets
no cookies, stores no personal data and needs no consent banner, and the whole
integration is the two script tags at the bottom of `index.html`'s `<head>` —
still no build step.

The site code in `data-goatcounter` is public, and has to be: anything counting
visits from the browser names its destination in the page source. It is a
write-only endpoint, not a key — it cannot read the dashboard, so putting it in
a GitHub secret would hide it from the repo and not from anyone viewing source.
The one thing it does allow is a mirrored copy of the page reporting into the
same dashboard, which the hostname check in the `path` callback blocks. **Moving
to a custom domain means adding that hostname there, or counting stops.**

Append `#toggle-goatcounter` to the URL once to stop counting your own visits on
that browser.

## Running it

Any static server will do:

```sh
python3 -m http.server 4321
```

Pushing to `master` publishes the site.
