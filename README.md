# Experiment: personal site as a Hugo blog

This branch rebuilds [benemdon.github.io](https://benemdon.github.io) in
[Hugo](https://gohugo.io) and adds a real blog, to see what a blog-shaped
version of the current design feels like. It is one of three stack
experiments (Hugo, Zola, Eleventy). Do not merge without deciding first.

## Layout

- `hugo.toml`: site config: baseURL, title, RSS outputs for home and
  sections, taxonomies disabled.
- `layouts/_default/baseof.html`: the shared shell: full `<head>` (fonts,
  GoatCounter, OG tags, canonical, RSS link), keys panel, boot overlay,
  `main.js`. Asset URLs go through Hugo's `relURL`.
- `layouts/index.html`: the homepage. All sections ported verbatim
  (whoami, about, thinking, writing, work, elsewhere), plus a `writing`
  section showing the latest 3 posts with an "all posts / rss" line.
- `layouts/_default/list.html`: the `/blog/` index, in the site's
  terminal style (`$ ls blog`).
- `layouts/_default/single.html`: per-post pages, with a date and
  reading-time line.
- `layouts/partials/`: `header.html` (wordmark masthead), `footer.html`
  (Ottawa clock, keys/theme toggles), `divider.html`.
- `static/`: the original CSS and JS copied through unchanged, plus one
  new stylesheet, `assets/css/blog.css`, for post typography in the same
  idiom. Also `favicon.svg`, `robots.txt`, `og-card.html`, `.nojekyll`.
- `content/blog/`: `_index.md` plus two sample posts, both clearly marked
  as samples, in a neutral tech-blogger voice, with no claims about Ben.
- `.github/workflows/hugo.yaml`: Hugo's official Pages workflow (Hugo
  0.167.0). The repo's Pages source must be switched to "GitHub Actions"
  for it to run; this branch does not change that setting.

## Ported vs changed

- Ported: all homepage copy and sections, the full `<head>`, the boot
  overlay, the keys panel, the footer, the wordmark.
- Changed: asset URLs now go through `relURL` so they resolve from any page
  depth; the homepage gains a `writing` section with the latest 3 posts and
  keeps the same six keyboard shortcuts; post pages get a date/reading-time
  line and a back-to-blog link.

## Known shortcuts (experiment only)

- The two JPEGs (`assets/img/ben.jpg`, `assets/img/og-card.jpg`) are
  hotlinked from the live site rather than committed: binary files cannot be
  pushed through this experiment's tooling. A real port commits them under
  `static/assets/img/`.
- `.well-known/brave-rewards-verification.txt` was not ported: its token is
  redacted from API reads, so the file cannot be reproduced exactly.

## Preview locally

```sh
hugo server
```

then open http://localhost:1313.
