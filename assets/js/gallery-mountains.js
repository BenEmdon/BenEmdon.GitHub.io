/*
  Gallery: mountains, v2.

  Ben on v1: "a bit simplistic compared to the one on the main page.
  Consider different perspectives." V1 was three flat ridge silhouettes
  over a flat snowfield. V2 keeps the grid, the slot bitmap, and the
  two-palette architecture, and rebuilds the composition with the
  meadow's depth devices and a named reference: Hyper Light Drifter's
  cliff vista (full notes in anchor-v2.md).

  What changed, device by device:

  - The sky takes close to half the frame and stays quiet (HLD:
    emptiness is a composition choice). The ridges are pushed down
    and the far ridge is washed almost all the way to the sky colour,
    further than feels safe; the mid ridge sits one clear step
    deeper, and only the near plane keeps full contrast.
  - The main peak has form: a lit west face and a shadow east face
    from the one light source (upper left), a snow cap split by the
    ridge line, bright on the lit face, cooler and dimmer on the
    shadow face, and horizontal strata bands crossing both faces
    (Sea of Stars: elevation is drawn, never implied).
  - A lake in the valley is the middle plane. It holds a stepped,
    broken reflection of the main peak and of the cabin, whose
    window light shows in the water after dark: the scene's one
    saturated accent, rationed the HLD way, in the site's own
    Sheikah orange. The day scene stays quiet so it lands.
  - A foreground plane v1 lacked: a dark slope rising from the
    bottom-left corner, its top edge drawn as a cliff rim (a broken
    snowy rim row, rock strata outcrops under it), a low bank at the
    bottom right, and conifers at Owlboy scale, 12 to 20 cells tall,
    two of them cropped by the frame edges.

  Motion stays inside the pixel rule. Snow steps down fixed columns
  one whole row per seeded tick and recycles on solid ground or on
  the lake's surface; nothing accumulates. Chimney smoke spawns at
  the chimney, steps up one whole row per seeded tick, drifts a
  column at seeded intervals, and dissolves after a seeded lifetime.
  Whole-cell swaps only. Reduced motion gets one static frame: no
  snow, no smoke, no timers.
*/

