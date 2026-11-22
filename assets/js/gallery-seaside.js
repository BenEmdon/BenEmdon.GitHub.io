/*
  Gallery: seaside, v2. The first version was a flat postcard:
  sky, sea, sand, two palms, everything in one plane. Ben's word
  on it was "simplistic compared to the one on the main page",
  so this one is built the meadow's way, in three planes, and
  it takes its composition from Owlboy's sky market, the
  reference named in the anchor: foreground means big, and
  ground has thickness.

  Far off, a headland reaches in from the left and a small
  island sits right of centre, both washed toward the sky
  colour, Hyper Light Drifter's way, each with a shaded face
  under its lit crest, so the sea has somewhere to go and
  the sky stays quiet around them. In the middle distance the shore works: two
  palms with cast shadows, a small boat stepping across open
  water, a tide that steps the shoreline in and out, and a
  waterline where foam and wet sand interlock in speckled
  clusters instead of meeting on a clean line, Sea of Stars'
  way. Close up, the viewer's own beach runs along the bottom
  and ends in a drawn edge, a crumbling rim over two strata
  rows, and over everything hangs the frame's real subject: a
  palm crown in the top-left corner, cropped by both edges of
  the frame the way Owlboy's twisted tree is, its fronds
  fanning out over the sky and the headland's top. A smaller
  crown answers it from the top-right.

  Every frond in the scene, near or mid, is a two-tone cluster:
  a lit cell and one shade cell, nothing more, Owlboy's foliage
  economy. One light source, late afternoon by day: sun low at
  upper left, shine path under it on the water, shadows falling
  down and to the right. Night is the same map with a different
  palette, the way the meadow does it: the sun slot goes
  moon-pale and takes a crescent bite, the far country drops
  to deep silhouettes, and the boat carries one warm lamp. The
  lamp wears the shine slot after dark; the moonshine path
  moves to the sea's palest slot, so no slot is added.

  Nothing drifts and nothing fades. The cloud, the boat, and
  the tide step whole cells on sparse seeded timers, and the
  foreground crowns never move at all: they are the viewer's
  own shade, and a swapping tip at that scale would read as a
  glitch, not a breeze. Reduced motion gets one static frame.

  Self-contained: it looks for a canvas marked
  [data-gallery="seaside"] and does nothing if there is none.
*/

import { registerTask } from "./boot.js?v=20261122s";
const W = 120;
const H = 45;

/* Palette slots. One order for both themes, so the map never has
   to know which sky it is under. Sixteen, the budget, shared
   across objects: the rowboat is the palms' wood, the rocks and
   the bank are the sand's own shades stepped down, the cloud's
   underside is the sea's palest blue. */
const SKY_TOP = 0;
const SKY_LOW = 1;
const SUN = 2; // moon, after dark
const SHINE = 3; // shine path by day; the boat's lamp after dark
const CLOUD = 4; // the sail, the rowboat stripe, and the foam wear it too
const HAZE = 5; // the far country: headland and island
const SEA_DEEP = 6;
const SEA_MID = 7;
const SEA_PALE = 8; // cloud underside, and the moonshine path after dark
const DRY_SAND = 9;
const WET_SAND = 10; // the rocks and the bank strata are built from it
const SAND_LINE = 11; // cast shadows, rock shade, shell shading, the bank's rim
const TRUNK = 12; // both boats are the same wood
const TRUNK_DARK = 13; // sel-out for wood, coconuts, birds, strata flecks
const FROND = 14; // the lit half of every frond cluster
const FROND_DARK = 15; // the shade half: undersides, near crowns, dune grass

const PALETTES = {
  light: [
    "#5f9fd8", "#c9e7f7", "#ffc93f", "#ffe89a",
    "#f6fbff", "#93b7d0", "#2b67ad", "#4a8ac6",
    "#a5cfee", "#eed9a4", "#dbba7d", "#c09a58",
    "#7d5a36", "#59391f", "#3f9153", "#27663a",
  ],
  dark: [
    "#0c1a30", "#1e3a56", "#e8eef7", "#ffb347",
    "#33507a", "#0f2237", "#122e4a", "#1c4266",
    "#2e5a84", "#8a7a56", "#6f6046", "#57492f",
    "#4a3823", "#2c2013", "#1f4d2e", "#13331f",
  ],
};

