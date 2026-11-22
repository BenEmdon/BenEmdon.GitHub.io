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

  /* ---------- hiring bloom: the perimeter ring ---------- */

  // Display-style pixels, driven by the pointer rather than a loop. On
  // Ben's word after the first bloom shipped (PR #150), the light no
  // longer plays across the block: it runs around it. Cells sit on the
  // fixed 8px grid along the block's outermost ring only, one cell
  // deep, so no bloom, flare, or glint cell ever lights over the copy:
  // the block's padding is a full --step, so the ring keeps a clear
  // two cells between itself and the nearest glyph. While the pointer
  // hovers (or a tap holds on touch, or the block holds keyboard
  // focus), a pulse travels the ring: one bright head cell steps
  // around the perimeter, two cells per 75ms tick, trailing shade
  // rungs behind it through the same three solid levels the bloom
  // always used, and the lens flare rides the ring with it, a brighter
  // streak ahead of the head and a dim ghost cluster at the ring's
  // opposite point. In dark mode the shades turn to green crystal
  // light (the palette is data in components.css) and single glint
  // cells on the ring switch as the pulse travels. Every cell swaps
  // whole, in place, stepping toward its target each tick (two levels
  // up while igniting, one level down while settling): nothing
  // drifts, nothing fades, nothing moves.
  //
  // Clearing is a cut, not a settle, on Ben's wording: the glistening
  // "completely disappears" after you scroll or move your mouse away.
  // Pointer leave, blur, and any page scroll remove every cell in one
  // step, back to the untouched rest state. Scrolling never lights the
  // block: the PR #150 scroll-into-band trigger is gone. Reduced
  // motion gets the ring in its still form, the full ring drawn at the
  // middle rung with its corners at the top rung, while hovered,
  // tapped, or focused, clearing in the same one cut.
  const hiring = document.querySelector("[data-hiring]");

  if (hiring) {
    const CELL = 8;

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
    const flareLit = new Map();
    let tickTimer = 0;
    let active = false;
    let touchHeld = false;
    let phase = 0;

    function makeSetter(map, className) {
      return (key, col, row, level) => {
        const cell = map.get(key);
        if (level === 0) {
          if (cell) {
            cell.el.remove();
            map.delete(key);
          }
          return;
        }
        if (!cell) {
          const el = document.createElement("span");
          el.className = className;
          el.style.insetInlineStart = `${col * CELL}px`;
          el.style.insetBlockStart = `${row * CELL}px`;
          el.dataset.level = level;
          hiring.append(el);
          map.set(key, { el, level, glint: false });
          return;
        }
        cell.level = level;
        cell.el.dataset.level = level;
      };
    }
    const setLevel = makeSetter(lit, "hiring__bloom");
    const setFlareLevel = makeSetter(flareLit, "hiring__flare");

    // The ring itself: every cell on the grid's outermost edge, in
    // walking order around the perimeter, so a cell's index is its
    // distance along the ring and the pulse is arithmetic on indices.
    function ringCells(cols, rows) {
      const ring = [];
      if (cols < 2 || rows < 2) return ring;
      for (let c = 0; c < cols; c++) ring.push([c, 0]);
      for (let r = 1; r < rows; r++) ring.push([cols - 1, r]);
      for (let c = cols - 2; c >= 0; c--) ring.push([c, rows - 1]);
      for (let r = rows - 2; r >= 1; r--) ring.push([0, r]);
      return ring;
    }

    // The wanted state of the whole ring at the current phase: the
    // pulse head and its trailing rungs, the flare streak ahead of
    // the head, and the ghost at the opposite point of the ring.
    function ringTargets() {
      const cols = Math.ceil(hiring.clientWidth / CELL);
      const rows = Math.ceil(hiring.clientHeight / CELL);
      const ring = ringCells(cols, rows);
      const want = new Map();
      const wantFlare = new Map();
      const total = ring.length;
      if (total === 0) return { ring, want, wantFlare };
      const head = ((phase % total) + total) % total;
      const put = (map, idx, level) => {
        const i = ((idx % total) + total) % total;
        const [c, r] = ring[i];
        const key = `${c},${r}`;
        if ((map.get(key) ?? 0) < level) map.set(key, level);
      };
      // The head burns at the top rung; the trail steps down behind
      // it, against the direction of travel.
      put(want, head, 3);
      put(want, head - 1, 3);
      put(want, head - 2, 3);
      put(want, head - 3, 2);
      put(want, head - 4, 2);
      put(want, head - 5, 1);
      put(want, head - 6, 1);
      put(want, head - 7, 1);
      // The flare streak runs ahead of the head, brighter than the
      // bloom at every step, the way the flare ramp always sat.
      put(wantFlare, head + 1, 2);
      put(wantFlare, head + 2, 1);
      // The ghost: a dim cluster at the ring's opposite point.
      const ghost = head + Math.floor(total / 2);
      put(wantFlare, ghost, 2);
      put(wantFlare, ghost - 1, 1);
      put(wantFlare, ghost + 1, 1);
      return { ring, want, wantFlare };
    }

    // Glints: in dark mode a few single ring cells at the pulse's lit
    // levels burn at the brightest crystal shade, and which cells
    // glint steps as the pulse travels. A hash of the cell's ring
    // index against a phase that advances with the pulse:
    // deterministic, never random, capped so the ring sparkles at a
    // few points rather than everywhere.
    function applyGlints(on) {
      const chosen = new Set();
      if (on) {
        const cols = Math.ceil(hiring.clientWidth / CELL);
        const rows = Math.ceil(hiring.clientHeight / CELL);
        const ring = ringCells(cols, rows);
        const step = Math.floor(phase / 6) % 6;
        ring.forEach(([c, r], idx) => {
          if (chosen.size >= 6) return;
          const key = `${c},${r}`;
          const cell = lit.get(key);
          if (!cell || cell.level < 2) return;
          if ((idx * 31) % 6 !== step) return;
          chosen.add(key);
        });
      }
      for (const [key, cell] of lit) {
        const g = chosen.has(key);
        if (cell.glint === g) continue;
        cell.glint = g;
        if (g) cell.el.dataset.glint = "1";
        else delete cell.el.dataset.glint;
      }
    }

    function stepToward(map, setter, want) {
      const keys = new Set([...map.keys(), ...want.keys()]);
      for (const key of keys) {
        const target = want.get(key) ?? 0;
        const level = map.get(key)?.level ?? 0;
        if (level === target) continue;
        const comma = key.indexOf(",");
        // Ignition steps two levels at a time, the shipped bloom's
        // travelling discipline: the head moves two cells a tick, so
        // a cell it reaches gets only two ticks under the top-rung
        // targets, and one-step ignition would never land it on the
        // top rung before the head is past. Decay always steps one.
        const step =
          target > level ? Math.min(2, target - level) : -1;
        setter(
          key,
          Number(key.slice(0, comma)),
          Number(key.slice(comma + 1)),
          level + step,
        );
      }
    }

    function tick() {
      if (!active) return;
      phase += 2;
      const { want, wantFlare } = ringTargets();
      stepToward(lit, setLevel, want);
      stepToward(flareLit, setFlareLevel, wantFlare);
      applyGlints(isDark());
    }

    function start() {
      if (active) return;
      active = true;
      if (!tickTimer) tickTimer = setInterval(tick, 75);
    }

    // The cut: every cell gone in one step, the block byte-for-byte
    // its rest self again.
    function clearAll() {
      active = false;
      touchHeld = false;
      if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = 0;
      }
      for (const cell of lit.values()) cell.el.remove();
      lit.clear();
      for (const cell of flareLit.values()) cell.el.remove();
      flareLit.clear();
    }

    if (reduced.matches) {
      // The still ring: the full perimeter at the middle rung, its
      // corners at the top rung, drawn outright while the block is
      // hovered, tapped, or focused, and cleared in one cut on leave,
      // blur, tap-away, or scroll. Never ticked.
      let stillDrawn = false;
      const drawStill = () => {
        if (stillDrawn) return;
        stillDrawn = true;
        const cols = Math.ceil(hiring.clientWidth / CELL);
        const rows = Math.ceil(hiring.clientHeight / CELL);
        for (const [c, r] of ringCells(cols, rows)) {
          const corner =
            (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1);
          setLevel(`${c},${r}`, c, r, corner ? 3 : 2);
        }
      };
      const clearStill = () => {
        if (!stillDrawn) return;
        stillDrawn = false;
        for (const cell of lit.values()) cell.el.remove();
        lit.clear();
      };
      hiring.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") drawStill();
      });
      hiring.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch") {
          if (stillDrawn) clearStill();
          else drawStill();
        }
      });
      hiring.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") clearStill();
      });
      hiring.addEventListener("focus", drawStill);
      hiring.addEventListener("blur", clearStill);
      window.addEventListener("scroll", clearStill, { passive: true });
    } else {
      hiring.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") start();
      });
      hiring.addEventListener("pointermove", (event) => {
        if (event.pointerType !== "touch") start();
      });
      hiring.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch" || touchHeld) return;
        touchHeld = true;
        start();
      });
      hiring.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") clearAll();
      });
      hiring.addEventListener("focus", start);
      hiring.addEventListener("blur", clearAll);
      // Any page scroll clears the ring in the same cut, and
      // scrolling on its own never lights it.
      window.addEventListener("scroll", clearAll, { passive: true });
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
