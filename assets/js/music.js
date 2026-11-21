/*
  The music maker: a small sequencer for 16-bit adventure music, built
  the way the pixel art on this site is built. The song is text first.
  Each channel is a piano-roll character map, one character per step,
  and the grid on the page is the same text in another form. Editing
  either view edits the one text, even while the song plays.

  The sound is the SNES recipe, faked lightly: no console had a synth
  worth the name in 16 bits, it played short samples through one shared
  echo. So the instruments here are tiny procedural samples made at
  load (sine and saw sums, softened), and every channel can send into
  one feedback delay with a dark filter in its loop.

  Timing follows the two-clocks pattern: a 25 ms timer schedules notes
  0.12 s ahead against the audio clock, always reading the current
  compiled song, so a toggle lands in the music within a step or two.
  No assets, no WASM, no worklet, no build step.

  main.js is not loaded here: it assumes the home page's DOM. The theme
  toggle below is the same miniature mochi.js uses, same localStorage
  key, so a choice made on any page holds on all of them.
*/

import { createThemeScene } from "./theme-scene.js";

/* ---------- theme ---------- */

const THEME_KEY = "theme";
const MODES = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return MODES.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

function setUpThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;
  const label = toggle.querySelector("[data-theme-label]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let mode = storedMode();

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

  const sceneCanvas = document.querySelector("[data-theme-scene]");
  const themeScene = sceneCanvas
    ? createThemeScene(sceneCanvas, { dark: resolvedDark() })
    : null;

  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    const resolved = systemDark.matches ? "dark" : "light";
    if (label) label.textContent = mode;
    toggle.setAttribute(
      "aria-label",
      `Theme: ${mode === "system" ? `system (${resolved})` : mode}. ` +
        `Switch to ${nextMode(mode)}.`
    );
    themeScene?.setDark(resolvedDark(), reduced.matches);
  }

  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  toggle.addEventListener("click", () => {
    mode = nextMode(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice holds this visit.
    }
    applyMode();
  });

  applyMode();
}

/* ---------- demo songs ---------- */
/*
  Both demos are original loops written straight into the format.
  The forest is the full eight channels over two patterns. The village
  is the small case: one pattern, no order line, looped as it stands.
*/

const DEMO_FOREST = `title: First Light Over the Forest
bpm: 126
key: D dorian
steps: 32
echo: .35

:: A

[lead · ocarina · vol .9 · echo .55 · pan -.08]
C6 |....|....|....|....|....|....|x--.|....|
A5 |....|....|x---|....|....|....|....|x-..|
G5 |....|....|....|....|....|....|....|..x-|
F5 |....|x-..|....|x-..|x---|....|....|....|
E5 |....|....|....|..x-|....|....|....|....|
D5 |x--.|....|....|....|....|....|....|....|

[harmony · flute · vol .55 · echo .4 · pan .15]
A4 |x---|--..|....|....|....|....|....|....|
F4 |....|....|....|....|x---|--..|....|....|
E4 |....|....|....|....|....|....|x---|....|

[harp · harp · vol .5 · echo .35 · pan .05]
F5 |....|....|....|....|....|..x.|....|..x.|
D5 |....|..x.|....|..x.|....|....|....|....|
C5 |....|....|....|....|....|x...|....|x...|
A4 |....|x...|....|x...|..x.|....|..x.|....|
F4 |..x.|....|..x.|....|x...|....|x...|....|
D4 |x...|....|x...|....|....|....|....|....|

[strings · strings · vol .5 · echo .25]
C5 |....|....|....|....|x---|----|----|----|
A4 |x---|----|----|----|x---|----|----|----|
F4 |x---|----|----|----|x---|----|----|----|
D4 |x---|----|----|----|....|....|....|....|

[bass · bass · vol .8 · echo .05]
D3 |x-..|....|....|x...|....|....|....|....|
C3 |....|....|....|....|....|....|x...|....|
A2 |....|....|x...|....|....|....|....|....|
F2 |....|....|....|....|x-..|....|....|x...|

[bells · bell · vol .45 · echo .6 · pan .2]
D6 |x...|....|....|....|....|....|....|....|
C6 |....|....|....|....|....|....|x...|....|
A5 |....|....|....|....|x...|....|....|....|

[arp · pulse · vol .22 · echo .2 · pan -.15]
C5 |....|....|....|....|..x.|..x.|..x.|..x.|
A4 |..x.|..x.|..x.|..x.|.x.x|.x.x|.x.x|.x.x|
F4 |.x.x|.x.x|.x.x|.x.x|x...|x...|x...|x...|
D4 |x...|x...|x...|x...|....|....|....|....|

[drums · drums · vol .7 · echo .12]
hat  |....|x...|....|x...|....|x...|....|x...|
snare|....|....|x...|....|....|....|x...|....|
kick |x...|....|....|....|x...|....|....|....|

:: B

[lead · ocarina · vol .9 · echo .55 · pan -.08]
G5 |x---|....|....|....|....|....|....|....|
E5 |....|..x-|....|..x-|....|....|....|....|
D5 |....|....|....|x-..|x---|....|....|..x-|
C5 |....|....|x---|....|....|....|....|....|
B4 |....|....|....|....|....|x-..|....|x-..|
A4 |....|....|....|....|....|....|x---|....|
G4 |....|....|....|....|....|..x-|....|....|

[harmony · flute · vol .55 · echo .4 · pan .15]
E4 |....|....|x---|....|....|....|....|....|
D4 |....|....|....|....|x---|--..|....|....|
C4 |x---|--..|....|....|....|....|....|....|
B3 |....|....|....|....|....|....|x---|....|

[harp · harp · vol .5 · echo .35 · pan .05]
G5 |....|....|....|....|....|..x.|....|..x.|
D5 |....|....|....|....|....|x...|....|x...|
C5 |....|..x.|....|..x.|....|....|....|....|
B4 |....|....|....|....|..x.|....|..x.|....|
G4 |....|x...|....|x...|x...|....|x...|....|
E4 |..x.|....|..x.|....|....|....|....|....|
C4 |x...|....|x...|....|....|....|....|....|

[strings · strings · vol .5 · echo .25]
G4 |x---|----|----|----|x---|----|----|----|
E4 |x---|----|----|----|....|....|....|....|
D4 |....|....|....|....|x---|----|----|----|
C4 |x---|----|----|----|....|....|....|....|
B3 |....|....|....|....|x---|----|----|----|

[bass · bass · vol .8 · echo .05]
D3 |....|....|....|....|....|....|x...|....|
C3 |x-..|....|....|x...|....|....|....|....|
G2 |....|....|x...|....|x-..|....|....|x...|

[bells · bell · vol .45 · echo .6 · pan .2]
D6 |....|....|....|....|x...|....|....|....|
B5 |....|....|....|....|....|....|x...|....|
G5 |x...|....|....|....|....|....|....|....|

[arp · pulse · vol .22 · echo .2 · pan -.15]
D5 |....|....|....|....|..x.|..x.|..x.|..x.|
B4 |....|....|....|....|.x.x|.x.x|.x.x|.x.x|
G4 |..x.|..x.|..x.|..x.|x...|x...|x...|x...|
E4 |.x.x|.x.x|.x.x|.x.x|....|....|....|....|
C4 |x...|x...|x...|x...|....|....|....|....|

[drums · drums · vol .7 · echo .12]
shaker|x...|x...|x...|x...|x...|x...|x...|x...|
hat  |....|x...|....|x...|....|x...|....|x...|
snare|....|....|x...|....|....|....|x...|....|
kick |x...|....|....|....|x...|....|....|....|

order: A B
`;

