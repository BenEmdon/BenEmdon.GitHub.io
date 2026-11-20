/*
  Experiment: a quiet pixel meadow above the footer.

  A Studio Ghibli sort of scene, drawn in code rather than loaded as an
  image: big sky, pale hills, a grass field, one tree. It arrives the
  way the portrait does, in scrambled blocks that clear in steps, and
  like the portrait it re-renders when the theme moves under it: the
  scene is built once as geometry, then lit twice, a day palette and a
  night palette over the same cells. Ben asked for the dark version
  rather than no meadow at all in dark theme, so at night the same
  field sits under a moon, the flowers sleep, and the light that
  crosses is moonlight, cooler and quieter on the same ladder.

  The pixel rule holds throughout: nothing moves, drifts, or fades. The
  reveal opens whole blocks on a 75ms tick. The light that crosses the
  field afterwards is only ground pixels stepping one shade brighter in
  place as a front passes, then one shade back; the front is an order,
  not a thing travelling. Reduced motion gets the finished scene in one
  cut and no light at all.

  Variant on the checkpoint meadow: a decayed Guardian stands in the
  near foreground, cropped by the left edge of the frame the way the
  reference Ben sent crops its own, half sunk into the grass with a
  fallen leg piece beside it. By day it is a ruin, drawn from the
  scene's own stone-adjacent slots, eye dark. At night the eye wakes
  and pulses blue, whole palette slots stepping on a slow tick with
  long rests in the dark; nothing moves and nothing fades, and
  reduced motion parks the eye at one steady dim shade.

  The scene is built once, deterministically: one seeded random source
  places the grass and flowers and scrambles the reveal, so every load
  is the same meadow. Painting is a single canvas of 144 x 60 cells;
  frames are drawn only while revealing or while the light crosses.
*/

/* ---------- anchor ---------- */

const W = 144;
const H = 60;

// Sixteen colours, each earning its place. Ramps hue-shift the way pixel
// artists build them: sky cools upward and warms at the horizon, meadow
// shadows lean blue-green while the highlights lean yellow.
const PALETTE = [
  "#2e62a7", // 0  sky zenith
  "#5e8ec5", // 1  sky mid
  "#9dbfe1", // 2  sky low
  "#dfeef6", // 3  sky horizon
  "#fdfdff", // 4  cloud
  "#c7dcef", // 5  cloud shade
  "#a9c198", // 6  hill far
  "#bcd26c", // 7  meadow highlight
  "#8fbc5e", // 8  meadow 1
  "#5da24e", // 9  meadow 2
  "#3e7f45", // 10 meadow 3
  "#2b5c46", // 11 meadow 4, the cool shadow
  "#1e4534", // 12 canopy deep
  "#6e4a2c", // 13 trunk
  "#4c331e", // 14 trunk shade
  "#f2cf6b", // 15 flower
];

// The night palette: indices 0-15 re-light the day colour in the same
// slot, so the geometry, the ladders, and the reveal all carry over
// untouched and only the light changes. Night ramps compress and cool:
// shadows fall toward blue and purple, the meadow goes deep blue-green,
// and the canopy's lit rim (slots 7-9, the same cells the day rim uses)
// stays the brightest thing in the field after the sky. Three extra
// slots exist only at night: the moon's lit rim, the moon's face, and
// starlight. The Guardian adds two more night-only slots, its eye's
// ring and core, whose values the pulse steps through a blue ladder
// (see EYE_LADDER below); at rest they sit dark. Twenty-one colours
// in all.
const NIGHT_PALETTE = [
  "#060d21", // 0  sky zenith, deep blue
  "#0c1a38", // 1  sky mid
  "#14284e", // 2  sky low
  "#1e3862", // 3  sky horizon, the last glow
  "#2c4066", // 4  cloud, a faint shape against the sky
  "#1a2c4c", // 5  cloud shade
  "#16302e", // 6  hill far, silhouetted on the horizon glow
  "#3d6b4f", // 7  meadow highlight, moonlit
  "#2c5741", // 8  meadow 1
  "#214636", // 9  meadow 2
  "#173527", // 10 meadow 3
  "#10241c", // 11 meadow 4, the cool shadow
  "#0a1a20", // 12 canopy deep, near silhouette
  "#241d2e", // 13 trunk, cooled toward plum
  "#171221", // 14 trunk shade
  "#cbb877", // 15 flower, one or two still awake, paled
  "#e6eefb", // 16 moon rim
  "#7f97bd", // 17 moon face
  "#cfe0f7", // 18 star
  "#0e2038", // 19 Guardian eye ring, at rest; the pulse steps it
  "#0a1a20", // 20 Guardian eye core, at rest; the pulse steps it
];

