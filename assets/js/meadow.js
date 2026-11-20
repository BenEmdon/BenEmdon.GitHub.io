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

  The scene is built once, deterministically: one seeded random source
  places the grass and flowers and scrambles the reveal, so every load
  is the same meadow. Painting is a single canvas of 144 x 60 cells;
  frames are drawn only while revealing or while the light crosses.

  Variant on the checkpoint meadow: a decayed Guardian stands in the
  near foreground, cropped by the left edge of the frame the way the
  reference Ben sent crops its own. Where the first Guardian variant
  borrowed the sky's slots for stone and read as a smooth dome, this
  one spends four palette slots on a real stone ramp and earns its
  size with definition: stacked plate bands with hard seams, a carved
  eye housing in concentric rings, a segmented leg with joint rings
  lying in the grass in front of it. By day it is a ruin, eye dark.
  At night the eye wakes and pulses, blue first and then red, whole
  palette slots stepping on a slow tick with short rests in the dark;
  nothing moves and nothing fades, and reduced motion parks the eye
  at one steady dim shade.
*/

/* ---------- anchor ---------- */

const W = 144;
const H = 60;

// Twenty colours, each earning its place. Ramps hue-shift the way
// pixel artists build them: sky cools upward and warms at the horizon,
// meadow shadows lean blue-green while the highlights lean yellow. The
// last four are the Guardian's stone ramp, spent because borrowing the
// sky's slots for stone flattened the first variant: the lit face
// warms a touch, the shadows cool toward blue, and the deepest slot is
// a blue-grey dark rather than anything near black.
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
  "#93a5b5", // 16 stone lit, the Guardian's lit face
  "#6d849c", // 17 stone mid, its home tone
  "#475e75", // 18 stone shade, shadow faces and engraving
  "#2c3e50", // 19 stone deep, seams, socket, outlines
];

// The night palette: indices 0-15 re-light the day colour in the same
// slot, so the geometry, the ladders, and the reveal all carry over
// untouched and only the light changes. Night ramps compress and cool:
// shadows fall toward blue and purple, the meadow goes deep blue-green,
// and the canopy's lit rim (slots 7-9, the same cells the day rim uses)
// stays the brightest thing in the field after the sky. The stone ramp
// re-lights in its own slots, cooler and compressed like everything
// else after dark. Five extra slots exist only at night: the moon's
// lit rim, the moon's face, starlight, and the Guardian eye's ring and
// core, whose values the pulse steps through blue and red ladders (see
// EYE_SEQUENCE below); at rest they sit dark. Twenty-five in all.
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
  "#3d5a78", // 16 stone lit, moonlit faces
  "#2a4258", // 17 stone mid
  "#1c2f42", // 18 stone shade
  "#101e2c", // 19 stone deep, seams and socket
  "#e6eefb", // 20 moon rim; also the Guardian's moonlight rim
  "#7f97bd", // 21 moon face
  "#cfe0f7", // 22 star
  "#16283c", // 23 Guardian eye ring, at rest; the pulse steps it
  "#0e1a28", // 24 Guardian eye core, at rest; the pulse steps it
];

// The eye's pulse, as [ring, core] palette values, in visit order. Ben
// asked for blue and red both: blue is a lit Guardian eye's home
// colour, flaring brighter as it charges, and red is the colour its
// targeting light paints, so the cycle runs blue first (climb, hold
// the flare, fall), a short dark beat, then red the same shape with a
// hot core at the top. Between cycles the eye sits on the first pair,
// barely told from the socket around it.
const EYE_SEQUENCE = [
  ["#16283c", "#0e1a28"], // 0 asleep
  ["#1b6f96", "#14425f"], // 1 blue, waking
  ["#29abe2", "#3fb6dd"], // 2 blue, lit
  ["#29abe2", "#7fe7ff"], // 3 blue, the flare
  ["#8e2f26", "#571d16"], // 4 red, an ember waking
  ["#d84a35", "#f0643c"], // 5 red, lit
  ["#f0643c", "#ffcf5e"], // 6 red, the flare, core gone hot
];
const EYE_ORDER = [1, 2, 3, 3, 2, 1, 0, 0, 4, 5, 6, 6, 5, 4, 0];

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
// leg lying in the grass in front of it. Drawn last, over everything
// in its footprint, and off the ladder everywhere, so the light sweep
// passes it by the way light passes a stone. This variant spends four
// palette slots on a dedicated stone ramp (16-19) and earns the
// Guardian's size with definition: plate bands with hard seams, a
// carved eye housing in concentric rings, a segmented leg with joint
// rings. The night palette re-lights the stone slots on its own; only
// the eye is drawn differently after dark.
const S_LIT = 16;
const S_STONE = 17;
const S_SHADE = 18;
const S_DEEP = 19;
const G_MOSS = 10;

