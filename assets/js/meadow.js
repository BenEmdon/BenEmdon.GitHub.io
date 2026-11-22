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
  reveal opens whole blocks on a 75ms tick. The weather that crosses
  the field afterwards is only ground pixels stepping one shade in
  place: a gust is a band of cells one rung brighter while the band
  covers them, then one rung back as it leaves, and a cloud shadow is
  a soft patch one rung darker on its own slower crossing. Both roll
  down the field, from the horizon toward the viewer: the gust's front
  reaches the far rows first and the near rows last, widening and
  gathering a little speed as it comes, the way wind arriving across
  a real field reads. Between gusts the field rests, fully still,
  for a breath of at most about a second; the bands are orders, not
  things travelling.

  The clouds are the one part of the scene not baked into it. Each
  cloud is kept as its own cell map and composited over the sky, and
  on a slow timetable of its own it steps a single column to the
  right, holds still for seconds, then steps again: the site's
  stepped order applied to the sky, the way the wordmark types a
  column per tick. Nothing slides and nothing fades; between steps
  the sky is as still as the field. Reduced motion gets the finished
  scene in one cut, no weather at all, and the clouds parked where
  they have always hung.

  The scene is built once, deterministically: one seeded random source
  places the grass and flowers and scrambles the reveal, so every load
  is the same meadow. Painting is a single canvas of 144 x 60 cells;
  frames are drawn only while revealing, while the light crosses, on
  a cloud's step, or when the tower's lamp steps at night.

  Vista (ported onto this architecture, 2026-11-20): the same field,
  given distance. A far ridge stands behind the hills in a shade mixed
  toward the sky, the way haze flattens far country, and a small tower
  stands on it, built with what detail its size allows: an antenna
  spike, a crown with an overhang, band rows and a window in a deeper
  shade, a flared base. By day it is a plain silhouette; after dark
  the lamp in its window burns Sheikah orange without ever going out,
  and blinks up to a brighter rung every few seconds, the stone around
  the window holding a warm ember shade, a lamp with a heartbeat.
  The palettes are the meadow's own, vibrant and unwashed: the ridge
  and tower shades are mixed from them, so nothing else in the scene
  shifts. The new pieces sit off the light ladders, like the distant
  copse: the weather belongs to the near field and leaves them alone,
  and the clouds pass behind them like everything else that is not sky.
*/

import { announceBootTask } from "./boot-tasks.js";

// The boot log's zero for this module: the scene task it announces
// below is measured from here, so the duration it reports covers the
// whole build that follows, geometry through the reveal's last step.
const bootT0 = performance.now();

/* ---------- anchor ---------- */

const W = 144;
const H = 60;

// Nineteen colours, each earning its place. Ramps hue-shift the way pixel
// artists build them: sky cools upward and warms at the horizon, meadow
// shadows lean blue-green while the highlights lean yellow. Slots 0-15
// are the meadow's own palette exactly, vibrant as Ben likes it. Three
// vista slots close the list, mixed from those colours rather than
// invented: the far ridge, the hill stepped toward sky low, the way
// haze flattens distance; the tower's silhouette, the ridge stepped
// halfway back toward sky mid; and the tower's one detail shade, the
// silhouette stepped toward sky zenith, for its crown underside, its
// band rows, and its window.
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
  "#a2c0c0", // 16 far ridge, the hill pulled toward the sky
  "#80a7c2", // 17 tower silhouette, the ridge stepped deeper toward sky mid
  "#5f8bb7", // 18 tower detail, the silhouette stepped toward sky zenith
];

// The night palette: indices 0-15 re-light the day colour in the same
// slot, so the geometry, the ladders, and the reveal all carry over
// untouched and only the light changes. Night ramps compress and cool:
// shadows fall toward blue and purple, the meadow goes deep blue-green,
// and the canopy's lit rim (slots 7-9, the same cells the day rim uses)
// stays the brightest thing in the field after the sky. Three extra
// slots exist only at night: the moon's lit rim, the moon's face, and
// starlight. Four vista slots close the list, also night-only: the
// far ridge (the day ridge's cells are remapped to it in nightBase),
// mixed from the night hill halfway toward the horizon glow, and the
// tower light's three-rung ladder: a deep ember for the stone around
// the tower's window, the Sheikah orange the lamp in the window
// burns at without ever going out, and one warm pale rung above
// that for its blink. Twenty-three colours in all.
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
  "#1a3448", // 19 far ridge, the hill pulled toward the horizon glow
  "#8a4a16", // 20 tower light, ember: the warm shade in the stone flanking the window
  "#ff9e2c", // 21 tower light, lit: Sheikah orange, the window lamp's steady burn
  "#ffd08a", // 22 tower light, bright: the blink above the burn
];

