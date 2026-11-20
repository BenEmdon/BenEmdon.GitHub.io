// Dither installation, v2: layered scenes, finer pixels, more shades.
//
// V1 covered each drawn panel with a two-tone Bayer dither and cleared it
// in whole 8px blocks over 8 steps. Ben's verdict was that it read a bit
// simplistic, and asked for layers, smaller pixels, and different shades
// of pixels. So v2 changes all three, and keeps everything else about the
// site's pixel rule: a fixed grid, cells that change in place, in discrete
// steps. Nothing here moves, drifts, fades, or transitions.
//
// Smaller: panels render on a 192 x 192 grid instead of 96 x 96, the
// reveal blocks are 8 grid units (half the panel fraction they were), and
// the reveal runs 16 steps instead of 8.
//
// More shades: a scene is built as a continuous value map (0 = darkest,
// 1 = lightest) plus an override map for hard details (windows, the
// clock, the sun, a boat hull). The final render quantizes value to five
// discrete shades. Following pixel-art practice, the ramp hue-shifts
// (shadows toward blue-purple, a warm blend at the light end; see
// hueShiftRamp), and dithering between adjacent shades happens only on
// the large low-contrast areas, sky and water: shapes are flat clusters
// in a single nearest shade, so the texture lives in the background and
// the subjects stay clean. Every pixel is always one solid palette
// shade. The shades start as the site's own ink tones, read off computed
// styles the way dither.js reads its two colours, plus the two accent
// blues for overrides. There are no outlines anywhere, and no pure
// black: edges are each shape's own darkest ramp shade (sel-out), which
// is also why foreground silhouettes can sit directly on the mid layer.
//
// Layers: each scene is composed in three depth layers, sky (0), mid (1),
// front (2), recorded per pixel while the scene is drawn. Reveal blocks
// inherit the layer at their centre, and each layer has its own window
// inside the 16 steps: the sky clears first, the front last, scrambled
// within a layer. Depth arrives in stages rather than all at once.
//
// The cover is still a dither of the scene, but a coarser one than the
// scene itself: value compressed toward the middle, quantized to three
// shades on a 2px Bayer grain, with the accent details held back. So a
// covered panel is recognisably the scene, flatter and grainier, and the
// reveal pays off in finer grain, two extra shades, and the accents.
//
// Panel 1 is the portrait again, wired up by main.js through the same
// [data-dither] path as the original; it is not touched here. Panels 2
// and 3 are drawn in code below, so there are no extra images to load and
// nothing is hotlinked. The band above the footer is the skyline again,
// wide and thin, rebuilt on a 720 x 60 grid with the same treatment.

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
const bayerAt = (x, y) => (BAYER_8[y % 8][x % 8] + 0.5) / 64;

/* ---------- palette, read off computed styles ---------- */

// Resolves any CSS colour (including one handed in as a var() expression,
// which a canvas fillStyle cannot parse) through a probe element, the
// same trick dither.js uses: computed `color` always comes back as rgb().
function probeColour(parent, expr) {
  const probe = document.createElement("span");
  probe.style.color = expr;
  probe.style.display = "none";
  parent.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).map(Number);
  return [r, g, b];
}

// Five ramp shades, darkest first, plus the two accents. The ramp starts
// as the site's ink scale; the accents are light-dark() semantics, so
// they are the side of the palette that follows the theme. Ink and paper
// come off the panel itself, exactly as v1 read them.
function basePalette(panel, accentExpr) {
  return {
    ramp: [
      probeColour(panel, getComputedStyle(panel).color),
      probeColour(panel, "var(--ink-600)"),
      probeColour(panel, "var(--ink-400)"),
      probeColour(panel, "var(--ink-200)"),
      probeColour(panel, getComputedStyle(panel).backgroundColor),
    ],
    accent: probeColour(panel, accentExpr),
    pulse: probeColour(panel, "var(--accent-pulse-color)"),
  };
}

/* Hue-shifted ramps (pixel-art practice, e.g. Pixel Logic / Slynyrd):
   a ramp that only changes brightness looks dead, so the shades also
   travel in hue. Shadows rotate toward blue-purple and gain a little
   saturation; the shift eases off step by step up the ramp; and the
   lightest tinted shade takes a small warm blend, the highlight end of
   the same travel. The travel is kept short on purpose: the site's
   palette is a blue duotone, so a full yellow highlight would leave the
   palette entirely. Paper itself is not tinted; it is the site's white,
   shared with the portrait. */
