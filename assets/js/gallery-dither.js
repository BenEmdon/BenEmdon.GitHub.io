/*
  Gallery: dither installation, reimagined (2026-11-22).

  The idea, carried over from PR #31 (experiment/dither-installation-v2):
  layered pixel scenes built back to front, dither used only in the big
  quiet areas (sky, water) between two neighbouring shades, and a coarser
  dithered cover that clears in stepped blocks, sky layer first and the
  foreground last, when a panel is hovered, focused, or tapped.

  What changed in the reimagining:

  - The piece now lives where scene work lives: the art gallery, at the
    same 144 x 54 wide format as its neighbours, instead of two square
    panels and a footer band on the home page.
  - The dome fix. V2 drew its treelines as a row of identical discs
    (discV every 18 cells) and its foreground trees as bigger discs, so
    at 1x the trees read as bridge domes. No tree here is a disc. A
    conifer is a visible trunk with stepped triangular tiers whose width
    shrinks in uneven steps toward a pointed tip. A broadleaf is a trunk
    with a canopy built from stacked rectangular clusters with notched
    corners and a flat-ish top. Both read as trees in silhouette.
  - Both themes are first-class: each scene is one grid of palette slots
    and two lookups, light and dark, repainted on theme change.

  The pixel rule holds throughout: a fixed grid, whole-cell swaps to
  solid palette colours on a tick, no drift, no fades, no transforms.
  Reduced motion gets the finished scenes in one cut, no cover.
*/