// Shade ladders, brightest first. The weather steps a ground pixel one
// rung up or down and later one rung back; it never invents a colour.
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

// A subject drawn over the ground: the fence, the trunk and branches,
// the canopy. Its colour is final, and the cell leaves the weather's
// bookkeeping (rung -1, the copse's and the silhouette grass's own
// trick), so a gust or a shadow passes behind the subject and never
// repaints its wood or its leaves in ladder colours.
function setStill(x, y, colour) {
  if (!inside(x, y)) return;
  base[at(x, y)] = colour;
  rung[at(x, y)] = -1;
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
//
// Each cloud is baked as its own cell map rather than painted into
// the scene, so paint() can composite it over the sky at whatever
// column the timetable has stepped it to. The bake reads the merged
// mask of all three clouds for the shade rule, exactly as the scene
// was always drawn, and each cell is claimed by the first cloud whose
// own shape covers it: the big cloud and the middle one overlap by a
// few cells, and the shared cells ride with the big one, so the
// merged silhouette at rest is cell-for-cell the old sky. The third
// number each cloud carries is its step interval in milliseconds,
// the base its holds are seeded around; the highest cloud steps
// slowest, parallax by patience. Ben's speed call, 2026-11-20: the
// first intervals (6s, 9s, 14s) read as barely moving, so the holds
// are roughly a third of that now, and the off-edge gap before a
// cloud steps back in is 8 to 20 seconds instead of 24 to 60.
const cloudShapes = [];
const cloudMasks = [];

function cloud(cx, cy, interval, parts) {
  const mask = new Uint8Array(W * H);
  for (const [ox, oy, rx, ry] of parts) {
    stamp(cx + ox, cy + oy, rx, ry, (x, y) => {
      if (inside(x, y)) mask[at(x, y)] = 1;
    });
  }
  cloudMasks.push(mask);
  cloudShapes.push({ cx, cy, interval, cells: [], minDx: W, maxDx: -1 });
}

cloud(100, 10, 2000, [
  [0, 0, 16, 4],
  [-12, 1, 11, 3.2],
  [12, 1, 12, 3.2],
  [0, 2, 18, 2.8],
]);
cloud(70, 8, 3200, [
  [0, 0, 10, 3],
  [-8, 1, 7, 2.4],
  [8, 1, 8, 2.4],
]);
cloud(20, 4, 5000, [
  [0, 0, 7, 2.2],
  [-6, 1, 5, 1.8],
  [6, 1, 5, 1.8],
]);

{
  const merged = new Uint8Array(W * H);
  for (const mask of cloudMasks) {
    for (let i = 0; i < W * H; i += 1) if (mask[i]) merged[i] = 1;
  }
  const claimed = new Uint8Array(W * H);
  cloudShapes.forEach((shape, s) => {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = at(x, y);
        if (!cloudMasks[s][i] || claimed[i]) continue;
        claimed[i] = 1;
        const openBelow = !inside(x, y + 2) || !merged[at(x, y + 2)];
        const dx = x - shape.cx;
        shape.cells.push({ dx, dy: y - shape.cy, colour: openBelow ? 5 : 4 });
        if (dx < shape.minDx) shape.minDx = dx;
        if (dx > shape.maxDx) shape.maxDx = dx;
      }
    }
  });
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
// copse: the weather belongs to the near field. A pass after the
// scene is built clears the weather rung on any cell still wearing
// a vista colour, and paint() keeps the clouds behind these cells.
const farCrest = (x) =>
  Math.round(28.5 - 1.8 * Math.sin(x / 47 + 0.8) - 1.0 * Math.sin(x / 19 + 2.2));

for (let x = 0; x < W; x += 1) {
  for (let y = farCrest(x); y < H; y += 1) set(x, y, 16);
}