// The eye's ladder, ring and core together, darkest first. Game-true
// blue: a lit Guardian eye is blue, flaring brighter as it charges,
// while orange is Sheikah tech asleep and never an eye. The pulse
// climbs these rungs, holds the top, and falls back; between pulses
// the eye sits on rung 0, barely told from the socket around it.
const EYE_LADDER = [
  ["#0e2038", "#0a1a20"], // asleep
  ["#1b6f96", "#14425f"], // waking
  ["#29abe2", "#3fb6dd"], // lit
  ["#29abe2", "#7fe7ff"], // the flare
];

// Shade ladders, brightest first. The light sweep steps a ground pixel
// one rung up and later one rung back; it never invents a colour.
const MEADOW_LADDER = [7, 8, 9, 10, 11];
const HILL_LADDER = [7, 6, 8];
const LADDERS = [MEADOW_LADDER, HILL_LADDER];

/* ---------- seeded randomness ---------- */

// Mulberry32. One seed for the whole scene, so the meadow a visitor gets
// is the meadow that was critiqued, not a fresh roll per load.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261119);

/* ---------- the scene as data ---------- */

const base = new Uint8Array(W * H); // palette index per cell
const rung = new Int8Array(W * H).fill(-1); // ladder rung for ground cells
const ladderOf = new Uint8Array(W * H); // which ladder a ground cell climbs

const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

function set(x, y, colour) {
  if (inside(x, y)) base[at(x, y)] = colour;
}

function setGround(x, y, ladder, r) {
  if (!inside(x, y)) return;
  base[at(x, y)] = LADDERS[ladder][r];
  rung[at(x, y)] = r;
  ladderOf[at(x, y)] = ladder;
}

// Filled ellipse with stepped edges; the only curve the scene knows.
function stamp(cx, cy, rx, ry, paint) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y += 1) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x += 1) {
      const dx = (x - cx) / (rx + 0.5);
      const dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy <= 1) paint(x, y);
    }
  }
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/* ----- sky ----- */

// Four flat bands. Dither was tried in the seams between neighbouring
// shades, where pixel art puts it, and at this scale it read as dotted
// rules; the bands meet flat instead, with one faint mixed seam at the
// top. The scene's dither lives in the reveal cover, like the portrait.
const SKY_BANDS = [
  [0, 0], // rows 0-8: zenith
  [9, 1],
  [18, 2],
  [26, 3],
];

// Band boundaries wobble a row either way across the width. A dithered
// seam on a ruler-straight edge reads as a perforation line no matter
// how the dots are paired; on an uneven edge the same mix reads as haze.
const skyBoundary = (x, b) => SKY_BANDS[b][0] + Math.round(1.1 * Math.sin(x / 23 + b * 2.1));

function skyColour(x, y) {
  let b = 0;
  for (let i = 1; i < SKY_BANDS.length; i += 1) {
    if (y >= skyBoundary(x, i)) b = i;
  }
  const colour = SKY_BANDS[b][1];
  if (b !== 1) return colour;
  // Only the top seam mixes, and faintly: dots in two-cell pairs, since
  // a lone cell at this contrast reads as a perforation. The lower seams
  // were tried mixed in every pass and read as dotted rules every time,
  // so they meet as flat edges, like everything else in the scene.
  const paired = BAYER_4[y % 4][(x >> 1) % 4];
  if (y === skyBoundary(x, 1) && paired < 5) return SKY_BANDS[0][1];
  return colour;
}

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) set(x, y, skyColour(x, y));
}

/* ----- clouds ----- */

// Flat clusters built from overlapping ellipses, shaded underneath:
// any cloud cell with open sky two rows below takes the shade, so the
// shade hugs the underside the way a shadow would.
const cloudMask = new Uint8Array(W * H);

function cloud(cx, cy, parts) {
  for (const [ox, oy, rx, ry] of parts) {
    stamp(cx + ox, cy + oy, rx, ry, (x, y) => {
      if (inside(x, y)) cloudMask[at(x, y)] = 1;
    });
  }
}

cloud(100, 10, [
  [0, 0, 16, 4],
  [-12, 1, 11, 3.2],
  [12, 1, 12, 3.2],
  [0, 2, 18, 2.8],
]);
cloud(70, 8, [
  [0, 0, 10, 3],
  [-8, 1, 7, 2.4],
  [8, 1, 8, 2.4],
]);
cloud(20, 4, [
  [0, 0, 7, 2.2],
  [-6, 1, 5, 1.8],
  [6, 1, 5, 1.8],
]);

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!cloudMask[at(x, y)]) continue;
    const openBelow = !inside(x, y + 2) || !cloudMask[at(x, y + 2)];
    set(x, y, openBelow ? 5 : 4);
  }
}

// Two birds, three cells each: a cluster, not a speck.
for (const [bx, by] of [
  [98, 20],
  [107, 23],
]) {
  set(bx, by + 1, 12);
  set(bx + 1, by, 12);
  set(bx + 2, by + 1, 12);
}

/* ----- hills ----- */