const gSaved = new Map(); // cell -> [colour, rung, ladder], first write only
const gCells = new Set(); // every cell the Guardian touches
function gSet(x, y, colour) {
  if (!inside(x, y)) return;
  const i = at(x, y);
  if (!gSaved.has(i)) gSaved.set(i, [base[i], rung[i], ladderOf[i]]);
  gCells.add(i);
  base[i] = colour;
  rung[i] = -1;
}
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

// The body on its own map, 32 wide and 27 tall, set down at (-6, 33)
// so the widest rows run past the left edge of the frame and the dome
// rises just under the hill crest. Rows are [left, right] silhouette
// edges: a stepped crown, a wide head band, a slimmer waist, a flared
// base rim, then the sink into the ground. The steps change by one or
// two cells at a time, never a smooth ellipse curve: this is plating,
// not a dome.
const G_ROWS = [
  [14, 18], [12, 21], [10, 23], [8, 25], [7, 26], [6, 27],
  [5, 28], [5, 28], [4, 29], [4, 29], [4, 29], [4, 29],
  [5, 28], [5, 28], [6, 27], [6, 27], [6, 27], [5, 28],
  [5, 28], [4, 29], [4, 29], [4, 29], [5, 28], [6, 27],
  [6, 27], [7, 26], [7, 26],
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
for (let i = 0; i < W * H; i += 1) if (gMask[i]) gSet(i % W, Math.floor(i / W), S_STONE);
function gStamp(cx, cy, rx, ry, colour) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (inside(x, y) && gMask[at(x, y)]) gSet(x, y, colour);
  });
}
gStamp(G_X + 8, G_Y + 3, 6, 3.5, S_LIT); // the lit crown plate
gStamp(G_X + 7, G_Y + 9, 5, 4.5, S_LIT); // the lit head band, left
gStamp(G_X + 10, G_Y + 15, 4, 2.5, S_LIT); // a lit reach on the waist
gStamp(G_X + 24, G_Y + 10, 5, 7, S_SHADE); // shadow down the right flank
gStamp(G_X + 23, G_Y + 19, 7, 6, S_SHADE); // shadow, lower right
gStamp(G_X + 15, G_Y + 25, 10, 3, S_SHADE); // shadow at the sink

// Edges: the top silhouette takes the lit stone, a rim the light
// catches the way it catches the reference's plating; the right edge
// falls to shade where it is still mid stone; the buried bottom edge
// goes deep.
for (let x = 0; x < W; x += 1) {
  for (let y = 0; y < H; y += 1) {
    if (gMask[at(x, y)]) {
      gSet(x, y, S_LIT);
      break;
    }
  }
}
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!gMask[at(x, y)]) continue;
    const openRight = !inside(x + 1, y) || !gMask[at(x + 1, y)];
    const openBelow = !inside(x, y + 1) || !gMask[at(x, y + 1)];
    if (openBelow && y >= G_Y + 24) gSet(x, y, S_DEEP);
    else if (openRight && base[at(x, y)] === S_STONE) gSet(x, y, S_SHADE);
  }
}

// Plate seams: a hard line across the body where one band of plating
// meets the next, deep in the shadowed reach, a step lighter where
// the light still reaches it. Vertical seam ticks stagger down the
// bands the way brickwork staggers, never lining up into a grid.
for (const seamRow of [6, 13, 17, 21]) {
  const y = G_Y + seamRow;
  for (let x = 0; x < W; x += 1) {
    if (gMask[at(x, y)]) gSet(x, y, x - G_X <= 12 ? S_SHADE : S_DEEP);
  }
}
for (const [tx, ty0, ty1, tc] of [
  [19, 1, 5, S_SHADE],
  [10, 7, 12, S_SHADE],
  [22, 7, 12, S_DEEP],
  [16, 14, 16, S_SHADE],
  [12, 18, 20, S_SHADE],
  [21, 18, 20, S_DEEP],
  [18, 22, 25, S_DEEP],
]) {
  for (let ty = ty0; ty <= ty1; ty += 1) gSet(G_X + tx, G_Y + ty, tc);
}