// One landmark on the ridge, the tower from the research: thin enough
// to be mostly silhouette, tall enough to pull the eye from anywhere
// in the frame, and built with what architecture its size allows.
// An antenna spike at the very top; below it a plain silhouette
// cell; a crown five cells wide with an overhang, its underside in
// the tower's one detail shade; a shaft three cells wide, its flat
// runs broken by two band rows in the detail shade and a two-cell
// window high under the crown; and a base that flares back to the
// crown's width for its last two rows, sunk into the crest so it
// sits in the ground rather than on it. By day it is a plain
// silhouette in the ridge's deeper shade, the window just a deeper
// slit. After dark the night scene remaps its body to sky low and
// its detail to sky mid, and the window becomes the lamp: it burns
// on a ladder of orange shades, the shaft cells flanking it warmed
// to the ember rung (see nightBase and the glow in paint() below).
// The light used to sit at the tower's tip, under the spike; Ben
// read that as a beacon on top of the tower, so in v4 it moved
// down into the window, where a lamp inside a tower belongs.
// Clear of the clouds, the birds, the moon, and the stars, and on
// the right, balancing the tree.
const TOWER_X = 118;
const TOWER_TOP_Y = 15; // the antenna spike
const TOWER_LIGHT_Y = 16; // one cell below the spike, plain silhouette in both themes
const TOWER_WINDOW_Y = TOWER_LIGHT_Y + 4; // the window, two cells tall: the lamp after dark
const towerBaseY = farCrest(TOWER_X) + 2;
set(TOWER_X, TOWER_TOP_Y, 17);
set(TOWER_X, TOWER_LIGHT_Y, 17);
// The crown and its shaded underside.
for (let tx = TOWER_X - 2; tx <= TOWER_X + 2; tx += 1) set(tx, TOWER_LIGHT_Y + 1, 17);
for (let tx = TOWER_X - 1; tx <= TOWER_X + 1; tx += 1) set(tx, TOWER_LIGHT_Y + 2, 18);
// The shaft, three cells wide.
for (let y = TOWER_LIGHT_Y + 3; y <= towerBaseY; y += 1) {
  for (let tx = TOWER_X - 1; tx <= TOWER_X + 1; tx += 1) set(tx, y, 17);
}
// Two band rows across the shaft, and the window, two cells tall
// in the detail shade, sitting on the upper band row like a sill.
for (const by of [TOWER_LIGHT_Y + 6, TOWER_LIGHT_Y + 10]) {
  for (let tx = TOWER_X - 1; tx <= TOWER_X + 1; tx += 1) set(tx, by, 18);
}
set(TOWER_X, TOWER_WINDOW_Y, 18);
set(TOWER_X, TOWER_WINDOW_Y + 1, 18);
// The base flare, the crown's width again.
for (let y = towerBaseY - 1; y <= towerBaseY; y += 1) {
  for (let tx = TOWER_X - 2; tx <= TOWER_X + 2; tx += 1) set(tx, y, 17);
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

// One tiny lived detail: a distant tree standing on the hill crest.
// It began as a copse, two flat stamps that read as a bush; now it is
// drawn the way the real tree is, at a tenth of the size: a lobed
// canopy built into a mask, shaded in clipped stamps, deep at the
// lower right and lit at the upper left, over a trunk that stands
// clear of the ground on both sides. Paler than the real tree, as
// distance makes things: its ramp is the canopy's own shifted one
// step paler (deep 11, body 10, lit 9, rim 8, one highlight in 7),
// and it stays off the ladder so the weather, which belongs to the
// near field, leaves it alone.
{
  const copseX = 76;
  const copseBase = crest(copseX);
  const copseSet = (colour) => (x, y) => {
    if (!inside(x, y)) return;
    set(x, y, colour);
    rung[at(x, y)] = -1;
  };

  const copseMask = new Uint8Array(W * H);
  const mark = (x, y) => {
    if (inside(x, y)) copseMask[at(x, y)] = 1;
  };
  stamp(copseX, copseBase - 6, 4.2, 2.8, mark); // the main lobe
  stamp(copseX - 3, copseBase - 4.5, 2.3, 2, mark); // a lower lobe, left
  stamp(copseX + 3, copseBase - 7.5, 2.4, 1.9, mark); // a higher lobe, right

  const copseStamp = (cx, cy, rx, ry, colour) => {
    stamp(cx, cy, rx, ry, (x, y) => {
      if (inside(x, y) && copseMask[at(x, y)]) copseSet(colour)(x, y);
    });
  };

  for (let i = 0; i < W * H; i += 1) {
    if (copseMask[i]) {
      base[i] = 11;
      rung[i] = -1;
    }
  }
  copseStamp(copseX, copseBase - 6, 4, 2.3, 10);
  copseStamp(copseX - 2, copseBase - 7, 2.6, 1.6, 9);

  // Rim light on the top edge, the main tree's own move at this scale:
  // the lit green where the sky opens above, giving up to the merely
  // lit shade toward the right, where the light gives up. Only the
  // canopy's upper rows take it: a top-edge cell low on a side lobe is
  // a knob, not a rim, and lit it reads as a stray bright cell.
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!copseMask[at(x, y)] || y >= copseBase - 5) continue;
      const openAbove = !inside(x, y - 1) || !copseMask[at(x, y - 1)];
      if (openAbove) copseSet(x <= copseX + 2 ? 8 : 9)(x, y);
    }
  }
  copseStamp(copseX - 2.5, copseBase - 8.2, 1.4, 0.7, 7);

  // The trunk, drawn last so it tucks into the canopy's underside and
  // stands against the horizon: three cells of the trunk's lit side,
  // a shaded root flare at its foot.
  copseSet(13)(copseX, copseBase - 3);
  copseSet(13)(copseX, copseBase - 2);
  copseSet(13)(copseX, copseBase - 1);
  copseSet(13)(copseX, copseBase);
  copseSet(13)(copseX - 1, copseBase);
  copseSet(14)(copseX + 1, copseBase);
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
// entirely so the weather never lifts them. They are the frame,
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
// a rung they join the weather like any other ground.
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
// warm accent and in cloud white. Above the grass, so the weather passes
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
  setStill(x, fenceY(x) - 3, 14);
  setStill(x, fenceY(x) - 1, 14);
}
for (const px of [98, 107, 116, 125, 134, 141]) {
  for (let y = fenceY(px) - 4; y <= fenceY(px); y += 1) {
    setStill(px, y, 13);
    setStill(px + 1, y, 14);
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
    setStill(x, y, x === cx + half ? 14 : 13);
  }
}
// Root flares.
setStill(trunkBaseX - 3, 54, 13);
setStill(trunkBaseX + 3, 54, 14);

