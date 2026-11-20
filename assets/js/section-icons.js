// Experiment: section icons.
// Vanilla JS, no build step. One hand-drawn 10x10 pixel icon per section
// header, drawn from the string maps below onto a small canvas shown at
// exactly 2x beside the $ prompt.
//
// Pixel rule: the grid is fixed. When a section title scrolls into view,
// its icon lights in place over 8 steps on the site's 75ms tick: cells
// start in the faint --page-rule shade and swap whole to their final
// shade in a fixed diagonal order. Nothing moves, nothing fades.
// prefers-reduced-motion: every icon renders in its final state at once.
//
// Palette is data, read from the site's own tokens via a probe element
// (custom properties come back unresolved from getPropertyValue, so the
// probe's computed background is the reliable read):
//   D = --icon-deep, M = --accent-color, L = --accent-pulse-color.
// Three shades, no dithering at this size, no single-pixel orphans:
// every detail is a cluster of two or more cells.

const STEP_MS = 75;
const STEPS = 8;

const ICONS = {
  whoami: [
    "..........",
    "...DDDD...",
    "..DMMMMD..",
    "..DLLMMD..",
    "..DMMMMD..",
    "...DDDD...",
    "..DMMMMD..",
    ".DMMMMMMD.",
    ".DMMMMMMD.",
    "..DDDDDD..",
  ],
  about: [
    "..........",
    "..........",
    ".DDD..DDD.",
    ".DLLDDLLD.",
    ".DMMDDMMD.",
    ".DLLDDLLD.",
    ".DMMDDMMD.",
    "..DDDDDD..",
    "..........",
    "..........",
  ],
  thinking: [
    "..........",
    "...DDDD...",
    "..DLLLLD..",
    ".DLLLLLLD.",
    ".DLLMMLLD.",
    "..DLMMLD..",
    "...DDDD...",
    "...DMMD...",
    "...DDDD...",
    "..........",
  ],
  work: [
    "..........",
    "..........",
    "...DDDD...",
    "...D..D...",
    ".DDDDDDDD.",
    ".DLLLLLLD.",
    ".DDDLLLDDD",
    ".DMMMMMMD.",
    ".DMMMMMMD.",
    ".DDDDDDDD.",
  ],
  elsewhere: [
    "..........",
    "...DDDD...",
    "..DMMMMD..",
    ".DMMMMLMD.",
    ".DMMMLMMD.",
    ".DMMDMMMD.",
    ".DMDMMMMD.",
    "..DMMMMD..",
    "...DDDD...",
    "..........",
  ],
};

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function readPalette() {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const read = (token) => {
    probe.style.backgroundColor = `var(${token})`;
    return getComputedStyle(probe).backgroundColor;
  };
  const palette = {
    D: read("--icon-deep"),
    M: read("--accent-color"),
    L: read("--accent-pulse-color"),
    unlit: read("--page-rule"),
  };
  probe.remove();
  return palette;
}

// Cells of one icon in lighting order: bucketed by diagonal (x + y) into
// STEPS groups, so the icon assembles corner to corner in whole steps.
function cellsInOrder(rows) {
  const cells = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") {
        cells.push({ x, y, ch, step: Math.floor(((x + y) / 18) * STEPS) });
      }
    });
  });
  return cells;
}

function draw(canvas, palette, litThrough) {
  const cells = canvas._cells;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 10, 10);
  for (const cell of cells) {
    ctx.fillStyle = cell.step <= litThrough ? palette[cell.ch] : palette.unlit;
    ctx.fillRect(cell.x, cell.y, 1, 1);
  }
}

function setUp() {
  let palette = readPalette();
  const states = [];

  for (const canvas of document.querySelectorAll("[data-sec-icon]")) {
    const rows = ICONS[canvas.dataset.secIcon];
    if (!rows) continue;
    canvas._cells = cellsInOrder(rows);
    const state = { canvas, lit: false, timer: null };
    states.push(state);

    if (reduced.matches) {
      state.lit = true;
      draw(canvas, palette, STEPS);
      continue;
    }

    draw(canvas, palette, -1);
    const title = canvas.closest(".section__title");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || state.lit) continue;
          state.lit = true;
          observer.disconnect();
          let step = 0;
          state.timer = setInterval(() => {
            draw(canvas, palette, step);
            step += 1;
            if (step > STEPS) {
              clearInterval(state.timer);
              state.timer = null;
            }
          }, STEP_MS);
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(title);
  }

  // Theme flips change every palette value. Repaint lit icons in their
  // final state and unlit icons in the new unlit shade, in one cut.
  const repaint = () => {
    palette = readPalette();
    for (const state of states) {
      if (state.timer) continue;
      draw(state.canvas, palette, state.lit ? STEPS : -1);
    }
  };
  new MutationObserver(repaint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", repaint);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setUp);
} else {
  setUp();
}
