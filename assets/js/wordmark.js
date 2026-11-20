// The wordmark is drawn as a true pixel grid. The letterforms are bitmap
// data, one cell per pixel, rendered onto a fixed grid of square cells.
// Depth comes from an offset shadow: the same letterforms drawn again one
// cell down and one cell right, behind the face, in the face's own cooler
// shade, so the light reads as coming from the top left. No dithering and
// no anti-aliasing: at this size a letter is solid clusters or it is mush.
//
// A terminal can only change whole cells, on a clock tick. The grid
// follows that limit literally: exactly one column is lit at a time, the
// lit column changes only once per 75ms tick, and a cell's colour swaps
// whole, in place. There is no distance falloff, no energy, no fade, and
// no sub-cell position: a column is lit or it is not, then the next
// column takes its place. Pixels never move.
//
// Hover quantizes the pointer to the nearest grid column. The idle
// animation is a refresh scan: one column at a time, left to right, at
// the same fixed tick. The block-glyph text in the HTML remains the
// no-JS fallback; the heading has its own label.

// Hand-drawn letterforms, 7 rows tall. B, E, N, D and O are 5 columns
// wide; M needs 7 for its vertex to land on a single cell.
const GLYPHS = {
  B: [
    "####.",
    "#...#",
    "#...#",
    "####.",
    "#...#",
    "#...#",
    "####.",
  ],
  E: [
    "#####",
    "#....",
    "#....",
    "####.",
    "#....",
    "#....",
    "#####",
  ],
  N: [
    "#...#",
    "##..#",
    "##..#",
    "#.#.#",
    "#..##",
    "#..##",
    "#...#",
  ],
  M: [
    "#.....#",
    "##...##",
    "#.#.#.#",
    "#..#..#",
    "#.....#",
    "#.....#",
    "#.....#",
  ],
  D: [
    "####.",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    "####.",
  ],
  O: [
    ".###.",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    "#...#",
    ".###.",
  ],
};

const WORDS = ["BEN", "EMDON"];
const LETTER_GAP = 1;
const WORD_GAP = 3;
const ROWS = 7;

// Lay the words out into a set of face cells, "x,y" keys. The grid is
// one column and one row larger than the face: that margin holds the
// offset shadow.
function faceCells() {
  const cells = new Set();
  let cursor = 0;

  WORDS.forEach((word, wi) => {
    if (wi > 0) cursor += WORD_GAP;
    [...word].forEach((letter, li) => {
      if (li > 0) cursor += LETTER_GAP;
      const glyph = GLYPHS[letter];
      glyph.forEach((row, y) => {
        [...row].forEach((mark, x) => {
          if (mark === "#") cells.add(`${cursor + x},${y}`);
        });
      });
      cursor += glyph[0].length;
    });
  });

  return { cells, width: cursor + 1, height: ROWS + 1 };
}

// Replace the fallback text with the pixel grid and return the cells
// grouped by column, which is all the scan below ever touches.
function buildGrid(wordmark) {
  const { cells, width, height } = faceCells();
  const columns = Array.from({ length: width }, () => []);
  const grid = document.createElement("div");
  grid.className = "wordmark__grid";
  grid.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${height}, 1fr)`;
  grid.style.aspectRatio = `${width} / ${height}`;

  function addCell(x, y, shade) {
    const el = document.createElement("span");
    el.className = "wordmark__px";
    if (shade) el.dataset.shade = shade;
    el.style.gridColumnStart = x + 1;
    el.style.gridRowStart = y + 1;
    grid.append(el);
    columns[x].push(el);
  }

  // Shadow first, then the face over it. A shadow cell the face covers
  // is simply not added: the face wins its own cell.
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    if (!cells.has(`${x + 1},${y + 1}`)) addCell(x + 1, y + 1, "shadow");
  }
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    addCell(x, y);
  }

  wordmark.replaceChildren(grid);
  wordmark.classList.add("is-pixel");
  return { grid, columns, columnCount: width };
}

export function animateWordmark(wordmark, reduced) {
  if (!wordmark) return;

  // The grid builds on every device, hover or not: it is the wordmark,
  // not an effect layered on it. Only the scan needs a pointer.
  const { grid, columns, columnCount } = buildGrid(wordmark);
  if (!matchMedia("(hover: hover)").matches) return;

  const TICK = 75;
  let cellWidth = 0;
  let litColumn = -1;
  let lastInteract = 0;
  let scanTimer = 0;
  let scanColumn = -1;

  // Cell metrics are measured once, then only on resize.
  function measure() {
    cellWidth = grid.getBoundingClientRect().width / columnCount;
  }
  measure();
  new ResizeObserver(measure).observe(wordmark);

  function setColumn(next) {
    if (next === litColumn) return;
    if (litColumn >= 0) {
      for (const el of columns[litColumn]) el.classList.remove("is-lit");
    }
    litColumn = next;
    if (litColumn >= 0) {
      for (const el of columns[litColumn]) el.classList.add("is-lit");
    }
  }

  function stopScan() {
    clearInterval(scanTimer);
    scanTimer = 0;
    scanColumn = -1;
  }

  function sweep() {
    if (reduced.matches || document.hidden || scanTimer) return;
    scanColumn = -1;
    scanTimer = setInterval(() => {
      scanColumn += 1;
      if (scanColumn >= columnCount) {
        stopScan();
        setColumn(-1);
        return;
      }
      setColumn(scanColumn);
    }, TICK);
  }

  wordmark.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType === "touch") return;
    lastInteract = performance.now();
    stopScan();
    const origin = grid.getBoundingClientRect();
    const column = Math.floor((event.clientX - origin.left) / cellWidth);
    setColumn(Math.max(0, Math.min(columnCount - 1, column)));
  }, { passive: true });

  wordmark.addEventListener("pointerleave", () => setColumn(-1));

  // First scan once the boot screen (about 1.3s) has cleared, then again
  // every 20s while the page is visible and nobody has hovered recently.
  const firstSweep = setTimeout(sweep, 1600);
  const idleSweep = setInterval(() => {
    if (performance.now() - lastInteract > 12000) sweep();
  }, 20000);

  reduced.addEventListener("change", () => {
    stopScan();
    setColumn(-1);
    clearTimeout(firstSweep);
    clearInterval(idleSweep);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopScan();
      setColumn(-1);
    }
  });
}
