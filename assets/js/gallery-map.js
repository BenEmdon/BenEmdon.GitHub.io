/*
  Gallery: overworld, v2, the diorama cut.

  A top-down RPG overworld map, drawn the way everything on this page
  is drawn: a grid of numbers in the source, one number per cell, each
  number picking a colour from a palette kept as data. The map is
  built once, from a seeded generator, so the same code draws the same
  coastline, forest, and town every time.

  V1 was a flat diagram. V2 draws the same map like a lit diorama,
  taking its devices from the main page's meadow and from Sea of
  Stars: one light source, top-left, applied everywhere. Canopies are
  layered clusters with lit tops, shaded undersides, and stepped cast
  shadows. Houses get a lit roof face, a shaded roof face, and a cast
  shadow, and no two houses share a face (that part is Eastward's).
  Elevation is drawn, never implied: the peaks carry strata grooves
  and cliff bands, and the forest stands on raised ground with a lit
  rim, a banded face, and a shadow row on its south-east edge.

  Night is the same numbers with a different palette. The map never
  changes; the lookup does. The town windows and the two lanterns are
  the tell: dark glass by day, lit warm by night, same cells.

  Motion is timers and swaps, never movement. The hero is three cells
  (a cream head, an orange body, the one saturated note in the scene)
  walking a fixed route from the town to the forest clearing and
  back: one whole cell per tick, with seeded holds at each end. Water
  sparkles swap whole cells on a slower tick. If the system asks for
  reduced motion, the timers never start: one static frame, hero at
  home in town.
*/

const W = 120;
const H = 45;

/* The palette as data: slot, day, night. Sixteen slots, the hard cap
   v1 already spent, so depth is bought by sharing: sand merges into
   the dirt slot (beach, paths, and plaza are one tan family), the
   light green is shared between grass highlights and canopy tops,
   and the shaded roof face doubles as every piece of wood in town.
   Ramps shift hue as they step: water deepens toward the site's
   accent blue, grass shadows cool toward blue-green, canopy
   highlights warm toward yellow, mountain greys lean violet. No
   pure black, no pure white. */
const DAY = [
  "#24568f", //  0 waterDeep, the river channel, the well's water
  "#3f78b5", //  1 water
  "#3c4c66", //  2 window, dark glass by day
  "#dec084", //  3 dirt: beach, paths, plaza
  "#79b257", //  4 grass
  "#457c46", //  5 grassDark: shade, forest floor, cast shadows on grass
  "#275231", //  6 forestDeep: canopy underside, trunks, the raised face
  "#3c7a3a", //  7 forest: canopy body
  "#83b95e", //  8 leafLight: canopy tops, lit grass
  "#9698ad", //  9 rock: the lit mountain face
  "#5d5f76", // 10 rockDark: shadow face, cliff band, cast shadows on dirt
  "#f2f6ef", // 11 snow: caps, sparkles, foam, white flowers
  "#b2543a", // 12 roof: the lit roof face
  "#7e4230", // 13 roofDark: shaded roof face, and all wood
  "#f0e4c6", // 14 wall, also the hero's head
  "#e8862e", // 15 hero, the one saturated note, his body and nothing else
];
const NIGHT = [
  "#0e2138", //  0 waterDeep
  "#1b3d63", //  1 water
  "#ffb347", //  2 window and lanterns, lit warm by night
  "#6f5c36", //  3 dirt
  "#2a472b", //  4 grass
  "#1e3520", //  5 grassDark
  "#12241a", //  6 forestDeep
  "#21402a", //  7 forest
  "#33523a", //  8 leafLight
  "#454758", //  9 rock
  "#2e3049", // 10 rockDark
  "#b9c9e6", // 11 snow, moonlit, also the sparkle
  "#6e3527", // 12 roof
  "#47241d", // 13 roofDark
  "#8a7a58", // 14 wall
  "#e8862e", // 15 hero, warm at night like a lantern himself
];

/* Seeded variation, mulberry32: the same seed draws the same map. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

/* Rasterise a polyline into unit steps, so paths and the hero's route
   share one even-stepped spine. */