// One pale crest. A sum of sines rounded to whole cells gives a stepped
// line whose runs lengthen and shorten gradually, the clean way to draw
// a curve at this size.
const crest = (x) =>
  Math.round(33 - 3.5 * Math.sin(x / 30) - 1.8 * Math.sin(x / 13 + 1.3) - 2.2 * Math.sin(x / 61 + 0.5));

for (let x = 0; x < W; x += 1) {
  for (let y = crest(x); y < H; y += 1) setGround(x, y, 1, 1);
}

/* ----- meadow ----- */

const meadowTop = (x) => Math.round(40 - 2.5 * Math.sin(x / 44 + 0.7) - 1.2 * Math.sin(x / 21 + 2));

for (let x = 0; x < W; x += 1) {
  const top = meadowTop(x);
  for (let y = top; y < H; y += 1) {
    const t = (y - top) / (H - 1 - top);
    const r = t < 0.25 ? 1 : t < 0.52 ? 2 : 3;
    setGround(x, y, 0, r);
  }
}

// The hills melt into the meadow rather than ending on a hard line:
// their last two rows step to the ladder's third rung, the meadow's own
// lightest green, so the two grounds meet inside one colour.
for (let x = 0; x < W; x += 1) {
  const top = meadowTop(x);
  for (let y = Math.max(crest(x), top - 2); y < top; y += 1) {
    if (rung[at(x, y)] >= 0 && ladderOf[at(x, y)] === 1) setGround(x, y, 1, 2);
  }
}

// One tiny lived detail: a distant copse standing on the hill crest.
// Paler than the real tree, as distance makes things, and off the ladder
// so the light sweep, which belongs to the near field, leaves it alone.
{
  const copseX = 76;
  const copseBase = crest(copseX);
  const copseSet = (colour) => (x, y) => {
    if (!inside(x, y)) return;
    set(x, y, colour);
    rung[at(x, y)] = -1;
  };
  stamp(copseX, copseBase - 3, 4, 2.6, copseSet(10));
  stamp(copseX, copseBase - 1, 3, 1, copseSet(11));
  copseSet(11)(copseX, copseBase - 1);
  copseSet(11)(copseX, copseBase);
}

// Sunlit and shadowed ground, as stepped patches one rung off the base
// they cover. The big cool patch low on the right and the tree's own
// shadow are rung 4, the deepest the meadow goes.
function patch(cx, cy, rx, ry, r) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (inside(x, y) && rung[at(x, y)] >= 0 && ladderOf[at(x, y)] === 0) setGround(x, y, 0, r);
  });
}

patch(30, 49, 20, 3.5, 1); // sunlit swale, left
patch(88, 52, 16, 3, 2); // a lighter reach, right of centre
patch(64, 45, 14, 1.6, 3); // a cloud's shadow, mid-field, kept flat
patch(112, 55, 20, 3.5, 4); // deep shade, low right
patch(52, 53, 15, 2.4, 4); // the tree's shadow, falling right

// A foreground silhouette band closes the bottom of the scene, the way
// a dark near bank frames a view: a wavy top edge at the meadow's
// deepest rung, and the last two rows in canopy deep, off the ladder
// entirely so the light sweep never lifts them. They are the frame,
// not the field.
const fgTop = (x) => Math.round(56.5 - 1.2 * Math.sin(x / 19 + 1) - 0.8 * Math.sin(x / 7.3));

for (let x = 0; x < W; x += 1) {
  for (let y = fgTop(x); y < H; y += 1) {
    if (y >= H - 2) {
      set(x, y, 12);
      rung[at(x, y)] = -1;
    } else {
      setGround(x, y, 0, 4);
    }
  }
}

/* ----- grass ----- */

