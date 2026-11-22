/*
  Gallery: underwater. A sunken ruin under clear water: a broken
  arch and column stubs in the middle distance, light rays
  falling from the surface in stepped columns, a sand floor with
  a drawn thickness, and one small school of fish.

  The composition borrows Hyper Light Drifter's value plan: the
  far plane is washed almost all the way to the water colour and
  only the near plane keeps full contrast, so a broken tower on
  the left and a snapped column on the right are barely there,
  and the arch between them carries the picture. The floor gets
  Sea of Stars' treatment, drawn strata under the sand, the way
  Owlboy's ground never just ends. One light story: the surface
  above. Brightness falls off with depth, the rays thin out as
  they sink, and the ruin's top faces catch the brightest band
  where a ray lands on the arch's left column. One rationed
  accent: the fish wear the warm slot by day. After dark the
  same slot turns bioluminescent, a few cool dots on the ruin's
  shaded side and the floor, and the fish go silhouette.

  Nothing drifts and nothing fades. The seaweed sways by
  swapping which of its two shades is lit, on a slow tick. The
  fish school steps one whole column after long seeded holds.
  Bubbles rise in two fixed columns, one cell per tick, and
  recycle at the floor. The rays never move. Reduced motion
  gets one static frame.

  Self-contained: it looks for a canvas marked
  [data-gallery="underwater"] and does nothing if there is none.
*/

import { registerTask } from "./boot.js?v=20261122r";
const W = 120;
const H = 45;

/* Palette slots. One order for both themes, so the map never
   has to know which water it is under. Sixteen, the budget,
   shared across objects: shells are the stone's pale shades,
   the far ruin is the water's own deep slot, the fish's shade
   is the dimmer half of the accent pair that turns
   bioluminescent after dark. */
const SURFACE = 0; // the brightest water, at the top
const WATER_HI = 1;
const WATER_MID = 2;
const WATER_DEEP = 3; // the far ruin is washed to this
const RAY = 4; // ray light; the bubbles wear it too
const STONE_HI = 5; // lit stone; the shells wear it
const STONE = 6;
const STONE_DARK = 7;
const STONE_DEEP = 8; // the stone's own outline; the night fish
const SAND_HI = 9; // sand where a ray lands
const SAND = 10;
const SAND_DARK = 11;
const WEED = 12; // seaweed, lit half
const WEED_DARK = 13; // seaweed, shade half; algae on the stone
const ACCENT = 14; // the fish by day; bioluminescent after dark
const ACCENT_DARK = 15; // the fish's shade; dimmer bio dots

const PALETTES = {
  light: [
    "#c9eef2", "#8ad6e8", "#48aad4", "#22719f",
    "#f2feff", "#d6ddcb", "#98a68e", "#5f7460",
    "#35493a", "#ece7ba", "#b5bf8c", "#76855b",
    "#46b26d", "#1f7a49", "#f6a83c", "#cf7627",
  ],
  dark: [
    "#1e5069", "#173f5c", "#102e47", "#0a2036",
    "#86aec4", "#5e7367", "#43584b", "#2a3f33",
    "#15251d", "#55624a", "#3a4834", "#25301f",
    "#2e7d4f", "#17452b", "#83ecd4", "#2fae94",
  ],
};

const FLOOR = 38; // first sand row in the flat stretches

/* ---------- seeded variation ---------- */

// Mulberry32: small, deterministic. The same seed draws the
// same ruin every visit, and the timers jitter around their
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

// A stable per-cell hash for broken patterns: water band
// transitions, ray edges, sand flecks. Not random at render
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

/* ----- water ----- */

// The water darkens with depth in four shades. The bands meet
// the way the seaside's sea shades meet: a transition strip
// where the deeper shade takes a growing share of the cells,
// sampled per two-cell pair from the hash, so no clean line
// crosses the frame and no regular checker marches either.
function waterSlot(x, y) {
  if (y <= 5) return SURFACE;
  if (y <= 9) return hash(x >> 1, y * 7) < (y - 5) / 5 ? WATER_HI : SURFACE;
  if (y <= 16) return WATER_HI;
  if (y <= 21) return hash(x >> 1, y * 7) < (y - 16) / 6 ? WATER_MID : WATER_HI;
  if (y <= 29) return WATER_MID;
  if (y <= 34) return hash(x >> 1, y * 7) < (y - 29) / 6 ? WATER_DEEP : WATER_MID;
  return WATER_DEEP;
}