function rasterise(points) {
  const cells = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s < steps; s += 1) {
      cells.push([
        Math.round(x0 + ((x1 - x0) * s) / steps),
        Math.round(y0 + ((y1 - y0) * s) / steps),
      ]);
    }
  }
  cells.push(points[points.length - 1].slice());
  return cells;
}

function buildMap() {
  const rng = mulberry32(20261120);
  const map = new Uint8Array(W * H).fill(4); // grass everywhere first
  const set = (x, y, v) => {
    if (inside(x, y)) map[at(x, y)] = v;
  };
  const get = (x, y) => (inside(x, y) ? map[at(x, y)] : -1);
  const isGrass = (v) => v === 4 || v === 5 || v === 8;

  /* Filled ellipse with stepped edges, the meadow's only curve. The
     painter decides what a covered cell becomes. */
  function stamp(cx, cy, rx, ry, paint) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y += 1) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x += 1) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) paint(x, y);
      }
    }
  }

  /* --- ground light: sunlit swales and shade patches, stepped
     ellipses one slot off the grass they cover, so the ground the
     subjects stand on already leans toward the light --- */
  function groundPatch(cx, cy, rx, ry, v) {
    stamp(cx, cy, rx, ry, (x, y) => {
      if (get(x, y) !== 4) return;
      const dx = (x - cx) / (rx + 0.5);
      const dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy > 0.72 && rng() < 0.35) return; // soft edge
      set(x, y, v);
    });
  }
  groundPatch(40, 18, 13, 4, 8); // a sunlit reach, centre-west
  groundPatch(24, 9, 10, 3.5, 8); // sunlit, north-west
  groundPatch(102, 38, 12, 4, 8); // sunlit, south-east grass
  groundPatch(28, 37, 15, 4.5, 5); // shade, south-west
  groundPatch(66, 8, 13, 3.5, 5); // shade under the peaks' sky

  /* --- the sea, west edge, with a wandering coastline. Depth is
     drawn in bands: pale shore, open water, a checker dither band
     where the bottom drops away, then deep water. Foam flecks ride
     the waterline. --- */
  const shore = [];
  let jitter = 0;
  for (let y = 0; y < H; y += 1) {
    jitter += Math.floor(rng() * 3) - 1;
    jitter = Math.max(-2, Math.min(3, jitter));
    shore.push(17 + jitter + (y > 26 ? 1 : 0));
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < shore[y] - 1; x += 1) {
      const depth = shore[y] - 1 - x;
      if (depth > 8) set(x, y, 0);
      else if (depth > 4 && (x + y) % 2 === 0) set(x, y, 0); // dither band
      else set(x, y, 1);
    }
    if (rng() < 0.55) set(shore[y] - 2, y, 11); // foam on the waterline
    set(shore[y] - 1, y, 3); // beach, two cells of shore dirt
    set(shore[y], y, 3);
  }

  /* --- the river, out of the mountains and down to the sea.
     Narrower than v1, and shaded under its south-east banks: the
     ground past the bank, away from the light, drops a tone. --- */
  const riverLine = rasterise([
    [102, 5], [92, 11], [82, 16], [72, 20], [63, 23],
    [52, 26], [40, 28], [28, 30], [18, 32], [8, 34],
  ]);
  const riverCells = new Set();
  for (const [cx, cy] of riverLine) {
    set(cx, cy, 1);
    riverCells.add(at(cx, cy));
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        if (rng() < 0.28) continue; // a ragged, narrower channel
        if (isGrass(get(cx + dx, cy + dy)) || get(cx + dx, cy + dy) === 3) {
          set(cx + dx, cy + dy, 1);
          riverCells.add(at(cx + dx, cy + dy));
        }
      }
    }
  }
  for (const [cx, cy] of riverLine) {
    if (rng() < 0.5) set(cx, cy, 0); // the deep channel, intermittent
    for (const [ox, oy] of [[2, 1], [1, 2], [2, 2]]) {
      if (isGrass(get(cx + ox, cy + oy))) set(cx + ox, cy + oy, 5);
    }
  }

  /* --- the forest's raised ground. The wood stands on a plateau:
     a lit rim where the edge catches the light from the north-west,
     a banded face dropping away to the south-east, then a row of
     shadow on the low ground. Rim, face, shadow: height you can
     count, the Sea of Stars way. --- */
  const floorSet = new Set();
  stamp(46, 15, 26, 12, (x, y) => {
    if (inside(x, y)) floorSet.add(at(x, y));
  });
  for (const idx of floorSet) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    if (isGrass(get(x, y))) set(x, y, 5);
  }
  const faceSet = new Set();
  for (const idx of floorSet) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [1, 2], [0, 2]]) {
      const fx = x + ox;
      const fy = y + oy;
      if (!inside(fx, fy) || floorSet.has(at(fx, fy))) continue;
      if (get(fx, fy) === 4 || get(fx, fy) === 8) faceSet.add(at(fx, fy));
    }
  }
  for (const idx of faceSet) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    /* the face is banded: most cells deep, a lighter strata fleck
       now and then, like a seam in the bank */
    set(x, y, (x + y) % 4 === 0 ? 5 : 6);
  }
  for (const idx of faceSet) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    for (const [ox, oy] of [[1, 1], [0, 1], [1, 0]]) {
      const sx = x + ox;
      const sy = y + oy;
      if (inside(sx, sy) && get(sx, sy) === 4 && rng() < 0.7) set(sx, sy, 5);
    }
  }
  for (const idx of floorSet) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    if (!floorSet.has(at(x - 1, y - 1)) && get(x, y) === 5 && rng() < 0.55) {
      set(x, y, 8); // the lit rim, north-west edge only
    }
  }

  /* --- mountains, north-east corner: two rows of peaks. Each peak
     is drawn, not stamped: a snow rim that sits deeper on the lit
     face, a lit west face and a shadow east face, two strata
     grooves cut across with a ledge notch, a streaked cliff band
     at the foot, scree below, and a cast shadow to the lower
     right. --- */
  function peak(cx, top, h) {
    const halfAt = (dy) => Math.max(0, Math.round((dy / h) * h * 0.52));
    const capLit = Math.max(1, Math.round(h * 0.34));
    const capShadow = Math.max(1, Math.round(h * 0.22));
    const grooves = [Math.round(h * 0.55), Math.round(h * 0.76)];
    for (let dy = 0; dy < h; dy += 1) {
      const half = halfAt(dy);
      const ridge = Math.round(half * 0.15);
      const isGroove = grooves.includes(dy);
      for (let dx = -half; dx <= half; dx += 1) {
        if (isGroove && dx === half) continue; // the ledge notch
        const cap = dx <= ridge ? capLit : capShadow;
        let v;
        if (dy < cap) {
          v = 11; // the snow rim
          if (dy === cap - 1 && rng() < (dx <= ridge ? 0.5 : 0.65)) {
            v = dx <= ridge ? 9 : 10; // the rim's jagged lower edge
          }
        } else if (isGroove && dx <= ridge + 2) v = 10; // a groove, not a stripe
        else if (dy === h - 1 && rng() >= 0.25) v = 10; // the cliff band's foot, broken
        else if (dy === h - 2 && rng() < 0.35) v = 10; // cliff flecks
        else if (dy < h * 0.45 && dx <= ridge + 1) v = 9; // light wraps the crest
        else v = dx <= ridge ? 9 : 10;
        set(cx + dx, top + dy, v);
      }
    }
    /* scree: a few stones scattered at the foot */
    const baseHalf = halfAt(h - 1);
    for (let n = 0; n < 4; n += 1) {
      const sx = cx + Math.floor(rng() * (baseHalf * 2 + 5)) - baseHalf - 2;
      const sy = top + h + (rng() < 0.5 ? 0 : 1);
      if (isGrass(get(sx, sy))) set(sx, sy, rng() < 0.5 ? 10 : 9);
    }
    /* the cast shadow, falling lower-right off the massif */
    for (let sx = cx - baseHalf + 2; sx <= cx + baseHalf + 4; sx += 1) {
      for (const sy of [top + h, top + h + 1]) {
        if (isGrass(get(sx, sy)) && rng() < 0.75) set(sx, sy, 5);
      }
    }
  }
  peak(98, 1, 12);
  peak(110, 2, 10);
  peak(118, 3, 8);
  peak(92, 8, 8);
  peak(104, 9, 9);
  peak(114, 11, 7);
  peak(97, 14, 6);

  /* --- dirt paths: town to forest, town to beach, town to the
     hills. The south-east edge of each path is worn into the grass;
     where a path crosses water it becomes a wooden bridge. --- */
  const pathLines = [
    [[75, 40], [73, 36], [71, 31], [70, 27], [67, 24], [64, 22], [60, 21]],
    [[59, 36], [44, 34], [30, 33], [21, 32]],
    [[89, 38], [100, 35], [112, 33], [119, 32]],
  ];
  const bridgeCells = new Set();
  for (const line of pathLines) {
    const cells = rasterise(line);
    for (const [cx, cy] of cells) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (Math.abs(dx) === 1 && Math.abs(dy) === 1) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!inside(x, y)) continue;
          const under = get(x, y);
          if (under === 0 || under === 1) bridgeCells.add(at(x, y));
          if (under !== 11 && under !== 9 && under !== 10) set(x, y, 3);
        }
      }
    }
    /* worn edge shading, south-east side only, where the light
       does not reach and feet have scuffed the grass dark */
    for (const [cx, cy] of cells) {
      for (const [ox, oy] of [[2, 1], [1, 2]]) {
        if (get(cx + ox, cy + oy) === 4 && rng() < 0.8) set(cx + ox, cy + oy, 5);
      }
      if (rng() < 0.05) set(cx, cy, 10); // a stone worn into the path
    }
  }
  /* the bridge: wooden rails flanking the deck, plank streaks on it */
  for (const idx of bridgeCells) {
    const x = idx % W;
    const y = Math.floor(idx / W);
    if (rng() < 0.3) set(x, y, 13);
    for (const fx of [x - 2, x + 2]) {
      const under = get(fx, y);
      if (under === 0 || under === 1) set(fx, y, 13);
    }
  }

  /* --- the town plaza: a worn dirt square, its edge ragged where
     grass creeps back in, its face freckled with stones. --- */
  for (let y = 27; y <= 43; y += 1) {
    for (let x = 58; x <= 90; x += 1) {
      const edge = x === 58 || x === 90 || y === 27 || y === 43;
      if (edge && rng() < 0.5) continue; // a ragged plaza edge
      if (isGrass(get(x, y))) {
        set(x, y, 3);
        if (!edge && rng() < 0.03) set(x, y, 10); // a worn stone
        if (edge && rng() < 0.3) set(x, y, 5);
      }
    }
  }
  /* grass creeping over the inner edge */
  for (let y = 28; y <= 42; y += 1) {
    for (let x = 59; x <= 89; x += 1) {
      const nearEdge = x === 59 || x === 89 || y === 28 || y === 42;
      if (nearEdge && get(x, y) === 3 && rng() < 0.12) set(x, y, 5);
    }
  }

  /* --- grass texture. First the Sea of Stars speckle: two greens
     flecked across open grass, in ones and twos, never a flat
     fill left anywhere large. Then tuft clusters, one direction
     per ground tone, the meadow's rule. Then white flower
     clusters in three drifts, deliberate sparkle. --- */
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (get(x, y) !== 4 || rng() >= 0.05) continue;
      set(x, y, 5);
      if (rng() < 0.5 && get(x + 1, y) === 4) set(x + 1, y, 5);
    }
  }
  const TUFTS = [
    [[1, 0], [0, 1], [2, 1]],
    [[0, 0], [2, 0], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [1, 1], [3, 1], [0, 2], [2, 2], [4, 2]],
  ];
  for (let n = 0; n < 300; n += 1) {
    const x = 20 + Math.floor(rng() * (W - 24));
    const y = Math.floor(rng() * H);
    const ground = get(x, y);
    if (!isGrass(ground)) continue;
    const v = ground === 5 ? 8 : 5; // darker on lit ground, lit on dark
    const shape = TUFTS[Math.floor(rng() * TUFTS.length)];
    const depth = shape.reduce((m, [, d]) => Math.max(m, d), 0);
    for (const [dx, dy] of shape) {
      const gx = x + dx;
      const gy = y - depth + dy;
      if (isGrass(get(gx, gy))) set(gx, gy, v);
    }
  }
  for (const [fx, fy] of [[30, 30], [104, 26], [36, 40]]) {
    for (let n = 0; n < 5; n += 1) {
      const x = fx + Math.floor(rng() * 9) - 4;
      const y = fy + Math.floor(rng() * 7) - 3;
      if (!isGrass(get(x, y)) || !isGrass(get(x + 1, y)) || !isGrass(get(x, y + 1))) continue;
      set(x, y, 11);
      set(x + 1, y, 11);
      set(x, y + 1, 11);
    }
  }

  /* --- fences along the plaza's north edge, with a gap where the
     forest path leaves town --- */
  for (const [fx0, fx1] of [[60, 69], [79, 88]]) {
    for (let x = fx0; x <= fx1; x += 1) {
      if (isGrass(get(x, 26)) || get(x, 26) === 3) set(x, 26, 13);
      if (x % 3 === 0 && (isGrass(get(x, 25)) || get(x, 25) === 3)) set(x, 25, 13);
    }
  }

  /* --- trees. A canopy is a layered cluster, never a flat blob:
     an ellipse mask filled deep, a mid stamp offset toward the
     light, a speckled lit cap further up-left, rim light on the
     open top edge, and a stepped cast shadow on the ground to the
     lower right, laid down before the canopy so the tree stands
     in front of its own shade. --- */
  function tree(cx, cy, s) {
    const parts = [
      [0, -0.4, 2.9, 2.2],
      [-2.0, 0.6, 1.8, 1.6],
      [2.0, 0.5, 1.9, 1.7],
    ];
    const mask = new Set();
    for (const [ox, oy, rx, ry] of parts) {
      stamp(cx + ox * s, cy + oy * s, rx * s, ry * s, (x, y) => {
        if (inside(x, y)) mask.add(at(x, y));
      });
    }
    for (const idx of mask) {
      if (!isGrass(get(idx % W, Math.floor(idx / W)))) return; // never on path, water, dirt
    }
    /* the cast shadow, lower right, on grass only */
    stamp(cx + 2.8 * s, cy + 2.6 * s, 3 * s, 1.3 * s, (x, y) => {
      if (get(x, y) === 4 || get(x, y) === 8) set(x, y, 5);
    });
    for (const idx of mask) set(idx % W, Math.floor(idx / W), 6);
    const clipped = (ox, oy, rx, ry, v) =>
      stamp(cx + ox * s, cy + oy * s, rx * s, ry * s, (x, y) => {
        if (inside(x, y) && mask.has(at(x, y))) set(x, y, v);
      });
    clipped(-0.5, -0.5, 2.4, 1.8, 7); // the mid tone
    clipped(-1.1, -1.2, 2.0, 1.4, 8); // the lit cap
    for (const idx of mask) {
      const x = idx % W;
      const y = Math.floor(idx / W);
      if (get(x, y) === 8 && rng() < 0.3) set(x, y, 7); // speckle the cap
      const openAbove = !mask.has(at(x, y - 1));
      if (openAbove && x <= cx + 1) set(x, y, 8); // rim light
    }
    /* the trunk, one cell under the canopy's heart */
    const ty = cy + Math.round(2.6 * s) + 1;
    if (isGrass(get(cx, ty)) || get(cx, ty) === 3) set(cx, ty, 6);
  }
  const routeCells = new Set(rasterise(pathLines[0]).map(([x, y]) => at(x, y)));
  for (let gy = 6; gy <= 25; gy += 5) {
    for (let gx = 24; gx <= 70; gx += 5) {
      const cx = gx + Math.floor(rng() * 3) - 1;
      const cy = gy + Math.floor(rng() * 3) - 1;
      const norm = ((cx - 46) / 24) ** 2 + ((cy - 15) / 10.5) ** 2;
      if (norm > 1) continue;
      if (Math.hypot(cx - 60, cy - 21) < 5.5) continue; // the clearing
      if (routeCells.has(at(cx, cy))) continue;
      tree(cx, cy, 1);
    }
  }
  /* a few lone trees out on the grass, a touch larger */
  for (let n = 0; n < 7; n += 1) {
    const x = 24 + Math.floor(rng() * 88);
    const y = 4 + Math.floor(rng() * 38);
    if (Math.hypot(x - 60, y - 21) < 6) continue;
    if (x > 84 && y < 20) continue; // not in the peaks
    if (x >= 56 && x <= 92 && y >= 25 && y <= 44) continue; // not in town
    tree(x, y, 1.3);
  }

  /* --- the town: five houses, five faces. Every house is built
     the same way a peak is: a cast shadow laid down first, then a
     roof in two faces, lit from the west, shaded to the east,
     over walls, a door, and a stone foundation. What differs is
     the face each one wears. --- */
  function house(hx, hy, face) {
    /* the cast shadow, lower right, on dirt or grass: two rows
       only, broken at the edge, so it lies on the ground instead
       of reading as a paved apron */
    for (let dx = 2; dx <= 9; dx += 1) {
      for (let dy = 7; dy <= 8; dy += 1) {
        if (dy === 8 && dx < 4) continue; // the taper
        if (rng() < 0.35) continue; // a stepped, broken edge
        const under = get(hx + dx, hy + dy);
        if (under === 3) set(hx + dx, hy + dy, 10);
        else if (under === 4 || under === 8) set(hx + dx, hy + dy, 5);
      }
    }
    const tall = face === "tall";
    const wallRows = tall ? [4, 5, 6, 7] : [4, 5, 6];
    const baseRow = tall ? 8 : 7;
    /* the roof, widening as it falls, lit face west, shaded east */
    const roofWidths = [[3, 5], [2, 6], [1, 7], [0, 8]];
    roofWidths.forEach(([a, b], dy) => {
      for (let dx = a; dx <= b; dx += 1) {
        if (dy === 3) set(hx + dx, hy + dy, 13); // the eaves, all shade
        else set(hx + dx, hy + dy, dx <= 4 ? 12 : 13);
      }
    });
    for (const dy of wallRows) {
      for (let dx = 1; dx <= 7; dx += 1) set(hx + dx, hy + dy, 14);
    }
    for (let dx = 1; dx <= 7; dx += 1) set(hx + dx, hy + baseRow, 10); // foundation
    /* the door, wooden, with the window slot beside it */
    const doorX = face === "awning" ? 3 : 4;
    set(hx + doorX, hy + 5, 13);
    set(hx + doorX, hy + 6, 13);
    if (tall) set(hx + doorX, hy + 7, 13);
    const windows =
      face === "awning" ? [6] : face === "sign" ? [6] : [2, 6];
    for (const wx of windows) set(hx + wx, hy + 5, 2);
    /* the faces, one per house */
    if (face === "chimney" || face === "crates") {
      set(hx + 6, hy - 1, 9);
      set(hx + 6, hy - 2, 10);
    }
    if (face === "awning") {
      set(hx + 2, hy + 4, 12);
      set(hx + 3, hy + 4, 13);
      set(hx + 4, hy + 4, 12);
    }
    if (face === "crates") {
      set(hx + 10, hy + 5, 13);
      set(hx + 10, hy + 6, 10);
      set(hx + 11, hy + 6, 13);
    }
    if (face === "sign") {
      set(hx - 2, hy + 5, 13);
      set(hx - 2, hy + 6, 13);
      set(hx - 2, hy + 4, 12); // a red board on a post, Eastward's ration
    }
  }
  house(59, 27, "chimney");
  house(70, 27, "awning");
  house(81, 27, "crates");
  house(61, 37, "sign");
  house(78, 36, "tall");

  /* --- the well, in the gap between the rows: a wooden roof bar
     on two posts over a stone rim and dark water --- */
  {
    const wx = 74;
    const wy = 35;
    set(wx, wy, 13);
    set(wx + 1, wy, 12);
    set(wx + 2, wy, 12);
    set(wx + 3, wy, 13);
    set(wx, wy + 1, 13);
    set(wx + 3, wy + 1, 13);
    set(wx, wy + 2, 9);
    set(wx + 1, wy + 2, 0);
    set(wx + 2, wy + 2, 0);
    set(wx + 3, wy + 2, 9);
  }

  /* --- a market stall just outside the plaza's west edge, its
     canopy striped lit and shaded, crates stacked beside it --- */
  {
    const sx = 52;
    const sy = 30;
    for (let dx = 0; dx <= 5; dx += 1) set(sx + dx, sy, dx % 2 === 0 ? 12 : 13);
    set(sx, sy + 1, 13);
    set(sx + 5, sy + 1, 13);
    for (let dx = 0; dx <= 5; dx += 1) set(sx + dx, sy + 2, dx === 1 || dx === 4 ? 14 : 13);
    set(sx, sy + 3, 13);
    set(sx + 5, sy + 3, 13);
    set(sx - 2, sy + 2, 13);
    set(sx - 2, sy + 3, 10);
    set(sx - 1, sy + 3, 13);
  }

  /* --- two lanterns: a wooden post and a lamp cell in the window
     slot, dark glass by day, burning warm by night. One stands on
     the forest path, one in the plaza's corner. --- */
  for (const [lx, ly] of [[68, 24], [59, 43]]) {
    set(lx, ly, 13);
    set(lx, ly - 1, 2);
  }

  /* --- water sparkles: seeded cells on open water, two groups,
     the sea and the river together --- */
  const sparkles = [[], []];
  let guard = 0;
  while (sparkles[0].length + sparkles[1].length < 28 && guard < 1200) {
    guard += 1;
    const x = Math.floor(rng() * (W - 4));
    const y = Math.floor(rng() * H);
    if (get(x, y) !== 1) continue;
    if (bridgeCells.has(at(x, y))) continue;
    sparkles[sparkles[0].length <= sparkles[1].length ? 0 : 1].push(at(x, y));
  }

  const route = rasterise(pathLines[0]);
  return { map, route, sparkles };
}

