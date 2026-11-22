/*
  The Mochi page's title, drawn instead of typeset: the word MOCHI as
  hand-drawn pixel letterforms on a canvas, an experiment standing in
  for the cell-built font wordmark the other pages use.

  The letterforms borrow the carved-logo device from game title
  lettering (the Owlboy and Celeste logo family): thick solid strokes,
  a lit top edge, a full outline in the ramp's darkest blue, shade
  pooled at the base, and a drop shade two cells down behind the whole
  word, so it reads as one lit object before any detail registers.
  The bitmaps below are the drawing; the bevel is derived from them by
  rule (top skin within the letter's top band is highlight, bottom
  skin and the lower right skin are shade, the rest is face), the same
  data-plus-renderer shape as everything else on this page.

  The palette is the portrait's blue ramp, one map per theme, so the
  title and the portrait below it are lit the same way. The only
  accents are the meadow's, rationed: two tiny flowers and three grass
  tufts along the baseline, and one twinkle star high right.

  Motion stays inside the pixel rule. On load the word lights in
  column bands of eight per 75ms tick, whole cells swapping from the
  page background to their final colour; nothing drifts or fades.
  After that the title is still except the star, which swaps between
  a five-cell cross and its centre cell on a slow seeded tick. A
  theme swap repaints the current frame in the other palette.
  Reduced motion gets the full title in one static render.

  Self-contained: it looks for a canvas marked [data-pixel-title]
  and does nothing if there is none.
*/

const W = 120;
const H = 20;
const LETTER_TOP = 3;
const TRACKING = 3;

/* The letters, row by row. Thirteen cells tall, stroke three, one
   shared baseline. Solid clusters only: no dither on letterforms. */
const LETTERS = {
  M: [
    "###........###",
    "###........###",
    "#####....#####",
    "##.###..###.##",
    "##..##..##..##",
    "##...####...##",
    "##....##....##",
    "###........###",
    "###........###",
    "###........###",
    "###........###",
    "###........###",
    "###........###",
  ],
  O: [
    ".###########.",
    "#############",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "#############",
    ".###########.",
  ],
  C: [
    "..########..",
    ".##########.",
    "###.......##",
    "###........#",
    "###.........",
    "###.........",
    "###.........",
    "###.........",
    "###.........",
    "###.........",
    "###.......##",
    ".##########.",
    "..########..",
  ],
  H: [
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "#############",
    "#############",
    "#############",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
    "###.......###",
  ],
  I: [
    "#######",
    "#######",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "..###..",
    "#######",
    "#######",
  ],
};
const ORDER = ["M", "O", "C", "H", "I"];

/* One slot order for both themes, the portrait's ramp plus the
   meadow's three accent slots. Eight colours per theme, the budget. */
const PALETTES = {
  light: {
    outline: "#2e4470",
    shade: "#4763a0",
    face: "#6486c4",
    hi: "#a9c3ec",
    drop: "#dfe6f0",
    flower: "#d95f4b",
    centre: "#f2c14e",
    tuft: "#58a05c",
  },
  dark: {
    outline: "#1c2a4a",
    shade: "#37497a",
    face: "#6d8fc6",
    hi: "#a9cdf2",
    drop: "#04060c",
    flower: "#e0684f",
    centre: "#f2c14e",
    tuft: "#3f7d49",
  },
};

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const resolvedTheme = () =>
  document.documentElement.dataset.theme ||
  (systemDark.matches ? "dark" : "light");

// Seeded, so the twinkle rhythm is the same visit to visit in
// structure without Math.random at render time.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSilhouette() {
  const widths = ORDER.map((c) => LETTERS[c][0].length);
  const total = widths.reduce((a, b) => a + b, 0) + TRACKING * (ORDER.length - 1);
  let x = Math.floor((W - total) / 2);
  const sil = new Set();
  const spans = [];
  for (const c of ORDER) {
    const rows = LETTERS[c];
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === "#") sil.add(`${x + dx},${LETTER_TOP + dy}`);
      });
    });
    spans.push([x, x + rows[0].length - 1]);
    x += rows[0].length + TRACKING;
  }
  return { sil, spans };
}

const STAR = [106, 2];

