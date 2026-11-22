/*
  Gallery: neon city. A city at night in the rain, built the
  meadow's way, in planes. The mood is Blade Runner's; the
  composition is borrowed from the references named in the
  anchor: Hyper Light Drifter's washed far planes, distance
  going pale toward the sky while the near plane keeps the
  contrast, and Eastward's rationed warm accents, a few warm
  signs carrying the whole palette's warmth.

  The sky is a blue-grey haze in two shades, mixed the way
  the seaside mixes its sky. Against it, three skylines: a
  far one washed halfway to the sky colour with a few dim
  windows, a mid one a step darker with warm windows in small
  clusters, and a near one almost black, five rooftops with
  parapets, a water tank, an antenna, and the signs. The
  signs are blocks of warm colour and nothing more: no
  letters, no logos, nothing to read. They are the scene's
  only light, and the wet street at the bottom pays that
  light back as broken reflections, streaks of the sign
  colours dissolving row by row into the wet asphalt.

  A spinner, a small flying vehicle, crosses the far plane
  on a sparse seeded schedule, one whole cell per tick, and
  holds off-frame for seconds between crossings. Rain lives
  in fixed columns: on a tick, the lit cells in a few columns
  swap one shade in place and swap back, so the rain shimmers
  where it stands instead of falling. The antenna's beacon
  swaps between its lit and unlit slots on a slow tick.
  Nothing drifts and nothing fades. Reduced motion gets one
  static frame, spinner parked mid-crossing.

  Self-contained: it looks for a canvas marked
  [data-gallery="neon-city"] and does nothing if there is none.
*/

import { registerTask } from "./boot.js?v=20261122o";
const W = 120;
const H = 45;

/* Palette slots. One order for both themes, so the map never
   has to know which sky it is under. Sixteen, the budget:
   two sky shades, three building planes and the near plane's
   lit edge, two window shades, four sign shades, the rain
   shade, and three for the street. The spinner is built from
   the near plane's shade, a dark silhouette against the washed
   far plane, with a dim cabin, a warm lamp, and a coral tail
   light, so it costs no slots of its own. */
const SKY_TOP = 0;
const SKY_LOW = 1;
const HAZE_FAR = 2;
const HAZE_MID = 3;
const NEAR = 4;
const NEAR_EDGE = 5; // parapet tops, haze-lit rims
const WIN_DIM = 6;
const WIN_WARM = 7;
const SIGN_A = 8; // coral
const SIGN_A_HI = 9; // the coral sign's lit edge
const SIGN_B = 10; // amber
const SIGN_C = 11; // cyan, the one cool sign
const RAIN = 12;
const STREET = 13;
const STREET_HI = 14; // the wet sheen along the kerb
const GLINT = 15; // sparse pale glints on the wet street

const PALETTES = {
  light: [
    "#39466b", "#a08aa0", "#6f6486", "#4b4063",
    "#2b2340", "#5a4c74", "#bcc8da", "#ffd98a",
    "#ff6a55", "#ffa05c", "#ffc233", "#35cfe6",
    "#b3bedd", "#251d38", "#40355c", "#ccd8ea",
  ],
  dark: [
    "#0a0f1e", "#20304f", "#31456b", "#1e2c47",
    "#0c1424", "#2a3c60", "#7f96b8", "#ffc46b",
    "#ff5a4e", "#ff9a5c", "#ffb52e", "#3fd6ea",
    "#7d9abd", "#0a111f", "#1c2a44", "#93b7d9",
  ],
};

const STREET_TOP = 39; // first street row
const SPINNER_Y = 4;

/* ---------- seeded variation ---------- */

// Mulberry32: small, deterministic. The same seed draws the
// same city every visit, and the timers jitter around their
// bases without ever repeating a picture that was not drawn
// on purpose.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const trng = mulberry32(20261121);

// A stable per-cell hash for broken patterns: sky grain,
// window scatter, reflection breakup. Not random at render
// time, just uneven on purpose.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ---------- the map ---------- */

const grid = new Uint8Array(W * H);
const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

function set(x, y, slot) {
  if (inside(x, y)) grid[at(x, y)] = slot;
}