// Branches, stepped diagonals stamped two cells wide; the canopy covers
// their tops.
function branch(x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    setStill(x, y, 13);
    setStill(x, y + 1, 14);
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
    if (inside(x, y) && canopyMask[at(x, y)]) setStill(x, y, colour);
  });
}

for (let i = 0; i < W * H; i += 1) {
  if (canopyMask[i]) {
    base[i] = 12;
    rung[i] = -1;
  }
}
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
    if (openAbove) setStill(x, y, x < 45 ? 8 : 9);
    else if (openLeft && y < 22) setStill(x, y, 8);
  }
}
for (const [hx, hy] of [
  [24, 10],
  [31, 8],
  [18, 15],
]) {
  canopyStamp(hx, hy, 1.6, 0.8, 7);
}

// The tree and the fence are drawn over ground, and the cells they
// cover keep the ground's weather rung, so a passing front used to
// repaint the trunk, branches, and rails in ladder greens for a few
// seconds (Ben spotted it, 2026-11-20). Their colours (canopy deep,
// trunk, trunk shade) belong to no ladder, so any cell wearing one is
// a subject, not ground: clear its rung and the weather passes behind
// it. Rest colours do not change; only the bookkeeping does.
for (let i = 0; i < W * H; i += 1) {
  if (base[i] === 12 || base[i] === 13 || base[i] === 14) rung[i] = -1;
}

// The vista pieces get the same protection, and one more besides.
// The ridge and the tower were drawn over sky, so their cells should
// already be rung-free; this pass makes it certain for any cell still
// wearing a vista colour (16, 17, 18) after the hills and meadow have
// overwritten the ridge's lower fill. The same cells are recorded in
// vistaMask: the night palette reads the ridge at slot 19 and the
// tower's body at slots 2 and 1, all values the clouds' sky test in
// paint() would otherwise mistake for sky, so the composite checks
// the mask and the clouds pass behind the ridge and tower too.
const vistaMask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i += 1) {
  if (base[i] === 16 || base[i] === 17 || base[i] === 18) {
    rung[i] = -1;
    vistaMask[i] = 1;
  }
}

/* ----- the night scene ----- */

// The same geometry, re-lit. nightBase starts as a copy of the day
// cells; most of the night is then just the night palette reading the
// same indices. A few things are drawn differently: the vista pieces
// change slots, the flowers sleep, a moon hangs in the calm top-right
// of the sky, and a sparse set of star clusters lights in the sky the
// clouds leave empty.
const nightBase = Uint8Array.from(base);

