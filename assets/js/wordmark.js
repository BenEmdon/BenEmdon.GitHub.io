// A terminal can only change whole character cells, on a clock tick. The
// wordmark follows that limit literally. Its art is a fixed grid of
// character cells; a cell's colour changes only once per 75ms tick, in
// place, as a whole-cell swap to another palette colour. There is no
// fade, no drift, and no sub-cell rendering: a cell sits at one rung of
// the shade ladder or at rest.
//
// Hover carries a pool of light across the word. A cell's rung is its
// distance from the pointer, measured between true cell centres, so the
// pool crosses letter boundaries in steps instead of snapping column to
// column the way the old single-column light did. The core takes the
// accent, the rings around it step down the ladder toward the resting
// ink. Pointer speed stretches the pool along the direction of travel;
// a resting pointer keeps a tight round pool. The idle animation is the
// same pool crossing the word on its own, one column per tick, on the
// schedule the old refresh scan kept. The original text remains the
// no-JS fallback; the heading has its own label.

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
  splitWordmark(wordmark);

  // The pool is computed in pixels, not columns. After the split, walk
  // the spans in document order to give every block cell its grid
  // position; the "\n" text nodes the split leaves between span runs
  // are the row breaks. Each cell's centre is then measured from its
  // own box, so distance is true distance and the pool pays no
  // attention to where one letter ends and the next begins.
  const cells = [];
  {
    let x = 0;
    let y = 0;
    for (const node of wordmark.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        y += 1;
        x = 0;
      } else {
        if (node.classList.contains("wordmark__cell")) {
          cells.push({ el: node, x, y, cx: 0, cy: 0, rung: 0 });
        }
        x += 1;
      }
    }
  }

  const RUNG_CLASS = ["", "is-pool-1", "is-pool-2", "is-pool-3"];
  let cellWidth = 0;
  let markWidth = 0;
  let midY = 0;
  let coreR = 0;
  let nearR = 0;
  let farR = 0;

  // Font metrics are measured once after loading, then only on resize.
  // The rung radii are counted in cell widths, so the pool keeps its
  // proportions whatever size the wordmark is rendered at.
  function measure() {
    sizeCells(wordmark);
    const origin = wordmark.getBoundingClientRect();
    markWidth = origin.width;
    for (const cell of cells) {
      const box = cell.el.getBoundingClientRect();
      cell.cx = box.left - origin.left + box.width / 2;
      cell.cy = box.top - origin.top + box.height / 2;
    }
    if (cells.length) cellWidth = cells[0].el.getBoundingClientRect().width;
    const middle = cells.find((cell) => cell.y === 2);
    if (middle) midY = middle.cy;
    coreR = cellWidth * 2.2;
    nearR = cellWidth * 4.4;
    farR = cellWidth * 7;
  }
  measure();
  new ResizeObserver(measure).observe(wordmark);

  let lastInteract = 0;
  let tickTimer = 0;

  // The pointer target. Events only write this; the tick reads it, so
  // nothing on screen ever changes between ticks.
  const pointer = { active: false, x: 0, y: 0, dirX: 1, dirY: 0, speed: 0 };
  let lastPX = null;
  let lastPY = null;
  let lastPT = 0;

  // The idle sweep: a pool centre crossing the word at mid height, one
  // column per tick, on the old refresh scan's schedule.
  let sweeping = false;
  let sweepX = 0;

  function setRung(cell, rung) {
    if (cell.rung === rung) return;
    if (cell.rung) cell.el.classList.remove(RUNG_CLASS[cell.rung]);
    cell.rung = rung;
    if (rung) cell.el.classList.add(RUNG_CLASS[rung]);
  }

  function clearPool() {
    for (const cell of cells) setRung(cell, 0);
  }

  // One frame of the pool: every cell's rung from its distance to the
  // centre. The distance is elliptical under way: the offset is split
  // along and across the direction of travel, and the along part is
  // divided by the stretch, so a fast pointer throws a long pool along
  // its path while a slow one keeps a tight round pool.
  function paintPool(cx, cy, dirX, dirY, speed) {
    const stretch = 1 + Math.min(speed, 2.5) * 0.8;
    for (const cell of cells) {
      const dx = cell.cx - cx;
      const dy = cell.cy - cy;
      let dist;
      if (stretch > 1) {
        const along = dx * dirX + dy * dirY;
        const across = dy * dirX - dx * dirY;
        dist = Math.hypot(along / stretch, across);
      } else {
        dist = Math.hypot(dx, dy);
      }
      setRung(cell, dist <= coreR ? 3 : dist <= nearR ? 2 : dist <= farR ? 1 : 0);
    }
  }

  function stopTick() {
    clearInterval(tickTimer);
    tickTimer = 0;
  }

  function tick() {
    if (pointer.active) {
      // Speed bleeds off on the tick, so a pointer that stops moving
      // watches its pool relax back to round instead of staying
      // stretched around a position it has already left behind.
      pointer.speed *= 0.7;
      paintPool(pointer.x, pointer.y, pointer.dirX, pointer.dirY, pointer.speed);
    } else if (sweeping) {
      sweepX += cellWidth;
      if (sweepX - farR > markWidth) {
        sweeping = false;
        stopTick();
        clearPool();
        return;
      }
      paintPool(sweepX, midY, 1, 0, 0);
    } else {
      stopTick();
      clearPool();
    }
  }

  function startTick() {
    if (!tickTimer) tickTimer = setInterval(tick, TICK);
  }

  function sweep() {
    if (reduced.matches || document.hidden || sweeping || pointer.active) return;
    sweeping = true;
    sweepX = -farR;
    startTick();
  }

  function notePointer(event) {
    const origin = wordmark.getBoundingClientRect();
    const x = event.clientX - origin.left;
    const y = event.clientY - origin.top;
    const now = performance.now();
    if (lastPX !== null) {
      const dt = Math.max(now - lastPT, 1);
      const dx = x - lastPX;
      const dy = y - lastPY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        pointer.dirX = dx / dist;
        pointer.dirY = dy / dist;
      }
      pointer.speed = pointer.speed * 0.5 + (dist / dt) * 0.5;
    }
    lastPX = x;
    lastPY = y;
    lastPT = now;
    pointer.x = x;
    pointer.y = y;
  }

  function releasePointer() {
    pointer.active = false;
    pointer.speed = 0;
    lastPX = null;
    stopTick();
    clearPool();
  }

  wordmark.addEventListener("pointermove", (event) => {
    if (reduced.matches) return;
    if (event.pointerType === "touch" && !pointer.active) return;
    lastInteract = performance.now();
    sweeping = false;
    notePointer(event);
    if (event.pointerType !== "touch") pointer.active = true;
    startTick();
  }, { passive: true });

  wordmark.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") releasePointer();
  });

  // Touch on a hover-capable device: a tap lights the pool where the
  // finger lands, a drag carries it, and lifting the finger clears it
  // in one step. No-hover devices never reach this function and keep
  // the static split instead.
  wordmark.addEventListener("pointerdown", (event) => {
    if (reduced.matches || event.pointerType !== "touch") return;
    lastInteract = performance.now();
    sweeping = false;
    lastPX = null;
    pointer.speed = 0;
    notePointer(event);
    pointer.active = true;
    startTick();
  }, { passive: true });

  wordmark.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") releasePointer();
  });
  wordmark.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") releasePointer();
  });

  // First sweep once the boot screen (about 1.3s) has cleared, then
  // again every 20s while the page is visible and nobody has hovered
  // recently.
  const firstSweep = setTimeout(sweep, 1600);
  const idleSweep = setInterval(() => {
    if (performance.now() - lastInteract > 12000) sweep();
  }, 20000);

  reduced.addEventListener("change", () => {
    sweeping = false;
    releasePointer();
    clearTimeout(firstSweep);
    clearInterval(idleSweep);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      sweeping = false;
      stopTick();
      clearPool();
    }
  });
}

