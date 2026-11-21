/*
  Gallery: night circuit.

  A floodlit corner at night, drawn the meadow's way: layers back to
  front, distance washed toward the sky, the near plane at full
  contrast. The composition borrows Hyper Light Drifter's device
  (the skyline pulled almost all the way to the sky colour, so the
  lit track carries the frame) and the home page clouds' device for
  the car: it travels only as stepped whole-cell orders after holds,
  never a slide.

  The scene: a city skyline behind, three floodlight towers, a
  grandstand whose crowd is seeded single cells in muted colours
  (deliberate details, the way stars are), and the track sweeping
  through the frame as a curved band, high at the edges, dipping to
  its apex at the bottom centre. Kerbs step along both edges in red
  and white clusters. The floodlights pool on the asphalt in three
  places; the middle pool is a bright band across the whole track,
  and the car catches it: crossing the band, its top cells swap to
  the lamp shade for as long as it is inside.

  The car is an original silhouette, no livery but one teal accent,
  the scene's one saturated colour, rationed the HLD way. Its
  passage leaves a short trail of lit cells on the racing line that
  step down shade by shade behind it and go out. It slows at the
  apex: holds are longer mid-corner, shorter on the straights, all
  seeded. Whole-cell swaps only; nothing drifts, nothing fades.
  Reduced motion gets one static frame, the car parked mid-corner
  inside the bright band, no trail, no timers.

  Themes: the dark theme is the night itself, deep blue, lamps pale.
  The light theme is the same corner at dusk: sky still lit,
  floodlights just on and warm, the crowd and kerbs a touch brighter.
*/

