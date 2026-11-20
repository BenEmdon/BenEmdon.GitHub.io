// Dither installation: two code-drawn panels and the skyline band.
//
// The portrait in $ whoami ships dithered and clears in scrambled blocks.
// This extends that one moment into a small installation, using the same
// rules the whole site follows for pixels: a fixed grid, cells that light
// or clear in place, in discrete steps. Nothing here moves, drifts, or
// fades. A panel is either covered by its dither, or a whole 8px block of
// that dither has been cleared, or it has not.
//
// Panel 1 is the portrait again, wired up by main.js through the same
// [data-dither] path as the original. Panels 2 and 3 are drawn in code
// below, pixel by pixel, so there are no extra images to load and nothing
// is hotlinked. The band above the footer is the same skyline as panel 2,
// stretched wide and thin.

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const CELL = 8;
const STEPS = 8;
const STEP_MS = 40; // 8 steps in 320ms, matching the portrait dissolve.

// Deterministic scramble, seeded per panel. The portrait reshuffles on
// every load; these do not, because a drawn skyline should clear the same
// way twice if someone hovers it twice in a row to check.
function scrambledCells(width, height, seed) {
  const cells = [];
  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) cells.push([x, y]);
  }
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

function toRgb(value) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  const hex = ctx.fillStyle;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// Resolved colours, read the same way dither.js reads them: off computed
// `color` / `background-color`, never off the custom properties, which
// hold unevaluated light-dark() values.
function palette(panel, sceneCanvas) {
  return {
    ink: getComputedStyle(panel).color,
    paper: getComputedStyle(panel).backgroundColor,
    accent: getComputedStyle(sceneCanvas).color,
  };
}

/* ---------- scenes, drawn pixel by pixel ---------- */

function fill(ctx, colour, x, y, w, h) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}

// Panel 2: Parliament and an Ottawa skyline, 96 x 96 grid units.
// Silhouette in ink, windows cut back out in paper, the clock and a
// few sky marks in accent.
function drawSkylineScene(ctx, { ink, paper, accent }, w, h) {
  fill(ctx, paper, 0, 0, w, h);

  // Sparse sky marks in accent, on the Bayer grid so they read as dither.
  for (let y = 2; y < 40; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((BAYER_8[y % 8][x % 8] + 0.5) / 64 < 0.08) fill(ctx, accent, x, y, 1, 1);
    }
  }

  const buildings = [
    [2, 58, 14, 32], [18, 50, 16, 40], [62, 52, 16, 38], [80, 62, 14, 28],
  ];
  // Centre Block, then the Peace Tower on top of it.
  fill(ctx, ink, 36, 46, 24, 44);
  fill(ctx, ink, 45, 20, 6, 26);
  // Spire, stepped in whole pixels: 1 wide, then 3, then 5.
  fill(ctx, ink, 47, 12, 2, 8);
  fill(ctx, ink, 46, 16, 4, 4);
  fill(ctx, ink, 45, 20, 6, 2);
  // Roofs on the centre block, stepped.
  fill(ctx, ink, 38, 43, 20, 3);
  fill(ctx, ink, 41, 40, 14, 3);

  for (const [x, y, bw, bh] of buildings) fill(ctx, ink, x, y, bw, bh);

  // Ground.
  fill(ctx, ink, 0, 90, w, 6);

  // Windows: paper pixels on a fixed 4 x 5 grid inside each building.
  const blocks = [...buildings, [36, 46, 24, 44]];
  for (const [x, y, bw, bh] of blocks) {
    for (let wy = y + 4; wy < y + bh - 3; wy += 5) {
      for (let wx = x + 3; wx < x + bw - 2; wx += 4) fill(ctx, paper, wx, wy, 2, 2);
    }
  }
  // The clock: one accent square in the tower.
  fill(ctx, accent, 46, 27, 4, 4);
  fill(ctx, paper, 47, 28, 2, 2);
}

