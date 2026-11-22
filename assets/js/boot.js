/*
  The boot, shared by the home, Mochi, and music pages.

  One sequence, two surfaces. The full boot screen (the log and
  the framed field filling in beside it) shows once per session,
  on whichever page the visit lands on first. Every later load in
  the same session gets the small surface instead: a segmented
  pixel bar at the top of the page, one segment per task the page
  loads, each segment lighting as its task finishes, with the
  count beside it. When the last task settles the bar reports the
  total time the page's tasks really took, holds for about a
  second, and is removed in one step.

  Both surfaces run off the same task list the page hands in:
  { label, promise, format } entries whose promises resolve only
  when the real work finishes (the registry in boot-tasks.js is
  how the home page's modules announce theirs). Nothing here runs
  on a schedule of its own except the safety valve: a task that
  hangs past the timeout stops holding the surface, while the
  work itself carries on in the background.

  Pages carrying the experiment badge run the full screen on every
  load, so a preview always shows what a first visit shows, and
  never touch the session flag. A reduced-motion load shows
  neither surface and does not spend the flag either: for those
  visitors the screen is a blank wait between them and the page.
  The work itself runs on every load regardless of the surface;
  only the reporting is gated.
*/

const BOOT_SEEN_KEY = "boot-seen";

// The per-task timeout, the safety valve the full log has always
// had: a task that hangs (a stalled image, a wedged audio render)
// reports "still working" at the timeout and stops holding the
// screen. The indicator races each task against the same timeout.
const TASK_TIMEOUT = 12000;

// The full boot's exit gate: once every task has settled, the exit
// still waits until the picture has fully filled plus a short
// hold after its last cell, so the finished picture is actually
// seen. The fill takes about half a second once the tasks allow
// it, and the hold is 450 ms.
const BOOT_HOLD_MS = 450;

// How long the finished indicator stays up before it is removed:
// long enough to read the count and the total, no longer.
const INDICATOR_HOLD_MS = 1000;

// Which surface a load gets, as a pure decision so it can be
// exercised outside a browser: badge pages always boot in full,
// reduced motion never boots, a session that has already seen the
// full boot gets the indicator, and anything else boots in full.
export function decideBootSurface({ experimental, reducedMotion, sessionSeen }) {
  if (experimental) return "full";
  if (reducedMotion) return "none";
  return sessionSeen ? "indicator" : "full";
}

// The badge check the home page has used since the once-per-session
// gate: an element with class "tag" whose text is "experiment".
function isExperimentalPage() {
  return [...document.querySelectorAll(".tag")].some(
    (el) => el.textContent.trim().toLowerCase() === "experiment"
  );
}

function sessionBootSeen() {
  try {
    return sessionStorage.getItem(BOOT_SEEN_KEY) === "1";
  } catch {
    // Storage refused: treat the load as a first one and run it.
    return false;
  }
}

function markSessionBootSeen() {
  try {
    sessionStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    // The screen still runs this load; the next one decides again.
  }
}

// The framed field, the site's favicon, as data: one character per
// cell on its own 16 x 16 grid, converted from favicon.svg cell for
// cell, so the boot fills in the same little painting the browser
// tab wears. F, f, s and o are the gold frame and its bevel; k and
// K the sky; S the sun; C the cloud; h the far hill; g and G the
// field; r the one red flower. The colours live in components.css
// as the .boot__icon custom properties, in the favicon's own day
// and night pairs.
const ICON = [
  "oFFFFFFFFFFFFFFo",
  "FfffffffffffffsF",
  "FfSSkkkkkkkkkksF",
  "FfSSkkkkkkCCCksF",
  "FfKKKKKKKKKKKKsF",
  "FfKKKKKKKKKKKKsF",
  "FfKKKKKKKKKKKKsF",
  "FfKKKKKKKKKhhhsF",
  "FfKKKKKKhhhhhhsF",
  "FfhhhhhhhhhhhhsF",
  "FfggggggggggggsF",
  "FfgggrgggGGgggsF",
  "FfgGGgggggggGgsF",
  "FfggggGGggggggsF",
  "FssssssssssssssF",
  "oFFFFFFFFFFFFFFo",
];
const ICON_SHADE = {
  F: "is-frame",
  f: "is-frame-lit",
  s: "is-frame-deep",
  o: "is-corner",
  k: "is-sky",
  K: "is-sky-lit",
  S: "is-sun",
  C: "is-cloud",
  h: "is-hill",
  g: "is-field",
  G: "is-field-deep",
  r: "is-flower",
};
const ICON_CELL = 5;

