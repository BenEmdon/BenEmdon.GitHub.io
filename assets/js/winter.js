// Experiment: the Rideau Canal in winter, a held moment at dusk.
//
// Anchor
//   Subject: skaters on the frozen Rideau Canal at dusk, lamps lit
//   Grid: 144 x 48 cells, shown at the 36rem column width (4px cells)
//   Palette: "canal dusk", data below, 13 colours, budget cap 13
//   Outline rule: none, silhouettes are their own darkest shade
//   Light: the lamps, two in the foreground, two on the bridge
//   Layers, back to front: sky / far treeline and bank / bridge / ice
//     with skaters / foreground bank with fence and lamps / snow
//   Dither: sky band boundaries only, between neighbouring shades
//   Motion: snow clusters swap shade in place on a 700ms tick, in a
//     fixed sequence. Nothing falls, slides, or fades. Reduced motion
//     renders one static frame.
//
// The scene is a fixed picture, like the portrait's duotone: it does
// not swap per theme. Inspiration noted in the brief: waneella's
// atmospheric scenes, light as the subject, cool shadows with one
// warm note (here, the lamp glow), foreground silhouettes framing a
// calm middle. The warm note appears nowhere else.

const W = 144;
const H = 48;

export const PALETTE = {
  D: "#7e97bd", // sky, deep
  M: "#a9bed6", // sky, mid
  P: "#dfe9f2", // sky, pale at the horizon
  T: "#5a6f8e", // far treeline
  F: "#c8d5e4", // far snow bank
  K: "#222e42", // ink: bridge, skaters, posts, fence
  I: "#eef3f8", // ice
  S: "#ccd9e8", // ice, shade
  R: "#b7c8dc", // ice, skate tracks
  W: "#f7fafc", // snow, lit
  H: "#aebfd6", // snow, shade
  L: "#e9b264", // lamp glow, the one warm note
  C: "#f7dc9f", // lamp core
};

// Deterministic hash noise, so every render of the same step is the
// same picture and a critique pass can be trusted.
function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// --- skaters, ink bitmaps. X is a filled cell. -----------------------

const GLIDE = [
  "..XXX....",
  "..XXX....",
  ".XX......",
  "...XXX...",
  ".X.XX.X..",
  "....XX...",
  "...XXX...",
  "..X.XX...",
  "..X..X...",
  ".X...X...",
  ".XX..X...",
  "....XXX..",
];

const PUSH = [
  "...XXX....",
  "...XXX....",
  "....X.....",
  "..XXXXX...",
  ".X..XX..X.",
  ".X..X.....",
  "....XXX...",
  "...X...X..",
  "..X.....X.",
  "..X......X",
  ".X........",
  ".XX.......",
];

const CHILD = [
  ".XXX...",
  ".XXX...",
  "XXXXXXX",
  "..XXX..",
  "..X.X..",
  "..X.X..",
  ".X...X.",
  ".XX..XX",
];

// --- snow clusters ---------------------------------------------------
// Fixed clusters at seeded sky positions. Each has a phase; the tick
// steps it through hidden, faint, pale, lit, pale, faint, hidden.
// Clusters are 2 to 4 cells, never single pixels.

const SNOW_SHAPES = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 0],
    [0, 1],
    [1, 1],
  ],
];

const SNOW = [];
for (let i = 0; i < 26; i += 1) {
  SNOW.push({
    x: 2 + Math.floor(hash(i, 7) * 138),
    y: 1 + Math.floor(hash(i, 13) * 15),
    shape: SNOW_SHAPES[Math.floor(hash(i, 21) * SNOW_SHAPES.length)],
    phase: Math.floor(hash(i, 29) * 8),
  });
}

const SNOW_STEPS = [null, "H", "P", "W", "W", "P", "H", null];

// --- the scene --------------------------------------------------------

