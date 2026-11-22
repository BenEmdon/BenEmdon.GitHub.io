/*
  Mochi, in pixels, plus this page's theme toggle.

  The portrait is drawn the way the meadow is: a grid of cells, a palette
  kept as data, and a renderer that only ever swaps whole cells between
  palette colours. The one behaviour is a blink. The eye arcs trade places
  with a flat closed line for two ticks, on an irregular timer, and that is
  all. Nothing moves, nothing fades, and reduced motion gets one static
  render with the eyes open.

  main.js is not loaded on this page: it assumes the home page's DOM
  (wordmark, sections, boot screen) and would throw without it. The theme
  toggle below is the same logic in miniature, same localStorage key and
  same system, light, dark cycle, so a choice made on either page holds
  on both.
*/

import { createThemeScene } from "./theme-scene.js";
import { animateWordmark, setUpStaticWordmark } from "./wordmark.js";
import { runBoot } from "./boot.js?v=20261122l";

/* ---------- theme ---------- */

const THEME_KEY = "theme";
const MODES = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return MODES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

const resolvedTheme = () =>
  document.documentElement.dataset.theme ||
  (systemDark.matches ? "dark" : "light");

/* ---------- the portrait ---------- */

const W = 48;
const H = 48;

// One geometry, two lightings, like the meadow's day and night. The ramp
// shifts hue as it steps: the highlight leans lighter and warmer, the
// shadows lean cooler and deeper toward indigo. No pure black anywhere;
// the face uses the ramp's own tinted dark.
const PALETTES = {
  light: {
    bg: "#edf1f8",
    shadow: "#bccdea",
    spark: "#a9c3ec",
    hi: "#a9c3ec",
    body: "#7f9fd8",
    mid: "#6486c4",
    deep: "#4763a0",
    outline: "#2e4470",
    face: "#141c2e",
  },
  dark: {
    bg: "#101827",
    shadow: "#26334e",
    spark: "#a9cdf2",
    hi: "#93b1e2",
    body: "#6d8fc6",
    mid: "#50699c",
    deep: "#37497a",
    outline: "#1c2a4a",
    face: "#0a0f1c",
  },
};

// The body, row by row: [first cell, last cell] for each row that has
// body in it. Shaped after the avatar: a plush blob, squat and wide,
// widest low, the dome's curve steps shrinking as they climb (2, 2, 1,
// 1, 1...) so the top stays round without a long straight run down the
// sides. Near the bottom the sides pinch in one cell for three rows,
// then the base spreads wider than anything above it, the way a plush
// squishes out where it sits.
const PROFILE = {
  12: [19, 28],
  13: [17, 30],
  14: [15, 32],
  15: [14, 33],
  16: [13, 34],
  17: [12, 35],
  18: [11, 36],
  19: [10, 37],
  20: [9, 38],
  21: [9, 38],
  22: [8, 39],
  23: [8, 39],
  24: [7, 40],
  25: [7, 40],
  26: [6, 41],
  27: [6, 41],
  28: [6, 41],
  29: [6, 41],
  30: [6, 41],
  31: [6, 41],
  32: [6, 41],
  33: [6, 41],
  34: [7, 40],
  35: [7, 40],
  36: [7, 40],
  37: [6, 41],
  38: [6, 41],
  39: [5, 42],
  40: [5, 42],
  41: [5, 42],
  42: [5, 42],
};

const inBody = (x, y) => {
  const row = PROFILE[y];
  return row !== undefined && x >= row[0] && x <= row[1];
};

// A 2x2 Bayer pattern, used the way the portrait dither uses ordered
// patterns: a small jitter at shade boundaries so the bands on the dome
// do not march in equal widths. It tiles in 2x2 blocks rather than single
// cells, so the transitions read as clusters, not speckle. Only
// neighbouring ramp shades ever mix.
const BAYER_2 = [
  [0, 2],
  [3, 1],
];

