// Pixel Margin Field: an experiment in framing the reading column with
// the margins a wide screen would otherwise waste.
//
// It follows the site's pixel rule literally, the same one the hiring
// sparkle and the wordmark follow. Cells sit on a fixed 16px grid and only
// ever snap lit or unlit in place: nothing here sets a transform, a
// transition, or an opacity ramp, and a cell has no position of its own to
// drift from. The pointer does not light anything directly either; its
// coordinates are quantized to grid cells with Math.floor first, and only
// the cell it lands in (and its checkerboard neighbours) can light.
//
// Three quiet patterns share the field, all stepped on one 300ms tick,
// slower than the hiring sparkle's 75ms on purpose: this is a frame, not
// an interaction, so it should move at a gallery pace.
//   - A scan row derived from scroll progress, so the lit row steps down
//     the field as the reader steps down the page.
//   - A sparse diagonal that advances one step per tick.
//   - A small checkerboard cluster around the quantized pointer, which
//     decays in whole ticks rather than fading.
// Only one checkerboard parity ever lights, so neighbouring lit cells stay
// separate pixels instead of merging into a solid band.
//
// The fields themselves are gated in CSS (see components.css): the side
// fields only exist on genuinely wide viewports, and the top strip only
// below that range. This module double-checks the side gate by measured
// width, so a field narrower than the minimum is left empty even if the
// CSS breakpoint and the content width ever disagree.

const PITCH = 16; // grid pitch, px. A cell is 8px, centred in its pitch.
const TICK = 300;
const MIN_SIDE_WIDTH = 160; // px of margin a side field needs to earn its place

export function initMarginField(reduced) {
  const elements = [...document.querySelectorAll("[data-margin-field]")];
  if (!elements.length) return;

  let fields = [];
  let step = 0;
  let pointer = null;
  let timer = 0;

  function build() {
    fields = elements.map((el) => {
      el.replaceChildren();
      const rect = el.getBoundingClientRect();
      const field = {
        el,
        side: el.dataset.marginField === "side",
        cols: Math.floor(rect.width / PITCH),
        rows: Math.floor(rect.height / PITCH),
        cells: new Map(),
        lit: new Map(),
      };
      // A hidden field (the other side of the CSS gate) measures 0, and a
      // side field under the minimum width stays empty by design.
      if (field.cols < 1 || field.rows < 1) return field;
      if (field.side && rect.width < MIN_SIDE_WIDTH) return field;

      const fragment = document.createDocumentFragment();
      for (let row = 0; row < field.rows; row++) {
        for (let col = 0; col < field.cols; col++) {
          if ((col + row) % 2 !== 0) continue;
          const cell = document.createElement("span");
          cell.className = "margin-field__cell";
          cell.style.insetInlineStart = `${col * PITCH + 4}px`;
          cell.style.insetBlockStart = `${row * PITCH + 4}px`;
          fragment.append(cell);
          field.cells.set(row * field.cols + col, cell);
        }
      }
      el.append(fragment);
      return field;
    });
  }

  function light(field, col, row, ttl) {
    if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) return;
    if ((col + row) % 2 !== 0) return;
    const key = row * field.cols + col;
    if (!field.cells.has(key)) return;
    field.lit.set(key, Math.max(field.lit.get(key) ?? 0, ttl));
  }

  function render() {
    step += 1;
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));

    for (const field of fields) {
      if (!field.cells.size) continue;

      // Decay in whole ticks, never a fade.
      for (const [key, ttl] of field.lit) {
        if (ttl <= 1) field.lit.delete(key);
        else field.lit.set(key, ttl - 1);
      }

      // Scroll scan: one fixed row, derived from how far the reader is
      // through the page. It holds still while the reader does.
      const scanRow = Math.floor(progress * (field.rows - 1));
      for (let col = 0; col < field.cols; col++) light(field, col, scanRow, 1);

      // Idle diagonal: one step per tick, sparse by a fixed hash of the
      // cell rather than a coin flip, so the pattern is steady, not noisy.
      const diagonal = step % (field.cols + field.rows);
      for (let col = 0; col < field.cols; col++) {
        const row = diagonal - col;
        if (row < 0 || row >= field.rows) continue;
        if ((col * 31 + row * 17) % 3 === 0) continue;
        light(field, col, row, 1);
      }

      // Pointer cluster, quantized to the grid before it can light
      // anything. Touch pointers never reach here; there is no cell under
      // a finger to frame.
      if (pointer) {
        const rect = field.el.getBoundingClientRect();
        const gx = Math.floor((pointer.x - rect.left) / PITCH);
        const gy = Math.floor((pointer.y - rect.top) / PITCH);
        if (gx >= -3 && gx < field.cols + 3 && gy >= -3 && gy < field.rows + 3) {
          for (let dc = -2; dc <= 2; dc++) {
            for (let dr = -2; dr <= 2; dr++) {
              if (Math.abs(dc) + Math.abs(dr) > 3) continue;
              light(field, gx + dc, gy + dr, 3);
            }
          }
        }
      }

      for (const [key, cell] of field.cells) {
        cell.classList.toggle("is-lit", field.lit.has(key));
      }
    }
  }

  build();
  render();

  // One static render is all anyone who asked not to be animated gets:
  // the scroll row at the reader's current position, and no loop, no
  // pointer response, nothing that changes under them.
  if (reduced.matches) return;

  timer = setInterval(() => {
    if (!document.hidden) render();
  }, TICK);

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", () => (pointer = null));

  // A resize can cross the CSS gate or change a field's measured size out
  // from under its grid. Rebuild rather than let cells sit on a grid that
  // no longer matches the box they were counted for.
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      build();
      render();
    }, 250);
  });

  reduced.addEventListener("change", () => {
    if (reduced.matches && timer) {
      clearInterval(timer);
      timer = 0;
      build();
      render();
    }
  });
}
