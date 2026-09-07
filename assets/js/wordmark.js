// The name, rasterized onto a coarse pixel grid in a heavy grotesque and
// filled solid in the accent colour — the way a low-res display would have
// to draw a logo. No dither, no animation: clean and legible first.

const TEXT = "BEN EMDON";
// A grotesque black, not the site's mono: at this resolution JetBrains Mono's
// curves and diagonals broke up into noise, while a heavy square-cut face
// like this one survives as flat, blocky strokes.
const FONT_STACK = `"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif`;
const CELL = 4; // CSS pixels per grid cell

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

  function paint() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;

    const cols = Math.max(1, Math.round(box.width / CELL));
    const rows = Math.max(1, Math.round(box.height / CELL));
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

    // Fit by height first, then re-check width: a wider face than the one
    // this was tuned against would otherwise clip silently against the right
    // edge of a fixed-width canvas.
    let size = rows * 0.85;
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    const width = ctx.measureText(TEXT).width;
    if (width > cols) {
      size *= cols / width;
      ctx.font = `900 ${size}px ${FONT_STACK}`;
    }
    ctx.fillText(TEXT, 0, rows / 2);

    const lum = ctx.getImageData(0, 0, cols, rows).data;
    const accent = resolve(host, "--accent-color");

    const target = canvas.getContext("2d");
    target.clearRect(0, 0, cols, rows);
    target.fillStyle = accent;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (lum[(y * cols + x) * 4] > 110) target.fillRect(x, y, 1, 1);
      }
    }
  }

  paint();

  // Webfonts land after first paint; without this the grid keeps a fallback
  // face's letterforms.
  if (document.fonts?.ready) document.fonts.ready.then(paint);

  let pending;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(paint);
  });

  return paint;
}
