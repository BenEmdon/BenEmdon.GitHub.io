/*
  Gallery: a retro OS desktop, drawn the way everything on this page is
  drawn. A grid of cells, a palette kept as data, and a renderer that
  only ever swaps whole cells between palette colours.

  Refinement pass: the composition borrows Eastward's device, density
  with purpose. Every element gets a face (inset readout panel, bevelled
  window edges lit from the upper left, scrollbar arrows, a margin rule
  in the text window, nameplates with text dashes, a crumpled paper ball
  by the trash), and the landscape inside the picture window is built in
  planes like the other gallery pieces: banded sky, a disc sun, a
  two-tone far hill, a layered tree canopy with a cast shadow, and a
  path leading out of the frame. One grade of blues unifies it all.

  The static scene (menu bar, icons, two windows) is a cell map of
  palette keys built once by the draw helpers below. The text window's
  block cursor and the mouse pointer are overlays painted after the
  map: the cursor swaps on and off on a 530ms tick, and the pointer
  teleports between three resting spots on a slow seeded loop. It
  never glides. All variation is seeded, so the same code draws the
  same desktop every load, and reduced motion gets one static frame
  with the cursor solid and the pointer parked.
*/

import { registerTask } from "./boot.js?v=20261122p";
const W = 120;
const H = 45;

/* One geometry, two lightings. Ramps are shared across objects: the
   folder and the sun drink from the same warm ramp, the trash can and
   the disk from the same metal ramp. 16 keys: 13 distinct hexes in
   the light theme, 15 in the dark, inside the anchor budget of 16.
   The pointer keeps its own face colour so it stays lit at night
   while the windows around it dim. */
const PALETTES = {
  light: {
    ink: "#22354f",
    desk: "#3568b4",
    deep: "#2c5296",
    accent: "#1e5aa8",
    soft: "#6ea8e1",
    pale: "#a9cdf2",
    paper: "#eef3fb",
    text: "#54677f",
    cursor: "#1e5aa8",
    warm: "#f2c14e",
    warmDeep: "#c98f2a",
    green: "#58a05c",
    greenDeep: "#2f6b3a",
    metal: "#aebfd6",
    metalDeep: "#54677f",
    ptr: "#eef3fb",
  },
  dark: {
    ink: "#0b1322",
    desk: "#152a47",
    deep: "#0e1e35",
    accent: "#24507f",
    soft: "#6ea8e1",
    pale: "#86a9cf",
    paper: "#31445f",
    text: "#a9cdf2",
    cursor: "#6ea8e1",
    warm: "#d9a83e",
    warmDeep: "#a87c26",
    green: "#3d7a4c",
    greenDeep: "#22492c",
    metal: "#7e93ad",
    metalDeep: "#46586e",
    ptr: "#cfe1f4",
  },
};

/* mulberry32: small, fast, and the same stream on every load. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the static map ---------- */

const grid = new Array(W * H).fill("desk");
const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

function set(x, y, key) {
  if (inside(x, y)) grid[at(x, y)] = key;
}

function rect(x0, y0, x1, y1, key) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) set(x, y, key);
  }
}

function frame(x0, y0, x1, y1, key) {
  for (let x = x0; x <= x1; x += 1) {
    set(x, y0, key);
    set(x, y1, key);
  }
  for (let y = y0; y <= y1; y += 1) {
    set(x0, y, key);
    set(x1, y, key);
  }
}