const HORIZON = 18; // first sea row
const SEA_FLOOR = 33; // last sea row when the tide is fully out
const SUN_X = 46;
const SUN_Y = 10;
const BANK_TOP = 42; // first row of the beach's drawn near edge

/* ---------- seeded variation ---------- */

// Mulberry32: small, deterministic. The same seed draws the same
// shore every visit, and the timers jitter around their bases
// without ever repeating a picture that was not drawn on purpose.
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

// A stable per-cell hash for broken patterns: shine dashes, foam
// gaps, strata flecks. Not random at render time, just uneven
// on purpose.
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

// A quiet gradient, not bands: flat zenith, flat low sky at the
// horizon, and between them a transition whose density deepens
// row by row. The mix is sampled per two-cell pair from the
// hash, not from a tiling pattern: a regular checker at this
// contrast reads as a picket fence across the sky (pass 1), so
// the grain is deliberately uneven, denser toward the horizon.
function skySlot(x, y) {
  if (y <= 6) return SKY_TOP;
  if (y >= 13) return SKY_LOW;
  const density = 0.06 + ((y - 7) / 5) * 0.84;
  return hash(x >> 1, y * 7) < density ? SKY_LOW : SKY_TOP;
}

function buildSky(dark) {
  for (let y = 0; y < HORIZON; y += 1) {
    for (let x = 0; x < W; x += 1) set(x, y, skySlot(x, y));
  }
  if (!dark) return;
  // Stars: deliberate single cells in the upper sky, kept clear
  // of the moon's corner. The cloud passes in front of its lane
  // and the far country stands in front of the rest.
  const star = mulberry32(1123);
  for (let i = 0; i < 46; i += 1) {
    const x = Math.floor(star() * W);
    const y = Math.floor(star() * 10);
    if (x > 36 && x < 56 && y < 16) continue; // the moon lives here
    if (skySlot(x, y) === SKY_TOP) set(x, y, SUN);
  }
}

function buildSunMoon(dark) {
  for (let y = SUN_Y - 4; y <= SUN_Y + 4; y += 1) {
    for (let x = SUN_X - 4; x <= SUN_X + 4; x += 1) {
      const dx = x - SUN_X;
      const dy = y - SUN_Y;
      if (dx * dx + dy * dy <= 10) set(x, y, SUN);
    }
  }
  if (!dark) {
    // The lit heart of the disc, in the shine colour.
    set(SUN_X - 1, SUN_Y - 1, SHINE);
    set(SUN_X, SUN_Y - 1, SHINE);
    set(SUN_X - 1, SUN_Y, SHINE);
    set(SUN_X, SUN_Y, SHINE);
    return;
  }
  // The crescent bite: a second disc, offset up and right, handed
  // back to whatever sky the gradient had there.
  for (let y = SUN_Y - 4; y <= SUN_Y + 4; y += 1) {
    for (let x = SUN_X - 4; x <= SUN_X + 5; x += 1) {
      const dx = x - (SUN_X + 2);
      const dy = y - (SUN_Y - 2);
      if (dx * dx + dy * dy <= 7 && inside(x, y)) set(x, y, skySlot(x, y));
    }
  }
}

// The cloud's own little map: lit top, a belly in the sea's
// palest blue. It is drawn wherever the cloud currently sits,
// over sky slots only.
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
      set(x, y, ch === "X" ? CLOUD : SEA_PALE);
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
  bird(94, 5);
  bird(101, 3);
}

/* ----- the far country ----- */

// The far country is washed toward the sky, the meadow's
// ridge trick, pushed further than v1 dared, so only the near
// planes carry full contrast. But washed is not flat (pass 3):
// in one flat tone the headland and the island read as grey
// blobs floating on the water, so each landmass is two tones
// now, a lit crest in the haze slot and a shaded face under
// it in a shared slot, the sea's own mid blue by day and the
// zenith's deep blue after dark, so the budget holds. The
// headland's crest is a slope plus two sines, rounded to
// whole cells, its steps lengthening and shortening gradually
// the way the meadow's crests do, with the wobble kept small
// so the line reads as a crest and not a dome. It is drawn
// over the sea, and its foot carries a dark waterline with
// foam flecked over it, which is what grounds it: a pale mass
// with a pale foot floats; a pale mass with a dark foot sits.
const headCrest = (x) =>
  Math.round(
    13.6 +
      Math.max(0, x - 6) * 0.19 -
      1.3 * Math.sin(x / 11 + 0.6) -
      0.45 * Math.sin(x / 5)
  );