const DEMO_VILLAGE = `title: Village Morning
bpm: 112
key: G major
steps: 16
echo: .3

[lead · flute · vol .85 · echo .5 · pan -.05]
D5 |x...|....|....|x--.|
C5 |....|....|..x.|....|
B4 |..x.|....|x-..|...x|
A4 |....|..x.|....|....|
G4 |....|x-..|....|....|

[harp · harp · vol .5 · echo .3 · pan .08]
D5 |....|x...|....|....|
B4 |..x.|..x.|....|....|
A4 |....|....|....|x...|
G4 |x...|....|..x.|....|
F#4|....|....|....|..x.|
E4 |....|....|x...|....|

[strings · strings · vol .45 · echo .2]
B4 |x---|----|....|....|
G4 |x---|----|x---|....|
A4 |....|....|....|x---|
F#4|....|....|....|x---|
E4 |....|....|x---|....|
D4 |x---|----|....|x---|
C4 |....|....|x---|....|

[bass · bass · vol .8 · echo .05]
D3 |....|....|....|x-..|
C3 |....|....|x-..|....|
B2 |....|x-..|....|....|
G2 |x-..|....|....|....|

[bells · bell · vol .4 · echo .55 · pan .18]
D6 |x...|....|....|....|
G5 |....|....|x...|....|

[drums · drums · vol .6 · echo .1]
hat   |..x.|..x.|..x.|..x.|
shaker|....|x...|....|x...|
kick  |x...|....|x...|....|
`;

/* ---------- the song parser ---------- */
/*
  Line-oriented and forgiving. Header lines (key: value) come first,
  then blocks. A block starts with a bracket header naming the channel
  and its instrument, then one row per pitch. ":: A" starts a new
  pattern; "order:" at the end says how patterns chain. Comments start
  with ";" anywhere, or with "#" at the start of a line or after a
  space (a "#" glued to a letter is a sharp, as in F#5).

  Each row records the exact character position of every step in the
  source line, so a click in the grid can rewrite one character of the
  text and the two views can never drift apart.
*/

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DRUM_ROWS = ["kick", "snare", "hat", "shaker"];
const INSTRUMENT_NAMES = [
  "ocarina", "flute", "strings", "harp", "bell", "bass", "pulse", "drums",
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function parsePitch(label) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(label);
  if (!m) return null;
  let semi = NOTE_SEMITONES[m[1]];
  if (m[2] === "#") semi += 1;
  if (m[2] === "b") semi -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + semi;
}