(() => {
  const canvas = document.querySelector('[data-gallery="grandprix"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 120;
  const H = 45;

  /* ---------- palette as data ---------- */

  // Slot order is fixed; each theme fills the same slots with its own
  // hexes. The budget is 16 unique hexes per theme, held by sharing:
  // at dusk the stars wear the sky hex and the trail wears the lamp
  // hex; at night the ground wears the racing line's hex and the
  // trail wears the stars'.
  const S = {
    SKY: 0,
    STAR: 1,
    SKYLINE: 2,
    LAMP: 3,
    STAND: 4,
    ROOF: 5,
    CROWD_A: 6,
    CROWD_B: 7,
    CROWD_C: 8,
    MAST: 9,
    TRACK: 10,
    TRACK_DARK: 11,
    GROUND: 12,
    GLOW: 13,
    KERB_R: 14,
    KERB_W: 15,
    ACCENT: 16,
    TRAIL: 17,
  };

  const PALETTES = {
    light: [
      "#7d94bd", // sky, dusk still lit
      "#7d94bd", // stars (= sky at dusk, hidden)
      "#5d6f96", // skyline, washed toward the dusk sky
      "#fdf3d0", // lamps and lit windows, just on and warm
      "#46587a", // grandstand body
      "#67799e", // stand roof, catching the last light
      "#b06055", // crowd, muted red
      "#cbb27a", // crowd, muted gold
      "#93a9c4", // crowd, pale blue-grey
      "#232f47", // towers and the car, the darkest tint
      "#5a6c8c", // asphalt
      "#42536f", // racing line and tyre marks
      "#47604f", // foreground ground, dusky green
      "#93aac6", // floodlit pool on the asphalt
      "#c0453e", // kerb red
      "#eef1ec", // kerb white, tinted
      "#1fae9c", // the car's accent, the one saturated colour
      "#fdf3d0", // trail (= lamp at dusk)
    ],
    dark: [
      "#162539", // sky, deep night blue
      "#cfe0f2", // stars
      "#101d31", // skyline, washed almost to the sky
      "#eef4fc", // lamps and lit windows, pale
      "#0a141f", // grandstand body, a silhouette
      "#22385a", // stand roof, one step up
      "#a34a44", // crowd, muted red
      "#c2a15a", // crowd, muted gold
      "#7e93ad", // crowd, pale blue-grey
      "#060d18", // towers and the car, the darkest tint
      "#2e4059", // asphalt
      "#1d2c42", // racing line and tyre marks
      "#1d2c42", // foreground ground (= racing line by night)
      "#5f7fa8", // floodlit pool on the asphalt
      "#b03a34", // kerb red
      "#dfe7ef", // kerb white, tinted
      "#37c4b1", // the car's accent, the one saturated colour
      "#cfe0f2", // trail (= stars by night)
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

  // The corner: a band that rides high at the frame's edges and dips
  // to its apex at the bottom centre, widening as it comes forward.
  const dip = (x) => 1 - ((x - 60) / 60) ** 2;
  const centreY = (x) => 25 + Math.round(9 * dip(x));
  const halfH = (x) => 5 + Math.round(3 * dip(x));
  const trackTop = (x) => centreY(x) - halfH(x);
  const trackBot = (x) => centreY(x) + halfH(x);
  const onTrack = (x, y) =>
    x >= 0 && x < W && y >= trackTop(x) && y <= trackBot(x);

  /* ----- sky, skyline, ground ----- */

  function paintSkyline() {
    const rng = mulberry32(20261130);
    let x = 0;
    let tower = 0;
    while (x < W) {
      const bw = 6 + Math.floor(rng() * 9);
      const top = 3 + Math.floor(rng() * 8);
      for (let bx = x; bx < Math.min(W, x + bw); bx += 1) {
        for (let y = top; y <= 13; y += 1) grid[at(bx, y)] = S.SKYLINE;
      }
      // Lit windows: sparse seeded cells inside the block, kept off
      // the roofline and the base so the block keeps its silhouette.
      for (let bx = x + 1; bx < Math.min(W, x + bw - 1); bx += 1) {
        for (let y = top + 2; y <= 11; y += 1) {
          if (rng() < 0.09) grid[at(bx, y)] = S.LAMP;
        }
      }
      // A beacon on every third roof: one deliberate red cell.
      tower += 1;
      if (tower % 3 === 0 && top >= 2) {
        const bx = x + Math.floor(bw / 2);
        if (bx < W) grid[at(bx, top - 1)] = S.KERB_R;
      }
      x += bw + (rng() < 0.4 ? 1 : 0);
    }
  }

  /* ----- floodlight towers ----- */

  // A mast two cells wide, a head of lamp cells five wide and two
  // tall, and a one-cell halo of skyline shade in the sky around the
  // head: the glow is whole cells, stepped, never a fade. Towers are
  // painted before the stand and the track, so both occlude the mast
  // the way real sightlines do.
  function paintTower(cx, headTop, baseRow) {
    for (let y = headTop + 2; y <= baseRow; y += 1) {
      grid[at(cx, y)] = S.MAST;
      grid[at(cx + 1, y)] = S.MAST;
    }
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = -2; dx <= 3; dx += 1) {
        const x = cx + dx;
        const y = headTop + dy;
        if (inside(x, y)) grid[at(x, y)] = S.LAMP;
      }
    }
    for (let dy = -1; dy <= 2; dy += 1) {
      for (let dx = -3; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = headTop + dy;
        if (!inside(x, y)) continue;
        if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.SKYLINE;
      }
    }
  }

  /* ----- the grandstand ----- */

  function paintStand() {
    // Roof: two rows with a one-cell overhang on the upper row.
    for (let x = 13; x <= 106; x += 1) grid[at(x, 11)] = S.ROOF;
    for (let x = 14; x <= 105; x += 1) grid[at(x, 12)] = S.ROOF;
    // The crowd field: a silhouette block dotted with seeded single
    // cells in three muted colours, sparser near the roof, denser
    // low, with two aisle columns kept clear.
    const rng = mulberry32(20261131);
    for (let y = 13; y <= 18; y += 1) {
      const density = y <= 14 ? 0.26 : 0.4;
      for (let x = 16; x <= 103; x += 1) {
        grid[at(x, y)] = S.STAND;
        if (x === 38 || x === 39 || x === 73 || x === 74) continue;
        if (rng() < density) {
          const pick = rng();
          grid[at(x, y)] =
            pick < 0.4 ? S.CROWD_A : pick < 0.7 ? S.CROWD_B : S.CROWD_C;
        }
      }
    }
    // Fascia and base wall under the seats.
    for (let x = 16; x <= 103; x += 1) {
      grid[at(x, 19)] = S.ROOF;
      grid[at(x, 20)] = S.STAND;
    }
    // Side walls closing the block under the roof's overhang.
    for (let y = 13; y <= 20; y += 1) {
      for (const x of [14, 15, 104, 105]) grid[at(x, y)] = S.STAND;
    }
  }

  /* ----- the track ----- */

  // A 2x2 Bayer pattern for the pool edges, the portrait's way:
  // neighbouring ramp shades mixing in small clusters, never speckle
  // across the whole surface.
  const BAYER_2 = [
    [0, 2],
    [3, 1],
  ];

  function paintTrack() {
    for (let x = 0; x < W; x += 1) {
      for (let y = trackTop(x); y <= trackBot(x); y += 1) {
        grid[at(x, y)] = S.TRACK;
      }
    }
    // The racing line: a darker band hugging the centreline, drawn
    // in broken runs so it reads as rubber laid down over laps, not
    // a painted stripe.
    const rng = mulberry32(20261132);
    for (const dy of [-1, 0, 1]) {
      let x = 0;
      while (x < W) {
        const run = 4 + Math.floor(rng() * 6);
        const gap = 2 + Math.floor(rng() * 4);
        for (let k = 0; k < run && x < W; k += 1, x += 1) {
          const y = centreY(x) + dy;
          if (onTrack(x, y)) grid[at(x, y)] = S.TRACK_DARK;
        }
        x += gap;
      }
    }
    // Tyre marks at the apex, where every lap scrubs the same arc:
    // two short dark clusters either side of the centreline.
    for (const [mx, mdy, len] of [
      [46, -3, 9],
      [52, 3, 11],
      [63, -3, 8],
      [58, 4, 7],
    ]) {
      for (let k = 0; k < len; k += 1) {
        const x = mx + k;
        const y = centreY(x) + mdy;
        if (onTrack(x, y)) grid[at(x, y)] = S.TRACK_DARK;
      }
    }
  }

  // Kerbs: stepped clusters of red and white along both edges of the
  // band, in three-cell runs. The near kerb is two rows tall, the far
  // one row; both only land on ground, so the stand keeps its cells
  // where sightlines cross.
  function paintKerbs() {
    for (let x = 0; x < W; x += 1) {
      const seg = Math.floor(x / 3) % 2 === 0 ? S.KERB_R : S.KERB_W;
      const fy = trackTop(x) - 1;
      if (grid[at(x, fy)] === S.GROUND) grid[at(x, fy)] = seg;
      const segNear = Math.floor(x / 3) % 2 === 0 ? S.KERB_W : S.KERB_R;
      for (const ny of [trackBot(x) + 1, trackBot(x) + 2]) {
        if (ny < H && grid[at(x, ny)] === S.GROUND) {
          grid[at(x, ny)] = segNear;
        }
      }
    }
  }

  // The floodlight pools: two ellipses under the side towers and one
  // bright band across the whole track mid-corner. Cores are flat
  // GLOW; the rim mixes TRACK and GLOW through the Bayer pattern,
  // dither only between neighbouring shades, only here.
  function paintPools() {
    const rimRng = mulberry32(20261135);
    const pools = [
      { x: 28, y: 27, rx: 17, ry: 4 },
      { x: 94, y: 27, rx: 17, ry: 4 },
    ];
    for (let x = 0; x < W; x += 1) {
      for (let y = trackTop(x); y <= trackBot(x); y += 1) {
        const cell = grid[at(x, y)];
        if (cell !== S.TRACK && cell !== S.TRACK_DARK) continue;
        let lit = 0;
        for (const p of pools) {
          const d = ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2;
          if (d < 0.45) lit = 2;
          else if (d < 1 && lit === 0) lit = 1;
        }
        if (x >= 54 && x <= 66) lit = 2;
        else if (x >= 52 && x <= 68 && lit === 0) lit = 3; // band flecks
        if (lit === 2) grid[at(x, y)] = S.GLOW;
        else if (
          lit === 1 &&
          BAYER_2[y % 2][x % 2] >= 3 &&
          rimRng() >= 0.25
        ) {
          grid[at(x, y)] = S.GLOW;
        } else if (
          lit === 3 &&
          BAYER_2[y % 2][x % 2] >= 3 &&
          rimRng() < 0.5
        ) {
          grid[at(x, y)] = S.GLOW;
        }
      }
    }
  }

  /* ----- the whole scene ----- */

  function buildGrid() {
    grid.fill(S.SKY);

    // Stars: deliberate single cells, high in the frame only. At
    // dusk the slot wears the sky hex and none of this shows.
    const starRng = mulberry32(20261133);
    for (let i = 0; i < 22; i += 1) {
      const x = Math.floor(starRng() * W);
      const y = Math.floor(starRng() * 8);
      if (grid[at(x, y)] === S.SKY) grid[at(x, y)] = S.STAR;
    }

    // The ground plane, from under the skyline to the frame's foot.
    for (let y = 14; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) grid[at(x, y)] = S.GROUND;
    }

    paintSkyline();
    paintTower(8, 3, 32);
    paintTower(59, 1, 20); // rises behind the stand, stops at its base
    paintTower(110, 3, 32);
    paintStand();
    paintTrack();
    paintPools();
    paintKerbs();
  }

  /* ---------- the car ---------- */

  // An original open-wheel silhouette, fourteen cells wide, six
  // tall, facing right: rear wing at the back, a fin and the driver's
  // helmet in accent along the spine, the nose dropping toward the
  // front wing, and two wheels standing two rows tall under the
  // floor. K is the body, A the accent. Unlit, the body wears the
  // mast shade, a silhouette against the lit track. Inside the
  // bright band the body steps up to the roof shade and the wing's
  // top row catches the lamp outright: lit metal, not a white slug.
  const CAR = [
    "KKK...........",
    "K.K..AA.......",
    ".KKKKKKKK.....",
    ".KKKKKKKKKKK..",
    "KKK.KKKK.KKK..",
    "KKK.......KKK.",
  ];
  const CAR_W = 14;
  const BAND = { from: 52, to: 68 }; // the bright band's columns

  function drawCar(px, lit) {
    const cx = Math.max(0, Math.min(W - 1, px + 7));
    const top = centreY(cx) - 3;
    const pal = PALETTES[resolvedTheme()];
    CAR.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === ".") return;
        const x = px + dx;
        const y = top + dy;
        if (!inside(x, y)) return;
        let slot;
        if (ch === "A") slot = S.ACCENT;
        else if (lit && dy === 0) slot = S.LAMP;
        else if (lit) slot = S.ROOF;
        else slot = S.MAST;
        ctx.fillStyle = pal[slot];
        ctx.fillRect(x, y, 1, 1);
      });
    });
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

  /* ---------- the car's run ---------- */

  // The car steps two cells at a time. Its hold between steps is
  // seeded and longer at the apex, the way the home page clouds hold
  // before stepping: one tick on the straights, two or three through
  // the corner. Off the right edge it rests, then starts again.
  const carRng = mulberry32(20261134);
  const car = { x: -16, hold: 6, countdown: 6 };
  const trail = []; // {x, y, ttl}

  function holdFor(x) {
    const apex = Math.abs(x - 60) <= 22;
    if (apex) return 2 + (carRng() < 0.4 ? 1 : 0);
    return carRng() < 0.25 ? 2 : 1;
  }

  function stepCar() {
    // Leave the trail: three lit cells on the racing line at the
    // rear wheel's row, stepping down behind the car.
    const cx = Math.max(0, Math.min(W - 1, car.x + 7));
    const wy = centreY(cx) + 1;
    for (let k = 1; k <= 3; k += 1) {
      const x = car.x - k;
      if (x >= 0 && x < W && onTrack(x, wy)) {
        trail.push({ x, y: wy, ttl: 3 });
      }
    }
    car.x += 2;
    if (car.x > W + 4) {
      car.x = -16;
      car.countdown = 26; // the gap between runs
    } else {
      car.countdown = holdFor(car.x);
    }
  }

  function frame() {
    ctx.drawImage(still, 0, 0);
    if (reduced.matches) {
      drawCar(50, true); // parked mid-corner, inside the bright band
      return;
    }
    const pal = PALETTES[resolvedTheme()];
    for (const t of trail) {
      if (t.ttl === 3) ctx.fillStyle = pal[S.TRAIL];
      else if (t.ttl === 2) ctx.fillStyle = pal[S.GLOW];
      else continue;
      ctx.fillRect(t.x, t.y, 1, 1);
    }
    if (car.x > -CAR_W && car.x < W) {
      const cx = car.x + 7;
      drawCar(car.x, cx >= BAND.from && cx <= BAND.to);
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

  if (reduced.matches) return; // one static frame, no timers

  setInterval(() => {
    if (document.hidden) return;
    let stepped = false;
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      trail[i].ttl -= 1;
      if (trail[i].ttl <= 0) trail.splice(i, 1);
      stepped = true;
    }
    car.countdown -= 1;
    if (car.countdown <= 0) {
      stepCar();
      stepped = true;
    }
    if (stepped) frame();
  }, 150);
})();