/* ----- sky ----- */

// A haze gradient in two shades, the seaside sky's method:
// flat zenith, flat murk at the bottom, and between them a
// transition whose density deepens row by row, sampled per
// two-cell pair from the hash so the grain stays uneven. The
// buildings are drawn over most of it; what shows between
// the towers is a smog the far plane can melt into.
function skySlot(x, y) {
  if (y <= 5) return SKY_TOP;
  if (y >= 27) return SKY_LOW;
  const density = 0.05 + ((y - 6) / 20) * 0.9;
  return hash(x >> 1, y * 7) < density ? SKY_LOW : SKY_TOP;
}

function buildSky() {
  for (let y = 0; y < STREET_TOP; y += 1) {
    for (let x = 0; x < W; x += 1) set(x, y, skySlot(x, y));
  }
}

/* ----- the far skyline ----- */

// Washed halfway to the sky, Hyper Light Drifter's way: the
// towers are pale silhouettes with a sparse scatter of dim
// windows, and the occasional antenna. Nothing here is warm.
// The plane runs behind everything else, down to row 35,
// where the nearer planes bury its feet.
function buildFar() {
  const rng = mulberry32(4177);
  let x = -3;
  while (x < W) {
    const w = 6 + Math.floor(rng() * 7);
    const top = 8 + Math.floor(rng() * 12);
    for (let bx = x; bx < x + w; bx += 1) {
      for (let y = top; y <= 35; y += 1) set(bx, y, HAZE_FAR);
    }
    if (rng() < 0.4) {
      const ax = x + Math.floor(w / 2);
      for (let y = top - 3; y < top; y += 1) set(ax, y, HAZE_FAR);
      set(ax, top - 4, WIN_DIM);
    }
    for (let bx = x + 1; bx < x + w - 1; bx += 1) {
      for (let y = top + 2; y <= 32; y += 1) {
        if (hash(bx, y * 3) < 0.045) set(bx, y, WIN_DIM);
      }
    }
    x += w + Math.floor(rng() * 3);
  }
}

/* ----- the spinner ----- */

// The spinner's own little map: a body in the mid plane's
// shade, a dim cabin, one warm lamp at the nose, one coral
// tail light at the rear, two fin cells underneath. It is
// drawn on the far plane, over the washed skyline and under
// the mid one, and it crosses one whole cell per tick.
const SPINNER_MAP = [
  "..XXXX..",
  ".XDXXXWW",
  "T..XX...",
];
const SPINNER_SLOTS = { X: NEAR, D: WIN_DIM, W: WIN_WARM, T: SIGN_A };

function drawSpinner(state) {
  SPINNER_MAP.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      set(state.spinnerX + dx, SPINNER_Y + dy, SPINNER_SLOTS[ch]);
    });
  });
}

/* ----- the mid skyline ----- */

// A step darker and a step nearer. The windows here are the
// city's background life: mostly dim, with warm ones in
// small clusters of two or three, never a scatter of single
// lit cells. The plane's feet reach row 37.
function buildMid() {
  const rng = mulberry32(9026);
  let x = -2;
  while (x < W) {
    const w = 9 + Math.floor(rng() * 7);
    const top = 13 + Math.floor(rng() * 14);
    for (let bx = x; bx < x + w; bx += 1) {
      for (let y = top; y <= 37; y += 1) set(bx, y, HAZE_MID);
    }
    for (let bx = x + 1; bx < x + w - 2; bx += 1) {
      for (let y = top + 2; y <= 35; y += 1) {
        const h = hash(bx, y * 5);
        if (h < 0.035) {
          set(bx, y, WIN_WARM);
          set(bx + 1, y, WIN_WARM);
          if (hash(bx, y * 11) < 0.2) set(bx + 2, y, WIN_WARM);
        } else if (h < 0.085) {
          set(bx, y, WIN_DIM);
        }
      }
    }
    x += w + Math.floor(rng() * 4);
  }
}

/* ----- the near rooftops ----- */

