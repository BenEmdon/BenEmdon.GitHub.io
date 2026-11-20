/*
  Experiment: one tree, four seasons.

  A lone pixel tree in a small meadow plot, drawn on a fixed 64 x 40 grid.
  The silhouette never changes. A season change is only clusters swapping
  colour in place, in batches on the site's 75ms tick: no cell moves, no
  cell fades, nothing drifts. Spring carries blossom clusters, summer a
  full layered canopy, autumn muted rust and amber over a deep teal-green
  shadow, winter bare branches and a snow cap where the canopy sat.

  The light is one source, top-left, in every season: canopy clusters on
  the lit side sit one step warmer and lighter, and the canopy's lit edge
  takes a rim of the lightest shade. That rim, and the autumn direction,
  follow waneella's atmospheric scenes, the pixel artist Ben credits on
  his GitHub profile.

  One lived detail only: a small bench under the tree.

  The block opens on the current Ottawa season, then cycles while it is
  on screen. Reduced motion gets the current season, static, and the
  button swaps in a single cut.
*/

const W = 64;
const H = 40;
const CELL = 8;
const TICK = 75;
const BATCHES = 12;
const HOLD = 7000;

/* The palette is data. 18 colours across all four seasons, at most 11 on
   screen in any one. Ramps shift hue: greens cool toward blue-green in
   shadow, autumn shadow is a deep teal-green rather than a brown. */
const PALETTE = {
  sky: {
    spring: "#edf3e8",
    summer: "#e7f0f6",
    autumn: "#f4eee1",
    winter: "#eaeff4",
  },
  trunkMid: "#77573d",
  trunkDark: "#46352c",
  green: ["#a9d67e", "#6fb45e", "#3f8f52", "#256b46"],
  blossom: "#f0bfcc",
  blossomDeep: "#dd93a9",
  autumn: ["#cf9a52", "#a85f2f", "#2e5d50"],
  straw: "#b39b58",
  snow: "#f6f9fc",
  snowShade: "#cfdeee",
};

const SEASONS = ["spring", "summer", "autumn", "winter"];

/* Deterministic hash, so every render of the same code is the same
   picture and a critique pass can be trusted. */
function hash(x, y) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ---------- geometry: one shared silhouette ---------- */

function trunkSide(x, y) {
  // Returns 0 for the lit face, 1 for the shadow face, -1 for no trunk.
  let span = null;
  if (y === 35) span = [29, 34];
  else if (y >= 33) span = [30, 33];
  else if (y >= 25) span = [30, 32];
  else if (y >= 21) span = [31, 32];
  if (!span || x < span[0] || x > span[1]) return -1;
  return x <= 31 ? 0 : 1;
}

const BRANCH_PATHS = [
  // Upper left limb.
  [[31, 21], [30, 20], [29, 19], [28, 19], [27, 18], [26, 17], [25, 16], [24, 16], [23, 15], [22, 14], [21, 14], [20, 13], [19, 12]],
  // Top limb.
  [[32, 21], [32, 20], [32, 19], [33, 18], [33, 17], [34, 16], [34, 15], [35, 14], [36, 13], [37, 12]],
  // Upper right limb.
  [[32, 21], [33, 20], [34, 19], [35, 19], [36, 18], [37, 17], [38, 17], [39, 16], [40, 15], [41, 15], [42, 14], [43, 13], [44, 12]],
  // Left mid limb.
  [[30, 23], [29, 22], [28, 21], [27, 21], [26, 20], [25, 20], [24, 19], [23, 19], [22, 18], [21, 17]],
  // Right mid limb.
  [[33, 23], [34, 22], [35, 21], [36, 21], [37, 20], [38, 20], [39, 19], [40, 18], [41, 17]],
  // Twigs.
  [[24, 16], [24, 15]],
  [[39, 19], [39, 18]],
];

const branches = new Set();
for (const path of BRANCH_PATHS) {
  for (const [x, y] of path) branches.add(`${x},${y}`);
}

const BLOBS = [
  [32, 13, 12, 7.5],
  [22, 16, 6.5, 4.5],
  [42, 16, 6.5, 4.5],
  [32, 7.5, 7, 4],
];