import { registerTask } from "./boot.js?v=20261122o";
(() => {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting mountains", { timeout: 12000 });
  const canvas = document.querySelector('[data-gallery="mountains"]');
  if (!canvas) { sceneTask.complete(); return; }
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 45;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its own
  // hexes, so night is the same valley with a different lookup. The
  // budget is 16 unique hexes per theme. Slots share hexes where a
  // distinction only exists in one light: by day the moon slot wears
  // the sky hex (the night sky stays hidden), the shadow-face snow
  // wears the valley hex, and the window's reflection wears the
  // reflection hex; by night the smoke wears the mid-ridge hex, the
  // peak's reflection wears it too, and the foreground slope wears
  // the shadow face's hex.
  const S = {
    SKY: 0,
    MOON: 1,
    FAR: 2,
    MID: 3,
    NEAR_SHADOW: 4,
    NEAR_LIT: 5,
    STRATA: 6,
    SNOW: 7,
    SNOW_SH: 8,
    LAKE: 9,
    LAKE_REFL: 10,
    VALLEY: 11,
    TREE: 12,
    WALL: 13,
    ROOF: 14,
    WINDOW: 15,
    REFL_LIGHT: 16,
    SMOKE: 17,
    FG: 18,
  };

  const PALETTES = {
    light: [
      "#d9e9f6", // sky
      "#d9e9f6", // moon and stars (sky by day)
      "#c4daf0", // far ridge, washed almost to the sky
      "#8fb0d4", // mid ridge, one clear step deeper
      "#33507c", // near shadow face and ridge body
      "#557fb2", // near lit face
      "#44699c", // strata, between the faces
      "#f4f9fd", // snow: lit caps, tree snow, roof snow, flakes
      "#e9f2f9", // shadow-face snow (= valley by day)
      "#84b1dc", // lake, the sky held in the valley
      "#4a7396", // lake reflection, the peak muted in water
      "#e9f2f9", // valley snowfield and shores
      "#1e4d4a", // conifers
      "#8a5a33", // cabin wall, kept quiet by day
      "#5d3d24", // cabin roof and door, its darkest wood
      "#2c4258", // window by day, dark glass
      "#4a7396", // window reflection (= reflection by day)
      "#e8eef4", // chimney smoke
      "#1d3a2e", // foreground slope, the darkest plane
    ],
    dark: [
      "#0b1727", // sky
      "#e8f1fa", // moon and stars
      "#16283f", // far ridge, washed toward the night sky
      "#203c63", // mid ridge
      "#101f36", // near shadow face and ridge body
      "#26466e", // near lit face, moonlit
      "#1a3454", // strata
      "#cfe0f2", // snow, moonlit
      "#7ea6cf", // shadow-face snow, cooler and dimmer
      "#10233a", // lake
      "#203c63", // lake reflection (= mid ridge by night)
      "#182c44", // valley snowfield and shores
      "#0d2b30", // conifers
      "#66452a", // cabin wall
      "#402a17", // cabin roof and door
      "#ff9e2c", // window by night: the one saturated accent
      "#ff9e2c", // window reflection (= window by night)
      "#203c63", // chimney smoke (= mid ridge by night)
      "#101f36", // foreground slope (= shadow face by night)
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
  // Snow lands on anything that is not open sky: ridges, roofs, the
  // valley floor, and the lake's surface all end a flake's fall.
  const isSolid = (slot) => slot !== S.SKY && slot !== S.MOON;

  // A ridge is a table of peaks: apex column, apex row, half width,
  // and the half width of its snow cap. The silhouette at a column is
  // the highest triangle that covers it; the cap hugs the surface for
  // two cells inside the cap width and tapers to one at its edge.
  function paintRidge(peaks, baseY, slot, snowSlot, thinCaps) {
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
      if (!owner || !owner.cap || snowSlot === null) continue;
      const dx = Math.abs(x - owner.x);
      const thick = thinCaps
        ? dx <= owner.cap
          ? 1
          : 0
        : dx <= owner.cap
          ? 2
          : dx === owner.cap + 1
            ? 1
            : 0;
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
        if (inside(x, y)) grid[at(x, y)] = slot;
      });
    });
  }

  /* ----- the main peak ----- */

  const PEAK = { x: 54, apex: 19, half: 19, base: 36 };
  const peakTop = (x) =>
    PEAK.apex +
    Math.round((Math.abs(x - PEAK.x) * (PEAK.base - PEAK.apex)) / PEAK.half);

  // Two faces from the one light source, then the cap split by the
  // ridge line, then strata: horizontal bands at fixed rows crossing
  // both faces, so the layers read as sedimentary rock continuing
  // over the peak. Band cells land only on face cells, and seeded
  // runs break each band so it reads as ledges, not rules.
  function paintMainPeak() {
    for (let x = PEAK.x - PEAK.half; x <= PEAK.x + PEAK.half; x += 1) {
      const top = peakTop(x);
      const face = x <= PEAK.x ? S.NEAR_LIT : S.NEAR_SHADOW;
      for (let y = top; y <= PEAK.base; y += 1) grid[at(x, y)] = face;
      const dx = Math.abs(x - PEAK.x);
      if (dx <= 4) {
        const thick = dx <= 1 ? 2 : 1;
        const snow = x <= PEAK.x ? S.SNOW : S.SNOW_SH;
        for (let k = 0; k < thick; k += 1) grid[at(x, top + k)] = snow;
      }
    }
    // Each face's bands borrow the other face's depth: on the lit
    // face the ledges are shadow-dark, on the shadow face they are
    // the strata shade, one step up. Either way they read as rock
    // layers, not decoration.
    const strataRng = mulberry32(20261125);
    for (const rowY of [25, 29, 33]) {
      let skip = 0;
      for (let x = PEAK.x - PEAK.half; x <= PEAK.x + PEAK.half; x += 1) {
        if (skip > 0) {
          skip -= 1;
          continue;
        }
        if (strataRng() < 0.22) {
          skip = 1 + Math.floor(strataRng() * 3);
          continue;
        }
        const cell = grid[at(x, rowY)];
        if (cell === S.NEAR_LIT) {
          grid[at(x, rowY)] = S.NEAR_SHADOW;
          if (strataRng() < 0.35 && grid[at(x, rowY + 1)] === cell) {
            grid[at(x, rowY + 1)] = S.NEAR_SHADOW;
          }
        } else if (cell === S.NEAR_SHADOW) {
          grid[at(x, rowY)] = S.STRATA;
          if (strataRng() < 0.35 && grid[at(x, rowY + 1)] === cell) {
            grid[at(x, rowY + 1)] = S.STRATA;
          }
        }
      }
    }
  }

  /* ----- the lake and its reflections ----- */

  const LAKE_TOP = 38;
  const LAKE_BOT = 43;
  const LAKE_LEFT = [30, 28, 26, 25, 24, 25];
  const LAKE_RIGHT = [104, 106, 107, 107, 106, 103];

  function paintLake() {
    for (let r = 0; r <= LAKE_BOT - LAKE_TOP; r += 1) {
      const y = LAKE_TOP + r;
      for (let x = LAKE_LEFT[r]; x <= LAKE_RIGHT[r]; x += 1) {
        grid[at(x, y)] = S.LAKE;
      }
    }
    // The peak, upside down and stepped: at each lake row the
    // reflection is as wide as the peak mirrored that deep, drawn in
    // broken runs so the water moves without moving. Whole runs of
    // lake show through; nothing here is dither, it is gaps.
    const reflRng = mulberry32(20261126);
    for (let r = 0; r <= LAKE_BOT - LAKE_TOP; r += 1) {
      const y = LAKE_TOP + r;
      const halfW = Math.round(PEAK.half * (1 - r / (LAKE_BOT - LAKE_TOP + 2)));
      let x = PEAK.x - halfW;
      while (x <= PEAK.x + halfW) {
        const run = 3 + Math.floor(reflRng() * 6);
        const gap = 1 + Math.floor(reflRng() * 3);
        for (let k = 0; k < run && x <= PEAK.x + halfW; k += 1, x += 1) {
          if (inside(x, y) && grid[at(x, y)] === S.LAKE) {
            grid[at(x, y)] = S.LAKE_REFL;
          }
        }
        x += gap;
      }
    }
    // The cabin's reflection: a short broken smudge under the walls,
    // and the window's light in two or three cells. By day the light
    // slot wears the reflection hex and the smudge is all there is;
    // by night those cells burn with the window.
    const cabinRefl = [
      [90, 0], [91, 0], [93, 0], [95, 0], [96, 0], [98, 0],
      [91, 1], [94, 1], [96, 1], [97, 1],
      [93, 2], [95, 2],
    ];
    for (const [x, dy] of cabinRefl) {
      if (grid[at(x, LAKE_TOP + dy)] === S.LAKE) {
        grid[at(x, LAKE_TOP + dy)] = S.LAKE_REFL;
      }
    }
    for (const [x, y] of [
      [92, LAKE_TOP],
      [93, LAKE_TOP],
      [93, LAKE_TOP + 1],
    ]) {
      grid[at(x, y)] = S.REFL_LIGHT;
    }
    // Glints: a few deliberate single cells of snow-bright on the
    // open water, moonlight by night, sun by day. Named in the
    // anchor as deliberate details, the way stars are.
    for (const [x, y] of [
      [20, 39],
      [36, 41],
      [70, 40],
      [99, 42],
    ]) {
      if (grid[at(x, y)] === S.LAKE) grid[at(x, y)] = S.SNOW;
    }
  }

  /* ----- conifers ----- */

  // The foreground trees, Owlboy scale: spruces built as a mask from
  // a cone profile, widest a little above the base, with a sawtooth
  // carved into the profile so the tiers step out in ledges. Snow
  // rests on the ledges' top edges toward the light. A short trunk
  // shows at the bottom centre. The mask is clipped by the frame,
  // so a tree can stand half out of the picture.
  function bigConifer(cx, baseY, height, maxHalf) {
    const mask = new Set();
    const topY = baseY - height + 1;
    let prevHw = 0;
    for (let y = topY; y <= baseY; y += 1) {
      const depth = (y - topY) / Math.max(1, height - 1);
      let hw = Math.max(1, Math.round(maxHalf * Math.pow(depth, 0.75)));
      if ((y - topY) % 3 === 2 && hw > 1) hw -= 1; // the tier sawtooth
      if (hw < prevHw - 1) hw = prevHw - 1; // never narrow by leaps
      prevHw = hw;
      for (let x = cx - hw; x <= cx + hw; x += 1) {
        if (inside(x, y)) mask.add(at(x, y));
      }
    }
    for (const i of mask) grid[i] = S.TREE;
    // Snow on the top edge of each tier, biased to the lit side,
    // with seeded gaps so it rests rather than rules.
    const snowRng = mulberry32(20261127 + cx);
    for (const i of mask) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (mask.has(at(x, y - 1))) continue;
      const lit = x <= cx + 1;
      if (snowRng() < (lit ? 0.78 : 0.38)) grid[i] = S.SNOW;
    }
    for (let y = baseY - 2; y <= baseY; y += 1) {
      if (inside(cx, y)) grid[at(cx, y)] = S.ROOF;
      if (inside(cx + 1, y)) grid[at(cx + 1, y)] = S.ROOF;
    }
  }

  const CONIFER_MID = [
    "..X..",
    "..X..",
    ".XXX.",
    ".XXX.",
    "XXXXX",
    "XXXXX",
    "..X..",
  ];
  const CONIFER_SMALL = [".X.", "XXX", "XXX", ".X."];

  /* ----- the foreground slope ----- */

  // A cliff rim, not a silhouette cut: the slope's top row is a
  // broken snowy rim, and rock in the strata shade shows in small
  // outcrops just under it, the ground's drawn thickness.
  function paintSlope() {
    const rimRng = mulberry32(20261128);
    const edge = (x) => 35 + Math.round((x * 9) / 38);
    for (let x = 0; x <= 38; x += 1) {
      const top = edge(x);
      for (let y = top; y < H; y += 1) grid[at(x, y)] = S.FG;
      const roll = rimRng();
      grid[at(x, top)] = roll < 0.62 ? S.SNOW : roll < 0.82 ? S.VALLEY : S.FG;
    }
    // Strata outcrops under the rim: short horizontal runs of rock.
    for (const [ox, oy] of [
      [8, 39],
      [19, 41],
      [28, 42],
    ]) {
      for (let k = 0; k < 4; k += 1) {
        if (inside(ox + k, oy) && grid[at(ox + k, oy)] === S.FG) {
          grid[at(ox + k, oy)] = S.STRATA;
        }
      }
      if (inside(ox + 1, oy + 1) && grid[at(ox + 1, oy + 1)] === S.FG) {
        grid[at(ox + 1, oy + 1)] = S.STRATA;
      }
    }
    // The low bank at the bottom right, rimmed the same way.
    for (let x = 100; x < W; x += 1) {
      const top = 44 - Math.round(((x - 100) * 3) / 19);
      for (let y = top; y < H; y += 1) grid[at(x, y)] = S.FG;
      if (rimRng() < 0.45) grid[at(x, top)] = S.SNOW;
    }
  }

  /* ----- the whole scene ----- */

  const CABIN_LEFT = 88;
  const CABIN_TOP = 28;
  const CHIMNEY = { x: CABIN_LEFT + 5, top: CABIN_TOP };

  function buildGrid() {
    grid.fill(S.SKY);

    // Distance, washed the HLD way: the far ridge has no caps at
    // all, the haze has swallowed them; the mid ridge keeps small
    // ones. Both fill to the bottom and are overwritten in front.
    paintRidge(
      [
        { x: 16, apex: 20, half: 17, cap: 0 },
        { x: 40, apex: 18, half: 19, cap: 0 },
        { x: 64, apex: 21, half: 16, cap: 0 },
        { x: 88, apex: 19, half: 18, cap: 0 },
        { x: 110, apex: 22, half: 15, cap: 0 },
      ],
      29,
      S.FAR,
      null,
    );
    paintRidge(
      [
        { x: 10, apex: 26, half: 15, cap: 2 },
        { x: 32, apex: 24, half: 18, cap: 3 },
        { x: 58, apex: 27, half: 14, cap: 2 },
        { x: 80, apex: 23, half: 19, cap: 3 },
        { x: 104, apex: 25, half: 16, cap: 3 },
      ],
      33,
      S.MID,
      S.SNOW,
      true,
    );
    paintRidge(
      [
        { x: 16, apex: 29, half: 16, cap: 4 },
        { x: 54, apex: 19, half: 19, cap: 5 },
        { x: 86, apex: 28, half: 17, cap: 4 },
        { x: 112, apex: 30, half: 12, cap: 3 },
      ],
      PEAK.base,
      S.NEAR_SHADOW,
      S.SNOW,
    );
    paintMainPeak();

    // The valley floor: a flat snowfield over the ridges' feet.
    for (let y = PEAK.base; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.VALLEY;
    }
    paintLake();

    // Night sky furniture, drawn only where the sky is still sky.
    // By day the moon slot wears the sky hex and none of this shows.
    const skyRng = mulberry32(20261122);
    for (let i = 0; i < 16; i += 1) {
      const x = Math.floor(skyRng() * W);
      const y = Math.floor(skyRng() * 13);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.MOON;
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

    // The shore treeline: mid conifers along the far shore, seeded
    // positions, kept clear of the cabin's clearing. Two more stand
    // on the near shore at the bottom right, in front of the lake.
    const treeRng = mulberry32(20261123);
    let tx = 1;
    while (tx < W - 6) {
      tx += 5 + Math.floor(treeRng() * 7);
      if (tx > 82 && tx < 106) continue;
      if (treeRng() < 0.6) {
        stamp(CONIFER_MID, tx, 30, { X: S.TREE });
      } else {
        stamp(CONIFER_SMALL, tx, 33, { X: S.TREE });
      }
    }
    stamp(CONIFER_MID, 82, 38, { X: S.TREE });
    stamp(CONIFER_SMALL, 76, 40, { X: S.TREE });

    // The cabin, on the far shore at the lake's right end. C is the
    // chimney, S the snow on the roof, R the roof and door in the
    // darkest wood, W the walls, w the window that lights up at
    // night and carries the scene's one saturated accent.
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
      CABIN_LEFT,
      CABIN_TOP,
      { C: S.ROOF, S: S.SNOW, R: S.ROOF, W: S.WALL, w: S.WINDOW, D: S.ROOF },
    );

    // Foreground last: the slope and bank close the bottom of the
    // frame, and the big conifers stand on them, cropped by the
    // edges, overlapping everything behind.
    paintSlope();
    bigConifer(14, 42, 21, 9); // on the slope, the frame's big tree
    bigConifer(116, 44, 18, 8); // on the bank, cropped by the right edge
    bigConifer(1, 44, 13, 6); // cropped by the left edge
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

  /* ---------- chimney smoke ---------- */

  // A wisp, not a system: a particle spawns at the chimney every few
  // ticks, steps up one whole row every other tick, drifts right a
  // column every few steps on its own seeded whim, and dissolves
  // after a seeded lifetime. At most a handful alive at once.
  const smokeRng = mulberry32(20261129);
  const smoke = [];
  let smokeClock = 0;

  function stepSmoke() {
    smokeClock += 1;
    if (smokeClock % 5 === 0 && smoke.length < 6) {
      smoke.push({
        x: CHIMNEY.x,
        y: CHIMNEY.top - 1,
        age: 0,
        life: 12 + Math.floor(smokeRng() * 5),
        drift: smokeRng() < 0.7 ? 1 : 0,
      });
    }
    for (let i = smoke.length - 1; i >= 0; i -= 1) {
      const p = smoke[i];
      p.age += 1;
      if (p.age % 2 === 0) p.y -= 1;
      if (p.age % 4 === 0) p.x += p.drift;
      if (p.age >= p.life || p.y < 0) smoke.splice(i, 1);
    }
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
    if (reduced.matches) return;
    const pal = PALETTES[resolvedTheme()];
    ctx.fillStyle = pal[S.SMOKE];
    for (const p of smoke) {
      if (inside(p.x, p.y)) ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.fillStyle = pal[S.SNOW];
    for (const f of flakes) {
      if (f.y < 0) continue;
      if (isSolid(grid[at(f.x, f.y)])) continue;
      ctx.fillRect(f.x, f.y, 1, 1);
    }
  }

  buildGrid();
  paintStill();
  sceneTask.complete();
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

  if (reduced.matches) return; // one static frame, no snow, no smoke, no timers

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
    if (tick % 2 === 0) {
      stepSmoke();
      stepped = true;
    }
    if (stepped) frame();
  }, 140);
})();