function buildScene() {
  const rand = rng(20261120);

  /* Desktop dither: checker between the two neighbouring desktop
     blues, inside a few soft elliptical patches. Nothing else on the
     desktop is dithered. */
  const patches = [
    [34, 11, 15, 4],
    [101, 10, 11, 3],
    [30, 40, 19, 4],
    [105, 38, 12, 4],
    [66, 7, 12, 3],
  ];
  for (const [cx, cy, rx, ry] of patches) {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1 && (x + y) % 2 === 0) set(x, y, "deep");
      }
    }
  }

  /* ---------- menu bar ---------- */
  rect(0, 0, W - 1, 4, "paper");
  rect(0, 5, W - 1, 5, "ink");
  // A tiny diamond mark, standing in for a logo.
  set(3, 1, "accent");
  set(2, 2, "accent");
  set(3, 2, "pale");
  set(4, 2, "accent");
  set(3, 3, "accent");
  // Menu label dashes, with separator dots between the groups.
  for (const [a, b] of [[7, 12], [15, 21], [24, 28]]) rect(a, 2, b, 2, "metalDeep");
  set(13, 2, "metalDeep");
  set(22, 2, "metalDeep");
  // A readout panel left of the clock: metal inset, one dash inside.
  frame(98, 1, 107, 3, "metal");
  rect(100, 2, 105, 2, "metalDeep");
  // The clock: a 7x5 face in a metal frame, hands at twelve and four.
  frame(109, 0, 115, 4, "metalDeep");
  set(112, 2, "ink");
  set(112, 1, "ink");
  set(113, 2, "ink");

  /* ---------- desktop icons, down the left side ---------- */

  // Folder: warm back panel and tab, warmer front, outlined in its own deep.
  rect(4, 8, 8, 8, "warmDeep");
  rect(4, 9, 13, 13, "warmDeep");
  rect(3, 11, 14, 15, "warm");
  frame(3, 11, 14, 15, "warmDeep");
  rect(6, 13, 11, 13, "pale"); // a label strip on the folder's face
  rect(5, 16, 12, 16, "pale");
  rect(7, 16, 10, 16, "metalDeep"); // nameplate text

  // Floppy disk: deep body, metal shutter with its notch, paper label.
  rect(4, 18, 13, 25, "deep");
  frame(4, 18, 13, 25, "ink");
  rect(5, 18, 10, 21, "metal");
  rect(6, 19, 7, 20, "deep");
  rect(5, 22, 12, 25, "paper");
  rect(6, 23, 9, 23, "metalDeep");
  rect(6, 24, 11, 24, "metalDeep");
  rect(5, 26, 12, 26, "pale");
  rect(7, 26, 10, 26, "metalDeep");

  // A picture of the meadow, framed, as an icon.
  frame(3, 28, 14, 34, "ink");
  rect(4, 29, 13, 30, "pale");
  set(11, 29, "warm");
  set(12, 29, "warm");
  set(11, 30, "warm");
  set(12, 30, "warm");
  rect(4, 31, 9, 31, "soft");
  rect(10, 31, 13, 31, "pale");
  rect(4, 32, 13, 32, "green");
  rect(4, 33, 13, 33, "greenDeep");
  set(6, 32, "greenDeep");
  set(10, 32, "greenDeep");
  rect(5, 35, 12, 35, "pale");
  rect(7, 35, 10, 35, "metalDeep");

  // Trash can: lid with an overhang, tapered metal body, full ribs.
  rect(8, 36, 9, 36, "metalDeep");
  rect(3, 37, 14, 37, "metalDeep");
  rect(4, 38, 13, 40, "metal");
  rect(5, 41, 12, 43, "metal");
  frame(4, 38, 13, 40, "metalDeep");
  frame(5, 41, 12, 43, "metalDeep");
  for (const x of [6, 9, 12]) rect(x, 39, x, 40, "metalDeep");
  for (const x of [7, 10]) rect(x, 41, x, 42, "metalDeep");
  rect(5, 44, 12, 44, "pale");
  rect(7, 44, 10, 44, "metalDeep");
  // A crumpled paper ball that missed the can.
  set(16, 42, "paper");
  set(17, 42, "paper");
  set(16, 43, "paper");
  set(17, 43, "metalDeep");

  /* ---------- picture window ---------- */
  rect(29, 13, 81, 36, "deep"); // drop shadow, bottom-right
  rect(27, 10, 79, 10, "soft"); // bevel: lit top edge, light from upper left
  rect(26, 11, 26, 34, "soft"); // bevel: lit left edge
  rect(27, 11, 79, 34, "paper");
  frame(27, 11, 79, 34, "ink");
  // Title bar with pinstripes and a close box.
  rect(28, 12, 78, 12, "accent");
  rect(28, 13, 78, 13, "deep");
  rect(28, 14, 78, 14, "accent");
  frame(29, 12, 31, 14, "ink");
  set(30, 13, "paper");
  rect(48, 13, 53, 13, "paper");
  rect(55, 13, 62, 13, "paper");
  // The landscape inside. Sky first, banded: a soft row at the top,
  // one checker row stepping down to pale at the horizon.
  rect(28, 15, 78, 33, "pale");
  rect(28, 15, 78, 15, "soft");
  for (let x = 28; x <= 78; x += 1) {
    if (x % 4 === 0) set(x, 16, "soft");
  }
  // The sun, a disc now, shaded at its lower right.
  rect(34, 17, 35, 17, "warm");
  rect(33, 18, 36, 19, "warm");
  rect(34, 20, 35, 20, "warm");
  set(36, 19, "warmDeep");
  set(35, 20, "warmDeep");
  // The big cloud, rounder on top, with a shaded underside row.
  rect(57, 17, 62, 17, "paper");
  rect(54, 18, 66, 18, "paper");
  rect(56, 19, 64, 19, "paper");
  rect(58, 20, 63, 20, "soft");
  // A second, smaller cloud answering it from the right.
  rect(71, 16, 73, 16, "paper");
  rect(69, 17, 75, 17, "paper");
  rect(71, 18, 74, 18, "soft");
  // Far hill, a seeded smooth crest, two tones: soft above, accent
  // on its lowest rows so it sits behind the ground with weight.
  let crest = 24;
  for (let x = 28; x <= 78; x += 1) {
    if (x > 28 && x % 3 === 0) crest += rand() < 0.5 ? -1 : 1;
    crest = Math.max(20, Math.min(25, crest));
    for (let y = crest; y <= 26; y += 1) set(x, y, y >= crest + 3 ? "accent" : "soft");
  }
  // Near ground.
  crest = 27;
  for (let x = 28; x <= 78; x += 1) {
    if (x > 28 && x % 5 === 0) crest += rand() < 0.5 ? -1 : 1;
    crest = Math.max(26, Math.min(29, crest));
    for (let y = crest; y <= 33; y += 1) set(x, y, "green");
  }
  rect(28, 32, 78, 33, "greenDeep");
  // Grass tufts: small clusters on the deep band.
  for (const x of [31, 44, 52, 63, 71]) {
    set(x, 31, "green");
    set(x + 1, 31, "green");
    set(x, 32, "greenDeep");
  }
  // Speckle clusters in the green, two cells each, never singles.
  for (const [x, y] of [[34, 29], [49, 30], [59, 28], [67, 30], [74, 29]]) {
    set(x, y, "greenDeep");
    set(x + 1, y, "greenDeep");
  }
  // A pale path out of the tree's shade, stepping down to the corner.
  for (const [x, y] of [[47, 28], [48, 28], [49, 29], [50, 29], [51, 30], [52, 30], [53, 31], [54, 31]]) {
    set(x, y, "pale");
  }
  // The tree, left of centre so the text window cannot swallow it.
  // Layered canopy clusters: lit top and left, deep underside.
  rect(44, 18, 45, 18, "green");
  rect(43, 19, 46, 19, "greenDeep");
  set(43, 19, "green");
  set(44, 19, "green");
  set(45, 19, "green");
  rect(42, 20, 47, 21, "greenDeep");
  set(42, 20, "green");
  set(42, 21, "green");
  rect(43, 22, 46, 22, "greenDeep");
  rect(44, 23, 45, 27, "warmDeep");
  rect(43, 27, 46, 27, "warmDeep"); // root flare
  set(47, 27, "greenDeep"); // cast shadow, falling right
  set(48, 27, "greenDeep");
  set(47, 28, "greenDeep");
  // Flowers, deliberate single-cell details, warm and paper.
  set(38, 30, "warm");
  set(58, 30, "warm");
  set(70, 29, "warm");
  set(37, 29, "paper");
  set(69, 30, "paper");
  // A bottom scrollbar across the picture, classic chrome: metal
  // track, deep thumb, ink arrow dots at both ends.
  rect(28, 33, 78, 33, "metal");
  rect(40, 33, 52, 33, "metalDeep");
  set(29, 33, "ink");
  set(77, 33, "ink");

  /* ---------- text window, in front ---------- */
  rect(61, 21, 115, 44, "deep"); // drop shadow
  rect(59, 18, 113, 18, "soft"); // bevel: lit top edge
  rect(58, 19, 58, 42, "soft"); // bevel: lit left edge
  rect(59, 19, 113, 42, "paper");
  frame(59, 19, 113, 42, "ink");
  rect(60, 20, 112, 20, "accent");
  rect(60, 21, 112, 21, "deep");
  rect(60, 22, 112, 22, "accent");
  frame(61, 20, 63, 22, "ink");
  set(62, 21, "paper");
  rect(82, 21, 88, 21, "paper");
  rect(90, 21, 96, 21, "paper");
  // Text: rows of line segments, two cells tall, seeded once.
  const lines = [
    [[62, 75], [77, 88], [90, 97]],
    [[62, 70], [72, 84], [86, 101]],
    [[62, 79], [81, 90]],
    [[62, 68], [70, 82], [84, 93], [95, 99]],
    [[62, 73]],
  ];
  lines.forEach((segments, i) => {
    const y = 24 + i * 3;
    for (const [a, b] of segments) rect(a, y, b, y + 1, "text");
  });
  // A margin rule down the left of the text, notebook style.
  rect(61, 23, 61, 38, "metal");
  // A rule and status dashes near the foot of the window, plus a
  // small chip at the rule's right end.
  rect(60, 39, 109, 39, "metal");
  rect(62, 40, 72, 40, "metalDeep");
  rect(95, 40, 105, 40, "metalDeep");
  frame(108, 39, 110, 41, "metalDeep");
  set(109, 40, "metalDeep");
  // Scrollbar: metal track, deep thumb, ink arrow dots at the ends.
  rect(110, 23, 112, 38, "metal");
  rect(110, 24, 112, 28, "metalDeep");
  set(111, 23, "ink");
  set(111, 38, "ink");
}

