/*
  Gallery: the court.

  Anchor:
    Subject: a clay tennis court on a coastal terrace at golden hour.
    Grid: 120 x 45 cells, displayed at the gallery's full column width.
    Palette: stored below as data, one slot table, two theme fills.
    Colour budget: 16 unique hexes per theme (16 by day, 15 by night;
      slots share hexes where a distinction only exists in one light).
    Outline rule: none. Forms are flat clusters separated by value;
      the darkest shade of each thing edges it where an edge is drawn.
    Light: one source, low sun at the upper right by day (long shadows
      fall down and to the left); two floodlight pools by night.
    Layers, back to front: sky, sea and headland, terrace grass,
      floodlight poles, fence, court, bench, cypresses, cliff face.
    Dither: none in the sky (a checker there read as a ribbon);
      broken seeded runs in the cliff strata only.
    Motion, within the pixel rule: a handful of sea cells swap between
      the sea shade and the glint shade on slow seeded ticks, whole
      cells in place. Nothing drifts, nothing fades. Reduced motion
      gets one static frame with the glints at their seeded rest state.

  The composition borrows from Hyper Light Drifter's cliff vista:
  the sky stays quiet, the far headland is washed almost to the sea
  and sky colours, and exactly one saturated accent is rationed, the
  tennis ball by the net post. From Owlboy it steals ground
  thickness: the terrace the court sits on ends in a drawn cliff
  face with strata, never a clean cut into nothing. The court itself
  is drawn in side elevation with a hint of perspective: the far
  baseline is shorter and higher than the near one, the sidelines
  converge, and the net's shadow steps down the clay toward the
  viewer, so the elevation is drawn, not implied (Sea of Stars).

  Night is the same numbers with a different lookup: the sea goes
  dark, the celestial disc turns pale and reads as the moon, and
  the two floodlights (dark fixtures by day) light two warm pools
  on the clay. The ball stays warm in both.
*/