// Form shading from one light source, upper right. Each body cell gets a
// light value from its position, the value picks a ramp shade, and the
// Bayer jitter softens the pick at the edges of each band. The slope is
// mostly vertical, a lit cap over a body-bright middle over a shaded
// base, with small corrections: the far left and the far right tilt the
// value away from and toward the light, a bump over the dome's centre
// curves the cap's edge down so it follows the dome instead of ruling a
// straight line across it, and past row 33 the base pools darker still,
// where the plush meets the ground. The slopes are sized so the whole
// face sits inside the body band: no shade boundary crosses the eyes or
// the smile.
function bodyShade(x, y) {
  // Portrait shading: the vertical slope pauses for two
  // rows under the eyes, so every shade boundary below the face lands
  // two rows lower than it used to. The smile keeps the lighter body
  // shade around it, and the darker bands read as the underside of the
  // round form instead of crowding the mouth. The effective row holds
  // at 26 for rows 26 to 28, then resumes the same slope, so no band
  // changes width except the body band under the face, which gains the
  // two rows. Both vertical terms use the effective row.
  const ey = y - Math.min(2, Math.max(0, y - 26));
  const light =
    10 -
    (ey - 12) * 0.62 -
    Math.max(0, 18 - x) * 0.35 +
    Math.max(0, x - 34) * 0.3 -
    Math.max(0, ey - 33) * 0.55 +
    Math.max(0, 7 - Math.abs(x - 26)) * 0.1;
  const jitter = (BAYER_2[y % 2][x % 2] - 1.5) * 0.5;
  const v = light + jitter;
  if (v > 7) return "hi";
  if (v > -3) return "body";
  if (v > -13) return "mid";
  return "deep";
}

// One step darker along the body ramp, for the graded outline below.
const DEEPEN = {
  hi: "body",
  body: "mid",
  mid: "deep",
  deep: "outline",
  outline: "outline",
};

// One step lighter along the same ramp, for the fuzz below.
const LIGHTEN = {
  outline: "deep",
  deep: "mid",
  mid: "body",
  body: "hi",
  hi: "hi",
};

// The face. Eyes are single-cell arcs, the closed happy eyes from the
// avatar: a peak in the middle, ends stepping down and out. On the
// wider body they sit a little wider apart and a little lower, where
// the avatar's sit, and the smile under them is a wider, gentler arc
// to match. Face cells are drawn over the shading and never outlined.
const EYE_OPEN = [
  // left eye
  [17, 23], [16, 24], [18, 24], [15, 25], [19, 25],
  // right eye
  [31, 23], [30, 24], [32, 24], [29, 25], [33, 25],
];

// The blink frame: each arc swaps for a flat line one row tall, on the
// arc's own base row.
const EYE_SHUT = [
  [15, 25], [16, 25], [17, 25], [18, 25], [19, 25],
  [29, 25], [30, 25], [31, 25], [32, 25], [33, 25],
];

const SMILE = [
  [18, 28], [29, 28],
  [19, 29], [28, 29],
  [20, 30], [27, 30],
  [21, 31], [22, 31], [23, 31], [24, 31], [25, 31], [26, 31],
];

// Backdrop sparkles: two four-point stars and three single dots, the
// deliberate single pixels the anchor allows. All sit clear of the body.
const SPARKS = [
  [6, 11], [5, 11], [7, 11], [6, 10], [6, 12],
  [41, 15], [40, 15], [42, 15], [41, 14], [41, 16],
  [3, 24], [43, 28], [24, 5], [4, 36],
];

// The ground shadow: two flat rows of the deeper backdrop shade, tucked
// under the base.
const SHADOW = [];
for (let x = 9; x <= 38; x += 1) SHADOW.push([x, 43]);
for (let x = 13; x <= 34; x += 1) SHADOW.push([x, 44]);

