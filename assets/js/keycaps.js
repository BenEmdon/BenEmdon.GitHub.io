// Experiment: the keys legend redrawn as pixel keycaps.
//
// Each <kbd> in the legend gets a small canvas: a keycap drawn as a fixed
// grid of cells, bevels in the cap's own shades, and the key's character as
// a hand-drawn bitmap glyph (cell maps below, no font involved). The kbd
// text stays in the DOM for screen readers; CSS only hands the visual over
// to the canvas once this script has built the caps (.has-caps), so a JS
// failure still leaves the plain readable legend.
//
// Pixel rule: pressing a listed key swaps its whole cap to the lit palette
// in one whole-cell swap, holds for four 75ms ticks, and swaps back.
// Nothing moves, nothing fades, and there are no intermediate steps, so
// reduced-motion visitors get exactly the same single instant change.
//
// Palette is data, from the site's own primitives in tokens.css. Both
// themes are stored here because a canvas cannot read light-dark() back;
// the resolved theme is worked out the same way main.js does it (a pinned
// [data-theme] wins, otherwise the OS), and caps redraw whenever that
// could have moved.

const STEP_MS = 75;
const CELL_CSS = 2; // px per cell on screen: single cap 22px, wide cap 42px
const CELL_PX = 8; // backing px per cell, supersampled so caps stay crisp

const GLYPHS = {
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  t: ["..#..", "..#..", ".###.", "..#..", "..#..", "..#..", "...##"],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  cmd: [
    ".#...#.",
    "#.###.#",
    ".#...#.",
    ".#...#.",
    ".#...#.",
    "#.###.#",
    ".#...#.",
  ],
  // Return: down the right side, left along the bottom, head at the tip.
  "↵": [
    ".....#.",
    ".....#.",
    ".....#.",
    ".....#.",
    ".##..#.",
    "######.",
    ".##....",
  ],
  // Three 4-wide block letters with 1-cell gaps, on a wide cap.
  esc: [
    "####..###..###",
    "#....#....#...",
    "#....#....#...",
    "###...##..#...",
    "#.......#.#...",
    "#.......#.#...",
    "####.###...###",
  ],
};

// Resting shades plus the lit swaps. Lit reuses accent as the face and
// accent-pulse as the bevel, so a lit cap is the site's own blue, lit.
const PALETTE = {
  light: {
    face: "#dfe6f0", // --ink-200
    hi: "#f3f5fa", // --ink-100
    edge: "#8296b1", // --ink-400
    base: "#52637c", // --ink-500
    glyph: "#1e5aa8", // accent, light
    litFace: "#1e5aa8",
    litHi: "#6ea8e1", // accent pulse, light
    litGlyph: "#ffffff", // --inverted-color, light
  },
  dark: {
    face: "#212b3d", // --ink-700
    hi: "#33415a", // --ink-600
    edge: "#121826", // --ink-800
    base: "#090d16", // --ink-900
    glyph: "#6ea8e1", // accent, dark
    litFace: "#6ea8e1",
    litHi: "#a9cdf2", // accent pulse, dark
    litGlyph: "#090d16", // --inverted-color, dark
  },
};

const SHADE_KEY = { F: "face", H: "hi", E: "edge", B: "base", G: "glyph" };

// One cap as a grid of shade letters. Light from the top-left: hi bevel on
// the top row and left column, edge down the right and across the front,
// base as the shadow row underneath. Glyph maps land at rows 2..8.
function capGrid(glyphs, wide) {
  const w = wide ? 21 : 11;
  const h = 11;
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (let x = 1; x < w - 1; x++) g[0][x] = "H";
  for (let y = 1; y < 9; y++) {
    g[y][0] = "H";
    g[y][w - 1] = "E";
    for (let x = 1; x < w - 1; x++) g[y][x] = "F";
  }
  for (let x = 0; x < w; x++) g[9][x] = "E";
  for (let x = 1; x < w - 1; x++) g[10][x] = "B";
  for (const [map, ox] of glyphs) {
    map.forEach((row, gy) => {
      [...row].forEach((ch, gx) => {
        if (ch === "#") g[2 + gy][ox + gx] = "G";
      });
    });
  }
  return g;
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme() {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "light" || pinned === "dark") return pinned;
  return systemDark.matches ? "dark" : "light";
}

const caps = new Map();

function draw(cap) {
  const pal = PALETTE[resolvedTheme()];
  const colours = cap.lit
    ? { ...pal, face: pal.litFace, hi: pal.litHi, glyph: pal.litGlyph }
    : pal;
  const { ctx, grid, canvas } = cap;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = colours[SHADE_KEY[ch]];
      ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
    });
  });
}

function drawAll() {
  caps.forEach(draw);
}

function flash(id) {
  const cap = caps.get(id);
  if (!cap) return;
  cap.lit = true;
  draw(cap);
  clearTimeout(cap.timer);
  cap.timer = setTimeout(() => {
    cap.lit = false;
    draw(cap);
  }, STEP_MS * 4);
}

// Which glyph a key wears, centred on its cap.
function glyphSpec(id) {
  const map = GLYPHS[id];
  if (!map) return null;
  return { wide: false, glyphs: [[map, Math.floor((11 - map[0].length) / 2)]] };
}

// Build one cap inside an element and return it, unregistered: the caller
// decides whether it belongs to the id map or the loose set. The element's
// text stays in the DOM; CSS hands the visual to the canvas.
function buildCap(el, spec) {
  if (!spec || spec.glyphs.some(([map]) => !map)) return null;
  const grid = capGrid(spec.glyphs, spec.wide);
  const canvas = document.createElement("canvas");
  canvas.width = grid[0].length * CELL_PX;
  canvas.height = grid.length * CELL_PX;
  canvas.style.width = `${grid[0].length * CELL_CSS}px`;
  canvas.style.height = `${grid.length * CELL_CSS}px`;
  canvas.setAttribute("aria-hidden", "true");
  el.prepend(canvas);
  return { canvas, ctx: canvas.getContext("2d"), grid, lit: false, timer: 0 };
}

const panel = document.querySelector("[data-keys]");

panel?.querySelectorAll("kbd[data-cap]").forEach((kbd) => {
  const cap = buildCap(kbd, glyphSpec(kbd.dataset.cap));
  if (!cap) return;
  caps.set(kbd.dataset.cap, cap);
  draw(cap);
});

if (caps.size) panel.classList.add("has-caps");

// A press lights its cap wherever the legend sits. Guards mirror main.js:
// plain keys do not count while typing.
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const el = event.target;
  if (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)) return;
  if (caps.has(event.key)) flash(event.key);
});

// Caps are theme-aware like the dither: redraw when a pin changes, and
// when the OS moves under a system-mode page.
new MutationObserver(drawAll).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
systemDark.addEventListener("change", drawAll);