/* The block cursor lives at the end of the last text line. */
const CURSOR = { x: 75, y: 36, w: 2, h: 2 };

/* The pointer: an arrow, edge and face, 9 cells wide and 13 tall. */
const POINTER = [
  "E........",
  "EE.......",
  "EPE......",
  "EPPE.....",
  "EPPPE....",
  "EPPPPE...",
  "EPPPPPE..",
  "EPPPPPPE.",
  "EPPPPPE..",
  "EPPPE....",
  "EPE.EPE..",
  "EE...EPE.",
  "......EE.",
];
const POINTER_SPOTS = [
  { x: 21, y: 36 }, // resting on the desktop
  { x: 52, y: 12 }, // up on the picture window's title bar
  { x: 86, y: 30 }, // inside the text window
];

/* ---------- wiring ---------- */

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

const resolvedTheme = () =>
  document.documentElement.dataset.theme ||
  (systemDark.matches ? "dark" : "light");

function setUpDesktop(canvas) {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting desktop", { timeout: 12000 });
  const ctx = canvas.getContext("2d");
  if (!ctx) { sceneTask.complete(); return; }

  let cursorOn = true;
  let visible = false;
  const spotRand = rng(19941014);
  const spotOrder = [0, 1, 2];
  // Seeded shuffle: the visiting order is fixed but not obvious.
  for (let i = spotOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(spotRand() * (i + 1));
    [spotOrder[i], spotOrder[j]] = [spotOrder[j], spotOrder[i]];
  }
  let orderPos = 0;

  function paint() {
    const pal = PALETTES[resolvedTheme()];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        ctx.fillStyle = pal[grid[at(x, y)]];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    if (cursorOn) {
      ctx.fillStyle = pal.cursor;
      ctx.fillRect(CURSOR.x, CURSOR.y, CURSOR.w, CURSOR.h);
    }
    const spot = POINTER_SPOTS[spotOrder[orderPos]];
    POINTER.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === ".") return;
        ctx.fillStyle = ch === "E" ? pal.ink : pal.ptr;
        ctx.fillRect(spot.x + dx, spot.y + dy, 1, 1);
      });
    });
  }

  paint();
  sceneTask.complete();

  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // One static frame, cursor solid.

  const observer = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  });
  observer.observe(canvas);

  (function blink() {
    setTimeout(() => {
      if (visible) {
        cursorOn = !cursorOn;
        paint();
      }
      blink();
    }, 530);
  })();

  (function wander() {
    const hold = 3500 + spotRand() * 3000;
    setTimeout(() => {
      if (visible) {
        orderPos = (orderPos + 1) % spotOrder.length;
        paint();
      }
      wander();
    }, hold);
  })();
}

buildScene();
const galleryCanvas = document.querySelector('[data-gallery="os"]');
if (galleryCanvas) setUpDesktop(galleryCanvas);