const headBase = (x) =>
  Math.max(headCrest(x) + 2, Math.round(26 - Math.max(0, x - 24) * 0.5));

// The far country's shaded face, one shared slot per theme.
const farFace = (dark) => (dark ? SKY_TOP : SEA_MID);

function buildHeadland(dark) {
  const face = farFace(dark);
  for (let x = 0; x <= 38; x += 1) {
    const top = headCrest(x);
    const base = headBase(x);
    for (let y = top; y <= base; y += 1) set(x, y, HAZE);
    // The shaded face: the lower part of every column, growing
    // toward the tip, away from the light at upper left.
    const start = top + Math.round((base - top) * (0.45 + 0.35 * (x / 38)));
    for (let y = start; y <= base; y += 1) set(x, y, face);
    // By day the column's lowest row goes to the sea's deep
    // blue, a cliff-base shadow inside the silhouette: the
    // face shares its blue with the sea's mid band, and
    // without a dark foot the two merge where they meet.
    // After dark the face is already the darkest thing here.
    if (!dark) set(x, base, SEA_DEEP);
  }
  // Two tiny trees on the crest, dark silhouettes the way the
  // island wears its palm: they are what tells the eye this
  // pale mass is land and not weather (pass 1: it read as fog).
  const tree = (tx) => {
    const gy = headCrest(tx);
    set(tx, gy - 1, TRUNK_DARK);
    set(tx, gy - 2, TRUNK_DARK);
    for (const [fx, fy] of [
      [tx - 2, gy - 3], [tx - 1, gy - 4], [tx, gy - 4], [tx + 1, gy - 4],
      [tx + 2, gy - 3], [tx, gy - 5],
    ]) set(fx, fy, FROND_DARK);
  };
  tree(10);
  tree(24);
  // The waterline: a dark line first, the shadow the land
  // throws on its own water, with foam flecked over it in
  // pairs, so the flecks cluster instead of dotting.
  for (let x = 3; x <= 37; x += 1) {
    set(x, headBase(x) + 1, SEA_DEEP);
    if (hash(x >> 1, 71) < 0.45) set(x, headBase(x) + 1, CLOUD);
  }
}

// A small island right of centre: the same two tones over a
// peakier profile than the old smooth dome, a high left
// shoulder where its palm stands, a saddle, a lower second
// hump, and a tail that steps down into the water at the
// right. One tiny palm stands on it as a dark silhouette.
const ISLAND_PROFILE = [
  [80, 20], [82, 18], [84, 16], [86, 15], [88, 15], [90, 15],
  [92, 17], [94, 16], [96, 17], [98, 19], [100, 21],
];
function islandTop(x) {
  for (let i = 0; i < ISLAND_PROFILE.length - 1; i += 1) {
    const [x0, y0] = ISLAND_PROFILE[i];
    const [x1, y1] = ISLAND_PROFILE[i + 1];
    if (x >= x0 && x <= x1) {
      return Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
    }
  }
  return 21;
}

function buildIsland(dark) {
  const face = farFace(dark);
  for (let x = 80; x <= 100; x += 1) {
    const top = islandTop(x);
    for (let y = top; y <= 21; y += 1) set(x, y, HAZE);
    // The shaded face: the lower half, deeper on the right
    // slope, away from the light.
    const start = top + Math.ceil((21 - top) * (x < 90 ? 0.5 : 0.3));
    for (let y = start; y <= 21; y += 1) set(x, y, face);
  }
  // The palm: two trunk cells reaching down to the island's
  // surface, a five-cell crown, two droop tips.
  set(90, 13, TRUNK_DARK);
  set(90, 14, TRUNK_DARK);
  for (const [fx, fy] of [
    [87, 12], [88, 11], [89, 11], [90, 11], [91, 11], [92, 11], [93, 12],
    [86, 13], [94, 13],
  ]) set(fx, fy, FROND_DARK);
  // Its waterline: a dark line with foam flecked over it,
  // the same grounding the headland gets. Pale flecks alone
  // under a pale dome read as rain (pass 2).
  for (let x = 81; x <= 99; x += 1) {
    set(x, 22, SEA_DEEP);
    if (hash(x >> 1, 97) < 0.4) set(x, 22, CLOUD);
  }
}

