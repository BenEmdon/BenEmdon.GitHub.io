// A coherent wave lifts intact block letters, then settles into a fading accent trail.
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
      cells.push({ el, glyph, x, y, energy: 0, transform: "" });
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
    cell.transform = "";
    cell.el.style.transform = "";
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
    // Read layout before any writes; never measure a transformed cell here.
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
    // Only visit energized glyphs, and only write values that changed.
    for (const cell of active) {
      const e = cell.energy *= decay;
      if (e < 0.025) {
        settle(cell);
        continue;
      }
      // All rows in a column move together: the name stays legible.
      const transform = `translateY(${-Math.round(e * 3)}px)`;
      if (transform !== cell.transform) {
        cell.el.style.transform = transform;
        cell.transform = transform;
      }
    }
    frame = active.size ? requestAnimationFrame(draw) : 0;
  }

  wordmark.addEventListener("pointermove", (event) => {
    if (reduced.matches || event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) {
      previous = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }, { passive: true });
  wordmark.addEventListener("pointerleave", () => { pointer = null; });
  reduced.addEventListener("change", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
}
