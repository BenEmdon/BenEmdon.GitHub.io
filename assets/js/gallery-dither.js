/*
  Gallery: dither installation, art quality pass (2026-11-22).

  Ben's verdict on the first staging: "You can do better art! Give it a
  go." This pass keeps the layered reveal, the fixed grid, solid palette
  colours and the section's place on the art page, and rebuilds the two
  scenes for detail inside surfaces and shading depth.

  Anchor (per the local_pixel_art skill):
  - Subjects: Parliament Hill (Centre Block and Peace Tower) and the
    Rideau Canal locks. Grid 144 x 72, up from 144 x 54 for detail room.
  - Palette: stored below as data, hue-shifted ramps per material
    (stone 4, copper roof 3, foliage 3 plus a muted far ramp, water 5,
    sky 4). 37 slots total across both themes; each scene uses a subset.
  - Light: one source, high left. Lit faces take the lighter ramp step,
    right and under faces the darker one, everywhere.
  - Layers, back to front: sky / far bank / subject / foreground.
    Far layers use muted, lighter slots so value separates the depth.
  - Smallest subject: the Peace Tower clock, 6 x 6 cells, must read as
    a clock face with hands at 1x.
  - Dither: only between neighbouring shades, only in the sky band
    boundaries and in open water. Fallback is the flat band step, and
    band centres stay flat.
  - Trees: no discs. Conifers are trunks with stepped tiers, broadleaf
    canopies are stacked clusters shaded per cluster, denser than v1.

  The pixel rule holds: whole-cell swaps to solid palette colours on a
  tick, no drift, no fades, no transforms. Reduced motion gets the
  finished scenes in one cut, no cover.
*/

