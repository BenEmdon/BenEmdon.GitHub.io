/*
  Gallery: seaside. A side-view shore drawn the way everything on
  this site is drawn: a grid of cells, a palette kept as data, and a
  renderer that only ever swaps whole cells between palette colours.

  Two palm trees on sand in the foreground, sea and big quiet sky
  behind, a small boat on the water. The cloud holds for seconds,
  then steps one whole column. The boat does the same on its own
  slower clock. The tide steps the shoreline one row in or out every
  few seconds, foam first, wet sand behind it. Nothing drifts,
  nothing fades, and reduced motion gets one static frame.

  Night is mostly the same map with a different palette: the sun
  slot turns moon-pale and the disc takes a crescent bite, the sea
  goes deep, the shine path turns cool, and stars come out in the
  top band. The scene rebuilds on a theme change and repaints in
  one pass.

  Self-contained: it looks for a canvas marked
  [data-gallery="seaside"] and does nothing if there is none.
*/

const W = 120;
const H = 45;

/* Palette slots. One order for both themes, so the map never has
   to know which sky it is under. */
const SKY_TOP = 0;
const SKY_LOW = 1;
const SUN = 2; // moon, after dark
const SHINE = 3; // sun path on the water; moonshine after dark
const CLOUD = 4; // the boat's sail wears this too
const CLOUD_SHADE = 5;
const SEA_DEEP = 6;
const SEA_MID = 7;
const SEA_PALE = 8;
const DRY_SAND = 9;
const WET_SAND = 10;
const SAND_LINE = 11; // palm shadows and shell shading
const TRUNK = 12; // the boat's hull is the same wood
const TRUNK_DARK = 13; // sel-out for trunk and fronds' wood, coconuts, birds
const FROND = 14;
const FROND_DARK = 15;

const PALETTES = {
  light: [
    "#6fa8dc", "#c4e2f6", "#ffcf3f", "#ffe89a",
    "#f6fbff", "#cbdef3", "#2f6db3", "#4f8ec9",
    "#a9d2ef", "#eed9a4", "#dbba7d", "#c8a55f",
    "#7d5a36", "#5d3f22", "#3f9153", "#2a6b3c",
  ],
  dark: [
    "#0d1b31", "#1e3a56", "#e8eef7", "#b9cfe8",
    "#33507a", "#243b5c", "#14304d", "#1d4568",
    "#2f5d85", "#8a7a56", "#6f6046", "#57492f",
    "#4a3823", "#2f2314", "#1f4d2e", "#14331f",
  ],
};

const HORIZON = 18; // first sea row
const SEA_FLOOR = 33; // last sea row when the tide is fully out

/* ---------- seeded variation ---------- */

// Mulberry32: small, deterministic. The same seed draws the same
// sky every visit, and the timers jitter around their bases without
// ever repeating a picture that was not drawn on purpose.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const trng = mulberry32(20261120);

// A stable per-cell hash for broken patterns: shine dashes, foam
// gaps, dither. Not random at render time, just uneven on purpose.
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

function skySlot(x, y) {
  if (y <= 8) return SKY_TOP;
  if (y <= 10) return (x + y) % 2 === 0 ? SKY_TOP : SKY_LOW;
  return SKY_LOW;
}

function buildSky(dark) {
  for (let y = 0; y < HORIZON; y += 1) {
    for (let x = 0; x < W; x += 1) set(x, y, skySlot(x, y));
  }
  if (!dark) return;
  // Stars: deliberate single cells in the top band, kept clear of
  // the moon's corner and the cloud's lane.
  const star = mulberry32(1123);
  for (let i = 0; i < 46; i += 1) {
    const x = Math.floor(star() * W);
    const y = Math.floor(star() * 10);
    if (x > 26 && x < 48 && y < 11) continue; // the moon lives here
    if (grid[at(x, y)] === SKY_TOP) set(x, y, SUN);
  }
}

function buildSunMoon(dark) {
  const cx = 36;
  const cy = 6;
  for (let y = cy - 3; y <= cy + 3; y += 1) {
    for (let x = cx - 3; x <= cx + 3; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= 7) set(x, y, SUN);
    }
  }
  // The lit heart of the disc, and after dark its brightest face.
  set(cx - 1, cy - 1, SHINE);
  set(cx, cy - 1, SHINE);
  set(cx - 1, cy, SHINE);
  set(cx, cy, SHINE);
  if (!dark) return;
  // The crescent bite: a second disc, offset up and right, handed
  // back to the sky.
  for (let y = cy - 3; y <= cy + 3; y += 1) {
    for (let x = cx - 3; x <= cx + 4; x += 1) {
      const dx = x - (cx + 2);
      const dy = y - (cy - 1);
      if (dx * dx + dy * dy <= 5 && inside(x, y)) set(x, y, skySlot(x, y));
    }
  }
}