// The lamp (experiment/wordmark-lamp): the pool's distance machinery
// carrying a different ladder, and that ladder is the whole experiment.
// The pool interpolates one hue from ink to accent, so its light is
// flat in colour however it falls. The lamp's rungs travel in hue as
// they step down: warm at the core, near the accent's own hue in the
// middle, cool at the edge, the way the meadow's one lamp burns warm
// against a cool field (the ladder itself is palette data in
// layout.css, .is-lamp-1 to .is-lamp-3). Radii, stretch, tick, and the
// idle sweep are the pool's, unchanged, so any difference Ben sees is
// the ladder and nothing else.
//
// Two behaviours differ from the pool, both from the brief. A touch tap
// parks the pool where it lands instead of clearing on lift, so the
// light stays to be looked at; dragging moves the park, and tapping the
// parked core again clears it. And under reduced motion, where the pool
// never paints at all, a tap lights the pool in one cut at the tap
// point, still: no tick runs, and nothing moves afterwards.
export async function animateWordmarkLamp(wordmark, reduced) {
  if (!wordmark || !matchMedia("(hover: hover)").matches) return;
  await document.fonts.ready;
  if (!wordmark.isConnected) return;

  const TICK = 75;
  splitWordmark(wordmark);

  const cells = [];
  {
    let x = 0;
    let y = 0;
    for (const node of wordmark.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        y += 1;
        x = 0;
      } else {
        if (node.classList.contains("wordmark__cell")) {
          cells.push({ el: node, x, y, cx: 0, cy: 0, rung: 0 });
        }
        x += 1;
      }
    }
  }

  const RUNG_CLASS = ["", "is-lamp-1", "is-lamp-2", "is-lamp-3"];
  let cellWidth = 0;
  let markWidth = 0;
  let midY = 0;
  let coreR = 0;
  let nearR = 0;
  let farR = 0;

  function measure() {
    sizeCells(wordmark);
    const origin = wordmark.getBoundingClientRect();
    markWidth = origin.width;
    for (const cell of cells) {
      const box = cell.el.getBoundingClientRect();
      cell.cx = box.left - origin.left + box.width / 2;
      cell.cy = box.top - origin.top + box.height / 2;
    }
    if (cells.length) cellWidth = cells[0].el.getBoundingClientRect().width;
    const middle = cells.find((cell) => cell.y === 2);
    if (middle) midY = middle.cy;
    coreR = cellWidth * 2.2;
    nearR = cellWidth * 4.4;
    farR = cellWidth * 7;
  }
  measure();
  new ResizeObserver(measure).observe(wordmark);

  let lastInteract = 0;
  let tickTimer = 0;

  const pointer = { active: false, x: 0, y: 0, dirX: 1, dirY: 0, speed: 0 };
  let lastPX = null;
  let lastPY = null;
  let lastPT = 0;

  // A parked pool: lit by a tap, left standing when the finger lifts.
  // The mouse never parks; its pool follows the pointer and clears on
  // leave, exactly as the pool's does.
  let park = null;

  let sweeping = false;
  let sweepX = 0;

  function setRung(cell, rung) {
    if (cell.rung === rung) return;
    if (cell.rung) cell.el.classList.remove(RUNG_CLASS[cell.rung]);
    cell.rung = rung;
    if (rung) cell.el.classList.add(RUNG_CLASS[rung]);
  }

  function clearPool() {
    for (const cell of cells) setRung(cell, 0);
  }

  function paintPool(cx, cy, dirX, dirY, speed) {
    const stretch = 1 + Math.min(speed, 2.5) * 0.8;
    for (const cell of cells) {
      const dx = cell.cx - cx;
      const dy = cell.cy - cy;
      let dist;
      if (stretch > 1) {
        const along = dx * dirX + dy * dirY;
        const across = dy * dirX - dx * dirY;
        dist = Math.hypot(along / stretch, across);
      } else {
        dist = Math.hypot(dx, dy);
      }
      setRung(cell, dist <= coreR ? 3 : dist <= nearR ? 2 : dist <= farR ? 1 : 0);
    }
  }

  function stopTick() {
    clearInterval(tickTimer);
    tickTimer = 0;
  }

  function tick() {
    if (pointer.active) {
      pointer.speed *= 0.7;
      paintPool(pointer.x, pointer.y, pointer.dirX, pointer.dirY, pointer.speed);
    } else if (sweeping) {
      sweepX += cellWidth;
      if (sweepX - farR > markWidth) {
        sweeping = false;
        stopTick();
        clearPool();
        return;
      }
      paintPool(sweepX, midY, 1, 0, 0);
    } else {
      stopTick();
      clearPool();
    }
  }

  function startTick() {
    if (!tickTimer) tickTimer = setInterval(tick, TICK);
  }

  function sweep() {
    if (reduced.matches || document.hidden || sweeping || pointer.active || park) return;
    sweeping = true;
    sweepX = -farR;
    startTick();
  }

  function notePointer(event) {
    const origin = wordmark.getBoundingClientRect();
    const x = event.clientX - origin.left;
    const y = event.clientY - origin.top;
    const now = performance.now();
    if (lastPX !== null) {
      const dt = Math.max(now - lastPT, 1);
      const dx = x - lastPX;
      const dy = y - lastPY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        pointer.dirX = dx / dist;
        pointer.dirY = dy / dist;
      }
      pointer.speed = pointer.speed * 0.5 + (dist / dt) * 0.5;
    }
    lastPX = x;
    lastPY = y;
    lastPT = now;
    pointer.x = x;
    pointer.y = y;
  }

  function releasePointer() {
    pointer.active = false;
    pointer.speed = 0;
    lastPX = null;
    stopTick();
    clearPool();
  }

  // One cut, no tick: the reduced-motion pool, and the standing state a
  // touch park is left in. Tapping the parked core again clears it.
  function tapPool(event) {
    const origin = wordmark.getBoundingClientRect();
    const x = event.clientX - origin.left;
    const y = event.clientY - origin.top;
    if (park && Math.hypot(x - park.x, y - park.y) <= coreR) {
      park = null;
      clearPool();
      return;
    }
    park = { x, y };
    paintPool(x, y, 1, 0, 0);
  }

  wordmark.addEventListener("pointermove", (event) => {
    if (reduced.matches) return;
    if (event.pointerType === "touch" && !pointer.active) return;
    lastInteract = performance.now();
    sweeping = false;
    notePointer(event);
    if (event.pointerType !== "touch") pointer.active = true;
    startTick();
  }, { passive: true });

  wordmark.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") {
      park = null;
      releasePointer();
    }
  });

  wordmark.addEventListener("pointerdown", (event) => {
    lastInteract = performance.now();
    sweeping = false;
    if (reduced.matches) {
      tapPool(event);
      return;
    }
    if (event.pointerType !== "touch") return;
    if (park) {
      const origin = wordmark.getBoundingClientRect();
      const x = event.clientX - origin.left;
      const y = event.clientY - origin.top;
      if (Math.hypot(x - park.x, y - park.y) <= coreR) {
        park = null;
        releasePointer();
        return;
      }
    }
    lastPX = null;
    pointer.speed = 0;
    notePointer(event);
    pointer.active = true;
    startTick();
  }, { passive: true });

  // The finger lifting ends the drag, not the light: the pool stays
  // parked at the lift point. The tick stops; the cells keep their
  // rungs until the next tap or a mouse visit.
  function endTouchDrag() {
    if (!pointer.active) return;
    park = { x: pointer.x, y: pointer.y };
    pointer.active = false;
    pointer.speed = 0;
    lastPX = null;
    stopTick();
  }

  wordmark.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch" && !reduced.matches) endTouchDrag();
  });
  wordmark.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch" && !reduced.matches) endTouchDrag();
  });

  const firstSweep = setTimeout(sweep, 1600);
  const idleSweep = setInterval(() => {
    if (performance.now() - lastInteract > 12000) sweep();
  }, 20000);

  reduced.addEventListener("change", () => {
    sweeping = false;
    park = null;
    releasePointer();
    clearTimeout(firstSweep);
    clearInterval(idleSweep);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      sweeping = false;
      park = null;
      stopTick();
      clearPool();
    }
  });
}