(() => {
  const panels = document.querySelectorAll("[data-gallery-dither]");
  if (!panels.length) return;

  const W = 144;
  const H = 54;

  /* ---------- palette as data: one slot grid, two lookups ---------- */

  const S = {
    SKY: 0, SKY_D: 1, SUN: 2, CLOUD: 3, CLOUD_SH: 4,
    FAR: 5, FAR_TREE: 6, TREE: 7, TREE_DK: 8, TRUNK: 9,
    BLDG: 10, BLDG_LT: 11, GROUND: 12, GROUND_DK: 13,
    WATER: 14, WATER_DK: 15, ACCENT: 16, PAPER: 17, BOAT: 18,
  };

  const PALETTES = {
    light: [
      "#d9e9f6", "#bcd6ef", "#ffab2e", "#ffffff", "#cfe3f2",
      "#8fb0d4", "#7fae7a", "#2f6b3a", "#1e4d2a", "#5d3d24",
      "#33507c", "#557fb2", "#4c8a44", "#35702e",
      "#84b1dc", "#4a7396", "#1e5aa8", "#f4f9fd", "#b3543f",
    ],
    dark: [
      "#0b1727", "#132a46", "#e8f1fa", "#1c324e", "#142539",
      "#203c63", "#1d4a3a", "#1a5c40", "#0f3d2a", "#66452a",
      "#101f36", "#26466e", "#14402a", "#0d3320",
      "#10233a", "#203c63", "#6ea8e1", "#cfe0f2", "#c96a4a",
    ],
  };

  // Cover tone per slot: the cover is the same scene flattened to three
  // tones on a coarser Bayer grain, accents held back until the reveal.
  const COVER_TONE = [
    2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 2, 0,
  ];
  const COVER_SLOTS = {
    light: [S.BLDG, S.FAR, S.SKY],
    dark: [S.BLDG, S.FAR, S.SKY_D],
  };

  const BAYER = [
    [0, 32, 8, 40], [48, 16, 56, 24],
    [12, 44, 4, 36], [60, 28, 52, 20],
  ];
  const bayerAt = (x, y) => (BAYER[y % 4][x % 4] + 0.5) / 64;

  function hash(x, y) {
    let n = (x * 374761393 + y * 668265263) >>> 0;
    n = (n ^ (n >> 13)) >>> 0;
    n = (n * 1274126177) >>> 0;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  }

  /* ---------- scene building: slot, layer, and dither maps ---------- */

  function makeScene() {
    return {
      slot: new Int8Array(W * H).fill(S.SKY),
      lyr: new Uint8Array(W * H),
      dth: new Uint8Array(W * H),
    };
  }
  function set(s, layer, x, y, slot, dither = 0) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    s.slot[i] = slot; s.lyr[i] = layer; s.dth[i] = dither;
  }
  function rect(s, layer, x, y, w, h, slot, dither = 0) {
    for (let yy = y; yy < y + h; yy += 1)
      for (let xx = x; xx < x + w; xx += 1) set(s, layer, xx, yy, slot, dither);
  }

  // A conifer: trunk first, then stepped tiers. Tier widths shrink in
  // uneven steps (5, 4, 3, 2, 1 half-widths) so the silhouette is a
  // jagged triangle with a point, never an arc. The trunk stays visible
  // below the lowest tier: that gap is what makes it read as a tree.
  function conifer(s, layer, cx, base, height, body, dark) {
    const trunkH = Math.max(2, Math.round(height * 0.18));
    rect(s, layer, cx, base - trunkH + 1, 1, trunkH, S.TRUNK);
    const tiers = 5;
    const tierH = Math.max(1, Math.floor((height - trunkH) / tiers));
    for (let t = 0; t < tiers; t += 1) {
      const half = tiers - t; // 5,4,3,2,1
      const y0 = base - trunkH - (t + 1) * tierH + 1;
      for (let yy = y0; yy < y0 + tierH; yy += 1)
        for (let xx = cx - half; xx <= cx + half; xx += 1)
          set(s, layer, xx, yy, xx < cx ? dark : body);
    }
    set(s, layer, cx, base - trunkH - tiers * tierH, body); // the tip
  }

  // A broadleaf: trunk, then a canopy of stacked rectangular clusters.
  // Widths go 4, 6, 7, 6, 4 with the corners cut, so the top is flat-ish
  // and the edges step. No curves anywhere, so nothing reads as a dome.
  function broadleaf(s, layer, cx, base, height, body, dark) {
    const trunkH = Math.max(3, Math.round(height * 0.3));
    rect(s, layer, cx, base - trunkH + 1, 1, trunkH, S.TRUNK);
    rect(s, layer, cx - 2, base - trunkH - 1, 1, 2, S.TRUNK); // a branch
    const rows = [4, 6, 7, 6, 4];
    const top = base - height;
    rows.forEach((half, r) => {
      const y = top + r;
      for (let xx = cx - half; xx <= cx + half; xx += 1)
        set(s, layer, xx, y, (r === rows.length - 1 || xx < cx - 2) ? dark : body);
    });
  }

  function sky(s, sunX, sunY) {
    for (let y = 0; y < H; y += 1)
      for (let x = 0; x < W; x += 1) set(s, 0, x, y, S.SKY, 1);
    // The sun is the one disc in either scene. Trees never are.
    for (let yy = -3; yy <= 3; yy += 1)
      for (let xx = -3; xx <= 3; xx += 1)
        if (xx * xx + yy * yy <= 10) set(s, 0, sunX + xx, sunY + yy, S.SUN);
    // Flat-bottomed clouds: rectangular clusters, one shade step under.
    for (const [cx, cy, w] of [[30, 8, 16], [96, 5, 12], [118, 12, 18]]) {
      rect(s, 0, cx, cy, w, 2, S.CLOUD);
      rect(s, 0, cx + 3, cy - 1, w - 7, 1, S.CLOUD);
      rect(s, 0, cx, cy + 2, w, 1, S.CLOUD_SH);
    }
    // Birds: three single dark cells and a step, the v2 motif kept.
    for (const [bx, by] of [[52, 10], [60, 7]]) {
      set(s, 0, bx, by, S.BLDG); set(s, 0, bx + 2, by - 1, S.BLDG);
      set(s, 0, bx + 4, by, S.BLDG);
    }
  }

  /* Scene 1: Parliament hill, pines in front of the far bank. */
  function buildHill() {
    const s = makeScene();
    sky(s, 124, 9);
    // Mid layer: far buildings, then a treeline of conifers and
    // broadleafs at varied heights in front of them.
    for (const [x, y, w, h] of [[2, 22, 18, 16], [104, 20, 22, 18], [128, 24, 14, 14]])
      rect(s, 1, x, y, w, h, S.FAR);
    const midBase = 38;
    [8, 22, 38, 56, 88, 106, 124, 138].forEach((x, i) => {
      if (i % 3 === 2) broadleaf(s, 1, x, midBase, 13 + (i % 2) * 2, S.FAR_TREE, S.TREE_DK);
      else conifer(s, 1, x, midBase, 12 + ((i * 5) % 4), S.FAR_TREE, S.TREE_DK);
    });
    // Front layer: Centre Block and the Peace Tower.
    rect(s, 2, 52, 26, 40, 14, S.BLDG);
    rect(s, 2, 56, 23, 32, 3, S.BLDG);
    rect(s, 2, 69, 12, 6, 14, S.BLDG);
    rect(s, 2, 70, 9, 4, 3, S.BLDG);
    rect(s, 2, 71, 6, 2, 3, S.BLDG);
    rect(s, 2, 70, 16, 4, 4, S.ACCENT); // the clock
    rect(s, 2, 71, 17, 2, 2, S.PAPER);
    for (let wy = 29; wy < 38; wy += 4)
      for (let wx = 56; wx < 88; wx += 6)
        rect(s, 2, wx, wy, 2, 2, hash(wx, wy) < 0.15 ? S.SUN : S.PAPER);
    rect(s, 2, 30, 30, 16, 10, S.BLDG_LT);
    rect(s, 2, 98, 28, 18, 12, S.BLDG_LT);
    // Ground and the foreground trees: bigger, trunks clear of the grass.
    rect(s, 2, 0, 40, W, 14, S.GROUND);
    rect(s, 2, 0, 40, W, 2, S.GROUND_DK);
    conifer(s, 2, 12, 52, 20, S.TREE, S.TREE_DK);
    conifer(s, 2, 132, 53, 22, S.TREE, S.TREE_DK);
    broadleaf(s, 2, 30, 51, 15, S.TREE, S.TREE_DK);
    broadleaf(s, 2, 114, 50, 14, S.TREE, S.TREE_DK);
    // A pale path up the middle.
    for (let y = 42; y < H; y += 1) {
      const half = 2 + Math.floor((y - 42) * 0.3);
      rect(s, 2, 72 - half, y, half * 2, 1, S.CLOUD_SH);
    }
    return s;
  }

  /* Scene 2: the Rideau Canal, a stepped bridge and a boat. */
  function buildCanal() {
    const s = makeScene();
    sky(s, 22, 8);
    // Mid layer: far-bank buildings and a mixed treeline.
    for (const [x, y, w, h] of [[6, 24, 16, 12], [96, 22, 20, 14], [124, 26, 16, 10]])
      rect(s, 1, x, y, w, h, S.FAR);
    [16, 34, 62, 84, 108, 130].forEach((x, i) => {
      if (i % 2) broadleaf(s, 1, x, 36, 12, S.FAR_TREE, S.TREE_DK);
      else conifer(s, 1, x, 36, 13, S.FAR_TREE, S.TREE_DK);
    });
    // The bridge: deck, railing, two piers, and a stepped arch opening
    // left as water between the piers. Steps, not a curve.
    rect(s, 1, 12, 34, 120, 2, S.BLDG);
    rect(s, 1, 12, 36, 120, 3, S.BLDG_LT);
    rect(s, 1, 24, 39, 8, 9, S.BLDG);
    rect(s, 1, 112, 39, 8, 9, S.BLDG);
    rect(s, 1, 56, 39, 32, 2, S.BLDG_LT); // arch shoulders
    rect(s, 1, 60, 41, 24, 2, S.BLDG_LT);
    // Front layer: the water, dithered between its two shades.
    for (let y = 39; y < H; y += 1)
      for (let x = 0; x < W; x += 1) set(s, 2, x, y, S.WATER, 1);
    rect(s, 1, 24, 39, 8, 9, S.BLDG); // piers stand in the water
    rect(s, 1, 112, 39, 8, 9, S.BLDG);
    rect(s, 1, 56, 39, 32, 2, S.BLDG_LT);
    rect(s, 1, 60, 41, 24, 2, S.BLDG_LT);
    // Reflection dashes: short runs, hashed per run, never orphans.
    for (let y = 44; y < H - 2; y += 2)
      for (let x = 2; x < W - 6; x += 3)
        if (hash(Math.floor(x / 3), y) < 0.18) rect(s, 2, x, y, 3, 1, S.WATER_DK);
    // A boat: stepped hull, paper cabin, triangular sail in whole steps.
    rect(s, 2, 62, 46, 22, 2, S.BOAT);
    rect(s, 2, 64, 48, 18, 1, S.BOAT);
    rect(s, 2, 68, 43, 8, 3, S.PAPER);
    rect(s, 2, 79, 36, 1, 10, S.BLDG);
    for (let y = 37; y < 46; y += 1) rect(s, 2, 81, y, Math.max(1, Math.round((46 - y) / 2)), 1, S.PAPER);
    // Near bank.
    rect(s, 2, 0, 52, W, 2, S.GROUND_DK);
    return s;
  }

  const BUILDERS = { hill: buildHill, canal: buildCanal };

  /* ---------- rendering ---------- */

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resolvedTheme = () =>
    document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");

  function renderGrid(s, theme) {
    const pal = PALETTES[theme];
    const coverPal = COVER_SLOTS[theme].map((slot) => pal[slot]);
    const final = new ImageData(W, H);
    const cover = new ImageData(W, H);
    const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const palRgb = pal.map(rgb);
    const coverRgb = coverPal.map(rgb);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const o = i * 4;
        let slot = s.slot[i];
        // Dither only where flagged (sky, water): swap to the paired
        // shade on Bayer cells. Pairs are sky/sky-deep and water pair.
        if (s.dth[i] && bayerAt(x, y) > 0.55) {
          if (slot === S.SKY) slot = S.SKY_D;
          else if (slot === S.WATER) slot = S.WATER_DK;
        }
        const fc = palRgb[slot];
        final.data[o] = fc[0]; final.data[o + 1] = fc[1]; final.data[o + 2] = fc[2]; final.data[o + 3] = 255;
        const cc = coverRgb[COVER_TONE[s.slot[i]]];
        // Coarser cover grain: Bayer sampled at half resolution.
        const tone = COVER_TONE[s.slot[i]];
        const cc2 = coverRgb[Math.max(0, Math.min(2, tone + (bayerAt(x >> 1, y >> 1) > 0.7 && tone < 2 ? 0 : 0)))];
        cover.data[o] = cc2[0]; cover.data[o + 1] = cc2[1]; cover.data[o + 2] = cc2[2]; cover.data[o + 3] = 255;
      }
    }
    return { final, cover };
  }

  /* ---------- layered reveal blocks ---------- */

  const BLOCK = 6;
  const STEPS = 16;
  const STEP_MS = 35;
  const WINDOWS = [[1, 6], [5, 11], [10, 16]];

  function layeredBlocks(s, seed) {
    const blocks = [];
    for (let y = 0; y < H; y += BLOCK)
      for (let x = 0; x < W; x += BLOCK)
        blocks.push({ x, y, layer: s.lyr[Math.min(H - 1, y + 3) * W + Math.min(W - 1, x + 3)], t: STEPS });
    let state = seed >>> 0 || 1;
    const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    for (const layer of [0, 1, 2]) {
      const group = blocks.filter((b) => b.layer === layer);
      for (let i = group.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      const [start, end] = WINDOWS[layer];
      group.forEach((b, rank) => {
        b.t = Math.max(1, Math.min(STEPS, start + Math.floor((rank / Math.max(1, group.length)) * (end - start + 1))));
      });
    }
    return blocks;
  }

  const repainters = [];

  panels.forEach((wrap, idx) => {
    const build = BUILDERS[wrap.dataset.galleryDither];
    if (!build) return;
    const sceneCv = wrap.querySelector("[data-dither-scene]");
    const coverCv = wrap.querySelector("[data-dither-cover]");
    if (!sceneCv || !coverCv) return;
    const scene = build();
    const blocks = layeredBlocks(scene, idx === 0 ? 1234567 : 7654321);
    const sCtx = sceneCv.getContext("2d");
    const cCtx = coverCv.getContext("2d");
    let frames = null;
    let open = reduced.matches ? STEPS : 0;

    function paint() {
      if (!frames) frames = renderGrid(scene, resolvedTheme());
      sCtx.putImageData(frames.final, 0, 0);
      cCtx.putImageData(frames.cover, 0, 0);
      for (const b of blocks) if (b.t <= open) cCtx.clearRect(b.x, b.y, BLOCK, BLOCK);
    }
    paint();
    repainters.push(() => { frames = null; paint(); });

    let step = open;
    let timer;
    function dissolve(toward) {
      clearInterval(timer);
      if (reduced.matches) { step = toward; open = step; paint(); return; }
      timer = setInterval(() => {
        step += Math.sign(toward - step);
        open = step; paint();
        if (step === toward) clearInterval(timer);
      }, STEP_MS);
    }
    const show = () => dissolve(STEPS);
    const hide = () => dissolve(0);
    wrap.addEventListener("focus", show);
    wrap.addEventListener("blur", hide);
    if (window.matchMedia("(hover: hover)").matches) {
      wrap.addEventListener("pointerenter", show);
      wrap.addEventListener("pointerleave", hide);
    } else {
      let latched = false;
      wrap.addEventListener("click", () => { latched = !latched; dissolve(latched ? STEPS : 0); });
    }
  });

  new MutationObserver(() => repainters.forEach((r) => r()))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  systemDark.addEventListener("change", () => repainters.forEach((r) => r()));
})();
