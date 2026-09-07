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
// Shared by the portrait and the wordmark so the whole site speaks one
// halftone language.
export function quantize(frame, ink, paper, { contrast = 1, brightness = 0 } = {}) {
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

// Returns a repaint function so a theme change can re-dither against the new
// palette without reloading the image.
export async function attach(canvas, img, options = {}) {
  await decoded(img);

  // Read the palette off resolved properties rather than the custom properties
  // themselves: those hold light-dark(), which getPropertyValue hands back
  // unevaluated. `color` and `background-color` always come back as rgb().
  const repaint = () =>
    render(canvas, img, {
      ...options,
      ink: getComputedStyle(canvas).color,
      paper: getComputedStyle(canvas.parentElement).backgroundColor,
    });

  repaint();
  return repaint;
}
