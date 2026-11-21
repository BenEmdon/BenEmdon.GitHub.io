/*
  Gallery: mountains.

  Layered blue ridges over a snowy valley, drawn the way everything on
  this site is drawn: a grid of cells, a palette kept as data, and a
  renderer that only ever swaps whole cells between palette colours.

  The scene is slot indices, not colours. The bitmap is built once from
  peak tables and character stamps, and each theme is just a palette the
  slots point into, so night is the same mountains with a different
  lookup: deeper blues, a moon, and the cabin window gone warm.

  Snow is the one moving part, and it moves the way the pixel rule
  allows: each flake sits in a fixed column and steps down one whole row
  on its own seeded tick, a whole-cell swap with a long rest between
  steps. A flake that reaches a solid cell (a ridge, a roof, the valley
  floor) recycles to the top. Reduced motion gets one static frame with
  no snow and no timers.
*/

(() => {
  const canvas = document.querySelector('[data-gallery="mountains"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 45;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its own
  // hexes. By day the star and moon slots collapse to the sky hex, so
  // the night sky is drawn by the same bitmap and simply stays hidden.
  const S = {
    SKY: 0,
    STAR: 1,
    MOON: 2,
    FAR: 3,
    FAR_SNOW: 4,
    MID: 5,
    MID_SNOW: 6,
    NEAR: 7,
    NEAR_SNOW: 8,
    VALLEY: 9,
    TREE: 10,
    WALL: 11,
    ROOF: 12,
    WINDOW: 13,
    FLAKE: 14,
  };

  const PALETTES = {
    light: [
      "#d9e9f6", // sky
      "#d9e9f6", // star (sky by day)
      "#d9e9f6", // moon (sky by day)
      "#a9c6e4", // far ridge
      "#f4f9fd", // far snow
      "#6f97c4", // mid ridge
      "#eef5fb", // mid snow
      "#3a5a8c", // near ridge
      "#e6f0f9", // near snow
      "#e9f2f9", // valley snowfield
      "#1e4d4a", // conifers
      "#8a5a33", // cabin wall
      "#5d3d24", // cabin roof and door, the cabin's darkest wood
      "#2c4258", // window by day, dark glass
      "#fbfdfe", // falling snow
    ],
    dark: [
      "#0b1727", // sky
      "#cfe4f7", // star
      "#e8f1fa", // moon
      "#2c4a73", // far ridge
      "#b9d2ea", // far snow
      "#203c63", // mid ridge
      "#a9c6e4", // mid snow
      "#132740", // near ridge
      "#8fb0d4", // near snow
      "#182c44", // valley snowfield
      "#0d2b30", // conifers
      "#66452a", // cabin wall
      "#402a17", // cabin roof and door
      "#ffb347", // window by night, lit warm
      "#d9ecfa", // falling snow
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
  const isSolid = (slot) =>
    slot !== S.SKY && slot !== S.STAR && slot !== S.MOON;

  // A ridge is a table of peaks: apex column, apex row, half width, and
  // the half width of its snow cap. The silhouette at a column is the
  // highest triangle that covers it; the cap hugs the surface for two
  // cells inside the cap width and tapers to one at its edge.
  function paintRidge(peaks, baseY, slot, snowSlot) {
    for (let x = 0; x < W; x += 1) {
      let top = baseY;
      let owner = null;
      for (const p of peaks) {
        const y = p.apex + Math.round((Math.abs(x - p.x) * (baseY - p.apex)) / p.half);
        if (y < top) {
          top = y;
          owner = p;
        }
      }
      for (let y = top; y < H; y += 1) grid[at(x, y)] = slot;
      if (!owner || !owner.cap) continue;
      const dx = Math.abs(x - owner.x);
      const thick = dx <= owner.cap ? 2 : dx === owner.cap + 1 ? 1 : 0;
      for (let k = 0; k < thick; k += 1) grid[at(x, top + k)] = snowSlot;
    }
  }

  function stamp(rows, left, topY, map) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const slot = map[ch];
        if (slot === undefined) return;
        const x = left + dx;
        const y = topY + dy;
        if (x >= 0 && x < W && y >= 0 && y < H) grid[at(x, y)] = slot;
      });
    });
  }

  function buildGrid() {
    grid.fill(S.SKY);

    paintRidge(
      [
        { x: 14, apex: 12, half: 16, cap: 5 },
        { x: 38, apex: 9, half: 18, cap: 6 },
        { x: 62, apex: 13, half: 15, cap: 4 },
        { x: 86, apex: 10, half: 17, cap: 6 },
        { x: 108, apex: 14, half: 14, cap: 4 },
      ],
      24,
      S.FAR,
      S.FAR_SNOW,
    );
    paintRidge(
      [
        { x: 8, apex: 20, half: 14, cap: 4 },
        { x: 30, apex: 16, half: 17, cap: 6 },
        { x: 55, apex: 21, half: 13, cap: 3 },
        { x: 76, apex: 15, half: 18, cap: 6 },
        { x: 100, apex: 19, half: 15, cap: 4 },
        { x: 116, apex: 22, half: 10, cap: 3 },
      ],
      32,
      S.MID,
      S.MID_SNOW,
    );
    paintRidge(
      [
        { x: 20, apex: 26, half: 20, cap: 5 },
        { x: 52, apex: 30, half: 16, cap: 3 },
        { x: 84, apex: 27, half: 19, cap: 5 },
        { x: 112, apex: 31, half: 12, cap: 0 },
      ],
      40,
      S.NEAR,
      S.NEAR_SNOW,
    );

    // The valley floor: a flat snowfield over the ridges' feet.
    for (let y = 40; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.VALLEY;
    }

    // Night sky furniture, drawn only where the sky is still sky. By
    // day both slots wear the sky hex and none of this shows.
    const skyRng = mulberry32(20261122);
    for (let i = 0; i < 16; i += 1) {
      const x = Math.floor(skyRng() * W);
      const y = Math.floor(skyRng() * 9);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.STAR;
    }
    const MOON = [
      "..XXX..",
      ".XXXXX.",
      "XXXXXXX",
      "XXXXXXX",
      "XXXXXXX",
      ".XXXXX.",
      "..XXX..",
    ];
    MOON.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch !== "X") return;
        const x = 13 + dx;
        const y = 2 + dy;
        if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.MOON;
      });
    });

    // The treeline: tiny conifers along the near ridge's foot, seeded
    // positions and sizes, kept clear of the cabin's clearing.
    const CONIFER_SMALL = [".X.", "XXX", "XXX", ".X."];
    const CONIFER_LARGE = ["..X..", "..X..", ".XXX.", ".XXX.", "XXXXX", "..X.."];
    const treeRng = mulberry32(20261123);
    let tx = 1;
    while (tx < W - 6) {
      tx += 4 + Math.floor(treeRng() * 8);
      if (tx > 74 && tx < 97) continue;
      const dy = treeRng() < 0.5 ? 0 : 1; // not every tree on the same line
      if (treeRng() < 0.45) {
        stamp(CONIFER_LARGE, tx, 36 + dy, { X: S.TREE });
        if (treeRng() < 0.25) stamp(CONIFER_SMALL, tx + 6, 38 + dy, { X: S.TREE });
      } else {
        stamp(CONIFER_SMALL, tx, 38 + dy, { X: S.TREE });
      }
    }

    // The cabin, in its clearing. C is the chimney, S the snow on the
    // roof, R the roof and door in the darkest wood, W the walls, w the
    // window that lights up at night.
    stamp(
      [
        ".....CC......",
        ".....CC......",
        "....SSSS.....",
        "...SRRRRRS...",
        "..RRRRRRRRR..",
        ".RWWWWWWWWWR.",
        ".RWWwwWWWDWR.",
        ".RWWwwWWWDWR.",
        ".RWWWWWWWWWR.",
        ".RWWWWWWWWWR.",
      ],
      79,
      33,
      { C: S.ROOF, S: S.NEAR_SNOW, R: S.ROOF, W: S.WALL, w: S.WINDOW, D: S.ROOF },
    );
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

  /* ---------- snowfall ---------- */

  const FLAKE_COUNT = 26;
  const flakeRng = mulberry32(20261124);
  const flakes = [];
  for (let i = 0; i < FLAKE_COUNT; i += 1) {
    flakes.push({
      x: Math.floor(flakeRng() * W),
      y: Math.floor(flakeRng() * H) - 10,
      period: 2 + Math.floor(flakeRng() * 3), // step every 2 to 4 ticks
      phase: Math.floor(flakeRng() * 4),
    });
  }

  function stepFlake(f) {
    const ny = f.y + 1;
    if (ny >= H || isSolid(grid[at(f.x, ny)])) {
      f.y = -1 - Math.floor(flakeRng() * 8);
      f.x = Math.floor(flakeRng() * W);
      return;
    }
    f.y = ny;
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
    if (reduced.matches) return;
    ctx.fillStyle = PALETTES[resolvedTheme()][S.FLAKE];
    for (const f of flakes) {
      if (f.y < 0) continue;
      if (isSolid(grid[at(f.x, f.y)])) continue;
      ctx.fillRect(f.x, f.y, 1, 1);
    }
  }

  buildGrid();
  paintStill();
  frame();

  // A theme swap re-points the slots at the other palette and repaints.
  const repaint = () => {
    paintStill();
    frame();
  };
  new MutationObserver(repaint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", repaint);

  if (reduced.matches) return; // one static frame, no snow, no timers

  let tick = 0;
  setInterval(() => {
    if (document.hidden) return;
    tick += 1;
    let stepped = false;
    for (const f of flakes) {
      if ((tick + f.phase) % f.period === 0) {
        stepFlake(f);
        stepped = true;
      }
    }
    if (stepped) frame();
  }, 140);
})();