// Tufts are clusters: three small shapes, repeated and varied, never a
// lone cell. They take a rung one step off the ground they stand on, so
// they read as grass catching or losing the light, and because they keep
// a rung they join the light sweep like any other ground.
const TUFTS = [
  [
    [1, 0],
    [0, 1],
    [2, 1],
  ],
  [
    [0, 0],
    [2, 0],
    [4, 0],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  [
    [2, 0],
    [1, 1],
    [3, 1],
    [0, 2],
    [2, 2],
    [4, 2],
  ],
];

for (let y = 0; y < H; y += 1) {
  // Denser and larger toward the viewer, the cheapest perspective there is.
  const count = 1 + Math.floor(((y - 34) / 26) * 6.5);
  for (let n = 0; n < count; n += 1) {
    const x = Math.floor(rng() * (W - 6)) + 1;
    if (y < meadowTop(x) + 1) continue;
    const shape = TUFTS[y < 46 ? 0 : y < 53 ? 1 : 2];
    const here = rung[at(x, y)];
    if (here < 0) continue;
    // One direction per ground tone: darker tufts on light ground,
    // lighter tufts on dark ground. Random both ways on the same patch
    // reads as salt and pepper, not grass.
    const r = here >= 3 ? here - 1 : here <= 1 ? here + 1 : here + (rng() < 0.5 ? 1 : -1);
    for (const [dx, dy] of shape) {
      const gx = x + dx;
      const gy = y - shape.reduce((m, [, d]) => Math.max(m, d), 0) + dy;
      if (inside(gx, gy) && rung[at(gx, gy)] >= 0 && ladderOf[at(gx, gy)] === 0) {
        setGround(gx, gy, 0, r);
      }
    }
  }
}

// Silhouette grass standing on the foreground band's edge, in canopy
// deep and off the ladder: the nearest grass in the scene, unlit.
for (let n = 0; n < 30; n += 1) {
  const x = 2 + Math.floor(rng() * (W - 8));
  const shape = TUFTS[rng() < 0.5 ? 1 : 2];
  const depth = shape.reduce((m, [, d]) => Math.max(m, d), 0);
  const baseY = fgTop(x) + 1;
  for (const [dx, dy] of shape) {
    const gx = x + dx;
    const gy = baseY - depth + dy;
    if (!inside(gx, gy)) continue;
    set(gx, gy, 12);
    rung[at(gx, gy)] = -1;
  }
}

// Flowers: a handful of three-cell clusters low in the field, in the one
// warm accent and in cloud white. Above the grass, so the sweep passes
// under them and they stay lit. Their positions are recorded (no light
// of their own, just bookkeeping) so the night scene can put most of
// them to sleep.
const flowerClusters = [];
for (let n = 0; n < 10; n += 1) {
  const x = 4 + Math.floor(rng() * (W - 10));
  const y = 47 + Math.floor(rng() * 7);
  if (rung[at(x, y)] < 0 || base[at(x, y)] === 12) continue;
  const colour = rng() < 0.75 ? 15 : 4;
  set(x, y, colour);
  set(x + 1, y, colour);
  set(x, y + 1, colour);
  flowerClusters.push([x, y]);
}

/* ----- fence ----- */

// A quiet line of posts and rails on the right, rising a little toward
// the horizon. Drawn after the grass so it stays crisp.
const fenceY = (x) => Math.round(45.5 - (x - 96) * 0.045);

for (let x = 96; x <= 142; x += 1) {
  set(x, fenceY(x) - 3, 14);
  set(x, fenceY(x) - 1, 14);
}
for (const px of [98, 107, 116, 125, 134, 141]) {
  for (let y = fenceY(px) - 4; y <= fenceY(px); y += 1) {
    set(px, y, 13);
    set(px + 1, y, 14);
  }
}

/* ----- the tree ----- */

// The one subject. Trunk first, then branches, then a canopy built from
// overlapping ellipses and shaded in stamps: deep at the lower right,
// lit at the upper left, where the light comes from.
const trunkBaseX = 38;

for (let y = 29; y <= 54; y += 1) {
  const cx = trunkBaseX - Math.round((54 - y) * 0.04);
  const half = y >= 44 ? 2 : 1;
  for (let x = cx - half; x <= cx + half; x += 1) {
    set(x, y, x === cx + half ? 14 : 13);
  }
}
// Root flares.
set(trunkBaseX - 3, 54, 13);
set(trunkBaseX + 3, 54, 14);

// Branches, stepped diagonals stamped two cells wide; the canopy covers
// their tops.
function branch(x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    set(x, y, 13);
    set(x, y + 1, 14);
  }
}
branch(37, 34, 26, 26);
branch(38, 32, 48, 25);

const canopyMask = new Uint8Array(W * H);
for (const [cx, cy, rx, ry] of [
  [37, 18, 21, 9],
  [22, 21, 12, 6.5],
  [52, 21, 12, 6.5],
  [29, 11, 12, 5.5],
  [46, 11, 11, 5.5],
  [37, 23, 15, 4.5],
  [16, 24, 7, 4.5], // a low lobe on the left, breaking the symmetry
  [58, 17, 8, 4], // and a smaller one reaching right
]) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (inside(x, y)) canopyMask[at(x, y)] = 1;
  });
}

// Trim silhouette spikes from the canopy's underside: a cell hanging
// two or more rows below both neighbouring columns is an ellipse
// artefact, not a leaf. One pass, judged on the untrimmed bottoms.
{
  const colBottom = new Int16Array(W).fill(-1);
  for (let x = 0; x < W; x += 1) {
    for (let y = 0; y < H; y += 1) if (canopyMask[at(x, y)]) colBottom[x] = y;
  }
  for (let x = 1; x < W - 1; x += 1) {
    if (colBottom[x] < 0) continue;
    const limit = Math.max(colBottom[x - 1], colBottom[x + 1]) + 1;
    for (let y = limit + 1; y < H; y += 1) canopyMask[at(x, y)] = 0;
  }
}

function canopyStamp(cx, cy, rx, ry, colour) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (inside(x, y) && canopyMask[at(x, y)]) set(x, y, colour);
  });
}