// The vista pieces change slots after dark. The far ridge's day
// colour (16) is the moon rim's slot in the night palette, so ridge
// cells are remapped to the night ridge (19); the tower's silhouette
// (17) becomes the deep sky-low blue (2), a darker shape against the
// horizon glow, and its detail shade (18) becomes sky mid (1), one
// step darker again, so the crown underside and bands stay faintly
// readable on the night body; and the tower's window cells are
// stored at the lamp's burning rung (21). paint() steps them
// through the glow ladder from there, so this stored value is the
// light at rest and under reduced motion. The cell under the spike
// that held the lamp in v3 is plain body now and remaps with the
// rest of the silhouette. Nothing else in the day scene uses slots
// 16, 17, or 18, and this runs before the moon and stars are drawn
// in their own night slots, so nothing else is caught by it.
for (let i = 0; i < W * H; i += 1) {
  if (nightBase[i] === 16) nightBase[i] = 19;
  else if (nightBase[i] === 17) nightBase[i] = 2;
  else if (nightBase[i] === 18) nightBase[i] = 1;
}
nightBase[at(TOWER_X, TOWER_WINDOW_Y)] = 21;
nightBase[at(TOWER_X, TOWER_WINDOW_Y + 1)] = 21;

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
// cluster lands on open sky: a cluster that would touch the canopy
// or the moon is skipped whole rather than clipped. The clouds are
// not part of this scene (paint() composites them over it), so a
// cluster may sit where a cloud hangs at rest; the cloud covers it
// until it steps away, which is the correct order of things. Their
// own seed, so the day scene's rolls are untouched.
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

// What paint() reads: the day cells under the day palette, or the night
// cells under the night palette. The wiring swaps the pair together
// whenever the resolved theme changes.
let scene = base;
let RGB = DAY_RGB;

// Where the clouds are right now: an origin column per cloud, and a
// gap flag for a cloud that has stepped off the right edge and is
// waiting out its empty-sky pause before stepping in from the left.
// The wiring's timetable moves these; paint() only reads them. Every
// cloud starts at its baked column, which is the sky the scene has
// always had.
const cloudState = cloudShapes.map((shape) => ({ shape, x: shape.cx, gap: false }));

// The tower light's state at night: a rung on its ladder (slots
// 20-22), stepped by the wiring's timetable and read here. The lamp
// lives in the tower's window: the two window cells show the rung,
// burning at the middle one and never going out; the timetable only
// steps them up to the bright rung for the blink and back down. It
// starts at the burning rung, and reduced motion parks it there.
// The shaft cells flanking the window hold the ember rung after
// dark, light leaking into the stone around the lamp; they do not
// step with the blink, so the window alone carries it. (In v3 the
// lamp sat at the tower's tip and haloed the sky around it; Ben
// read that as light coming from the top of the tower, so the halo
// is gone and the warmth moved into the stone.)
const GLOW_RUNGS = [20, 21, 22];
let glowRung = 1;
const towerLamp = new Set([
  at(TOWER_X, TOWER_WINDOW_Y),
  at(TOWER_X, TOWER_WINDOW_Y + 1),
]);
const towerFlanks = new Set([
  at(TOWER_X - 1, TOWER_WINDOW_Y),
  at(TOWER_X + 1, TOWER_WINDOW_Y),
  at(TOWER_X - 1, TOWER_WINDOW_Y + 1),
  at(TOWER_X + 1, TOWER_WINDOW_Y + 1),
]);

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

// Weather geometry. A gust is a band whose front is a row of the
// field: it starts above the horizon side of the ground and advances
// toward the viewer, so the far rows light first and the near rows
// last. The front is not a ruler: a wobble, a sum of sines over the
// columns, holds it a row or two early here and late there, so it
// rolls rather than descends, and each gust rolls the wobble at its
// own phase, so no two fronts trace the same line.
// A cloud shadow is a soft ellipse of shade whose rim breaks up on a
// fixed Bayer threshold, so the edge reads as soft shade rather than
// a hard outline, and the broken texture is each cell's own,
// identical on every pass.
const gustWobble = (x) => 1.5 * Math.sin(x / 16 + 0.7) + 0.8 * Math.sin(x / 6.3 + 2.0);
const GUST_FRINGE = 1.4; // rows of broken edge at the band's front and tail
// The hill takes the gust as a dither, not a solid step: the share of
// hill cells that step rises from none at the band's edges toward
// HILL_GUST_COVER at its heart, over HILL_GUST_RAMP rows of band depth.
const HILL_GUST_COVER = 0.7;
const HILL_GUST_RAMP = 3;

function shadowCovers(shadow, x, y) {
  const dx = (x - shadow.cx) / shadow.rx;
  const dy = (y - shadow.cy) / shadow.ry;
  const q = dx * dx + dy * dy;
  if (q >= 1) return false;
  const c = 1 - Math.sqrt(q); // 1 at the centre, 0 at the rim
  if (c >= 0.6) return true;
  return (BAYER_4[y % 4][x % 4] + 0.5) / 16 < (c / 0.6) * 0.75;
}