/* ----- sea and shore ----- */

function buildSea(state, dark) {
  const shore = SEA_FLOOR + state.tide; // last sea row
  for (let y = HORIZON; y <= shore; y += 1) {
    const slot = y <= 23 ? SEA_DEEP : y <= 29 ? SEA_MID : SEA_PALE;
    for (let x = 0; x < W; x += 1) set(x, y, slot);
  }
  // The band edges interlock a little, the shore's own rule
  // applied between the sea's shades: flecks of the deeper
  // shade stranded in the first row of the paler one.
  for (let x = 0; x < W; x += 1) {
    if (hash(x, 24 * 3) < 0.25) set(x, 24, SEA_DEEP);
    if (hash(x, 30 * 3) < 0.2) set(x, 30, SEA_MID);
  }
  // The shine path: short horizontal glints under the sun.
  // Pass 1 scattered cells and pass 2 stacked a dash on every
  // row, and both chained into a yellow ribbon hanging off the
  // sun. Water does not do that: most rows carry nothing, the
  // lit rows carry one dash, and the dash wanders, so the eye
  // assembles a path out of glints instead of being handed a
  // column. After dark the glints are the moon's, in the sea's
  // palest slot, on fewer rows still.
  const shineSlot = dark ? SEA_PALE : SHINE;
  const litRows = dark ? 0.4 : 0.55;
  for (let y = HORIZON + 1; y <= shore; y += 1) {
    if (hash(y, 3) >= litRows) continue;
    const w = Math.min(2, 1 + Math.floor((y - HORIZON) / 8));
    const cx =
      SUN_X + Math.floor((y - HORIZON) * 0.25) + Math.floor(hash(y, 9) * 5) - 2;
    const start = cx - w + Math.floor(hash(7, y) * (2 * w));
    const len = 2 + Math.floor(hash(13, y) * 3);
    for (let dx = 0; dx < len; dx += 1) set(start + dx, y, shineSlot);
  }
  // Foam along the waterline, with seeded gaps. The edge is
  // finished in buildSand, where the wet sand bites back into
  // it: no clean boundary anywhere along this shore.
  for (let x = 0; x < W; x += 1) {
    if (hash(x, shore * 3) < 0.72) set(x, shore, CLOUD);
  }
  return shore;
}

function buildSand(shore) {
  for (let y = shore + 1; y < H; y += 1) {
    const wet = y <= shore + 3;
    for (let x = 0; x < W; x += 1) set(x, y, wet ? WET_SAND : DRY_SAND);
  }
  // The interlock, Sea of Stars' edge: foam lace stranded in
  // small clusters on the first wet row, and wet sand punching
  // speckled gaps up into the foam row itself, so the two
  // textures bite into each other along the whole waterline.
  for (let x = 0; x < W; x += 1) {
    if (hash(x, shore * 7) < 0.16 && hash(x - 1, shore * 7) < 0.6) {
      set(x, shore + 1, CLOUD);
    }
    if (hash(x, shore * 11) < 0.1) set(x, shore, WET_SAND);
  }
  // A light speckle on the dry sand, in pairs, so the flat
  // field has a grain and the shells have something to sit in.
  for (let y = shore + 4; y < BANK_TOP; y += 1) {
    for (let x = 0; x < W - 1; x += 1) {
      if (hash(x, y * 3) < 0.04) {
        set(x, y, SAND_LINE);
        set(x + 1, y, SAND_LINE);
      }
    }
  }
  // Two shells on the dry sand, both in moon-safe slots: the
  // shine slot belongs to the boat's lamp after dark, and a
  // shell wearing it glowed orange on the night sand (pass 1).
  const shell = (sx, sy, main, shade) => {
    set(sx, sy, shade);
    set(sx + 1, sy, main);
    set(sx + 2, sy, shade);
    set(sx, sy + 1, shade);
    set(sx + 1, sy + 1, main);
    set(sx + 2, sy + 1, shade);
  };
  shell(36, 38, SEA_PALE, SAND_LINE);
  shell(68, 40, CLOUD, SAND_LINE);
}