for (let i = 0; i < W * H; i += 1) if (canopyMask[i]) base[i] = 12;
canopyStamp(42, 20, 16, 7, 11);
canopyStamp(30, 23, 12, 4.5, 11);
canopyStamp(36, 17, 14, 6, 10);
canopyStamp(25, 19, 8, 4, 10);
canopyStamp(29, 12, 10, 4, 9);
canopyStamp(21, 17, 6, 3, 9);
canopyStamp(44, 10, 7, 3, 9);

// Rim light, the one warm story the light tells: canopy cells on the
// top edge, and on the left edge above the middle, take the lit greens.
// The rim follows the silhouette instead of floating inside it, and it
// stops partway across the top, where the light gives up. A few cells
// at the top-left take the meadow's highlight, the warmest green here.
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!canopyMask[at(x, y)]) continue;
    const openAbove = !inside(x, y - 1) || !canopyMask[at(x, y - 1)];
    const openLeft = !inside(x - 1, y) || !canopyMask[at(x - 1, y)];
    if (openAbove) set(x, y, x < 45 ? 8 : 9);
    else if (openLeft && y < 22) set(x, y, 8);
  }
}
for (const [hx, hy] of [
  [24, 10],
  [31, 8],
  [18, 15],
]) {
  canopyStamp(hx, hy, 1.6, 0.8, 7);
}

/* ----- the Guardian ----- */

// A decayed Guardian in the near foreground, cropped by the left edge
// of the frame and half sunk into the foreground band, with a fallen
// leg piece in the grass beside it. Drawn last, over everything in
// its footprint, and off the ladder everywhere, so the light sweep
// passes it by the way light passes a stone. It is drawn from the
// scene's own slots, no new day colours: lit stone is cloud shade,
// mid stone is sky low, shadow stone is sky mid, crevices are canopy
// deep, and the moss creeping over it is the meadow's own green. The
// night palette re-lights those slots into the same stone family on
// its own; only the eye is drawn differently after dark.
const G_LIT = 5;
const G_STONE = 2;
const G_SHADE = 1;
const G_DEEP = 12;
const G_MOSS = 10;

const gSaved = new Map(); // cell -> [colour, rung, ladder], first write only
function gSet(x, y, colour) {
  if (!inside(x, y)) return;
  const i = at(x, y);
  if (!gSaved.has(i)) gSaved.set(i, [base[i], rung[i], ladderOf[i]]);
  base[i] = colour;
  rung[i] = -1;
}

// The body on its own map, 30 wide and 27 tall, set down at (-6, 33)
// so the widest rows run past the left edge of the frame and the dome
// rises just under the hill crest. Rows are [left, right] silhouette
// edges: a stepped dome, a wide head band, a slimmer waist, a flared
// base rim, then the sink into the ground.
const G_ROWS = [
  [13, 16], [11, 18], [9, 20], [8, 21], [7, 22], [6, 23], [5, 24],
  [5, 24], [4, 25], [4, 25], [4, 25], [5, 24], [5, 24], [6, 23],
  [6, 23], [6, 23], [5, 24], [5, 24], [4, 25], [4, 25], [4, 25],
  [5, 24], [5, 24], [6, 23], [6, 23], [7, 22], [7, 22],
];
const G_X = -6;
const G_Y = 33;
const gMask = new Uint8Array(W * H);
G_ROWS.forEach(([left, right], row) => {
  for (let col = left; col <= right; col += 1) {
    const x = G_X + col;
    const y = G_Y + row;
    if (inside(x, y)) gMask[at(x, y)] = 1;
  }
});

// Flat stone first, then the light in stamps, the canopy's idiom:
// lit from the upper left, shadow settling lower right.
for (let i = 0; i < W * H; i += 1) if (gMask[i]) gSet(i % W, Math.floor(i / W), G_STONE);
function gStamp(cx, cy, rx, ry, colour) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (inside(x, y) && gMask[at(x, y)]) gSet(x, y, colour);
  });
}
gStamp(G_X + 8, G_Y + 3, 6, 4, G_LIT); // the lit shoulder, kept small
gStamp(G_X + 11, G_Y + 1, 5, 2, G_LIT); // the lit crown
gStamp(G_X + 22, G_Y + 10, 5, 6, G_SHADE); // shadow down the right flank
gStamp(G_X + 21, G_Y + 18, 8, 7, G_SHADE); // shadow, lower right
gStamp(G_X + 15, G_Y + 25, 10, 3.5, G_SHADE); // shadow at the sink

// Edges: the top silhouette keeps the lit stone, the right edge falls
// to shadow, and the buried bottom edge goes deep. Segment notches on
// the crown, the way the reference's Guardian is plated.
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!gMask[at(x, y)]) continue;
    const openRight = !inside(x + 1, y) || !gMask[at(x + 1, y)];
    const openBelow = !inside(x, y + 1) || !gMask[at(x, y + 1)];
    if (openBelow && y >= G_Y + 20) gSet(x, y, G_DEEP);
    else if (openRight) gSet(x, y, G_SHADE);
  }
}
gSet(G_X + 12, G_Y + 1, G_DEEP);
gSet(G_X + 17, G_Y + 1, G_DEEP);

