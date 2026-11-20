// Elsewhere star map experiment.
//
// A slim night strip under the $ elsewhere links: one star cluster per
// link, drawn on a fixed 11x11 grid. Hovering or focusing a link lights
// its cluster in place, centre-out, one whole-cell shade swap per 75ms
// tick (the site's --motion-step). Pixels never move and never fade.
// Hovering a cluster names its link in the caption line. The strip is
// decoration, aria-hidden in the markup; the links carry the meaning.
//
// Palette is data, five colours, all from the site's own tokens. The sky
// is the portrait's fixed --dither-ink, so the strip reads as night in
// both themes the way the portrait reads as a photo in both themes.
const PALETTE = {
  sky: "#0d1522",
  distant: "#33415a",
  rest: "#52637c",
  mid: "#6ea8e1",
  lit: "#a9cdf2",
};

// Shade per cell rank (1 body, 2 inner, 3 core) at each lighting stage.
// Rest is quiet, the core alone a step up. Lighting blooms centre-out:
// core peaks, inner warms, body warms. Unlighting runs it backwards.
const STAGES = [
  [null, "rest", "rest", "mid"],
  [null, "rest", "rest", "lit"],
  [null, "rest", "mid", "lit"],
  [null, "mid", "mid", "lit"],
];

const GRID = 11;
const CENTRE = 5;

// Shape builders return a Map of "x,y" to rank. Coordinates are worked
// out from the centre so diagonals step evenly and no line doubles up.
function buildCells(kind) {
  const cells = new Map();
  const put = (x, y, rank) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    const key = `${x},${y}`;
    if (!cells.has(key) || cells.get(key) < rank) cells.set(key, rank);
  };
  const rankByDist = (d) => (d === 0 ? 3 : d === 1 ? 2 : 1);

  if (kind === "cross") {
    // Four-point sparkle: long vertical, shorter horizontal.
    for (let y = 0; y < GRID; y++) put(CENTRE, y, rankByDist(Math.abs(y - CENTRE)));
    for (let x = CENTRE - 3; x <= CENTRE + 3; x++)
      put(x, CENTRE, rankByDist(Math.abs(x - CENTRE)));
  } else if (kind === "diamond") {
    // One diamond outline around a small core. An inner ring at d 2
    // touched the outline diagonally and read as dither, so it went.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const d = Math.abs(x - CENTRE) + Math.abs(y - CENTRE);
        if (d === 4) put(x, y, 1);
        if (d === 1) put(x, y, 2);
        if (d === 0) put(x, y, 3);
      }
    }
  } else if (kind === "arc") {
    // One stepped arc, ends raised, and a small star hanging below it.
    // A second inner ring thickened the crown until it read as a dome,
    // and legs down to the centre line kept the dome reading, so the arc
    // is a single ring ending a row above centre.
    const cy = 6;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const r = Math.round(Math.hypot(x - CENTRE, y - cy));
        if (y <= cy - 1 && r === 4) put(x, y, 1);
      }
    }
    put(CENTRE, cy + 2, 3);
    put(CENTRE, cy + 1, 2);
    put(CENTRE, cy + 3, 2);
    put(CENTRE - 1, cy + 2, 2);
    put(CENTRE + 1, cy + 2, 2);
  } else if (kind === "ring") {
    // Stepped circle with a filled core cluster.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const r = Math.round(Math.hypot(x - CENTRE, y - CENTRE));
        if (r === 4) put(x, y, 1);
      }
    }
    put(CENTRE, CENTRE, 3);
    put(CENTRE, CENTRE - 1, 2);
    put(CENTRE, CENTRE + 1, 2);
    put(CENTRE - 1, CENTRE, 2);
    put(CENTRE + 1, CENTRE, 2);
  }
  return cells;
}

// Distant specks per cluster, fixed spots away from every shape's cells.
// Deliberate details, named here in the anchor, not scattered noise.
const SPECKS = {
  cross: [[1, 1], [9, 2], [2, 9]],
  diamond: [[1, 2], [9, 9], [10, 1]],
  arc: [[1, 1], [10, 2], [9, 10]],
  ring: [[1, 9], [10, 1], [2, 2]],
};

const SHAPE_BY_KEY = {
  x: "cross",
  linkedin: "diamond",
  instagram: "arc",
  github: "ring",
};

const strip = document.querySelector("[data-starmap]");
const nav = document.querySelector(".links");

if (strip && nav) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sky = document.createElement("div");
  sky.className = "starmap__sky";
  const caption = document.createElement("p");
  caption.className = "starmap__caption";
  strip.append(sky, caption);

  const clusters = [];
  let timer = 0;

  function draw(cluster) {
    const { ctx, cells, specks, stage } = cluster;
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(0, 0, GRID, GRID);
    ctx.fillStyle = PALETTE.distant;
    for (const [x, y] of specks) {
      if (!cells.has(`${x},${y}`)) ctx.fillRect(x, y, 1, 1);
    }
    for (const [key, rank] of cells) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillStyle = PALETTE[STAGES[stage][rank]];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function step() {
    let settled = true;
    for (const cluster of clusters) {
      if (cluster.stage !== cluster.target) {
        cluster.stage += Math.sign(cluster.target - cluster.stage);
        draw(cluster);
        settled = false;
      }
    }
    if (settled) {
      clearInterval(timer);
      timer = 0;
    }
  }

  function setTarget(cluster, target) {
    cluster.target = target;
    if (reduced) return; // Rest shade only; the caption still answers.
    if (!timer) timer = setInterval(step, 75);
  }

  const links = [...nav.querySelectorAll("a")];
  links.forEach((link) => {
    const keyEl = link.querySelector(".links__key");
    const name = keyEl ? keyEl.textContent.trim().toLowerCase() : "";
    const kind = SHAPE_BY_KEY[name];
    if (!kind) return;

    const canvas = document.createElement("canvas");
    canvas.width = GRID;
    canvas.height = GRID;
    canvas.className = "starmap__cluster";
    sky.append(canvas);

    const cluster = {
      ctx: canvas.getContext("2d"),
      cells: buildCells(kind),
      specks: SPECKS[kind],
      stage: 0,
      target: 0,
    };
    clusters.push(cluster);
    draw(cluster);

    const on = () => {
      caption.textContent = name;
      setTarget(cluster, STAGES.length - 1);
    };
    const off = () => {
      if (caption.textContent === name) caption.textContent = "";
      setTarget(cluster, 0);
    };
    link.addEventListener("pointerenter", on);
    link.addEventListener("pointerleave", off);
    link.addEventListener("focus", on);
    link.addEventListener("blur", off);
    canvas.addEventListener("pointerenter", on);
    canvas.addEventListener("pointerleave", off);
  });
}
