// Pixel Margin Field, v2: an experiment in framing the reading column
// with the margins a wide screen would otherwise waste.
//
// v1 was an 8px cell centred on a 16px pitch, checkerboard parity only,
// in a single accent shade. Ben's verdict: the size and density were not
// great, and one shade gave the activity no depth. v2 answers both:
//
//   - Density: a 6px cell on an 8px pitch, every cell in the grid able
//     to light. That is four times the cells per area of v1 and a 75%
//     fill within each pitch (v1 managed 25%), so the field reads as a
//     continuous pixel surface in the margins, not scattered dots.
//   - Depth: four discrete shades, all of them existing site semantics,
//     ordered faint to bright: --page-rule, --muted-color,
//     --accent-color, --accent-pulse-color. A cell is always off or one
//     solid shade, never anything in between.
//
// The site's pixel rule still holds literally. Cells sit on the fixed
// 8px grid and only ever change in place, on the one 300ms tick: no
// transform, no transition, no opacity anywhere in this file or its CSS.
// A shade change is a step, not a fade: a pointer cluster is brightest
// at its centre and steps down ring by ring, and when the pointer moves
// on, a lit cell steps down one shade per tick until it is off. The
// pointer itself is quantized to grid cells with Math.floor before it
// can light anything.
//
// Three quiet patterns share the field, all stepped on the same tick,
// slower than the hiring sparkle's 75ms on purpose: this is a frame, not
// an interaction, so it moves at a gallery pace.
//   - A scan row derived from scroll progress, carrying a shade wake:
//     the row itself at accent, one step behind it at muted, two steps
//     behind at the rule tone, then off.
//   - A sparse diagonal that advances one step per tick, mostly at the
//     faint shade with an occasional muted cell, by a fixed hash rather
//     than a coin flip, so the pattern is steady, not noisy.
//   - The pointer cluster described above, with shade rings quantized
//     to grid distance.
//
// The fields are gated in CSS (see components.css): side fields only on
// genuinely wide viewports, the top strip only below that range. This
// module double-checks the side gate by measured width. Rendering is
// diffed: each tick only touches cells whose shade actually changed, so
// the denser grid does not mean re-styling thousands of cells per tick.

const PITCH = 8; // grid pitch, px. A cell is 6px, centred in its pitch.
const TICK = 300;
const MIN_SIDE_WIDTH = 160; // px of margin a side field needs to earn its place

// Shade levels, 1 (faint) to 4 (brightest). Level 0 is off and is not
// stored. The CSS maps each level to its palette variable.
const SHADE_WAKE = 1;
const SHADE_MID = 2;
const SHADE_ACCENT = 3;
const SHADE_BRIGHT = 4;

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
        shown: new Map(), // key -> shade level currently on the cell
        heat: new Map(), // key -> shade level held by the pointer cluster
      };
      // A hidden field (the other side of the CSS gate) measures 0, and a
      // side field under the minimum width stays empty by design.
      if (field.cols < 1 || field.rows < 1) return field;
      if (field.side && rect.width < MIN_SIDE_WIDTH) return field;

      const fragment = document.createDocumentFragment();
      for (let row = 0; row < field.rows; row++) {
        for (let col = 0; col < field.cols; col++) {
          const cell = document.createElement("span");
          cell.className = "margin-field__cell";
          cell.style.insetInlineStart = `${col * PITCH + 1}px`;
          cell.style.insetBlockStart = `${row * PITCH + 1}px`;
          fragment.append(cell);
          field.cells.set(row * field.cols + col, cell);
        }
      }
      el.append(fragment);
      return field;
    });
  }

  // Offer one cell a shade for this tick. Offers combine by max, so the
  // brightest pattern to touch a cell wins and nothing averages out.
  function offer(desired, field, col, row, level) {
    if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) return;
    const key = row * field.cols + col;
    if (!field.cells.has(key)) return;
    if ((desired.get(key) ?? 0) < level) desired.set(key, level);
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
      const desired = new Map();

      // Pointer cluster heat first, because it decays whether or not the
      // pointer is still feeding it. Rings are quantized by Manhattan
      // distance on the grid: centre bright, then accent, mid, faint.
      if (pointer) {
        const rect = field.el.getBoundingClientRect();
        const gx = Math.floor((pointer.x - rect.left) / PITCH);
        const gy = Math.floor((pointer.y - rect.top) / PITCH);
        if (gx >= -4 && gx < field.cols + 4 && gy >= -4 && gy < field.rows + 4) {
          for (let dc = -4; dc <= 4; dc++) {
            for (let dr = -4; dr <= 4; dr++) {
              const d = Math.abs(dc) + Math.abs(dr);
              if (d > 4) continue;
              const level =
                d === 0 ? SHADE_BRIGHT : d === 1 ? SHADE_ACCENT : d <= 2 ? SHADE_MID : SHADE_WAKE;
              const col = gx + dc;
              const row = gy + dr;
              if (col < 0 || row < 0 || col >= field.cols || row >= field.rows) continue;
              const key = row * field.cols + col;
              if ((field.heat.get(key) ?? 0) < level) field.heat.set(key, level);
            }
          }
        }
      }
      // One shade step down per tick for every held cell. A cell fed by
      // the pointer this tick was just set above its decayed value, so
      // what the reader sees is: hold while fed, then 4, 3, 2, 1, off.
      for (const [key, level] of field.heat) {
        if (level <= 1) field.heat.delete(key);
        else field.heat.set(key, level - 1);
        offer(desired, field, key % field.cols, Math.floor(key / field.cols), level);
      }

      // Scroll scan with its wake. The row holds still while the reader
      // does; the wake is two fixed rows behind it, not a trail, because
      // the scan row is derived from scroll position, not from time.
      const scanRow = Math.floor(progress * (field.rows - 1));
      for (let col = 0; col < field.cols; col++) {
        offer(desired, field, col, scanRow, SHADE_ACCENT);
        offer(desired, field, col, scanRow - 1, SHADE_MID);
        offer(desired, field, col, scanRow - 2, SHADE_WAKE);
      }

      // Idle diagonal: one step per tick, faint by default, muted where
      // the fixed hash says so.
      const diagonal = step % (field.cols + field.rows);
      for (let col = 0; col < field.cols; col++) {
        const row = diagonal - col;
        if (row < 0 || row >= field.rows) continue;
        if ((col * 31 + row * 17) % 3 === 0) continue;
        offer(desired, field, col, row, (col * 13 + row * 7) % 5 === 0 ? SHADE_MID : SHADE_WAKE);
      }

      // Diff against what is on screen: set cells whose shade changed,
      // clear cells no pattern wants any more, leave the rest alone.
      for (const [key, level] of desired) {
        if (field.shown.get(key) === level) continue;
        const cell = field.cells.get(key);
        cell.className = `margin-field__cell is-shade-${level}`;
        field.shown.set(key, level);
      }
      for (const key of field.shown.keys()) {
        if (desired.has(key)) continue;
        field.cells.get(key).className = "margin-field__cell";
        field.shown.delete(key);
      }
    }
  }

  build();
  render();

  // One static render is all anyone who asked not to be animated gets:
  // the scan row and its wake at the reader's current position, and no
  // loop, no pointer response, nothing that changes under them.
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