export function buildGrid(step = 3) {
  const g = Array.from({ length: H }, () => Array(W).fill("P"));
  const set = (x, y, k) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = k;
  };
  const rect = (x, y, w, h, k) => {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) set(x + i, y + j, k);
  };

  // Sky: three bands, Bayer-style checker dither on the two boundary
  // rows, between neighbouring shades only.
  for (let y = 0; y < 27; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let k = y < 8 ? "D" : y < 16 ? "M" : "P";
      if (y === 8 || y === 16) k = (x + y) % 2 === 0 ? k : y === 8 ? "D" : "M";
      g[y][x] = k;
    }
  }

  // Far treeline: uneven canopy clusters along the horizon, with a
  // snow bank at its feet. Left of the bridge only, the bridge takes
  // the right.
  for (let x = 0; x < 88; x += 1) {
    const top = 19 + Math.floor(hash(Math.floor(x / 3), 3) * 3);
    for (let y = top; y < 24; y += 1) set(x, y, "T");
    if (hash(x, 31) > 0.86) set(x, top - 1, "T");
  }
  rect(0, 24, 88, 3, "F");
  for (let x = 0; x < 88; x += 1) {
    if (hash(x, 37) > 0.72) set(x, 26, "H");
  }

  // The bridge, right side: deck, parapet posts, a stepped arch, two
  // piers, and two lamps on the deck.
  rect(84, 17, 60, 2, "K");
  for (let x = 86; x < 144; x += 6) rect(x, 15, 1, 2, "K");
  rect(84, 14, 60, 1, "K");
  for (let x = 92; x <= 136; x += 1) {
    const t = (x - 114) / 22;
    const archY = 19 + Math.round(5 * t * t);
    set(x, archY, "K");
    set(x, archY + 1, "K");
  }
  rect(88, 19, 4, 9, "K");
  rect(137, 19, 4, 9, "K");
  for (const lx of [100, 124]) {
    rect(lx, 12, 1, 2, "K");
    set(lx, 10, "L");
    set(lx - 1, 11, "L");
    set(lx, 11, "C");
    set(lx + 1, 11, "L");
  }

  // The ice: a pale band, shade under the far bank, two long skate
  // tracks wandering across, sparse shade clusters as texture.
  rect(0, 27, W, 13, "I");
  rect(0, 27, W, 2, "S");
  // Ice texture as short runs, never single cells.
  for (let x = 2; x < W - 4; x += 1) {
    if (hash(x, 41) > 0.94) rect(x, 38 + Math.floor(hash(x, 43) * 2), 3, 1, "S");
    if (hash(x, 47) > 0.95) rect(x, 30, 2, 1, "S");
  }
  const track = (y0, seed) => {
    let y = y0;
    for (let x = 0; x < W; x += 1) {
      set(x, y, "R");
      if (x % 6 === 5) {
        const r = hash(x, seed);
        y += r > 0.66 ? 1 : r < 0.33 ? -1 : 0;
        y = Math.max(30, Math.min(37, y));
      }
    }
  };
  track(33, 53);
  track(35, 59);

  // Skaters, still, mid-glide. Feet near row 38, a track-colour smudge
  // under each as the faintest reflection.
  const skater = (bitmap, x0, yBottom) => {
    const y0 = yBottom - bitmap.length + 1;
    bitmap.forEach((row, j) => {
      [...row].forEach((c, i) => {
        if (c === "X") set(x0 + i, y0 + j, "K");
      });
    });
    rect(x0 + 1, yBottom + 1, bitmap[0].length - 2, 1, "R");
  };
  skater(GLIDE, 20, 38);
  skater(PUSH, 52, 37);
  skater(CHILD, 100, 38);

  // Foreground bank: lit snow, shade drifts, a fence running in from
  // both edges and leaving the middle open.
  rect(0, 40, W, 8, "W");
  // Drift shade as clusters: short runs along the bank's top edge and
  // a few low drifts, never per-cell speckle.
  for (let x = 1; x < W - 6; x += 1) {
    if (hash(x, 61) > 0.9) rect(x, 40, 3 + Math.floor(hash(x, 63) * 3), 1, "H");
    if (hash(x, 67) > 0.93) rect(x, 41, 3, 1, "H");
    if (hash(x, 71) > 0.94) rect(x, 46 + Math.floor(hash(x, 73) * 2), 3, 1, "H");
  }
  const fence = (x0, x1) => {
    rect(x0, 43, x1 - x0, 1, "K");
    rect(x0, 45, x1 - x0, 1, "K");
    for (let x = x0 + 2; x < x1; x += 12) rect(x, 42, 1, 5, "K");
  };
  fence(0, 45);
  fence(110, 144);

  // Foreground lamps, framing both edges: post, cap, warm glass, and
  // a small halo of glow cells. The only warm colour in the scene.
  const lamp = (x) => {
    rect(x, 35, 2, 13, "K");
    rect(x - 1, 31, 4, 1, "K");
    set(x - 1, 32, "L");
    set(x, 32, "C");
    set(x + 1, 32, "C");
    set(x + 2, 32, "L");
    set(x, 33, "K");
    set(x + 1, 33, "K");
    rect(x - 1, 34, 4, 1, "K");
    set(x - 2, 32, "L");
    set(x + 3, 32, "L");
  };
  lamp(10);
  lamp(131);

  // Snow, last: fixed clusters stepping shade in place over the sky.
  for (const flake of SNOW) {
    const k = SNOW_STEPS[(step + flake.phase) % 8];
    if (!k) continue;
    for (const [dx, dy] of flake.shape) {
      const x = flake.x + dx;
      const y = flake.y + dy;
      if (["D", "M", "P"].includes(g[y]?.[x])) set(x, y, k);
    }
  }

  return g;
}

// --- browser wiring ---------------------------------------------------

function paint(canvas, step) {
  const ctx = canvas.getContext("2d");
  const grid = buildGrid(step);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      ctx.fillStyle = PALETTE[grid[y][x]];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const canvas = document.querySelector("[data-canal-canvas]");

if (canvas) {
  // Kept on the element so capture scripts can render exact frames.
  canvas.winter = { buildGrid, PALETTE };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (reduced.matches) {
    paint(canvas, 3);
  } else {
    let step = 0;
    let timer = null;
    const tick = () => paint(canvas, (step += 1) % 8);
    paint(canvas, 0);
    // The snow only steps while the scene is on screen.
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && timer === null) {
          timer = window.setInterval(tick, 700);
        } else if (!entry.isIntersecting && timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    });
    watcher.observe(canvas);
  }
}
