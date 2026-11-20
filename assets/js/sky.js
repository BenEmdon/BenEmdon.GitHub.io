/*
  Experiment: cloud study. A slim sky strip above the wordmark, drawn on a
  fixed 96 x 8 cell grid. The clouds are Ghibli cumulus: flat bottoms,
  stepped tops, hard shade steps, no dither inside them, and the sky is
  flat and mostly empty (a dithered sky band was tried and cut in pass 2:
  at this height it read as a ruler, not air).

  Anchor: subject is the clouds, one light from above, layers back to front
  are sky, far cloud, wisp, small cumulus, big cumulus. Colour budget is
  seven per time-of-day state. Palettes are fixed per state rather than
  following the site theme, the same choice the portrait's fixed duotone
  makes: the strip reads as a small picture above the name.

  Pixel rule: cells never move. The time-of-day state swaps whole cells to
  another palette colour, and on a slow tick the cloud tops swap their lit
  shade for a warmer one. Nothing drifts, nothing fades.

  Ships hidden and is unwrapped here, so without JS there is no empty strip
  above the wordmark. ?sky=day|dawn|dusk|night pins a state, for captures
  and for looking at the other skies without waiting for them.
*/

const wrap = document.querySelector("[data-sky]");
const canvas = document.querySelector("[data-sky-canvas]");

if (wrap && canvas) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Palettes as data. Shadows rotate cooler toward blue and purple,
     highlights warmer toward yellow, per the pixel art references. */
  const PALETTES = {
    day: {
      sky: "#bfd9ee",
      lit: "#fdfbf3",
      litHi: "#ffeec4",
      mid: "#d9e4f0",
      shadow: "#9db8d8",
      star: "#e9edf5",
    },
    dawn: {
      sky: "#cfc3e4",
      lit: "#ffe9c4",
      litHi: "#fff3d6",
      mid: "#eed9d8",
      shadow: "#9d8bbd",
      star: "#e9edf5",
    },
    dusk: {
      sky: "#e59a5f",
      lit: "#ffd9a0",
      litHi: "#ffe7bd",
      mid: "#e08a6d",
      shadow: "#77597f",
      star: "#e9edf5",
    },
    night: {
      sky: "#141f36",
      lit: "#64799c",
      litHi: "#7d92b2",
      mid: "#46597a",
      shadow: "#2b3a58",
      star: "#e9edf5",
    },
  };

  /* Cloud maps, hand-drawn clusters. L is the lit top, M the mid body,
     S the shadow underside. Flat bottom rows, stepped tops, and the
     shadow boundary steps up in the middle where the cloud is thickest. */
  const BIG = [
    ".............LLLLL............",
    ".....LLLL....LLLLLLLLL........",
    "....LLLLLM...LLLLLLLMMMM......",
    "...MMMMMMMMMMMMMMMMMMMMMMM....",
    "..MMMMMMSSSSSSSSSSSSMMMMMMM...",
    "..SSSSSSSSSSSSSSSSSSSSSSSSS...",
  ];
  const SMALL = [
    ".....LLLLL......",
    "...LLLLLLLMMM...",
    "..MMMSSSSSSMMM..",
    "..SSSSSSSSSSSS..",
  ];
  const WISP = ["..LLLLL...", ".MMMMMMMM."];
  const FAR = ["....LLLL....", "..MMMMMMMM.."];

  /* Back to front. Positions are fixed; the sky stays mostly empty. */
  const CLOUDS = [
    { map: FAR, x: 40, y: 2 },
    { map: WISP, x: 76, y: 1 },
    { map: SMALL, x: 57, y: 3 },
    { map: BIG, x: 5, y: 2 },
  ];

  /* Night only, and named in the anchor as deliberate details: single
     pixel stars, plus one plus-shaped cluster at (90, 3). */
  const STARS = [
    [14, 0],
    [24, 1],
    [36, 0],
    [48, 0],
    [52, 1],
    [63, 2],
    [70, 0],
    [80, 0],
    [88, 1],
    [93, 0],
  ];
  const STAR_PLUS = [90, 3];

  /* Ottawa time, the same Intl pattern the footer clock uses: his time,
     not the reader's, because the sky is the one over his header. */
  const ottawaHour = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hourCycle: "h23",
  });

  function stateFor(hour) {
    if (hour >= 5 && hour < 8) return "dawn";
    if (hour >= 8 && hour < 17) return "day";
    if (hour >= 17 && hour < 21) return "dusk";
    return "night";
  }

  function drawCloud({ map, x, y }, p, phase) {
    map.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === ".") return;
        let colour = ch === "L" ? p.lit : ch === "M" ? p.mid : p.shadow;
        /* The slow lightening: only the topmost row of each cloud swaps
           to the warmer lit shade. A whole-cell swap on the tick. */
        if (phase && dy === 0 && ch === "L") colour = p.litHi;
        ctx.fillStyle = colour;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      });
    });
  }

  function draw(state, phase) {
    const p = PALETTES[state];

    /* Flat sky, deliberately. Pass 1 tried a deep top row with a sparse
       dither row under it, and at this height it read as a notched ruler
       along the top edge, not as air. Ghibli skies earn their calm by
       being mostly empty; the clouds carry the strip on their own. */
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 0, W, canvas.height);

    if (state === "night") {
      ctx.fillStyle = p.star;
      for (const [x, y] of STARS) ctx.fillRect(x, y, 1, 1);
      const [cx, cy] = STAR_PLUS;
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillRect(cx - 1, cy, 1, 1);
      ctx.fillRect(cx + 1, cy, 1, 1);
      ctx.fillRect(cx, cy - 1, 1, 1);
      ctx.fillRect(cx, cy + 1, 1, 1);
    }

    for (const cloud of CLOUDS) drawCloud(cloud, p, phase);
    wrap.dataset.skyState = state;
  }

  const forced = new URLSearchParams(location.search).get("sky");
  const pinned = forced && PALETTES[forced] ? forced : null;

  let state = pinned ?? stateFor(Number(ottawaHour.format(new Date())));
  let phase = false;
  draw(state, phase);
  wrap.hidden = false;

  /* Reduced motion gets the current state only: no lightening tick, no
     state polling. The picture is simply there. */
  if (!reduced.matches) {
    window.setInterval(() => {
      phase = !phase;
      draw(state, phase);
    }, 6000);

    if (!pinned) {
      window.setInterval(() => {
        const next = stateFor(Number(ottawaHour.format(new Date())));
        if (next !== state) {
          state = next;
          draw(state, phase);
        }
      }, 30_000);
    }
  }
}
