// A terminal can only change whole character cells, on a clock tick. The
// wordmark follows that limit literally. Its art is a fixed grid of
// character columns; exactly one column is lit at a time, and the lit
// column changes only once per 75ms tick. There is no distance falloff,
// no energy, no fade, and no sub-cell position: a column is accent or it
// is not, then the next column takes its place.
//
// Hover quantizes the pointer to the nearest character column. The idle
// animation is a refresh scan: one column at a time, left to right, at
// the same fixed tick. The original text remains the no-JS fallback; the
// heading has its own label.

const BLOCK_GLYPH = "█";

// The grid width comes from the block glyph itself, never from a metric
// named after a different character. The subset font loaded for the
// wordmark contains no "0", so a ch-based width is a guess each engine
// resolves through its own fallback fonts, and it lands differently
// from the advance the glyphs are actually laid out with; raw text
// advances are rounded by the shaper besides (at phone size the subset's
// 0.6em advance lays out as a flat 4px). Measured instead: twenty block
// glyphs set as plain text in the wordmark's own font at its current
// size, divided by twenty. Whatever the engine really does to the art,
// every column is then sized by that one number.
function measureCellWidth(wordmark) {
  const style = getComputedStyle(wordmark);
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;" +
    `font-family:${style.fontFamily};font-size:${style.fontSize};` +
    `font-weight:${style.fontWeight};`;
  probe.textContent = BLOCK_GLYPH.repeat(20);
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width / 20;
  probe.remove();
  return width;
}

function sizeCells(wordmark) {
  const width = measureCellWidth(wordmark);
  if (width > 0) {
    wordmark.style.setProperty("--wordmark-cell-w", `${width}px`);
  }
}

// Split the art into one span per character: block glyphs get
// .wordmark__cell, spaces get .wordmark__gap so they take the measured
// width too, instead of whatever advance the surrounding text happens
// to give them. Returns the lit-able cells grouped by column.
function splitWordmark(wordmark) {
  const rows = wordmark.textContent.split("\n");
  const columnCount = Math.max(...rows.map((row) => [...row].length));
  const columns = Array.from({ length: columnCount }, () => []);
  const fragment = document.createDocumentFragment();

  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      const el = document.createElement("span");
      el.className = glyph === " " ? "wordmark__gap" : "wordmark__cell";
      el.textContent = glyph;
      fragment.append(el);
      if (glyph !== " ") columns[x].push(el);
    });
    if (y < rows.length - 1) fragment.append("\n");
  });
  wordmark.replaceChildren(fragment);
  return columns;
}

// The touch-device split: no scan runs there, but the fixed cells are
// still what keep the letters from merging in a phone browser. Like the
// animated path, it waits for the font, so the split and the measured
// cell width come from the loaded glyphs rather than a fallback, and it
// re-measures when the viewport changes the wordmark's size.
export async function setUpStaticWordmark(wordmark) {
  if (!wordmark) return;
  await document.fonts.ready;
  if (!wordmark.isConnected) return;
  splitWordmark(wordmark);
  sizeCells(wordmark);
  new ResizeObserver(() => sizeCells(wordmark)).observe(wordmark);
}

export async function animateWordmark(wordmark, reduced) {
  if (!wordmark || !matchMedia("(hover: hover)").matches) return;
  await document.fonts.ready;
  if (!wordmark.isConnected) return;

  const TICK = 75;
  const rows = wordmark.textContent.split("\n");
  const columnCount = Math.max(...rows.map((row) => [...row].length));
  const columns = splitWordmark(wordmark);

  let cellWidth = 0;
  let litColumn = -1;
  let lastInteract = 0;
  let scanTimer = 0;
  let scanColumn = -1;

  // Font metrics are measured once after loading, then only on resize.
  function measure() {
    sizeCells(wordmark);
    const first = columns.flat().find(Boolean);
    if (first) cellWidth = first.getBoundingClientRect().width;
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
    const origin = wordmark.getBoundingClientRect();
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
