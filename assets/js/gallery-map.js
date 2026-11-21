/*
  Gallery: overworld.

  A top-down RPG overworld map, drawn the way everything on this page is
  drawn: a grid of numbers in the source, one number per cell, each number
  picking a colour from a palette kept as data. The map is built once,
  from a seeded generator, so the same code draws the same coastline,
  forest, and town every time.

  Night is the same numbers with a different palette. The map never
  changes; the lookup does. The town windows are the tell: dark glass by
  day, lit warm by night, same cells.

  Motion is timers and swaps, never movement. The hero is three cells
  (a cream head, an orange body, the one warm colour in the palette)
  walking a fixed route from the town to the forest clearing and back:
  one whole cell per tick, with seeded holds at each end, the way a
  character in an old game waits at the edge of the woods. Water
  sparkles swap whole cells on a slower tick. If the system asks for
  reduced motion, the timers never start: one static frame, hero at
  home in town.
*/

const W = 120;
const H = 45;

/* The palette as data: slot, day, night. Ramps shift hue as they step:
   water deepens toward the site's accent blue, grass shadows cool
   toward blue-green, canopy highlights warm toward yellow, mountain
   greys lean violet. No pure black, no pure white. */
const DAY = [
  "#2a5d9e", //  0 waterDeep
  "#417fbc", //  1 water
  "#3c4c66", //  2 window, dark glass by day
  "#ecd69c", //  3 sand
  "#7cb45c", //  4 grass
  "#4e8747", //  5 grassDark
  "#2c5a34", //  6 forestDark
  "#3e7c3c", //  7 forest
  "#74ac55", //  8 forestLight
  "#9395ab", //  9 rock
  "#606278", // 10 rockDark
  "#f2f6ef", // 11 snow, also the water sparkle
  "#cfa96b", // 12 path
  "#b2543a", // 13 roof
  "#f0e4c6", // 14 wall, also the hero's face
  "#e8862e", // 15 hero, the one warm colour
];
const NIGHT = [
  "#10263d", //  0 waterDeep
  "#1c3f63", //  1 water
  "#ffb347", //  2 window, lit warm by night
  "#77683f", //  3 sand
  "#2b4a2c", //  4 grass
  "#203a22", //  5 grassDark
  "#152619", //  6 forestDark
  "#22402a", //  7 forest
  "#33523a", //  8 forestLight
  "#484a5e", //  9 rock
  "#31334a", // 10 rockDark
  "#b9c9e6", // 11 snow, moonlit, also the sparkle
  "#6b5836", // 12 path
  "#6e3527", // 13 roof
  "#8a7a58", // 14 wall
  "#e8862e", // 15 hero, warm at night like a lantern
];

/* Seeded variation, mulberry32: the same seed draws the same map. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

/* Rasterise a polyline into unit steps, so paths and the hero's route
   share one even-stepped spine. */
function rasterise(points) {
  const cells = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s < steps; s += 1) {
      cells.push([
        Math.round(x0 + ((x1 - x0) * s) / steps),
        Math.round(y0 + ((y1 - y0) * s) / steps),
      ]);
    }
  }
  cells.push(points[points.length - 1].slice());
  return cells;
}