function canopyValue(x, y) {
  let best = Infinity;
  for (const [cx, cy, rx, ry] of BLOBS) {
    const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (v < best) best = v;
  }
  return best;
}

const canopyCells = new Set();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const v = canopyValue(x, y);
    if (v > 1) continue;
    // Scalloped edge, jittered in 2x2 blocks so the rim breaks into
    // clusters rather than noise.
    if (v > 0.84 && hash(x >> 1, y >> 1) >= 0.6) continue;
    canopyCells.add(`${x},${y}`);
  }
}

const inCanopy = (x, y) => canopyCells.has(`${x},${y}`);

function canopyRole(x, y) {
  // One light, top-left. The lit rim, where the canopy meets sky on its
  // top or left edge, takes the lightest shade outright.
  if (!inCanopy(x, y - 1) || !inCanopy(x - 1, y)) {
    if (x - y < 26) return 0;
  }
  const light = 0.4 * (1 - (x - 16) / 32) + 0.6 * (1 - (y - 4) / 16);
  const perturbed = light + (hash(x >> 1, y >> 1) - 0.5) * 0.34;
  if (perturbed >= 0.6) return 0;
  if (perturbed >= 0.4) return 1;
  return 2;
}

/* The bench: one small lived detail under the tree, right of the trunk.
   Seat, backrest, two legs. In winter its top surfaces hold snow. */
const bench = new Set();
const benchTop = new Set();
for (let x = 38; x <= 42; x++) {
  bench.add(`${x},33`);
  benchTop.add(`${x},33`);
  bench.add(`${x},31`);
  benchTop.add(`${x},31`);
}
for (const [x, y] of [[38, 32], [42, 32], [38, 34], [42, 34]]) {
  bench.add(`${x},${y}`);
}

/* Grass tufts along the ground line: small three-cell sprigs, placed by
   hash, kept clear of the trunk base and the bench legs. */
const tufts = new Set();
for (let x = 3; x < 58; x++) {
  if (x >= 27 && x <= 44) continue;
  if (hash(x, 99) >= 0.34) continue;
  tufts.add(`${x},34`);
  tufts.add(`${x + 1},34`);
  tufts.add(`${x},33`);
  x += 2;
}

/* ---------- the grid ---------- */

function buildCells() {
  const cells = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const key = `${x},${y}`;
      const cell = {
        x,
        y,
        ground: y >= 35,
        trunk: trunkSide(x, y),
        branch: branches.has(key),
        // Snow settles on the upward face of a limb: a branch cell with
        // open sky above it, in clustered stretches.
        branchSnow:
          branches.has(key) &&
          !branches.has(`${x},${y - 1}`) &&
          trunkSide(x, y - 1) < 0 &&
          hash(x >> 1, y) < 0.62,
        canopy: inCanopy(x, y),
        bench: bench.has(key),
        benchTop: benchTop.has(key),
        tuft: tufts.has(key),
        role: 0,
        blossom: 0,
        cap: false,
        capShade: false,
      };
      if (cell.canopy) {
        cell.role = canopyRole(x, y);
        const b = hash(x >> 1, y);
        if (b > 0.82) cell.blossom = hash(x, y + 7) > 0.55 ? 2 : 1;
        // Clustered in 2-wide blocks, so the winter cap reads as snow
        // lying on the canopy's ghost, not as scattered dots.
        cell.cap = !inCanopy(x, y - 1) && hash(x >> 1, y) < 0.9;
        cell.capShade =
          !cell.cap && inCanopy(x, y - 1) && !inCanopy(x, y - 2) && hash(x >> 1, y + 3) < 0.5;
      }
      cells.push(cell);
    }
  }
  return cells;
}

function groundColour(cell, season) {
  const patch = hash(cell.x >> 2, cell.y) > 0.7;
  switch (season) {
    case "spring":
      return patch ? PALETTE.green[3] : PALETTE.green[2];
    case "summer":
      return patch ? PALETTE.green[2] : PALETTE.green[3];
    case "autumn":
      return PALETTE.straw;
    case "winter":
      return patch ? PALETTE.snowShade : PALETTE.snow;
  }
}