// The eye housing: a carved disc set into the head band, built as
// concentric rings the way the reference's eye is built. From the
// outside in: a rim ring in mid stone with its lit arc upper-left and
// its shade arc lower-right, a groove in shade, a raised bead in mid
// stone, then the deep socket, and at the centre the eye itself,
// asleep: deep stone with one shade cell for a dead lens's glint. The
// eye's own cells are recorded; after dark the night scene re-draws
// them in the eye slots and the pulse takes them over.
const eyeRing = [];
const eyeCore = [];
{
  const ex = G_X + 15;
  const ey = G_Y + 9;
  for (let y = ey - 5; y <= ey + 5; y += 1) {
    for (let x = ex - 6; x <= ex + 6; x += 1) {
      if (!inside(x, y) || !gMask[at(x, y)]) continue;
      const dx = (x - ex) / 5.2;
      const dy = (y - ey) / 4.8;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      if (d > 0.84) {
        const arc = dx + dy;
        gSet(x, y, arc < -0.55 ? S_LIT : arc > 0.55 ? S_SHADE : S_STONE);
      } else if (d > 0.66) {
        gSet(x, y, S_SHADE);
      } else if (d > 0.48) {
        gSet(x, y, S_STONE);
      } else {
        gSet(x, y, S_DEEP);
      }
    }
  }
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      gSet(ex + dx, ey + dy, S_DEEP);
      eyeRing.push(at(ex + dx, ey + dy));
    }
  }
  gSet(ex, ey, S_DEEP);
  eyeCore.push(at(ex, ey));
  gSet(ex - 1, ey - 1, S_SHADE); // the glint in the dead lens
}
// Two bars flank the housing, the notched rails the reference's eye
// sits between.
for (const bx of [7, 8, 22, 23]) gSet(G_X + bx, G_Y + 9, S_DEEP);
// An engraved arc on the lower plate, the Sheikah swirl suggested in
// five cells, and a short carved line on the crown plate.
for (const [sx, sy] of [
  [20, 19], [21, 18], [22, 19], [22, 20], [21, 20],
]) gSet(G_X + sx, G_Y + sy, S_SHADE);
for (const cx of [16, 17, 18]) gSet(G_X + cx, G_Y + 4, S_SHADE);

// Damage: a stepped notch bitten out of the crown's top right (the
// field it covered comes back exactly, rung and all), a chunk gone
// from the lower right flank, and a crack stepping down from the
// notch toward the head band.
for (const [nx, ny] of [
  [21, 1], [22, 2], [23, 2], [23, 3],
  [27, 23], [27, 24], [29, 20], [28, 21],
]) gRestore(G_X + nx, G_Y + ny);
for (const [cx, cy] of [
  [20, 3], [19, 4], [20, 5],
]) gSet(G_X + cx, G_Y + cy, S_DEEP);

// Moss, in clusters, never speckle: up the base on the left, over
// the shoulder seam, beside the crack, and creeping up the right
// flank's bottom. The meadow's own greens, with a lit tip or two
// where the light reaches.
for (const [mx, my, mc] of [
  [6, 21, G_MOSS], [7, 22, G_MOSS], [8, 22, G_MOSS], [7, 23, G_MOSS],
  [8, 21, 9],
  [6, 5, G_MOSS], [7, 5, G_MOSS], [6, 6, G_MOSS],
  [19, 2, G_MOSS], [20, 2, G_MOSS], [13, 4, G_MOSS], [12, 5, G_MOSS],
  [24, 21, G_MOSS], [25, 22, G_MOSS], [24, 22, G_MOSS],
]) gSet(G_X + mx, G_Y + my, mc);

// The fallen leg: three jointed pods lying in the grass in front of
// the body, running down-right, the last flattened into a foot with
// toe notches at its front. The pods are kept narrow and barely
// touching, so the deep joint lines between them read as the rings a
// Guardian's leg segments turn on, not as cracks in one slab. Top
// faces catch the light, bellies fall to shade over two rows, and
// the bottom edge goes deep.
const legMask = new Uint8Array(W * H);
function legStamp(cx, cy, rx, ry) {
  stamp(cx, cy, rx, ry, (x, y) => {
    if (!inside(x, y)) return;
    legMask[at(x, y)] = 1;
    gMask[at(x, y)] = 1;
    gSet(x, y, S_STONE);
  });
}
legStamp(24, 51, 3.4, 2.6);
legStamp(30, 54, 3.4, 2.6);
legStamp(37, 57, 3.6, 2.2); // the foot, flatter than the pods
for (let x = 0; x < W; x += 1) {
  const col = [];
  for (let y = 0; y < H; y += 1) if (legMask[at(x, y)]) col.push(y);
  if (!col.length) continue;
  const top = col[0];
  const bottom = col[col.length - 1];
  gSet(x, top, S_LIT);
  if (bottom > top) gSet(x, bottom, bottom >= H - 1 ? S_DEEP : S_SHADE);
  if (bottom - top >= 3) gSet(x, bottom - 1, S_SHADE);
}
for (const jx of [27, 33, 34]) {
  for (let y = 0; y < H; y += 1) {
    if (!legMask[at(jx, y)]) continue;
    const openAbove = !inside(jx, y - 1) || !legMask[at(jx, y - 1)];
    gSet(jx, y, openAbove ? S_SHADE : S_DEEP);
  }
}
// Toe notches at the foot's front: the field shows through two
// grooves, so the end reads as toes and not a rounded cap.
gRestore(40, 58);
gRestore(39, 59);
for (const [mx, my] of [
  [22, 49], [23, 49], [31, 52], [36, 55],
]) gSet(mx, my, G_MOSS);

