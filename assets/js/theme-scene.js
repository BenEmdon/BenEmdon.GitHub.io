// Experiment: the theme toggle carries a tiny landscape, the same place at
// two hours. Day in light theme, night in dark, and switching steps the grid
// from one to the other cell by cell, in place, on the site's tick. Nothing
// moves and nothing fades: each cell swaps its whole shade or stays put.
//
// Anchor:
//   Subject: one miniature landscape, day and night states of the same grid
//   Grid: 24x12 cells, shown at 48x24 CSS px (2px cells, integer scale)
//   Palette: "Toggle Landscape" below, as data. Day 7 colours, night 6,
//     13 unique hexes across both states
//   Colour budget: 14, hard cap
//   Outline rule: none. Shapes read by silhouette and value alone
//   Light: one source, upper right. The sun in day; at night the same body
//     is a crescent moon lit on its left edge
//   Layers, back to front: sky / horizon band / sun, moon and stars /
//     far hill / near ground with grass tufts
//   Dither: none. The grid is too small and the scene changes state, and
//     both are cases the craft rules say to keep flat
//   Motion, within the pixel rule: on a theme change the cells that differ
//     swap in a fixed scrambled order, 8 steps at 75ms (600ms total).
//     Reduced motion swaps in one cut
//   Deliberate single pixels: two distant stars, (7, 4) and (21, 6). Every
//     other mark is a cluster of two cells or more

const W = 24;
const H = 12;
const STEPS = 8;
const TICK_MS = 75;

// Ramps shift hue, not just brightness: the day sky is a pale tint of the
// site's blue accent and the night sky cools further toward purple-blue,
// while the sun is the one warm note, the way highlights warm in a ramp.
const DAY = {
  ".": "#bcd6f2", // sky
  ",": "#e6effa", // horizon, and the one cloud
  S: "#ffdf8e", // sun core
  s: "#f4b942", // sun rim
  F: "#7fae72", // far hill
  G: "#4e7d46", // near ground
  T: "#3d6539", // grass tufts
};

const NIGHT = {
  ".": "#101b30", // sky
  ",": "#1e2c47", // horizon
  M: "#e8ecf4", // moon, and the bright heart of one star
  "*": "#a9cdf2", // stars, the dark theme's accent pulse
  f: "#2c4470", // far hill, the day green cooled to blue and lifted a step
  // so the layer still separates from the horizon behind it
  g: "#0d1626", // near ground, a tinted dark, never pure black
};

// One string per row, one character per cell. The two maps share their
// geometry: same hills, same ground, the same body in the same footprint.
const DAY_MAP = [
  "........................",
  "..................ss....",
  "......,,.........sSSs...",
  ".....,,,,........sSSs...",
  "..................ss....",
  "........................",
  "........................",
  ",,,,,,,,,,,,,,,,,,,,,,,,",
  ",,FFF,,,FFF,,FFF,,FFF,,,",
  "FFFFTTFFFFFTTFFFFFTTFFFF",
  "GGGGGGGGGGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGGGGGGGGGG",
];

const NIGHT_MAP = [
  "........................",
  "...*.......*......MM....",
  "..*M*.....*.*....MM.....",
  "...*.......*.*...MM.....",
  ".......*....***...MM....",
  ".............*..........",
  ".....................*..",
  ",,,,,,,,,,,,,,,,,,,,,,,,",
  ",,fff,,,fff,,fff,,fff,,,",
  "ffffffffffffffffffffffff",
  "gggggggggggggggggggggggg",
  "gggggggggggggggggggggggg",
];

function cellsFor(map, palette) {
  const cells = [];
  for (const row of map) {
    if (row.length !== W) throw new Error(`theme-scene: row is ${row.length} cells, wants ${W}`);
    for (const key of row) cells.push(palette[key]);
  }
  return cells;
}

// The order cells swap in. A fixed-seed shuffle, so every visitor gets the
// same ripple and every render of the same change is the same picture.
const ORDER = (() => {
  const order = Array.from({ length: W * H }, (_, i) => i);
  let seed = 0x2f6e2b1;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
})();

export function createThemeScene(canvas, { dark = false } = {}) {
  const ctx = canvas.getContext("2d");
  const dayCells = cellsFor(DAY_MAP, DAY);
  const nightCells = cellsFor(NIGHT_MAP, NIGHT);

  let current = (dark ? nightCells : dayCells).slice();
  let timer;

  function render() {
    for (let i = 0; i < current.length; i += 1) {
      ctx.fillStyle = current[i];
      ctx.fillRect(i % W, Math.floor(i / W), 1, 1);
    }
  }

  function setDark(nextDark, instant = false) {
    const target = nextDark ? nightCells : dayCells;
    clearInterval(timer);

    if (instant) {
      current = target.slice();
      render();
      return;
    }

    const queue = ORDER.filter((i) => current[i] !== target[i]);
    if (queue.length === 0) {
      render();
      return;
    }

    const perStep = Math.ceil(queue.length / STEPS);
    let at = 0;
    timer = setInterval(() => {
      for (let n = 0; n < perStep && at < queue.length; n += 1) {
        current[queue[at]] = target[queue[at]];
        at += 1;
      }
      render();
      if (at >= queue.length) clearInterval(timer);
    }, TICK_MS);
  }

  render();
  return { setDark };
}