// The cloud's own little map: lit top, shaded belly. It is drawn
// wherever the cloud currently sits, over sky slots only.
const CLOUD_MAP = [
  "..XXXXXX.....",
  ".XXXXXXXXXX..",
  "XXXXXXXXXXXX.",
  ".SSSSSSSSSS..",
  "..SS..SS..S..",
];

function drawCloud(cloudX) {
  CLOUD_MAP.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const x = cloudX + dx;
      const y = 3 + dy;
      if (!inside(x, y)) return;
      if (grid[at(x, y)] !== SKY_TOP && grid[at(x, y)] !== SKY_LOW) return;
      set(x, y, ch === "X" ? CLOUD : CLOUD_SHADE);
    });
  });
}

function drawBirds() {
  // Two distant birds, three cells each, named in the anchor as
  // deliberate details. Dark in both themes: silhouettes.
  const bird = (bx, by) => {
    set(bx, by + 1, TRUNK_DARK);
    set(bx + 1, by, TRUNK_DARK);
    set(bx + 2, by + 1, TRUNK_DARK);
  };
  bird(86, 4);
  bird(92, 2);
}

function buildSea(state) {
  const shore = SEA_FLOOR + state.tide; // last sea row
  for (let y = HORIZON; y <= shore; y += 1) {
    const slot = y <= 23 ? SEA_DEEP : y <= 29 ? SEA_MID : SEA_PALE;
    for (let x = 0; x < W; x += 1) set(x, y, slot);
  }
  // The shine path: a stepped, broken column under the sun that
  // widens as it comes toward the viewer.
  for (let y = HORIZON + 1; y <= shore; y += 1) {
    const w = 1 + Math.floor((y - HORIZON) / 7);
    const cx = 36 + Math.floor((y - HORIZON) * 0.2);
    for (let dx = -w; dx <= w; dx += 1) {
      if (hash(cx + dx, y) < 0.45) set(cx + dx, y, SHINE);
    }
  }
  // Foam along the waterline, with seeded gaps, and a few specks
  // stranded on the first wet row.
  for (let x = 0; x < W; x += 1) {
    if (hash(x, shore * 3) < 0.72) set(x, shore, CLOUD);
    if (hash(x, shore * 5 + 1) < 0.1) set(x, shore + 1, CLOUD);
  }
  return shore;
}

function buildSand(shore) {
  for (let y = shore + 1; y < H; y += 1) {
    const wet = y <= shore + 3;
    for (let x = 0; x < W; x += 1) set(x, y, wet ? WET_SAND : DRY_SAND);
  }
  // Two shells on the dry sand, below the wet band's furthest
  // reach: one lit like the shine, one pale like the cloud.
  const shell = (sx, sy, main, shade) => {
    set(sx, sy, shade);
    set(sx + 1, sy, main);
    set(sx + 2, sy, shade);
    set(sx, sy + 1, shade);
    set(sx + 1, sy + 1, main);
    set(sx + 2, sy + 1, shade);
  };
  shell(44, 41, SHINE, SAND_LINE);
  shell(70, 42, CLOUD, CLOUD_SHADE);
}

// The boat's own map: a wooden hull (the trunk's wood), a pale
// sail (the cloud's white), one small flag in the shine colour.
const BOAT_MAP = [
  "....T.F....",
  "....T.S.....",
  "....T.SS....",
  "....T.SSS...",
  "....T.SS....",
  ".HHHHHHHHH..",
  "..HHHHHHH...",
];
const BOAT_SLOTS = { T: TRUNK_DARK, F: SHINE, S: CLOUD, H: TRUNK };

function drawBoat(state) {
  const baseY = 22;
  BOAT_MAP.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      set(state.boatX + dx, baseY + dy, BOAT_SLOTS[ch]);
    });
  });
  // A short foam wake under the hull.
  for (let dx = 1; dx <= 9; dx += 1) {
    if (hash(state.boatX + dx, baseY + 7) < 0.5) {
      set(state.boatX + dx, baseY + 7, CLOUD);
    }
  }
}

/* Palms. The trunk is a stepped curve, three cells wide at the
   base and two at the crown, ringed every fourth row, sel-out in
   its own darkest shade. Fronds are arcs: out and up, then a long
   droop, the undersides drawn dark first so the lit fronds sit on
   top. */

function drawFrond(cx, cy, dir, len, rise, fall, slot, under) {
  const points = [];
  for (let i = 0; i <= len; i += 1) {
    const t = i / len;
    points.push([
      cx + dir * i,
      cy - Math.round(rise * Math.sin(t * Math.PI * 0.5)) +
        Math.round(fall * t * t),
      t,
    ]);
  }
  let prevY = points[0][1];
  for (const [x, y, t] of points) {
    // Fill the vertical step between the last point and this one,
    // so the arc is one unbroken cluster, never scattered cells.
    const step = Math.sign(y - prevY);
    for (let yy = prevY; yy !== y + step; yy += step) set(x, yy, slot);
    set(x, y, slot);
    if (t < 0.7) set(x, y + 1, under); // the frond's shaded belly
    prevY = y;
  }
}

