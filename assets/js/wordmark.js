// The name, rasterized onto a coarse pixel grid in the site's own mono, the way
// a TUI would have to draw it. The lower rows dissolve, and the pixels that
// come loose drift free of the letterforms.

const TEXT = "BEN EMDON";
const FONT_STACK = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
const CELL = 4; // CSS pixels per grid cell
const ACCENT_SHARE = 0.14; // share of *dissolving* cells that take the accent
const MAX_MOTES = 48;

const EMPTY = 0;
const INK = 1;
const ACCENT = 2;

// Ordered thresholds, so the dissolve is a stable pattern rather than noise
// that reshuffles on every relayout.
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function toRgb(value) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  const hex = ctx.fillStyle;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Resolves a custom property to a real colour. Reading the property directly
// would hand back an unevaluated light-dark().
function resolve(host, property) {
  const probe = document.createElement("span");
  probe.style.color = `var(${property})`;
  probe.style.display = "none";
  host.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

export function createWordmark(canvas) {
  const host = canvas.parentElement;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  let cols = 0;
  let rows = 0;
  let cells = new Uint8Array(0);
  let motes = [];
  let palette = { ink: [0, 0, 0], paper: [255, 255, 255], accent: [0, 0, 0] };
  let frame = 0;

  function readPalette() {
    palette = {
      ink: toRgb(getComputedStyle(canvas).color),
      paper: toRgb(getComputedStyle(host).backgroundColor),
      accent: toRgb(resolve(host, "--accent-color")),
    };
  }

  function rasterize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return false;

    cols = Math.max(1, Math.round(box.width / CELL));
    rows = Math.max(1, Math.round(box.height / CELL));
    canvas.width = cols;
    canvas.height = rows;

    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cols, rows);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";

    // Fit by height, not width: filling the column would make the glyphs
    // taller than the box and clip their cap line.
    const size = rows * 0.85;
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    ctx.fillText(TEXT, 0, rows / 2);

    const lum = ctx.getImageData(0, 0, cols, rows).data;
    cells = new Uint8Array(cols * rows);

    // Find the vertical extent of the glyphs so the dissolve is measured
    // against the letterforms, not the box.
    let top = rows;
    let bottom = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (lum[(y * cols + x) * 4] > 110) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    const span = Math.max(1, bottom - top);

    for (let y = 0; y < rows; y += 1) {
      // 0 at the cap line, 1 at the baseline.
      const depth = (y - top) / span;
      // Only the last quarter thins out, and never below half density — the
      // name has to stay readable first and be an effect second.
      const dissolving = depth > 0.72;
      const keep = dissolving ? 1 - ((depth - 0.72) / 0.28) * 0.55 : 1;

      for (let x = 0; x < cols; x += 1) {
        if (lum[(y * cols + x) * 4] <= 110) continue;
        if ((BAYER_4[y % 4][x % 4] + 0.5) / 16 > keep) continue;
        cells[y * cols + x] =
          dissolving && Math.random() < ACCENT_SHARE ? ACCENT : INK;
      }
    }

    return true;
  }

  function spawn() {
    if (motes.length >= MAX_MOTES) return;

    // Seed from the sparse lower band, so motes look shed rather than added.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const x = Math.floor(Math.random() * cols);
      const y = Math.floor(rows * (0.6 + Math.random() * 0.4));
      if (cells[y * cols + x] === EMPTY) continue;

      motes.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.03 - Math.random() * 0.06,
        life: 90 + Math.random() * 120,
        kind: Math.random() < 0.35 ? ACCENT : INK,
      });
      return;
    }
  }

  function paint() {
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(cols, rows);
    const px = image.data;
    const { ink, paper, accent } = palette;

    for (let i = 0; i < cols * rows; i += 1) {
      const cell = cells[i];
      const [r, g, b] = cell === ACCENT ? accent : cell === INK ? ink : paper;
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
      px[i * 4 + 3] = 255;
    }

    for (const mote of motes) {
      const x = Math.round(mote.x);
      const y = Math.round(mote.y);
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const [r, g, b] = mote.kind === ACCENT ? accent : ink;
      const i = (y * cols + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
  }

  function tick() {
    frame += 1;
    if (frame % 4 === 0) spawn();

    motes = motes.filter((mote) => {
      mote.x += mote.vx;
      mote.y += mote.vy;
      mote.life -= 1;
      return mote.life > 0 && mote.y > -2 && mote.x > -2 && mote.x < cols + 2;
    });

    paint();
    if (!still.matches) requestAnimationFrame(tick);
  }

  const relayout = () => {
    if (!rasterize()) return;
    readPalette();
    motes = [];
    paint();
  };

  relayout();
  if (!still.matches) requestAnimationFrame(tick);

  // Webfonts land after first paint; without this the grid keeps a fallback
  // face's letterforms.
  if (document.fonts?.ready) document.fonts.ready.then(relayout);

  let pending;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(relayout);
  });

  return relayout;
}
