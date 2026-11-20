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

  Vista variant: the same field, given distance. A far ridge stands
  behind the hills in a shade mixed toward the sky, the way haze
  flattens far country, and a thin tower stands on it, its tip lit
  orange after dark, the Sheikah colour for a tower at rest. A tiny
  figure stands by the tree on a stone slab, back turned, looking at
  all of it. Both palettes are washed one step paler than the first
  meadow's, watercolour-pale, with saturation kept only for the
  accents. The new pieces sit off the light ladders, like the distant
  copse: the sweep belongs to the near field and leaves them alone.
*/

/* ---------- anchor ---------- */

const W = 144;
const H = 60;

// Eighteen colours, each earning its place. Ramps hue-shift the way
// pixel artists build them: sky cools upward and warms at the horizon,
// meadow shadows lean blue-green while the highlights lean yellow.
// Every colour here is the first meadow's, washed one step paler:
// mixed 16% toward a warm pale grey (#edf2ea), the watercolour register
// the BotW research points at. Only the flower (15) keeps its full
// saturation; accents are where saturation is allowed to live. Two
// vista slots close the list: the far ridge, mixed from the hill
// toward the sky the way haze flattens distance, and the tower's
// silhouette, the ridge stepped halfway back toward sky mid.
const PALETTE = [
  "#4d79b2", // 0  sky zenith
  "#759ecb", // 1  sky mid
  "#aac7e2", // 2  sky low
  "#e1eff4", // 3  sky horizon
  "#fafbfc", // 4  cloud
  "#cde0ee", // 5  cloud shade
  "#b4c9a5", // 6  hill far
  "#c4d780", // 7  meadow highlight
  "#9ec574", // 8  meadow 1
  "#74af67", // 9  meadow 2
  "#5a915f", // 10 meadow 3
  "#4a7460", // 11 meadow 4, the cool shadow
  "#3f6151", // 12 canopy deep
  "#82654a", // 13 trunk
  "#66523f", // 14 trunk shade
  "#f2cf6b", // 15 flower, the one saturated accent, unwashed
  "#aec8c7", // 16 far ridge, the hill pulled toward the sky
  "#89adc8", // 17 tower silhouette, the ridge stepped deeper toward sky mid
];