function stripComment(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ";") return line.slice(0, i);
    if (line[i] === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseSong(text) {
  const warnings = [];
  const meta = { title: "untitled", bpm: 120, key: "", steps: 16, echo: 0.3 };
  const patterns = new Map();
  let order = null;
  let pattern = null;
  let channel = null;
  let inBlocks = false;

  const fail = (msg) => {
    throw new Error(msg);
  };

  const newPattern = (name) => {
    if (patterns.has(name)) fail(`pattern ${name} is defined twice`);
    const p = { name, channels: [], byName: new Map() };
    patterns.set(name, p);
    return p;
  };

  text.split("\n").forEach((raw, lineIndex) => {
    const line = stripComment(raw);
    const trimmed = line.trim();
    if (!trimmed) return;
    const at = `line ${lineIndex + 1}`;

    const patMatch = /^::\s*(\S+)\s*$/.exec(trimmed);
    if (patMatch) {
      pattern = newPattern(patMatch[1]);
      channel = null;
      inBlocks = true;
      return;
    }

    const orderMatch = /^order\s*:\s*(.+)$/i.exec(trimmed);
    if (orderMatch) {
      order = orderMatch[1].split(/[\s,]+/).filter(Boolean);
      channel = null;
      return;
    }

    const blockMatch = /^\[(.*)\]$/.exec(trimmed);
    if (blockMatch) {
      inBlocks = true;
      if (!pattern) pattern = newPattern("A");
      const parts = blockMatch[1].split("·").map((s) => s.trim());
      const name = parts[0];
      const instrument = (parts[1] || "").toLowerCase();
      if (!name) fail(`${at}: a block needs a channel name`);
      if (!INSTRUMENT_NAMES.includes(instrument)) {
        fail(
          `${at}: unknown instrument "${parts[1] || ""}" ` +
            `(try ${INSTRUMENT_NAMES.join(", ")})`
        );
      }
      if (pattern.byName.has(name)) {
        fail(`${at}: two blocks named "${name}" in pattern ${pattern.name}`);
      }
      channel = {
        name,
        instrument,
        vol: 0.8,
        echo: meta.echo,
        pan: 0,
        rows: [],
      };
      for (const part of parts.slice(2)) {
        const kv = /^(\w+)\s+(-?[\d.]+)$/.exec(part);
        if (!kv) {
          warnings.push(`${at}: ignored "${part}" in the ${name} header`);
          continue;
        }
        const val = parseFloat(kv[2]);
        if (kv[1] === "vol") channel.vol = clamp(val, 0, 1);
        else if (kv[1] === "echo") channel.echo = clamp(val, 0, 1);
        else if (kv[1] === "pan") channel.pan = clamp(val, -1, 1);
        else warnings.push(`${at}: unknown setting "${kv[1]}", ignored`);
      }
      pattern.channels.push(channel);
      pattern.byName.set(name, channel);
      return;
    }

    if (!inBlocks) {
      const kv = /^([a-z]+)\s*:\s*(.*)$/i.exec(trimmed);
      if (kv) {
        const k = kv[1].toLowerCase();
        const v = kv[2].trim();
        if (k === "title") meta.title = v || meta.title;
        else if (k === "key") meta.key = v;
        else if (k === "bpm") {
          const n = parseFloat(v);
          if (n > 20 && n < 400) meta.bpm = n;
          else warnings.push(`${at}: bpm "${v}" looks wrong, kept ${meta.bpm}`);
        } else if (k === "steps") {
          const n = parseInt(v, 10);
          if (n >= 4 && n <= 64) meta.steps = n;
          else warnings.push(`${at}: steps "${v}" out of range, kept ${meta.steps}`);
        } else if (k === "echo") {
          const n = parseFloat(v);
          if (!Number.isNaN(n)) meta.echo = clamp(n, 0, 1);
        } else {
          warnings.push(`${at}: unknown header "${k}", ignored`);
        }
        return;
      }
    }

    if (!channel) {
      fail(`${at}: "${trimmed.slice(0, 28)}" sits outside any [block]`);
    }
    const bar = line.indexOf("|");
    if (bar < 0) fail(`${at}: rows look like "D5 |x...|....|"`);
    const label = line.slice(0, bar).trim();
    const drumName = label.toLowerCase();
    const isDrum = DRUM_ROWS.includes(drumName);
    const midi = isDrum ? null : parsePitch(label);
    if (!isDrum && midi === null) {
      fail(
        `${at}: "${label}" is not a pitch like F#5 ` +
          `or a drum (kick, snare, hat, shaker)`
      );
    }

    let cells = "";
    const charPos = [];
    for (let i = bar; i < line.length; i++) {
      const c = line[i];
      if (c === "." || c === "x" || c === "-") {
        cells += c;
        charPos.push(i);
      } else if (c === "|" || c === " ") {
        continue;
      } else {
        fail(`${at}: unexpected "${c}" in a row (only . x - and |)`);
      }
    }

    let editable = true;
    if (cells.length !== meta.steps) {
      warnings.push(
        `${at}: row ${label} has ${cells.length} steps, ` +
          `the song has ${meta.steps}; adjusted, and this row ` +
          `cannot be edited from the grid until the counts match`
      );
      editable = false;
      cells =
        cells.length < meta.steps
          ? cells.padEnd(meta.steps, ".")
          : cells.slice(0, meta.steps);
    }
    if (channel.rows.some((r) => r.label === (isDrum ? drumName : label))) {
      warnings.push(`${at}: row ${label} appears twice in ${channel.name}`);
    }
    channel.rows.push({
      label: isDrum ? drumName : label,
      midi,
      drum: isDrum ? drumName : null,
      cells,
      charPos,
      lineIndex,
      editable,
    });
  });

  if (patterns.size === 0) {
    fail("no [channel] blocks found: a song needs at least one");
  }
  if (!order) order = [...patterns.keys()];
  if (order.length === 0) fail("the order line is empty");
  for (const name of order) {
    if (!patterns.has(name)) {
      fail(`the order line names pattern "${name}", which does not exist`);
    }
  }

  // Compile rows to events, and sort rows the way a piano roll reads:
  // drums in kit order, pitches high to low.
  for (const p of patterns.values()) {
    for (const ch of p.channels) {
      ch.eventsByStep = Array.from({ length: meta.steps }, () => []);
      for (const row of ch.rows) {
        let i = 0;
        while (i < row.cells.length) {
          const c = row.cells[i];
          if (c === "x") {
            let j = i + 1;
            while (j < row.cells.length && row.cells[j] === "-") j++;
            ch.eventsByStep[i].push({
              midi: row.midi,
              drum: row.drum,
              start: i,
              dur: j - i,
            });
            i = j;
          } else {
            if (c === "-" && (i === 0 || row.cells[i - 1] === ".")) {
              warnings.push(
                `pattern ${p.name}, ${ch.name} ${row.label}: ` +
                  `a "-" with no note before it, treated as a rest`
              );
            }
            i++;
          }
        }
      }
      ch.rows.sort((a, b) =>
        a.drum && b.drum
          ? DRUM_ROWS.indexOf(a.drum) - DRUM_ROWS.indexOf(b.drum)
          : (b.midi ?? 0) - (a.midi ?? 0)
      );
    }
  }

  return { meta, patterns, order, warnings };
}

/* ---------- instruments ---------- */
/*
  Tiny procedural samples, made fresh for whatever context asks (the
  live one, or an offline one for export). Each is a sum of partials
  over one root note, softened by a smoothing pass so the top end is
  muffled the way low-rate console samples were. Looped instruments
  hold an exact number of cycles of their root, and the tail is
  crossfaded into the head so the loop point does not click. Noise
  comes from a seeded generator, so the kit sounds the same each load.
*/

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(data, passes) {
  const len = data.length;
  for (let p = 0; p < passes; p++) {
    let prev = data[len - 1];
    for (let i = 0; i < len; i++) {
      const cur = data[i];
      const next = data[(i + 1) % len];
      data[i] = (prev + 2 * cur + next) / 4;
      prev = cur;
    }
  }
}

function normalize(data, peak) {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max === 0) return;
  const scale = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}

