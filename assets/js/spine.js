// EXPERIMENT: reactive dither spine.
//
// The spine beside the reading column is a picture that is also the
// page's minimap, its reading progress, and a second, slower clock.
//
// - One segment per .section, in document order. The section straddling
//   the centre of the viewport (the same centre-line rule main.js uses
//   for its section frames) is current: its cells are all lit.
//   Sections above it are past: half their cells lit, chosen by a Bayer
//   4x4 threshold, so a read segment is a half-tone. Sections below are
//   future: outline only.
// - A 4x4 block at the base encodes the Ottawa day. Its cells light in
//   Bayer order, so the lit count is the day's progress in sixteenths
//   and the pattern stays an even dither at every step, never a bar
//   filling from one corner.
// - Every segment is a button and jumps to its section, mirroring the
//   keyed jumps in main.js, including the hash update.
//
// The pixel rule, as everywhere on this site: cells are fixed on their
// grid and only snap on or off in place. Scroll and pointer input are
// quantized before use (scroll to whole segments and whole strip
// cells, the pointer to a whole segment by the button it is over).
// When a new section becomes current, its cells light one row per
// 75ms tick, the site's --motion-step, rather than all at once or in a
// fade. Under prefers-reduced-motion every state is set in one cut.

const COLS = 4;
const ROWS = 6;

// Bayer 4x4, values 0 to 15 in row-major order. One matrix serves both
// jobs here: its lower half is the past-segment dither, and its rank
// order is the sequence the day block lights in.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const TICK = 75;
const STRIP_CELLS = 60;

function cells(parent, count) {
  const made = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "spine__cell";
    parent.append(el);
    made.push(el);
  }
  return made;
}

function setUpSpine() {
  const spine = document.querySelector("[data-spine]");
  const strip = document.querySelector("[data-spine-strip]");
  const sections = [...document.querySelectorAll(".section")];
  if (!sections.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- segments ---------- */

  const segments = [];
  if (spine) {
    for (const button of spine.querySelectorAll("[data-spine-seg]")) {
      const grid = button.querySelector("[data-spine-cells]");
      const segmentCells = cells(grid, COLS * ROWS);
      const section = sections.find(
        (s) => s.querySelector("[id]")?.id === button.dataset.target
      );
      if (section) segments.push({ button, cells: segmentCells, section });
    }
  }

  let current = -1;
  let revealTimer = 0;

  function paint(segment, state, rowsLit = ROWS) {
    segment.cells.forEach((cell, i) => {
      cell.classList.remove("is-on", "is-dither");
      if (state === "past" && BAYER[i % 16] < 8) cell.classList.add("is-dither");
      if (state === "current" && Math.floor(i / COLS) < rowsLit) {
        cell.classList.add("is-on");
      }
    });
    if (state === "current") segment.button.setAttribute("aria-current", "true");
    else segment.button.removeAttribute("aria-current");
  }

  function setCurrent(next) {
    if (next === current) return;
    current = next;
    clearInterval(revealTimer);
    revealTimer = 0;

    segments.forEach((segment, i) => {
      if (i < next) paint(segment, "past");
      else if (i > next) paint(segment, "future");
    });
    const segment = segments[next];
    if (!segment) return;

    // One row per tick, top to bottom: the segment arrives as a small
    // stepped wipe, then holds fully lit for as long as it is current.
    if (reduced.matches) {
      paint(segment, "current");
      return;
    }
    let rows = 0;
    paint(segment, "current", rows);
    revealTimer = setInterval(() => {
      rows += 1;
      paint(segment, "current", rows);
      if (rows >= ROWS) {
        clearInterval(revealTimer);
        revealTimer = 0;
      }
    }, TICK);
  }

  // Centre line, same as main.js: a zero-height band at the middle of
  // the viewport, and whichever section last arrived keeps the state
  // across the dividers between sections.
  const centreLine = new IntersectionObserver(
    (entries) => {
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (!arrived) return;
      const index = segments.findIndex((s) => s.section === arrived.target);
      if (index >= 0) setCurrent(index);
    },
    { rootMargin: "-50% 0px -50% 0px" }
  );
  for (const segment of segments) centreLine.observe(segment.section);
  if (segments.length) setCurrent(0);

  for (const segment of segments) {
    segment.button.addEventListener("click", () => {
      segment.section.scrollIntoView({
        behavior: reduced.matches ? "auto" : "smooth",
        block: "start",
      });
      history.replaceState(null, "", `#${segment.section.querySelector("[id]").id}`);
      setCurrent(segments.indexOf(segment));
    });
  }

  /* ---------- day block ---------- */

  // His time, not the reader's, matching the footer clock in main.js.
  // Only the share of the day is taken from it, never the time itself:
  // the footer already says the time in digits, and this block saying
  // it again in pixels would be a second clock, not a different one.
  const dayGrid = document.querySelector("[data-spine-day-cells]");
  const dayBlock = document.querySelector("[data-spine-day]");
  if (dayGrid && dayBlock) {
    const dayCells = cells(dayGrid, 16);
    const inOttawa = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    function paintDay() {
      const parts = Object.fromEntries(
        inOttawa.formatToParts(new Date()).map(({ type, value }) => [type, value])
      );
      const minutes = Number(parts.hour) * 60 + Number(parts.minute);
      const lit = Math.round((minutes / 1440) * 16);
      dayCells.forEach((cell, i) => {
        cell.classList.toggle("is-on", BAYER[i] < lit);
      });
      const pct = Math.round((minutes / 1440) * 100);
      dayBlock.title = `Ottawa day: ${pct}% through`;
      dayBlock.setAttribute("aria-label", `Ottawa day ${pct} percent through`);
      setTimeout(paintDay, 60_000 - (Date.now() % 60_000));
    }
    paintDay();
  }

  /* ---------- narrow-screen strip ---------- */

  if (strip) {
    const stripCells = [];
    for (let i = 0; i < STRIP_CELLS; i++) {
      const el = document.createElement("span");
      el.className = "spine-strip__cell";
      strip.append(el);
      stripCells.push(el);
    }

    let litCount = -1;
    let ticking = false;

    function paintStrip() {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      // Quantized: the strip can only change when the count of whole
      // lit cells changes, so slow scrolling steps it rather than
      // sliding it.
      const next = Math.round(progress * STRIP_CELLS);
      if (next === litCount) return;
      litCount = next;
      stripCells.forEach((cell, i) => {
        cell.classList.toggle("is-on", i < litCount);
      });
    }

    addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(paintStrip);
        }
      },
      { passive: true }
    );
    paintStrip();
  }

  reduced.addEventListener("change", () => {
    clearInterval(revealTimer);
    revealTimer = 0;
    if (segments[current]) paint(segments[current], "current");
  });
}

setUpSpine();