// The sailing boat's own map: a wooden hull (the trunk's wood), a
// pale sail (the cloud's white), one small flag in the shine
// colour. After dark the flag cell and the cell under it become
// the lamp: the shine slot's night hex is a warm orange, and two
// cells of it at the masthead read as a light hung for the night.
const BOAT_MAP = [
  "....T.F....",
  "....T.S....",
  "....T.SS...",
  "....T.SSS..",
  "....T.SS...",
  ".HHHHHHHHH.",
  "..HHHHHHH..",
];
const BOAT_SLOTS = { T: TRUNK_DARK, F: SHINE, S: CLOUD, H: TRUNK };

function drawBoat(state, dark) {
  const baseY = 22;
  BOAT_MAP.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      set(state.boatX + dx, baseY + dy, BOAT_SLOTS[ch]);
    });
  });
  if (dark) set(state.boatX + 5, baseY + 1, SHINE); // the lamp's second cell
  // A short foam wake under the hull.
  for (let dx = 1; dx <= 9; dx += 1) {
    if (hash(state.boatX + dx, baseY + 7) < 0.5) {
      set(state.boatX + dx, baseY + 7, CLOUD);
    }
  }
}

/* ----- the mid palms ----- */

// Trunks are stepped curves, three cells wide at the base and
// two at the crown, ringed every fourth row, sel-out in their
// own darkest shade. The crowns follow Owlboy's foliage
// economy: each frond is one two-tone cluster, a lit cell with
// a single shade cell under it, drawn as an unbroken arc that
// rises and then droops. Five fronds a crown, big blobs, no
// third tone. Each palm casts a shadow on the sand, a broken
// ellipse down and to the right of its base, in the sand's own
// darkest shade.

function drawFrond(cx, cy, dir, len, rise, fall) {
  let prevY = cy;
  for (let i = 0; i <= len; i += 1) {
    const t = i / len;
    const x = cx + dir * i;
    const y =
      cy - Math.round(rise * Math.sin(t * Math.PI * 0.5)) +
      Math.round(fall * t * t);
    // Fill the vertical step between the last point and this
    // one, so the arc is one unbroken cluster, never scattered
    // cells. The shade cell under the last lit cell of each
    // column is the frond's second tone, and near the crown,
    // where the fronds leave together, a second shade cell
    // makes the base of the cluster a bold blob, not a wire.
    const step = Math.sign(y - prevY);
    for (let yy = prevY; yy !== y + step; yy += step) set(x, yy, FROND);
    set(x, y + 1, FROND_DARK);
    if (t < 0.4) set(x, y + 2, FROND_DARK);
    prevY = y;
  }
}