function crossfadeLoop(data, ms, sampleRate) {
  const n = Math.min(
    Math.round((ms / 1000) * sampleRate),
    Math.floor(data.length / 2)
  );
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const idx = data.length - n + i;
    data[idx] = data[idx] * (1 - t) + data[i] * t;
  }
}

function fillBuffer(ctx, seconds, fill) {
  const len = Math.max(1, Math.round(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  fill(buf.getChannelData(0), ctx.sampleRate);
  return buf;
}

// partials: [multiple of the root, amplitude, decay seconds or 0]
function toneBuffer(ctx, opts) {
  const f0 = 440 * Math.pow(2, (opts.rootMidi - 69) / 12);
  const cycles = Math.max(1, Math.round(opts.seconds * f0));
  const dur = opts.oneShot ? opts.seconds : cycles / f0;
  const rand = mulberry32(opts.seed ?? 7);
  return fillBuffer(ctx, dur, (data, sr) => {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      let v = 0;
      for (const [mult, amp, decay] of opts.partials) {
        const a = decay ? amp * Math.exp(-t / decay) : amp;
        v += a * Math.sin(2 * Math.PI * f0 * mult * t);
      }
      if (opts.noiseAmp) {
        const breath = (rand() * 2 - 1) * opts.noiseAmp;
        v += opts.oneShot ? breath * Math.exp(-t / 0.2) : breath;
      }
      if (opts.oneShot && opts.decayTau) v *= Math.exp(-t / opts.decayTau);
      data[i] = v;
    }
    smooth(data, 2);
    normalize(data, 0.85);
    if (!opts.oneShot) crossfadeLoop(data, 12, sr);
  });
}

function stringsBuffer(ctx) {
  const f0 = 440; // A4, the strings buffer's root
  const cycles = Math.round(0.5 * f0);
  return fillBuffer(ctx, cycles / f0, (data, sr) => {
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      let v = 0;
      for (const cents of [-7, 0, 7]) {
        const f = f0 * Math.pow(2, cents / 1200);
        for (let k = 1; k <= 7; k++) {
          v += (1 / k / 3) * Math.sin(2 * Math.PI * f * k * t);
        }
      }
      data[i] = v;
    }
    smooth(data, 5);
    normalize(data, 0.6);
    crossfadeLoop(data, 15, sr);
  });
}