function rgbToHsl([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb([h, s, l]) {
  const hn = (((h % 360) + 360) % 360) / 360;
  const f = (p, q, t) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [f(p, q, hn + 1 / 3), f(p, q, hn), f(p, q, hn - 1 / 3)].map((v) => Math.round(v * 255));
}

function hueShiftRamp(ramp) {
  const shifts = [16, 10, 5, 0, 0]; // degrees toward purple, easing off
  const sats = [0.05, 0.03, 0.015, 0, 0];
  const out = ramp.map((rgb, i) => {
    if (!shifts[i] && !sats[i]) return rgb;
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h + shifts[i], Math.min(1, s + sats[i]), l]);
  });
  // Warm blend on the lightest tinted shade only (see the note above).
  out[3] = out[3].map((c, i) => Math.round(c * 0.9 + [255, 244, 214][i] * 0.1));
  return out;
}

function palette(panel, sceneCanvas) {
  const pal = basePalette(panel, getComputedStyle(sceneCanvas).color);
  pal.ramp = hueShiftRamp(pal.ramp);
  return pal;
}

/* ---------- scene building: value, override, and layer maps ---------- */

// Override classes: 0..4 are ramp shades, 5 is accent, 6 is accent pulse.
// -1 (the Int8 default fill below is set explicitly) means no override.
const OVR_ACCENT = 5;
const OVR_PULSE = 6;

function makeScene(w, h) {
  return {
    w,
    h,
    val: new Float32Array(w * h).fill(0.9),
    ovr: new Int8Array(w * h).fill(-1),
    lyr: new Uint8Array(w * h),
    // Dither mask: 1 only where dithering belongs, the large, static,
    // low-contrast areas (sky, water). Shapes drawn over them are flat
    // clusters and clear the mask, so buildings and details render as
    // clean solid shades and the dither reads as texture by contrast.
    dth: new Uint8Array(w * h),
  };
}

function rectV(s, layer, x, y, w, h, v) {
  for (let yy = Math.max(0, y); yy < Math.min(s.h, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(s.w, x + w); xx += 1) {
      const i = yy * s.w + xx;
      s.val[i] = v;
      s.lyr[i] = layer;
      s.dth[i] = 0;
    }
  }
}

function discV(s, layer, cx, cy, rx, ry, v) {
  for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy += 1) {
    for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= s.w || yy >= s.h) continue;
      const d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2;
      if (d > 1) continue;
      const i = yy * s.w + xx;
      s.val[i] = v;
      s.lyr[i] = layer;
      s.dth[i] = 0;
    }
  }
}

function rectO(s, layer, x, y, w, h, cls) {
  for (let yy = Math.max(0, y); yy < Math.min(s.h, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(s.w, x + w); xx += 1) {
      const i = yy * s.w + xx;
      s.ovr[i] = cls;
      s.lyr[i] = layer;
    }
  }
}

function discO(s, layer, cx, cy, r, cls) {
  for (let yy = Math.floor(cy - r); yy <= cy + r; yy += 1) {
    for (let xx = Math.floor(cx - r); xx <= cx + r; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= s.w || yy >= s.h) continue;
      if ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r) continue;
      const i = yy * s.w + xx;
      s.ovr[i] = cls;
      s.lyr[i] = layer;
    }
  }
}

