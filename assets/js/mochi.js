/*
  Mochi, in pixels, plus this page's theme toggle.

  The portrait is drawn the way the meadow is: a grid of cells, a palette
  kept as data, and a renderer that only ever swaps whole cells between
  palette colours. The one behaviour is a blink. The eye arcs trade places
  with a flat closed line for two ticks, on an irregular timer, and that is
  all. Nothing moves, nothing fades, and reduced motion gets one static
  render with the eyes open.

  main.js is not loaded on this page: it assumes the home page's DOM
  (wordmark, sections, boot screen) and would throw without it. The theme
  toggle below is the same logic in miniature, same localStorage key and
  same system, light, dark cycle, so a choice made on either page holds
  on both.
*/

/* ---------- theme ---------- */

const THEME_KEY = "theme";
const MODES = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return MODES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

const resolvedTheme = () =>
  document.documentElement.dataset.theme ||
  (systemDark.matches ? "dark" : "light");

/* ---------- the portrait ---------- */

const W = 48;
const H = 48;

// One geometry, two lightings, like the meadow's day and night. The ramp
// shifts hue as it steps: the highlight leans lighter and warmer, the
// shadows lean cooler and deeper toward indigo. No pure black anywhere;
// the face uses the ramp's own tinted dark.
const PALETTES = {
  light: {
    bg: "#edf1f8",
    shadow: "#bccdea",
    spark: "#a9c3ec",
    hi: "#a9c3ec",
    body: "#7f9fd8",
    mid: "#6486c4",
    deep: "#4763a0",
    outline: "#2e4470",
    face: "#141c2e",
  },
  dark: {
    bg: "#101827",
    shadow: "#26334e",
    spark: "#a9cdf2",
    hi: "#93b1e2",
    body: "#6d8fc6",
    mid: "#50699c",
    deep: "#37497a",
    outline: "#1c2a4a",
    face: "#0a0f1c",
  },
};

// The dome, row by row: [first cell, last cell] for each row that has body
// in it. Round on top, widest low, a short taper under the base so the
// character sits rather than floats.
const PROFILE = {
  10: [20, 27],
  11: [18, 29],
  12: [16, 31],
  13: [15, 32],
  14: [14, 33],
  15: [13, 34],
  16: [12, 35],
  17: [12, 35],
  18: [11, 36],
  19: [11, 36],
  20: [10, 37],
  21: [10, 37],
  22: [10, 37],
  23: [10, 37],
  24: [10, 37],
  25: [10, 37],
  26: [10, 37],
  27: [10, 37],
  28: [10, 37],
  29: [10, 37],
  30: [10, 37],
  31: [10, 37],
  32: [10, 37],
  33: [10, 37],
  34: [10, 37],
  35: [10, 37],
  36: [10, 37],
  37: [11, 36],
  38: [11, 36],
  39: [12, 35],
  40: [12, 35],
  41: [13, 34],
  42: [15, 32],
};

const inBody = (x, y) => {
  const row = PROFILE[y];
  return row !== undefined && x >= row[0] && x <= row[1];
};

// A 2x2 Bayer pattern, used the way the portrait dither uses ordered
// patterns: a small jitter at shade boundaries so the bands on the dome
// do not march in equal widths. It tiles in 2x2 blocks rather than single
// cells, so the transitions read as clusters, not speckle. Only
// neighbouring ramp shades ever mix.
const BAYER_2 = [
  [0, 2],
  [3, 1],
];

// Form shading from one light source, upper right. Each body cell gets a
// light value from its position, the value picks a ramp shade, and the
// Bayer jitter softens the pick at the edges of each band.
function bodyShade(x, y) {
  const light = (x - 24) * 0.9 - (y - 20) * 0.8;
  const jitter = (BAYER_2[y % 2][x % 2] - 1.5) * 0.5;
  const v = light + jitter;
  if (v > 7) return "hi";
  if (v > -3) return "body";
  if (v > -13) return "mid";
  return "deep";
}

// One step darker along the body ramp, for the graded outline below.
const DEEPEN = {
  hi: "body",
  body: "mid",
  mid: "deep",
  deep: "outline",
  outline: "outline",
};

// The face. Eyes are single-cell arcs, the closed happy eyes from the
// avatar: a peak in the middle, ends stepping down and out. The smile is
// one gentle arc under them. Face cells are drawn over the shading and
// never outlined.
const EYE_OPEN = [
  // left eye
  [17, 20], [16, 21], [18, 21], [15, 22], [19, 22],
  // right eye
  [30, 20], [29, 21], [31, 21], [28, 22], [32, 22],
];

