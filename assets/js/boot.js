/*
  The boot, shared by the home, Mochi, and music pages.

  One sequence, two surfaces. The full boot screen (the log and
  the framed field filling in beside it) shows on the first page
  a session lands on, whichever page that is, and on the home
  page on every load after that, however the home page is
  reached. Every other load in the same session, and every piece
  of async work after that on any load,
  reports to the loader instead: a small spinner in the top right
  corner, the favicon's framed field at 32px, overlaying the page
  and reserving no space in it. Its cells fill in place as work
  settles, the count beside it reads done of total while a batch
  runs, and when the batch closes it reports the batch's measured
  latency, holds for about a second, and is removed in one step.

  The loader runs off a registry, below: it never runs the
  work it reports. A process registers through registerTask and
  reports its progress (which may move backwards, when the work
  itself does) and its ending; callers who already hold a
  promise use the trackWork adapter instead. Either way the
  spinner reflects whatever is actually in flight, rolled up
  into one state, and tapping it expands the full boot loader's
  UI over the same registry. A batch opens when the first task
  registers while idle and closes when the last one settles;
  the counts are whatever really registered, never a fixed
  list. The boot's surfaces run off the task list the page hands
  runBoot: { label, promise, format } entries whose promises
  resolve only when the real work finishes (the registry in
  boot-tasks.js is how the home page's modules announce theirs).
  Nothing here runs on a schedule of its own except the safety
  valve: a boot task that hangs past the timeout stops holding
  its surface, while the work itself carries on in the
  background.

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

// The full screen's floor: however fast the work runs, the screen
// stays up a second and a half in total, so the ceremony has time
// to read as one. The extra is hold at the floor, never padded
// numbers: the log lines keep the durations they really measured
// and the fill still tracks the tasks. Work slower than the floor
// takes as long as it takes, as it always has.
const BOOT_FLOOR_MS = 1500;

// How long the finished spinner stays up before it is removed:
// long enough to read the count and the total, no longer. The
// removal itself waits for the painting too: the chip leaves
// once the hold has run AND the fill has played out to whole,
// whichever lands last (maybeFinishClosedBatch).
const SPINNER_HOLD_MS = 1000;

// The spinner's minimum time on screen, counted from the
// moment it appears: a batch that settles in a blink still
// gets its second, so the surface never just flashes. The
// numbers it shows stay the ones the work really measured;
// only the removal waits. A batch slower than the minimum
// removes on the hold above alone, never the two waits
// stacked.
const SPINNER_MIN_MS = 1000;

// Which surface a load gets, as a pure decision so it can be
// exercised outside a browser: badge pages always boot in full,
// reduced motion never boots, the home page boots in full on
// every load however it is reached (refresh and internal link
// included; there is no referrer test, because a refresh
// carries the page itself as its referrer and read as an
// internal arrival under the old rule, which is why refreshed
// home pages stopped booting), a session that has already
// seen the full boot gets the indicator on any other page,
// and anything else boots in full.
export function decideBootSurface({
  experimental,
  reducedMotion,
  sessionSeen,
  home = false,
}) {
  if (experimental) return "full";
  if (reducedMotion) return "none";
  if (home) return "full";
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
  // The screen's own zero for the floor below: the total is
  // measured from the moment the screen becomes visible.
  const startedAt = performance.now();
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
  // picture fully filled plus the hold after its last cell. It
  // also waits out the floor, so a fast load still gets the full
  // second and a half of screen. Whichever lands last runs this
  // check. A scheduled exit sits in timers, so a skip still
  // clears it and cuts straight to the page.
  function maybeExit() {
    if (!tasksSettled || iconFilledAt === null || exitScheduled) return;
    const earliest = Math.max(
      iconFilledAt + BOOT_HOLD_MS,
      startedAt + BOOT_FLOOR_MS
    );
    const remaining = earliest - performance.now();
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

// ----------------------------------------------------------------
// The loader registry, and the corner spinner that reports it.
//
// The loader never runs anything. It is a reporting surface: a
// process that owns async work registers it, reports progress
// as the work goes, and reports how it ended; the loader rolls
// those reports into one visible state. Two ways in:
//
//   const work = registerTask("rendering song");
//   work.status("loading samples");
//   work.update(0.25);              // the caller's own account
//   work.status("rendering");       // of how far the work is;
//   work.update(0.4);               // it may move backwards
//   work.status("rendering again"); // when the work itself
//   work.update(0.4);               // does, a retry after a
//   work.complete();                // failed check above all
//   work.fail("why it ended");      // (or this, instead)
//
//   trackWork(promise, ...)         // the adapter, below
//
// Ownership, stated plainly because the adapter makes it easy
// to blur: the loader observes; the caller runs. trackWork
// never starts, drives, or cancels work; it wraps a promise
// the caller already created and controls, and only reports
// its settling. A handle is the same relationship without the
// promise: registering reports work that exists independently
// of the registry, and nothing in here reaches back into it.
//
// A batch opens when the first task registers while the
// registry is idle and closes when the last registered task
// settles, so the counts are whatever actually registered on
// this page at this moment, never a fixed list and never a
// fixed total. Registering the same promise twice through the
// adapter counts it once: two callers holding the same piece
// of work (the boot's task list and the module that started
// it) are one task, not two.
//
// The roll-up, the one state every surface shows: the favicon
// fill's share is the mean of the tasks' fractions (a settled
// task keeps its final fraction, a completed one counts 1),
// so a task reverting its progress lowers the picture with
// it; the count is tasks completed of tasks registered, with
// failures named beside it rather than folded silently into
// the count; and when the batch closes, its latency is
// measured from the batch's zero (the first registration, or
// the page's own zero when the boot seeds it) to the last
// settle. A task that hangs past its timeout stops holding
// the batch, counted settled but neither done nor failed,
// while the work itself carries on: the boot's safety valve,
// kept from the indicator days.
//
// The spinner is the favicon's framed field at 32px, fixed in
// the top right corner over the page: it reserves no space.
// Its cells fill in place in the boot fill's own seeded
// scrambled order, stepping toward the rolled-up share in
// either direction. The chip is a small stack of lines, each
// with its own backing fitted to its content: the picture
// pinned to the corner's right edge, the count under it
// (done/total, failures named beside it), and, once the batch
// closes, the measured latency on a line of its own under the
// count. The finished stack holds for about a second, and the
// whole surface is removed in one step. No fades, the way
// every pixel on the site behaves.
//
// Tapping the spinner expands it into an overlay panel: a
// header carrying the painting with the chip's own count
// (and latency, once closed) at its right, above a table
// of the batch's tasks, one row per
// task, its mark, its label, and its status right-aligned on
// the same line, always: a row never wraps, and a long label
// ellipsises rather than pushing its status down. One status
// rule for every row: a status text the task set wins; a
// completed task without one shows its own measured duration;
// a running task shows its status text or its share; a failed
// task shows its reason. The panel is the same registry seen
// closer, not a second state: it renders the current batch
// only, and tasks that register while it is open gain their
// row on the next report. Tapping the spinner again, or
// anywhere outside the panel, collapses it back to the chip.
// While the panel is open a closed batch stays up until it
// is collapsed; the one-second hold runs only against the
// chip alone.
//
// Two suppressions, both honest: while the full boot screen is
// up it is the surface, so the spinner waits (and the panel
// cannot open), and mounts when the screen clears if work is
// still in flight; and a reduced-motion load shows neither
// surface, as it shows no boot. The registry itself always
// tracks: only the reporting is gated, never the work.
// ----------------------------------------------------------------

// The spinner's cells: the icon's 16 x 16 grid at 2px a cell,
// 32px square in the corner. The cells sit SPINNER_PAD inside
// the icon's box, so the picture's own background line carries
// a margin around the painting, the way the text lines carry
// padding around their words; components.css sizes the box to
// the grid plus twice the pad.
const SPINNER_CELL = 2;
const SPINNER_PAD = 4;
// The panel's painting is the boot screen's own: its 5px
// cells in its 80px box, so the two surfaces are one picture.
const PANEL_CELL = 5;
const ICON_TOTAL = ICON.reduce((n, row) => n + row.length, 0);

// The fill's pacing (Ben, 2026-11-22, retimed): twenty steps
// of 75 ms, thirteen cells a step, so a painting that has to
// play out the whole way takes at most a second and a half,
// and no single step moves more than a twentieth of the
// picture. Live progress still leads as it always has; the
// pacing only governs how the display catches up when the
// target leaps (a fast batch closing, a retired chip
// finishing, a panel opening on finished work).
const LOADER_FILL_STEPS = 20;

// The painting's base layer (Ben, 2026-11-22): the state of
// zero is not an empty grid. The frame (every edge cell) and
// the ground row the scene stands on (the interior of the
// third row from the bottom) are the picture's structure,
// and they are what a share of zero shows: 74 of the 256
// cells. They lead the fill order, and the paced fill
// completes the remaining cells from there.
function isBaseCell(x, y, width, height) {
  return (
    x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
    (y === height - 3 && x > 0 && x < width - 1)
  );
}
const ICON_BASE = ICON.reduce(
  (n, row, y) =>
    n + [...row].filter((ch, x) => isBaseCell(x, y, row.length, ICON.length)).length,
  0
);

let loaderBatch = null;

// A chip whose batch was replaced under it while its
// completion was still owed: the element stays in the
// corner for the rest of what it is owed, retired. What a
// finished chip is owed is the later of its minimum on
// screen, counted from its mount, and its settle hold,
// counted from its batch's close, plus its painting
// played out to whole. It is not a dead remnant: its
// painting plays out to whole on the fill step while it
// retires (a finished batch's picture completes as an
// animation, never a snap), its count and latency are its
// batch's final ones, and its tap still opens its own
// batch's panel. The incoming batch adopts the element on
// its mount frame (the usual case); the retirement timers
// only ever fire for a batch nothing adopted.
let retiredChip = null; // { view, batch, timer, fillTimer, gateElapsed }

// Promise-identity dedupe for the adapter: a promise with a
// live task already is that task, whoever asks again.
const trackedPromises = new Map();

function loaderReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The full boot is on screen while its element is in the page
// and not hidden: runFullBoot unhides it when it opens and
// removes it when it clears, so the element's state is the
// whole test, no bookkeeping of our own.
function loaderFullBootOnScreen() {
  const boot = document.querySelector("[data-boot]");
  return !!boot && !boot.hidden;
}

function openLoaderBatch(startedAt) {
  return {
    startedAt,
    tasks: [],
    closed: false,
    closedAt: null, // when the batch closed; the settle hold counts from here
    holdElapsed: false, // the settle hold has run out (removal also waits on the painting)
    latency: null,
    coveredByBoot: false,
    chipMountedAt: null, // when the chip appeared, for its minimum
    // The batch's one fill level: how many of the painting's
    // cells are lit. The chip and the panel are two views of
    // this single state, never two animations: each step
    // moves the level, and every view renders the level, so
    // the two paintings show the same cells at every moment.
    filled: 0,
    chip: null, // { el, icon, count, time, cells, rendered, owner }
    panel: null, // { el, icon, cells, rendered, head, count, time, lines, rows }
    fillTimer: null,
    holdTimer: null,
    watchTimer: null,
    spinTimer: null,
    spinFrame: 0,
  };
}

function batchCounts(batch) {
  let done = 0;
  let failed = 0;
  let settled = 0;
  for (const task of batch.tasks) {
    if (task.state === "done") {
      done += 1;
      settled += 1;
    } else if (task.state === "failed") {
      failed += 1;
      settled += 1;
    } else if (task.state === "expired") {
      settled += 1;
    }
  }
  return { done, failed, settled, total: batch.tasks.length };
}

// The rolled-up share: the mean of the tasks' fractions.
function batchShare(batch) {
  if (!batch.tasks.length) return 0;
  let sum = 0;
  for (const task of batch.tasks) sum += task.fraction;
  return sum / batch.tasks.length;
}

// The count both surfaces report: done/total, failures named
// when there are any. The chip and the panel's header alike
// stack it over the batch's measured latency, the latency
// line joining once the batch has closed; the two pieces
// never share a line. One source for the count, so the two
// surfaces can never disagree.
function countText(batch) {
  const { done, failed, total } = batchCounts(batch);
  let text = `${done}/${total}`;
  if (failed) text += ` · ${failed} failed`;
  return text;
}

// The batch a registration joins: the live one, a fresh one
// when the registry is idle, and a fresh one again when the
// previous batch has closed (the new work gets its own counts
// and its own latency; the finished chip, if its completion
// is still owed, stays up for the rest of it while its batch
// is replaced under it).
function currentLoaderBatch(startedAt) {
  let batch = loaderBatch;
  if (batch && batch.closed) {
    teardownLoaderBatch(batch, { keepChip: true });
    batch = null;
  }
  if (!batch) {
    batch = loaderBatch = openLoaderBatch(startedAt ?? performance.now());
  }
  return batch;
}

function addLoaderTask(batch, label, { timeout } = {}) {
  const task = {
    label: String(label),
    fraction: 0,
    statusText: null,
    state: "running", // running | done | failed | expired
    reason: null,
    timer: null,
    // The task's own clock, registration to settle: a completed
    // task that never set a status text reports this duration,
    // so every finished row reads the same way.
    startedAt: performance.now(),
    durationMs: null,
  };
  batch.tasks.push(task);
  if (typeof timeout === "number") {
    task.timer = setTimeout(
      () => settleLoaderTask(batch, task, "expired"),
      timeout
    );
  }
  renderLoader(batch);
  return task;
}

// First settle wins: a task that already ended keeps its
// ending, whatever its process reports afterwards.
function settleLoaderTask(batch, task, state, reason) {
  if (task.state !== "running") return;
  task.state = state;
  task.durationMs = Math.round(performance.now() - task.startedAt);
  if (state === "done") task.fraction = 1;
  if (state === "failed") task.reason = reason ? String(reason) : null;
  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }
  const { settled, total } = batchCounts(batch);
  if (settled >= total) closeLoaderBatch(batch);
  else renderLoader(batch);
}

// The handle a process reports through. update() takes the
// caller's own fraction, 0 to 1, and may move it backwards:
// the aggregate is recomputed from the reports, so a revert
// shows. status() sets the task's own line of text, the one
// the expanded panel shows beside its label. complete() and
// fail() end the task; reports after the ending are ignored.
function taskHandle(batch, task) {
  return {
    update(fraction) {
      if (task.state !== "running") return;
      const n = Number(fraction);
      if (!Number.isFinite(n)) return;
      task.fraction = Math.min(1, Math.max(0, n));
      renderLoader(batch);
    },
    status(text) {
      if (task.state !== "running") return;
      task.statusText = text == null ? null : String(text);
      renderLoader(batch);
    },
    complete() {
      settleLoaderTask(batch, task, "done");
    },
    fail(reason) {
      settleLoaderTask(batch, task, "failed", reason);
    },
  };
}

// Register a process with the loader and get its handle. The
// loader does not run the process; it reports what the handle
// is told. Options: startedAt seeds the batch's zero when this
// registration opens the batch (the boot passes the page's own
// zero, so the batch latency measures the page's startup, not
// this call); timeout is the safety valve, a task that hangs
// past it stops holding the batch, counted settled but
// neither done nor failed, while the work itself carries on.
export function registerTask(label, { startedAt, timeout } = {}) {
  const batch = currentLoaderBatch(startedAt);
  const task = addLoaderTask(batch, label, { timeout });
  deferSpinnerMount(batch);
  return taskHandle(batch, task);
}

// The adapter for callers who already hold a promise: the
// boot's task list above all. It never starts, drives, or
// cancels the work; it wraps a promise the caller already
// created and controls, and reports its settling as a task
// (done on resolve, failed on reject). Registering the same
// promise twice counts it once. Returns the promise, so
// callers can chain off the call if they want to.
export function trackWork(promise, { label = "task", startedAt, timeout } = {}) {
  const work = Promise.resolve(promise);
  const existing = trackedPromises.get(work);
  if (existing && existing.task.state === "running") return work;
  const batch = currentLoaderBatch(startedAt);
  const task = addLoaderTask(batch, label, { timeout });
  trackedPromises.set(work, { batch, task });
  deferSpinnerMount(batch);
  work.then(
    () => {
      trackedPromises.delete(work);
      settleLoaderTask(batch, task, "done");
    },
    () => {
      trackedPromises.delete(work);
      settleLoaderTask(batch, task, "failed");
    }
  );
  return work;
}

// The icon's cells, pre-built detached in grid order and then
// shuffled with the boot fill's seed, so both loader icons fill
// in the same scrambled order the full boot's picture does.
// The base layer leads the order (its cells keep their
// shuffled sequence among themselves, and so do the rest),
// so the fill builds the frame and the ground row first and
// the scene completes on top of them.
function buildIconCells(cellClass, size, pad = 0) {
  const cells = [];
  ICON.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cell = document.createElement("span");
      cell.className = `${cellClass} ${ICON_SHADE[ch]}`;
      cell.style.left = `${pad + x * size}px`;
      cell.style.top = `${pad + y * size}px`;
      cells.push({
        cell,
        base: isBaseCell(x, y, row.length, ICON.length),
      });
    });
  });
  const rng = mulberry32(20261122);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return [
    ...cells.filter((c) => c.base),
    ...cells.filter((c) => !c.base),
  ].map((c) => c.cell);
}

function loaderSpan(className, text) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function buildSpinner(batch) {
  const root = document.createElement("div");
  root.className = "boot-spin";
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", "Show loading details");

  const icon = document.createElement("span");
  icon.className = "boot-spin__icon";
  const cells = buildIconCells("boot-spin__cell", SPINNER_CELL, SPINNER_PAD);

  // The stack under the picture: the count on its own line,
  // and the latency line below it, hidden until the batch
  // closes and there is a measured latency to put on it.
  const count = loaderSpan("boot-spin__count", countText(batch));
  const time = loaderSpan("boot-spin__time", "");
  time.hidden = true;

  root.append(icon, count, time);
  document.body.append(root);
  // The tap follows the view's owner, not the batch that
  // happened to build the element: a retired chip speaks for
  // the batch it shows, and an adopted chip speaks for the
  // batch that adopted it. The element in the corner is
  // never a dead one.
  const view = { el: root, icon, count, time, cells, rendered: 0, owner: batch };
  root.addEventListener("click", () => toggleLoaderPanel(view.owner));
  batch.chip = view;
  batch.chipMountedAt = performance.now();
  batch.fillTimer = setInterval(() => stepLoaderFill(batch), 75);
  stepLoaderFill(batch);
}

// The incoming batch takes over a retired chip's element
// instead of mounting a second one or waiting behind it:
// the corner keeps exactly one chip, and from the adoption
// it reports the new batch. The count is the new batch's,
// the latency line hides until the new batch closes and has
// one of its own, the painting keeps the cells it has and
// steps from there toward the new batch's share, in
// whichever direction that lies (the display moves on the
// step, never in a snap), and the tap opens the new batch's
// panel. The minimum runs from the adoption, so the element
// serves at least a second in the new batch's name too:
// adoption only ever lengthens the surface's stay in the
// corner, never shortens it.
function adoptSpinner(batch) {
  const { view } = retiredChip;
  clearTimeout(retiredChip.timer);
  if (retiredChip.fillTimer) clearInterval(retiredChip.fillTimer);
  retiredChip = null;
  view.owner = batch;
  batch.chip = view;
  batch.chipMountedAt = performance.now();
  // The new batch's fill level starts where the painting
  // actually is: the element keeps the cells it has, and
  // the level steps from there toward the new batch's
  // share, in whichever direction that lies.
  batch.filled = view.rendered;
  view.count.textContent = countText(batch);
  view.time.textContent = "";
  view.time.hidden = true;
  batch.fillTimer = setInterval(() => stepLoaderFill(batch), 75);
  stepLoaderFill(batch);
}

// Render one painting's element at the batch's fill level:
// append or remove whole cells until the element shows
// exactly the level's first cells, in the fill order. A
// cell is either there, fully coloured, or not there, and
// a level stepping down takes its last-filled cells back
// in the order they came. Nothing slides and nothing
// fades. The view's own count is only how much of the
// level it has rendered so far, never a state of its own.
function syncIconView(view, filled) {
  if (!view) return;
  while (view.rendered < filled) {
    view.icon.append(view.cells[view.rendered]);
    view.rendered += 1;
  }
  while (view.rendered > filled) {
    const last = view.icon.children[view.icon.children.length - 1];
    if (last) last.remove();
    view.rendered -= 1;
  }
}

// Every painting a batch currently has: the chip's view
// (the live chip, or the retired chip still in the corner
// showing this batch), and the panel's, when it is open.
function batchIconViews(batch) {
  const views = [];
  if (batch.chip) views.push(batch.chip);
  if (
    retiredChip &&
    retiredChip.batch === batch &&
    retiredChip.view !== batch.chip
  ) {
    views.push(retiredChip.view);
  }
  if (batch.panel) views.push(batch.panel);
  return views;
}

// Step the batch's one fill level toward the target, a
// batch of cells per tick at the loader's pacing
// (LOADER_FILL_STEPS), in whichever direction the target
// lies, then render the level on every painting the batch
// has. The chip and the panel are one picture at two
// sizes: they show the same cells at every moment by
// construction, not by two animations kept in step.
function stepBatchFill(batch, target) {
  const perStep = Math.ceil(ICON_TOTAL / LOADER_FILL_STEPS);
  if (batch.filled < target) {
    batch.filled = Math.min(target, batch.filled + perStep);
  } else if (batch.filled > target) {
    batch.filled = Math.max(target, batch.filled - perStep);
  }
  for (const view of batchIconViews(batch)) {
    syncIconView(view, batch.filled);
  }
}

function stepLoaderFill(batch) {
  // A running batch's target is its share of the scene above
  // the base layer: at a share of zero the painting is the
  // base layer itself, never an empty grid, and the fill
  // completes the rest as the share grows. A closed batch's
  // target is the whole picture.
  const target = batch.closed
    ? ICON_TOTAL
    : ICON_BASE + Math.round(batchShare(batch) * (ICON_TOTAL - ICON_BASE));
  stepBatchFill(batch, target);
  if (batch.closed && batch.filled >= ICON_TOTAL && batch.fillTimer) {
    clearInterval(batch.fillTimer);
    batch.fillTimer = null;
  }
  maybeFinishClosedBatch(batch);
}

// A closed batch's chip leaves when both halves are done:
// its hold has run out, and its painting has played out to
// whole on the fill step. Whichever half lands last calls
// this. On the retimed pacing a fast batch's play-out runs
// past its hold (up to a second and a half from the mount),
// so the hold alone no longer removes it; the two waits are
// a maximum, never a sum, so nothing is stacked. While the
// panel is open the batch stays, as it always has:
// collapsing the panel ends it through teardown.
function maybeFinishClosedBatch(batch) {
  if (!batch.closed || !batch.holdElapsed || batch.panel) return;
  if (batch.chip && batch.filled < ICON_TOTAL) return;
  teardownLoaderBatch(batch);
}

// The mount decision is deferred a frame: work that has
// already settled closes its batch before the surface ever
// appears, so handing over finished work never flashes the
// spinner. Real work is never settled a frame later, and
// mounts on the frame.
function deferSpinnerMount(batch) {
  requestAnimationFrame(() => {
    if (loaderBatch === batch && !batch.closed) ensureSpinner(batch);
  });
}

// Mount the spinner unless a suppression holds. While the full
// boot holds the screen, a slow watcher checks for it clearing:
// a batch may outlive the screen (a task the boot timed out on
// is still real work), and the spinner is its surface from then
// on.
function ensureSpinner(batch) {
  if (batch.chip || loaderReducedMotion()) return;
  if (loaderFullBootOnScreen()) {
    batch.coveredByBoot = true;
    if (!batch.watchTimer) {
      batch.watchTimer = setInterval(() => {
        if (loaderBatch !== batch || batch.closed) {
          clearInterval(batch.watchTimer);
          batch.watchTimer = null;
        } else if (!loaderFullBootOnScreen()) {
          clearInterval(batch.watchTimer);
          batch.watchTimer = null;
          ensureSpinner(batch);
        }
      }, 250);
    }
    return;
  }
  if (retiredChip) {
    // A retired chip is serving the rest of its second in
    // the corner. This batch adopts its element rather than
    // stacking a second chip on top of it or waiting behind
    // it, unless the retired batch's panel is open and the
    // visitor is reading it: then this chip waits for the
    // corner to clear, on a short poll, and mounts fresh.
    if (!retiredChip.batch.panel) {
      adoptSpinner(batch);
      return;
    }
    if (!batch.watchTimer) {
      batch.watchTimer = setInterval(() => {
        if (loaderBatch !== batch || batch.closed) {
          clearInterval(batch.watchTimer);
          batch.watchTimer = null;
        } else if (!retiredChip) {
          clearInterval(batch.watchTimer);
          batch.watchTimer = null;
          ensureSpinner(batch);
        }
      }, 100);
    }
    return;
  }
  buildSpinner(batch);
}

// Every report lands here: the chip's count follows the
// roll-up while the batch runs, and the panel, when it is
// open, redraws its rows from the same state.
function renderLoader(batch) {
  if (batch.chip && !batch.closed) {
    batch.chip.count.textContent = countText(batch);
  }
  if (batch.panel) renderLoaderPanel(batch);
}

// A retired chip leaves the corner when both halves of its
// retirement are done: the time it was owed has run out,
// and its painting has played out to whole on the fill
// step. Whichever half lands last calls this. While the
// retired batch's panel is open the chip stays, as it
// always has: collapsing the panel removes the chip with
// its batch, through teardown.
function finishRetiredChip(retired) {
  if (retiredChip !== retired) return;
  if (!retired.gateElapsed || retired.batch.filled < ICON_TOTAL) return;
  if (retired.batch.panel) return;
  if (retired.fillTimer) clearInterval(retired.fillTimer);
  retired.view.el.remove();
  retiredChip = null;
}

function teardownLoaderBatch(batch, { keepChip = false } = {}) {
  // Every timer field is nulled as it is cleared, not just
  // stopped: a retired batch lives on past its teardown (its
  // chip stays in the corner, its panel can still open), and
  // buildLoaderPanel reads a null fillTimer as "no stepper
  // running" and restarts one for the panel's painting. A
  // stale handle left here once kept that restart from ever
  // firing, so a retired batch's panel opened with its
  // painting blank and no step ever painted it.
  if (batch.fillTimer) clearInterval(batch.fillTimer);
  batch.fillTimer = null;
  if (batch.watchTimer) clearInterval(batch.watchTimer);
  batch.watchTimer = null;
  if (batch.holdTimer) clearTimeout(batch.holdTimer);
  batch.holdTimer = null;
  if (batch.spinTimer) clearInterval(batch.spinTimer);
  batch.spinTimer = null;
  if (batch.panel) {
    batch.panel.el.remove();
    batch.panel = null;
    document.removeEventListener("pointerdown", onLoaderOutsideTap);
  }
  if (retiredChip && retiredChip.batch === batch) {
    // This batch's chip was retired under it earlier and is
    // still in the corner (the path here is its panel being
    // collapsed, the one teardown a retired batch can get):
    // the element goes with its batch.
    clearTimeout(retiredChip.timer);
    if (retiredChip.fillTimer) clearInterval(retiredChip.fillTimer);
    retiredChip.view.el.remove();
    retiredChip = null;
  }
  if (batch.chip) {
    const view = batch.chip;
    batch.chip = null;
    // A chip replaced while its completion is still owed
    // (keepChip, the currentLoaderBatch path: the batch
    // here has always closed) retires: it stays on screen,
    // finished, not frozen, until what it is owed has run.
    // What it is owed is the later of its minimum on
    // screen, counted from its mount, and its settle hold,
    // counted from the close; its painting plays out to
    // whole across that time on the retirement's own step,
    // and the chip leaves only once both are done. The
    // gate was once the minimum alone, so a batch that
    // closed after its chip's first second (a long render,
    // above all: the music pipeline's next step always
    // registers after the step before it has closed its
    // batch, deep inside the hold) had its finished chip
    // removed in one step by that registration, and the
    // corner never showed the completion at all. Its
    // painting plays out to whole on the fill's own step:
    // the batch's fill timer was cleared above, so a
    // timer of the retirement's own walks the remaining
    // cells in, a step a tick, the way every fill on the
    // site moves. A finished batch's picture completes;
    // it never snaps to whole. Its count and latency are
    // already its final ones, and its tap still opens its
    // own batch's panel. The chip leaves once its owed
    // time is up AND the picture is whole, whichever
    // lands last (finishRetiredChip). Every other removal
    // (the hold expiring on an unreplaced batch, the
    // visitor collapsing the panel) takes the chip in one
    // step, as it always has.
    const now = performance.now();
    const owedUntil = Math.max(
      batch.chipMountedAt == null
        ? 0
        : batch.chipMountedAt + SPINNER_MIN_MS,
      batch.closedAt == null ? 0 : batch.closedAt + SPINNER_HOLD_MS
    );
    if (keepChip && owedUntil > now) {
      const retired = {
        view,
        batch,
        timer: null,
        fillTimer: null,
        gateElapsed: false,
      };
      retiredChip = retired;
      // The retirement steps the batch's own level, like
      // every other fill: the retired chip's painting, and
      // its panel's when the panel is opened from it, are
      // the one state rendered at two sizes.
      stepBatchFill(batch, ICON_TOTAL);
      retired.fillTimer = setInterval(() => {
        stepBatchFill(batch, ICON_TOTAL);
        if (batch.filled >= ICON_TOTAL) {
          clearInterval(retired.fillTimer);
          retired.fillTimer = null;
          finishRetiredChip(retired);
        }
      }, 75);
      retired.timer = setTimeout(() => {
        retired.timer = null;
        retired.gateElapsed = true;
        finishRetiredChip(retired);
      }, Math.max(0, owedUntil - now));
    } else {
      view.el.remove();
    }
  }
  if (loaderBatch === batch) loaderBatch = null;
}

function closeLoaderBatch(batch) {
  batch.closed = true;
  batch.closedAt = performance.now();
  batch.latency = Math.round(batch.closedAt - batch.startedAt);
  if (!batch.chip) {
    // Never mounted. An instant batch (work already settled
    // when it registered) has nothing worth reporting on a
    // surface that never appeared, and a batch the full boot
    // covered start to finish was already reported by the boot's
    // own log. The one case worth a surface: work the boot
    // covered that outlived the screen and closed after it
    // cleared. It gets a completion-only mount, because the
    // work it reports is done; its picture still fills in on
    // the fill step, the way a watched batch's does, so the
    // painting is seen loading in even though the work is
    // already finished. The chip's own fill timer (started
    // by buildSpinner) walks it to whole and stops there.
    // A retired chip still serving its minimum also bars the
    // mount: the corner is occupied until its second is up.
    if (
      !batch.coveredByBoot ||
      loaderReducedMotion() ||
      loaderFullBootOnScreen() ||
      retiredChip
    ) {
      teardownLoaderBatch(batch);
      return;
    }
    buildSpinner(batch);
  }
  batch.chip.count.textContent = countText(batch);
  batch.chip.time.textContent = `${batch.latency} ms`;
  batch.chip.time.hidden = false;
  if (batch.panel) renderLoaderPanel(batch);
  updatePanelSpin(batch);
  // The hold runs only against the chip alone: a batch whose
  // panel is open stays up until the panel is collapsed. The
  // hold expiring is one half of the removal; the other is
  // the painting reaching whole, and whichever lands last
  // finishes the batch (maybeFinishClosedBatch).
  if (!batch.panel) {
    batch.holdTimer = setTimeout(() => {
      batch.holdElapsed = true;
      maybeFinishClosedBatch(batch);
    }, SPINNER_HOLD_MS);
  }
}

// ----------------------------------------------------------------
// The expanded panel: the boot screen's view of the registry's
// current batch. The chip is the summary; tapping it opens
// the full picture: a header row carrying the framed
// painting at the left, filling in the boot's stepped style
// over the batch, with the count and its latency stacked at
// the painting's right (the chip's two lines in the chip's
// own arrangement beside the picture, each on its own fitted
// backing, never combined), then one line per task in the
// boot log's own shape: the name, a dotted leader, and the
// value at the right edge. No progress bar: the painting's
// fill is the progress, as it is on the boot screen. The
// panel holds no state of its own; every render rebuilds
// its lines from the batch, and its painting renders the
// batch's one fill level, so what it shows is the registry
// as it stands, the chip's picture at the boot's size.
// ----------------------------------------------------------------

function toggleLoaderPanel(batch) {
  // The live batch, or the retired batch whose chip is still
  // in the corner showing it: either one's tap is real.
  if (loaderBatch !== batch && (!retiredChip || retiredChip.batch !== batch)) {
    return;
  }
  if (batch.panel) {
    destroyLoaderPanel(batch);
    return;
  }
  // The full boot is the surface while it is up, and a
  // reduced-motion load has no surface at all: the panel
  // opens under neither, exactly like the chip.
  if (loaderReducedMotion() || loaderFullBootOnScreen()) return;
  buildLoaderPanel(batch);
}

function elContains(root, node) {
  for (let n = node; n; n = n.parentNode || n.parent || null) {
    if (n === root) return true;
  }
  return false;
}

function onLoaderOutsideTap(event) {
  // The panel in the page belongs to the live batch, or to
  // the retired batch whose chip is still in the corner.
  const batch =
    retiredChip && retiredChip.batch.panel ? retiredChip.batch : loaderBatch;
  if (!batch || !batch.panel) return;
  if (batch.panel.el && elContains(batch.panel.el, event.target)) return;
  const chipEl = batch.chip
    ? batch.chip.el
    : retiredChip && retiredChip.batch === batch
      ? retiredChip.view.el
      : null;
  if (chipEl && elContains(chipEl, event.target)) return;
  destroyLoaderPanel(batch);
}

function buildLoaderPanel(batch) {
  // Opening the panel during the completion hold keeps the
  // batch up past it: the hold resumes its meaning only when
  // the panel collapses again.
  if (batch.holdTimer) {
    clearTimeout(batch.holdTimer);
    batch.holdTimer = null;
  }
  const root = document.createElement("div");
  root.className = "boot-panel";

  // The header row: the painting at the left, the boot
  // screen's own at its own size, and the figures at its
  // right. The painting is the chip's picture at the larger
  // size, not a second animation: it renders the batch's
  // one fill level, so it opens on exactly the cells the
  // chip is showing at that instant and steps with it.
  const icon = document.createElement("span");
  icon.className = "boot-panel__icon";
  const cells = buildIconCells("boot__cell", PANEL_CELL);

  const head = document.createElement("div");
  head.className = "boot-panel__head";
  // The figures are the chip's two lines in the same shape:
  // the count, and the latency under it once the batch has
  // closed, each on its own fitted backing.
  const headCount = loaderSpan("boot-panel__count", countText(batch));
  const headTime = loaderSpan("boot-panel__time", "");
  headTime.hidden = true;
  head.append(headCount, headTime);

  const header = document.createElement("div");
  header.className = "boot-panel__header";
  header.append(icon, head);

  const lines = document.createElement("div");
  lines.className = "boot-panel__lines";

  root.append(header, lines);
  document.body.append(root);
  batch.panel = {
    el: root, icon, cells, rendered: 0,
    head, count: headCount, time: headTime, lines,
    rows: new Map(),
  };
  // The panel's painting opens on the batch's level as it
  // stands, the chip's exact cells at this instant.
  syncIconView(batch.panel, batch.filled);
  // The batch's fill timer does the stepping while it runs,
  // and a retired batch's retirement timer steps the same
  // level. A batch with neither running and its painting
  // short of whole (its chip filled and stopped the timer,
  // the panel only opening now) gets the timer restarted
  // for the panel's sake, and stepLoaderFill stops it
  // again once the picture is whole.
  if (
    !batch.fillTimer &&
    batch.filled < ICON_TOTAL &&
    !(retiredChip && retiredChip.batch === batch)
  ) {
    batch.fillTimer = setInterval(() => stepLoaderFill(batch), 75);
    stepLoaderFill(batch);
  }
  for (const task of batch.tasks) addPanelTask(batch, task);
  document.addEventListener("pointerdown", onLoaderOutsideTap);
  renderLoaderPanel(batch);
}

// One task's line, added when the panel opens and whenever
// a task registers while it is open: the panel is a view of
// the registry, not a snapshot of it. The line is the boot
// log's own: mark, name, a dotted leader, and the value.
function addPanelTask(batch, task) {
  const panel = batch.panel;
  const row = document.createElement("div");
  row.className = "boot-panel__line";
  const mark = loaderSpan("boot-panel__mark", SPINNER[batch.spinFrame]);
  const label = loaderSpan("boot-panel__task", task.label);
  const dots = loaderSpan("boot-panel__dots", ".".repeat(80));
  const status = loaderSpan("boot-panel__status", "");
  row.append(mark, label, dots, status);
  panel.lines.append(row);
  panel.rows.set(task, { row, mark, status });
}

// The one status rule every row follows: a status text the
// task set wins; a completed task without one shows its own
// measured duration; a running task shows its status text or
// its share; a failed task shows its reason; a task the
// timeout valve released shows that its work is still going.
function taskStatusText(task) {
  if (task.state === "running") {
    return task.statusText ?? `${Math.round(task.fraction * 100)}%`;
  }
  if (task.state === "failed") return task.reason || "failed";
  if (task.state === "expired") return task.statusText ?? "still working";
  return task.statusText ?? `${task.durationMs} ms`;
}

function renderLoaderPanel(batch) {
  const panel = batch.panel;
  if (!panel) return;
  for (const task of batch.tasks) {
    if (!panel.rows.has(task)) addPanelTask(batch, task);
  }
  for (const task of batch.tasks) {
    const { mark, status } = panel.rows.get(task);
    if (task.state === "done") mark.textContent = "✓";
    else if (task.state === "failed") mark.textContent = "×";
    else if (task.state === "expired") mark.textContent = "!";
    else mark.textContent = SPINNER[batch.spinFrame % SPINNER.length];
    status.textContent = taskStatusText(task);
  }
  panel.count.textContent = countText(batch);
  panel.time.textContent = batch.closed ? `${batch.latency} ms` : "";
  panel.time.hidden = !batch.closed;
  updatePanelSpin(batch);
}

// The panel's marks turn while any of its tasks is running,
// on the boot spinner's own 80 ms step; the timer lives only
// while the panel does.
function updatePanelSpin(batch) {
  const anyRunning = batch.tasks.some((t) => t.state === "running");
  if (batch.panel && anyRunning && !batch.spinTimer) {
    batch.spinTimer = setInterval(() => {
      batch.spinFrame = (batch.spinFrame + 1) % SPINNER.length;
      renderLoaderPanel(batch);
    }, 80);
  } else if ((!batch.panel || !anyRunning) && batch.spinTimer) {
    clearInterval(batch.spinTimer);
    batch.spinTimer = null;
  }
}

function destroyLoaderPanel(batch) {
  if (!batch.panel) return;
  batch.panel.el.remove();
  batch.panel = null;
  document.removeEventListener("pointerdown", onLoaderOutsideTap);
  updatePanelSpin(batch);
  // Collapsing a closed batch ends it in one step: its hold
  // was suspended for as long as the panel was open.
  if (batch.closed) teardownLoaderBatch(batch);
}
// The home page, for the boot rule that is its alone: the
// site root, served as the directory itself or as index.html.
function isHomePage() {
  const path = window.location.pathname || "";
  return path === "/" || path.endsWith("/index.html");
}

// A full boot keeps the page behind the screen until the
// screen clears, on every page, the way the boot worked
// before it moved into the flow: runBoot marks the document,
// and this watcher lifts the mark when the boot element goes,
// on the same 250 ms poll the spinner's boot watcher uses.
// The mark is a data attribute the stylesheet keys on; the
// boot element itself is untouched.
function watchBootHide() {
  const timer = setInterval(() => {
    if (!loaderFullBootOnScreen()) {
      clearInterval(timer);
      delete document.documentElement.dataset.bootHide;
    }
  }, 250);
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
  const home = isHomePage();
  const surface = decideBootSurface({
    experimental,
    reducedMotion,
    sessionSeen: experimental ? false : sessionBootSeen(),
    home,
  });

  if (surface === "none" || tasks.length === 0) return surface;

  if (surface === "full") {
    // The flag is written as the screen opens, so a load that
    // never shows it does not spend it, and a fresh tab or session
    // sees it again. Badge pages never write it.
    if (!experimental) markSessionBootSeen();
    // Every full boot presents as a covering screen, not a
    // block above visible content: the document is marked
    // before the screen opens, so the page stays hidden
    // behind it, and the mark lifts when the screen clears.
    document.documentElement.dataset.bootHide = "";
    if (runFullBoot(tasks)) {
      watchBootHide();
      return surface;
    }
    delete document.documentElement.dataset.bootHide;
    // A page with no boot screen in its markup gets the small
    // surface instead of nothing.
  }

  // The follow-up surface is the loader's spinner: the page's
  // tasks register with the registry like any other async work,
  // through the handle API, seeded with the page's own zero so
  // the batch latency the spinner reports measures the page's
  // real startup. Each task keeps the boot's timeout as its
  // safety valve. A settled task's formatted value becomes its
  // final status text, so the loader's expanded log carries
  // the same durations the full boot's lines would have.
  //
  // A task marked selfReports is the one exception: its work
  // registers itself with the loader where it runs (the music
  // modules' own wiring), under its own specific label, so
  // registering it here as well would put the same work in
  // the batch twice, once under each name. The full boot
  // above still lists it; only this second registration is
  // skipped, and the batch shows the work exactly once.
  for (const task of tasks) {
    if (task.selfReports) continue;
    const work = registerTask(task.label, {
      startedAt: t0,
      timeout: TASK_TIMEOUT,
    });
    Promise.resolve(task.promise).then(
      (value) => {
        try {
          work.status(task.format(value));
        } catch {
          // A format that throws costs the line its value,
          // never the task its completion.
        }
        work.complete();
      },
      () => work.fail()
    );
  }
  return "indicator";
}
