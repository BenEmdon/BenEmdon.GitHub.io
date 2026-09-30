---
layout: layouts/post.njk
title: A minimal Eleventy blog on GitHub Pages
description: Sample post. What this experiment's setup actually consists of, and what Eleventy does for it.
date: 2026-09-29
tags: blog
sample: true
permalink: "/blog/{{ page.fileSlug }}/"
---

### <span class="prompt" aria-hidden="true">$</span> what this is

This is a sample post, placeholder copy for a blog experiment. Nothing in it is published writing. It exists to show what a post looks like in this site's terminal-inspired design.

### <span class="prompt" aria-hidden="true">$</span> the moving parts

Eleventy takes Markdown files and Nunjucks templates and turns them into plain HTML. The whole site builds to a `_site` directory of static files, which GitHub Pages serves as-is. There is no server, no database, and nothing to keep patched at runtime.

The blog part is three ideas:

- Posts are Markdown files in `src/blog/`. Writing one is creating a file.
- A collection named `blog` gathers them, and the blog index lists them newest first.
- An Atom feed is generated at `/feed.xml` from the same collection, so readers can follow along in any feed reader.

### <span class="prompt" aria-hidden="true">$</span> why the design survives

The existing hand-built CSS and JavaScript are copied through the build untouched. The homepage is the same markup it always was, just assembled from a template. Posts reuse the same tokens, the same grid, and the same section framing, so the blog reads as part of the site rather than a second site bolted on.

```bash
npx @11ty/eleventy --serve
```

That one command is the whole local workflow: it builds the site and reloads the browser on every save.