function buildWater() {
  for (let y = 0; y < FLOOR; y += 1) {
    for (let x = 0; x < W; x += 1) set(x, y, waterSlot(x, y));
  }
}

/* ----- light rays ----- */

// Stepped shade columns from the surface. Each ray leans one
// column to the right every seven rows, its edges are broken
// by the hash so the column reads as light and not as a stripe,
// and past the halfway depth the hash keeps a shrinking share
// of each row, so the rays dissolve before the floor. What
// reaches the sand lands as a pale pool, drawn with the floor.
// The third ray is placed to land on the arch's left column:
// the ruin catches the brightest band there.
const RAYS = [
  { top: 6, w: 4 },
  { top: 28, w: 6 },
  { top: 50, w: 6 },
  { top: 86, w: 4 },
  { top: 103, w: 3 },
];
const rayX = (ray, y) => ray.top + Math.floor(y / 7);

function buildRays() {
  for (const ray of RAYS) {
    for (let y = 0; y < FLOOR; y += 1) {
      for (let dx = 0; dx < ray.w; dx += 1) {
        const x = rayX(ray, y) + dx;
        if (!inside(x, y)) continue;
        // A ray is a sampling, not a stripe (pass 2): the core
        // of the column keeps most of its cells, the edges keep
        // few, and the share falls with depth from the halfway
        // rows down, so the light dissolves instead of landing
        // in a slab. Pass 1 drew solid columns and they read as
        // waterfalls.
        const edge = dx === 0 || dx === ray.w - 1;
        let keep = edge ? 0.3 : 0.62;
        if (y > 16) keep *= 1 - ((y - 16) / (FLOOR - 16)) * 0.75;
        // Sampled per vertical pair (pass 3): kept cells come
        // in short runs of two, shafts of light rather than the
        // confetti single cells scattered.
        if (hash(x, (y >> 1) * 7 + ray.top) > keep) continue;
        set(x, y, RAY);
      }
    }
  }
}

/* ----- the far ruin ----- */

// The far plane, washed to the water's deep slot, Hyper Light
// Drifter's way: a broken tower on the left and one snapped
// column on the right, silhouettes the water has nearly taken
// back. Where the water behind them is deepest they merge into
// it entirely, and that is the point. The tower keeps one
// window, left unpainted, so the eye reads a built thing and
// not a rock.
const TOWER_TOPS = [16, 14, 13, 15, 17, 18, 16, 15, 17, 19, 20, 21];

function buildFarRuin() {
  for (let i = 0; i < TOWER_TOPS.length; i += 1) {
    const x = 8 + i;
    for (let y = TOWER_TOPS[i]; y < FLOOR; y += 1) {
      if (x >= 12 && x <= 13 && y >= 20 && y <= 23) continue; // the window
      set(x, y, WATER_DEEP);
    }
  }
  const stubTops = [31, 29, 30, 32, 33];
  for (let i = 0; i < stubTops.length; i += 1) {
    for (let y = stubTops[i]; y < FLOOR; y += 1) set(105 + i, y, WATER_DEEP);
  }
}

/* ----- the floor ----- */

// The sand floor, with two shallow swales where the top edge
// dips a row. Owlboy's ground thickness underneath: two strata
// rows built from the sand's own darkest shade and the stone's
// deep shade, flecked with each other, so the floor ends as a
// drawn edge and not a cut. Where a ray lands, the sand wears
// the pale slot in a broken pool.
const floorTop = (x) =>
  (x > 30 && x < 44) || (x > 92 && x < 104) ? FLOOR + 1 : FLOOR;

function buildFloor() {
  for (let x = 0; x < W; x += 1) {
    const top = floorTop(x);
    for (let y = top; y <= 42; y += 1) {
      let slot = SAND;
      if (hash(x >> 1, y * 3) < 0.1) slot = SAND_DARK;
      else if (hash(x, y * 11) < 0.05) slot = SAND_HI;
      set(x, y, slot);
    }
    set(x, 43, hash(x, 43 * 3) < 0.3 ? STONE_DEEP : SAND_DARK);
    set(x, 44, hash(x, 44 * 3) < 0.25 ? SAND_DARK : STONE_DEEP);
  }
  // The light pools: one under each ray, centred where the
  // ray's column reaches the floor.
  for (const ray of RAYS) {
    const cx = rayX(ray, FLOOR) + (ray.w >> 1);
    const half = (ray.w >> 1) + 2;
    for (let dx = -half; dx <= half; dx += 1) {
      for (let dy = 0; dy <= 2; dy += 1) {
        const x = cx + dx;
        const y = FLOOR + dy;
        if (!inside(x, y) || y < floorTop(x)) continue;
        if (Math.abs(dx) === half && hash(x, y * 7) < 0.5) continue;
        if (grid[at(x, y)] === SAND) set(x, y, SAND_HI);
      }
    }
  }
}