// Braille rather than circle spinners: Iosevka draws those at two
// columns and these at one, so the mark column keeps the same
// width from frame to frame.
const SPINNER = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];

// Cells per indicator segment. A segment is one task's share of
// the bar: its cells are track-coloured until the task finishes,
// then all of them light in the same step. Nothing slides and
// nothing fades; a segment is either lit or it is not.
const SEGMENT_CELLS = 4;

// Seeded, so the fill order is the same visit to visit without
// Math.random at render time. The portrait's own generator.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runFullBoot(tasks) {
  const boot = document.querySelector("[data-boot]");
  if (!boot) return false;

  const log = boot.querySelector("[data-boot-log]");
  const logoSlot = boot.querySelector("[data-boot-logo]");
  const wordmark = document.querySelector(".wordmark");
  if (logoSlot && wordmark) {
    const logo = wordmark.cloneNode(true);
    logoSlot.append(logo);
    // The clone is taken before the block glyphs have loaded, since
    // they are served display=block and the boot starts immediately.
    // Rather than hold the whole screen for the font, let the logo
    // run the same paint-in the real one does, the moment it can.
    document.fonts.ready.then(() => logo.classList.add("is-booting"));
  }
  boot.hidden = false;

  const timers = [];
  const marks = [];
  let frame = 0;

  const spin = setInterval(() => {
    frame = (frame + 1) % SPINNER.length;
    for (const mark of marks) {
      if (!mark.dataset.done) mark.textContent = SPINNER[frame];
    }
  }, 80);

  // The picture fills beside the log while the lines resolve. The
  // fill is the portrait dissolve's own move, a scrambled order
  // over seeded steps: cells are pre-built detached and placed a
  // batch per motion step, each either there, fully coloured, or
  // not there. How far the fill may go tracks the log exactly:
  // each settled task raises the target by its share of the cells,
  // so the picture completes when the work does, never before.
  // The moment the last cell lands is recorded, because the exit
  // gate below waits on it.
  const iconBox = boot.querySelector("[data-boot-icon]");
  const iconCells = [];
  ICON.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cell = document.createElement("span");
      cell.className = `boot__cell ${ICON_SHADE[ch]}`;
      cell.style.left = `${x * ICON_CELL}px`;
      cell.style.top = `${y * ICON_CELL}px`;
      iconCells.push(cell);
    });
  });
  const rng = mulberry32(20261122);
  for (let i = iconCells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [iconCells[i], iconCells[j]] = [iconCells[j], iconCells[i]];
  }
  const ICON_TOTAL = iconCells.length;
  // Seven steps to a full picture, the count the tree's build used.
  const FILL_PER_STEP = Math.ceil(ICON_TOTAL / 7);

  let fillTarget = 0;
  let filled = 0;
  let iconFilledAt = null;
  // A page whose markup has no slot for the picture fills instantly
  // on paper, so the exit gate below can never wedge on it.
  if (!iconBox) iconFilledAt = performance.now();
  const fill = iconBox
    ? setInterval(() => {
        for (let n = 0; n < FILL_PER_STEP && filled < fillTarget; n++) {
          iconBox.append(iconCells[filled]);
          filled += 1;
        }
        if (filled >= ICON_TOTAL) {
          clearInterval(fill);
          iconFilledAt = performance.now();
          maybeExit();
        }
      }, 75)
    : null;

  let bootDone = false;
  function done() {
    if (bootDone) return;
    bootDone = true;
    clearInterval(spin);
    clearInterval(fill);
    timers.forEach(clearTimeout);
    removeEventListener("keydown", done);
    boot.remove();
  }

  // Nobody should be held here. Any key or any click cuts to the
  // page. The click listener leaves with the element; the keydown
  // one has to be taken off by hand, or it outlives the boot and
  // fires on the first key the visitor presses at the real page.
  addEventListener("keydown", done);
  boot.addEventListener("click", done);

  function span(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  let settled = 0;
  let tasksSettled = false;
  let exitScheduled = false;

  // The exit needs both halves: every task settled, and the
  // picture fully filled plus the hold after its last cell.
  // Whichever half lands second runs this check. A scheduled exit
  // sits in timers, so a skip still clears it and cuts straight to
  // the page.
  function maybeExit() {
    if (!tasksSettled || iconFilledAt === null || exitScheduled) return;
    const remaining = iconFilledAt + BOOT_HOLD_MS - performance.now();
    if (remaining > 0) {
      exitScheduled = true;
      timers.push(setTimeout(done, remaining));
    } else {
      done();
    }
  }

  const settle = () => {
    settled += 1;
    fillTarget = Math.round(settled * (ICON_TOTAL / tasks.length));
    if (settled !== tasks.length) return;
    tasksSettled = true;
    maybeExit();
  };

  // One row per task, up front with its spinner turning; the row
  // resolves in place the moment its task settles. Nothing here is
  // on a timer except the timeout race beside each task.
  for (const task of tasks) {
    const line = document.createElement("li");
    line.className = "boot__line";

    const mark = span("boot__mark", SPINNER[frame]);
    const result = span("boot__value is-pending", "_");
    marks.push(mark);

    line.append(
      mark,
      span("boot__task", task.label),
      // Longer than any gap it has to fill; the overflow is clipped.
      span("boot__dots", ".".repeat(80)),
      result
    );
    log.append(line);

    const timedOut = new Promise((resolve) => {
      timers.push(setTimeout(() => resolve({ timedOut: true }), TASK_TIMEOUT));
    });

    Promise.race([task.promise, timedOut]).then(
      (value) => {
        if (!boot.isConnected) return; // the visitor skipped ahead
        mark.dataset.done = "1";
        result.className = "boot__value";
        if (value && value.timedOut) {
          mark.textContent = "!";
          result.textContent = "still working";
        } else {
          mark.textContent = "✓";
          result.textContent = task.format(value);
        }
        settle();
      },
      () => {
        if (!boot.isConnected) return;
        mark.dataset.done = "1";
        mark.textContent = "×";
        result.className = "boot__value";
        result.textContent = "failed";
        settle();
      }
    );
  }

  return true;
}