function makeInstruments(ctx) {
  const noise = fillBuffer(ctx, 1, (data) => {
    const rand = mulberry32(20261121);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  });
  return {
    ocarina: {
      buffer: toneBuffer(ctx, {
        rootMidi: 72, seconds: 0.4, seed: 11, noiseAmp: 0.015,
        partials: [[1, 1, 0], [2, 0.25, 0], [3, 0.06, 0]],
      }),
      rootMidi: 72, loop: true, adsr: { a: 0.012, d: 0.06, s: 0.85, r: 0.12 },
    },
    flute: {
      buffer: toneBuffer(ctx, {
        rootMidi: 72, seconds: 0.4, seed: 23, noiseAmp: 0.03,
        partials: [[1, 1, 0], [2, 0.4, 0], [3, 0.1, 0]],
      }),
      rootMidi: 72, loop: true, adsr: { a: 0.03, d: 0.08, s: 0.8, r: 0.15 },
    },
    strings: {
      buffer: stringsBuffer(ctx),
      rootMidi: 69, loop: true, adsr: { a: 0.12, d: 0.2, s: 0.7, r: 0.25 },
    },
    harp: {
      buffer: toneBuffer(ctx, {
        rootMidi: 72, seconds: 1.4, oneShot: true, decayTau: 0.45, seed: 31,
        partials: [
          [1, 1, 0.5], [2, 0.55, 0.3], [3, 0.3, 0.18],
          [4, 0.16, 0.1], [5, 0.08, 0.06],
        ],
      }),
      rootMidi: 72, loop: false, oneShot: true, tau: 0.26,
      adsr: { a: 0.003, d: 0, s: 1, r: 0.05 },
    },
    bell: {
      buffer: toneBuffer(ctx, {
        rootMidi: 84, seconds: 2.0, oneShot: true, decayTau: 0.8, seed: 41,
        partials: [
          [1, 1, 0.9], [2.76, 0.5, 0.5], [5.4, 0.28, 0.25], [8.9, 0.12, 0.12],
        ],
      }),
      rootMidi: 84, loop: false, oneShot: true, tau: 0.5,
      adsr: { a: 0.003, d: 0, s: 1, r: 0.05 },
    },
    bass: {
      buffer: toneBuffer(ctx, {
        rootMidi: 48, seconds: 0.3, seed: 51,
        partials: [[1, 1, 0], [2, 0.35, 0], [3, 0.18, 0], [4, 0.06, 0]],
      }),
      rootMidi: 48, loop: true, adsr: { a: 0.005, d: 0.08, s: 0.9, r: 0.08 },
    },
    pulse: {
      buffer: toneBuffer(ctx, {
        rootMidi: 72, seconds: 0.3, seed: 61,
        partials: [
          [1, 1, 0], [3, 0.33, 0], [5, 0.2, 0], [7, 0.14, 0], [9, 0.11, 0],
        ],
      }),
      rootMidi: 72, loop: true, adsr: { a: 0.002, d: 0.03, s: 0.65, r: 0.04 },
    },
    noise,
  };
}

/* ---------- voices ---------- */
/*
  One voice is two nodes for a sample instrument (a buffer source and
  its ADSR gain), a handful for a drum hit. Voices are created per
  note and dropped on the floor; the per-channel strips persist.
*/

function playSample(ctx, inst, out, midi, time, durSec) {
  const src = ctx.createBufferSource();
  src.buffer = inst.buffer;
  src.loop = inst.loop;
  const rate = Math.pow(2, (midi - inst.rootMidi) / 12);
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  src.connect(g);
  g.connect(out);
  const peak = 0.9;
  if (inst.oneShot) {
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.004);
    g.gain.setTargetAtTime(0, time + 0.004, inst.tau);
    src.start(time);
    src.stop(time + Math.min(3, inst.buffer.duration / rate));
    return;
  }
  const { a, d, s, r } = inst.adsr;
  const tOff = time + Math.max(durSec, a + d + 0.03);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + a);
  if (s < 1) g.gain.linearRampToValueAtTime(peak * s, time + a + d);
  g.gain.setValueAtTime(peak * s, tOff);
  g.gain.linearRampToValueAtTime(0, tOff + r);
  src.start(time);
  src.stop(tOff + r + 0.05);
}

function playDrum(ctx, kit, out, drum, time, durSec) {
  const noiseSrc = () => {
    const s = ctx.createBufferSource();
    s.buffer = kit.noise;
    s.loop = true;
    return s;
  };
  if (drum === "kick") {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(115, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95, time);
    g.gain.setTargetAtTime(0, time, 0.035);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 0.3);
    return;
  }
  if (drum === "snare") {
    const src = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.8, time);
    g.gain.setTargetAtTime(0, time, 0.028);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.25);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 186;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35, time);
    og.gain.setTargetAtTime(0, time, 0.018);
    osc.connect(og);
    og.connect(out);
    osc.start(time);
    osc.stop(time + 0.12);
    return;
  }
  if (drum === "hat") {
    const src = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    const open = durSec > 0.16;
    g.gain.setValueAtTime(0.5, time);
    g.gain.setTargetAtTime(0, time, open ? 0.05 : 0.012);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + (open ? 0.5 : 0.15));
    return;
  }
  // shaker
  const src = noiseSrc();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 6200;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(0.55, time + 0.018);
  g.gain.linearRampToValueAtTime(0.12, time + 0.06);
  g.gain.linearRampToValueAtTime(0.35, time + 0.095);
  g.gain.linearRampToValueAtTime(0, time + 0.15);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(time);
  src.stop(time + 0.2);
}