function cellColour(cell, season) {
  const P = PALETTE;
  if (cell.tuft) {
    if (season === "spring") return P.green[3];
    if (season === "summer") return P.green[2];
    if (season === "autumn") return P.autumn[1];
    return P.snowShade;
  }
  if (cell.bench) {
    // In winter only the backrest's top edge holds snow. Snowing the seat
    // too made the bench dissolve into the ground and left its legs
    // floating as four dark dots.
    if (season === "winter" && cell.benchTop && cell.y === 31) return P.snow;
    return P.trunkDark;
  }
  if (season === "winter") {
    if (cell.cap) return P.snow;
    if (cell.capShade) return P.snowShade;
    if (cell.trunk >= 0) return cell.trunk === 0 ? P.trunkMid : P.trunkDark;
    if (cell.branchSnow) return P.snow;
    if (cell.branch) return P.trunkDark;
    if (cell.ground) return groundColour(cell, season);
    return P.sky.winter;
  }
  if (cell.canopy) {
    if (season === "spring" && cell.blossom) {
      return cell.blossom === 2 ? P.blossomDeep : P.blossom;
    }
    if (season === "summer") return P.green[cell.role + 1];
    if (season === "autumn") return P.autumn[cell.role];
    return P.green[cell.role];
  }
  if (cell.trunk >= 0) return cell.trunk === 0 ? P.trunkMid : P.trunkDark;
  if (cell.branch) return P.trunkDark;
  if (cell.ground) return groundColour(cell, season);
  return P.sky[season];
}

/* ---------- season from the Ottawa date ---------- */

function ottawaSeason(now) {
  const month = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      month: "numeric",
    }).format(now)
  );
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/* ---------- wiring ---------- */

function setUp() {
  const block = document.querySelector("[data-seasons]");
  if (!block) return;
  const canvas = block.querySelector("[data-seasons-canvas]");
  const name = block.querySelector("[data-seasons-name]");
  const next = block.querySelector("[data-seasons-next]");
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const cells = buildCells();
  let season = ottawaSeason(new Date());
  let current = cells.map((cell) => cellColour(cell, season));
  let timer = 0;
  let autoTimer = 0;
  let inView = false;

  function draw() {
    for (let i = 0; i < cells.length; i++) {
      ctx.fillStyle = current[i];
      ctx.fillRect(cells[i].x * CELL, cells[i].y * CELL, CELL, CELL);
    }
  }

  function show(nextSeason, instant) {
    const target = cells.map((cell) => cellColour(cell, nextSeason));
    season = nextSeason;
    clearInterval(timer);

    if (instant || reduced.matches) {
      current = target;
      draw();
      name.textContent = nextSeason;
      return;
    }

    const diff = [];
    for (let i = 0; i < cells.length; i++) {
      if (current[i] !== target[i]) diff.push(i);
    }
    // A fixed order per change, so the swap pattern is part of the piece
    // and the same change always plays the same way.
    diff.sort((a, b) => hash(cells[a].x * 3 + diff.length, cells[a].y) - hash(cells[b].x * 3 + diff.length, cells[b].y));
    const per = Math.max(1, Math.ceil(diff.length / BATCHES));
    let batch = 0;
    timer = setInterval(() => {
      const slice = diff.slice(batch * per, (batch + 1) * per);
      for (const i of slice) current[i] = target[i];
      draw();
      batch++;
      if (batch >= BATCHES) {
        clearInterval(timer);
        name.textContent = nextSeason;
      }
    }, TICK);
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (reduced.matches) return;
    autoTimer = setTimeout(() => {
      if (document.hidden || !inView) {
        scheduleAuto();
        return;
      }
      advance();
    }, HOLD);
  }

  function advance() {
    const nextSeason = SEASONS[(SEASONS.indexOf(season) + 1) % SEASONS.length];
    show(nextSeason, false);
    scheduleAuto();
  }

  next.addEventListener("click", () => {
    const nextSeason = SEASONS[(SEASONS.indexOf(season) + 1) % SEASONS.length];
    show(nextSeason, reduced.matches);
    scheduleAuto();
  });

  const watcher = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
    },
    { threshold: 0.25 }
  );
  watcher.observe(block);

  draw();
  name.textContent = season;
  block.hidden = false;
  scheduleAuto();
}

setUp();