/* starFrame 0 is the five-cell cross, 1 is the centre cell alone. */
function buildGrid(starFrame) {
  const { sil, spans } = buildSilhouette();
  const grid = new Map();
  const key = (x, y) => `${x},${y}`;

  // Drop shade first, behind everything: the silhouettes shifted two
  // cells down, showing only where the letters do not cover them.
  for (const cell of sil) {
    const [x, y] = cell.split(",").map(Number);
    const p = key(x, y + 2);
    if (!sil.has(p)) grid.set(p, "drop");
  }
  // The outline ring: one cell around the silhouette, in the ramp's
  // darkest blue.
  for (const cell of sil) {
    const [x, y] = cell.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const p = key(x + dx, y + dy);
        if (!sil.has(p) && !grid.has(p)) grid.set(p, "outline");
      }
    }
  }
  // The bevel, derived per column: highlight on the top skin when it
  // sits in the letter's top band (deeper top skins are the letters'
  // inner steps and stay face), shade on the bottom skin and the cell
  // above it where the column reaches the base, and on the right
  // skin's lower half. Everything else is face.
  const cols = new Map();
  for (const cell of sil) {
    const [x, y] = cell.split(",").map(Number);
    if (!cols.has(x)) cols.set(x, []);
    cols.get(x).push(y);
  }
  const letterBottom = LETTER_TOP + 12;
  for (const cell of sil) {
    const [x, y] = cell.split(",").map(Number);
    const ys = cols.get(x);
    const top = Math.min(...ys);
    const bot = Math.max(...ys);
    if (y === top && y <= LETTER_TOP + 2) grid.set(cell, "hi");
    else if (y === bot || (y === bot - 1 && bot >= letterBottom - 1)) grid.set(cell, "shade");
    else if (!sil.has(key(x + 1, y)) && y > LETTER_TOP + 6) grid.set(cell, "shade");
    else grid.set(cell, "face");
  }
  // The meadow details along the baseline: two flowers, three tufts.
  const base = letterBottom + 2;
  const flower = (cx) => {
    grid.set(key(cx - 1, base - 1), "flower");
    grid.set(key(cx, base - 1), "centre");
    grid.set(key(cx + 1, base - 1), "flower");
    grid.set(key(cx, base), "tuft");
  };
  const tuft = (cx) => {
    grid.set(key(cx - 1, base), "tuft");
    grid.set(key(cx, base - 1), "tuft");
    grid.set(key(cx + 1, base), "tuft");
  };
  flower(spans[0][0] + 2);
  flower(spans[4][1] - 2);
  tuft(Math.floor((spans[1][0] + spans[1][1]) / 2));
  tuft(Math.floor((spans[2][0] + spans[2][1]) / 2) + 3);
  tuft(Math.floor((spans[3][0] + spans[3][1]) / 2));
  // The twinkle star.
  const [sx, sy] = STAR;
  grid.set(key(sx, sy), "hi");
  if (starFrame === 0) {
    grid.set(key(sx - 1, sy), "hi");
    grid.set(key(sx + 1, sy), "hi");
    grid.set(key(sx, sy - 1), "hi");
    grid.set(key(sx, sy + 1), "hi");
  }
  return grid;
}

function setUpPixelTitle() {
  const canvas = document.querySelector("[data-pixel-title]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let starFrame = 0;
  let reveal = W; // columns lit so far; the boot steps this to W

  function paint() {
    const palette = PALETTES[resolvedTheme()];
    const grid = buildGrid(starFrame);
    ctx.clearRect(0, 0, W, H);
    for (const [cell, slot] of grid) {
      const [x, y] = cell.split(",").map(Number);
      if (x >= reveal) continue;
      ctx.fillStyle = palette[slot];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // A theme swap repaints the current frame in the other palette, the
  // way every other picture on this page handles it.
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) {
    paint(); // one static render, the full title
    return;
  }

  // Boot: the word lights in column bands of eight per 75ms tick.
  reveal = 0;
  paint();
  const boot = setInterval(() => {
    reveal = Math.min(W, reveal + 8);
    paint();
    if (reveal >= W) {
      clearInterval(boot);
      scheduleTwinkle();
    }
  }, 75);

  const rng = mulberry32(20261122);
  function scheduleTwinkle() {
    setTimeout(() => {
      if (!document.hidden) {
        starFrame = starFrame === 0 ? 1 : 0;
        paint();
      }
      scheduleTwinkle();
    }, 900 + rng() * 700);
  }
}

setUpPixelTitle();