const TIMED_OUT = Symbol("boot-timed-out");

function runIndicator(tasks, t0) {
  const bar = document.createElement("div");
  bar.className = "boot-ind";
  bar.setAttribute("aria-hidden", "true");

  const segments = tasks.map(() => {
    const seg = document.createElement("span");
    seg.className = "boot-ind__seg";
    for (let i = 0; i < SEGMENT_CELLS; i++) {
      const cell = document.createElement("span");
      cell.className = "boot-ind__cell";
      seg.append(cell);
    }
    bar.append(seg);
    return seg;
  });

  const text = document.createElement("span");
  text.className = "boot-ind__text";
  text.textContent = `0 of ${tasks.length}`;
  bar.append(text);
  document.body.prepend(bar);

  let settled = 0;
  let loaded = 0;

  // Every task settled, one way or another: report what actually
  // loaded and how long the page's tasks really took, measured
  // from the start the page handed in, then hold briefly and take
  // the row away in one step. No fade: the row is there, then it
  // is not, the way every other pixel on the site behaves.
  const finish = () => {
    const total = Math.round(performance.now() - t0);
    text.textContent = `${loaded} of ${tasks.length} · ${total} ms`;
    setTimeout(() => bar.remove(), INDICATOR_HOLD_MS);
  };

  tasks.forEach((task, i) => {
    const timedOut = new Promise((resolve) => {
      setTimeout(() => resolve(TIMED_OUT), TASK_TIMEOUT);
    });
    Promise.race([task.promise, timedOut]).then(
      (value) => {
        if (!bar.isConnected) return;
        settled += 1;
        if (value !== TIMED_OUT) {
          segments[i].classList.add("is-on");
          loaded += 1;
        }
        if (settled === tasks.length) finish();
        else text.textContent = `${loaded} of ${tasks.length}`;
      },
      () => {
        if (!bar.isConnected) return;
        settled += 1;
        if (settled === tasks.length) finish();
        else text.textContent = `${loaded} of ${tasks.length}`;
      }
    );
  });
}

// The one entry point every page calls with its own task list.
// t0 is the page's own zero, captured where its setup starts, so
// the durations and the indicator's total measure the page's real
// startup rather than this module's arrival. Returns the surface
// chosen, for anyone who wants to know.
export function runBoot(tasks, { t0 = performance.now() } = {}) {
  const experimental = isExperimentalPage();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const surface = decideBootSurface({
    experimental,
    reducedMotion,
    sessionSeen: experimental ? false : sessionBootSeen(),
  });

  if (surface === "none" || tasks.length === 0) return surface;

  if (surface === "full") {
    // The flag is written as the screen opens, so a load that
    // never shows it does not spend it, and a fresh tab or session
    // sees it again. Badge pages never write it.
    if (!experimental) markSessionBootSeen();
    if (runFullBoot(tasks)) return surface;
    // A page with no boot screen in its markup gets the small
    // surface instead of nothing.
  }

  runIndicator(tasks, t0);
  return "indicator";
}
