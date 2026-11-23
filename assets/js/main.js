import { attach } from "./dither.js";
import { animateWordmarkLamp } from "./wordmark.js";
import { createThemeScene } from "./theme-scene.js";
import { announceBootTask, whenBootTask } from "./boot-tasks.js";
import { runBoot } from "./boot.js?v=20261122s";

const THEME_KEY = "theme";
// The cycle the scene control walks. "system" is where everyone starts, and it is
// less a stored preference than the absence of one: in that mode nothing is
// pinned and color-scheme follows the OS.
const MODES = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return MODES.includes(saved) ? saved : "system";
  } catch {
    // Private-mode Safari refuses reads as well as writes.
    return "system";
  }
}

const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

function setUp() {
  const repaints = [];
  // The boot log's zero: every duration it quotes is measured from here.
  const bootT0 = performance.now();

  // Read by the portrait dissolve and by keyed jumps, so it sits above both
  // rather than inside whichever one happened to need it first.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- portrait ---------- */

  // Eight steps of it, matching the wordmark's own reveal. Few enough that each
  // one lands as a separate frame rather than reading as a fade.
  const DISSOLVE_STEPS = 8;

  // The portrait half of the boot log's scene task: resolved once the
  // dither has decoded the photo and painted its first frame. It never
  // rejects: a portrait that fails resolves with a false flag instead,
  // so a photo problem can never read as a scene failure (see the
  // catch below).
  let resolvePortrait;
  const portraitTask = new Promise((resolve) => {
    resolvePortrait = resolve;
  });

  for (const frame of document.querySelectorAll("[data-dither]")) {
    const canvas = frame.querySelector("[data-dither-canvas]");
    const photo = frame.querySelector("img");

    attach(canvas, photo)
      .then((portrait) => {
        repaints.push(portrait.repaint);
        resolvePortrait(performance.now() - bootT0);

        let step = 0;
        let timer;

        // Driven from here rather than by a CSS transition on opacity, because
        // the point is that the dither comes apart in blocks: cells of it wink
        // out in a scrambled order until the photograph underneath is all that
        // is left. A fade would just make it fainter.
        function dissolve(toward) {
          clearInterval(timer);

          // One jump for anyone who asked not to be animated. They still get
          // the photograph, just not the six frames on the way to it.
          if (reduced.matches) {
            step = toward;
            portrait.reveal(step / DISSOLVE_STEPS);
            return;
          }

          timer = setInterval(() => {
            step += Math.sign(toward - step);
            portrait.reveal(step / DISSOLVE_STEPS);
            if (step === toward) clearInterval(timer);
          }, 320 / DISSOLVE_STEPS);
        }

        const show = () => dissolve(DISSOLVE_STEPS);
        const hide = () => dissolve(0);

        // Keyboard gets it either way.
        frame.addEventListener("focus", show);
        frame.addEventListener("blur", hide);

        if (window.matchMedia("(hover: hover)").matches) {
          frame.addEventListener("pointerenter", show);
          frame.addEventListener("pointerleave", hide);
        } else {
          // Touch has no hover to hold it open, so a tap latches. These cannot
          // both be bound: on touch a tap fires pointerenter, then click, then
          // pointerleave the moment the finger lifts, which would close the
          // photo again the instant the tap opened it.
          let latched = false;
          frame.addEventListener("click", () => {
            latched = !latched;
            dissolve(latched ? DISSOLVE_STEPS : 0);
          });
        }
      })
      // Without the dither the photo simply shows through, so there is
      // nothing to clean up on failure. The boot task still hears about
      // it, but as a resolution carrying a false flag, never a
      // rejection: served cross-origin (a preview host redirecting the
      // photo, say), the photo can taint the canvas and throw, and
      // that is a portrait problem, not a scene failure.
      .catch(() => resolvePortrait(false));
  }

  /* ---------- hiring bloom v3: the pointer is the light ---------- */

  // Ben's direction after the perimeter version (PR #155) shipped, in
  // his words: the glistening should answer where the mouse is inside
  // the box, like light glistening off a crystal, as if there is light
  // inside, and it should sit on the OUTSIDE of the border. It should
  // not animate on its own while the mouse hovers: it animates in
  // response to the mouse moving, as if the mouse carries the source
  // of the light. On mobile, the scroll carries the light instead.
  //
  // The model: the hiring block is wrapped in a frame layer, and the
  // cells live on the fixed 8px grid in a wide field OUTSIDE the
  // block's border, reaching twelve cells beyond its box on all
  // sides. No cell ever sits inside the border, so the copy stays
  // completely clear (the PR #155 readability rule carries over
  // whole), and no cell paints over a neighbouring block either: the
  // field stops at the divider, the sections, the header and the
  // footer, and at the screen's horizontal edges, so the light reads
  // as pixels shining through from behind the block and spilling
  // into the margins around it. The light's position is the
  // pointer's position inside the box, or the block's centre on
  // keyboard focus, or a point that travels with scroll progress on
  // touch devices. Each frame cell's level is computed from that
  // position: cells near the light catch the top rungs, distance
  // steps the shade down, a Bayer threshold teeth the falloff, and a
  // per-cell facet hash decides which near cells burn as sharp
  // single glints. The falloff from the light is radial and steep,
  // so the glow reads as a round lens flare around the source
  // rather than following the frame's rectangle, and in light mode
  // the whole computation runs a step quieter, sparser and lower.
  // The colours are CSS-side, per theme: crystal green in dark
  // mode, the site's own blues in light. A second distance grades
  // the whole field: a
  // cell's distance from the border caps its rung and thins its
  // Bayer gate band by band, so the glisten is strong only at the
  // border and falls to exactly zero at the field's edge. While the
  // pointer moves, its velocity feeds an energy term: the reach
  // grows a little and the facet phase advances with accumulated
  // travel, so facets catch and release as the light passes. When
  // the pointer rests, the energy decays on the 75ms tick, the
  // phase freezes, the cells step to their resting targets, and the
  // tick stops: the pattern is still, a picture of where the light
  // rests. Nothing runs on a timeline of its own.
  //
  // Pointer leave and blur clear every cell in one cut. On desktop a
  // scroll with no pointer over the block lights nothing; while the
  // pointer is over the block a scroll simply moves the block under
  // the resting light, so the pattern is recomputed from the pointer's
  // viewport position. Reduced motion never ticks: the still pattern
  // for the light's current position swaps in one cut as the position
  // changes.
  const hiring = document.querySelector("[data-hiring]");

  if (hiring) {
    const CELL = 8;
    const BAYER4 = [
      0, 8, 2, 10,
      12, 4, 14, 6,
      3, 11, 1, 9,
      15, 7, 13, 5,
    ];

    const isDark = () => {
      const t = document.documentElement.dataset.theme;
      if (t === "dark") return true;
      if (t === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    const hoverCapable = window.matchMedia("(hover: hover)").matches;

    // The frame layer: a wrapper that hugs the block exactly, so frame
    // coordinates are the block's own grid extended outward. Cells are
    // children of the wrapper, never of the block, so the block's
    // overflow and border never clip or contain them.
    const wrap = document.createElement("div");
    wrap.className = "hiring-frame";
    hiring.parentNode.insertBefore(wrap, hiring);
    wrap.appendChild(hiring);

    const lit = new Map();

    function setCell(key, col, row, level, glint) {
      const cell = lit.get(key);
      if (level === 0) {
        if (cell) {
          cell.el.remove();
          lit.delete(key);
        }
        return;
      }
      if (!cell) {
        const el = document.createElement("span");
        el.className = "hiring__frame-cell";
        el.style.insetInlineStart = `${col * CELL}px`;
        el.style.insetBlockStart = `${row * CELL}px`;
        el.dataset.level = level;
        if (glint) el.dataset.glint = "1";
        wrap.append(el);
        lit.set(key, { el, level, glint: !!glint });
        return;
      }
      cell.level = level;
      cell.el.dataset.level = level;
      const g = !!glint;
      if (cell.glint !== g) {
        cell.glint = g;
        if (g) cell.el.dataset.glint = "1";
        else delete cell.el.dataset.glint;
      }
    }

    // The frame cells: every grid cell in the band around the
    // block, out to FIELD cells beyond the border on all sides. A
    // cell's band is its ring distance from the border: 0 is
    // adjacent, FIELD - 1 is the field's outermost band. Columns and
    // rows run negative and past the block's own counts; the block's
    // interior is never in the set. Two kinds of ground are also
    // never in the set: any cell that would paint over a
    // neighbouring block (the divider above, the sections around,
    // the header, the footer), and any cell past the screen's
    // horizontal edges, which would hand the page a sideways scroll.
    const FIELD = 12;
    let geoCache = null;
    let geoKey = "";

    function fieldGeometry() {
      const cols = Math.ceil(hiring.clientWidth / CELL);
      const rows = Math.ceil(hiring.clientHeight / CELL);
      const docW = document.documentElement.clientWidth;
      const key = `${cols}x${rows}x${docW}`;
      if (geoCache && geoKey === key) return geoCache;
      const hr = hiring.getBoundingClientRect();
      const els = new Set();
      const main = hiring.closest("main");
      if (main) {
        for (const el of main.children) {
          if (el !== wrap && el.nodeType === 1) els.add(el);
        }
      }
      document
        .querySelectorAll("header, footer, nav, .divider, .section")
        .forEach((el) => {
          if (el !== hiring && !wrap.contains(el)) els.add(el);
        });
      const protect = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        protect.push({
          x0: r.left - hr.left - 2,
          y0: r.top - hr.top - 2,
          x1: r.right - hr.left + 2,
          y1: r.bottom - hr.top + 2,
        });
      }
      // The field's horizontal window, in block coordinates: from
      // the screen's left edge to its right edge.
      const winX0 = -(hr.left + window.scrollX);
      geoCache = { cols, rows, protect, winX0, winX1: winX0 + docW };
      geoKey = key;
      return geoCache;
    }

    window.addEventListener("resize", () => {
      geoCache = null;
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        geoCache = null;
      });
    }

    function frameCells() {
      const { cols, rows, protect, winX0, winX1 } = fieldGeometry();
      const cells = [];
      for (let c = -FIELD; c < cols + FIELD; c++) {
        const cb = c < 0 ? -c - 1 : c >= cols ? c - cols : 0;
        const x0 = c * CELL;
        if (x0 < winX0 || x0 + CELL > winX1) continue;
        for (let r = -FIELD; r < rows + FIELD; r++) {
          const rb = r < 0 ? -r - 1 : r >= rows ? r - rows : 0;
          if (c >= 0 && c < cols && r >= 0 && r < rows) continue;
          const y0 = r * CELL;
          let covered = false;
          for (const p of protect) {
            if (
              x0 < p.x1 &&
              x0 + CELL > p.x0 &&
              y0 < p.y1 &&
              y0 + CELL > p.y0
            ) {
              covered = true;
              break;
            }
          }
          if (!covered) cells.push({ c, r, band: Math.max(cb, rb) });
        }
      }
      return { cells, cols, rows };
    }

    function hash2(a, b) {
      let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // The wanted state of the whole frame for one light position.
    // light is in block pixels; energy is the movement term, 0 at
    // rest and up to 1 in a fast pass; phase advances with travel and
    // turns the facet selection while the light moves.
    function frameTargets(light, energy, phase, reachBoost = 0) {
      const { cells } = frameCells();
      const want = new Map();
      const reach = 120 + energy * 48 + reachBoost;
      const radius = reach + 48;
      // Light mode runs a step quieter (Ben, 2026-11-22): the same
      // flare, sparser and lower. Pixel work has no opacity, so
      // faded means a weaker driver and a tighter Bayer gate.
      // Dark mode is untouched by this term. The palette itself
      // lives in components.css, per theme.
      const dark = isDark();
      const fade = dark ? 1 : 0.92;
      const gateLift = dark ? 0 : 0.02;
      for (const { c, r, band } of cells) {
        const cx = (c + 0.5) * CELL;
        const cy = (r + 0.5) * CELL;
        const dx = cx - light.x;
        const dy = cy - light.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        // Lens flare (Ben, 2026-11-22): distance from the light
        // decides the shape. The falloff is radial: a steep core
        // term burns bright around the source and falls fast, and
        // a faint shallow halo term carries a whisper of light
        // further out, the way a flare has a hot centre and a wide
        // faint skirt. Together they keep the lit patch a round
        // glow around the light instead of a slab following the
        // frame's rectangle: an edge or corner far from the light
        // stays dark even when its band would allow light. The
        // band grading below still multiplies in on top of this.
        const u = dist / radius;
        const strength = Math.pow(1 - u, 2.45) + 0.3 * (1 - u);
        // Facets: a fixed hash per cell, turned by the light's angle
        // around the cell and by the travel phase. At rest the angle
        // term still separates neighbours, so the lit run reads as
        // facets, not a smooth blob; while moving, the phase term is
        // what makes individual cells catch and release.
        const angle = Math.atan2(dy, dx);
        const facet =
          hash2(c * 3 + 57, r * 5 + 11) * 0.65 +
          (0.5 + 0.5 * Math.sin(angle * 3 + hash2(c + 91, r + 37) * 6.283)) *
            0.35;
        const turned = (facet + phase * 0.618) % 1;
        // The Bayer column phase rotates with the band. A fixed
        // phase would hand each distance its own fixed set of four
        // thresholds, and some columns' sets run lower than their
        // nearer neighbours', so a far band could out-light a near
        // one. Rotated, every band samples the same thresholds and
        // the grading is monotone by construction.
        const bayer = BAYER4[((r & 3) * 4 + ((c + band) & 3))] / 16;
        // Distance grading (Ben, 2026-11-22): the glisten is strong
        // only close to the posting and goes to zero as the field
        // runs out. The cell's band multiplies the light computation
        // above, it does not replace it: the fall steps down band
        // by band on a steepening curve, the Bayer gate tightens
        // with the band,
        // and the rung cap drops one step per band, top rung in the
        // adjacent band only, second rung one band out, the first
        // rung whispering on from there. The outermost band is
        // capped at zero, so beyond the field's edge nothing ever
        // lights, at any pointer position or speed.
        const cap =
          band === 0 ? 3 : band === 1 ? 2 : band >= FIELD - 1 ? 0 : 1;
        if (cap === 0) continue;
        const fall = 1 - band / FIELD;
        const gate = band * 0.03 + gateLift;
        // The facet driver blends toward its own mean as the band
        // grows: near the border the facets are full-strength and
        // ragged, far out the field thins evenly, a whisper with no
        // loud individual cells.
        const driver = 0.925 + (0.6 + turned * 0.65 - 0.925) * fall;
        const s = strength * driver * fall * fade;
        let level = 0;
        if (s > 0.58 && bayer < s + 0.1 - gate) level = 3;
        else if (s > 0.36 && bayer < s + 0.2 - gate) level = 2;
        else if (s > 0.16 && bayer < s + 0.25 - gate) level = 1;
        level = Math.min(level, cap);
        if (level === 0) continue;
        // Sharp glints: a few cells in the adjacent band at the top
        // rung burn at the brightest shade, the glint rung.
        const glint =
          level === 3 &&
          band === 0 &&
          hash2(c * 7 + 13, r * 3 + 29) > 0.5 &&
          dist < reach * 0.8;
        want.set(`${c},${r}`, { c, r, level, glint });
      }
      return want;
    }

    function stepToward(want) {
      const keys = new Set([...lit.keys(), ...want.keys()]);
      let settled = true;
      for (const key of keys) {
        const target = want.get(key);
        const targetLevel = target ? target.level : 0;
        const level = lit.get(key)?.level ?? 0;
        if (level === targetLevel) {
          if (target && (lit.get(key)?.glint ?? false) !== target.glint) {
            setCell(key, target.c, target.r, targetLevel, target.glint);
          }
          continue;
        }
        settled = false;
        const step = targetLevel > level ? Math.min(2, targetLevel - level) : -1;
        const comma = key.indexOf(",");
        setCell(
          key,
          Number(key.slice(0, comma)),
          Number(key.slice(comma + 1)),
          level + step,
          target ? target.glint : false,
        );
      }
      return settled;
    }

    function applyCut(want) {
      const keys = new Set([...lit.keys(), ...want.keys()]);
      for (const key of keys) {
        const target = want.get(key);
        const comma = key.indexOf(",");
        setCell(
          key,
          Number(key.slice(0, comma)),
          Number(key.slice(comma + 1)),
          target ? target.level : 0,
          target ? target.glint : false,
        );
      }
    }

    function clearAll() {
      for (const cell of lit.values()) cell.el.remove();
      lit.clear();
    }

    // Light state. source is "pointer", "focus", "scroll", or null.
    let source = null;
    let light = { x: 0, y: 0 };
    let lightBoost = 0;
    let lastClient = null;
    let lastMoveAt = 0;
    let lastX = 0;
    let lastY = 0;
    let energy = 0;
    let travel = 0;
    let tickTimer = 0;

    function currentTargets() {
      return frameTargets(light, energy, Math.floor(travel / 26), lightBoost);
    }

    function tick() {
      // Energy bleeds off on the tick: a resting pointer's shimmer
      // dies within a few ticks, the phase stops advancing with it,
      // and once the cells have stepped to the resting targets the
      // loop stops outright. A still pattern, held by no timer.
      energy *= 0.55;
      if (energy < 0.02) energy = 0;
      const settled = stepToward(currentTargets());
      if (settled && energy === 0) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
    }

    function wake() {
      if (reduced.matches) {
        applyCut(currentTargets());
        return;
      }
      if (!tickTimer) tickTimer = setInterval(tick, 75);
    }

    function lightFromClient(clientX, clientY) {
      const rect = hiring.getBoundingClientRect();
      light = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }

    function onMove(event) {
      if (event.pointerType === "touch") return;
      const now = performance.now();
      if (lastMoveAt) {
        const dt = Math.max(1, now - lastMoveAt);
        const d = Math.hypot(event.clientX - lastX, event.clientY - lastY);
        travel += d;
        energy = Math.min(1, Math.max(energy, d / dt / 1.4));
      }
      lastMoveAt = now;
      lastX = event.clientX;
      lastY = event.clientY;
      lastClient = { x: event.clientX, y: event.clientY };
      source = "pointer";
      lightBoost = 0;
      lightFromClient(event.clientX, event.clientY);
      wake();
    }

    function onLeave() {
      if (source !== "pointer") return;
      source = null;
      lastClient = null;
      lastMoveAt = 0;
      energy = 0;
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
      clearAll();
    }

    // Scroll-carried light for touch devices: the light's point
    // circuits the block's perimeter as the block travels through
    // the viewport, and scroll velocity feeds the same energy
    // term, so the glints shimmer while the page moves and settle
    // still when it stops. Off-screen clears.
    let lastScrollY = window.scrollY;
    let lastScrollAt = 0;
    function onScroll() {
      const rect = hiring.getBoundingClientRect();
      const vh = window.innerHeight;
      if (!hoverCapable) {
        if (rect.bottom < 0 || rect.top > vh) {
          if (source === "scroll") {
            source = null;
            if (tickTimer) {
              clearInterval(tickTimer);
              tickTimer = 0;
            }
            clearAll();
          }
          lastScrollY = window.scrollY;
          return;
        }
        const progress = Math.min(
          1,
          Math.max(0, (vh - rect.top) / (vh + rect.height)),
        );
        // The light's point makes a full circuit of the block's
        // perimeter across the pass (Ben's refinement, 2026-11-22):
        // it starts at the top-left corner as the block enters,
        // runs across the top, down the right side, back across
        // the bottom, and up the left side to close the loop as
        // the block leaves, corner to corner the whole way, so
        // the lit facets sweep around the outside of the border
        // as if a pointer were dragging the light around it.
        const w = rect.width;
        const h = rect.height;
        const run = progress * 2 * (w + h);
        if (run < w) light = { x: run, y: 0 };
        else if (run < w + h) light = { x: w, y: run - w };
        else if (run < 2 * w + h) light = { x: 2 * w + h - run, y: h };
        else light = { x: 0, y: 2 * (w + h) - run };
        lightBoost = 0;
        const now = performance.now();
        if (lastScrollAt) {
          const dt = Math.max(1, now - lastScrollAt);
          const d = Math.abs(window.scrollY - lastScrollY);
          energy = Math.min(1, Math.max(energy, d / dt / 1.4));
          travel += d;
        }
        lastScrollAt = now;
        lastScrollY = window.scrollY;
        source = "scroll";
        wake();
        return;
      }
      // Desktop: scrolling never lights the block on its own. While
      // the pointer rests over it, the block moves under the light,
      // so the resting pattern is recomputed from the pointer's
      // viewport position.
      if (source === "pointer" && lastClient) {
        lightFromClient(lastClient.x, lastClient.y);
        wake();
      }
    }

    if (reduced.matches) {
      // One cut per position change, no shimmer, no tick. The scroll
      // path applies the same way on touch devices.
      hiring.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;
        source = "pointer";
        lightFromClient(event.clientX, event.clientY);
        applyCut(frameTargets(light, 0, 0, 0));
      });
      hiring.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "touch") return;
        if (source === "pointer") {
          source = null;
          clearAll();
        }
      });
      hiring.addEventListener("focus", () => {
        source = "focus";
        light = { x: hiring.clientWidth / 2, y: hiring.clientHeight / 2 };
        applyCut(frameTargets(light, 0, 0, 30));
      });
      hiring.addEventListener("blur", () => {
        if (source === "focus") {
          source = null;
          clearAll();
        }
      });
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      hiring.addEventListener("pointerenter", onMove);
      hiring.addEventListener("pointermove", onMove);
      hiring.addEventListener("pointerleave", onLeave);
      hiring.addEventListener("focus", () => {
        source = "focus";
        energy = 0;
        lightBoost = 30;
        light = { x: hiring.clientWidth / 2, y: hiring.clientHeight / 2 };
        wake();
      });
      hiring.addEventListener("blur", () => {
        if (source !== "focus") return;
        source = null;
        if (tickTimer) {
          clearInterval(tickTimer);
          tickTimer = 0;
        }
        clearAll();
      });
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  /* ---------- theme ---------- */

  let mode = storedMode();
  let sceneCycleStarted = false;

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

  // The scene lives twice on the page: the masthead, and the footer
  // system line where it sat before the masthead had one. One mode
  // drives both. Each control keeps its own painter and its own word
  // window: the mode word beside a scene is a tap's receipt, not a
  // permanent readout, and the receipt shows where the tap landed. A
  // tap shows it, it stays for about 2.5 seconds, then it goes away
  // and the control is the picture alone again. The theme itself does
  // not revert when the word hides, and a fresh tap restarts the
  // window on the control that was tapped.
  const sceneControls = [
    ...document.querySelectorAll("[data-theme-scene-control]"),
  ].map((controlEl) => {
    const canvas = controlEl.querySelector("[data-theme-scene]");
    return {
      button: controlEl.querySelector("[data-theme-scene-button]"),
      current: controlEl.querySelector("[data-theme-scene-current]"),
      scene: canvas
        ? createThemeScene(canvas, { dark: resolvedDark() })
        : null,
      revealed: false,
      revealTimer: undefined,
    };
  });
  // The t key works the same control it always did: the first one.
  const sceneButton = sceneControls[0]?.button ?? null;

  function persistMode() {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice still holds this visit.
    }
  }

  // Where a scene click goes. The plain cycle is light, dark, system,
  // and back to light, which is nextMode's order read from light. One
  // exception: the first scene click out of system mode jumps to the
  // opposite of whatever system is currently resolving to, so the
  // click always lands on a visible change. After that first jump the
  // plain cycle runs from wherever it landed, even when the cycle
  // comes back around to system.
  function nextSceneMode() {
    if (!sceneCycleStarted && mode === "system") {
      return resolvedDark() ? "light" : "dark";
    }
    return nextMode(mode);
  }

  // Only light and dark pin [data-theme]. System mode removes it, which is the
  // same state the inline script in <head> leaves the page in before first
  // paint, so there is nothing to flash on load either way.
  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }

    // Each scene carries the current mode as its word while its own
    // post-tap window is open, and each button's name says where a
    // click goes next, worked out live so the system first-click rule
    // is in the name, word showing or not.
    for (const control of sceneControls) {
      if (control.current) {
        control.current.textContent = mode;
        control.current.hidden = !control.revealed;
      }
      control.button?.setAttribute(
        "aria-label",
        `Theme: ${mode}. Activate to switch to ${nextSceneMode()}`
      );

      // The little landscape re-lights to match: day in light, night
      // in dark, stepped cell by cell unless reduced motion is on.
      control.scene?.setDark(resolvedDark(), reduced.matches);
    }

    // The dither reads its two colours back out of CSS, so it has to be
    // redrawn whenever the resolved theme could have moved under it.
    repaints.forEach((repaint) => repaint());
  }

  // The picture is the control. The swap is whole and instant, and the
  // button is never hidden or replaced, so focus stays on it.
  for (const control of sceneControls) {
    control.button?.addEventListener("click", () => {
      mode = nextSceneMode();
      sceneCycleStarted = true;
      control.revealed = true;
      persistMode();
      applyMode();
      // The word is a receipt with a short life: restart its window
      // on every tap, then let applyMode hide it when the window
      // closes. Hiding only flips the label's hidden flag; the mode,
      // and the scenes lit for it, stay as the tap left them.
      clearTimeout(control.revealTimer);
      control.revealTimer = setTimeout(() => {
        control.revealed = false;
        applyMode();
      }, 2500);
    });
  }

  // Only in system mode does the OS still get a vote.
  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  applyMode();

  /* ---------- section in view ---------- */

  const sections = document.querySelectorAll(".section");

  // A zero-height band a third of the way down the viewport, two-thirds
  // toward the top (Ben's call, 2026-11-22): inset the root 33.333% from the
  // top and 66.667% from the bottom and no box is left, so a section
  // "intersects" exactly while it straddles that line, and the framed section
  // sits in the upper part of the screen with more of what follows in view.
  // Sections do not overlap, so at most one qualifies at a time. Cheaper and
  // steadier than measuring rects on every scroll event. On a desktop the
  // pointer is the frame's source instead: the hover rule in layout.css
  // stands this one down while the mouse is over any section. Dead centre
  // was the old line.
  // While a keyed jump is in flight the observer stands down: see frame().
  let jumpingUntil = 0;

  function frame(section) {
    for (const other of sections) other.classList.toggle("is-active", other === section);
  }

  const focusLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;

      // Between two sections sit a divider and its margins, about 72px where
      // nothing is at the line. Clearing the frame there makes it strobe, so
      // whichever section reached the line last keeps it until the next one
      // arrives.
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-33.333% 0px -66.667% 0px" }
  );

  for (const section of sections) focusLine.observe(section);

  /* ---------- keys ---------- */

  const keys = document.querySelector("[data-keys]");
  const keysToggle = document.querySelector("[data-keys-toggle]");

  function showKeys(open) {
    keys.hidden = !open;
    keysToggle.setAttribute("aria-expanded", String(open));
  }

  // Landing a section at the top of the viewport puts the focus line past the
  // short ones and into whatever follows, so the frame would confirm the wrong
  // section. Rather than move the line, hold the observer off for the length of
  // the scroll and frame the target directly; once the lock lapses there is no
  // further scroll to correct it, and the next real one hands control back.
  function jump(section) {
    section.scrollIntoView({
      behavior: reduced.matches ? "auto" : "smooth",
      block: "start",
    });
    jumpingUntil = performance.now() + (reduced.matches ? 0 : 1000);
    frame(section);
    history.replaceState(null, "", `#${section.querySelector("[id]").id}`);
  }

  document.addEventListener("keydown", (event) => {
    // ? is Shift+/, so shiftKey has to stay allowed.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const el = event.target;
    if (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= sections.length) {
      jump(sections[digit - 1]);
    } else if (event.key === "t") {
      sceneButton?.click();
    } else if (event.key === "?") {
      showKeys(keys.hidden);
    } else if (event.key === "Escape") {
      showKeys(false);
    } else {
      return;
    }

    event.preventDefault();
  });

  keysToggle.addEventListener("click", () => showKeys(keys.hidden));

  /* ---------- wordmark boot ---------- */

  const wordmark = document.querySelector(".wordmark");

  // The block glyphs are served display=block, so for up to three seconds the
  // wordmark is laid out but painting nothing. Starting the reveal on load
  // would run it against an empty box and pop the finished art in afterwards.
  // fonts.ready resolves either way, including on a failed load, so the class is
  // always eventually added.
  document.fonts.ready.then(() => wordmark?.classList.add("is-booting"));

  animateWordmarkLamp(wordmark, reduced);

  /* ---------- boot ---------- */

  // The log is an instrument now, not theatre: every line names a real
  // startup process and resolves only when that process actually
  // finishes, with the value the process itself reports. The three
  // tasks are the scene (the portrait dither plus the meadow, which
  // announces itself from meadow.js once its reveal has finished
  // generating, or at first paint when the figure is off-screen and
  // nothing is generating yet), the music demo's render or cache
  // read (announced from music-demo.js, which now renders in the
  // background at load instead of waiting for a first press of play),
  // and the footer clock's first tick, resolved from tick() below.
  // The surfaces themselves, the full screen for a session's first
  // load and the segmented indicator for the loads after, live in
  // boot.js, shared with the other two pages.
  let resolveClock;
  const clockTask = new Promise((resolve) => {
    resolveClock = resolve;
  });
  announceBootTask("clock", clockTask);

  const sceneTask = Promise.all([portraitTask, whenBootTask("meadow")]).then(
    () => performance.now() - bootT0
  );

  // The profile photo: it decodes async (decoding="async" on
  // the img), so the text paints without waiting for it, and
  // its arrival is a boot line of its own. The figure is the
  // resource timing entry's duration where the browser
  // recorded one, and the time from the page's zero where
  // it did not; either way it is the load's real measure,
  // never an estimate.
  const photoImg = document.querySelector(".dither__photo");
  const photoTask = new Promise((resolve) => {
    if (!photoImg) {
      resolve(performance.now() - bootT0);
      return;
    }
    const done = () => {
      const entry = performance.getEntriesByName(
        photoImg.currentSrc || photoImg.src
      )[0];
      resolve(entry ? entry.duration : performance.now() - bootT0);
    };
    if (photoImg.complete && photoImg.naturalWidth > 0) done();
    else {
      photoImg.addEventListener("load", done, { once: true });
      photoImg.addEventListener("error", done, { once: true });
    }
  });

  runBoot(
    [
      {
        label: "building pixel scene",
        promise: sceneTask,
        format: (ms) => `${Math.round(ms)} ms`,
      },
      {
        label: "loading profile photo",
        promise: photoTask,
        format: (ms) => `${Math.round(ms)} ms`,
      },
      {
        label: "rendering music",
        promise: whenBootTask("music"),
        // The demo registers its own render task with the
        // loader where the work runs (music-demo.js), so this
        // entry is for the boot screen only: runBoot does not
        // register the same work a second time.
        selfReports: true,
        format: (r) =>
          r.fromCache
            ? `from cache · ${Math.round(r.ms)} ms`
            : `rendered in ${Math.round(r.renderMs)} ms`,
      },
      {
        label: "syncing clock",
        promise: clockTask,
        format: (r) => r.value,
      },
      // Two lines for work nobody loads: the fonts and the
      // wordmark arrive with the page itself, so their lines
      // say so instead of wearing an invented figure.
      {
        label: "self-hosted fonts",
        promise: Promise.resolve(),
        format: () => "loaded statically",
      },
      {
        label: "wordmark",
        promise: Promise.resolve(),
        format: () => "loaded statically",
      },
    ],
    { t0: bootT0 }
  );

  /* ---------- clock ---------- */

  const clock = document.querySelector("[data-clock]");
  const clockTime = document.querySelector("[data-clock-time]");
  const hours = document.querySelector("[data-clock-hours]");
  const minutes = document.querySelector("[data-clock-minutes]");

  // His time, not the reader's: the footer already says Ottawa. hourCycle
  // rather than hour12: false, which resolves to h24 in some locales and
  // prints midnight as 24:07.
  const inOttawa = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  function tick() {
    const now = new Date();
    const parts = Object.fromEntries(
      inOttawa.formatToParts(now).map(({ type, value }) => [type, value])
    );
    hours.textContent = parts.hour;
    minutes.textContent = parts.minute;
    clockTime.dateTime = `${parts.hour}:${parts.minute}`;
    clock.hidden = false;
    // The boot log's clock line tells the truth only if it resolves
    // here, once the footer is actually telling this time. Later ticks
    // resolve an already-settled promise, which is a no-op.
    resolveClock?.({ value: `ottawa ${parts.hour}:${parts.minute}` });

    // Land on the minute rather than drifting a second past it, which a fixed
    // 60s interval would do a little more of every hour.
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  if (clock) tick();
}

setUp();