// Panel 3: a geometric pattern, decided per pixel. Concentric stepped
// squares around an accent centre, with checkerboard corners. No curves
// anywhere: every edge lands on the grid.
function drawPatternScene(ctx, { ink, paper, accent }, w, h) {
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      let colour;
      if (d < 7) colour = accent;
      else if (Math.floor(d / 6) % 2 === 0) colour = ink;
      else colour = paper;
      // Checkerboard corners, in the two tones the rings are not using
      // at that distance: a small Bayer-style patch in each corner.
      const inCorner = (x < 20 || x >= w - 20) && (y < 20 || y >= h - 20);
      if (inCorner && d >= 7) colour = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? accent : paper;
      fill(ctx, colour, x, y, 1, 1);
    }
  }
}

const SCENES = { skyline: drawSkylineScene, pattern: drawPatternScene };

/* ---------- the dither cover over a drawn scene ---------- */

// The cover is the scene put through the same Bayer quantize the portrait
// uses: two colours only, gradients surviving as pattern density. Clearing
// blocks of it reveals the full scene underneath.
function drawCover(coverCtx, sceneCanvas, { ink, paper }) {
  const { width: w, height: h } = sceneCanvas;
  const src = sceneCanvas.getContext("2d").getImageData(0, 0, w, h);
  const px = src.data;
  const [ir, ig, ib] = toRgb(ink);
  const [pr, pg, pb] = toRgb(paper);
  for (let y = 0; y < h; y += 1) {
    const row = BAYER_8[y % 8];
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const luma = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      const lit = luma > (row[x % 8] + 0.5) / 64;
      px[i] = lit ? pr : ir;
      px[i + 1] = lit ? pg : ig;
      px[i + 2] = lit ? pb : ib;
      px[i + 3] = 255;
    }
  }
  coverCtx.putImageData(src, 0, 0);
}

function setUpPanel(panel, reduced, repainters) {
  const kind = panel.dataset.galleryPanel;
  const draw = SCENES[kind];
  if (!draw) return;
  const scene = panel.querySelector("[data-gallery-scene]");
  const cover = panel.querySelector("[data-gallery-cover]");
  const sceneCtx = scene.getContext("2d");
  const coverCtx = cover.getContext("2d", { willReadFrequently: true });
  const cells = scrambledCells(scene.width, scene.height, kind === "skyline" ? 1234567 : 7654321);
  let open = 0;

  function paint() {
    const colours = palette(panel, scene);
    draw(sceneCtx, colours, scene.width, scene.height);
    drawCover(coverCtx, scene, colours);
    const count = Math.round(cells.length * (open / STEPS));
    for (let i = 0; i < count; i += 1) coverCtx.clearRect(cells[i][0], cells[i][1], CELL, CELL);
  }
  paint();
  repainters.push(paint);

  let step = 0;
  let timer;
  function dissolve(toward) {
    clearInterval(timer);
    if (reduced.matches) {
      step = toward;
      open = step;
      paint();
      return;
    }
    timer = setInterval(() => {
      step += Math.sign(toward - step);
      open = step;
      paint();
      if (step === toward) clearInterval(timer);
    }, STEP_MS);
  }

  const show = () => dissolve(STEPS);
  const hide = () => dissolve(0);
  panel.addEventListener("focus", show);
  panel.addEventListener("blur", hide);
  if (window.matchMedia("(hover: hover)").matches) {
    panel.addEventListener("pointerenter", show);
    panel.addEventListener("pointerleave", hide);
  } else {
    let latched = false;
    panel.addEventListener("click", () => {
      latched = !latched;
      dissolve(latched ? STEPS : 0);
    });
  }
}

/* ---------- the skyline band above the footer ---------- */

// One column's silhouette height, in grid units from the top of a
// 360 x 30 band. Flat-topped buildings, the Peace Tower in the middle.
function bandTop(x) {
  if (x >= 172 && x <= 188) return 5; // tower shaft
  if (x >= 158 && x <= 202) return 18; // centre block
  const blocks = [
    [0, 38, 18], [42, 78, 12], [82, 118, 20], [122, 154, 15],
    [206, 232, 16], [236, 276, 11], [280, 316, 19], [320, 360, 14],
  ];
  for (const [a, b, top] of blocks) if (x >= a && x < b) return top;
  return 28; // gaps between buildings: near the ground, so they read as gaps
}