/* ----- the mid ruin ----- */

// The subject, at full contrast. Stone shading follows the one
// light: top faces wear the pale slot, left faces the mid
// stone, right faces the dark stone, and every element's lowest
// row goes to the deep shade, the ground line the seaside's
// rocks taught. Outlines are the stone's own deepest shade on
// the shadow side only, never a flat wall around the lit side.

// One column of the ruin. Jagged tops for the snapped ones,
// a flared capital for the arch's left column.
function stoneColumn(x0, x1, tops, baseY, capital) {
  for (let x = x0; x <= x1; x += 1) {
    const top = tops[x - x0];
    for (let y = top; y <= baseY; y += 1) {
      let slot = STONE;
      if (x >= x1 - 1) slot = STONE_DARK; // the shaded face
      if (x === x1) slot = STONE_DEEP; // sel-out, shadow side
      if (y === top) slot = x >= x1 - 1 ? STONE_DARK : STONE_HI;
      if (y === baseY) slot = STONE_DEEP; // the ground line
      set(x, y, slot);
    }
    // Fluting: sparse dark flecks down the lit face, and algae
    // gathering low on the shaded side.
    for (let y = top + 3; y < baseY - 1; y += 1) {
      if (x === x0 + 2 && hash(x, y * 13) < 0.3) set(x, y, STONE_DARK);
      if (x === x1 - 1 && y > baseY - 7 && hash(x * 3, y) < 0.3) {
        set(x, y, WEED_DARK);
      }
    }
  }
  if (!capital) return;
  // The capital: two rows flaring one cell past the shaft on
  // each side, its top row the brightest stone in the scene.
  for (let x = x0 - 1; x <= x1 + 1; x += 1) {
    set(x, tops[0] - 2, STONE_HI);
    set(x, tops[0] - 1, x >= x1 ? STONE_DARK : STONE);
  }
}

// The broken arch: a band leaving the left capital, rising
// gently, and thinning to a jagged break well short of the
// right column. Its top edge wears the pale slot, its underside
// the dark one.
function buildArch() {
  for (let x = 51; x <= 73; x += 1) {
    const t = (x - 51) / 22;
    // A real arc, not a plank (pass 2): the band rises from the
    // capital to a crown left of centre, then falls again
    // toward the break, so the curve reads before the detail
    // does. Pass 2's rise was still too shy, so the crown comes
    // up another cell and the fall past it steepens (pass 3).
    const top = Math.round(17 - 7 * Math.sin(t * Math.PI * 0.85));
    let thick = 3;
    if (x === 71) thick = 2;
    if (x === 72) thick = 1;
    if (x === 73) thick = 1; // one pale nub past the break
    for (let dy = 0; dy < thick; dy += 1) {
      let slot =
        dy === 0 ? STONE_HI : dy === thick - 1 ? STONE_DARK : STONE;
      // Voussoir joints: every fifth column, the band's middle
      // row goes dark, so the arc reads as built blocks and
      // not as a bent plank (pass 3).
      if (dy === 1 && x % 5 === 3) slot = STONE_DARK;
      set(x, top + dy, slot);
    }
  }
}

// Fallen pieces on the sand under the break: two column drums
// lying on their sides, banded where the fluting ran, and one
// capital block come to rest against the right column.
function buildFallen() {
  const drum = (x0, x1, y0) => {
    for (let x = x0; x <= x1; x += 1) {
      set(x, y0, STONE_HI);
      set(x, y0 + 1, x === x0 + 2 || x === x1 - 1 ? STONE_DARK : STONE);
      set(x, y0 + 2, x >= x1 - 1 ? STONE_DEEP : STONE_DARK);
    }
  };
  drum(66, 72, 34);
  drum(73, 77, 36);
  // The capital block: pale top, dark right face, one algae
  // patch where it meets the sand.
  for (let x = 85; x <= 90; x += 1) {
    set(x, 35, STONE_HI);
    set(x, 36, x >= 89 ? STONE_DARK : STONE);
    set(x, 37, x >= 89 ? STONE_DEEP : STONE_DARK);
  }
  set(86, 37, WEED_DARK);
  set(87, 37, WEED_DARK);
}