function setUpOverworld() {
  const canvas = document.querySelector('[data-gallery="map"]');
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  const { map, route, sparkles } = buildMap();
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const palette = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && systemDark.matches)
      ? NIGHT
      : DAY;

  let heroStep = 0; // index into route; 0 is home, in town
  let heroDir = 1;
  let sparklePhase = 0;

  function paint() {
    const pal = palette();
    for (let i = 0; i < map.length; i += 1) {
      ctx.fillStyle = pal[map[i]];
      ctx.fillRect(i % W, Math.floor(i / W), 1, 1);
    }
    for (const idx of sparkles[sparklePhase]) {
      ctx.fillStyle = pal[11];
      ctx.fillRect(idx % W, Math.floor(idx / W), 1, 1);
    }
    const [hx, hy] = route[heroStep];
    ctx.fillStyle = pal[14];
    ctx.fillRect(hx, hy - 2, 1, 1); // head
    ctx.fillStyle = pal[15];
    ctx.fillRect(hx, hy - 1, 1, 1); // body
    ctx.fillRect(hx, hy, 1, 1); // feet on the path
  }

  paint();

  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  systemDark.addEventListener("change", paint);

  if (reduced.matches) return; // one static frame, hero at home

  const rng = mulberry32(112358);
  const schedule = (ms, fn) => window.setTimeout(fn, ms);

  function heroTick() {
    const atEnd =
      (heroDir === 1 && heroStep === route.length - 1) ||
      (heroDir === -1 && heroStep === 0);
    if (atEnd) {
      heroDir *= -1;
      schedule(1400 + rng() * 2200, heroTick); // a hold at each end
      return;
    }
    heroStep += heroDir;
    paint();
    const pause = rng() < 0.16 ? 700 : 0; // now and then, a pause to look
    schedule(250 + pause, heroTick);
  }
  schedule(1200, heroTick);

  function sparkleTick() {
    sparklePhase = sparklePhase === 0 ? 1 : 0;
    paint();
    schedule(1000 + rng() * 500, sparkleTick);
  }
  schedule(1600, sparkleTick);
}

setUpOverworld();