// The head plate: a shadow line under the band that carries the eye,
// and the eye's housing, a dark disc set into the band with the eye
// asleep inside it. By day the whole disc is one deep tone, a socket;
// after dark the night scene re-draws the eye's own cells in its own
// slots and the pulse takes them over.
for (let col = 8; col <= 21; col += 1) gSet(G_X + col, G_Y + 12, G_SHADE);
const eyeRing = [];
const eyeCore = [];
{
  const ex = G_X + 14;
  const ey = G_Y + 8;
  for (const [dx, dy] of [
    [-1, -2], [0, -2], [1, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-2, 0], [2, 0],
    [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
    [-1, 2], [0, 2], [1, 2],
  ]) gSet(ex + dx, ey + dy, G_DEEP);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      gSet(ex + dx, ey + dy, G_DEEP);
      eyeRing.push(at(ex + dx, ey + dy));
    }
  }
  gSet(ex, ey, G_DEEP);
  eyeCore.push(at(ex, ey));
}

// Wear: a crack stepping down the right side, a chunk gone from the
// lower right (the field it covered comes back exactly, rung and
// all), and moss creeping up the base and over the left shoulder.
for (const [cx, cy] of [
  [22, 16], [21, 17], [22, 18], [21, 19],
]) gSet(G_X + cx, G_Y + cy, G_DEEP);
// A carved arc on the right flank, the engraved swirl the Sheikah
// cut into every Guardian, suggested in four cells.
for (const [sx, sy] of [
  [18, 12], [19, 11], [20, 12], [20, 13],
]) gSet(G_X + sx, G_Y + sy, G_DEEP);
function gRestore(x, y) {
  if (!inside(x, y)) return;
  const i = at(x, y);
  if (!gSaved.has(i)) return;
  const [colour, r, lad] = gSaved.get(i);
  base[i] = colour;
  rung[i] = r;
  ladderOf[i] = lad;
  gMask[i] = 0;
}
for (let row = 20; row <= 22; row += 1) {
  for (let col = 24; col <= 25; col += 1) gRestore(G_X + col, G_Y + row);
}
// A plate gone from the dome's top right, a stepped bite.
for (const [nx, ny] of [
  [20, 3], [21, 3], [21, 4], [22, 4],
]) gRestore(G_X + nx, G_Y + ny);
for (const [mx, my] of [
  [6, 22], [7, 22], [6, 23], [8, 24], [7, 25],
  [9, 3], [10, 3], [9, 4],
  [23, 21], [22, 22],
]) gSet(G_X + mx, G_Y + my, G_MOSS);

// The fallen leg piece: a jointed segment lying in the grass to the
// right of the base, a knob at its left end, its top in mid stone,
// its underside deep, a joint line across it, moss on top.
const LEG_ROWS = [
  [52, [26, 29]], [53, [27, 31]], [54, [25, 33]], [55, [24, 34]],
  [56, [25, 33]], [57, [26, 32]], [58, [28, 31]],
];
for (const [y, [left, right]] of LEG_ROWS) {
  for (let x = left; x <= right; x += 1) {
    gSet(x, y, y <= 55 ? G_STONE : G_SHADE);
    if (y === 58) gSet(x, y, G_DEEP);
  }
}
gSet(33, 55, G_SHADE);
gSet(33, 56, G_SHADE);
for (const jy of [54, 55, 56]) gSet(30, jy, G_DEEP);
gSet(32, 54, G_DEEP); // the joint's cup, in shadow
gSet(28, 53, G_MOSS);
gSet(29, 53, G_MOSS);

// Two silhouette tufts against the base and the leg, seating both in
// the grass the way the foreground band's own grass stands.
for (const tx of [21, 36]) {
  const shape = TUFTS[1];
  const depth = shape.reduce((m, [, d]) => Math.max(m, d), 0);
  const baseY = fgTop(tx) + 1;
  for (const [dx, dy] of shape) {
    const gx = tx + dx;
    const gy = baseY - depth + dy;
    if (!inside(gx, gy)) continue;
    set(gx, gy, 12);
    rung[at(gx, gy)] = -1;
  }
}

/* ----- the night scene ----- */

// The same geometry, re-lit. nightBase starts as a copy of the day
// cells; most of the night is then just the night palette reading the
// same indices. Only three things are drawn differently: the flowers
// sleep, a moon hangs in the calm top-right of the sky, and a sparse
// set of star clusters lights in the sky the clouds leave empty.
const nightBase = Uint8Array.from(base);