// Build the grid of palette keys for one eye state. Painted fresh on every
// theme change and every blink step, so a swap mid-blink lands on the
// current state rather than replaying anything.
function buildGrid(eyesShut) {
  const grid = new Array(W * H).fill("bg");
  const set = (x, y, key) => {
    grid[y * W + x] = key;
  };

  for (const [x, y] of SPARKS) set(x, y, "spark");
  for (const [x, y] of SHADOW) set(x, y, "shadow");

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!inBody(x, y)) continue;
      let key = bodyShade(x, y);
      // Selective outline, graded: a boundary cell deepens one ramp step
      // rather than jumping straight to the darkest shade, so the
      // silhouette is defined without a hard dark wall. The bottom edge
      // deepens the full step, and the base row, already at the ramp's
      // deep end, lands on the outline shade. The left edge deepens too
      // but stops at deep, so a lone outline cell never warts out of the
      // shadow side. On the lit top and right edges a plain body cell
      // steps to mid; a highlight cell there stays a highlight and reads
      // as rim light.
      const edgeBottom = !inBody(x, y + 1);
      const edgeLeft = !inBody(x - 1, y);
      const edgeLit = !inBody(x, y - 1) || !inBody(x + 1, y);
      if (edgeBottom) key = DEEPEN[key];
      else if (edgeLeft) key = DEEPEN[key] === "outline" ? "deep" : DEEPEN[key];
      else if (edgeLit && key === "body") key = "mid";
      set(x, y, key);
    }
  }

  // Fuzz, the anchor's one deliberate single-pixel detail: the plush is
  // fuzzy, so a sparse seeded scatter of cells one step outside the
  // silhouette takes the shade one ramp step lighter than the edge cell
  // it sits beside, the way a stray hair catches the light. Never under
  // the base, where the character sits, and never over a spark. The
  // seed and the scan order are fixed, so every repaint grows the same
  // fuzz in the same places.
  const frng = mulberry32(20261122);
  const fuzzed = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (grid[y * W + x] !== "bg") continue;
      if (inBody(x, y - 1)) continue; // the cell under the base stays clean
      const beside =
        grid[y * W + x - 1] !== "bg" && inBody(x - 1, y)
          ? grid[y * W + x - 1]
          : grid[y * W + x + 1] !== "bg" && inBody(x + 1, y)
            ? grid[y * W + x + 1]
            : inBody(x, y + 1)
              ? grid[(y + 1) * W + x]
              : null;
      if (beside === null || beside === "bg") continue;
      // None on the crown: a lone cell at the dome's apex reads as a
      // sprout, not as fuzz.
      if (inBody(x, y + 1) && y + 1 < 15) continue;
      if (frng() >= 0.15) continue;
      // Never in a clump: a fuzz cell keeps two cells of clear air from
      // every other, so each one reads as a single stray hair.
      if (
        fuzzed.some(
          ([fx, fy]) => Math.max(Math.abs(fx - x), Math.abs(fy - y)) < 2
        )
      ) {
        continue;
      }
      fuzzed.push([x, y]);
      set(x, y, LIGHTEN[beside]);
    }
  }

  for (const [x, y] of SMILE) set(x, y, "face");
  for (const [x, y] of eyesShut ? EYE_SHUT : EYE_OPEN) set(x, y, "face");

  return grid;
}

function paintPortrait(canvas, eyesShut) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = PALETTES[resolvedTheme()];
  const grid = buildGrid(eyesShut);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      ctx.fillStyle = palette[grid[y * W + x]];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Seeded, so the blink rhythm is the same visit to visit in structure
// (irregular gaps, never a metronome) without Math.random at render time.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- boot ---------- */

// The shared boot (boot.js) runs on this page's own three tasks:
// the portrait's first paint, the gallery scenes' first frames,
// and the clock's first tick. Each promise resolves only when the
// work it names has actually happened. The portrait paints
// synchronously inside setUpPortrait, so its resolver is called
// from there. The gallery modules are deferred scripts that paint
// as they execute, in order after this one, so DOMContentLoaded
// means every scene has its first frame. The clock resolves from
// its first tick, the same arrangement as the home page.
const bootT0 = performance.now();

let resolvePortraitTask;
const portraitTask = new Promise((resolve) => {
  resolvePortraitTask = resolve;
});
let resolveClockTask;
const clockTask = new Promise((resolve) => {
  resolveClockTask = resolve;
});
const galleryTask = new Promise((resolve) => {
  const settled = () => resolve(performance.now() - bootT0);
  if (document.readyState === "complete") settled();
  else document.addEventListener("DOMContentLoaded", settled, { once: true });
});