// The blink frame: each arc swaps for a flat line one row tall, on the
// arc's own base row.
const EYE_SHUT = [
  [15, 22], [16, 22], [17, 22], [18, 22], [19, 22],
  [28, 22], [29, 22], [30, 22], [31, 22], [32, 22],
];

const SMILE = [
  [19, 26], [28, 26],
  [20, 27], [27, 27],
  [21, 28], [26, 28],
  [22, 29], [23, 29], [24, 29], [25, 29],
];

// Backdrop sparkles: two four-point stars and three single dots, the
// deliberate single pixels the anchor allows. All sit clear of the body.
const SPARKS = [
  [6, 11], [5, 11], [7, 11], [6, 10], [6, 12],
  [41, 15], [40, 15], [42, 15], [41, 14], [41, 16],
  [8, 26], [42, 28], [24, 5], [5, 36],
];

// The ground shadow: two flat rows of the deeper backdrop shade, tucked
// under the base.
const SHADOW = [];
for (let x = 14; x <= 33; x += 1) SHADOW.push([x, 43]);
for (let x = 17; x <= 30; x += 1) SHADOW.push([x, 44]);

// Build the grid of palette keys for one eye state. Painted fresh on every
// theme change and every blink step, so a swap mid-blink lands on the
// current state rather than replaying anything.
function buildGrid(eyesShut) {
  const grid = new Array(W * H).fill("bg");
  const set = (x, y, key) => {
    grid[y * W + x] = key;
  };

  for (const [x, y] of SPARKS) set(x, y, "spark");
  for (const [x, y] of SHADOW) set(x, y, "shadow");

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!inBody(x, y)) continue;
      let key = bodyShade(x, y);
      // Selective outline, graded: a boundary cell deepens one ramp step
      // rather than jumping straight to the darkest shade, so the
      // silhouette is defined without a hard dark wall. The bottom edge
      // deepens the full step, and the base row, already at the ramp's
      // deep end, lands on the outline shade. The left edge deepens too
      // but stops at deep, so a lone outline cell never warts out of the
      // shadow side. On the lit top and right edges a plain body cell
      // steps to mid; a highlight cell there stays a highlight and reads
      // as rim light.
      const edgeBottom = !inBody(x, y + 1);
      const edgeLeft = !inBody(x - 1, y);
      const edgeLit = !inBody(x, y - 1) || !inBody(x + 1, y);
      if (edgeBottom) key = DEEPEN[key];
      else if (edgeLeft) key = DEEPEN[key] === "outline" ? "deep" : DEEPEN[key];
      else if (edgeLit && key === "body") key = "mid";
      set(x, y, key);
    }
  }

  for (const [x, y] of SMILE) set(x, y, "face");
  for (const [x, y] of eyesShut ? EYE_SHUT : EYE_OPEN) set(x, y, "face");

  return grid;
}

function paintPortrait(canvas, eyesShut) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = PALETTES[resolvedTheme()];
  const grid = buildGrid(eyesShut);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      ctx.fillStyle = palette[grid[y * W + x]];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Seeded, so the blink rhythm is the same visit to visit in structure
// (irregular gaps, never a metronome) without Math.random at render time.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setUpPortrait() {
  const canvas = document.querySelector("[data-mochi-canvas]");
  if (!canvas) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let eyesShut = false;

  const paint = () => paintPortrait(canvas, eyesShut);
  paint();

  // The page follows the resolved theme the way the meadow does: a pinned
  // [data-theme] when one is set, the OS preference otherwise. A swap
  // re-renders the current eye state in the other palette.
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static render, eyes open

  const rng = mulberry32(20261120);
  const BLINK_MS = 240; // two ticks of the site's 120ms weather step
  function scheduleBlink() {
    setTimeout(() => {
      if (document.hidden) {
        scheduleBlink();
        return;
      }
      eyesShut = true;
      paint();
      setTimeout(() => {
        eyesShut = false;
        paint();
        scheduleBlink();
      }, BLINK_MS);
    }, 5000 + rng() * 7000);
  }
  scheduleBlink();
}

/* ---------- wiring ---------- */

function setUpThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;
  const label = toggle.querySelector("[data-theme-label]");
  let mode = storedMode();

  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    const resolved = systemDark.matches ? "dark" : "light";
    if (label) label.textContent = mode;
    toggle.setAttribute(
      "aria-label",
      `Theme: ${mode === "system" ? `system (${resolved})` : mode}. ` +
        `Switch to ${nextMode(mode)}.`
    );
  }

  toggle.addEventListener("click", () => {
    mode = nextMode(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice still holds this visit.
    }
    applyMode();
  });

  applyMode();
}

setUpPortrait();
setUpThemeToggle();