function paint(ctx, frame, revealed, fx) {
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
        // The weather: ground inside a gust's band steps one rung
        // brighter, ground inside a cloud shadow steps one rung
        // darker, and the two compose where they overlap. Everything
        // else keeps its colour exactly.
        if (rung[i] >= 0 && fx !== null) {
          let r = rung[i];
          if (fx.gust !== null) {
            // How far the front has rolled past this cell's row, in
            // the column's own wobbled frame. Inside the band the
            // cell steps one rung brighter; the band's front and tail
            // break up on the same fixed Bayer threshold the shadow's
            // rim uses, so it arrives ragged, not ruled.
            const d = fx.gust.row + gustWobble(x + fx.gust.phase) - y;
            if (d >= 0 && d <= fx.gust.depth) {
              const edge = Math.min(d, fx.gust.depth - d);
              const bayer = (BAYER_4[y % 4][x % 4] + 0.5) / 16;
              if (ladderOf[i] === 0) {
                // The near field takes the full step.
                if (edge >= GUST_FRINGE || bayer < edge / GUST_FRINGE) {
                  r -= 1;
                }
              } else if (bayer < Math.min(HILL_GUST_COVER, edge / HILL_GUST_RAMP)) {
                // The hill's one-rung step is a far bigger jump
                // (#a9c198 to #bcd26c), and a solid band of it read
                // as a searchlight, so the hill steps only in part:
                // a Bayer share of its cells, rising toward the
                // band's heart. At page scale the mix reads as a
                // half-step of light rolling over the ridge, the
                // same weather as the field's, quieter with distance.
                r -= 1;
              }
            }
          }
          if (fx.shadow !== null && shadowCovers(fx.shadow, x, y)) r += 1;
          if (r !== rung[i]) {
            const ladder = LADDERS[ladderOf[i]];
            colour = ladder[Math.min(ladder.length - 1, Math.max(0, r))];
          }
        }
        // The tower light, after dark only: the window cells show
        // the ladder rung the timetable has reached, and the shaft
        // cells flanking the window hold the ember rung, the stone
        // warmed by the lamp inside. The lamp's cells are off the
        // weather's ladders, so this never fights a gust or a
        // shadow for a cell. Whole-cell swaps, like everything
        // else here.
        if (scene === nightBase) {
          if (towerLamp.has(i)) colour = GLOW_RUNGS[glowRung];
          else if (towerFlanks.has(i)) colour = GLOW_RUNGS[0];
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
  // The clouds ride over the sky and under everything else: a cell a
  // cloud covers takes the cloud's colour only when what lies beneath
  // it belongs to the sky, the day bands by day and at night also the
  // moon and the stars, which a passing cloud duly eclipses for a
  // while. The canopy, the birds, the ground, and the vista pieces
  // (whose night slots fall inside the sky test's ranges, so
  // vistaMask speaks for them) are subjects, not sky, so the clouds
  // pass behind them. An unopened reveal block covers its clouds
  // the way it covers everything else.
  for (const cloud of cloudState) {
    if (cloud.gap) continue;
    for (const cell of cloud.shape.cells) {
      const x = cloud.x + cell.dx;
      const y = cloud.shape.cy + cell.dy;
      if (!inside(x, y)) continue;
      const i = at(x, y);
      const block = Math.floor(y / BLOCK) * BW + Math.floor(x / BLOCK);
      if (blockRank[block] >= revealed) continue;
      const under = scene[i];
      const sky =
        !vistaMask[i] && (under <= 3 || (scene === nightBase && under >= 16));
      if (!sky) continue;
      const o = i * 4;
      const [r, g, b] = RGB[cell.colour];
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(frame, 0, 0);
}

/* ---------- wiring ---------- */

// Seven steps on the site's 75 ms tick: the scene generates in about
// half a second. It was fourteen steps, a full second and change,
// which outlasted the boot screen the scene reports to.
const REVEAL_STEPS = 7;
const STEP_MS = 75; // the site's --motion-step
const WEATHER_TICK_MS = 120;
const REST_MS = 2500; // the pause before the first gust
const GUST_START_ROW = 28; // above the field's horizon edge (rows 36-44)
// The shadow's size grows as it comes forward, perspective doing the
// same work the gust's widening band does: far away it is a small,
// tight patch; near the viewer it sprawls.
const SHADOW_START_ROW = 24;
const SHADOW_STEP = 0.3; // rows per tick: the shadow rolls slower than the gusts

function shadowSize(cy) {
  const t = Math.min(1, Math.max(0, (cy - SHADOW_START_ROW) / (H - SHADOW_START_ROW)));
  return { rx: 30 + 24 * t, ry: 4 + 5 * t };
}

for (const figure of document.querySelectorAll("[data-meadow]")) {
  const canvas = figure.querySelector("[data-meadow-canvas]");
  if (!canvas) continue;
  const ctx = canvas.getContext("2d");
  const frame = ctx.createImageData(W, H);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let revealed = reduced.matches ? BW * BH : 0;
  // The weather in flight: a gust band by its front row and depth, a
  // cloud shadow by its centre and size. Either may be null, and most
  // of the time both are: stillness is the field's default state.
  const fx = { gust: null, shadow: null };
  let onScreen = false;
  let started = false;

  // The scene follows the resolved theme the way the portrait does:
  // main.js re-dithers the portrait through its repaints list whenever
  // the theme could have moved, and this is the same contract kept
  // locally, since that list lives inside main.js. The resolved theme
  // is the pinned [data-theme] when one is set, and the OS preference
  // in system mode, where the attribute is removed. A swap re-renders
  // the current state (same reveal, same weather) in the other
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
    paint(ctx, frame, revealed, fx);
  }

  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  // Only in system mode does the OS still get a vote, but listening
  // either way is harmless: applyTheme no-ops when nothing resolved
  // differently.
  systemDark.addEventListener("change", applyTheme);

  // Reduced motion holds the tower light at its burning rung,
  // steady and unblinking: the glow timetable below never starts,
  // so the rung set here is the one every paint reads.
  if (reduced.matches) glowRung = 1;

  applyTheme();

  // The boot log's scene task resolves when the scene has finished
  // generating, not at first paint. When the figure is on screen the
  // reveal's last step resolves it; when the figure is off-screen
  // nothing is generating (the reveal still waits for the figure to
  // scroll into view, as it always has), so the watcher's first report
  // resolves it on the first paint it already had. Under reduced
  // motion the scene stands complete in one cut from the start, so
  // it resolves here.
  let resolveSceneTask;
  const sceneTask = new Promise((resolve) => {
    resolveSceneTask = resolve;
  });
  announceBootTask("meadow", sceneTask);
  if (reduced.matches) resolveSceneTask({ ms: performance.now() - bootT0 });

  // The weather's timetable: cross, rest, cross. Timeouts rather than
  // an interval for the rests, so at rest the scene costs nothing at
  // all, and a wake that finds the figure off-screen or the tab hidden
  // simply sleeps again. One interval runs only while a gust or a
  // shadow is actually crossing, and the weather waits, mid-field,
  // while the tab is hidden or the figure is off-screen.
  function schedule(delay, fn) {
    setTimeout(() => {
      if (!onScreen || document.hidden) {
        schedule(1000, fn);
        return;
      }
      fn();
    }, delay);
  }

  // The timetable's own seed, so the scene's rolls stay untouched and
  // every load breathes to the same loose rhythm: the short rests
  // vary, gust widths vary, and the field is rarely still for long.
  const trng = mulberry32(20261121);
  let ticker = null;

  function startTicker() {
    if (ticker !== null) return;
    ticker = setInterval(tick, WEATHER_TICK_MS);
  }

  function tick() {
    if (!onScreen || document.hidden) return; // the weather waits
    if (fx.gust !== null) {
      // The front gathers a little speed and the band widens as both
      // come toward the viewer: nearer weather reads faster and
      // broader, the cheapest perspective there is.
      const t = Math.min(
        1,
        Math.max(0, (fx.gust.row - GUST_START_ROW) / (H - GUST_START_ROW))
      );
      fx.gust.row += 0.42 + 0.3 * t;
      fx.gust.depth = (3 + 3.8 * t) * fx.gust.depthScale;
      if (fx.gust.row - fx.gust.depth > H + 2) {
        fx.gust = null;
        // A quarter of gusts are followed closely by another.
        scheduleNextGust();
      }
    }
    if (fx.shadow !== null) {
      fx.shadow.cy += SHADOW_STEP;
      const size = shadowSize(fx.shadow.cy);
      fx.shadow.rx = size.rx;
      fx.shadow.ry = size.ry;
      if (fx.shadow.cy - fx.shadow.ry > H) {
        fx.shadow = null;
        scheduleNextShadow();
      }
    }
    paint(ctx, frame, revealed, fx);
    if (fx.gust === null && fx.shadow === null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function startGust() {
    if (fx.gust !== null) return;
    // The band starts narrow at the horizon; tick() widens it as the
    // front rolls down the field. Each gust rolls the wobble at its
    // own phase and carries its own depth scale, both from the
    // timetable's rolls, so no two gusts trace the same front.
    const depthScale = 0.85 + trng() * 0.35;
    fx.gust = {
      row: GUST_START_ROW,
      depth: 3 * depthScale,
      phase: trng() * 60,
      depthScale,
    };
    startTicker();
  }

  function scheduleNextGust() {
    // Ben's cadence call, 2026-11-20: the long rests (9-21s) made the
    // weather feel absent. Gusts now follow each other closely, at
    // most about a second of still field between one ending and the
    // next starting, never two at once.
    const rest = 200 + trng() * 800;
    schedule(rest, startGust);
  }

  function startShadow() {
    if (fx.shadow !== null) return;
    // The patch enters over the horizon at a seeded column and rolls
    // down the field, growing as it comes. Its clock is its own.
    const size = shadowSize(SHADOW_START_ROW);
    fx.shadow = {
      cx: 30 + Math.floor(trng() * 85),
      cy: SHADOW_START_ROW,
      rx: size.rx,
      ry: size.ry,
    };
    startTicker();
  }

  function scheduleNextShadow() {
    schedule(38000 + trng() * 34000, startShadow);
  }

  // The tower light's own timetable, turning on the same schedule
  // helper so it also waits while off-screen or hidden: the lamp
  // burns at its middle rung for a few seconds, steps up to bright
  // for one second, and steps back down to the burn. It never goes
  // out; the blink is a heartbeat on a lamp that stays lit. Only
  // the night scene reads the rung, so by day the cycle turns
  // nothing visible, and a theme swap mid-blink lands on whatever
  // rung the cycle has reached and steps on from there.
  const GLOW_CYCLE = [
    [1, 2500], // the steady burn
    [2, 1000], // the blink, bright
  ];
  let glowStep = 0;
  function glowAdvance() {
    const [rungNow, dwell] = GLOW_CYCLE[glowStep];
    glowStep = (glowStep + 1) % GLOW_CYCLE.length;
    glowRung = rungNow;
    if (theme === "dark") paint(ctx, frame, revealed, fx);
    schedule(dwell, glowAdvance);
  }

  // The clouds' timetable: sparse timeout chains on the same schedule
  // helper as the weather, so a step that comes due while the figure
  // is off-screen or the tab is hidden simply waits, and between
  // steps the sky costs nothing at all, no interval, no repaint. A
  // step is one whole column: the cloud's map is redrawn one column
  // over in a single paint, then the cloud holds for seconds again,
  // each hold seeded around the cloud's own interval. A cloud that
  // steps off the right edge waits out a long seeded gap, so the sky
  // is sometimes short a cloud, then steps in from the left a column
  // at a time.
  function scheduleCloud(cloud) {
    const base = cloud.shape.interval;
    schedule(base * (0.75 + trng() * 0.5), () => stepCloud(cloud));
  }

  function stepCloud(cloud) {
    if (cloud.gap) {
      cloud.gap = false;
      cloud.x = -cloud.shape.maxDx - 1;
    }
    cloud.x += 1;
    paint(ctx, frame, revealed, fx);
    if (cloud.x + cloud.shape.minDx >= W) {
      cloud.gap = true;
      schedule(8000 + trng() * 12000, () => stepCloud(cloud));
      return;
    }
    scheduleCloud(cloud);
  }

  function reveal() {
    if (started) return;
    started = true;
    if (reduced.matches) {
      revealed = BW * BH;
      paint(ctx, frame, revealed, fx);
      return; // no weather: the finished scene, held still
    }
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      revealed = Math.round((BW * BH * step) / REVEAL_STEPS);
      paint(ctx, frame, revealed, fx);
      if (step >= REVEAL_STEPS) {
        clearInterval(timer);
        resolveSceneTask({ ms: performance.now() - bootT0 });
        schedule(REST_MS, startGust);
        // The first shadow comes later, on its own schedule, so the
        // two systems are never in step.
        schedule(20000 + trng() * 12000, startShadow);
        // The tower's lamp starts its slow burn-and-blink once the
        // scene has arrived, on its own chain like the clouds.
        schedule(3000, glowAdvance);
        // The clouds start their slow stepping once the scene has
        // arrived, each on its own chain. Reduced motion returned
        // above and never reaches this, so its sky stays parked.
        for (const cloud of cloudState) scheduleCloud(cloud);
      }
    }, STEP_MS);
  }

  let watcherReported = false;
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        onScreen = entry.isIntersecting;
        if (onScreen) reveal();
        else if (!watcherReported) {
          // Off-screen at load: nothing is generating, so the boot
          // task resolves on the first paint it already had.
          resolveSceneTask({ ms: performance.now() - bootT0 });
        }
        watcherReported = true;
      }
    },
    { threshold: 0.3 }
  );
  watcher.observe(figure);
}