// Five rooftops, hand-placed, almost black against the haze.
// Each wears a parapet row in the haze-lit edge slot and a
// sparse scatter of warm windows. The furniture is the
// plane's detail: a water tank on the second roof, an
// antenna with a beacon on the fourth, and the signs.
const NEAR_BUILDINGS = [
  { x: -4, w: 30, top: 24 },
  { x: 28, w: 24, top: 20 },
  { x: 54, w: 28, top: 27 },
  { x: 84, w: 22, top: 22 },
  { x: 108, w: 16, top: 29 },
];

function buildNear(state) {
  for (const b of NEAR_BUILDINGS) {
    for (let bx = b.x; bx < b.x + b.w; bx += 1) {
      for (let y = b.top; y <= 38; y += 1) set(bx, y, NEAR);
      set(bx, b.top, NEAR_EDGE);
      // Weathering on the row under the parapet: a fleck of
      // the edge shade here and there, never a second band.
      if (hash(bx, b.top * 3) < 0.15) set(bx, b.top + 1, NEAR_EDGE);
    }
    // Warm windows, sparse, in pairs where the hash allows.
    for (let bx = b.x + 2; bx < b.x + b.w - 2; bx += 1) {
      for (let y = b.top + 3; y <= 36; y += 1) {
        if (hash(bx * 3, y * 7) < 0.04) {
          set(bx, y, WIN_WARM);
          if (hash(bx, y * 13) < 0.45) set(bx + 1, y, WIN_WARM);
        }
      }
    }
  }

  // The water tank on the second roof: a plain drum in the
  // near shade, its top row catching the haze, standing on
  // two legs. Form from the rim light, not an outline.
  const tankX = 36;
  const tankTop = 14;
  for (let bx = tankX; bx <= tankX + 5; bx += 1) {
    for (let y = tankTop; y <= 18; y += 1) set(bx, y, NEAR);
    set(bx, tankTop, NEAR_EDGE);
  }
  set(tankX + 1, 19, NEAR);
  set(tankX + 4, 19, NEAR);

  // The antenna on the fourth roof, and its beacon: one cell
  // that swaps between the coral sign shade and the unlit
  // near shade on a slow tick, named in the anchor as a
  // deliberate detail.
  for (let y = 16; y <= 21; y += 1) set(94, y, NEAR);
  set(94, 15, state.beaconOn ? SIGN_A : NEAR);

  /* The signs. Blocks of warm colour, flat, with one lit
     edge each. No letters, no logos, nothing to read: the
     coral one hangs vertical on the first roof, the amber
     one runs horizontal on the third, and the cyan one, the
     palette's one cool sign, is a small block on the last. */
  for (let y = 28; y <= 37; y += 1) {
    for (let bx = 19; bx <= 21; bx += 1) set(bx, y, SIGN_A);
    set(19, y, SIGN_A_HI);
  }
  for (let bx = 19; bx <= 21; bx += 1) set(bx, 28, SIGN_A_HI);
  for (let y = 29; y <= 31; y += 1) {
    for (let bx = 58; bx <= 69; bx += 1) set(bx, y, SIGN_B);
  }
  for (let bx = 58; bx <= 69; bx += 1) set(bx, 29, WIN_WARM);
  for (let y = 31; y <= 32; y += 1) {
    for (let bx = 110; bx <= 114; bx += 1) set(bx, y, SIGN_C);
  }
}

/* ----- the street ----- */

// The wet street: six rows. A sheen along the kerb, then the
// dark asphalt, and in it the reflections. Each sign throws
// a broken streak straight down from its own columns: the
// sign's colour, flecked with gaps, dense at the kerb and
// dissolving as it comes toward the viewer. A sparse pale
// glint elsewhere keeps the rest of the street wet rather
// than dead.
const REFLECTIONS = [
  { x0: 19, x1: 21, slot: SIGN_A, hi: SIGN_A_HI },
  { x0: 59, x1: 68, slot: SIGN_B, hi: WIN_WARM },
  { x0: 110, x1: 114, slot: SIGN_C, hi: SIGN_C },
];

