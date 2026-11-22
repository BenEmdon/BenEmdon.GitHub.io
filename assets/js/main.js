import { attach } from "./dither.js";
import { animateWordmark } from "./wordmark.js";
import { createThemeScene } from "./theme-scene.js";

const THEME_KEY = "theme";
// The cycle the toggle walks. "system" is where everyone starts, and it is
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

  // Read by the portrait dissolve and by keyed jumps, so it sits above both
  // rather than inside whichever one happened to need it first.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- portrait ---------- */

  // Eight steps of it, matching the wordmark's own reveal. Few enough that each
  // one lands as a separate frame rather than reading as a fade.
  const DISSOLVE_STEPS = 8;

  for (const frame of document.querySelectorAll("[data-dither]")) {
    const canvas = frame.querySelector("[data-dither-canvas]");
    const photo = frame.querySelector("img");

    attach(canvas, photo)
      .then((portrait) => {
        repaints.push(portrait.repaint);

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
      // Without the dither the photo simply shows through, so there is nothing
      // to clean up on failure.
      .catch(() => {});
  }

  /* ---------- hiring sparkle ---------- */

  // Display-style pixels, driven by the pointer rather than a loop. Cells
  // sit on a fixed 8px grid inside the block, behind the text. Each is a
  // 4px square, so lit cells stay separate sparkles instead of merging
  // into a smear, and they only ever snap lit or unlit in place. Pointer
  // speed widens the lit area and stretches how many decay steps a cell
  // survives, so a fast pass leaves a longer trail of lit neighbours than
  // a slow one. Decay ticks every 75ms, the site's own --motion-step, so
  // cells step off rather than fade.
  const hiring = document.querySelector("[data-hiring]");

  if (hiring && window.matchMedia("(hover: hover)").matches) {
    const CELL = 8;
    const lit = new Map();
    let decayTimer = 0;
    let lastX = null;
    let lastY = null;
    let lastT = 0;

    function tick() {
      for (const [key, cell] of lit) {
        cell.steps -= 1;
        if (cell.steps <= 0) {
          cell.el.remove();
          lit.delete(key);
        }
      }
      if (lit.size === 0) {
        clearInterval(decayTimer);
        decayTimer = 0;
      }
    }

    function light(col, row, steps) {
      const key = `${col},${row}`;
      const existing = lit.get(key);
      if (existing) {
        existing.steps = Math.max(existing.steps, steps);
        return;
      }
      const el = document.createElement("span");
      el.className = "hiring__pixel is-lit";
      el.style.insetInlineStart = `${col * CELL}px`;
      el.style.insetBlockStart = `${row * CELL}px`;
      hiring.append(el);
      lit.set(key, { el, steps });
      if (!decayTimer) decayTimer = setInterval(tick, 75);
    }

    function burst(x, y, speed, rect) {
      // Radius is counted in 8px cells. Only one checkerboard parity
      // lights, so neighbouring squares never merge into a blob behind
      // the copy; a burst reads as a fine dotted texture, not a smear.
      const radius = speed > 1.2 ? 4 : speed > 0.45 ? 3 : 2;
      const col = Math.floor(x / CELL);
      const row = Math.floor(y / CELL);

      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          const dist = Math.abs(dc) + Math.abs(dr);
          if (dist > radius + 1) continue;
          const c = col + dc;
          const r = row + dr;
          if ((c + r) % 2 !== 0) continue;
          // Sparse at the edges, so it sparkles instead of flooding.
          if (dist > 2 && Math.random() < 0.35) continue;
          if (c < 0 || r < 0 || c * CELL >= rect.width || r * CELL >= rect.height) continue;
          const steps = Math.ceil((radius + 2 - dist) / 2) * (speed > 0.45 ? 2 : 1);
          light(c, r, Math.max(1, Math.min(4, steps)));
        }
      }
    }

    hiring.addEventListener("pointermove", (event) => {
      if (reduced.matches || event.pointerType === "touch") return;

      const rect = hiring.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const now = performance.now();

      let speed = 0;
      if (lastX !== null) {
        const dt = Math.max(now - lastT, 1);
        speed = Math.hypot(x - lastX, y - lastY) / dt;
        // Fill the path between events, so a fast pass leaves a trail
        // along its direction instead of separate bursts with gaps.
        const gap = Math.hypot(x - lastX, y - lastY);
        const fills = Math.min(Math.floor(gap / CELL), 24);
        for (let i = 1; i < fills; i++) {
          burst(lastX + ((x - lastX) * i) / fills, lastY + ((y - lastY) * i) / fills, speed, rect);
        }
      }
      burst(x, y, speed, rect);
      lastX = x;
      lastY = y;
      lastT = now;
    });

    hiring.addEventListener("pointerleave", () => {
      lastX = null;
    });
  }

  /* ---------- theme ---------- */

  const toggle = document.querySelector("[data-theme-toggle]");
  const themeLabel = toggle.querySelector("[data-theme-label]");
  const sceneButtons = [...document.querySelectorAll("[data-theme-scene-button]")];
  const sceneCurrents = [...document.querySelectorAll("[data-theme-scene-current]")];
  let themeScenes = [];
  let mode = storedMode();
  let sceneCycleStarted = false;

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

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

    const resolved = systemDark.matches ? "dark" : "light";
    // The toggle carries the theme scene now, so the mode word lives in its
    // own span; setting textContent on the button would wipe the canvas.
    if (themeLabel) themeLabel.textContent = mode;
    else toggle.textContent = mode;
    toggle.setAttribute(
      "aria-label",
      `Theme: ${mode === "system" ? `system (${resolved})` : mode}. ` +
        `Switch to ${nextMode(mode)}.`
    );

    // Both scene controls carry the current mode as their one visible
    // word, and the scene button's name says where a click goes next,
    // worked out live so the system first-click rule is in the name.
    sceneCurrents.forEach((label) => {
      label.textContent = mode;
    });
    const sceneNext = nextSceneMode();
    sceneButtons.forEach((button) =>
      button.setAttribute(
        "aria-label",
        `Theme: ${mode}. Activate to switch to ${sceneNext}`
      )
    );

    // The dither reads its two colours back out of CSS, so it has to be
    // redrawn whenever the resolved theme could have moved under it.
    repaints.forEach((repaint) => repaint());

    // Both little landscapes re-light to match: day in light, night in
    // dark, stepped cell by cell unless reduced motion is on.
    themeScenes.forEach((scene) => scene.setDark(resolvedDark(), reduced.matches));
  }

  toggle.addEventListener("click", () => {
    mode = nextMode(mode);
    persistMode();
    applyMode();
  });

  // The picture is the control. Clicking either instance advances the
  // one shared cycle; both words, both scenes, and the text toggle all
  // re-read the same mode in applyMode. The swap is whole and instant,
  // and the button is never hidden or replaced, so focus stays on it.
  sceneButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = nextSceneMode();
      sceneCycleStarted = true;
      persistMode();
      applyMode();
    });
  });

  // Only in system mode does the OS still get a vote.
  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  // Both scenes start on whichever state the page loaded in, drawn in
  // one cut; only changes after this earn the stepped swap.
  themeScenes = [...document.querySelectorAll("[data-theme-scene]")].map(
    (canvas) => createThemeScene(canvas, { dark: resolvedDark() })
  );

  applyMode();

  /* ---------- section in view ---------- */

  const sections = document.querySelectorAll(".section");

  // A zero-height band pinned to the middle of the viewport: inset the root
  // 50% from top and bottom and no box is left, so a section "intersects"
  // exactly while it straddles the centre line. Sections do not overlap, so at
  // most one qualifies at a time. Cheaper and steadier than measuring rects on
  // every scroll event.
  // While a keyed jump is in flight the observer stands down: see frame().
  let jumpingUntil = 0;

  function frame(section) {
    for (const other of sections) other.classList.toggle("is-active", other === section);
  }

  const centreLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;

      // Between two sections sit a divider and its margins, about 72px where
      // nothing is at the centre. Clearing the frame there makes it strobe, so
      // whichever section reached the middle last keeps it until the next one
      // arrives.
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-50% 0px -50% 0px" }
  );

  for (const section of sections) centreLine.observe(section);

  /* ---------- keys ---------- */

  const keys = document.querySelector("[data-keys]");
  const keysToggle = document.querySelector("[data-keys-toggle]");

  function showKeys(open) {
    keys.hidden = !open;
    keysToggle.setAttribute("aria-expanded", String(open));
  }

  // Landing a section at the top of the viewport puts the centre line past the
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
      toggle.click();
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

  animateWordmark(wordmark, reduced);

  /* ---------- boot ---------- */

  // Every value here is read back out of the page's own state: the theme the
  // toggle above just applied, the Ottawa time the footer clock is about to
  // start telling, and the command palette's own count. The log is a bit of
  // theatre; it is not the place to introduce a fact.
  const themeValue =
    mode === "system" ? `system (${systemDark.matches ? "dark" : "light"})` : mode;
  const ottawaTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  const BOOT_LOG = [
    ["loading type", "iosevka (the good one)"],
    ["restoring theme", themeValue],
    ["syncing clock", `ottawa ${ottawaTime}`],
    ["indexing palette", "13 commands"],
  ];

  // A spruce, drawn as data: one character per cell on an 11 x 13 grid.
  // L, M and D are the canopy ramp, lit from the upper left: the lit shade
  // rims the left edge and catches the top row of each tier, the deep
  // shade is the underside of each tier and grows down the right side,
  // and the ground row is one deep cluster the trunk lands in, a shadow
  // rather than a lawn. The colours themselves live in components.css as
  // the .boot__tree custom properties. It builds beside the log while the
  // lines resolve: ground first, apex last, one row per motion step, so
  // it is finished inside the log's last beat and the screen's total wait
  // is unchanged.
  const TREE = [
    ".....M.....",
    "....LLD....",
    "....LMD....",
    "...LLMMD...",
    "...LMMDD...",
    "..LLMMMMD..",
    "..LMMMDDD..",
    ".LLMMMMMMD.",
    ".LMMMMDDDD.",
    "LLMMMMMMMMD",
    "LMMMMMMDDDD",
    ".....T.....",
    "...DDDDD...",
  ];
  const TREE_SHADE = {
    L: "is-lit",
    M: "is-mid",
    D: "is-deep",
    T: "is-trunk",
  };
  const TREE_CELL = 6;

  // Progress as cells rather than a bar: this many squares, filled a few
  // per settled line. Four per line, so the row completes exactly when the
  // log does.
  const PROGRESS_CELLS = 16;

  // Braille rather than the circle spinners git-merge uses: Iosevka draws
  // those at two columns and these at one, so these keep the mark column the
  // same width from frame to frame.
  const SPINNER = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];

  // Roughly 1.3s of log, plus however long main.js took to arrive. Slow enough
  // that each line lands as its own event and the spinner gets a few frames on
  // screen before it resolves, rather than the whole thing reading as one
  // flash. Anything much past this stops being a flourish and starts being a
  // wait, which is what the skip is for.
  const LINE_EVERY = 140;
  const LINE_SETTLES = 200;
  const LAST_BEAT = 500;

  const boot = document.querySelector("[data-boot]");

  // Runs on every load, the way the page it is borrowed from does. Skipped outright for anyone who asked not to be animated:
  // for them it is a blank screen between them and the content, which is the
  // opposite of the point.
  if (boot && !reduced.matches) {
    const log = boot.querySelector("[data-boot-log]");
    const logo = wordmark.cloneNode(true);
    boot.querySelector("[data-boot-logo]").append(logo);
    boot.hidden = false;

    // The clone is taken before the block glyphs have loaded, since they are
    // served display=block and the boot starts immediately. Rather than hold
    // the whole screen for the font, let the logo run the same paint-in the
    // real one does, the moment it can.
    document.fonts.ready.then(() => logo.classList.add("is-booting"));

    const timers = [];
    const marks = [];
    let frame = 0;

    const spin = setInterval(() => {
      frame = (frame + 1) % SPINNER.length;
      for (const mark of marks) {
        if (!mark.dataset.done) mark.textContent = SPINNER[frame];
      }
    }, 80);

    // The tree builds one row per motion step, ground first. Rows are
    // pre-built as detached cells and placed group by group; a cell is
    // either there, fully coloured, or not there. Nothing slides or fades.
    const treeBox = boot.querySelector("[data-boot-tree]");
    const treeRows = TREE.map((row, y) => {
      const cells = [];
      [...row].forEach((ch, x) => {
        if (ch === ".") return;
        const cell = document.createElement("span");
        cell.className = `boot__pix ${TREE_SHADE[ch]}`;
        cell.style.left = `${x * TREE_CELL}px`;
        cell.style.top = `${y * TREE_CELL}px`;
        cells.push(cell);
      });
      return cells;
    }).reverse();

    let treeRow = 0;
    const grow = setInterval(() => {
      if (treeRow >= treeRows.length) {
        clearInterval(grow);
        return;
      }
      treeBox.append(...treeRows[treeRow]);
      treeRow += 1;
    }, 75);

    // The progress row: every cell starts as track, and settling a line
    // raises the target by its share. The filler walks two cells per
    // motion step until it catches up, so the row reads as steps of work
    // done rather than a bar sliding.
    const progressBox = boot.querySelector("[data-boot-progress]");
    const pcells = [];
    for (let i = 0; i < PROGRESS_CELLS; i++) {
      const cell = document.createElement("span");
      cell.className = "boot__pcell";
      cell.style.left = `${i * 8}px`;
      progressBox.append(cell);
      pcells.push(cell);
    }
    let progressTarget = 0;
    let progressFilled = 0;
    const fill = setInterval(() => {
      for (let n = 0; n < 2 && progressFilled < progressTarget; n++) {
        pcells[progressFilled].classList.add("is-on");
        progressFilled += 1;
      }
      if (progressFilled >= PROGRESS_CELLS) clearInterval(fill);
    }, 75);

    function done() {
      clearInterval(spin);
      clearInterval(grow);
      clearInterval(fill);
      timers.forEach(clearTimeout);
      removeEventListener("keydown", done);
      boot.remove();
    }

    // Nobody should be held here. Any key or any click cuts to the page. The
    // click listener leaves with the element; the keydown one has to be taken
    // off by hand, or it outlives the boot and fires on the first key the
    // visitor presses at the real page.
    addEventListener("keydown", done);
    boot.addEventListener("click", done);

    function span(className, text) {
      const el = document.createElement("span");
      el.className = className;
      el.textContent = text;
      return el;
    }

    BOOT_LOG.forEach(([task, value], i) => {
      timers.push(
        setTimeout(() => {
          const line = document.createElement("li");
          line.className = "boot__line";

          const mark = span("boot__mark", SPINNER[frame]);
          const result = span("boot__value is-pending", "_");
          marks.push(mark);

          line.append(
            mark,
            span("boot__task", task),
            // Longer than any gap it has to fill; the overflow is clipped.
            span("boot__dots", ".".repeat(80)),
            result
          );
          log.append(line);

          timers.push(
            setTimeout(() => {
              mark.dataset.done = "1";
              mark.textContent = "\u2713";
              result.className = "boot__value";
              result.textContent = value;
              progressTarget = (i + 1) * (PROGRESS_CELLS / BOOT_LOG.length);
            }, LINE_SETTLES)
          );
        }, i * LINE_EVERY)
      );
    });

    // A beat on the finished log, then out.
    timers.push(setTimeout(done, BOOT_LOG.length * LINE_EVERY + LINE_SETTLES + LAST_BEAT));
  }

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

    // Land on the minute rather than drifting a second past it, which a fixed
    // 60s interval would do a little more of every hour.
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  if (clock) tick();
}

setUp();