function buildMap() {
  const rng = mulberry32(20261120);
  const map = new Uint8Array(W * H).fill(4); // grass everywhere first
  const set = (x, y, v) => {
    if (inside(x, y)) map[at(x, y)] = v;
  };
  const get = (x, y) => (inside(x, y) ? map[at(x, y)] : -1);

  /* --- the sea, west edge, with a wandering coastline --- */
  const shore = [];
  let jitter = 0;
  for (let y = 0; y < H; y += 1) {
    jitter += Math.floor(rng() * 3) - 1;
    jitter = Math.max(-2, Math.min(3, jitter));
    shore.push(17 + jitter + (y > 26 ? 1 : 0));
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < shore[y] - 1; x += 1) {
      const depth = shore[y] - 1 - x;
      if (depth > 8) set(x, y, 0);
      else if (depth > 4 && (x + y) % 2 === 0) set(x, y, 0); // dither band
      else set(x, y, 1);
    }
    set(shore[y] - 1, y, 3); // beach, two cells of sand
    set(shore[y], y, 3);
  }

  /* --- the river, out of the mountains and down to the sea --- */
  const riverLine = rasterise([
    [102, 5], [92, 11], [82, 16], [72, 20], [63, 23],
    [52, 26], [40, 28], [28, 30], [18, 32], [8, 34],
  ]);
  const riverCells = new Set();
  for (const [cx, cy] of riverLine) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (Math.abs(dx) === 1 && Math.abs(dy) === 1 && rng() < 0.45) continue;
        set(cx + dx, cy + dy, 1);
        riverCells.add(at(cx + dx, cy + dy));
      }
    }
  }
  for (const [cx, cy] of riverLine) {
    if (rng() < 0.55) set(cx, cy, 0); // the deep channel, intermittent
  }

  /* --- mountains, north-east corner: two rows of peaks, back row
     taller, so individual triangles read instead of one massif --- */
  function peak(cx, top, h) {
    for (let dy = 0; dy < h; dy += 1) {
      const half = Math.max(0, Math.round((dy / h) * h * 0.5));
      const snowRows = Math.max(1, Math.round(h * 0.22));
      for (let dx = -half; dx <= half; dx += 1) {
        let v = 9;
        if (dy < snowRows && half > 0 && Math.abs(dx) <= half - (rng() < 0.4 ? 1 : 0)) v = 11;
        else if (dx >= Math.ceil(half * 0.4) && half > 1) v = 10; // east face
        if (dy === h - 1 && dx > -half) v = 10; // base shadow
        set(cx + dx, top + dy, v);
      }
    }
    /* scree: a few dark stones scattered at the foot */
    for (let n = 0; n < 3; n += 1) {
      const sx = cx + Math.floor(rng() * (h + 4)) - Math.floor(h / 2) - 2;
      if (get(sx, top + h) === 4) set(sx, top + h, 10);
    }
  }
  peak(98, 0, 13);
  peak(110, 1, 11);
  peak(118, 3, 8);
  peak(92, 7, 8);
  peak(104, 8, 9);
  peak(114, 10, 7);
  peak(97, 13, 6);

  /* --- dirt paths: town to forest, town to beach, town to the hills --- */
  const pathLines = [
    [[75, 40], [73, 36], [71, 31], [70, 27], [67, 24], [64, 22], [60, 21]],
    [[59, 36], [44, 34], [30, 33], [21, 32]],
    [[89, 38], [100, 35], [112, 33], [119, 32]],
  ];
  const bridgeCells = new Set();
  for (const line of pathLines) {
    for (const [cx, cy] of rasterise(line)) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (Math.abs(dx) === 1 && Math.abs(dy) === 1) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!inside(x, y)) continue;
          const under = get(x, y);
          if (under === 0 || under === 1) bridgeCells.add(at(x, y));
          if (under !== 11 && under !== 9 && under !== 10) set(x, y, 12);
        }
      }
    }
  }
  /* bridge rails: dark cells flanking the path where it crosses water */
  for (const idx of bridgeCells) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    for (const fx of [x - 2, x + 2]) {
      const under = get(fx, y);
      if (under === 0 || under === 1) set(fx, y, 10);
    }
  }

  /* --- the town plaza --- */
  for (let y = 27; y <= 43; y += 1) {
    for (let x = 58; x <= 90; x += 1) {
      const edge =
        x === 58 || x === 90 || y === 27 || y === 43;
      if (edge && rng() < 0.5) continue; // a ragged plaza edge
      if (get(x, y) === 4 || get(x, y) === 5) set(x, y, 12);
    }
  }

  /* --- grass tufts, small flat pairs on open grass --- */
  for (let n = 0; n < 70; n += 1) {
    const x = 20 + Math.floor(rng() * (W - 22));
    const y = Math.floor(rng() * H);
    if (get(x, y) !== 4 || get(x + 1, y) !== 4) continue;
    set(x, y, 5);
    set(x + 1, y, 5);
    if (rng() < 0.35 && get(x + 1, y + 1) === 4) set(x + 1, y + 1, 5);
  }

  /* --- the forest: stamped canopy blobs in an ellipse --- */
  const TREE = [
    [null, 8, 8, 8, null],
    [8, 7, 7, 7, 6],
    [8, 7, 7, 6, 6],
    [7, 7, 6, 6, 6],
    [null, 6, 6, 6, null],
  ];
  function tree(cx, cy) {
    for (let dy = 0; dy < 5; dy += 1) {
      for (let dx = 0; dx < 5; dx += 1) {
        const v = TREE[dy][dx];
        if (v === null) continue;
        const x = cx + dx - 2;
        const y = cy + dy - 2;
        const under = get(x, y);
        if (under !== 4 && under !== 5) return; // never on path, river, sand
      }
    }
    for (let dy = 0; dy < 5; dy += 1) {
      for (let dx = 0; dx < 5; dx += 1) {
        const v = TREE[dy][dx];
        if (v === null) continue;
        set(cx + dx - 2, cy + dy - 2, v);
      }
    }
    set(cx, cy + 3, 6); // the trunk, one cell under the canopy
  }
  const routeCells = new Set(rasterise(pathLines[0]).map(([x, y]) => at(x, y)));
  for (let gy = 6; gy <= 25; gy += 4) {
    for (let gx = 24; gx <= 70; gx += 4) {
      const cx = gx + Math.floor(rng() * 3) - 1;
      const cy = gy + Math.floor(rng() * 3) - 1;
      const norm =
        ((cx - 46) / 24) ** 2 + ((cy - 15) / 10.5) ** 2;
      if (norm > 1) continue;
      if (Math.hypot(cx - 60, cy - 21) < 5) continue; // the clearing
      if (routeCells.has(at(cx, cy))) continue;
      tree(cx, cy);
    }
  }
  /* a few lone trees out on the grass */
  for (let n = 0; n < 7; n += 1) {
    const x = 24 + Math.floor(rng() * 88);
    const y = 4 + Math.floor(rng() * 38);
    if (Math.hypot(x - 60, y - 21) < 6) continue;
    tree(x, y);
  }

  /* --- the town: five houses on the plaza --- */
  const HOUSE = [
    ".RRRRRRR.",
    "RRRRRRRRR",
    "RRRRRRRRR",
    "EEEEEEEEE",
    ".WWWDWWW.",
    ".WnWDWnW.",
    ".WWWDWWW.",
  ];
  const HOUSE_SLOTS = { R: 13, E: 10, W: 14, D: 10, n: 2 };
  function house(hx, hy, flip) {
    HOUSE.forEach((row, dy) => {
      const cells = flip ? [...row].reverse() : [...row];
      cells.forEach((ch, dx) => {
        if (ch === ".") return;
        set(hx + dx, hy + dy, HOUSE_SLOTS[ch]);
      });
    });
  }
  house(61, 29, false);
  house(72, 28, true);
  house(82, 29, false);
  house(65, 37, true);
  house(78, 37, false);

  /* --- water sparkles: seeded cells on open water, two groups --- */
  const sparkles = [[], []];
  let guard = 0;
  while (sparkles[0].length + sparkles[1].length < 26 && guard < 900) {
    guard += 1;
    const x = Math.floor(rng() * (W - 30));
    const y = Math.floor(rng() * H);
    if (get(x, y) !== 1) continue;
    if (bridgeCells.has(at(x, y))) continue;
    sparkles[sparkles[0].length <= sparkles[1].length ? 0 : 1].push(at(x, y));
  }

  const route = rasterise(pathLines[0]);
  return { map, route, sparkles };
}