// Deterministic per-pixel hash, so speckles and lit windows are the same
// on every load and every repaint. A drawn scene should not reshuffle.
function hash(x, y) {
  let n = (x * 374761393 + y * 668265263) >>> 0;
  n = (n ^ (n >> 13)) >>> 0;
  n = (n * 1274126177) >>> 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

// The sky both panels share: value rising toward the horizon, a pulse sun
// with an accent core, flat-bottomed clouds, and three birds as single
// dark pixels. All of it on layer 0.
function drawSky(s, sunX, sunY) {
  for (let y = 0; y < s.h; y += 1) {
    const v = 0.78 + (y / s.h) * 0.17;
    for (let x = 0; x < s.w; x += 1) {
      const i = y * s.w + x;
      s.val[i] = v;
      s.dth[i] = 1; // the sky is the panels' large low-contrast area
    }
  }
  discO(s, 0, sunX, sunY, Math.round(s.w / 19), OVR_PULSE);
  discO(s, 0, sunX, sunY, Math.round(s.w / 32), OVR_ACCENT);
  for (const [cx, cy, rx] of [[52, 34, 20], [66, 38, 14], [132, 58, 16]]) {
    discV(s, 0, cx * (s.w / 192), cy * (s.h / 192), rx * (s.w / 192), rx * 0.32 * (s.w / 192), 1);
  }
  for (const [bx, by] of [[40, 30], [58, 22], [30, 48]]) {
    const x = Math.round(bx * (s.w / 192));
    const y = Math.round(by * (s.h / 192));
    rectO(s, 0, x, y, 1, 1, 0);
    rectO(s, 0, x + 2, y - 1, 1, 1, 0);
    rectO(s, 0, x + 4, y, 1, 1, 0);
    rectO(s, 0, x + 6, y - 1, 1, 1, 0);
  }
}

/* Panel 2: Parliament and an Ottawa skyline, 192 x 192. */
function buildSkyline(w, h) {
  const s = makeScene(w, h);
  drawSky(s, 152, 34);

  // Mid layer: far buildings in a mid value, and a treeline in front of
  // them but behind everything else.
  for (const [x, y, bw, bh] of [[4, 98, 28, 62], [156, 94, 32, 66], [120, 106, 20, 54], [36, 112, 18, 48]]) {
    rectV(s, 1, x, y, bw, bh, 0.42);
  }
  // A turreted far building on the right, roofs stepped in whole pixels.
  rectV(s, 1, 160, 84, 10, 16, 0.42);
  rectV(s, 1, 162, 78, 6, 6, 0.42);
  rectV(s, 1, 164, 72, 2, 6, 0.42);
  for (let x = 8; x < w - 8; x += 18) discV(s, 1, x, 158, 8, 7, 0.35);

  // Front layer: Centre Block and the Peace Tower, near buildings, the
  // ground, and foreground trees, all in dark values.
  rectV(s, 2, 18, 110, 36, 50, 0.22);
  rectV(s, 2, 24, 102, 24, 8, 0.22);
  rectV(s, 2, 136, 104, 40, 56, 0.22);
  rectV(s, 2, 144, 96, 24, 8, 0.22);
  rectV(s, 2, 68, 94, 56, 66, 0.1);
  rectV(s, 2, 74, 88, 44, 6, 0.1);
  rectV(s, 2, 82, 82, 28, 6, 0.1);
  rectV(s, 2, 91, 40, 10, 54, 0.1);
  rectV(s, 2, 93, 30, 6, 10, 0.1);
  rectV(s, 2, 94, 22, 4, 8, 0.1);
  rectV(s, 2, 95, 14, 2, 8, 0.1);
  // The clock: accent, with a paper centre.
  rectO(s, 2, 93, 50, 6, 6, OVR_ACCENT);
  rectO(s, 2, 95, 52, 2, 2, 4);
  // Windows on a fixed grid over the front buildings: paper, with a
  // hashed few lit in pulse.
  for (const [x, y, bw, bh] of [[18, 110, 36, 50], [136, 104, 40, 56], [68, 94, 56, 66]]) {
    for (let wy = y + 6; wy < y + bh - 4; wy += 10) {
      for (let wx = x + 5; wx < x + bw - 4; wx += 8) {
        rectO(s, 2, wx, wy, 2, 3, hash(wx, wy) < 0.12 ? OVR_PULSE : 4);
      }
    }
  }
  // Ground, a lighter path up the middle, and foreground trees.
  rectV(s, 2, 0, 160, w, 32, 0.1);
  for (let y = 160; y < h; y += 1) {
    const half = 4 + (y - 160) * 0.35;
    rectV(s, 2, Math.round(96 - half), y, Math.round(half * 2), 1, 0.3);
  }
  for (const [cx, cy, r] of [[14, 166, 12], [178, 168, 13], [30, 178, 10], [164, 180, 9]]) {
    discV(s, 2, cx, cy, r, r, 0.05);
  }
  return s;
}

/* Panel 3: the Rideau Canal. Sky, a far bank and a stepped bridge, then
   water in front with the bank reflected in it as short dashes. */
function buildCanal(w, h) {
  const s = makeScene(w, h);
  drawSky(s, 34, 30);

  // Mid layer: far-bank buildings and trees along the horizon.
  for (const [x, y, bw, bh] of [[8, 88, 22, 22], [118, 84, 26, 26], [150, 90, 30, 20]]) {
    rectV(s, 1, x, y, bw, bh, 0.42);
  }
  for (let x = 16; x < w - 8; x += 22) discV(s, 1, x, 104, 8, 8, 0.35);
  // The bridge: a deck, a railing line above it, and two piers. The arch
  // opening in the middle is left as water, which is drawn over it below.
  rectV(s, 1, 16, 104, 160, 7, 0.3);
  rectV(s, 1, 16, 101, 160, 2, 0.05);
  rectV(s, 1, 30, 111, 10, 20, 0.3);
  rectV(s, 1, 152, 111, 10, 20, 0.3);

  // Front layer: the water. Value deepens with depth. Reflections and
  // light catches are short horizontal runs, hashed per run rather than
  // per pixel, so the water has no single orphan pixels in it.
  for (let y = 111; y < 178; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0.62 - ((y - 111) / 67) * 0.3;
      if (y < 152 && hash(Math.floor(x / 4), Math.floor(y / 3)) < 0.22) v -= 0.2;
      if (hash(Math.floor(x / 5) + 500, Math.floor(y / 2)) < 0.06) v = 0.9;
      const i = y * w + x;
      s.val[i] = v;
      s.lyr[i] = 2;
      s.dth[i] = 1; // water is the other large low-contrast area
    }
  }
  // Piers stand in the water, so they are redrawn over it, still mid.
  rectV(s, 1, 30, 111, 10, 20, 0.3);
  rectV(s, 1, 152, 111, 10, 20, 0.3);
  // A boat, front layer: accent hull, paper cabin and sail, dark mast.
  rectO(s, 2, 68, 152, 36, 5, OVR_ACCENT);
  rectO(s, 2, 70, 157, 32, 3, OVR_ACCENT);
  rectO(s, 2, 84, 144, 14, 8, 4);
  rectO(s, 2, 90, 128, 2, 16, 0);
  for (let y = 132; y < 150; y += 1) rectO(s, 2, 94, y, Math.max(1, Math.round((150 - y) / 2.4)), 1, 4);
  // Near bank along the bottom, with a lighter edge.
  rectV(s, 2, 0, 176, w, 2, 0.25);
  rectV(s, 2, 0, 178, w, 14, 0.08);
  return s;
}

