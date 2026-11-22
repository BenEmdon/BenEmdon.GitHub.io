/*
  Gallery: highland.

  A windswept highland in the adventure-game mood: a big quiet sky,
  green ridges stepping down to a valley, and on a grassy rise in the
  middle distance a lone weathered sword planted in a stone, an old
  adventurer's marker drawn as plainly as possible. Far off on the
  left shoulder of the far ridge, a small cluster of standing stones.
  One bird. That is the whole cast; the world is the subject.

  The anchor:

    Subject: a windswept highland, a sword in a stone on a rise.
    Grid: 120 x 45, displayed at the page's full column width.
    Palette: 17 slots, at most 16 unique hexes per theme (below).
    Outline rule: none. Subjects shade with their own darkest shade.
    Light: one source, late morning sun upper right; the moon keeps
      the same watch at night from the upper left.
    Layers, back to front: sky and its furniture / far ridge with
      the standing stones / mid ridge / the rise and the sword's
      stone / foreground grass.
    Dither: none. Grass texture is tuft clusters, two shades to a
      tuft, dark at the base and light at the tip. The only ordered
      pattern in the piece is the gust fringe, and that is weather,
      not texture.
    Motion: gusts only, the home page meadow's weather carried over.
      A gust is a band whose front rolls across the ground from the
      far ridge toward the viewer; grass inside the band steps one
      rung up its ladder, then back down behind the front. Between
      gusts the field rests, fully still. The bird never moves.

  Composition devices, in the skill's vocabulary: the sky takes a
  third of the frame and stays quiet; distance is washed toward the
  sky colour, further than feels safe, while the near plane keeps
  full contrast; elevation is drawn, with a darker band under each
  grass rim so no ground ends in a clean cut; accents are rationed
  to a few deliberate flower cells in the near grass.

  Night is the same map with a different lookup, the meadow's way.
  The sun's slot wears the sky hex and the moon's slot wakes up;
  the grass goes blue-green and deep; and the band across the
  sword's stone, a pale strata line by day, catches the moonlight
  and is the one bright note in the dark scene.

  Everything is seeded, so the same code draws the same picture
  every time. Reduced motion gets one static frame: no gusts,
  no timers.
*/