function setUpPortrait() {
  const canvas = document.querySelector("[data-mochi-canvas]");
  if (!canvas) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let eyesShut = false;

  const paint = () => paintPortrait(canvas, eyesShut);
  paint();
  // The boot's portrait task resolves on this first paint. Theme
  // swaps and blink steps paint again later; resolving an
  // already-settled promise is a no-op.
  resolvePortraitTask(performance.now() - bootT0);

  // The page follows the resolved theme the way the meadow does: a pinned
  // [data-theme] when one is set, the OS preference otherwise. A swap
  // re-renders the current eye state in the other palette.
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static render, eyes open

  const rng = mulberry32(20261120);
  const BLINK_MS = 240; // two ticks of the site's 120ms weather step
  function scheduleBlink() {
    setTimeout(() => {
      if (document.hidden) {
        scheduleBlink();
        return;
      }
      eyesShut = true;
      paint();
      setTimeout(() => {
        eyesShut = false;
        paint();
        scheduleBlink();
      }, BLINK_MS);
    }, 5000 + rng() * 7000);
  }
  scheduleBlink();
}

/* ---------- wiring ---------- */

// The wordmark gets the home page's own treatment, wired the
// way music.js wires it: the stepped boot reveal starts once
// the block-glyph font is ready, and wordmark.js splits the
// art into fixed cells and runs its scan on pointer devices.
// On touch devices the scan never runs, so wordmark.js does
// the split statically instead, after the same font wait:
// fixed cells at the measured glyph width, spaces included,
// which is what keeps the letters from merging together in
// a phone browser.
function setUpWordmark() {
  const wordmark = document.querySelector(".wordmark");
  document.fonts.ready.then(() => wordmark?.classList.add("is-booting"));
  animateWordmark(wordmark, window.matchMedia("(prefers-reduced-motion: reduce)"));
  if (wordmark && !window.matchMedia("(hover: hover)").matches) {
    setUpStaticWordmark(wordmark);
  }
}