const PANEL_SCENES = { skyline: buildSkyline, canal: buildCanal };

/* ---------- rendering: final and cover ImageData from a scene ---------- */

function shadeColour(pal, cls) {
  if (cls === OVR_ACCENT) return pal.accent;
  if (cls === OVR_PULSE) return pal.pulse;
  return pal.ramp[cls];
}

function renderScene(s, pal) {
  const final = new ImageData(s.w, s.h);
  const cover = new ImageData(s.w, s.h);
  const coarse = [pal.ramp[0], pal.ramp[2], pal.ramp[4]];
  for (let y = 0; y < s.h; y += 1) {
    for (let x = 0; x < s.w; x += 1) {
      const i = y * s.w + x;
      const o = i * 4;
      // Final: overrides are solid. Elsewhere, dithering happens only
      // where the scene's dither mask allows it (sky and water, between
      // adjacent ramp shades, on the 1px Bayer grid); every other value
      // quantizes to its nearest shade, so shapes stay flat clean
      // clusters with no texture and no orphan pixels.
      const ovr = s.ovr[i];
      const fc = ovr >= 0
        ? shadeColour(pal, ovr)
        : pal.ramp[Math.max(0, Math.min(4, s.dth[i]
          ? Math.floor(s.val[i] * 4 + bayerAt(x, y))
          : Math.round(s.val[i] * 4)))];
      final.data[o] = fc[0];
      final.data[o + 1] = fc[1];
      final.data[o + 2] = fc[2];
      final.data[o + 3] = 255;
      // Cover: value only, compressed and quantized to three shades on
      // the 2px Bayer grid. Overrides, accents included, wait for the
      // reveal.
      const v = 0.5 + (s.val[i] - 0.5) * 0.6;
      const cc = coarse[Math.max(0, Math.min(2, Math.floor(v * 2 + bayerAt(x >> 1, y >> 1))))];
      cover.data[o] = cc[0];
      cover.data[o + 1] = cc[1];
      cover.data[o + 2] = cc[2];
      cover.data[o + 3] = 255;
    }
  }
  return { final, cover };
}