function drawPalm(baseX, baseY, crownX, crownY, scale, flip) {
  // Shadow first: a broken ellipse on the sand, down and right.
  for (let dx = -6; dx <= 9; dx += 1) {
    if (hash(baseX + dx, baseY * 3) < 0.7) {
      set(baseX + dx + 4, baseY + 1, SAND_LINE);
    }
    if (Math.abs(dx) < 5 && hash(baseX + dx, baseY * 5) < 0.5) {
      set(baseX + dx + 4, baseY + 2, SAND_LINE);
    }
  }
  // Trunk along a quadratic curve from base to crown.
  const ctrlX = baseX + (crownX - baseX) * 0.25;
  const ctrlY = baseY - (baseY - crownY) * 0.5;
  const steps = baseY - crownY;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(
      (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * ctrlX + t * t * crownX
    );
    const y = Math.round(
      (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * ctrlY + t * t * crownY
    );
    const wide = t < 0.45 ? 1 : 0; // half-width: 3 cells low, 2 high
    const ring = y % 4 === 0;
    for (let dx = -wide; dx <= wide; dx += 1) {
      const edge = Math.abs(dx) === wide && wide > 0;
      set(x + dx, y, ring || edge ? TRUNK_DARK : TRUNK);
    }
    if (wide === 0) set(x + 1, y, TRUNK_DARK); // sel-out on the lean side
  }
  // The crown: five two-tone fronds, fanned.
  const L = (n) => Math.round(n * scale);
  drawFrond(crownX, crownY, -flip, L(12), L(6), L(9));
  drawFrond(crownX, crownY, -flip, L(10), L(3), L(10));
  drawFrond(crownX, crownY, flip, L(11), L(7), L(7));
  drawFrond(crownX, crownY, flip, L(12), L(4), L(10));
  drawFrond(crownX, crownY, -flip, L(6), L(8), L(4));
  // Coconuts: a small dark cluster tucked under the crown.
  set(crownX - 1, crownY + 1, TRUNK_DARK);
  set(crownX, crownY + 1, TRUNK_DARK);
  set(crownX + 1, crownY + 1, TRUNK_DARK);
  set(crownX, crownY + 2, TRUNK_DARK);
}

/* ----- the foreground ----- */

// The beach's drawn near edge, Owlboy's ground thickness: the
// sand does not run off the frame, it ends. A crumbling rim
// row, dry flecks showing through the shadow line, then two
// strata rows built from the sand's own shades stepped down,
// flecked with the wood-dark slot, the lowest row the darkest
// thing on the beach. Everything near sits on the surface
// above it or rests against it.
function buildBank() {
  for (let x = 0; x < W; x += 1) {
    set(x, BANK_TOP, hash(x, 31) < 0.25 ? DRY_SAND : SAND_LINE);
    set(x, BANK_TOP + 1, hash(x, 37) < 0.3 ? TRUNK_DARK : WET_SAND);
    set(x, BANK_TOP + 2, hash(x, 41) < 0.35 ? TRUNK_DARK : SAND_LINE);
  }
}

// A beached rowboat at bottom right, resting on the surface
// with its bow cocked up: the palms' wood again, a pale
// gunwale stripe in the cloud's white, its lower hull in
// shadow, a broken shadow beneath it, plank seams flecked
// along its lit side so it reads as boards, not a slab.
const ROWBOAT_MAP = [
  ".............................tt.",
  "...........................tt...",
  "..........................tTTt..",
  ".CCCCCCCCCCCCCCCCCCCCCCCCCTTTt..",
  "tTTTTTTTTTTTTTTTTTTTTTTTTTTtt...",
  ".tTTTTTTTTTTTTTTTTTTTTTTTTt.....",
  "..tttttttttttttttttttttt........",
];
const ROWBOAT_SLOTS = { C: CLOUD, T: TRUNK, t: TRUNK_DARK };

function drawRowboat() {
  const x0 = 83;
  const y0 = 35;
  // Its shadow first: a broken band on the sand under the hull,
  // pushed right, away from the light, spilling over the bank's
  // rim the way a real shadow crosses an edge.
  for (let dx = 2; dx <= 27; dx += 1) {
    if (hash(x0 + dx, 41 * 7) < 0.62) set(x0 + dx + 1, y0 + 7, SAND_LINE);
  }
  ROWBOAT_MAP.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      set(x0 + dx, y0 + dy, ROWBOAT_SLOTS[ch]);
    });
  });
  // Plank seams on the hull's lit side.
  for (let dx = 3; dx <= 24; dx += 1) {
    if (hash(dx, 55) < 0.4) set(x0 + dx, y0 + 4, TRUNK_DARK);
  }
}

// Rocks at bottom left, resting against the bank: the sand's
// own shades stepped down, lit at the top left, shaded toward
// the lower right, dark along the ground line of the cells
// the rock itself painted. Form, not outline.
function drawRocks() {
  const rock = (cx, cy, rx, ry) => {
    const painted = [];
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y += 1) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x += 1) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy > 1 || !inside(x, y)) continue;
        set(x, y, dx + dy * 1.6 > 0.55 ? SAND_LINE : WET_SAND);
        painted.push([x, y]);
      }
    }
    // The ground line: the lowest painted cell of each column.
    const lowest = new Map();
    for (const [x, y] of painted) {
      if (!lowest.has(x) || y > lowest.get(x)) lowest.set(x, y);
    }
    for (const [x, y] of lowest) set(x, y, TRUNK_DARK);
    // One lit cell at the top left, where the light lands.
    const hx = cx - Math.floor(rx * 0.5);
    const hy = Math.floor(cy - ry) + 1;
    if (inside(hx, hy) && grid[at(hx, hy)] === WET_SAND) set(hx, hy, DRY_SAND);
  };
  rock(7, 41, 5, 2.2);
  rock(14, 42, 3.6, 1.8);
}