function setUpThemeToggle() {
  const controlEls = document.querySelectorAll("[data-theme-scene-control]");
  if (!controlEls.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let mode = storedMode();
  let sceneCycleStarted = false;

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

  // The same little landscape the home page masthead wears, drawn by
  // the same module: day in light, night in dark, swapped cell by
  // cell. It lives twice on the page, masthead and footer system
  // line, and one mode drives both. Each control keeps its own
  // painter and its own word window: the mode word beside a scene is
  // a tap's receipt, not a permanent readout, and the receipt shows
  // where the tap landed. The theme does not revert when the word
  // hides, and a fresh tap restarts the window on the control that
  // was tapped.
  const controls = [...controlEls].map((controlEl) => {
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

  function persistMode() {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice still holds this visit.
    }
  }

  // Where a scene click goes. The plain cycle is light, dark, system,
  // and back to light. One exception: the first click out of system
  // mode jumps to the opposite of whatever system is resolving to, so
  // the click always lands on a visible change; after that the plain
  // cycle runs from wherever it landed.
  function nextSceneMode() {
    if (!sceneCycleStarted && mode === "system") {
      return resolvedDark() ? "light" : "dark";
    }
    return nextMode(mode);
  }

  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    for (const control of controls) {
      if (control.current) {
        control.current.textContent = mode;
        control.current.hidden = !control.revealed;
      }
      control.button?.setAttribute(
        "aria-label",
        `Theme: ${mode}. Activate to switch to ${nextSceneMode()}`
      );
      control.scene?.setDark(resolvedDark(), reduced.matches);
    }
  }

  // Only in system mode does the OS still get a vote.
  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  // The picture is the control: clicking it advances the cycle, shows
  // the word beside that picture, and restarts that word's window on
  // every tap.
  for (const control of controls) {
    control.button?.addEventListener("click", () => {
      mode = nextSceneMode();
      sceneCycleStarted = true;
      control.revealed = true;
      persistMode();
      applyMode();
      clearTimeout(control.revealTimer);
      control.revealTimer = setTimeout(() => {
        control.revealed = false;
        applyMode();
      }, 2500);
    });
  }

  applyMode();
}

/* ---------- clock ---------- */

// The footer system line is the same on every page, this one
// included: Ottawa, and Ottawa's time. Mirrors the home page's clock
// in main.js: his time, not the reader's (the footer says Ottawa),
// and landed on the minute rather than drifting a second past it.
function setUpClock() {
  const clock = document.querySelector("[data-clock]");
  const clockTime = document.querySelector("[data-clock-time]");
  const hours = document.querySelector("[data-clock-hours]");
  const minutes = document.querySelector("[data-clock-minutes]");
  if (!clock || !clockTime || !hours || !minutes) return;

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
    // The boot's clock task resolves here, once the footer is
    // actually telling this time. Later ticks resolve an
    // already-settled promise, which is a no-op.
    resolveClockTask({ value: `ottawa ${parts.hour}:${parts.minute}` });
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  tick();
}

/* ---------- keys ---------- */

// The home page's interaction model, in miniature: digit keys jump to
// sections and frame them, t works the theme toggle, ? opens the keys
// legend. Mirrors main.js so the two pages feel like one site.
function setUpKeys() {
  const sections = document.querySelectorAll(".section");
  const keys = document.querySelector("[data-keys]");
  const keysToggle = document.querySelector("[data-keys-toggle]");
  const themeToggle = document.querySelector("[data-theme-scene-button]");
  if (!sections.length || !keys || !keysToggle) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let jumpingUntil = 0;

  function frame(section) {
    for (const other of sections) {
      other.classList.toggle("is-active", other === section);
    }
  }

  // The frame's scroll source: a zero-height band a third of
  // the way down the viewport, two-thirds toward the top
  // (Ben's call, 2026-11-22). Insetting the root 33.333% from
  // the top and 66.667% from the bottom leaves no box, so a
  // section "intersects" exactly while it straddles that
  // line, and the framed section sits in the upper part of
  // the screen with more of what follows in view. On a
  // desktop the pointer is the frame's source instead: the
  // hover rule in layout.css stands this one down while the
  // mouse is over any section. Dead centre was the old line.
  const focusLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-33.333% 0px -66.667% 0px" }
  );
  for (const section of sections) focusLine.observe(section);

  function showKeys(open) {
    keys.hidden = !open;
    keysToggle.setAttribute("aria-expanded", String(open));
  }

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
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const el = event.target;
    if (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= sections.length) {
      jump(sections[digit - 1]);
    } else if (event.key === "t") {
      themeToggle?.click();
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
}

setUpWordmark();
setUpPortrait();
setUpThemeToggle();
setUpClock();
setUpKeys();

runBoot(
  [
    {
      label: "painting portrait",
      promise: portraitTask,
      format: (ms) => `${Math.round(ms)} ms`,
    },
    {
      label: "painting gallery scenes",
      promise: galleryTask,
      format: (ms) => `${Math.round(ms)} ms`,
    },
    {
      label: "syncing clock",
      promise: clockTask,
      format: (r) => r.value,
    },
  ],
  { t0: bootT0 }
);

/* ---------- the pixel lab ---------- */

// The demo map, the same characters the page shows in its <pre>: one
// letter per cell, one colour per letter.
const LAB_COLOURS = {
  light: {
    ".": "#aedcf5", S: "#ffd94a", C: "#ffffff", L: "#57a047",
    g: "#7cc463", G: "#4e9b47", h: "#a8d29a", T: "#7a4a21",
    F: "#ef6aa5", K: "#22304a",
  },
  dark: {
    ".": "#10233c", S: "#dfe9f5", C: "#2c4a73", L: "#2f6b3a",
    g: "#35704a", G: "#26543a", h: "#23505e", T: "#503318",
    F: "#d9578a", K: "#05080f",
  },
};

const DEMO_MAP = [
  "........................",
  "..SS....CCCCCC..........",
  "..SS...CCCCCCCC.........",
  "........CCCCCC..........",
  "........................",
  "...LLL..................",
  "..LLLLL..........hhh....",
  "..LLLLL........hhhhh....",
  "...LLL........hhhhhhh...",
  "....T........hhhhhhhh...",
  "..gggggggggggggggggggg..",
  ".gGGgGGgGGgGGgGGgGGgGGg.",
];

function setUpPixelLab() {
  const labCanvas = document.querySelector("[data-lab-canvas]");
  if (!labCanvas) return;
  const labCtx = labCanvas.getContext("2d");

  function repaint() {
    const colours = LAB_COLOURS[resolvedTheme()];
    DEMO_MAP.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        labCtx.fillStyle = colours[ch];
        labCtx.fillRect(x, y, 1, 1);
      });
    });
  }

  new MutationObserver(repaint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", repaint);

  repaint();
}

