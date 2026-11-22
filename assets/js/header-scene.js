/*
  The Mochi page header, as a small scene instead of a wordmark.

  An experiment (Ben, 2026-11-22): wordmarks may be harder than
  the pixel art scenes, so the header slot gets a scene. Mochi,
  the blue plush blob from this page's portrait, sits on a grassy
  rise in the meadow under a big quiet sky. The anchor is in
  ANCHOR-mochi-header.md at the repo root; the composition steals
  its device from Hyper Light Drifter's cliff vista, a small
  figure on a rise giving the layered distance its scale while
  the sky takes most of the frame and stays quiet.

  The craft is the site's own: a grid of cells, a palette kept as
  data, seeded variation, and a renderer that only ever swaps
  whole cells between palette colours. The landscape slots borrow
  the gallery highland's hexes; Mochi's slots are the portrait's
  own blue ramp, so this Mochi is the portrait Mochi in miniature,
  graded outline, Bayer-jittered shade bands, blink and all.

  Motion, within the pixel rule: gusts in the meadow manner, a
  band rolling from the far hill toward the viewer while grass
  steps one rung up its ladder and back down, with seeded rests
  between; the blink, the portrait's own swap; and one small
  cloud stepping one column at a time on slow seeded holds, drawn
  over sky cells only. Nothing drifts, nothing fades. Reduced
  motion gets one static frame, eyes open, no timers.

  Night is the same map with a different lookup, the meadow's
  way: the sun's slot wears the sky hex, the moon's slot wakes
  up, and the flower cells in the near grass close.
*/