function playEvent(ctx, kit, instrumentName, out, ev, time, spb) {
  if (ev.drum) {
    playDrum(ctx, kit, out, ev.drum, time, ev.dur * spb);
    return;
  }
  const inst = kit[instrumentName];
  if (inst) playSample(ctx, inst, out, ev.midi, time, ev.dur * spb);
}

/* ---------- strips, echo, master ---------- */

function makeMaster(ctx) {
  const g = ctx.createGain();
  g.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  g.connect(comp);
  comp.connect(ctx.destination);
  return g;
}

function makeEcho(ctx, dest, spb) {
  const delay = ctx.createDelay(2);
  delay.delayTime.value = spb * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  const wet = ctx.createGain();
  wet.gain.value = 0.9;
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  lp.connect(wet);
  wet.connect(dest);
  return { input: delay, delay };
}

function makeStrip(ctx, master, echoInput) {
  const input = ctx.createGain();
  const vol = ctx.createGain();
  const send = ctx.createGain();
  input.connect(vol);
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    vol.connect(pan);
    pan.connect(master);
    pan.connect(send);
  } else {
    vol.connect(master);
    vol.connect(send);
  }
  send.connect(echoInput);
  return { input, vol, pan, send };
}

function applyStrip(strip, ch) {
  strip.vol.gain.value = ch.vol;
  strip.send.gain.value = ch.echo * 0.9;
  if (strip.pan) strip.pan.pan.value = ch.pan;
}

/* ---------- the live engine ---------- */

let actx = null;
let kit = null;
let master = null;
let echoBus = null;
const strips = new Map();

const sched = {
  playing: false,
  step: 0,
  patIdx: 0,
  nextTime: 0,
  timer: null,
  raf: 0,
  drawQueue: [],
  stepsPlayed: 0,
};

let compiled = null;

const spb = () => 60 / compiled.meta.bpm / 4;

function ensureCtx() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  actx = new AC({ latencyHint: "interactive" });
  kit = makeInstruments(actx);
  master = makeMaster(actx);
  echoBus = makeEcho(actx, master, spb());
}

function liveStrip(ch) {
  if (!strips.has(ch.name)) {
    const st = makeStrip(actx, master, echoBus.input);
    applyStrip(st, ch);
    strips.set(ch.name, st);
  }
  return strips.get(ch.name);
}

function scheduleStep(patIdx, step, time) {
  const pat = compiled.patterns.get(compiled.order[patIdx]);
  if (!pat) return;
  for (const ch of pat.channels) {
    if (step === 0) applyStrip(liveStrip(ch), ch);
    if (muted.has(ch.name)) continue;
    const evs = ch.eventsByStep[step];
    if (!evs || !evs.length) continue;
    const st = liveStrip(ch);
    for (const ev of evs) {
      playEvent(actx, kit, ch.instrument, st.input, ev, time, spb());
    }
  }
}

function tick() {
  echoBus.delay.delayTime.value = spb() * 3;
  while (sched.nextTime < actx.currentTime + 0.12) {
    scheduleStep(sched.patIdx, sched.step, sched.nextTime);
    sched.drawQueue.push({
      pattern: compiled.order[sched.patIdx],
      step: sched.step,
      time: sched.nextTime,
    });
    if (sched.drawQueue.length > 64) {
      sched.drawQueue.splice(0, sched.drawQueue.length - 64);
    }
    sched.step++;
    sched.stepsPlayed++;
    if (sched.step >= compiled.meta.steps) {
      sched.step = 0;
      sched.patIdx = (sched.patIdx + 1) % compiled.order.length;
    }
    sched.nextTime += spb();
  }
}

/* ---------- page wiring ---------- */

const textarea = document.querySelector("[data-song-text]");
const gridEl = document.querySelector("[data-grid]");
const statusEl = document.querySelector("[data-status]");
const tabsEl = document.querySelector("[data-ptabs]");
const playBtn = document.querySelector("[data-play]");
const STORE_KEY = "music-maker-song-v1";

let textClean = true;
let viewPattern = null;
let pinned = false;
const muted = new Set();
let cellByStep = new Map();
let prevCol = -1;

function updateStatus() {
  statusEl.classList.remove("is-error");
  if (!compiled) {
    statusEl.textContent = "";
    return;
  }
  if (sched.playing) return; // the draw loop owns the line while playing
  const w = compiled.warnings;
  const base =
    `${compiled.meta.title} · ${compiled.meta.bpm} bpm · ` +
    `order ${compiled.order.join(" ")}`;
  statusEl.textContent = w.length
    ? `${base} · note: ${w[0]}${w.length > 1 ? ` (and ${w.length - 1} more)` : ""}`
    : `${base} · ready`;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  if (!compiled) return;
  const names = [...compiled.patterns.keys()];
  for (const name of names) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "music-btn";
    b.textContent = `pattern ${name}`;
    b.setAttribute("aria-pressed", String(name === viewPattern));
    b.addEventListener("click", () => {
      viewPattern = name;
      pinned = true;
      renderTabs();
      renderGrid();
    });
    tabsEl.append(b);
  }
  if (pinned) {
    const f = document.createElement("button");
    f.type = "button";
    f.className = "music-btn";
    f.textContent = "follow playback";
    f.addEventListener("click", () => {
      pinned = false;
      renderTabs();
    });
    tabsEl.append(f);
  }
  tabsEl.hidden = names.length < 2 && !pinned;
}

