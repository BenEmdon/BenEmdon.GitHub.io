// Experiment: the keys legend redrawn as pixel keycaps.
//
// Each <kbd> in the legend gets a small canvas: a keycap drawn as a fixed
// grid of cells, bevels in the cap's own shades, and the key's character as
// a hand-drawn bitmap glyph (cell maps below, no font involved). The kbd
// text stays in the DOM for screen readers; CSS only hands the visual over
// to the canvas once this script has built the caps (.has-caps), so a JS
// failure still leaves the plain readable legend.
//
// The command palette wears the same caps: its esc kbd is capped by the
// static pass below, and palette.js hands each row's key hint to the
// window.mochiKeycap enhancer as it renders. Row caps live in a loose set
// (rows re-render constantly) and are pruned once their canvas leaves the
// document, instead of the id-keyed map the legend's press flash needs.
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
// Caps built for elements that come and go (palette rows) live here, not
// in the id map: several rows can wear the same key, and none needs the
// press flash. Pruned whenever a redraw finds the canvas disconnected.
const looseCaps = new Set();

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
  looseCaps.forEach((cap) => {
    if (!cap.canvas.isConnected) {
      looseCaps.delete(cap);
      return;
    }
    draw(cap);
  });
}

function pruneLoose() {
  looseCaps.forEach((cap) => {
    if (!cap.canvas.isConnected) looseCaps.delete(cap);
  });
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

// Which glyphs a key wears, and on which cap. A lone glyph centres itself
// on its cap; cmdk is the one composed pair, cmd left and K right.
function glyphSpec(id) {
  if (id === "cmdk") {
    return {
      wide: true,
      glyphs: [
        [GLYPHS.cmd, 3],
        [GLYPHS.K, 13],
      ],
    };
  }
  const map = GLYPHS[id];
  if (!map) return null;
  const wide = id === "esc";
  const capW = wide ? 21 : 11;
  return { wide, glyphs: [[map, Math.floor((capW - map[0].length) / 2)]] };
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

// The palette's esc kbd gets the same static treatment. Its rows are
// capped per render through the enhancer below.
const paletteRoot = document.querySelector("[data-palette]");
let paletteCapped = false;
paletteRoot?.querySelectorAll("kbd[data-cap]").forEach((kbd) => {
  const cap = buildCap(kbd, glyphSpec(kbd.dataset.cap));
  if (!cap) return;
  looseCaps.add(cap);
  kbd.classList.add("is-capped");
  draw(cap);
  paletteCapped = true;
});
if (paletteCapped) paletteRoot.classList.add("has-caps");

// The enhancer palette.js calls for each row's key hint as it renders.
// Safe to call on any element: unknown keys and already-capped elements
// are a no-op, and the palette works unchanged if this script is absent.
window.mochiKeycap = (el, key) => {
  if (!el || el.querySelector("canvas")) return false;
  const cap = buildCap(el, glyphSpec(key));
  if (!cap) return false;
  pruneLoose();
  looseCaps.add(cap);
  el.classList.add("is-capped");
  paletteRoot?.classList.add("has-caps");
  draw(cap);
  return true;
};

// A press lights its cap wherever the legend sits. Guards mirror main.js:
// plain keys do not count while typing, the palette combo always counts.
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
    flash("cmdk");
    return;
  }
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