import { registerTask } from "./boot.js?v=20261122o";
(() => {
  // The scene's first paint is loader work: the task
  // registers here and completes on that paint, below.
  const sceneTask = registerTask("painting highland", { timeout: 12000 });
  const canvas = document.querySelector('[data-gallery="highland"]');
  if (!canvas) { sceneTask.complete(); return; }
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 45;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its own
  // hexes, so night is the same highland with a different lookup. The
  // budget is 16 unique hexes per theme. Slots share hexes where a
  // distinction only exists in one light: by day the moon slot wears
  // the sky hex (stars and moon stay hidden) and the bird borrows the
  // stone's shadow; by night the sun slot wears the sky hex, so the
  // flower cells in the near grass close up and vanish.
  const S = {
    SKY: 0,
    SUN: 1,
    MOON: 2,
    FAR_BASE: 3,
    FAR_TIP: 4,
    MID_BASE: 5,
    MID_TIP: 6,
    MID_LIT: 7,
    G_BASE: 8,
    G_MID: 9,
    G_TIP: 10,
    G_LIT: 11,
    EARTH: 12,
    STONE: 13,
    STONE_DARK: 14,
    STONE_BAND: 15,
    STEEL: 16,
  };

  const PALETTES = {
    light: [
      "#c9e7f5", // sky, bright late morning
      "#ffd94a", // sun; also the flower cells in the near grass
      "#c9e7f5", // moon and stars (= sky by day)
      "#a9cdb2", // far ridge, washed toward the sky
      "#c4e0bc", // far ridge rim and its gust rung
      "#77b06b", // mid ridge
      "#9ccb7e", // mid ridge tips
      "#c2e29a", // mid ridge, gust-lit
      "#3e7a39", // near grass, the dark base shade
      "#57a047", // near grass
      "#7cc463", // near grass tips
      "#b9dc62", // near grass, gust-lit, the warmest green
      "#7a5230", // earth under the rims; the sword's grip
      "#a39c90", // stone, weathered grey
      "#6f6a5f", // stone shadow; also the bird
      "#c0bbae", // the stone's pale band, a lit strata line
      "#c3cedb", // the sword's steel
    ],
    dark: [
      "#0c1826", // sky
      "#0c1826", // sun (= sky by night; the flowers close)
      "#e8f1fa", // moon and stars
      "#1d3442", // far ridge, washed toward the night sky
      "#2a4a54", // far ridge rim and its gust rung
      "#1f4038", // mid ridge
      "#2c5a48", // mid ridge tips
      "#3f7d5c", // mid ridge, gust-lit
      "#14332a", // near grass, the dark base shade
      "#1d4d38", // near grass
      "#2f7350", // near grass tips
      "#5da873", // near grass, gust-lit, kept cool
      "#2e2119", // earth; the sword's grip
      "#5c6672", // stone
      "#39424e", // stone shadow; also the bird
      "#c7dcee", // the stone's band, catching the moonlight
      "#8fa4ba", // the sword's steel, moonlit
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

  // A ridge is a table of peaks, the mountains' way: the silhouette
  // at a column is the highest triangle that covers it, and the body
  // fills from there to the bottom, to be overwritten in front.
  function ridgeTopAt(peaks, baseY, x) {
    let top = baseY;
    for (const p of peaks) {
      const y = p.apex + Math.round((Math.abs(x - p.x) * (baseY - p.apex)) / p.half);
      if (y < top) top = y;
    }
    return top;
  }

  function paintRidge(peaks, baseY, slot) {
    for (let x = 0; x < W; x += 1) {
      const top = ridgeTopAt(peaks, baseY, x);
      for (let y = top; y < H; y += 1) grid[at(x, y)] = slot;
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

  // A grass tuft: two tip cells over one base cell, dark at the base
  // and light at the tip. The tips may land on any plane's grass, so
  // a tuft on a rim stands up against the plane behind it; they
  // never land on a subject, because a subject is never a grass
  // slot. The base cell only darkens the plane's own ground.
  const GRASS_SLOTS = new Set([
    S.FAR_BASE, S.FAR_TIP,
    S.MID_BASE, S.MID_TIP, S.MID_LIT,
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

  /* ----- the ridges ----- */

  const FAR_PEAKS = [
    { x: 10, apex: 17, half: 28 },
    { x: 38, apex: 15, half: 30 },
    { x: 70, apex: 18, half: 28 },
    { x: 100, apex: 16, half: 28 },
  ];
  const FAR_BASE_Y = 26;

  const MID_PEAKS = [
    { x: 16, apex: 25, half: 26 },
    { x: 50, apex: 22, half: 28 },
    { x: 84, apex: 26, half: 26 },
    { x: 112, apex: 23, half: 24 },
  ];
  const MID_BASE_Y = 32;

  /* ----- the foreground rise ----- */

  // The rise's crest runs through the middle of the frame and the
  // ground falls away to both edges, so the sword's stone stands on
  // the high ground and the viewer's grass closes the bottom.
  const surfY = (x) =>
    29 + Math.round(8 * Math.pow(Math.abs(x - 62) / 62, 1.6));

  /* ----- the sword's stone ----- */

  const STONE_LEFT = 54;
  const STONE_TOP = 23; // its base row is surfY(60) = 29

  function paintStoneAndSword() {
    // The stone, row by row: a weathered block with a flat top and
    // craggy sides, widest low. s is its shadow shade, on the side
    // away from the light and in a short crack; B is the pale band
    // across its upper face; . leaves the grass alone.
    stamp(
      [
        "...XXXXX.....",
        "..XXBBBBBXX..",
        ".XXXXXXXXXXX.",
        "sXXXXXXXXXXXX",
        "sXXXXsXXXXXXX",
        "sXXXXsXXXXXXX",
      ],
      STONE_LEFT,
      STONE_TOP,
      { X: S.STONE, B: S.STONE_BAND, s: S.STONE_DARK },
    );
    // A chipped fragment of the stone, lying in the grass at its
    // base: two cells of the stone's own shades.
    grid[at(STONE_LEFT - 2, STONE_TOP + 6)] = S.STONE;
    grid[at(STONE_LEFT - 1, STONE_TOP + 6)] = S.STONE_DARK;
    // The base row sits in the ground's own shadow.
    for (let x = STONE_LEFT; x <= STONE_LEFT + 12; x += 1) {
      grid[at(x, STONE_TOP + 6)] = S.STONE_DARK;
    }
    // The sword, drawn as plainly as a sword can be: a bar pommel,
    // a dark grip, a straight guard, and a stub of blade entering
    // the stone. The rest of the blade is the stone's business.
    for (let x = 59; x <= 61; x += 1) grid[at(x, 16)] = S.STEEL; // pommel
    for (let y = 17; y <= 19; y += 1) grid[at(60, y)] = S.EARTH; // grip
    for (let x = 56; x <= 64; x += 1) grid[at(x, 20)] = S.STEEL; // guard
    grid[at(56, 21)] = S.STEEL; // the guard's downturned tips
    grid[at(64, 21)] = S.STEEL;
    grid[at(60, 21)] = S.STEEL; // blade, entering the stone
    grid[at(60, 22)] = S.STEEL;
    // Grass leaning on the stone's base, to seat it in the rise.
    tuft(STONE_LEFT - 3, surfY(STONE_LEFT - 3), S.G_TIP, S.G_BASE, S.G_MID);
    tuft(STONE_LEFT + 14, surfY(STONE_LEFT + 14), S.G_TIP, S.G_BASE, S.G_MID);
  }

  /* ----- the whole scene ----- */

  function buildGrid() {
    grid.fill(S.SKY);

    // Night sky furniture, drawn only where the sky is still sky.
    // By day the moon slot wears the sky hex and none of this shows.
    const skyRng = mulberry32(20261130);
    for (let i = 0; i < 18; i += 1) {
      const x = Math.floor(skyRng() * W);
      const y = Math.floor(skyRng() * 13);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.MOON;
    }
    const ORB = [
      "..XXX..",
      ".XXXXX.",
      "XXXXXXX",
      "XXXXXXX",
      "XXXXXXX",
      ".XXXXX.",
      "..XXX..",
    ];
    stamp(ORB, 14, 3, { X: S.MOON }); // the moon, upper left
    stamp(ORB, 100, 2, { X: S.SUN }); // the sun, upper right

    // The one bird: a distant gull, two wing cells up, the body a
    // dip between them. A deliberate detail, named in the anchor.
    stamp(["X.....X", ".XX.XX."], 30, 6, { X: S.STONE_DARK });

    // The far ridge, washed almost to the sky. Its rim catches the
    // light in seeded stretches of the tip shade.
    paintRidge(FAR_PEAKS, FAR_BASE_Y, S.FAR_BASE);
    const farRng = mulberry32(20261131);
    for (let x = 0; x < W; x += 1) {
      const top = ridgeTopAt(FAR_PEAKS, FAR_BASE_Y, x);
      if (farRng() < 0.55) grid[at(x, top)] = S.FAR_TIP;
      if (farRng() < 0.18 && grid[at(x, top + 1)] === S.FAR_BASE) {
        grid[at(x, top + 1)] = S.FAR_TIP;
      }
    }

    // The standing stones, far off on the far ridge's left shoulder:
    // two uprights and one fallen, drawn in the stone's own shades
    // washed by the distance. They sit one row into the ridge so
    // the ground holds them.
    const stoneBase = (x) => ridgeTopAt(FAR_PEAKS, FAR_BASE_Y, x) + 1;
    for (let y = stoneBase(11) - 2; y <= stoneBase(11); y += 1) {
      grid[at(11, y)] = S.STONE;
      grid[at(12, y)] = S.STONE;
    }
    grid[at(11, stoneBase(11))] = S.STONE_DARK;
    for (let y = stoneBase(15) - 1; y <= stoneBase(15); y += 1) {
      grid[at(15, y)] = S.STONE;
      grid[at(16, y)] = S.STONE;
    }
    grid[at(15, stoneBase(15))] = S.STONE_DARK;
    for (let x = 18; x <= 20; x += 1) grid[at(x, stoneBase(19))] = S.STONE;

    // The mid ridge, one clear step deeper than the far. Tufts along
    // its rim, and earth showing in short runs under the rim where
    // the ground's thickness breaks through.
    paintRidge(MID_PEAKS, MID_BASE_Y, S.MID_BASE);
    const midRng = mulberry32(20261132);
    for (let x = 0; x < W; x += 1) {
      const top = ridgeTopAt(MID_PEAKS, MID_BASE_Y, x);
      if (midRng() < 0.4) grid[at(x, top)] = S.MID_TIP;
    }
    let mx = 2;
    while (mx < W - 6) {
      mx += 7 + Math.floor(midRng() * 8);
      const top = ridgeTopAt(MID_PEAKS, MID_BASE_Y, mx);
      tuft(mx, top + 1, S.MID_TIP, S.MID_BASE, S.MID_BASE);
      if (midRng() < 0.22) {
        // A strata run hugging the rim: the ground's thickness
        // showing through in one long ledge, not scattered dashes.
        // Only on near-flat stretches, so the ledge reads as a
        // ledge and never as a dash sliding down a slope.
        const run = 5 + Math.floor(midRng() * 4);
        const yStart = ridgeTopAt(MID_PEAKS, MID_BASE_Y, mx);
        const yEnd = ridgeTopAt(MID_PEAKS, MID_BASE_Y, mx + run - 1);
        if (Math.abs(yEnd - yStart) <= 1) {
          for (let k = 0; k < run; k += 1) {
            const x = mx + k;
            const y = ridgeTopAt(MID_PEAKS, MID_BASE_Y, x) + 1;
            if (inside(x, y) && grid[at(x, y)] === S.MID_BASE) {
              grid[at(x, y)] = S.EARTH;
            }
          }
        }
      }
    }

    // The foreground: the rise and the viewer's grass.
    for (let x = 0; x < W; x += 1) {
      for (let y = surfY(x); y < H; y += 1) grid[at(x, y)] = S.G_MID;
    }
    const fgRng = mulberry32(20261133);
    // A dark band under the rim in seeded stretches: the grass's own
    // base shadow, and the ground's drawn thickness.
    for (let x = 0; x < W; x += 1) {
      if (fgRng() < 0.65 && grid[at(x, surfY(x) + 1)] === S.G_MID) {
        grid[at(x, surfY(x) + 1)] = S.G_BASE;
      }
      if (fgRng() < 0.3) grid[at(x, surfY(x))] = S.G_TIP;
    }
    // Tufts across the near grass, denser near the surface.
    let fx = 1;
    while (fx < W - 4) {
      fx += 3 + Math.floor(fgRng() * 6);
      const depth = Math.floor(fgRng() * 4);
      const yBase = Math.min(H - 1, surfY(fx) + depth);
      tuft(fx, yBase, S.G_TIP, S.G_BASE, S.G_MID);
    }
    // Speckle clusters in the top rows of the near grass: pairs and
    // triples of tip or base shade, never single cells.
    for (let i = 0; i < 70; i += 1) {
      const x = Math.floor(fgRng() * (W - 3));
      const y = surfY(x) + Math.floor(fgRng() * 5);
      if (y >= H) continue;
      const slot = fgRng() < 0.55 ? S.G_TIP : S.G_BASE;
      const len = 2 + Math.floor(fgRng() * 2);
      for (let k = 0; k < len; k += 1) {
        if (inside(x + k, y) && grid[at(x + k, y)] === S.G_MID) {
          grid[at(x + k, y)] = slot;
        }
      }
    }
    // The field darkens toward its base: shade pools along the
    // bottom rows in clusters, denser the lower it sits.
    for (let i = 0; i < 85; i += 1) {
      const y = 40 + Math.floor(fgRng() * 5);
      const x = Math.floor(fgRng() * (W - 3));
      const len = 2 + Math.floor(fgRng() * 3);
      for (let k = 0; k < len; k += 1) {
        if (inside(x + k, y) && grid[at(x + k, y)] === S.G_MID) {
          grid[at(x + k, y)] = S.G_BASE;
        }
      }
    }
    // A few deliberate flower cells in the near grass: pairs of the
    // sun's own yellow. By night the slot wears the sky hex and
    // they close. Named in the anchor as deliberate details.
    for (const [x, y] of [
      [24, 36],
      [25, 36],
      [88, 34],
      [89, 34],
      [44, 40],
      [45, 40],
      [102, 39],
      [103, 39],
    ]) {
      if (inside(x, y) && grid[at(x, y)] === S.G_MID) grid[at(x, y)] = S.SUN;
    }

    paintStoneAndSword();
  }

  /* ---------- the grass ladders ---------- */

  // The weather's ladders, the meadow's device: every grass shade
  // belongs to one plane's ladder, and a gust steps a cell one rung
  // up its own ladder. The ladders are read off the finished grid,
  // so anything that is not grass (the stone, the sword, the ruins,
  // the earth) is off the ladders by construction, and a gust passes
  // around the subjects and never through them.
  const LADDERS = [
    [S.FAR_BASE, S.FAR_TIP],
    [S.MID_BASE, S.MID_TIP, S.MID_LIT],
    [S.G_BASE, S.G_MID, S.G_TIP, S.G_LIT],
  ];
  const ladderOf = new Int8Array(W * H).fill(-1);
  const rung = new Int16Array(W * H).fill(-1);
  // How solidly each plane takes a gust: the near field steps whole,
  // the farther planes step in a Bayer share of their cells, the
  // same quieting with distance the meadow's hill uses.
  const LADDER_COVER = [0.55, 0.8, 1];

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

  /* ---------- gusts ---------- */

  // Weather geometry, the meadow's: a gust is a band whose front is
  // a row of the ground. It starts above the far ridge and rolls
  // toward the viewer, so the far grass lights first and the near
  // grass last. The front is not a ruler: a wobble, a sum of sines
  // over the columns, holds it a row or two early here and late
  // there, and each gust rolls the wobble at its own phase.
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

  const gustRng = mulberry32(20261134);
  let gust = null; // { row, depth, depthScale, phase }
  let restTicks = Math.round(2500 / 120); // the pause before the first gust

  function startGust() {
    gust = {
      row: 11,
      depth: 3,
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
    const t = Math.max(0, Math.min(1, (gust.row - 11) / (H + 2 - 11)));
    gust.row += 0.55 + 0.35 * t;
    gust.depth = (3 + 3.8 * t) * gust.depthScale;
    if (gust.row - gust.depth > H + 2) {
      gust = null;
      scheduleRest();
    }
    return true;
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
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
        // How far the front has rolled past this cell, in the
        // column's own wobbled frame. Inside the band the cell
        // steps one rung brighter; the band's front and tail break
        // up on a fixed Bayer threshold, so it arrives ragged.
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

  buildGrid();
  buildLadders();
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

  if (reduced.matches) return; // one static frame, no gusts, no timers

  setInterval(() => {
    if (document.hidden) return;
    if (stepGust()) frame();
  }, 120);
})();
