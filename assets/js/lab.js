// The commit graph in $ lab, drawn under the site's pixel rule, same as
// the hiring sparkle and the wordmark: every cell sits on a fixed grid
// and only ever lights or goes dark in place. Nothing moves, nothing
// fades, and there is no transition to smooth a change over. Time runs
// on the site's own clock: one cell per 75ms tick (--motion-step), so a
// whole graph step takes as many ticks as it has cells.
//
// The graph tells one small story twice. A feature branch leaves main,
// takes two commits, and merges back. Then an agent branch does the
// same. Branch cheap, merge deliberate, history readable at the end:
// that is the shape Code Forge has to keep true at scale.

const COLS = 36;
const ROWS = 7;

// Lanes, counted from the top of the grid.
const AGENT = 1;
const MAIN = 3;
const FEATURE = 5;

// A horizontal run of edge cells, endpoints excluded: the caller names
// the nodes, this fills the line between them.
function edge(xFrom, xTo, y) {
  const cells = [];
  for (let x = xFrom; x <= xTo; x++) cells.push([x, y, "edge"]);
  return cells;
}

function node(x, y) {
  return [[x, y, "node"]];
}

// Each step lights in the order its cells are listed, left to right, so
// a line appears to be drawn by the grid itself rather than switched on
// all at once. The label is what the status line says while it happens.
const STEPS = [
  { label: "commit: main", cells: node(2, MAIN) },
  { label: "commit: main", cells: [...edge(3, 5, MAIN), ...node(6, MAIN)] },
  {
    label: "branch: feature, from main",
    cells: [
      [7, 4, "edge"],
      [8, FEATURE, "edge"],
      [9, FEATURE, "edge"],
      ...node(10, FEATURE),
    ],
  },
  { label: "commit: feature", cells: [...edge(11, 13, FEATURE), ...node(14, FEATURE)] },
  { label: "commit: main, in parallel", cells: [...edge(7, 10, MAIN), ...node(11, MAIN)] },
  { label: "commit: feature", cells: [...edge(15, 17, FEATURE), ...node(18, FEATURE)] },
  {
    label: "merge: feature into main",
    cells: [
      ...edge(12, 18, MAIN),
      [19, 4, "edge"],
      [20, 4, "edge"],
      [21, MAIN, "edge"],
      ...node(22, MAIN),
    ],
  },
  {
    label: "branch: agent, from main",
    cells: [
      [23, 2, "edge"],
      [24, AGENT, "edge"],
      [25, AGENT, "edge"],
      ...node(26, AGENT),
    ],
  },
  { label: "commit: agent", cells: [...edge(27, 29, AGENT), ...node(30, AGENT)] },
  {
    label: "merge: agent into main",
    cells: [
      ...edge(23, 30, MAIN),
      [31, 2, "edge"],
      [32, MAIN, "edge"],
      ...node(33, MAIN),
    ],
  },
];

function setUpLab() {
  const root = document.querySelector("[data-lab]");
  if (!root) return;

  const graph = root.querySelector("[data-lab-graph]");
  const status = root.querySelector("[data-lab-status]");
  const playButton = root.querySelector("[data-lab-play]");
  const stepButton = root.querySelector("[data-lab-step]");
  const restartButton = root.querySelector("[data-lab-restart]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Build the grid. Only cells the graph uses get an element; the track
  // template fixes all 36 by 7 positions whether a cell exists or not,
  // so an unlit stretch of lane is still visibly on the same grid.
  const cellEls = new Map();
  for (const step of STEPS) {
    for (const [x, y, kind] of step.cells) {
      const key = `${x},${y}`;
      if (cellEls.has(key)) continue;
      const el = document.createElement("span");
      el.className = `lab__cell lab__cell--${kind}`;
      el.style.gridColumn = String(x + 1);
      el.style.gridRow = String(y + 1);
      graph.append(el);
      cellEls.set(key, el);
    }
  }

  let stepIndex = 0; // graph steps lit so far
  let timer = 0;
  let playing = false;

  function say(text) {
    status.textContent = text;
  }

  function lightStep(index) {
    for (const [x, y] of STEPS[index].cells) {
      cellEls.get(`${x},${y}`)?.classList.add("is-lit");
    }
  }

  function finish() {
    playing = false;
    playButton.textContent = "play";
    say(`step ${STEPS.length}/${STEPS.length}: done. Two branches, two merges, one history.`);
  }

  // Play walks cell by cell at the 75ms tick, in listed order, and
  // pauses on each step's label long enough to read it. A step with n
  // cells takes n ticks to draw, then holds for four more.
  function play() {
    if (playing) {
      pause();
      return;
    }
    if (stepIndex >= STEPS.length) restart();
    playing = true;
    playButton.textContent = "pause";

    let cellIndex = 0;
    let hold = 0;

    function tick() {
      if (!playing) return;
      const step = STEPS[stepIndex];
      if (cellIndex < step.cells.length) {
        const [x, y] = step.cells[cellIndex];
        cellEls.get(`${x},${y}`)?.classList.add("is-lit");
        cellIndex += 1;
        say(`step ${stepIndex + 1}/${STEPS.length}: ${step.label}`);
        timer = setTimeout(tick, 75);
      } else if (hold < 4) {
        hold += 1;
        timer = setTimeout(tick, 75);
      } else {
        stepIndex += 1;
        cellIndex = 0;
        hold = 0;
        if (stepIndex >= STEPS.length) {
          finish();
          return;
        }
        timer = setTimeout(tick, 75);
      }
    }
    tick();
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    playButton.textContent = "play";
    if (stepIndex < STEPS.length) {
      say(`paused at step ${stepIndex + 1}/${STEPS.length}: ${STEPS[stepIndex].label}`);
    }
  }

  function stepOnce() {
    if (playing) pause();
    if (stepIndex >= STEPS.length) return;
    lightStep(stepIndex);
    say(`step ${stepIndex + 1}/${STEPS.length}: ${STEPS[stepIndex].label}`);
    stepIndex += 1;
    if (stepIndex >= STEPS.length) finish();
  }

  function restart() {
    if (playing) pause();
    for (const el of cellEls.values()) el.classList.remove("is-lit");
    stepIndex = 0;
    say("ready: press play");
  }

  // Reduced motion: no play-through at all. The full graph is simply
  // there, lit, the way the boot screen and the sparkle also stand
  // down, and the controls go away rather than offering a broken show.
  if (reduced.matches) {
    for (let i = 0; i < STEPS.length; i++) lightStep(i);
    stepIndex = STEPS.length;
    say("the full graph: two branches, two merges, one history.");
    root.querySelector(".lab__controls").hidden = true;
    return;
  }

  playButton.addEventListener("click", play);
  stepButton.addEventListener("click", stepOnce);
  restartButton.addEventListener("click", restart);

  // Start on its own the first time it scrolls into view, so a visitor
  // who never finds the controls still sees it happen once. After that
  // it is theirs: no loop, no replay unless they ask.
  const watcher = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        watcher.disconnect();
        if (!playing && stepIndex === 0) play();
      }
    },
    { rootMargin: "-30% 0px -30% 0px" }
  );
  watcher.observe(root);
}

setUpLab();
