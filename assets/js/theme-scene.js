// The theme toggle carries a tiny landscape: a grassy field at two hours.
// Light theme is dawn, dark theme is dusk, and switching steps the grid
// from one grade to the other cell by cell, in place, on the site's tick.
// Nothing moves and nothing fades: each cell swaps its whole shade or
// stays put.
//
// Anchor:
//   Subject: one grassy field, dawn and dusk grades of the same grid
//   Grid: 24x12 cells, shown at 48x24 CSS px (2px cells, integer scale)
//   Palette: "Field at Dawn" and "Field at Dusk" below, as data. Both
//     grades share one map and one set of keys, 10 colours per grade
//   Outline rule: none. Shapes read by silhouette and value alone
//   Light: one source, the sun, low on the horizon at the right. Its disc
//     sits on the far hill line, bright core with one halo rung around it
//   Layers, back to front: sky top band / sky mid band / glow band at the
//     horizon / far hill / middle field / grass foreground with clustered
//     tufts and long shadow streaks. Six value bands, each its own rung,
//     so the depth reads at the scene's small size
//   Dither: none. The grid is too small and the scene changes state, and
//     both are cases the craft rules say to keep flat
//   Motion, within the pixel rule: on a theme change the cells that differ
//     swap in a fixed scrambled order, 8 steps at 75ms (600ms total).
//     Reduced motion swaps in one cut

const W = 24;
const H = 12;
const STEPS = 8;
const TICK_MS = 75;

// Dawn: pale gold sky over a cool green field, the sun just up, its light
// warm against long cool shadows in the grass.
// Dusk: deep blue sky, the field gone dark green to near black at the
// front, the same sun low and ember coloured before it sets.
const DAWN = {
  ".": "#9fb9de", // sky top
  ",": "#cddcf0", // sky mid
  a: "#f2d492", // glow at the horizon
  S: "#fff0a6", // sun core
  s: "#f0a832", // sun halo, one rung out
  F: "#5d8463", // far hill
  M: "#7fae72", // middle field
  G: "#4e7d46", // grass foreground
  T: "#2e4f2c", // grass tufts
  D: "#3d6539", // long shadows in the grass
};

const DUSK = {
  ".": "#0d1730", // sky top
  ",": "#1d2c4d", // sky mid
  a: "#8a4632", // glow at the horizon
  S: "#ffb347", // sun core, ember
  s: "#c1442e", // sun halo, one rung out
  F: "#22354f", // far hill, cooled to blue
  M: "#1e4028", // middle field, dark green
  G: "#12291a", // grass foreground, near black green
  T: "#2c5a36", // grass tufts catching the last light
  D: "#08170e", // long shadows in the grass
};

// One string per row, one character per cell. One map for both grades:
// same field, same hills, the same sun in the same footprint on the
// horizon. Only the palette changes with the theme.
const FIELD_MAP = [
  "........................",
  "........................",
  ",,,,,,,,,,,,,,,,,,,,,,,,",
  ",,,,,,,,,,,,,,,,,,,,,,,,",
  "aaaaaaaaaaaaaaaaaaaaaaaa",
  "aaaaaaaaaaaaaaaaasssaaaa",
  "aaaaaaaaaaaaaaaasSSsaaaa",
  "FFFFFFFFFFFFFFFFsSSsFFFF",
  "FFFFFFFFFFFFFFFFFFFFFFFF",
  "MMTTMMTTMMMTTMMTTMMMMMMM",
  "GGDDGGTTGGGGDDGGTTGGGGGG",
  "GTTGGGGDDGTTGGGGGDDGGTTG",
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
  const dayCells = cellsFor(FIELD_MAP, DAWN);
  const nightCells = cellsFor(FIELD_MAP, DUSK);

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