function renderGrid() {
  gridEl.innerHTML = "";
  cellByStep = new Map();
  prevCol = -1;
  if (!compiled || !viewPattern) return;
  const pat = compiled.patterns.get(viewPattern);
  if (!pat) return;
  for (const ch of pat.channels) {
    const head = document.createElement("div");
    head.className = "gchan";
    const name = document.createElement("span");
    name.className = "gchan__name";
    name.textContent = ch.name;
    const inst = document.createElement("span");
    inst.className = "gchan__inst";
    inst.textContent = ch.instrument;
    const mute = document.createElement("button");
    mute.type = "button";
    mute.className = "gchan__mute";
    mute.textContent = muted.has(ch.name) ? "muted" : "mute";
    mute.setAttribute("aria-pressed", String(muted.has(ch.name)));
    mute.addEventListener("click", () => {
      if (muted.has(ch.name)) muted.delete(ch.name);
      else muted.add(ch.name);
      renderGrid();
    });
    head.append(name, inst, mute);
    gridEl.append(head);

    for (const row of ch.rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "grow";
      const lab = document.createElement("span");
      lab.className = "glabel";
      lab.textContent = row.label;
      rowEl.append(lab);
      [...row.cells].forEach((c, s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className =
          "cell" +
          (c === "x" ? " c-on" : c === "-" ? " c-sus" : "") +
          (s > 0 && s % 4 === 0 ? " beat" : "");
        b.setAttribute(
          "aria-label",
          `${ch.name} ${row.label} step ${s + 1}: ` +
            (c === "x" ? "note starts" : c === "-" ? "note holds" : "rest")
        );
        b.disabled = !textClean || !row.editable;
        b.addEventListener("click", () => editCell(row, s));
        rowEl.append(b);
        if (!cellByStep.has(s)) cellByStep.set(s, []);
        cellByStep.get(s).push(b);
      });
      gridEl.append(rowEl);
    }
  }
}

function editCell(row, step) {
  if (!textClean || !row.editable) return;
  const lines = textarea.value.split("\n");
  const line = lines[row.lineIndex];
  if (line === undefined) return;
  const pos = row.charPos[step];
  const cur = line[pos];
  if (cur !== "." && cur !== "x" && cur !== "-") return;
  const next = cur === "." ? "x" : cur === "x" ? "-" : ".";
  lines[row.lineIndex] = line.slice(0, pos) + next + line.slice(pos + 1);
  textarea.value = lines.join("\n");
  compileFromText();
}

function setPlayhead(step) {
  if (step === prevCol) return;
  const prev = cellByStep.get(prevCol);
  if (prev) for (const el of prev) el.classList.remove("is-now");
  const cur = cellByStep.get(step);
  if (cur) for (const el of cur) el.classList.add("is-now");
  prevCol = step;
}

function clearPlayhead() {
  const prev = cellByStep.get(prevCol);
  if (prev) for (const el of prev) el.classList.remove("is-now");
  prevCol = -1;
}

function draw() {
  if (!sched.playing) return;
  const now = actx.currentTime;
  const q = sched.drawQueue;
  while (q.length > 1 && q[1].time <= now) q.shift();
  if (q.length && q[0].time <= now) {
    const cur = q[0];
    if (cur.pattern !== viewPattern && !pinned) {
      viewPattern = cur.pattern;
      renderTabs();
      renderGrid();
    }
    if (cur.pattern === viewPattern) {
      setPlayhead(cur.step);
      // While the text is broken, the error owns the status line;
      // the last good compile is what is playing.
      if (textClean) {
        statusEl.textContent =
          `playing · pattern ${cur.pattern} · ` +
          `step ${cur.step + 1} of ${compiled.meta.steps}`;
      }
    }
  }
  sched.raf = requestAnimationFrame(draw);
}

function setPlaying(on) {
  if (on && !compiled) return;
  if (on) {
    ensureCtx();
    actx.resume();
    if (sched.patIdx >= compiled.order.length) sched.patIdx = 0;
    if (sched.step >= compiled.meta.steps) sched.step = 0;
    sched.nextTime = Math.max(sched.nextTime, actx.currentTime + 0.06);
    sched.timer = setInterval(tick, 25);
    sched.raf = requestAnimationFrame(draw);
    sched.playing = true;
  } else {
    clearInterval(sched.timer);
    cancelAnimationFrame(sched.raf);
    if (actx) actx.suspend();
    sched.playing = false;
    clearPlayhead();
  }
  playBtn.textContent = sched.playing ? "pause" : "play";
  playBtn.setAttribute("aria-pressed", String(sched.playing));
  updateStatus();
}

/* ---------- compile, save, share ---------- */

function saveSong() {
  try {
    localStorage.setItem(STORE_KEY, textarea.value);
  } catch {
    // Storage can refuse; the song still lives in the textarea.
  }
}

