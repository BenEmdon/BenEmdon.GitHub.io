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
export async function animateWordmark(wordmark, reduced) {
  if (!wordmark || !matchMedia("(hover: hover)").matches) return;
  await document.fonts.ready;
  if (!wordmark.isConnected) return;

  const TICK = 75;
  const rows = wordmark.textContent.split("\n");
  const columnCount = Math.max(...rows.map((row) => [...row].length));
  const columns = Array.from({ length: columnCount }, () => []);
  const fragment = document.createDocumentFragment();

  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => {
      if (glyph === " ") {
        fragment.append(" ");
        return;
      }
      const el = document.createElement("span");
      el.className = "wordmark__cell";
      el.textContent = glyph;
      fragment.append(el);
      columns[x].push(el);
    });
    if (y < rows.length - 1) fragment.append("\n");
  });
  wordmark.replaceChildren(fragment);

  let cellWidth = 0;
  let litColumn = -1;
  let lastInteract = 0;
  let scanTimer = 0;
  let scanColumn = -1;

  // Font metrics are measured once after loading, then only on resize.
  function measure() {
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