/* ---------- layered reveal blocks ---------- */

// Each block takes the layer at its centre. Blocks in a layer are
// shuffled with a fixed seed, then spread across that layer's window of
// steps, so the sky lands first and the front last, scrambled within a
// layer, the same way twice.
function layeredBlocks(s, blockW, blockH, steps, windows, seed) {
  const blocks = [];
  for (let y = 0; y < s.h; y += blockH) {
    for (let x = 0; x < s.w; x += blockW) {
      const cx = Math.min(s.w - 1, x + (blockW >> 1));
      const cy = Math.min(s.h - 1, y + (blockH >> 1));
      blocks.push({ x, y, layer: s.lyr[cy * s.w + cx], t: steps });
    }
  }
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (const layer of [0, 1, 2]) {
    const group = blocks.filter((b) => b.layer === layer);
    for (let i = group.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    const [start, end] = windows[layer];
    group.forEach((b, rank) => {
      b.t = Math.max(1, Math.min(steps, start + Math.floor((rank / Math.max(1, group.length)) * (end - start + 1))));
    });
  }
  return blocks;
}

/* ---------- panels ---------- */

const PANEL_STEPS = 16;
const PANEL_STEP_MS = 35; // 16 steps in 560ms: slower than v1, on purpose.
const PANEL_WINDOWS = [[1, 7], [5, 12], [10, 16]];
const BLOCK = 8; // grid units, on a 192 grid: half v1's panel fraction.

function setUpPanel(panel, reduced, repainters) {
  const build = PANEL_SCENES[panel.dataset.galleryPanel];
  if (!build) return;
  const scene = panel.querySelector("[data-gallery-scene]");
  const cover = panel.querySelector("[data-gallery-cover]");
  const sceneCtx = scene.getContext("2d");
  const coverCtx = cover.getContext("2d");
  const data = build(scene.width, scene.height);
  const blocks = layeredBlocks(data, BLOCK, BLOCK, PANEL_STEPS, PANEL_WINDOWS, panel.dataset.galleryPanel === "skyline" ? 1234567 : 7654321);
  let frames = null;
  let open = 0;

  function paint() {
    if (!frames) frames = renderScene(data, palette(panel, scene));
    sceneCtx.putImageData(frames.final, 0, 0);
    coverCtx.putImageData(frames.cover, 0, 0);
    for (const b of blocks) {
      if (b.t <= open) coverCtx.clearRect(b.x, b.y, BLOCK, BLOCK);
    }
  }
  paint();
  repainters.push(() => { frames = null; paint(); });

  let step = 0;
  let timer;
  function dissolve(toward) {
    clearInterval(timer);
    if (reduced.matches) {
      step = toward;
      open = step;
      paint();
      return;
    }
    timer = setInterval(() => {
      step += Math.sign(toward - step);
      open = step;
      paint();
      if (step === toward) clearInterval(timer);
    }, PANEL_STEP_MS);
  }

  const show = () => dissolve(PANEL_STEPS);
  const hide = () => dissolve(0);
  panel.addEventListener("focus", show);
  panel.addEventListener("blur", hide);
  if (window.matchMedia("(hover: hover)").matches) {
    panel.addEventListener("pointerenter", show);
    panel.addEventListener("pointerleave", hide);
  } else {
    let latched = false;
    panel.addEventListener("click", () => {
      latched = !latched;
      dissolve(latched ? PANEL_STEPS : 0);
    });
  }
}

/* ---------- the skyline band above the footer ---------- */

// The same skyline as the panel, recomposed for a 720 x 60 strip: far
// buildings and a treeline in the mid layer, the tower and near buildings
// in front, and a river along the bottom with the buildings reflected in
// it as darker dashes, front layer like the canal's water.
function buildBand(w, h) {
  const s = makeScene(w, h);
  for (let y = 0; y < h; y += 1) {
    const v = 0.8 + (y / h) * 0.15;
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      s.val[i] = v;
      s.dth[i] = 1;
    }
  }
  const far = [[0, 30], [70, 24], [150, 32], [230, 26], [430, 28], [510, 22], [590, 31], [660, 25]];
  for (const [x, top] of far) rectV(s, 1, x, top, 56, 52 - top, 0.42);
  for (let x = 14; x < w; x += 36) discV(s, 1, x, 50, 9, 5, 0.35);
  const near = [[30, 20, 64], [120, 28, 52], [210, 18, 58], [470, 24, 60], [560, 16, 56], [640, 27, 62]];
  for (const [x, top, bw] of near) rectV(s, 2, x, top, bw, 52 - top, 0.1);
  // The tower, centre, with its stepped spire and accent clock.
  rectV(s, 2, 348, 8, 24, 44, 0.1);
  rectV(s, 2, 354, 4, 12, 4, 0.1);
  rectV(s, 2, 358, 1, 4, 3, 0.1);
  rectO(s, 2, 357, 14, 6, 5, OVR_ACCENT);
  // Windows: paper dots on a fixed grid over the near buildings.
  for (const [x, top, bw] of near) {
    for (let wy = top + 5; wy < 48; wy += 8) {
      for (let wx = x + 4; wx < x + bw - 3; wx += 9) rectO(s, 2, wx, wy, 2, 2, 4);
    }
  }
  for (let wy = 17; wy < 48; wy += 8) {
    for (let wx = 352; wx < 368; wx += 9) rectO(s, 2, wx, wy, 2, 2, 4);
  }
  // Ground line, then the river: mid value, darker reflection dashes, a
  // hashed few pixels catching the light.
  rectV(s, 2, 0, 50, w, 2, 0.1);
  for (let y = 52; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0.5;
      if (hash(Math.floor(x / 4), Math.floor(y / 2)) < 0.2) v = 0.28;
      if (hash(Math.floor(x / 5) + 900, y) < 0.05) v = 0.9;
      const i = y * w + x;
      s.val[i] = v;
      s.lyr[i] = 2;
      s.dth[i] = 1;
    }
  }
  return s;
}