function drawPalm(baseX, crownX, crownY, scale, flip) {
  // Shadow first: a broken ellipse on the sand, down and right of
  // the base, in the sand's own darkest shade.
  for (let dx = -4; dx <= 6; dx += 1) {
    if (hash(baseX + dx, 43) < 0.75) set(baseX + dx, 43, SAND_LINE);
    if (Math.abs(dx) < 4 && hash(baseX + dx, 44) < 0.6) {
      set(baseX + dx, 44, SAND_LINE);
    }
  }
  // Trunk along a quadratic curve from base to crown.
  const ctrlX = baseX + (crownX - baseX) * 0.25;
  const ctrlY = 44 - (44 - crownY) * 0.5;
  const steps = 44 - crownY;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(
      (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * ctrlX + t * t * crownX
    );
    const y = Math.round(
      (1 - t) * (1 - t) * 44 + 2 * (1 - t) * t * ctrlY + t * t * crownY
    );
    const wide = t < 0.45 ? 1 : 0; // half-width: 3 cells low, 2 high
    const ring = y % 4 === 0;
    for (let dx = -wide; dx <= wide; dx += 1) {
      const edge = Math.abs(dx) === wide && wide > 0;
      set(x + dx, y, ring || edge ? TRUNK_DARK : TRUNK);
    }
    if (wide === 0) set(x + 1, y, TRUNK_DARK); // sel-out on the lean side
  }
  // Fronds: dark undersides first, lit arcs over them.
  const L = (n) => Math.round(n * scale);
  drawFrond(crownX, crownY, -flip, L(9), L(2), L(9), FROND_DARK, FROND_DARK);
  drawFrond(crownX, crownY, flip, L(10), L(3), L(10), FROND_DARK, FROND_DARK);
  drawFrond(crownX, crownY, -flip, L(13), L(6), L(10), FROND, FROND_DARK);
  drawFrond(crownX, crownY, -flip, L(11), L(3), L(9), FROND, FROND_DARK);
  drawFrond(crownX, crownY, flip, L(11), L(7), L(8), FROND, FROND_DARK);
  drawFrond(crownX, crownY, flip, L(13), L(4), L(10), FROND, FROND_DARK);
  drawFrond(crownX, crownY, -flip, L(6), L(8), L(5), FROND, FROND_DARK);
  // Coconuts: a small dark cluster tucked under the crown.
  set(crownX - 1, crownY + 1, TRUNK_DARK);
  set(crownX, crownY + 1, TRUNK_DARK);
  set(crownX + 1, crownY + 1, TRUNK_DARK);
  set(crownX, crownY + 2, TRUNK_DARK);
}

function buildScene(state, dark) {
  buildSky(dark);
  buildSunMoon(dark);
  drawCloud(state.cloudX);
  drawBirds();
  const shore = buildSea(state);
  buildSand(shore);
  drawBoat(state);
  drawPalm(22, 13, 25, 1, 1); // the big palm, leaning left over the water
  drawPalm(100, 107, 29, 0.7, -1); // the smaller one, leaning right
}

/* ---------- wiring ---------- */

function setUpSeaside() {
  const canvas = document.querySelector('[data-gallery="seaside"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resolvedTheme = () =>
    document.documentElement.dataset.theme ||
    (systemDark.matches ? "dark" : "light");

  const state = {
    cloudX: 66,
    cloudDir: 1,
    boatX: 78,
    boatDir: -1,
    tide: 1, // 0 out, 1 mid, 2 in
    tideDir: 1,
  };

  function paint() {
    const dark = resolvedTheme() === "dark";
    buildScene(state, dark);
    const palette = PALETTES[dark ? "dark" : "light"];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        ctx.fillStyle = palette[grid[at(x, y)]];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  paint();

  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static frame, no timers

  // Sparse chains only: each mover holds for seconds, steps one
  // whole cell or one whole row, and repaints once.
  const timers = [];
  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  function stepCloud() {
    state.cloudX += state.cloudDir;
    if (state.cloudX > W + 4) {
      state.cloudX = -16; // off the edge: a long empty sky, then back
    }
    paint();
    schedule(stepCloud, 9000 + trng() * 7000);
  }

  function stepBoat() {
    state.boatX += state.boatDir;
    if (state.boatX <= 58) state.boatDir = 1;
    if (state.boatX >= 96) state.boatDir = -1;
    paint();
    schedule(stepBoat, 7000 + trng() * 6000);
  }

  function stepTide() {
    state.tide += state.tideDir;
    if (state.tide >= 2) state.tideDir = -1;
    if (state.tide <= 0) state.tideDir = 1;
    paint();
    schedule(stepTide, 3600 + trng() * 1200);
  }

  schedule(stepCloud, 9000 + trng() * 7000);
  schedule(stepBoat, 7000 + trng() * 6000);
  schedule(stepTide, 3600 + trng() * 1200);
}

setUpSeaside();
