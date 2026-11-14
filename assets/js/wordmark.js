// Hover lights block cells in place, display-style: a cell turns accent as
// the pointer reaches its column, then the next cell over does the same.
// Cells never move, there is no lift and no drift. The same lighting also
// runs as a sweep: a virtual pointer crosses the wordmark once after the
// boot screen clears, and again every so often while the page sits idle
// and visible, so the header has a pixel animation of its own even with
// nobody hovering it.
// The original text remains the no-JS fallback; the heading has its own label.
export async function animateWordmark(wordmark, reduced) {
  if (!wordmark || !matchMedia("(hover: hover)").matches) return;
  await document.fonts.ready;
  if (!wordmark.isConnected) return;
  const rows = wordmark.textContent.split("\n");
  const cells = [];
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
      cells.push({ el, glyph, x, y, energy: 0 });
    });
    if (y < rows.length - 1) fragment.append("\n");
  });
  wordmark.replaceChildren(fragment);
  let frame = 0;
  let previous = 0;
  let pointer = null;
  let cellWidth = 0;
  const active = new Set();

  // Font metrics are measured once after loading, then only on resize.
  function measure() {
    cellWidth = cells[0].el.getBoundingClientRect().width;
  }
  measure();
  new ResizeObserver(measure).observe(wordmark);

  function settle(cell) {
    cell.energy = 0;
    cell.el.classList.remove("is-energized");
    active.delete(cell);
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    for (const cell of active) settle(cell);
  }

  function draw(now) {
    const decay = Math.pow(0.88, Math.min(now - previous, 50) / 16.67);
    previous = now;
    // Coalesce high-frequency pointer events into one update per paint.
    // Read layout before any writes.
    if (pointer) {
      const origin = wordmark.getBoundingClientRect();
      const px = pointer.x - origin.left;
      pointer = null;
      for (const cell of cells) {
        const distance = Math.abs((cell.x + 0.5) * cellWidth - px);
        const energy = Math.max(0, 1 - distance / 65);
        if (energy <= 0.025) continue;
        cell.energy = Math.max(cell.energy, energy);
        if (!active.has(cell)) {
          active.add(cell);
          cell.el.classList.add("is-energized");
        }
      }
    }
    // Only visit energized glyphs. A cell is lit or it is not: when its
    // energy falls under the threshold it simply turns off in place, the
    // way a pixel on a display does.
    for (const cell of active) {
      const e = cell.energy *= decay;
      if (e < 0.025) {
        settle(cell);
        continue;
      }
    }
    frame = active.size ? requestAnimationFrame(draw) : 0;
  }

  function nudge(clientX) {
    pointer = { x: clientX, y: 0 };
    if (!frame) {
      previous = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }

  let lastInteract = 0;
  let sweepFrame = 0;

  function stopSweep() {
    cancelAnimationFrame(sweepFrame);
    sweepFrame = 0;
  }

  // One virtual pass across the wordmark, fed through the same nudge the
  // pointer uses, so the sweep and the hover are the same effect.
  function sweep() {
    if (reduced.matches || document.hidden) return;
    const origin = wordmark.getBoundingClientRect();
    const from = origin.left - 65;
    const to = origin.right + 65;
    const start = performance.now();
    const DURATION = 2100;
    stopSweep();
    const step = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      nudge(from + (to - from) * t);
      sweepFrame = t < 1 && !document.hidden && !reduced.matches
        ? requestAnimationFrame(step)
        : 0;
    };
    sweepFrame = requestAnimationFrame(step);
  }

  wordmark.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType === "touch") return;
    lastInteract = performance.now();
    stopSweep();
    nudge(event.clientX);
  }, { passive: true });
  wordmark.addEventListener("pointerleave", () => { pointer = null; });

  // First sweep once the boot screen (about 1.3s) has cleared, then again
  // every 20s while the page is visible and nobody has hovered recently.
  const firstSweep = setTimeout(sweep, 1600);
  const idleSweep = setInterval(() => {
    if (performance.now() - lastInteract > 12000) sweep();
  }, 20000);

  reduced.addEventListener("change", () => {
    reset();
    stopSweep();
    clearTimeout(firstSweep);
    clearInterval(idleSweep);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      reset();
      stopSweep();
    }
  });
}