const BAND_STEPS = 32;
const BAND_WINDOWS = [[1, 10], [7, 20], [15, 32]];

function setUpBand(band, reduced, repainters) {
  const data = buildBand(band.width, band.height);
  const blocks = layeredBlocks(data, 12, 10, BAND_STEPS, BAND_WINDOWS, 13579);
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = band.width;
  finalCanvas.height = band.height;
  const coverCanvas = document.createElement("canvas");
  coverCanvas.width = band.width;
  coverCanvas.height = band.height;
  const ctx = band.getContext("2d");
  let frames = null;
  let shown = 0;
  let played = false;

  // The band has no child canvas to borrow a second colour from, so its
  // palette is probed off the band itself: colour, background, and the
  // border colour CSS sets to the accent. Same hue-shifted ramp as the
  // panels.
  function bandPalette() {
    const pal = basePalette(band, getComputedStyle(band).borderColor);
    pal.ramp = hueShiftRamp(pal.ramp);
    return pal;
  }

  function paintBand() {
    if (!frames) {
      frames = renderScene(data, bandPalette());
      finalCanvas.getContext("2d").putImageData(frames.final, 0, 0);
      coverCanvas.getContext("2d").putImageData(frames.cover, 0, 0);
    }
    ctx.drawImage(finalCanvas, 0, 0);
    for (const b of blocks) {
      if (b.t > shown) ctx.drawImage(coverCanvas, b.x, b.y, 12, 10, b.x, b.y, 12, 10);
    }
  }
  paintBand();
  repainters.push(() => { frames = null; shown = BAND_STEPS; paintBand(); });

  if (reduced.matches) { shown = BAND_STEPS; paintBand(); return; }

  const io = new IntersectionObserver((entries) => {
    if (played || !entries.some((e) => e.isIntersecting)) return;
    played = true;
    io.disconnect();
    const timer = setInterval(() => {
      shown += 1;
      paintBand();
      if (shown >= BAND_STEPS) clearInterval(timer);
    }, 40);
  }, { threshold: 0.4 });
  io.observe(band);
}

/* ---------- set up ---------- */

function setUp() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const repainters = [];
  for (const panel of document.querySelectorAll("[data-gallery-panel]")) setUpPanel(panel, reduced, repainters);
  const band = document.querySelector("[data-skyline-band]");
  if (band) setUpBand(band, reduced, repainters);

  // Theme changes resolve to new colours; every drawn thing repaints, in
  // its fully revealed state for the band and its current step for panels.
  new MutationObserver(() => repainters.forEach((r) => r())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => repainters.forEach((r) => r()));
}

setUp();