(() => {
  const panels = document.querySelectorAll("[data-gallery-dither]");
  if (!panels.length) return;

  const W = 144;
  const H = 72;

  /* ---------- palette as data: one slot grid, two lookups ---------- */

  const S = {
    SKY_A: 0, SKY_B: 1, SKY_C: 2, SKY_D: 3, SUN: 4, CLOUD: 5, CLOUD_SH: 6,
    FAR: 7, FAR_TREE: 8, FAR_DK: 9,
    STONE_DK: 10, STONE: 11, STONE_LT: 12, STONE_PALE: 13,
    ROOF_DK: 14, ROOF: 15, ROOF_LT: 16,
    GLASS: 17, PAPER: 18, GLASS_DK: 19,
    TREE_DK: 20, TREE: 21, TREE_LT: 22, TRUNK: 23,
    GROUND_DK: 24, GROUND: 25, GROUND_LT: 26,
    WATER_DEEP: 27, WATER_DK: 28, WATER: 29, WATER_LT: 30, WATER_SP: 31,
    ACCENT: 32, BOAT: 33, TIMBER: 34, TIMBER_DK: 35, PATH: 36,
  };

  const PALETTES = {
    light: [
      "#9ec2e6", "#bcd6ef", "#d9e9f6", "#eaf3fb", "#ffab2e", "#ffffff", "#cfe3f2",
      "#a9bedd", "#8fbc8a", "#6f9a72",
      "#243a5c", "#33507c", "#557fb2", "#8aa8cc",
      "#173d27", "#1e6b3a", "#35975a",
      "#ffd98a", "#f4f9fd", "#16283f",
      "#14301c", "#2f6b3a", "#4a8a52", "#5d3d24",
      "#2e5d27", "#35702e", "#4c8a44",
      "#2f5678", "#4a7396", "#84b1dc", "#a9cdec", "#e6f2fb",
      "#1e5aa8", "#b3543f", "#6b4423", "#4a2c14", "#d8c9a3",
    ],
    dark: [
      "#0b1727", "#122740", "#1a3552", "#233d5c", "#e8b34b", "#2a4666", "#1c324e",
      "#2a4066", "#24503c", "#183d2c",
      "#0c1828", "#16283f", "#26466e", "#3a5a85",
      "#0a2417", "#12402a", "#1d5c38",
      "#ffd98a", "#dbe9f7", "#081120",
      "#0a2a1a", "#1a5c40", "#2a7a52", "#66452a",
      "#0d3320", "#14402a", "#1d5c38",
      "#0a1a2c", "#162c48", "#2a4a75", "#4a739e", "#a9cdec",
      "#6ea8e1", "#c96a4a", "#7a5230", "#4a3018", "#5c5340",
    ],
  };

  // Dither partner per slot: the neighbouring shade in the same ramp.
  const DPAIR = [];
  DPAIR[S.SKY_A] = S.SKY_B; DPAIR[S.SKY_B] = S.SKY_C; DPAIR[S.SKY_C] = S.SKY_D;
  DPAIR[S.WATER] = S.WATER_DK; DPAIR[S.WATER_LT] = S.WATER;

  // Cover tone per slot: the cover is the scene flattened to three tones.
  const COVER_TONE = [
    2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 2, 2, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 2, 2, 1, 0, 0, 0, 2,
  ];
  const COVER_SLOTS = {
    light: [S.STONE_DK, S.FAR, S.SKY_C],
    dark: [S.STONE_DK, S.FAR, S.SKY_D],
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

  /* ---------- scene building ---------- */

  function makeScene() {
    return {
      slot: new Int8Array(W * H).fill(S.SKY_C),
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
  // A short horizontal cluster run, the smallest texture unit used here.
  function run(s, layer, x, y, len, slot) { rect(s, layer, x, y, len, 1, slot); }

  /* Stonework: a base shade, a darker course line every four rows drawn
     in broken segments, and seeded 2 to 3 cell texture clusters in the
     neighbouring shades. No single-pixel texture anywhere. */
  function stone(s, layer, x, y, w, h, base, seed = 0, course = S.STONE_DK) {
    rect(s, layer, x, y, w, h, base);
    for (let yy = y + 3; yy < y + h - 1; yy += 4)
      for (let xx = x + 1; xx < x + w - 3; xx += 5)
        if (hash(xx + seed, yy) < 0.75) run(s, layer, xx, yy, 3, course);
    for (let yy = y + 1; yy < y + h - 1; yy += 2)
      for (let xx = x + 1; xx < x + w - 3; xx += 4) {
        const r = hash(xx * 3 + seed, yy * 7);
        if (r < 0.16) run(s, layer, xx, yy, 2, S.STONE_LT);
        else if (r > 0.88) run(s, layer, xx, yy, 2, S.STONE_DK);
      }
    // Lit left edge, shaded right edge: the one light source.
    rect(s, layer, x, y, 1, h, S.STONE_LT);
    rect(s, layer, x + w - 1, y, 1, h, S.STONE_DK);
  }

  /* A window rhythm: 2 x 3 windows on a fixed pitch, dark glass with a
     pale lintel row, a seeded few lit warm. */
  function windows(s, layer, x0, y0, cols, rows, pitchX = 6, pitchY = 7, seed = 0) {
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const wx = x0 + c * pitchX, wy = y0 + r * pitchY;
        run(s, layer, wx, wy - 1, 2, S.STONE_PALE);
        rect(s, layer, wx, wy, 2, 3, hash(wx + seed, wy) < 0.22 ? S.GLASS : S.GLASS_DK);
      }
  }

  /* A stepped gable roof in three discrete shades: lit slope, mid cap,
     dark underside row. Steps only, no diagonal pixels runs of one. */
  function gable(s, layer, cx, topY, halfW, h, seed = 0) {
    for (let r = 0; r < h; r += 1) {
      const hw = Math.max(1, Math.round(halfW * (r + 1) / h));
      const y = topY + r;
      rect(s, layer, cx - hw, y, hw, 1, S.ROOF_LT);
      rect(s, layer, cx, y, hw, 1, S.ROOF);
      if (r === h - 1) rect(s, layer, cx - hw, y + 1, hw * 2, 1, S.ROOF_DK);
    }
  }

  /* Conifer: trunk, then stepped tiers. Each tier is shaded in three
     vertical steps (dark left under, body, one lit column right of the
     centre where the light lands), and tier widths shrink unevenly. */
  function conifer(s, layer, cx, base, height, body, dark, light) {
    const trunkH = Math.max(2, Math.round(height * 0.16));
    rect(s, layer, cx, base - trunkH + 1, 1, trunkH, S.TRUNK);
    const tiers = 6;
    const tierH = Math.max(1, Math.floor((height - trunkH) / tiers));
    const widths = [6, 5, 5, 3, 2, 1];
    for (let t = 0; t < tiers; t += 1) {
      const half = widths[t];
      const y0 = base - trunkH - (t + 1) * tierH + 1;
      for (let yy = y0; yy < y0 + tierH; yy += 1)
        for (let xx = cx - half; xx <= cx + half; xx += 1)
          set(s, layer, xx, yy, xx < cx - 1 ? dark : xx > cx ? light : body);
    }
    set(s, layer, cx, base - trunkH - tiers * tierH, light);
  }

  /* Broadleaf: trunk and branch, then a canopy of stacked clusters.
     Each cluster is shaded on its own: lit top row, body, dark base
     row, so the bundle seams stay visible instead of one flat mass. */
  function broadleaf(s, layer, cx, base, height, body, dark, light) {
    const trunkH = Math.max(3, Math.round(height * 0.3));
    rect(s, layer, cx, base - trunkH + 1, 1, trunkH, S.TRUNK);
    rect(s, layer, cx - 2, base - trunkH - 1, 1, 2, S.TRUNK);
    rect(s, layer, cx + 1, base - trunkH, 1, 2, S.TRUNK);
    const top = base - height;
    const clusters = [
      [cx - 4, top + 3, 9, 4], [cx - 6, top + 5, 13, 4],
      [cx - 3, top, 7, 4], [cx + 1, top + 2, 6, 3],
    ];
    for (const [x, y, w, h] of clusters) {
      rect(s, layer, x, y, w, h, body);
      run(s, layer, x + 1, y, w - 2, light);
      rect(s, layer, x, y + h - 1, w, 1, dark);
      set(s, layer, x, y, dark); set(s, layer, x + w - 1, y, dark);
    }
  }

  /* Sky in four flat bands. Dither lives only in the two rows at each
     band boundary; band centres stay flat. */
  function sky(s, sunX, sunY) {
    const bands = [[0, 10, S.SKY_A], [10, 22, S.SKY_B], [22, 34, S.SKY_C], [34, H, S.SKY_D]];
    for (const [y0, y1, slot] of bands)
      for (let y = y0; y < y1; y += 1)
        for (let x = 0; x < W; x += 1) set(s, 0, x, y, slot);
    // Flat fallback in use: full-width boundary dither read as dotted
    // lines at 1x in pass 1, so the bands step flat, no dither rows.
    for (let yy = -3; yy <= 3; yy += 1)
      for (let xx = -3; xx <= 3; xx += 1)
        if (xx * xx + yy * yy <= 10) set(s, 0, sunX + xx, sunY + yy, S.SUN);
    // Flat-bottomed clouds with a shaded underside and a lit top step.
    for (const [cx, cy, w] of [[26, 10, 18], [92, 7, 13], [114, 15, 20]]) {
      rect(s, 0, cx + 3, cy - 1, w - 7, 1, S.CLOUD);
      rect(s, 0, cx, cy, w, 2, S.CLOUD);
      rect(s, 0, cx, cy + 2, w, 1, S.CLOUD_SH);
      run(s, 0, cx + 4, cy + 2, w - 9, S.CLOUD_SH);
    }
    for (const [bx, by] of [[54, 12], [63, 9]]) {
      set(s, 0, bx, by, S.STONE_DK); set(s, 0, bx + 2, by - 1, S.STONE_DK);
      set(s, 0, bx + 4, by, S.STONE_DK);
    }
  }

  /* ---------- Scene 1: Parliament Hill ---------- */
  function buildHill() {
    const s = makeScene();
    sky(s, 124, 10);
    // Far bank: muted blocks, value held back so the subject pops.
    for (const [x, y, w, h] of [[0, 34, 16, 14], [106, 32, 20, 16], [130, 36, 14, 12]]) {
      rect(s, 1, x, y, w, h, S.FAR);
      windows(s, 1, x + 3, y + 3, Math.floor(w / 6), 1, 6, 7, 5);
    }
    const midBase = 48;
    [6, 18, 30, 42, 96, 108, 120, 132, 140].forEach((x, i) => {
      if (i % 3 === 1) broadleaf(s, 1, x, midBase, 14 + (i % 2) * 3, S.FAR_TREE, S.FAR_DK, S.FAR_TREE);
      else conifer(s, 1, x, midBase, 13 + ((i * 5) % 5), S.FAR_TREE, S.FAR_DK, S.FAR_TREE);
    });
    // West and East blocks: stone, own gables, own window rhythm.
    stone(s, 2, 24, 42, 20, 16, S.STONE, 11);
    gable(s, 2, 34, 36, 10, 6);
    windows(s, 2, 28, 46, 3, 2, 6, 7, 21);
    stone(s, 2, 100, 42, 20, 16, S.STONE, 31);
    gable(s, 2, 110, 36, 10, 6);
    windows(s, 2, 104, 46, 3, 2, 6, 7, 41);
    // Centre Block: stone body, stepped roof in three shades, a
    // central gable, and a regular window rhythm over two floors.
    stone(s, 2, 46, 40, 52, 18, S.STONE_LT, 51, S.STONE);
    rect(s, 2, 46, 38, 52, 2, S.ROOF_DK);
    gable(s, 2, 72, 30, 15, 8);
    windows(s, 2, 50, 44, 8, 2, 6, 7, 61);
    rect(s, 2, 70, 52, 4, 6, S.GLASS_DK); // the door
    run(s, 2, 70, 51, 4, S.STONE_PALE);
    // Peace Tower: stepped spire with a finial, a clock with hands,
    // a lit shaft with slit windows, and a flared base.
    rect(s, 2, 71, 2, 2, 3, S.STONE_DK);
    for (let r = 0; r < 6; r += 1) rect(s, 2, 72 - Math.floor(r / 2), 5 + r, 2 + Math.floor(r / 2) * 1, 1, r < 2 ? S.ROOF_LT : S.ROOF);
    rect(s, 2, 69, 11, 6, 3, S.ROOF_DK);
    stone(s, 2, 68, 14, 8, 26, S.STONE_LT, 71, S.STONE);
    rect(s, 2, 69, 16, 6, 6, S.ACCENT); // clock surround
    rect(s, 2, 70, 17, 4, 4, S.PAPER); // clock face
    set(s, 2, 72, 18, S.STONE_DK); set(s, 2, 72, 19, S.STONE_DK);
    set(s, 2, 71, 19, S.STONE_DK); set(s, 2, 72, 17, S.STONE_DK);
    rect(s, 2, 71, 25, 2, 3, S.GLASS_DK);
    rect(s, 2, 71, 31, 2, 3, S.GLASS_DK);
    rect(s, 2, 66, 38, 12, 2, S.STONE);
    // Ground: three grass shades in clusters, a pale path to the door.
    rect(s, 2, 0, 58, W, 14, S.GROUND);
    rect(s, 2, 0, 58, W, 2, S.GROUND_DK);
    for (let y = 60; y < H - 1; y += 2)
      for (let x = 1; x < W - 4; x += 4) {
        const r = hash(x * 5, y * 3);
        if (r < 0.2) run(s, 2, x, y, 3, S.GROUND_LT);
        else if (r > 0.86) run(s, 2, x, y, 2, S.GROUND_DK);
      }
    for (let y = 59; y < H; y += 1) {
      const half = 2 + Math.floor((y - 59) * 0.35);
      rect(s, 2, 72 - half, y, half * 2, 1, S.PATH);
      run(s, 2, 72 - half, y, 2, S.GROUND_LT);
    }
    // Foreground trees: denser, varied, trunks clear of the grass.
    conifer(s, 2, 10, 70, 26, S.TREE, S.TREE_DK, S.TREE_LT);
    conifer(s, 2, 134, 71, 28, S.TREE, S.TREE_DK, S.TREE_LT);
    conifer(s, 2, 44, 68, 17, S.TREE, S.TREE_DK, S.TREE_LT);
    broadleaf(s, 2, 26, 69, 19, S.TREE, S.TREE_DK, S.TREE_LT);
    broadleaf(s, 2, 118, 68, 18, S.TREE, S.TREE_DK, S.TREE_LT);
    broadleaf(s, 2, 58, 67, 13, S.TREE, S.TREE_DK, S.TREE_LT);
    return s;
  }

  /* ---------- Scene 2: the Rideau Canal locks ---------- */
  function buildCanal() {
    const s = makeScene();
    sky(s, 20, 9);
    // Far bank: muted buildings behind a dense mixed treeline.
    for (const [x, y, w, h] of [[4, 30, 18, 14], [98, 28, 22, 16], [126, 32, 16, 12]]) {
      rect(s, 1, x, y, w, h, S.FAR);
      windows(s, 1, x + 3, y + 3, Math.floor(w / 6), 1, 6, 7, 7);
    }
    [10, 22, 34, 48, 62, 84, 96, 110, 124, 136].forEach((x, i) => {
      if (i % 2) broadleaf(s, 1, x, 44, 13 + (i % 3), S.FAR_TREE, S.FAR_DK, S.FAR_TREE);
      else conifer(s, 1, x, 44, 14 + ((i * 3) % 4), S.FAR_TREE, S.FAR_DK, S.FAR_TREE);
    });
    // The bridge, mid layer: deck, railing posts, piers, stepped arch.
    rect(s, 1, 8, 42, 128, 2, S.STONE);
    for (let x = 12; x < 134; x += 6) rect(s, 1, x, 40, 1, 2, S.STONE_DK);
    rect(s, 1, 8, 39, 128, 1, S.STONE_LT);
    rect(s, 1, 8, 44, 128, 2, S.STONE_LT);
    stone(s, 1, 20, 46, 9, 12, S.STONE, 13);
    stone(s, 1, 115, 46, 9, 12, S.STONE, 23);
    rect(s, 1, 52, 46, 40, 2, S.STONE_LT);
    rect(s, 1, 57, 48, 30, 2, S.STONE_LT);
    // Open water: flat mid shade, dither patches toward the dark shade,
    // and reflected light as broken clusters of 2 to 4 cells.
    for (let y = 46; y < H; y += 1)
      for (let x = 0; x < W; x += 1) set(s, 2, x, y, S.WATER, hash(x >> 2, y >> 1) < 0.15 ? 1 : 0);
    rect(s, 2, 0, 46, W, 2, S.WATER_DK);
    for (let y = 50; y < 62; y += 2)
      for (let x = 2; x < W - 5; x += 3) {
        const r = hash(Math.floor(x / 3) * 7, y);
        if (r < 0.16) run(s, 2, x, y, 3, S.WATER_LT);
        else if (r > 0.9) run(s, 2, x, y, 2, S.WATER_SP);
      }
    stone(s, 1, 20, 46, 9, 12, S.STONE, 13); // piers stand in the water
    stone(s, 1, 115, 46, 9, 12, S.STONE, 23);
    rect(s, 1, 52, 46, 40, 2, S.STONE_LT);
    rect(s, 1, 57, 48, 30, 2, S.STONE_LT);
    // A boat on the upper reach: stepped hull, cabin, stepped sail.
    rect(s, 2, 26, 54, 22, 2, S.BOAT);
    rect(s, 2, 28, 56, 17, 1, S.TIMBER_DK);
    rect(s, 2, 32, 51, 8, 3, S.PAPER);
    run(s, 2, 32, 50, 8, S.BOAT);
    rect(s, 2, 43, 44, 1, 10, S.STONE_DK);
    for (let y = 45; y < 54; y += 1) rect(s, 2, 45, y, Math.max(1, Math.round((54 - y) / 2)), 1, S.PAPER);
    run(s, 2, 28, 58, 14, S.WATER_SP); // its wake reflection
    // Lock walls: stonework flanking the gates at the near end.
    stone(s, 2, 0, 60, 34, 12, S.STONE, 91);
    stone(s, 2, 110, 60, 34, 12, S.STONE, 97);
    rect(s, 2, 0, 59, 34, 1, S.STONE_PALE);
    rect(s, 2, 110, 59, 34, 1, S.STONE_PALE);
    // Lock gates: two timber panels meeting at the centre, each with
    // horizontal iron bands and a stepped diagonal beam.
    for (const gx of [36, 74]) {
      rect(s, 2, gx, 60, 34, 12, S.TIMBER);
      for (let x = gx + 4; x < gx + 34; x += 5) rect(s, 2, x, 60, 1, 12, S.TIMBER_DK);
      rect(s, 2, gx, 62, 34, 1, S.STONE_DK);
      rect(s, 2, gx, 68, 34, 1, S.STONE_DK);
      for (let d = 0; d < 10; d += 1) rect(s, 2, gx + 2 + d * 3, 70 - d, 3, 1, S.TIMBER_DK);
      rect(s, 2, gx, 59, 34, 1, S.TIMBER_DK);
    }
    rect(s, 2, 71, 58, 2, 14, S.STONE_DK); // centre meeting post
    run(s, 2, 40, 58, 20, S.WATER_LT); // light held above the gates
    run(s, 2, 84, 58, 20, S.WATER_LT);
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
        if (s.dth[i] && DPAIR[slot] !== undefined && bayerAt(x, y) > 0.55) slot = DPAIR[slot];
        const fc = palRgb[slot];
        final.data[o] = fc[0]; final.data[o + 1] = fc[1]; final.data[o + 2] = fc[2]; final.data[o + 3] = 255;
        const cc = coverRgb[COVER_TONE[s.slot[i]]];
        cover.data[o] = cc[0]; cover.data[o + 1] = cc[1]; cover.data[o + 2] = cc[2]; cover.data[o + 3] = 255;
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