setUpPixelLab();

/* ---------- the process, step by step ---------- */

// The same demo map, built again the way the bigger pieces get built.
// Each step is a whole frame: a grid of colour keys, resolved through a
// palette, swapped in on a timer. Nothing moves between frames and
// nothing fades; cells change colour in place, on the tick, and that is
// the whole animation.

// Step one has no colour at all: one flat ink shade per map character,
// so the shapes have to read before the palette arrives.
const NUMBER_SHADES = {
  light: {
    ".": "#e8eff7", C: "#d3e0ee", h: "#b9cadd", g: "#9db4cc",
    G: "#7f99b8", L: "#5f7ea3", T: "#41597d", S: "#22304a",
  },
  dark: {
    ".": "#0a1626", C: "#16283f", h: "#1f3a56", g: "#2a4a6b",
    G: "#35597e", L: "#40688f", T: "#4d77a3", S: "#dcebfb",
  },
};

// The lab colours plus the shades the later steps need, all as data.
// Shadow steps lean cooler, lit steps warmer, the way the ramps on the
// portrait do. " " is a cell that has not landed yet: the box's own
// paper colour, so an unbuilt plane is just the page showing through.
const PROCESS_COLOURS = {
  light: {
    ...LAB_COLOURS.light,
    "L+": "#74b95c", // lit leaves
    "L-": "#3e7c37", // shadow leaves
    "C-": "#cfe3f2", // the cloud's underside
    "h+": "#bce0ac", // the hill's lit rim
    "h-": "#8fbc7d", // the hill's base
    ".d": "#9fd0ef", // sky, one shade over, for the dither step
    "S!": "#ffab2e", // the one accent, lit at the end
    " ": "#f3f5fa",
  },
  dark: {
    ...LAB_COLOURS.dark,
    "L+": "#3d8147",
    "L-": "#245c30",
    "C-": "#223c5e",
    "h+": "#2f6373",
    "h-": "#1a3d49",
    ".d": "#1a3355",
    "S!": "#f2f7ff",
    " ": "#121826",
  },
};

const PROCESS_CAPTIONS = [
  "The grid of numbers. The picture is text before it is pixels, and that is on purpose.",
  "The palette lookup. Each number swaps for the colour the palette gives it.",
  "Clusters and ramps. Lit and shadow faces land, two or three shades to a thing.",
  "Layers, back to front. Sky first, then the ground, then the tree.",
  "Dither, as seasoning. A few sky cells swap to the shade next door.",
  "The light story. One accent lights last, and everything else stays quiet.",
];

const PROCESS_W = 24;
const PROCESS_H = 12;
const DEMO_KEYS = DEMO_MAP.map((row) => [...row]);

// Step three: shade the flat scene from one light source, the upper
// left, where the sun sits. A cell on a shape's top edge takes the lit
// shade; a cell with open sky below or to its right takes the shadow
// shade; the rest keep their flat colour. The tree also drops a cast
// shadow on the grass to its lower right.
function shadedKeys() {
  const grid = DEMO_KEYS.map((row) => row.slice());
  const at = (x, y) => DEMO_KEYS[y]?.[x];
  for (let y = 0; y < PROCESS_H; y += 1) {
    for (let x = 0; x < PROCESS_W; x += 1) {
      const ch = at(x, y);
      if (ch === "L") {
        if (at(x, y - 1) !== "L") grid[y][x] = "L+";
        else if (at(x, y + 1) !== "L" || at(x + 1, y) !== "L") grid[y][x] = "L-";
      } else if (ch === "C") {
        if (at(x, y + 1) !== "C") grid[y][x] = "C-";
      } else if (ch === "h") {
        if (at(x, y - 1) !== "h") grid[y][x] = "h+";
        else if (at(x, y + 1) !== "h") grid[y][x] = "h-";
      }
    }
  }
  for (let x = 4; x <= 8; x += 1) {
    if (grid[10][x] === "g") grid[10][x] = "G";
  }
  return grid;
}