// Flowers at the leg's base, in the scene's own flower language:
// three-cell clusters in the warm accent and in cloud white, growing
// over the ruin the way the reference's flowers grow over theirs.
for (const [fx, fy, fc] of [
  [18, 56, 15], [42, 57, 4], [15, 58, 4],
]) {
  gSet(fx, fy, fc);
  gSet(fx + 1, fy, fc);
  gSet(fx, fy + 1, fc);
}

// Two silhouette tufts against the base and the foot, seating both
// in the grass the way the foreground band's own grass stands.
for (const tx of [16, 41]) {
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
// same indices. Only a few things are drawn differently: the flowers
// sleep, a moon hangs in the calm top-right of the sky, a sparse set
// of star clusters lights in the sky the clouds leave empty, and the
// Guardian's eye wakes in its own slots under a moonlight rim.
const nightBase = Uint8Array.from(base);

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
  nightBase[at(x, y)] = 21;
  moonCells.add(at(x, y));
});
for (const i of moonCells) {
  const x = i % W;
  const y = Math.floor(i / W);
  const openAbove = !moonCells.has(at(x, y - 1));
  const openLeft = !moonCells.has(at(x - 1, y));
  if (openAbove || openLeft) nightBase[i] = 20;
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
  for (const [x, y] of cells) nightBase[at(x, y)] = 22;
}

// The Guardian after dark. First, anything the night scene's own
// drawing did inside its footprint is undone: a sleeping flower
// cluster can land under the body, and the day cells are the truth
// there. Then the eye, asleep in the day cells as plain deep stone,
// is re-drawn in the night-only eye slots; the wiring steps those
// slots' palette values through EYE_SEQUENCE and the cells never
// change. Last, moonlight catches the plating the way it catches the
// canopy's rim: the body's and the leg's top-edge cells, and the
// upper-left edge cells, take the moon rim slot, so the ruin keeps
// its outline after dark.
for (const i of gCells) nightBase[i] = base[i];
for (const i of eyeRing) nightBase[i] = 23;
for (const i of eyeCore) nightBase[i] = 24;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!gMask[at(x, y)]) continue;
    const openAbove = !inside(x, y - 1) || !gMask[at(x, y - 1)];
    const openLeft = !inside(x - 1, y) || !gMask[at(x - 1, y)];
    if (openAbove || (openLeft && y < G_Y + 14)) nightBase[at(x, y)] = 20;
  }
}

/* ---------- painting ---------- */

const toRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const DAY_RGB = PALETTE.map(toRgb);
const NIGHT_RGB = NIGHT_PALETTE.map(toRgb);
const EYE_RGB = EYE_SEQUENCE.map(([ring, core]) => [toRgb(ring), toRgb(core)]);

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
const EYE_REST_MS = 3500;

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
  // parks it at the blue waking rung, lit but steady, before first
  // paint.
  function setEye(stepIdx) {
    NIGHT_RGB[23] = EYE_RGB[EYE_ORDER[stepIdx]][0];
    NIGHT_RGB[24] = EYE_RGB[EYE_ORDER[stepIdx]][1];
  }
  if (reduced.matches) {
    NIGHT_RGB[23] = EYE_RGB[1][0];
    NIGHT_RGB[24] = EYE_RGB[1][1];
  }

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

  // The eye's timetable, kept like the light's: a pulse through blue
  // and then red, then a rest in the dark, shorter than the light's.
  // The pulse only repaints after dark; by day the eye cells are plain
  // stone and the ladder turns unseen.
  function pulse() {
    let i = 0;
    const timer = setInterval(() => {
      if (!onScreen || document.hidden) return; // the eye waits, like the front
      setEye(i);
      if (theme === "dark") paint(ctx, frame, revealed, front);
      i += 1;
      if (i >= EYE_ORDER.length) {
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