// The Guardian's eye, asleep in the day cells as plain deep stone,
// is re-drawn in the night-only eye slots. The wiring steps those
// slots' palette values through EYE_LADDER; the cells never change.
for (const i of eyeRing) nightBase[i] = 19;
for (const i of eyeCore) nightBase[i] = 20;

// Moonlight catches the Guardian's crown the way it catches the
// canopy's rim: the body's top-edge cells take the night sky's lit
// blue-grey, so the ruin keeps its outline after dark.
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!gMask[at(x, y)]) continue;
    const openAbove = !inside(x, y - 1) || !gMask[at(x, y - 1)];
    if (openAbove) nightBase[at(x, y)] = 4;
  }
}

// All but the first two flower clusters fold back into the field's
// deepest shade. The two that stay keep their slots, paled by the
// night palette like everything else.
flowerClusters.forEach(([fx, fy], i) => {
  if (i < 2) return;
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
  ]) {
    if (inside(fx + dx, fy + dy)) nightBase[at(fx + dx, fy + dy)] = 11;
  }
});

// The two birds go home at night: their cells take back the sky colour
// they were drawn over, so the sky is empty of them after dark.
for (const [bx, by] of [
  [98, 20],
  [107, 23],
]) {
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [2, 1],
  ]) {
    if (inside(bx + dx, by + dy)) nightBase[at(bx + dx, by + dy)] = skyColour(bx + dx, by + dy);
  }
}

// The moon: a small disc in the face colour, with the cells on its top
// and left edge, where the light would catch a rim, in the lit colour.
// One light story, told the same way the canopy tells it.
const moonCells = new Set();
stamp(132, 5, 2.9, 2.9, (x, y) => {
  if (!inside(x, y)) return;
  nightBase[at(x, y)] = 17;
  moonCells.add(at(x, y));
});
for (const i of moonCells) {
  const x = i % W;
  const y = Math.floor(i / W);
  const openAbove = !moonCells.has(at(x, y - 1));
  const openLeft = !moonCells.has(at(x - 1, y));
  if (openAbove || openLeft) nightBase[i] = 16;
}

// Stars, sparse and clustered, placed only where every cell of the
// cluster lands on open sky: a cluster that would touch a cloud, the
// canopy, or the moon is skipped whole rather than clipped. Their own
// seed, so the day scene's rolls are untouched.
const nrng = mulberry32(20261120);
const STAR_SHAPES = {
  triple: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  dot: [[0, 0]],
};
for (const [sx, sy, shape] of [
  [8, 2, "triple"],
  [52, 2, "triple"],
  [80, 2, "dot"],
  [96, 1, "triple"],
  [118, 2, "dot"],
  [66, 3, "dot"],
  [122, 8, "dot"],
  [138, 12, "triple"],
  [130, 18, "dot"],
  [141, 21, "dot"],
]) {
  const cx = sx + Math.floor(nrng() * 3) - 1;
  const cy = sy + Math.floor(nrng() * 3) - 1;
  const cells = STAR_SHAPES[shape].map(([dx, dy]) => [cx + dx, cy + dy]);
  const open = cells.every(
    ([x, y]) => inside(x, y) && nightBase[at(x, y)] <= 3
  );
  if (!open) continue;
  for (const [x, y] of cells) nightBase[at(x, y)] = 18;
}

/* ---------- painting ---------- */

const toRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const DAY_RGB = PALETTE.map(toRgb);
const NIGHT_RGB = NIGHT_PALETTE.map(toRgb);
const EYE_RGB = EYE_LADDER.map(([ring, core]) => [toRgb(ring), toRgb(core)]);

// What paint() reads: the day cells under the day palette, or the night
// cells under the night palette. The wiring swaps the pair together
// whenever the resolved theme changes.
let scene = base;
let RGB = DAY_RGB;

// Reveal blocks of 6 x 6 cells, scrambled once with the same seed, so
// the scene arrives in the same order on every load. An unopened block
// shows a pale mist: horizon colour dithered with the band above it.
const BLOCK = 6;
const BW = W / BLOCK;
const BH = H / BLOCK;
const blockOrder = [];
for (let i = 0; i < BW * BH; i += 1) blockOrder.push(i);
for (let i = blockOrder.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rng() * (i + 1));
  [blockOrder[i], blockOrder[j]] = [blockOrder[j], blockOrder[i]];
}
const blockRank = new Int16Array(BW * BH);
blockOrder.forEach((block, rank) => (blockRank[block] = rank));

function coverColour(x, y) {
  return BAYER_4[y % 4][x % 4] < 4 ? 2 : 3;
}

function paint(ctx, frame, revealed, front) {
  const px = frame.data;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = at(x, y);
      const block = Math.floor(y / BLOCK) * BW + Math.floor(x / BLOCK);
      let colour;
      if (blockRank[block] >= revealed) {
        colour = coverColour(x, y);
      } else {
        colour = scene[i];
        // The light: ground within the band behind the front steps one
        // rung brighter. Everything else keeps its colour exactly.
        if (rung[i] >= 0 && front !== null) {
          const d = front - x;
          if (d >= 0 && d <= 7) {
            colour = LADDERS[ladderOf[i]][Math.max(0, rung[i] - 1)];
          }
        }
      }
      const o = i * 4;
      const [r, g, b] = RGB[colour];
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(frame, 0, 0);
}