// Step five: a sparse, seeded scatter of sky cells swap to the shade
// next door. Sky only, and only up high, away from the subjects.
function ditheredKeys(base) {
  const grid = base.map((row) => row.slice());
  const rng = mulberry32(20261121);
  const sky = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < PROCESS_W; x += 1) {
      if (grid[y][x] === ".") sky.push([x, y]);
    }
  }
  for (let n = 0; n < 10 && sky.length; n += 1) {
    const [x, y] = sky.splice(Math.floor(rng() * sky.length), 1)[0];
    grid[y][x] = ".d";
  }
  return grid;
}

// Step six: the sun swaps to the accent. Nothing else changes.
function litKeys(base) {
  return base.map((row) => row.map((key) => (key === "S" ? "S!" : key)));
}

// Which plane each map character belongs to, back to front: sky, then
// ground, then the tree. Step four lands one plane per sub-tick by
// holding the later planes at paper.
const planeOf = (ch) =>
  ch === "L" || ch === "T" ? 2 : ch === "h" || ch === "g" || ch === "G" ? 1 : 0;

function layeredKeys(shaded, planes) {
  return shaded.map((row, y) =>
    row.map((key, x) => (planeOf(DEMO_KEYS[y][x]) <= planes ? key : " "))
  );
}

function setUpProcess() {
  const canvas = document.querySelector("[data-process-canvas]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const caption = document.querySelector("[data-process-caption]");
  const stepLabel = document.querySelector("[data-process-step]");
  const meta = document.querySelector("[data-process-meta]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  const shaded = shadedKeys();
  const dithered = ditheredKeys(shaded);
  // One entry per tick. The layers step takes three ticks at a faster
  // beat while its caption stays put; the finished frame holds longest,
  // then the build starts over.
  const frames = [
    { grid: DEMO_KEYS, shades: NUMBER_SHADES, step: 0, ms: 1700 },
    { grid: DEMO_KEYS, shades: PROCESS_COLOURS, step: 1, ms: 1700 },
    { grid: shaded, shades: PROCESS_COLOURS, step: 2, ms: 1700 },
    { grid: layeredKeys(shaded, 0), shades: PROCESS_COLOURS, step: 3, ms: 550 },
    { grid: layeredKeys(shaded, 1), shades: PROCESS_COLOURS, step: 3, ms: 550 },
    { grid: shaded, shades: PROCESS_COLOURS, step: 3, ms: 1150 },
    { grid: dithered, shades: PROCESS_COLOURS, step: 4, ms: 1700 },
    { grid: litKeys(dithered), shades: PROCESS_COLOURS, step: 5, ms: 7000 },
  ];

  let current = frames.length - 1;

  function paint() {
    const frame = frames[current];
    const colours = frame.shades[resolvedTheme()];
    frame.grid.forEach((row, y) => {
      row.forEach((key, x) => {
        ctx.fillStyle = colours[key];
        ctx.fillRect(x, y, 1, 1);
      });
    });
  }

  function show(index) {
    current = index;
    paint();
    if (caption) caption.textContent = PROCESS_CAPTIONS[frames[index].step];
    if (stepLabel) {
      stepLabel.textContent = `step ${frames[index].step + 1} of ${PROCESS_CAPTIONS.length}`;
    }
  }

  // A theme swap repaints the current frame in the other palette, the
  // way every other picture on this page handles it.
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) {
    // One static frame, the finished one. The steps list stays as it is.
    show(frames.length - 1);
    if (meta) meta.style.display = "none";
    return;
  }

  let index = 0;
  function tick() {
    if (document.hidden) {
      setTimeout(tick, 1000);
      return;
    }
    show(index);
    const hold = frames[index].ms;
    index = (index + 1) % frames.length;
    setTimeout(tick, hold);
  }
  tick();
}

setUpProcess();