function compileFromText() {
  try {
    compiled = parseSong(textarea.value);
    textClean = true;
    if (!compiled.patterns.has(viewPattern)) {
      viewPattern = compiled.order[0];
      pinned = false;
    }
    if (sched.patIdx >= compiled.order.length) sched.patIdx = 0;
    if (sched.step >= compiled.meta.steps) sched.step = 0;
    saveSong();
    renderTabs();
    renderGrid();
    updateStatus();
  } catch (err) {
    textClean = false;
    statusEl.textContent =
      `the song text has a problem: ${err.message} ` +
      `The last good version keeps playing.`;
    statusEl.classList.add("is-error");
    renderGrid();
  }
}

let compileTimer = 0;
textarea.addEventListener("input", () => {
  clearTimeout(compileTimer);
  compileTimer = setTimeout(compileFromText, 150);
});

function encodeSong(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeSong(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function initialText() {
  const m = /#song=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    try {
      return decodeSong(m[1]);
    } catch {
      // A mangled hash falls through to the saved or demo song.
    }
  }
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) return saved;
  } catch {
    // No storage, no problem: the demo ships inline.
  }
  return DEMO_FOREST;
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = done;
  } catch {
    textarea.select();
    statusEl.textContent = "copy did not work here; the text is selected instead";
  }
}

/* ---------- WAV export ---------- */

function encodeWav(buffer) {
  const nCh = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytes = 44 + len * nCh * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const wstr = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * nCh * 2, true);
  v.setUint16(32, nCh * 2, true);
  v.setUint16(34, 16, true);
  wstr(36, "data");
  v.setUint32(40, len * nCh * 2, true);
  const chans = [];
  for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportWav(btn) {
  if (!compiled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "rendering";
  try {
    const loops = 2;
    const stepDur = spb();
    const totalSteps = compiled.meta.steps * compiled.order.length * loops;
    const dur = totalSteps * stepDur + 1.6;
    const sr = 44100;
    const off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const offKit = makeInstruments(off);
    const offMaster = makeMaster(off);
    const offEcho = makeEcho(off, offMaster, stepDur);
    const offStrips = new Map();
    const stripFor = (ch) => {
      if (!offStrips.has(ch.name)) {
        const st = makeStrip(off, offMaster, offEcho.input);
        applyStrip(st, ch);
        offStrips.set(ch.name, st);
      }
      return offStrips.get(ch.name);
    };
    for (let g = 0; g < totalSteps; g++) {
      const patName =
        compiled.order[
          Math.floor(g / compiled.meta.steps) % compiled.order.length
        ];
      const step = g % compiled.meta.steps;
      const pat = compiled.patterns.get(patName);
      const time = 0.05 + g * stepDur;
      for (const ch of pat.channels) {
        if (step === 0) applyStrip(stripFor(ch), ch);
        const evs = ch.eventsByStep[step];
        if (!evs || !evs.length) continue;
        const st = stripFor(ch);
        for (const ev of evs) {
          playEvent(off, offKit, ch.instrument, st.input, ev, time, stepDur);
        }
      }
    }
    const buf = await off.startRendering();
    const slug =
      compiled.meta.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "song";
    download(encodeWav(buf), `${slug}.wav`);
    statusEl.textContent = `exported ${slug}.wav (two loops)`;
  } catch (err) {
    statusEl.textContent = `export failed: ${err.message}`;
    statusEl.classList.add("is-error");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ---------- controls ---------- */

playBtn.addEventListener("click", () => setPlaying(!sched.playing));

document.querySelector("[data-restart]").addEventListener("click", () => {
  sched.step = 0;
  sched.patIdx = 0;
  sched.drawQueue.length = 0;
  if (sched.playing && actx) sched.nextTime = actx.currentTime + 0.06;
  clearPlayhead();
  updateStatus();
});

for (const btn of document.querySelectorAll("[data-demo]")) {
  btn.addEventListener("click", () => {
    textarea.value = btn.dataset.demo === "village" ? DEMO_VILLAGE : DEMO_FOREST;
    sched.step = 0;
    sched.patIdx = 0;
    pinned = false;
    viewPattern = null;
    compileFromText();
  });
}

document.querySelector("[data-copy]").addEventListener("click", () => {
  copyText(textarea.value, "song text copied");
});

document.querySelector("[data-download]").addEventListener("click", () => {
  const slug =
    (compiled?.meta.title || "song")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "song";
  download(new Blob([textarea.value], { type: "text/plain" }), `${slug}.txt`);
  statusEl.textContent = "song text downloaded";
});

document.querySelector("[data-share]").addEventListener("click", () => {
  const url = `${location.origin}${location.pathname}#song=${encodeSong(textarea.value)}`;
  history.replaceState(null, "", url);
  copyText(url, "share link copied; the song travels inside it as text");
});

document
  .querySelector("[data-export]")
  .addEventListener("click", (e) => exportWav(e.currentTarget));

/* ---------- go ---------- */

setUpThemeToggle();
textarea.value = initialText();
compileFromText();

// A small handle for headless checks: proves the song compiled and,
// while playing, that the scheduler's step counter advances.
window.__musicMaker = {
  state: () => ({
    title: compiled?.meta.title ?? null,
    patterns: compiled ? [...compiled.patterns.keys()] : [],
    order: compiled?.order ?? [],
    playing: sched.playing,
    step: sched.step,
    stepsPlayed: sched.stepsPlayed,
    warnings: compiled?.warnings.length ?? 0,
    textClean,
  }),
  play: () => setPlaying(true),
  pause: () => setPlaying(false),
};