function buildStreet() {
  for (let x = 0; x < W; x += 1) {
    set(x, STREET_TOP, hash(x, 43) < 0.4 ? STREET : STREET_HI);
    for (let y = STREET_TOP + 1; y < H; y += 1) set(x, y, STREET);
  }
  for (const r of REFLECTIONS) {
    for (let y = STREET_TOP; y < H; y += 1) {
      const density = 0.62 - (y - STREET_TOP) * 0.09;
      for (let x = r.x0; x <= r.x1; x += 1) {
        if (hash(x * 7, y * 13) < density) {
          set(x, y, hash(x * 3, y * 17) < 0.15 ? r.hi : r.slot);
        }
      }
    }
  }
  for (let y = STREET_TOP + 1; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (grid[at(x, y)] === STREET && hash(x, y * 3) < 0.03) {
        set(x, y, GLINT);
      }
    }
  }
}

/* ----- rain ----- */

// The rain's fixed columns, seeded once: twenty-four columns
// spread across the frame, four lit cells each at seeded
// heights. The columns never move. On a tick a few of them,
// chosen by phase, wear the rain shade for one tick and hand
// their cells back, so the rain shimmers in place. A rain
// cell only ever replaces sky, haze, or the near plane's
// body: never a window, never a sign, never the street.
const RAIN_COLUMNS = (() => {
  const rng = mulberry32(90210);
  const cols = [];
  for (let i = 0; i < 24; i += 1) {
    const ys = new Set();
    while (ys.size < 4) ys.add(2 + Math.floor(rng() * 34));
    cols.push({ x: 3 + Math.floor(rng() * 114), ys: [...ys], phase: i % 4 });
  }
  return cols;
})();

const RAINABLE = new Set([SKY_TOP, SKY_LOW, HAZE_FAR, HAZE_MID, NEAR]);

function drawRain(state) {
  for (const col of RAIN_COLUMNS) {
    if ((state.rainStep + col.phase) % 4 !== 0) continue;
    for (const y of col.ys) {
      if (RAINABLE.has(grid[at(col.x, y)])) set(col.x, y, RAIN);
    }
  }
}

function buildScene(state) {
  buildSky();
  buildFar();
  drawSpinner(state);
  buildMid();
  buildNear(state);
  buildStreet();
  drawRain(state);
}

/* ---------- wiring ---------- */

function setUpNeonCity() {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting neon city", { timeout: 12000 });
  const canvas = document.querySelector('[data-gallery="neon-city"]');
  if (!canvas) { sceneTask.complete(); return; }
  const ctx = canvas.getContext("2d");
  if (!ctx) { sceneTask.complete(); return; }
  canvas.width = W;
  canvas.height = H;

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resolvedTheme = () =>
    document.documentElement.dataset.theme ||
    (systemDark.matches ? "dark" : "light");

  const state = {
    spinnerX: 70, // parked mid-crossing for the static frame
    rainStep: 0,
    beaconOn: true,
  };

  function paint() {
    const dark = resolvedTheme() === "dark";
    buildScene(state);
    const palette = PALETTES[dark ? "dark" : "light"];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        ctx.fillStyle = palette[grid[at(x, y)]];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  paint();
  sceneTask.complete();

  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static frame, no timers

  // Sparse chains only: each mover holds for seconds, steps
  // one whole cell or swaps one whole shade, and repaints once.
  const timers = [];
  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  function stepSpinner() {
    state.spinnerX += 1;
    paint();
    // Off the right edge: a long empty sky before the next
    // crossing. On frame: a slow, stately pace.
    const offFrame = state.spinnerX > W + 10;
    if (offFrame) state.spinnerX = -14;
    schedule(stepSpinner, offFrame ? 9000 + trng() * 8000 : 2400 + trng() * 1600);
  }

  function stepRain() {
    state.rainStep += 1;
    paint();
    schedule(stepRain, 750);
  }

  function stepBeacon() {
    state.beaconOn = !state.beaconOn;
    paint();
    schedule(stepBeacon, 2400);
  }

  schedule(stepSpinner, 2400 + trng() * 1600);
  schedule(stepRain, 750);
  schedule(stepBeacon, 2400);
}

setUpNeonCity();