function buildRuin() {
  // A lone stub left of the arch, snapped low.
  stoneColumn(41, 45, [29, 27, 28, 30, 31], FLOOR - 1, false);
  // The arch's left column, standing full height, capital on.
  stoneColumn(53, 59, [19, 19, 19, 19, 19, 19, 19], FLOOR - 1, true);
  buildArch();
  // The right column, snapped at half height.
  stoneColumn(78, 83, [26, 24, 25, 27, 28, 29], FLOOR - 1, false);
  buildFallen();
}

/* ----- shells and pebbles ----- */

// Small clusters on the sand, built from the stone's shades so
// no slot is added: shells wear the pale stone with a dark
// foot, pebbles are two and three cell blobs of mid and dark
// stone scattered by a seeded hand.
function drawShellsPebbles() {
  const shell = (sx, sy) => {
    set(sx, sy, STONE_HI);
    set(sx + 1, sy, STONE_HI);
    set(sx + 2, sy, STONE_HI);
    set(sx, sy + 1, STONE_DARK);
    set(sx + 1, sy + 1, STONE_HI);
    set(sx + 2, sy + 1, STONE_DARK);
  };
  shell(24, 40);
  shell(68, 41);
  shell(100, 39);
  const peb = mulberry32(777);
  for (let i = 0; i < 26; i += 1) {
    const x = Math.floor(peb() * (W - 3));
    const y = FLOOR + 1 + Math.floor(peb() * 4);
    if (y < floorTop(x) || grid[at(x, y)] !== SAND) continue;
    set(x, y, peb() < 0.5 ? STONE : STONE_DARK);
    if (peb() < 0.5 && grid[at(x + 1, y)] === SAND) {
      set(x + 1, y, peb() < 0.5 ? STONE_DARK : STONE);
    }
  }
}

/* ----- seaweed ----- */

// Clusters of blades standing off the floor and against the
// ruin's feet. Each blade is one cell wide with a stepped lean,
// its cells alternating the weed's two shades along its length.
// The sway is a shade swap only: on the tick, the phase flips
// and every blade's lit cells trade places with its shaded
// ones. The blade itself never moves a single cell.
function blade(x, baseY, h, lean, phase, wide) {
  for (let i = 0; i < h; i += 1) {
    const y = baseY - i;
    const xx = x + Math.floor(i / 4) * lean;
    // Lit in runs of two cells, not alternating singles
    // (pass 2): single-cell alternation read as candy striping.
    // The phase flip swaps which runs are lit, and that swap is
    // the whole sway.
    const lit = (Math.floor(i / 2) + phase) % 2 === 0;
    set(xx, y, lit ? WEED : WEED_DARK);
    // Foreground blades carry a companion column on the shadow
    // side, dark with lit flecks where the runs change over, so
    // the near plane has the cluster weight Owlboy's foliage
    // has and the mid blades stay wiry by contrast.
    if (wide) set(xx + 1, y, lit ? WEED_DARK : WEED);
    // A side leaf every fourth cell, wearing the other shade.
    if (i % 4 === 3) {
      set(xx + (lean >= 0 ? 1 : -1), y, lit ? WEED_DARK : WEED);
    }
  }
}

function drawWeed(phase) {
  // Against the ruin's feet, mid height.
  blade(47, FLOOR - 1, 8, 1, phase, false);
  blade(49, FLOOR - 1, 6, -1, phase, false);
  blade(62, FLOOR - 1, 7, 1, phase, false);
  blade(92, FLOOR - 1, 6, 1, phase, false);
  blade(33, FLOOR, 5, -1, phase, false);
  // The foreground clusters, tallest in the frame, standing in
  // front of the far tower and the right stub: the near plane,
  // Owlboy's way.
  blade(9, FLOOR - 1, 12, 1, phase, true);
  blade(13, FLOOR - 1, 9, -1, phase, true);
  blade(17, FLOOR - 1, 11, 1, phase, true);
  blade(106, FLOOR - 1, 10, -1, phase, true);
  blade(110, FLOOR - 1, 13, 1, phase, true);
  blade(114, FLOOR - 1, 8, -1, phase, true);
}