function setUpOverworld() {
  const canvas = document.querySelector('[data-gallery="map"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  const { map, route, sparkles } = buildMap();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const palette = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && systemDark.matches)
      ? NIGHT
      : DAY;

  let heroStep = 0; // index into route; 0 is home, in town
  let heroDir = 1;
  let sparklePhase = 0;

  function paint() {
    const pal = palette();
    for (let i = 0; i < map.length; i += 1) {
      ctx.fillStyle = pal[map[i]];
      ctx.fillRect(i % W, Math.floor(i / W), 1, 1);
    }
    for (const idx of sparkles[sparklePhase]) {
      ctx.fillStyle = pal[11];
      ctx.fillRect(idx % W, Math.floor(idx / W), 1, 1);
    }
    const [hx, hy] = route[heroStep];
    ctx.fillStyle = pal[14];
    ctx.fillRect(hx, hy - 2, 1, 1); // head
    ctx.fillStyle = pal[15];
    ctx.fillRect(hx, hy - 1, 1, 1); // body
    ctx.fillRect(hx, hy, 1, 1); // feet on the path
  }

  paint();

  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static frame, hero at home

  const rng = mulberry32(112358);
  const schedule = (ms, fn) => window.setTimeout(fn, ms);

  function heroTick() {
    const atEnd =
      (heroDir === 1 && heroStep === route.length - 1) ||
      (heroDir === -1 && heroStep === 0);
    if (atEnd) {
      heroDir *= -1;
      schedule(1400 + rng() * 2200, heroTick); // a hold at each end
      return;
    }
    heroStep += heroDir;
    paint();
    const pause = rng() < 0.16 ? 700 : 0; // now and then, a pause to look
    schedule(250 + pause, heroTick);
  }
  schedule(1200, heroTick);

  function sparkleTick() {
    sparklePhase = sparklePhase === 0 ? 1 : 0;
    paint();
    schedule(1000 + rng() * 500, sparkleTick);
  }
  schedule(1600, sparkleTick);
}

setUpOverworld();
