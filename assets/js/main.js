import { attach } from "./dither.js";
import { animateWordmarkLamp } from "./wordmark.js";
import { createThemeScene } from "./theme-scene.js";
import { announceBootTask, whenBootTask } from "./boot-tasks.js";
import { runBoot } from "./boot.js?v=20261122q";

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

  /* ---------- hiring bloom ---------- */

  // Display-style pixels, driven by the pointer rather than a loop. Cells
  // sit on a fixed 8px grid inside the block, behind the text, and each
  // cell fills its whole grid square, so neighbouring lit cells merge
  // into clusters instead of staying the separate sparkles the old effect
  // kept. A 4x4 Bayer threshold table, tiled over the grid, decides which
  // cells join a bloom at which strength: the fringe breaks into teeth
  // and single cells, the core packs solid, and the same pointer path
  // grows the same bloom every time, because nothing here is random.
  //
  // A cell carries a level, one of three solid shades stepped from the
  // block's ground toward the accent. The tick moves every cell one level
  // toward its target, never more, so a bloom ignites cluster by cluster
  // while the pointer lingers and steps back down in place when it
  // leaves. Nothing drifts and nothing fades: a cell is swapped whole, on
  // the 75ms tick, the site's own --motion-step.
  //
  // The pointer's speed shapes the bloom, the way it shaped the sparkle
  // before it: pointer velocity is the input, the pixels stay put. A fast
  // pass keeps a bloom source's energy low, so only a few low-threshold
  // cells scatter behind it. Resting or creeping builds the energy, the
  // radius widens, and the core deepens through the shades. Touch gets
  // the same bloom under a press or drag, and a tap leaves a pulse that
  // swells and settles. Keyboard focus parks a gentle bloom behind the
  // label. Reduced motion gets one still bloom, drawn once, never ticked.
  //
  // Second pass, on Ben's word: the bloom answers movement, not only
  // stillness. Energy builds eagerly at any creep, a fast pass keeps a
  // floor instead of scattering bare, trail pulses drop along the
  // pointer's path so clusters ignite along the way, and ignition steps
  // two levels at a time while the hand is travelling. A pixel lens
  // flare rides the primary source: bright core, a horizontal streak,
  // blocky halo rings, and a ghost cluster, all whole cells stepping in
  // place. In dark mode the palette turns to green crystal light (the
  // shades are data in components.css): the distance math leans angular
  // so clusters grow facets, and single glint cells on cluster edges
  // switch as the pointer travels, light catching the crystal.
  //
  // Third pass, also on Ben's word: scrolling to the block lights it
  // too. A source parked at the block's centre holds while the block
  // straddles the site's focus line, sharing one state with the
  // pointer hold, and the flare anchors at the centre for it. When
  // every hold lets go, the settle drains every cell to zero.
  const hiring = document.querySelector("[data-hiring]");

  if (hiring) {
    const CELL = 8;
    const BAYER = [
      0, 8, 2, 10,
      12, 4, 14, 6,
      3, 11, 1, 9,
      15, 7, 13, 5,
    ];
    const bayerAt = (col, row) => BAYER[((row & 3) << 2) + (col & 3)] / 16;
    // The threshold a bloom has to beat to claim a cell: mostly the
    // Bayer value of the cell's 2x2 block, so a bloom grows cluster by
    // cluster as whole blocks ignite together, with the cell's own value
    // mixed in to keep the cluster edges toothed instead of squared off.
    const thresholdAt = (col, row) =>
      0.6 * bayerAt(col >> 1, row >> 1) + 0.4 * bayerAt(col, row);

    // The resolved theme, read live on every tick: the crystal
    // treatment keys off dark mode, and the mode can change while the
    // page is open.
    const isDark = () => {
      const t = document.documentElement.dataset.theme;
      if (t === "dark") return true;
      if (t === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };

    const lit = new Map();
    const sources = new Set();
    let tickTimer = 0;
    let pointerSource = null;
    let touchSource = null;
    let focusSource = null;
    let scrollSource = null;
    let pointerSpeed = 0;
    let trailX = null;
    let trailY = null;
    let glintTravel = 0;
    let lastX = null;
    let lastY = null;
    let lastMoveT = 0;

    // The level a cell is heading for: the strongest claim any bloom
    // source makes on it. Strength falls with distance from the source
    // and rises with its energy; the Bayer threshold textures the claim,
    // so equal strength still breaks into clusters instead of a disc.
    function targetLevel(col, row) {
      let best = 0;
      const dark = isDark();
      for (const s of sources) {
        const dx = col - s.col;
        const dy = row - s.row;
        let dist = Math.hypot(dx, dy);
        let thr = thresholdAt(col, row);
        if (dark) {
          // Facets: the distance leans on the Chebyshev measure, so
          // cluster edges run at angles instead of rounding, and the
          // threshold steps by angular sector around the source, so a
          // dark bloom grows as cut crystal rather than a soft disc.
          dist = 0.62 * dist + 0.38 * Math.max(Math.abs(dx), Math.abs(dy));
          const sector =
            Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
          thr += ((sector * 37) % 5) * 0.035;
        }
        const radius = 1.5 + s.energy * 5;
        if (dist > radius + 1) continue;
        const strength = (1 - dist / (radius + 1)) * (0.35 + 0.65 * s.energy);
        const score = strength * 1.25 - thr * 0.7;
        const level = score > 0.62 ? 3 : score > 0.38 ? 2 : score > 0.14 ? 1 : 0;
        if (level > best) best = level;
      }
      return best;
    }

    function setLevel(key, col, row, level) {
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
        el.className = "hiring__bloom";
        el.style.insetInlineStart = `${col * CELL}px`;
        el.style.insetBlockStart = `${row * CELL}px`;
        el.dataset.level = level;
        hiring.append(el);
        lit.set(key, { el, level, glint: false });
        return;
      }
      cell.level = level;
      cell.el.dataset.level = level;
    }

    // The lens flare, drawn in whole cells on the same grid: a bright
    // core, a horizontal streak stepping down in shade both ways, one
    // or two blocky halo rings gated by the Bayer table so they break
    // into teeth, and a smaller ghost cluster mirrored across the
    // block's centre. Hard edges and solid shades only: a flare drawn
    // in pixels, never a glow. Its cells live in their own map and
    // step one level per tick toward the wanted set, the bloom's own
    // discipline, so the flare grows and settles in place too.
    const flareLit = new Map();

    function setFlareLevel(key, col, row, level) {
      const cell = flareLit.get(key);
      if (level === 0) {
        if (cell) {
          cell.el.remove();
          flareLit.delete(key);
        }
        return;
      }
      if (!cell) {
        const el = document.createElement("span");
        el.className = "hiring__flare";
        el.style.insetInlineStart = `${col * CELL}px`;
        el.style.insetBlockStart = `${row * CELL}px`;
        el.dataset.level = level;
        hiring.append(el);
        flareLit.set(key, { el, level });
        return;
      }
      cell.level = level;
      cell.el.dataset.level = level;
    }

    function flareTargets(cx, cy, intensity, cols, rows) {
      const want = new Map();
      if (intensity < 0.3) return want;
      const put = (c, r, level) => {
        if (c < 0 || r < 0 || c >= cols || r >= rows || level <= 0) return;
        const key = `${c},${r}`;
        if ((want.get(key) ?? 0) < level) want.set(key, level);
      };
      const cc = Math.round(cx);
      const cr = Math.round(cy);
      // The core: one bright cell, a cross at full strength, corners
      // as the flare peaks.
      put(cc, cr, 3);
      if (intensity > 0.45) {
        put(cc - 1, cr, 2);
        put(cc + 1, cr, 2);
        put(cc, cr - 1, 2);
        put(cc, cr + 1, 2);
      }
      if (intensity > 0.65) {
        put(cc - 1, cr - 1, 1);
        put(cc + 1, cr - 1, 1);
        put(cc - 1, cr + 1, 1);
        put(cc + 1, cr + 1, 1);
      }
      // The streak: single cells running both ways along the core's
      // row, stepping down in shade as they leave it.
      const reach = Math.round(3 + intensity * 8);
      for (let d = 1; d <= reach; d++) {
        const level = d <= 1 ? 3 : d <= 3 ? 2 : 1;
        put(cc - d, cr, level);
        put(cc + d, cr, level);
      }
      // Halo rings: Chebyshev squares around the core, Bayer-gated so
      // they read as broken blocky rings, never circles. The second
      // ring sits offset, the way real flare artefacts never quite
      // centre.
      const ring = (rcx, rcy, radius, gate) => {
        for (let c = rcx - radius; c <= rcx + radius; c++) {
          for (let r = rcy - radius; r <= rcy + radius; r++) {
            if (Math.max(Math.abs(c - rcx), Math.abs(r - rcy)) !== radius)
              continue;
            if (bayerAt(c, r) < gate) put(c, r, 1);
          }
        }
      };
      if (intensity > 0.5) ring(cc, cr, 3, 0.55);
      if (intensity > 0.7) ring(cc + 2, cr - 1, 5, 0.32);
      // The ghost: a smaller cluster mirrored across the block's
      // centre and pulled toward it, dimmer than the core.
      if (intensity > 0.5) {
        const gx = Math.round(cols / 2 + (cols / 2 - cx) * 0.55);
        const gy = Math.round(rows / 2 + (rows / 2 - cy) * 0.55);
        put(gx, gy, 2);
        put(gx - 1, gy, 1);
        put(gx + 1, gy, 1);
        put(gx, gy - 1, 1);
        put(gx, gy + 1, 1);
      }
      return want;
    }

    // Glints: in dark mode a few single cells on cluster edges burn
    // at the brightest crystal shade, and which cells glint steps as
    // the pointer travels, so the crystal seems to catch the light as
    // the hand moves. The choice is a hash of the cell's position
    // against a phase driven by accumulated pointer travel:
    // deterministic, never random, and capped so the block sparkles
    // at a few points rather than everywhere.
    function applyGlints(on, phase) {
      const chosen = new Set();
      if (on) {
        for (const [key, cell] of lit) {
          if (chosen.size >= 6) break;
          if (cell.level < 2) continue;
          const comma = key.indexOf(",");
          const c = Number(key.slice(0, comma));
          const r = Number(key.slice(comma + 1));
          const edge =
            !lit.has(`${c + 1},${r}`) ||
            !lit.has(`${c - 1},${r}`) ||
            !lit.has(`${c},${r + 1}`) ||
            !lit.has(`${c},${r - 1}`);
          if (!edge) continue;
          if ((c * 31 + r * 17) % 6 !== phase % 6) continue;
          chosen.add(key);
        }
      }
      for (const [key, cell] of lit) {
        const g = chosen.has(key);
        if (cell.glint === g) continue;
        cell.glint = g;
        if (g) cell.el.dataset.glint = "1";
        else delete cell.el.dataset.glint;
      }
    }

    function tick() {
      const now = performance.now();
      // Stillness is dwelling: when no move events are arriving, the
      // speed decays away and the pointer's energy gets to build.
      if (pointerSource && now - lastMoveT > 90) pointerSpeed = 0;
      for (const s of sources) {
        if (s.kind === "pointer") {
          // Eager energy: resting and creeping build fast, a slow
          // sweep still builds, and even a fast pass keeps a floor,
          // so the bloom answers movement instead of only stillness.
          if (pointerSpeed < 0.25) {
            s.energy = Math.min(1, s.energy + 0.16);
          } else if (pointerSpeed < 0.9) {
            s.energy = Math.min(1, s.energy + 0.05);
          } else {
            s.energy = Math.max(0.3, s.energy - 0.1);
          }
        } else if (s.kind === "touch") {
          s.energy = Math.min(0.9, s.energy + 0.12);
        } else if (s.kind === "focus") {
          s.energy = Math.min(0.55, s.energy + 0.06);
        } else if (s.kind === "scroll") {
          s.energy = Math.min(0.85, s.energy + 0.08);
        } else if (s.kind === "pulse") {
          if (s.rising) {
            s.energy += 0.25;
            if (s.energy >= s.cap) {
              s.energy = s.cap;
              s.rising = false;
            }
          } else {
            s.energy -= 0.07;
            if (s.energy <= 0) sources.delete(s);
          }
        }
      }

      const cols = Math.ceil(hiring.clientWidth / CELL);
      const rows = Math.ceil(hiring.clientHeight / CELL);
      const candidates = new Set(lit.keys());
      for (const s of sources) {
        const reach = Math.ceil(2.5 + s.energy * 5) + 1;
        const cc = Math.floor(s.col);
        const cr = Math.floor(s.row);
        for (let c = cc - reach; c <= cc + reach; c++) {
          for (let r = cr - reach; r <= cr + reach; r++) {
            if (c >= 0 && r >= 0 && c < cols && r < rows) {
              candidates.add(`${c},${r}`);
            }
          }
        }
      }
      const travelling = pointerSource !== null && now - lastMoveT < 160;
      for (const key of candidates) {
        const comma = key.indexOf(",");
        const col = Number(key.slice(0, comma));
        const row = Number(key.slice(comma + 1));
        const target = targetLevel(col, row);
        const level = lit.get(key)?.level ?? 0;
        const diff = target - level;
        if (diff === 0) continue;
        // While the pointer is travelling, ignition steps two levels
        // at a time so clusters catch up with the hand; decay always
        // steps one, so the settle stays gradual.
        const step = diff > 1 && travelling ? 2 : 1;
        setLevel(
          key,
          col,
          row,
          level + Math.sign(diff) * Math.min(step, Math.abs(diff)),
        );
      }

      // The flare rides the primary source: the pointer first, then a
      // held touch, then focus. Its cells step one level toward the
      // wanted set each tick, the bloom's own discipline.
      const primary =
        pointerSource || touchSource || scrollSource || focusSource;
      const want = primary
        ? flareTargets(primary.col, primary.row, primary.energy, cols, rows)
        : new Map();
      const flareKeys = new Set([...flareLit.keys(), ...want.keys()]);
      for (const key of flareKeys) {
        const target = want.get(key) ?? 0;
        const level = flareLit.get(key)?.level ?? 0;
        if (level === target) continue;
        const comma = key.indexOf(",");
        setFlareLevel(
          key,
          Number(key.slice(0, comma)),
          Number(key.slice(comma + 1)),
          level + Math.sign(target - level),
        );
      }

      applyGlints(isDark(), Math.floor(glintTravel / 18));

      if (lit.size === 0 && sources.size === 0 && flareLit.size === 0) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
    }

    function startTick() {
      if (!tickTimer) tickTimer = setInterval(tick, 75);
    }

    function release(source) {
      // A held source lets go as a pulse, so its bloom settles in place
      // instead of cutting out.
      if (!source) return;
      source.kind = "pulse";
      source.rising = false;
      source.cap = source.energy;
    }

    if (reduced.matches) {
      // The still state: three seeded clusters at fixed spots, levels set
      // outright from the same target math, drawn once and never ticked.
      // The scroll trigger applies it in one cut when the block reaches
      // the focus line and clears it in one cut when the block leaves,
      // the still form of the same hold the animated path keeps.
      let stillDrawn = false;
      const drawStill = () => {
        const cols = Math.ceil(hiring.clientWidth / CELL);
        const rows = Math.ceil(hiring.clientHeight / CELL);
        sources.add({ col: 6, row: 2, energy: 0.85 });
        sources.add({ col: cols - 7, row: rows - 3, energy: 0.7 });
        sources.add({ col: Math.floor(cols / 2), row: rows - 2, energy: 0.55 });
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const level = targetLevel(c, r);
            if (level > 0) setLevel(`${c},${r}`, c, r, level);
          }
        }
        // The flare in its still form, centred on the middle cluster,
        // and in dark mode a few fixed glints on the cluster edges.
        const stillFlare = flareTargets(
          Math.floor(cols / 2),
          rows - 2,
          0.85,
          cols,
          rows,
        );
        for (const [key, level] of stillFlare) {
          const comma = key.indexOf(",");
          setFlareLevel(
            key,
            Number(key.slice(0, comma)),
            Number(key.slice(comma + 1)),
            level,
          );
        }
        if (isDark()) applyGlints(true, 2);
        sources.clear();
      };
      const clearStill = () => {
        for (const key of [...lit.keys()]) {
          const comma = key.indexOf(",");
          setLevel(key, Number(key.slice(0, comma)), Number(key.slice(comma + 1)), 0);
        }
        for (const key of [...flareLit.keys()]) {
          const comma = key.indexOf(",");
          setFlareLevel(key, Number(key.slice(0, comma)), Number(key.slice(comma + 1)), 0);
        }
      };
      const stillBand = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !stillDrawn) {
              stillDrawn = true;
              drawStill();
            } else if (!entry.isIntersecting && stillDrawn) {
              stillDrawn = false;
              clearStill();
            }
          }
        },
        { rootMargin: "-33.333% 0px -66.667% 0px" },
      );
      stillBand.observe(hiring);
    } else {
      hiring.addEventListener("pointermove", (event) => {
        const rect = hiring.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (event.pointerType === "touch") {
          if (touchSource) {
            touchSource.col = x / CELL;
            touchSource.row = y / CELL;
          }
          return;
        }
        const now = performance.now();
        if (lastX !== null) {
          const dt = Math.max(now - lastMoveT, 1);
          const travelled = Math.hypot(x - lastX, y - lastY);
          pointerSpeed = travelled / dt;
          glintTravel += travelled;
        }
        lastX = x;
        lastY = y;
        lastMoveT = now;
        if (!pointerSource) {
          pointerSource = { col: x / CELL, row: y / CELL, energy: 0.3, kind: "pointer" };
          sources.add(pointerSource);
          trailX = x;
          trailY = y;
        } else {
          pointerSource.col = x / CELL;
          pointerSource.row = y / CELL;
          // Trail pulses: as the pointer travels, pulses drop along
          // the segment behind it, one every 10px, so clusters ignite
          // along the path and not only where the pointer stops. A
          // slow sweep drops stronger pulses than a fast one; each
          // swells and settles like a tap pulse.
          if (trailX === null) {
            trailX = x;
            trailY = y;
          } else {
            const cap = pointerSpeed < 0.9 ? 0.55 : 0.34;
            let guard = 0;
            while (
              Math.hypot(x - trailX, y - trailY) >= 10 &&
              guard < 8 &&
              sources.size < 40
            ) {
              const d = Math.hypot(x - trailX, y - trailY);
              trailX += ((x - trailX) / d) * 10;
              trailY += ((y - trailY) / d) * 10;
              sources.add({
                col: trailX / CELL,
                row: trailY / CELL,
                energy: 0.05,
                rising: true,
                cap,
                kind: "pulse",
              });
              guard += 1;
            }
          }
        }
        startTick();
      });

      hiring.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch" || touchSource) return;
        const rect = hiring.getBoundingClientRect();
        touchSource = {
          col: (event.clientX - rect.left) / CELL,
          row: (event.clientY - rect.top) / CELL,
          energy: 0.3,
          kind: "touch",
        };
        sources.add(touchSource);
        startTick();
      });

      const endTouch = () => {
        release(touchSource);
        touchSource = null;
      };
      hiring.addEventListener("pointerup", (event) => {
        if (event.pointerType === "touch") endTouch();
      });
      hiring.addEventListener("pointercancel", (event) => {
        if (event.pointerType === "touch") endTouch();
      });

      hiring.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "touch") {
          endTouch();
          return;
        }
        if (pointerSource) {
          sources.delete(pointerSource);
          pointerSource = null;
        }
        lastX = null;
        lastY = null;
        trailX = null;
        trailY = null;
        pointerSpeed = 0;
      });

      hiring.addEventListener("focus", () => {
        if (focusSource) return;
        const cols = Math.ceil(hiring.clientWidth / CELL);
        const rows = Math.ceil(hiring.clientHeight / CELL);
        focusSource = {
          col: cols / 2,
          row: Math.min(2, rows - 1),
          energy: 0.1,
          kind: "focus",
        };
        sources.add(focusSource);
        startTick();
      });
      hiring.addEventListener("blur", () => {
        release(focusSource);
        focusSource = null;
      });

      // Scrolling brings the bloom too, on Ben's word: when the block
      // straddles the site's focus line, a source parked at its centre
      // lights it in the same stepped stages, the flare anchored at
      // the centre so it still reads as light through the posting.
      // On touch this is the primary trigger, since there is no hover
      // to speak of. The holds share one state with the pointer: the
      // effect stands while either holds it, and when both let go the
      // settle drains every cell back to zero, the same clear the
      // pointer path ends in.
      const band = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (scrollSource) continue;
              const cols = Math.ceil(hiring.clientWidth / CELL);
              const rows = Math.ceil(hiring.clientHeight / CELL);
              scrollSource = {
                col: cols / 2,
                row: rows / 2,
                energy: 0.1,
                kind: "scroll",
              };
              sources.add(scrollSource);
              startTick();
            } else if (scrollSource) {
              release(scrollSource);
              scrollSource = null;
            }
          }
        },
        { rootMargin: "-33.333% 0px -66.667% 0px" },
      );
      band.observe(hiring);
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