function drawBandSource(source, { ink, paper, accent }) {
  const w = source.width;
  const h = source.height;
  const ctx = source.getContext("2d");
  for (let x = 0; x < w; x += 1) {
    const top = bandTop(x);
    for (let y = 0; y < h; y += 1) {
      let colour = paper;
      if (y >= top) {
        colour = ink;
        // Windows on a fixed grid, cut out in paper; the tower clock in accent.
        if (x % 6 === 2 && y % 5 === 2 && y > top + 1) colour = paper;
        if (x >= 177 && x <= 182 && y >= 10 && y <= 13) colour = accent;
      } else if ((BAYER_8[y % 8][x % 8] + 0.5) / 64 < 0.22 * (y / Math.max(top, 1))) {
        // Dithered sky: denser near the rooftops, thinner higher up.
        colour = accent;
      }
      fill(ctx, colour, x, y, 1, 1);
    }
  }
  // Spire, stepped: 2 wide at the top of the tower.
  fill(ctx, ink, 178, 2, 4, 4);
  fill(ctx, ink, 177, 5, 6, 2);
}

const BAND_STEPS = 24;

function setUpBand(band, reduced, repainters) {
  const source = document.createElement("canvas");
  source.width = band.width;
  source.height = band.height;
  const ctx = band.getContext("2d");
  // Band cells are 12 x 10, wider than they are tall, so one step still
  // lands as one visible chunk of skyline. Their order is scrambled once,
  // with a fixed seed, and kept.
  const bandCells = [];
  for (let y = 0; y < band.height; y += 10) {
    for (let x = 0; x < band.width; x += 12) bandCells.push([x, y]);
  }
  let state = 13579;
  for (let i = bandCells.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = Math.floor((state / 4294967296) * (i + 1));
    [bandCells[i], bandCells[j]] = [bandCells[j], bandCells[i]];
  }
  let shown = 0;
  let played = false;

  // The band has no child canvas to borrow a second colour from, so its
  // accent comes off its border, which CSS sets to the accent colour:
  // border-color resolves the same way color does.
  function bandColours() {
    const style = getComputedStyle(band);
    return { ink: style.color, paper: style.backgroundColor, accent: style.borderColor };
  }

  function paintBand() {
    drawBandSource(source, bandColours());
    ctx.clearRect(0, 0, band.width, band.height);
    const limit = Math.floor(bandCells.length * (shown / BAND_STEPS));
    for (let i = 0; i < limit; i += 1) {
      const [x, y] = bandCells[i];
      ctx.drawImage(source, x, y, 12, 10, x, y, 12, 10);
    }
  }
  paintBand();
  repainters.push(() => { shown = BAND_STEPS; paintBand(); });

  if (reduced.matches) { shown = BAND_STEPS; paintBand(); return; }

  const io = new IntersectionObserver((entries) => {
    if (played || !entries.some((e) => e.isIntersecting)) return;
    played = true;
    io.disconnect();
    const timer = setInterval(() => {
      shown += 1;
      paintBand();
      if (shown >= BAND_STEPS) clearInterval(timer);
    }, 75);
  }, { threshold: 0.4 });
  io.observe(band);
}

/* ---------- set up ---------- */

function setUp() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const repainters = [];
  for (const panel of document.querySelectorAll("[data-gallery-panel]")) setUpPanel(panel, reduced, repainters);
  const band = document.querySelector("[data-skyline-band]");
  if (band) setUpBand(band, reduced, repainters);

  // Theme changes resolve to new colours; every drawn thing repaints, in
  // its fully revealed state for the band and its current step for panels.
  new MutationObserver(() => repainters.forEach((r) => r())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => repainters.forEach((r) => r()));
}

setUp();