// Dune grass on the bank's rim: five blades a tuft, tallest in
// the middle, leaning further and standing shorter toward the
// edges, the right-hand blades in shade. Clusters, never
// scattered cells, and bigger than anything the mid shore grows.
function drawTufts() {
  const tuft = (cx) => {
    for (let dx = -2; dx <= 2; dx += 1) {
      const h = 4 - Math.abs(dx);
      for (let i = 0; i < h; i += 1) {
        const x = cx + dx + (i === h - 1 ? Math.sign(dx) : 0);
        set(x, BANK_TOP - i, dx > 0 ? FROND_DARK : FROND);
      }
    }
  };
  tuft(24);
  tuft(50);
  tuft(62);
  tuft(76);
}

/* ----- the foreground crowns ----- */

// The frame's real subject, Owlboy's device outright: a palm
// crown cropped by the corner of the frame, far bigger than
// anything behind it, overlapping sky, far country, and sea
// alike. Each frond is a thick two-tone band, a lit upper edge
// over a dark body, tapering to a point; the fan radiates from
// a dark hub stamped into the corner itself. They never move.
function drawForeCrown(hubX, hubY, dir, fronds) {
  // The hub: a dark knot in the corner, its top edge lit.
  for (let y = hubY - 3; y <= hubY + 3; y += 1) {
    for (let x = hubX - 4; x <= hubX + 4; x += 1) {
      const dx = (x - hubX) / 4.5;
      const dy = (y - hubY) / 3.5;
      if (dx * dx + dy * dy > 1 || !inside(x, y)) continue;
      set(x, y, dy < -0.45 ? FROND : FROND_DARK);
    }
  }
  for (const [sx, sy, len, rise, fall] of fronds) {
    const tops = new Map();
    for (let i = 0; i <= len; i += 1) {
      const t = i / len;
      const x = sx + dir * i;
      const y =
        sy - Math.round(rise * Math.sin(t * Math.PI * 0.5)) +
        Math.round(fall * t * t);
      if (!tops.has(x) || y < tops.get(x)) tops.set(x, y);
    }
    const xs = [...tops.keys()].sort((a, b) => (dir > 0 ? a - b : b - a));
    xs.forEach((x, idx) => {
      const y = tops.get(x);
      const fromTip = xs.length - 1 - idx;
      const thick = fromTip <= 1 ? 1 : fromTip <= 3 ? 2 : 3;
      set(x, y, FROND);
      if (thick >= 2) set(x, y + 1, FROND_DARK);
      if (thick >= 3) set(x, y + 2, FROND_DARK);
    });
  }
}

function buildForeground() {
  buildBank();
  drawRocks();
  drawRowboat();
  drawTufts();
  // The crowns last: they hang in front of everything.
  drawForeCrown(0, 0, 1, [
    [-3, 0, 42, 3, 8],
    [-3, 1, 34, 3, 13],
    [-2, 2, 24, 2, 15],
    [-1, 3, 13, 1, 14],
  ]);
  drawForeCrown(W - 1, 0, -1, [
    [W + 2, 1, 30, 3, 8],
    [W + 2, 3, 22, 2, 11],
  ]);
}

function buildScene(state, dark) {
  buildSky(dark);
  buildSunMoon(dark);
  drawCloud(state.cloudX);
  drawBirds();
  const shore = buildSea(state, dark);
  buildSand(shore);
  buildHeadland(dark);
  buildIsland(dark);
  drawBoat(state, dark);
  drawPalm(27, 39, 20, 26, 0.85, 1); // the big mid palm, leaning left
  drawPalm(63, 38, 69, 28, 0.62, -1); // the smaller one, leaning right
  buildForeground();
}

/* ---------- wiring ---------- */

function setUpSeaside() {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting seaside", { timeout: 12000 });
  const canvas = document.querySelector('[data-gallery="seaside"]');
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
    cloudX: 66,
    cloudDir: 1,
    boatX: 56,
    boatDir: 1,
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
  sceneTask.complete();

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
    if (state.boatX <= 46) state.boatDir = 1;
    if (state.boatX >= 68) state.boatDir = -1;
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
