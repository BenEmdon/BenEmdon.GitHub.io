---
layout: layouts/post.njk
title: RSS is still the best follow button
description: Sample post. A short argument for shipping an Atom feed with every personal blog.
date: 2026-09-28
tags: blog
sample: true
permalink: "/blog/{{ page.fileSlug }}/"
---

### <span class="prompt" aria-hidden="true">$</span> the pitch

This is a sample post, placeholder copy for a blog experiment. Nothing in it is published writing.

Every personal blog eventually faces the same question: how does a reader who liked one post hear about the next one? The usual answers are a newsletter, a social account, or hoping the algorithm notices. All three put a platform between the writer and the reader.

RSS skips the middleman. An Atom feed is a small XML file that lists posts in order. Any feed reader can poll it. The writer owns the file, the reader owns the subscription, and neither owes a platform anything.

### <span class="prompt" aria-hidden="true">$</span> why it fits here

A static site already has everything a feed needs: post titles, dates, and full HTML. Generating `/feed.xml` from the same source as the pages costs nothing extra and never drifts out of sync with the site. It is the cheapest possible follow button, and it works in every feed reader ever made.
