+++
title = "[Sample] What a boot screen is actually for"
date = 2026-09-29
description = "Splash screens, honesty, and the two seconds before the content."
template = "post.html"
+++

> This is a sample post on an experiment branch. It exists to show how a post
> looks and reads in this design, nothing more.

A boot screen on a personal site is a strange thing to build. Nothing is
loading. The page is already there, sitting under the splash, fully rendered.
The log lines describe work that never happened: nothing was mounted, nothing
was resolved, and the whole performance takes about two seconds.

So why keep it? Because the first thing a visitor meets sets the terms for
everything after. Two seconds of braille spinners and checkmarks says this
page was made by someone who enjoys terminals, and it says it without a
single paragraph explaining the aesthetic. It is a handshake, not a status
report.

There are rules for this kind of theatre. It must be skippable: any key, any
click, and it is gone. It must respect reduced motion, which means not
appearing at all. It must never invent facts, so every log line repeats
something stated further down the page. And it must be short. A flourish that
runs long stops being a flourish and starts being a wait.

The deeper point is that every site has a boot screen of some kind. Most of
them are just slow. A skeleton loader, a spinner on a hero image, a layout
that jumps when the font arrives: these are all splash screens, except
nobody choreographed them. If the wait exists anyway, you might as well write
it yourself and make it say something true about you.