/* ----- the fish ----- */

// One school, drawn as one cluster shape: seven small fish in
// a loose wedge, each three cells of body with a shaded belly
// and tail. The school steps one whole column after a long
// hold, turns at the ends of its run, and after dark wears the
// stone's deep shades as a silhouette, because the accent slot
// has gone bioluminescent.
const FISH_OFFS = [
  [0, 0], [4, -2], [4, 2], [8, -3], [9, 1], [13, -1], [13, 3],
];

function drawFish(state, dark) {
  const body = dark ? STONE_DEEP : ACCENT;
  const shade = dark ? STONE_DARK : ACCENT_DARK;
  const dir = state.fishDir;
  for (const [ox, oy] of FISH_OFFS) {
    // The school keeps one bounding box whichever way it
    // faces: offsets mirror inside it, and each fish is drawn
    // from its leftmost cell, tail on the trailing side.
    const lx = state.fishX + (dir > 0 ? ox : 13 - ox);
    const fy = 20 + oy;
    set(lx, fy, dir > 0 ? shade : body); // tail, or nose
    set(lx + 1, fy, body);
    set(lx + 2, fy, dir > 0 ? body : shade); // nose, or tail
    set(lx + 1, fy + 1, body); // the belly's lit half
    set(lx + 2, fy + 1, dir > 0 ? shade : body); // the belly's shade
  }
}

/* ----- bubbles ----- */

// Two fixed columns, one beside the arch's left column and one
// past the fallen capital, rising off cracks in the floor.
// Each bubble is a single deliberate cell in the ray slot; the
// column steps up one cell per tick and a bubble that reaches
// the bright water starts again at the floor.
const BUBBLE_COLS = [
  { x: 49, ys: [35, 29, 22] },
  { x: 91, ys: [36, 30, 24] },
];

function drawBubbles(state) {
  for (const col of state.bubbles) {
    for (const y of col.ys) set(col.x, y, RAY);
  }
}

/* ----- after dark ----- */

// Bioluminescent dots, the dark theme's single accent: a few
// cells of the accent pair resting on the ruin's shaded faces,
// the fallen drums, and the floor. Deliberate single pixels,
// named in the anchor.
const BIO = [
  [58, 30, ACCENT], [59, 34, ACCENT], [70, 36, ACCENT],
  [82, 30, ACCENT], [81, 35, ACCENT], [30, 40, ACCENT],
  [95, 41, ACCENT], [45, 33, ACCENT],
  [57, 26, ACCENT_DARK], [75, 37, ACCENT_DARK], [20, 41, ACCENT_DARK],
];

function drawBio() {
  for (const [x, y, slot] of BIO) set(x, y, slot);
}

function buildScene(state, dark) {
  buildWater();
  buildRays();
  buildFarRuin();
  buildFloor();
  buildRuin();
  drawShellsPebbles();
  drawWeed(state.sway);
  drawFish(state, dark);
  drawBubbles(state);
  if (dark) drawBio();
}

/* ---------- wiring ---------- */

function setUpUnderwater() {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting underwater", { timeout: 12000 });
  const canvas = document.querySelector('[data-gallery="underwater"]');
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
    sway: 0,
    fishX: 20,
    fishDir: 1,
    bubbles: BUBBLE_COLS.map((c) => ({ x: c.x, ys: [...c.ys] })),
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

  // Sparse chains only: each mover holds, steps whole cells,
  // and repaints once.
  const timers = [];
  function schedule(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  function stepSway() {
    state.sway = state.sway === 0 ? 1 : 0;
    paint();
    schedule(stepSway, 2400 + trng() * 1600);
  }

  function stepFish() {
    state.fishX += state.fishDir;
    if (state.fishX >= 34) state.fishDir = -1;
    if (state.fishX <= 20) state.fishDir = 1;
    paint();
    schedule(stepFish, 5000 + trng() * 5000);
  }

  function stepBubbles() {
    for (const col of state.bubbles) {
      col.ys = col.ys.map((y) => (y <= 3 ? FLOOR - 2 - Math.floor(trng() * 2) : y - 1));
    }
    paint();
    schedule(stepBubbles, 620 + trng() * 180);
  }

  schedule(stepSway, 2400 + trng() * 1600);
  schedule(stepFish, 5000 + trng() * 5000);
  schedule(stepBubbles, 620 + trng() * 180);
}

setUpUnderwater();
