// Ordered (Bayer) dithering: each pixel is compared against a fixed threshold
// matrix rather than a flat 50% cutoff, so gradients survive as pattern density
// instead of collapsing into two blobs.

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const MATRIX = 8;
const LEVELS = MATRIX * MATRIX;

// Quantizes an ImageData in place to two colours along the Bayer thresholds.
function quantize(frame, ink, paper, { contrast = 1, brightness = 0 } = {}) {
  const px = frame.data;
  const [ir, ig, ib] = toRgb(ink);
  const [pr, pg, pb] = toRgb(paper);

  for (let y = 0; y < frame.height; y += 1) {
    const row = BAYER_8[y % MATRIX];
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * 4;
      const luma = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      const adjusted = (luma - 0.5) * contrast + 0.5 + brightness;
      const lit = adjusted > (row[x % MATRIX] + 0.5) / LEVELS;

      px[i] = lit ? pr : ir;
      px[i + 1] = lit ? pg : ig;
      px[i + 2] = lit ? pb : ib;
      px[i + 3] = 255;
    }
  }

  return frame;
}

// Normalizes any CSS color the browser understands into [r, g, b].
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

function decoded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve(img);
  return new Promise((resolve, reject) => {
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => reject(new Error("portrait failed to load")), {
      once: true,
    });
  });
}

export function render(canvas, img, { size = 112, ink, paper, contrast = 0.95, brightness = 0.12 }) {
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Cover-crop to a square, biased upward to match the photo's framing.
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = 0;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  const frame = ctx.getImageData(0, 0, size, size);
  quantize(frame, ink, paper, { contrast, brightness });
  ctx.putImageData(frame, 0, 0);
}

// The dither is cleared away one Bayer cell at a time rather than faded out.
// Scrambled so it dissolves rather than wiping, and scrambled once and kept, so
// the same cells go in the same order every time — hovering twice should not
// look like two different pictures.
function scrambledCells(canvas) {
  const cells = [];
  for (let y = 0; y < canvas.height; y += MATRIX) {
    for (let x = 0; x < canvas.width; x += MATRIX) cells.push([x, y]);
  }

  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells;
}

// Returns repaint, so a theme change can re-dither against the new palette
// without reloading the image, and reveal, which sets how much of the dither
// has been cleared away. Both go through the same paint, so the two never
// disagree: re-dithering mid-reveal keeps the cells that were already open.
export async function attach(canvas, img, options = {}) {
  await decoded(img);

  const cells = scrambledCells(canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let open = 0;

  // Read the palette off resolved properties rather than the custom properties
  // themselves: those hold light-dark(), which getPropertyValue hands back
  // unevaluated. `color` and `background-color` always come back as rgb().
  function paint() {
    render(canvas, img, {
      ...options,
      ink: getComputedStyle(canvas).color,
      paper: getComputedStyle(canvas.parentElement).backgroundColor,
    });

    // Clearing to transparent rather than drawing the photo into the canvas:
    // the untouched <img> is already sitting underneath, so a hole is enough.
    for (let i = 0; i < open; i += 1) {
      ctx.clearRect(cells[i][0], cells[i][1], MATRIX, MATRIX);
    }
  }

  paint();

  return {
    repaint: paint,
    reveal(fraction) {
      const next = Math.round(cells.length * Math.min(Math.max(fraction, 0), 1));
      if (next === open) return;
      open = next;
      paint();
    },
  };
}