(() => {
  const canvas = document.querySelector('[data-gallery="tennis"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 45;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its own
  // hexes. By day the lamp slot wears the net hex (unlit fixtures),
  // the pool slot wears the court hex (no pools in daylight), and the
  // star slot wears the sky hex (no stars). By night the shadow slot
  // wears the court-shade hex, the glint slot wears the line hex
  // (moon glitter), and the star slot wears the moon hex.
  const S = {
    SKY: 0,
    SKY_LOW: 1,
    CELESTIAL: 2,
    SEA: 3,
    SEA_GLINT: 4,
    HEADLAND: 5,
    APRON: 6,
    COURT: 7,
    COURT_SHADE: 8,
    LINE: 9,
    SHADOW: 10,
    NET: 11,
    CYPRESS: 12,
    ROCK: 13,
    ROCK_SHADE: 14,
    BALL: 15,
    LAMP: 16,
    POOL: 17,
    STAR: 18,
  };

  const PALETTES = {
    light: [
      "#e3ac83", // sky, dusty peach
      "#f9e0ae", // sky near the horizon, pale gold
      "#ffcf5e", // the sun, low at upper right
      "#5f96a6", // sea, the scene's cool note
      "#a8d2d8", // sea glint, for the shimmer swaps
      "#a9c0ae", // headland, washed toward sky and sea
      "#7fa065", // terrace grass
      "#d07c47", // clay, lit
      "#b86336", // clay one step deeper (the fence's shadow strip)
      "#f4ecd9", // lines, net tape, the towel
      "#90503f", // cast shadow on clay, cooler and deeper
      "#2f3644", // net, fence, posts, poles
      "#2e4d33", // cypresses
      "#a0815f", // terrace cliff
      "#7e6248", // cliff strata, and the bench's wood
      "#ffd23e", // the ball: the one saturated accent
      "#2f3644", // floodlight heads by day (= net, unlit)
      "#d07c47", // floodlight pools by day (= court, absent)
      "#e3ac83", // stars by day (= sky, hidden)
    ],
    dark: [
      "#0d1622", // sky
      "#17293f", // sky near the horizon
      "#e8f1fa", // the moon, the sun's disc turned pale
      "#12293a", // sea, gone dark
      "#a8b09a", // sea glint by night (= line, moon glitter)
      "#1c2f2b", // headland, barely there
      "#203627", // terrace grass
      "#40322c", // clay away from the lights
      "#33261f", // clay one step deeper
      "#a8b09a", // lines, net tape, the towel, dimmed
      "#33261f", // cast shadow by night (= court shade)
      "#11161f", // net, fence, posts, poles
      "#0f2016", // cypresses
      "#2b241e", // terrace cliff
      "#1d1813", // cliff strata, and the bench's wood
      "#e6c33a", // the ball, still warm
      "#ffe9a8", // floodlight heads, lit
      "#c07a45", // floodlight pools, warm clay under the lamps
      "#e8f1fa", // stars (= moon)
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

  /* ----- the court geometry ----- */

  // Side elevation with a hint of perspective: the far baseline
  // (row 23) spans x 29..91, the near baseline (row 36) spans
  // x 23..97, and the sidelines converge between them.
  const COURT_TOP = 23;
  const COURT_BOT = 36;
  const courtLeft = (y) =>
    Math.round(29 - (6 * (y - COURT_TOP)) / (COURT_BOT - COURT_TOP));
  const courtRight = (y) =>
    Math.round(91 + (6 * (y - COURT_TOP)) / (COURT_BOT - COURT_TOP));

  /* ----- a cypress ----- */

  // A spire from a half-width profile: a point at the top, a long
  // even body, a slight taper at the base, then a short trunk. Flat
  // silhouette, the way Owlboy's foreground trees are flat: the
  // frame elements stay quiet so the court keeps the light.
  function cypress(cx, topY, baseY, profile) {
    profile.forEach((hw, dy) => {
      const y = topY + dy;
      for (let x = cx - hw; x <= cx + hw; x += 1) {
        if (inside(x, y)) grid[at(x, y)] = S.CYPRESS;
      }
    });
    for (let y = baseY - 1; y <= baseY; y += 1) {
      if (inside(cx, y)) grid[at(cx, y)] = S.ROCK_SHADE;
    }
  }

  const CYPRESS_LEFT = [
    0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    2, 1, 1, 1, 1, 1, 1,
  ]; // rows 6..37, trunk at 38..39
  const CYPRESS_RIGHT = [
    0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1,
    1,
  ]; // rows 10..35, trunk at 36..37 (base tucked behind the cliff rim)

  /* ----- the whole scene ----- */

  function buildGrid() {
    // Sky: two flat bands with a clean horizon-ward step. (Pass 1
    // tried a Bayer checker softening the boundary; at 1x it read
    // as a polka-dot ribbon across the whole sky, so it came out.)
    for (let y = 0; y <= 5; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.SKY;
    }
    for (let y = 6; y <= 12; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.SKY_LOW;
    }

    // Stars, placed only on open upper sky. By day the star slot
    // wears the sky hex and none of this shows.
    const starRng = mulberry32(20261130);
    for (let i = 0; i < 16; i += 1) {
      const x = Math.floor(starRng() * W);
      const y = Math.floor(starRng() * 6);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.STAR;
    }

    // The celestial disc, low at the upper right: the sun by day,
    // the moon by night, the same cells either way. It sits left of
    // the right floodlight so the two never merge after dark.
    const DISC = [
      [92, 6], [93, 6], [94, 6],
      [91, 7], [92, 7], [93, 7], [94, 7], [95, 7],
      [90, 8], [91, 8], [92, 8], [93, 8], [94, 8], [95, 8], [96, 8],
      [90, 9], [91, 9], [92, 9], [93, 9], [94, 9], [95, 9], [96, 9],
      [90, 10], [91, 10], [92, 10], [93, 10], [94, 10], [95, 10], [96, 10],
      [91, 11], [92, 11], [93, 11], [94, 11], [95, 11],
      [92, 12], [93, 12], [94, 12],
    ];
    for (const [x, y] of DISC) grid[at(x, y)] = S.CELESTIAL;

    // The sea: a cool band under the horizon.
    for (let y = 13; y <= 19; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.SEA;
    }

    // The headland, reaching in from the left, washed the HLD way:
    // one flat hazy shade, its crest falling to the water at x 38.
    // Three tiny pines stand on the crest in the cypress shade.
    const headTop = (x) => 8 + Math.round((x * 5) / 38);
    for (let x = 0; x <= 38; x += 1) {
      for (let y = headTop(x); y <= 19; y += 1) grid[at(x, y)] = S.HEADLAND;
    }
    for (const cx of [9, 19, 28]) {
      const ty = headTop(cx);
      grid[at(cx, ty - 1)] = S.CYPRESS;
      grid[at(cx - 1, ty)] = S.CYPRESS;
      grid[at(cx, ty)] = S.CYPRESS;
      grid[at(cx + 1, ty)] = S.CYPRESS;
    }

    // The terrace: grass from the fence line down to the cliff rim.
    for (let y = 20; y <= 39; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.APRON;
    }

    // The floodlight poles, behind the fence at both ends. The lamp
    // heads are fixtures by day and the night scene's light sources.
    for (const px of [16, 104]) {
      for (let y = 13; y <= 21; y += 1) grid[at(px, y)] = S.NET;
      for (let x = px - 1; x <= px + 1; x += 1) {
        grid[at(x, 11)] = S.LAMP;
        grid[at(x, 12)] = S.LAMP;
      }
    }

    // The fence: posts and a two-row windscreen behind the court.
    for (let x = 18; x <= 102; x += 1) {
      grid[at(x, 20)] = S.NET;
      grid[at(x, 21)] = S.NET;
    }
    for (const px of [18, 39, 60, 81, 102]) {
      for (let y = 19; y <= 22; y += 1) grid[at(px, y)] = S.NET;
    }

    // The court surface.
    for (let y = COURT_TOP; y <= COURT_BOT; y += 1) {
      for (let x = courtLeft(y); x <= courtRight(y); x += 1) {
        grid[at(x, y)] = S.COURT;
      }
    }

    // The floodlight pools: two ellipses of lit clay. By day the
    // pool slot wears the court hex and this pass changes nothing.
    for (const [pcx, pcy] of [
      [43, 30],
      [77, 30],
    ]) {
      for (let y = COURT_TOP; y <= COURT_BOT; y += 1) {
        for (let x = courtLeft(y); x <= courtRight(y); x += 1) {
          const dx = (x - pcx) / 17;
          const dy = (y - pcy) / 6.5;
          if (dx * dx + dy * dy <= 1 && grid[at(x, y)] === S.COURT) {
            grid[at(x, y)] = S.POOL;
          }
        }
      }
    }

    // The fence's shadow: the low sun throws the back fence onto
    // the row of clay under the far baseline, one step deeper,
    // reaching a little past halfway across.
    {
      const y = COURT_TOP + 1;
      const l = courtLeft(y);
      const r = l + Math.round((courtRight(y) - l) * 0.55);
      for (let x = l; x <= r; x += 1) {
        if (grid[at(x, y)] === S.COURT || grid[at(x, y)] === S.POOL) {
          grid[at(x, y)] = S.COURT_SHADE;
        }
      }
    }

    // The net's shadow: a diagonal band three rows tall, stepping
    // down the clay toward the viewer and left, the sun being low
    // and right. (Pass 1 laid it on as a four-row slab and the
    // court's lower half read as one dark plank; now it angles.)
    const NET_SHADOW = [
      [32, 30, 90],
      [33, 27, 87],
      [34, 24, 84],
    ];
    for (const [y, l, r] of NET_SHADOW) {
      for (let x = l; x <= r; x += 1) {
        if (grid[at(x, y)] === S.COURT || grid[at(x, y)] === S.POOL) {
          grid[at(x, y)] = S.SHADOW;
        }
      }
    }

    // The lines, painted over the shadows: baselines, the converging
    // sidelines, both service lines, and the centre service line in
    // two runs either side of the net.
    for (let x = courtLeft(COURT_TOP); x <= courtRight(COURT_TOP); x += 1) {
      grid[at(x, COURT_TOP)] = S.LINE;
    }
    for (let x = courtLeft(COURT_BOT); x <= courtRight(COURT_BOT); x += 1) {
      grid[at(x, COURT_BOT)] = S.LINE;
    }
    for (let y = COURT_TOP; y <= COURT_BOT; y += 1) {
      grid[at(courtLeft(y), y)] = S.LINE;
      grid[at(courtRight(y), y)] = S.LINE;
    }
    for (const y of [26, 33]) {
      for (let x = courtLeft(y); x <= courtRight(y); x += 1) {
        grid[at(x, y)] = S.LINE;
      }
    }
    for (const y of [27, 28, 32]) grid[at(60, y)] = S.LINE;

    // The net: posts just outside the sidelines at its depth, a tape
    // row, and two mesh rows. The mesh covers the centre line's
    // middle run, the net being in front of the paint.
    for (let y = 27; y <= 32; y += 1) {
      grid[at(24, y)] = S.NET;
      grid[at(96, y)] = S.NET;
    }
    for (let x = 24; x <= 96; x += 1) grid[at(x, 29)] = S.LINE;
    for (const y of [30, 31]) {
      for (let x = 25; x <= 95; x += 1) grid[at(x, y)] = S.NET;
    }

    // The ball: one cell resting by the right net post, the scene's
    // one saturated accent, deliberate and named here.
    grid[at(94, 32)] = S.BALL;

    // The bench on the left apron: a two-row backrest and a seat in
    // the cliff's lighter wood-brown, legs in its shade, and a towel
    // draped over the backrest in the line colour, hanging to the
    // seat. (Pass 2's one-row backrest read as a smudge at 1x; the
    // bench needed a profile: back, seat, legs.)
    for (let x = 10; x <= 19; x += 1) {
      grid[at(x, 32)] = S.ROCK;
      grid[at(x, 33)] = S.ROCK;
    }
    for (let x = 9; x <= 20; x += 1) grid[at(x, 34)] = S.ROCK;
    grid[at(10, 35)] = S.ROCK_SHADE;
    grid[at(19, 35)] = S.ROCK_SHADE;
    grid[at(13, 32)] = S.LINE;
    grid[at(14, 32)] = S.LINE;
    grid[at(13, 33)] = S.LINE;
    grid[at(14, 33)] = S.LINE;
    grid[at(14, 34)] = S.LINE;

    // The terrace's front edge: a worn grass rim, then the cliff
    // face with broken strata runs, the ground's drawn thickness.
    const rimRng = mulberry32(20261131);
    for (let x = 0; x < W; x += 1) {
      if (rimRng() < 0.18) grid[at(x, 39)] = S.ROCK_SHADE;
    }
    for (let y = 40; y <= 44; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.ROCK;
    }
    const strataRng = mulberry32(20261132);
    for (const [y, density] of [
      [41, 0.4],
      [42, 1],
      [44, 1],
    ]) {
      let x = Math.floor(strataRng() * 6);
      while (x < W) {
        const run = 2 + Math.floor(strataRng() * 5);
        if (strataRng() < density) {
          for (let k = 0; k < run && x + k < W; k += 1) {
            grid[at(x + k, y)] = S.ROCK_SHADE;
          }
        }
        x += run + 2 + Math.floor(strataRng() * 6);
      }
    }

    // The cypresses last, the foreground frame: they overlap sky,
    // sea, headland, fence and grass, and are cropped by nothing
    // but the frame itself.
    cypress(5, 6, 39, CYPRESS_LEFT);
    cypress(115, 10, 37, CYPRESS_RIGHT);
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

  buildGrid();

  /* ---------- the sea shimmer ---------- */

  // The scene's only life, kept inside the pixel rule: a set of sea
  // cells, denser in the sun's glitter path under the disc, each
  // with a seeded period, phase, and rest state. On its tick a cell
  // swaps between the sea shade and the glint shade, in place.
  // Nothing travels; the water brightens and settles cell by cell.
  const shimmer = [];
  {
    const shimRng = mulberry32(20261133);
    const take = (x0, x1, count) => {
      let placed = 0;
      let guard = 0;
      while (placed < count && guard < 400) {
        guard += 1;
        const x = x0 + Math.floor(shimRng() * (x1 - x0 + 1));
        const y = 14 + Math.floor(shimRng() * 5);
        if (grid[at(x, y)] !== S.SEA) continue;
        if (shimmer.some((c) => c.x === x && c.y === y)) continue;
        shimmer.push({
          x,
          y,
          period: 3 + Math.floor(shimRng() * 5),
          phase: Math.floor(shimRng() * 7),
          on: shimRng() < 0.5,
        });
        placed += 1;
      }
    };
    take(84, 102, 11); // the glitter path under the sun
    take(40, 119, 8); // the open sea
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
    const pal = PALETTES[resolvedTheme()];
    ctx.fillStyle = pal[S.SEA_GLINT];
    for (const c of shimmer) {
      if (c.on) ctx.fillRect(c.x, c.y, 1, 1);
    }
  }

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

  if (reduced.matches) return; // one static frame, no shimmer timers

  let tick = 0;
  setInterval(() => {
    if (document.hidden) return;
    tick += 1;
    let swapped = false;
    for (const c of shimmer) {
      if ((tick + c.phase) % c.period === 0) {
        c.on = !c.on;
        swapped = true;
      }
    }
    if (swapped) frame();
  }, 480);
})();