/* ---------- wiring ---------- */

const REVEAL_STEPS = 14;
const STEP_MS = 75; // the site's --motion-step
const SWEEP_TICK_MS = 120;
const REST_MS = 6500;
const EYE_TICK_MS = 450;
const EYE_REST_MS = 7000;
// Rungs of EYE_LADDER the pulse visits: climb, hold the flare, fall.
const EYE_SEQUENCE = [1, 2, 3, 3, 2, 1, 0];

for (const figure of document.querySelectorAll("[data-meadow]")) {
  const canvas = figure.querySelector("[data-meadow-canvas]");
  if (!canvas) continue;
  const ctx = canvas.getContext("2d");
  const frame = ctx.createImageData(W, H);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let revealed = reduced.matches ? BW * BH : 0;
  let front = null;
  let onScreen = false;
  let started = false;

  // The scene follows the resolved theme the way the portrait does:
  // main.js re-dithers the portrait through its repaints list whenever
  // the theme could have moved, and this is the same contract kept
  // locally, since that list lives inside main.js. The resolved theme
  // is the pinned [data-theme] when one is set, and the OS preference
  // in system mode, where the attribute is removed. A swap re-renders
  // the current state (same reveal, same light front) in the other
  // palette; nothing restarts.
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const resolvedTheme = () =>
    document.documentElement.dataset.theme ||
    (systemDark.matches ? "dark" : "light");
  let theme = null;

  function applyTheme() {
    const next = resolvedTheme();
    if (next === theme) return;
    theme = next;
    scene = theme === "dark" ? nightBase : base;
    RGB = theme === "dark" ? NIGHT_RGB : DAY_RGB;
    paint(ctx, frame, revealed, front);
  }

  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  // Only in system mode does the OS still get a vote, but listening
  // either way is harmless: applyTheme no-ops when nothing resolved
  // differently.
  systemDark.addEventListener("change", applyTheme);

  // The Guardian's eye lives in two night palette slots; stepping the
  // slots steps every eye cell at once, in place. Reduced motion
  // parks it at the waking rung, lit but steady, before first paint.
  function setEye(rungIdx) {
    NIGHT_RGB[19] = EYE_RGB[rungIdx][0];
    NIGHT_RGB[20] = EYE_RGB[rungIdx][1];
  }
  if (reduced.matches) setEye(1);

  applyTheme();

  // The light's timetable: sleep, cross, sleep. Timeouts rather than an
  // interval, so at rest the scene costs nothing at all, and a wake that
  // finds the figure off-screen or the tab hidden simply sleeps again.
  function schedule(delay, fn) {
    setTimeout(() => {
      if (!onScreen || document.hidden) {
        schedule(1000, fn);
        return;
      }
      fn();
    }, delay);
  }

  // The eye's timetable, kept like the light's: pulse, then a long
  // rest in the dark. The pulse only repaints after dark; by day the
  // eye cells are plain stone and the ladder turns unseen.
  function pulse() {
    let i = 0;
    const timer = setInterval(() => {
      if (!onScreen || document.hidden) return; // the eye waits, like the front
      setEye(EYE_SEQUENCE[i]);
      if (theme === "dark") paint(ctx, frame, revealed, front);
      i += 1;
      if (i >= EYE_SEQUENCE.length) {
        clearInterval(timer);
        schedule(EYE_REST_MS, pulse);
      }
    }, EYE_TICK_MS);
  }

  function cross() {
    front = -10;
    const timer = setInterval(() => {
      if (!onScreen || document.hidden) return; // the front waits, mid-field
      front += 2;
      if (front > W + 8) {
        clearInterval(timer);
        front = null;
        paint(ctx, frame, revealed, front);
        schedule(REST_MS, cross);
        return;
      }
      paint(ctx, frame, revealed, front);
    }, SWEEP_TICK_MS);
  }

  function reveal() {
    if (started) return;
    started = true;
    if (reduced.matches) {
      revealed = BW * BH;
      paint(ctx, frame, revealed, front);
      return; // no sweep: the finished scene, held still
    }
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      revealed = Math.round((BW * BH * step) / REVEAL_STEPS);
      paint(ctx, frame, revealed, front);
      if (step >= REVEAL_STEPS) {
        clearInterval(timer);
        schedule(REST_MS, cross);
        schedule(3000, pulse);
      }
    }, STEP_MS);
  }

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        onScreen = entry.isIntersecting;
        if (onScreen) reveal();
      }
    },
    { threshold: 0.3 }
  );
  watcher.observe(figure);
}