// The night palette: indices 0-15 re-light the day colour in the same
// slot, so the geometry, the ladders, and the reveal all carry over
// untouched and only the light changes. Night ramps compress and cool:
// shadows fall toward blue and purple, the meadow goes deep blue-green,
// and the canopy's lit rim (slots 7-9, the same cells the day rim uses)
// stays the brightest thing in the field after the sky. The wash
// applies here too, gentler: 10% toward a pale blue-grey (#46638c),
// with the accents and lights (15-18) kept as they were. Five extra
// slots exist only at night: the moon's lit rim, the moon's face,
// starlight, the far ridge (the day ridge's cells are remapped to it
// in nightBase), and the tower's glow. Twenty-one colours in all.
const NIGHT_PALETTE = [
  "#0c162c", // 0  sky zenith, deep blue
  "#122140", // 1  sky mid
  "#192e54", // 2  sky low; also the tower's body after dark
  "#223c66", // 3  sky horizon, the last glow
  "#2f446a", // 4  cloud, a faint shape against the sky
  "#1e3252", // 5  cloud shade
  "#1b3537", // 6  hill far, silhouetted on the horizon glow
  "#3e6a55", // 7  meadow highlight, moonlit
  "#2f5848", // 8  meadow 1
  "#25493f", // 9  meadow 2
  "#1c3a31", // 10 meadow 3
  "#152a27", // 11 meadow 4, the cool shadow
  "#10212b", // 12 canopy deep, near silhouette
  "#272437", // 13 trunk, cooled toward plum
  "#1c1a2c", // 14 trunk shade
  "#cbb877", // 15 flower, one or two still awake, paled
  "#e6eefb", // 16 moon rim
  "#7f97bd", // 17 moon face
  "#cfe0f7", // 18 star
  "#1e384e", // 19 far ridge, the hill pulled toward the horizon glow
  "#ff9e2c", // 20 tower glow, Sheikah orange: powered, asleep
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

/* ----- far ridge and tower ----- */

// Distance, drawn the cheap way the research prescribes: one more
// silhouette behind the hills, in a colour mixed toward the sky, so
// the eye stacks pale ridge, greener hill, near field and calls it
// vast. The ridge crest is a gentler wave than the hill crest below
// it, so the pale band between the two varies in depth. The fill runs
// to the bottom of the frame; the hills and meadow, drawn after,
// overwrite it from their own lines down. Off the ladders, like the
// copse: the light sweep belongs to the near field.
const farCrest = (x) =>
  Math.round(28.5 - 1.8 * Math.sin(x / 47 + 0.8) - 1.0 * Math.sin(x / 19 + 2.2));

for (let x = 0; x < W; x += 1) {
  for (let y = farCrest(x); y < H; y += 1) set(x, y, 16);
}

// One landmark on the ridge, the tower from the research: thin enough
// to be mostly silhouette, tall enough to pull the eye from anywhere
// in the frame. Two cells wide with a three-cell cap and a single top
// cell, standing on the crest and sunk two rows into it so it sits in
// the ground rather than on it. By day it is a plain silhouette in the
// ridge's deeper shade; the night scene remaps its body and lights
// the top cell (see nightBase below). Clear of the clouds, the birds,
// the moon, and the stars, and on the right, balancing the tree.
const TOWER_X = 118;
const TOWER_TIP_Y = 17;
const towerBaseY = farCrest(TOWER_X) + 2;
set(TOWER_X, TOWER_TIP_Y, 17);
for (let tx = TOWER_X - 1; tx <= TOWER_X + 2; tx += 1) set(tx, TOWER_TIP_Y + 1, 17);
for (let y = TOWER_TIP_Y + 2; y <= towerBaseY; y += 1) {
  set(TOWER_X, y, 17);
  set(TOWER_X + 1, y, 17);
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

/* ----- the figure ----- */

// The Rückenfigur from the key art, shrunk to what 144 cells can
// carry: six cells tall, back turned, standing on a low stone slab
// beside the tree and looking out at the ridge and the tower. Pure
// silhouette in canopy deep, so the night palette re-lights it to a
// near-silhouette on its own. Off the ladder, like the copse and the
// ridge: a person is not ground, and the sweep passes behind him.
// The cells are recorded so the night scene can stamp him back over
// any flower it put to sleep in his footprint.
const figureCells = [];
function figureSet(x, y, colour) {
  if (!inside(x, y)) return;
  set(x, y, colour);
  rung[at(x, y)] = -1;
  figureCells.push(at(x, y));
}

// The slab: two rows of stone, mossy on top, deep in shadow below.
// He stands at the tree's left, in the sunlit swale: the lightest
// ground in the field is behind him, so the dark silhouette and the
// dark slab carry at reading size. (Pass 1 had him right of the
// trunk, on the shadow patch's edge, where figure, slab, and ground
// were all the same depth and he read as a stump.)
for (let x = 28; x <= 32; x += 1) {
  figureSet(x, 52, 11);
  figureSet(x, 53, 12);
}
// Head, shoulders, torso, legs apart. Six rows, feet on the slab.
for (const fx of [30, 31]) figureSet(fx, 46, 12);
for (const fx of [29, 30, 31]) figureSet(fx, 47, 12);
for (const fx of [30, 31]) figureSet(fx, 48, 12);
for (const fx of [30, 31]) figureSet(fx, 49, 12);
for (const fx of [29, 31]) figureSet(fx, 50, 12);
for (const fx of [29, 31]) figureSet(fx, 51, 12);

/* ----- the night scene ----- */

// The same geometry, re-lit. nightBase starts as a copy of the day
// cells; most of the night is then just the night palette reading the
// same indices. Only three things are drawn differently: the flowers
// sleep, a moon hangs in the calm top-right of the sky, and a sparse
// set of star clusters lights in the sky the clouds leave empty.
const nightBase = Uint8Array.from(base);

// The vista pieces change slots after dark. The far ridge's day
// colour (16) is the moon rim's slot in the night palette, so ridge
// cells are remapped to the night ridge (19); the tower's silhouette
// (17) becomes the deep sky-low blue (2), a darker shape against the
// horizon glow; and the tower's single top cell lights Sheikah
// orange (20), powered and asleep, the one warm note in the far
// distance. Nothing else in the day scene uses slots 16 or 17.
for (let i = 0; i < W * H; i += 1) {
  if (nightBase[i] === 16) nightBase[i] = 19;
  else if (nightBase[i] === 17) nightBase[i] = 2;
}
nightBase[at(TOWER_X, TOWER_TIP_Y)] = 20;

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

// The figure and his slab are stamped back last, so a flower put to
// sleep in his footprint cannot chew a hole in the silhouette. His
// slots are the same day and night; the palettes do the re-lighting.
for (const i of figureCells) nightBase[i] = base[i];

/* ---------- painting ---------- */

const toRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const DAY_RGB = PALETTE.map(toRgb);
const NIGHT_RGB = NIGHT_PALETTE.map(toRgb);

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