(() => {
  const canvas = document.querySelector("[data-header-scene]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 18;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its
  // own hexes. 16 slots, at most 15 unique hexes per theme: by day
  // the moon slot wears the sky hex, by night the sun slot does.
  const S = {
    SKY: 0,
    SUN: 1,
    MOON: 2,
    CLOUD: 3,
    FAR_BASE: 4,
    FAR_TIP: 5,
    G_BASE: 6,
    G_MID: 7,
    G_TIP: 8,
    G_LIT: 9,
    M_HI: 10,
    M_BODY: 11,
    M_MID: 12,
    M_DEEP: 13,
    M_OUTLINE: 14,
    M_FACE: 15,
  };

  const PALETTES = {
    light: [
      "#c9e7f5", // sky
      "#ffd94a", // sun; also the flower cells in the near grass
      "#c9e7f5", // moon and stars (= sky by day)
      "#ffffff", // the cloud
      "#a9cdb2", // far hill, washed toward the sky
      "#c4e0bc", // far hill rim and its gust rung
      "#3e7a39", // near grass, the dark base shade
      "#57a047", // near grass
      "#7cc463", // near grass tips
      "#b9dc62", // near grass, gust-lit, the warmest green
      "#a9c3ec", // Mochi, highlight (the portrait's ramp)
      "#7f9fd8", // Mochi, body
      "#6486c4", // Mochi, mid
      "#4763a0", // Mochi, deep
      "#2e4470", // Mochi, outline
      "#141c2e", // Mochi, face
    ],
    dark: [
      "#0c1826", // sky
      "#0c1826", // sun (= sky by night; the flowers close)
      "#e8f1fa", // moon and stars
      "#2c4a73", // the cloud
      "#1d3442", // far hill, washed toward the night sky
      "#2a4a54", // far hill rim and its gust rung
      "#14332a", // near grass, the dark base shade
      "#1d4d38", // near grass
      "#2f7350", // near grass tips
      "#5da873", // near grass, gust-lit, kept cool
      "#93b1e2", // Mochi, highlight
      "#6d8fc6", // Mochi, body
      "#50699c", // Mochi, mid
      "#37497a", // Mochi, deep
      "#1c2a4a", // Mochi, outline
      "#0a0f1c", // Mochi, face
    ],
  };

  /* ---------- seeded variation ---------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- the bitmap ---------- */

  const grid = new Uint8Array(W * H);
  const at = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

  function stamp(rows, left, topY, map) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const slot = map[ch];
        if (slot === undefined) return;
        const x = left + dx;
        const y = topY + dy;
        if (inside(x, y)) grid[at(x, y)] = slot;
      });
    });
  }

  /* ----- the far hill ----- */

  // A ridge is a table of peaks, the mountains' way: the
  // silhouette at a column is the highest triangle covering it.
  const FAR_PEAKS = [
    { x: 8, apex: 10, half: 30 },
    { x: 42, apex: 9, half: 32 },
    { x: 78, apex: 10, half: 30 },
    { x: 110, apex: 9, half: 28 },
  ];
  const FAR_BASE_Y = 13;

  function ridgeTopAt(peaks, baseY, x) {
    let top = baseY;
    for (const p of peaks) {
      const y = p.apex + Math.round((Math.abs(x - p.x) * (baseY - p.apex)) / p.half);
      if (y < top) top = y;
    }
    return top;
  }

  /* ----- the near ground ----- */

  // The ground's surface: a gentle roll, rising into a low crest
  // on the right where Mochi sits, the rise the composition turns
  // on. The crest is a smooth bump, so the surface steps up to it
  // a cell at a time and down again.
  const surfY = (x) => {
    const bump = Math.max(0, 1 - Math.pow((x - 88) / 21, 2));
    return 14 + Math.round(Math.sin(x / 23 + 1.0)) - Math.round(2 * bump);
  };

  /* ----- Mochi, in miniature ----- */

  // The portrait's profile, scaled down: [first cell, last cell]
  // for each row of the body, widest low, a pinch above the base,
  // then the base spreading widest where the plush sits.
  const BLOB_LEFT = 80;
  const BLOB_PROFILE = {
    0: [5, 9],
    1: [3, 11],
    2: [2, 12],
    3: [1, 13],
    4: [0, 14],
    5: [0, 14],
    6: [0, 14],
    7: [1, 13],
    8: [1, 13],
    9: [0, 14],
  };
  const BLOB_BASE_Y = surfY(87); // the ground row the base sits on

  const inBlob = (lx, ly) => {
    const row = BLOB_PROFILE[ly];
    return row !== undefined && lx >= row[0] && lx <= row[1];
  };

  // The portrait's 2x2 Bayer, tiling in blocks so shade boundaries
  // jitter as clusters, not speckle. Neighbouring shades only.
  const BAYER_2 = [
    [0, 2],
    [3, 1],
  ];

  // Form shading from one light source, upper right, the
  // portrait's arithmetic at miniature scale: a lit cap over a
  // body-bright middle over a base that pools darker where the
  // plush meets the ground. The slopes are sized so the whole
  // face sits inside the body band.
  function blobShade(lx, ly) {
    const light =
      9 -
      ly * 0.85 -
      Math.max(0, 4 - lx) * 0.45 +
      Math.max(0, lx - 10) * 0.4 -
      Math.max(0, ly - 6) * 1.3 +
      Math.max(0, 4 - Math.abs(lx - 7)) * 0.12;
    const jitter = (BAYER_2[ly % 2][lx % 2] - 1.5) * 0.5;
    const v = light + jitter;
    if (v > 6.5) return S.M_HI;
    if (v > -2) return S.M_BODY;
    if (v > -9) return S.M_MID;
    return S.M_DEEP;
  }

  // One step darker along Mochi's ramp, for the graded outline.
  const DEEPEN = new Map([
    [S.M_HI, S.M_BODY],
    [S.M_BODY, S.M_MID],
    [S.M_MID, S.M_DEEP],
    [S.M_DEEP, S.M_OUTLINE],
    [S.M_OUTLINE, S.M_OUTLINE],
  ]);

  // The face, the portrait's at miniature scale: single-cell eye
  // arcs, a peak with the ends stepping down and out, and a small
  // smile under them. The blink frame swaps each arc for a flat
  // line on its own base row.
  const EYE_OPEN = [
    [4, 4], [3, 5], [5, 5],
    [10, 4], [9, 5], [11, 5],
  ];
  const EYE_SHUT = [
    [3, 5], [4, 5], [5, 5],
    [9, 5], [10, 5], [11, 5],
  ];
  const SMILE = [
    [5, 6], [9, 6],
    [6, 7], [7, 7], [8, 7],
  ];

  let eyesShut = false;

  function paintBlob() {
    const topY = BLOB_BASE_Y - 9;
    for (let ly = 0; ly <= 9; ly += 1) {
      for (let lx = 0; lx <= 14; lx += 1) {
        if (!inBlob(lx, ly)) continue;
        let slot = blobShade(lx, ly);
        // The graded outline, the portrait's rules: the bottom
        // edge deepens the full step, the left edge deepens but
        // stops at deep, and on the lit top and right edges a
        // plain body cell steps to mid while a highlight cell
        // stays a highlight and reads as rim light.
        const edgeBottom = !inBlob(lx, ly + 1);
        const edgeLeft = !inBlob(lx - 1, ly);
        const edgeLit = !inBlob(lx, ly - 1) || !inBlob(lx + 1, ly);
        if (edgeBottom) slot = DEEPEN.get(slot);
        else if (edgeLeft) {
          slot = DEEPEN.get(slot) === S.M_OUTLINE ? S.M_DEEP : DEEPEN.get(slot);
        } else if (edgeLit && slot === S.M_BODY) slot = S.M_MID;
        grid[at(BLOB_LEFT + lx, topY + ly)] = slot;
      }
    }
    for (const [lx, ly] of SMILE) {
      grid[at(BLOB_LEFT + lx, topY + ly)] = S.M_FACE;
    }
    for (const [lx, ly] of eyesShut ? EYE_SHUT : EYE_OPEN) {
      grid[at(BLOB_LEFT + lx, topY + ly)] = S.M_FACE;
    }
    // The contact shadow: the ground's own dark, one row under
    // the base, so the plush sits in the grass instead of on it.
    for (let lx = 1; lx <= 13; lx += 1) {
      const x = BLOB_LEFT + lx;
      if (inside(x, BLOB_BASE_Y + 1) && grid[at(x, BLOB_BASE_Y + 1)] === S.G_MID) {
        grid[at(x, BLOB_BASE_Y + 1)] = S.G_BASE;
      }
    }
  }

  /* ----- grass ----- */

  // A grass tuft: two tip cells over one base cell, dark at the
  // base and light at the tip, the highland's stamp. Tips land
  // only on grass, so a tuft never grows through Mochi.
  const GRASS_SLOTS = new Set([
    S.FAR_BASE, S.FAR_TIP,
    S.G_BASE, S.G_MID, S.G_TIP, S.G_LIT,
  ]);

  function tuft(x, yBase, tipSlot, baseSlot, groundSlot) {
    if (inside(x, yBase - 1) && GRASS_SLOTS.has(grid[at(x, yBase - 1)])) {
      grid[at(x, yBase - 1)] = tipSlot;
    }
    if (inside(x + 2, yBase - 1) && GRASS_SLOTS.has(grid[at(x + 2, yBase - 1)])) {
      grid[at(x + 2, yBase - 1)] = tipSlot;
    }
    if (inside(x + 1, yBase) && grid[at(x + 1, yBase)] === groundSlot) {
      grid[at(x + 1, yBase)] = baseSlot;
    }
  }

  /* ----- the whole scene ----- */

  function buildGrid() {
    grid.fill(S.SKY);

    // The sun, upper right: a small disc. Its slot wears the sky
    // hex at night, so the disc is only ever a day shape.
    stamp(
      [
        ".XXX.",
        "XXXXX",
        "XXXXX",
        "XXXXX",
        ".XXX.",
      ],
      103, 1,
      { X: S.SUN },
    );

    // The moon, upper left: a disc with a sky disc cut out of it,
    // a crescent. By day its slot wears the sky hex and the cut
    // is sky on sky; nothing shows.
    stamp(
      [
        ".XXX.",
        "XXXXX",
        "XXXXX",
        "XXXXX",
        ".XXX.",
      ],
      8, 1,
      { X: S.MOON },
    );
    stamp(
      [
        ".XXX.",
        "XXXXX",
        "XXXXX",
        "XXXXX",
        ".XXX.",
      ],
      10, 0,
      { X: S.SKY },
    );

    // Stars, seeded, only where the sky is still sky. By day
    // their slot is the sky hex and none of this shows.
    const starRng = mulberry32(20261141);
    for (let i = 0; i < 14; i += 1) {
      const x = Math.floor(starRng() * W);
      const y = Math.floor(starRng() * 7);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.MOON;
    }

    // The far hill, washed almost to the sky, with its rim
    // catching the light in seeded stretches of the tip shade.
    for (let x = 0; x < W; x += 1) {
      const top = ridgeTopAt(FAR_PEAKS, FAR_BASE_Y, x);
      for (let y = top; y < H; y += 1) grid[at(x, y)] = S.FAR_BASE;
    }
    const farRng = mulberry32(20261142);
    for (let x = 0; x < W; x += 1) {
      const top = ridgeTopAt(FAR_PEAKS, FAR_BASE_Y, x);
      if (farRng() < 0.55) grid[at(x, top)] = S.FAR_TIP;
      if (farRng() < 0.18 && grid[at(x, top + 1)] === S.FAR_BASE) {
        grid[at(x, top + 1)] = S.FAR_TIP;
      }
    }

    // A tiny copse on the far hill's left shoulder, the meadow's
    // tree shrunk to the far plane: three lobes in the hill's own
    // washed shades with a lit rim, on a two-cell trunk. Landscape
    // furniture, not a second subject; it gives the quiet left
    // side a landmark the way the highland's standing stones do.
    const copseBase = ridgeTopAt(FAR_PEAKS, FAR_BASE_Y, 22);
    stamp(
      [
        ".TT...TT.",
        "TXxxxxxxT",
        ".xxxxxxx.",
        "....x....",
        "....x....",
      ],
      18,
      copseBase - 4,
      { T: S.FAR_TIP, x: S.FAR_BASE },
    );

    // The near ground, over the far hill's skirts.
    for (let x = 0; x < W; x += 1) {
      for (let y = surfY(x); y < H; y += 1) grid[at(x, y)] = S.G_MID;
    }
    const fgRng = mulberry32(20261143);
    // A dark band under the rim in seeded stretches: the grass's
    // own base shadow, and the ground's drawn thickness.
    for (let x = 0; x < W; x += 1) {
      if (fgRng() < 0.6 && grid[at(x, surfY(x) + 1)] === S.G_MID) {
        grid[at(x, surfY(x) + 1)] = S.G_BASE;
      }
      if (fgRng() < 0.3) grid[at(x, surfY(x))] = S.G_TIP;
    }
    // Tufts along the surface, and a few deeper in the field.
    let fx = 1;
    while (fx < W - 4) {
      fx += 3 + Math.floor(fgRng() * 6);
      tuft(fx, surfY(fx) + 1, S.G_TIP, S.G_BASE, S.G_MID);
      if (fgRng() < 0.4) {
        const deep = Math.min(H - 1, surfY(fx) + 3);
        tuft(fx + 1, deep, S.G_TIP, S.G_BASE, S.G_MID);
      }
    }
    // Speckle clusters in the top rows of the field: pairs of tip
    // or base shade, never single cells.
    for (let i = 0; i < 26; i += 1) {
      const x = Math.floor(fgRng() * (W - 3));
      const y = surfY(x) + Math.floor(fgRng() * 3);
      if (y >= H) continue;
      const slot = fgRng() < 0.55 ? S.G_TIP : S.G_BASE;
      for (let k = 0; k < 2; k += 1) {
        if (inside(x + k, y) && grid[at(x + k, y)] === S.G_MID) {
          grid[at(x + k, y)] = slot;
        }
      }
    }
    // The field darkens toward its base: the bottom row pools
    // dark in seeded stretches.
    for (let x = 0; x < W; x += 1) {
      if (fgRng() < 0.5 && grid[at(x, H - 1)] === S.G_MID) {
        grid[at(x, H - 1)] = S.G_BASE;
      }
    }
    // Two deliberate flower pairs in the near grass: the sun's
    // own yellow. By night the slot wears the sky hex and they
    // close. Named in the anchor as deliberate details.
    for (const [x, y] of [
      [30, 15], [31, 15],
      [58, 16], [59, 16],
    ]) {
      if (inside(x, y) && grid[at(x, y)] === S.G_MID) grid[at(x, y)] = S.SUN;
    }

    paintBlob();
  }

  /* ---------- the grass ladders ---------- */

  // The weather's ladders, the meadow's device: a gust steps a
  // grass cell one rung up its own plane's ladder, so the gust
  // passes around Mochi and the hills' furniture, never through
  // them. Read off the finished grid, so anything that is not
  // grass is off the ladders by construction.
  const LADDERS = [
    [S.FAR_BASE, S.FAR_TIP],
    [S.G_BASE, S.G_MID, S.G_TIP, S.G_LIT],
  ];
  const ladderOf = new Int8Array(W * H).fill(-1);
  const rung = new Int16Array(W * H).fill(-1);
  // The far plane steps in a Bayer share of its cells, the near
  // field steps whole: the meadow's quieting with distance.
  const LADDER_COVER = [0.55, 1];

  function buildLadders() {
    const slotLadder = new Map();
    LADDERS.forEach((ladder, li) => {
      ladder.forEach((slot, ri) => slotLadder.set(slot, [li, ri]));
    });
    for (let i = 0; i < W * H; i += 1) {
      const hit = slotLadder.get(grid[i]);
      if (hit) {
        ladderOf[i] = hit[0];
        rung[i] = hit[1];
      }
    }
  }

  /* ---------- rendering ---------- */

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resolvedTheme = () =>
    document.documentElement.dataset.theme ||
    (systemDark.matches ? "dark" : "light");

  const still = document.createElement("canvas");
  still.width = W;
  still.height = H;
  const stillCtx = still.getContext("2d");

  function paintStill() {
    const pal = PALETTES[resolvedTheme()];
    for (let i = 0; i < W * H; i += 1) {
      stillCtx.fillStyle = pal[grid[i]];
      stillCtx.fillRect(i % W, Math.floor(i / W), 1, 1);
    }
  }

  /* ---------- the cloud ---------- */

  // One small cloud, drawn over sky cells only, so it passes
  // behind the sun and the moon the way the meadow's clouds pass
  // over sky and nothing else. It steps one column at a time on
  // slow seeded holds, exits at the right, and re-enters at the
  // left after a gap.
  const CLOUD_ROWS = [
    "..XXXXXX....",
    ".XXXXXXXXXX.",
    "..XXXXXXXX..",
  ];
  const CLOUD_Y = 2;
  const CLOUD_START = 14; // in the frame at load: the header's first impression includes it
  const CLOUD_SPAN = W + 30; // the full cycle, exit right and gap included
  let cloudStep = 0; // columns stepped since the last re-entry
  const cloudX = () => ((CLOUD_START + 16 + cloudStep) % CLOUD_SPAN) - 16;

  function paintCloud() {
    const pal = PALETTES[resolvedTheme()];
    ctx.fillStyle = pal[S.CLOUD];
    CLOUD_ROWS.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch !== "X") return;
        const x = cloudX() + dx;
        const y = CLOUD_Y + dy;
        if (inside(x, y) && grid[at(x, y)] === S.SKY) {
          ctx.fillRect(x, y, 1, 1);
        }
      });
    });
  }

  /* ---------- gusts ---------- */

  // Weather geometry, the meadow's: a gust is a band whose front
  // is a row of the ground. It starts above the far hill and
  // rolls toward the viewer, so the far grass lights first and
  // the near grass last. The front is not a ruler: a wobble, a
  // sum of sines over the columns, holds it a row or two early
  // here and late there, and each gust rolls the wobble at its
  // own phase.
  const gustWobble = (x) =>
    1.5 * Math.sin(x / 16 + 0.7) + 0.8 * Math.sin(x / 6.3 + 2.0);
  const GUST_FRINGE = 1.4; // rows of broken edge at the band's front and tail
  const HILL_GUST_RAMP = 3; // band depth over which a far plane's share rises
  const BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const gustRng = mulberry32(20261144);
  let gust = null; // { row, depth, depthScale, phase }
  let restTicks = Math.round(2500 / 120); // the pause before the first gust

  function startGust() {
    gust = {
      row: 5,
      depth: 2,
      depthScale: 0.85 + gustRng() * 0.4,
      phase: Math.floor(gustRng() * 240),
    };
  }

  function scheduleRest() {
    // Between gusts the field rests, fully still, for a seeded
    // stretch. A quarter of gusts are followed closely by another.
    const quick = gustRng() < 0.25;
    const ms = quick ? 300 + gustRng() * 600 : 1400 + gustRng() * 3200;
    restTicks = Math.max(1, Math.round(ms / 120));
  }

  function stepGust() {
    if (gust === null) {
      restTicks -= 1;
      if (restTicks <= 0) startGust();
      return gust !== null;
    }
    const t = Math.max(0, Math.min(1, (gust.row - 5) / (H + 2 - 5)));
    gust.row += 0.55 + 0.35 * t;
    gust.depth = (2 + 2.6 * t) * gust.depthScale;
    if (gust.row - gust.depth > H + 2) {
      gust = null;
      scheduleRest();
    }
    return true;
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
    paintCloud();
    if (reduced.matches || gust === null) return;
    const pal = PALETTES[resolvedTheme()];
    const yLo = Math.max(0, Math.floor(gust.row - gust.depth - 3));
    const yHi = Math.min(H - 1, Math.ceil(gust.row + 3));
    for (let y = yLo; y <= yHi; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = at(x, y);
        if (rung[i] < 0) continue;
        const ladder = LADDERS[ladderOf[i]];
        if (rung[i] >= ladder.length - 1) continue;
        const d = gust.row + gustWobble(x + gust.phase) - y;
        if (d < 0 || d > gust.depth) continue;
        const edge = Math.min(d, gust.depth - d);
        const bayer = (BAYER_4[y % 4][x % 4] + 0.5) / 16;
        const cover = LADDER_COVER[ladderOf[i]];
        const steps =
          cover >= 1
            ? edge >= GUST_FRINGE || bayer < edge / GUST_FRINGE
            : bayer < Math.min(cover, edge / HILL_GUST_RAMP);
        if (!steps) continue;
        ctx.fillStyle = pal[ladder[rung[i] + 1]];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /* ---------- wiring ---------- */

  buildGrid();
  buildLadders();
  paintStill();
  frame();

  // A theme swap re-points the slots at the other palette and
  // repaints, the way every other picture on this page handles it.
  const repaint = () => {
    paintStill();
    frame();
  };
  new MutationObserver(repaint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", repaint);

  if (reduced.matches) return; // one static frame, no weather, no timers

  // The cloud's holds, the meadow's lengths: a few seconds of
  // stillness, then one column step.
  const cloudRng = mulberry32(20261145);
  const CLOUD_HOLDS = [2000, 3200, 5000];
  let cloudTicks = Math.round(CLOUD_HOLDS[0] / 120);
  function stepCloud() {
    cloudTicks -= 1;
    if (cloudTicks > 0) return false;
    cloudStep = (cloudStep + 1) % CLOUD_SPAN;
    cloudTicks = Math.round(
      CLOUD_HOLDS[Math.floor(cloudRng() * CLOUD_HOLDS.length)] / 120,
    );
    return true;
  }

  setInterval(() => {
    if (document.hidden) return;
    const gustStepped = stepGust();
    const cloudStepped = stepCloud();
    if (gustStepped || cloudStepped) frame();
  }, 120);

  // The blink, on the portrait's own rhythm: the arcs trade
  // places with a flat line for 240ms, on seeded gaps of five to
  // twelve seconds. A blink repaints the still, because the eyes
  // are part of the grid.
  const blinkRng = mulberry32(20261146);
  function scheduleBlink() {
    setTimeout(() => {
      if (document.hidden) {
        scheduleBlink();
        return;
      }
      eyesShut = true;
      paintBlob();
      paintStill();
      frame();
      setTimeout(() => {
        eyesShut = false;
        paintBlob();
        paintStill();
        frame();
        scheduleBlink();
      }, 240);
    }, 5000 + blinkRng() * 7000);
  }
  scheduleBlink();
})();
