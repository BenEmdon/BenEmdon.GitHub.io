/*
  A small demo of the music maker, for the home page. One song,
  Saria's Song, drawn as a single piano roll with a play button.

  The machinery is the maker's own, copied small: the same MML
  parser, the same instrument table, the same sample loading, and
  the same OfflineAudioContext renderer from assets/js/music.js,
  so what plays here is what plays there. music.js itself is not
  loaded on this page; it wires the maker page's DOM (grid, text
  area, song buttons) and none of that exists here.

  Playback is the maker's pattern: the whole loop renders once
  into a buffer, and a single looping buffer source plays it.
  The roll shows a window of the song, not all of it: the
  window follows the playing song in discrete jumps, one step
  column at a time, on the fixed grid, and the playhead moves
  the way everything on this site moves, one 16th step at a
  time. Under reduced motion the window and the picture jump
  by whole bars instead. The controls are play, pause, and
  restart: pause holds the playback offset (the source stops,
  the position is remembered, and play resumes from exactly
  there, roll and sound reading from the same tracked
  position), while restart goes back to step zero and plays.
  The status line says what the render cost and that the
  song loops.

  The render comes from the persistent cache the maker uses
  (render-cache.js): both pages derive the same key from the
  parsed song, so a render stored by either is read back by
  both, and the status line then says "from cache" instead
  of quoting a render time.
*/

import { renderCacheKey, readRender, writeRender } from "./render-cache.js";
import { announceBootTask } from "./boot-tasks.js";
import { registerTask } from "./boot.js?v=20261122r";

/* ---------- instruments ---------- */

// The maker's fixed table, whole: the parser validates @n
// against it, and Saria's Song uses @6, @8, @9 and @5.
const INSTRUMENTS = [
  { name: "pulse 12.5%", kind: "pulse", duty: 0.125 },
  { name: "pulse 25%", kind: "pulse", duty: 0.25 },
  { name: "pulse 50%", kind: "pulse", duty: 0.5 },
  { name: "pulse 75%", kind: "pulse", duty: 0.75 },
  { name: "triangle", kind: "tri" },
  { name: "noise", kind: "noise" },
  { name: "ocarina", kind: "sample", verb: 0.5, vib: true,
    files: [[72, "ocarina-72.mp3"], [84, "ocarina-84.mp3"]] },
  { name: "flute", kind: "sample", verb: 0.45,
    files: [[81, "flute-81.mp3"], [84, "flute-84.mp3"]] },
  { name: "strings", kind: "sample", verb: 0.6,
    files: [[72, "strings-72.mp3"]] },
  { name: "cello", kind: "sample", verb: 0.5,
    files: [[60, "cello-60.mp3"]] },
  { name: "harp", kind: "sample", verb: 0.35,
    files: [[48, "harp-48.mp3"], [72, "harp-72.mp3"]] },
];
const AUDIO_BASE = "assets/audio/";

/* ---------- the song ---------- */

// Identical to the maker's Saria's Song, header comments and all.
const SARIA_TEXT = `; Saria's Song: The Legend of Zelda: Ocarina of Time (N64, 1998)
; C major, quick: 140. The Lost Woods music, from mio.t's
; note-for-note MIDI (vgmusic.com): the ocarina line on
; the ocarina sample, the pizzicato bass on cello, the
; tambourine on noise. B and C carry chords now: the
; English horn part and the pizzicato part both write
; two-note chords through the tune, restored from The
; Ultimate Koopa's XG transcription of the same music
; where its lines match the shipped ones. Where the part
; plays single notes, or the voicing differs, the shipped
; note stands alone. Full form: the tune twice, then the
; climbing middle section and its answer.
A @6 t140 v13 o5 f8 a8 b4 f8 a8 b4 f8 a8 b8 o6 e8 d4 o5 b8 o6 c8 o5 b8 g16 r16 e2^8 d8 e8 g16 r16 e2^8 r8 f8 a8 b4 f8 a8 b4 f8 a8 b8 o6 e8 d4 o5 b8 o6 c8 e8 o5 b16 r16 g2^8 b8 g8 d16 r16 e2^8 r1 r1 r8 f8 g8 a4 b8 o6 c16 r16 d4 e8 f16 r16 g2. r1 r1 o5 f8 e16 r16 a8 g16 r16 b8 a16 r16 o6 c8 o5 b16 r16 o6 d8 c16 r16 e8 d16 r16 f8 e16 r16 o5 b16 o6 c16 r16 o5 a16 b1^4
B @8 v9 o3 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 {g>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 c8 e8 {g>c}16 r16 {g>c}16 r16 {g>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 c8 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 f8 {a>c}16 r16 {a>c}16 r16 {a>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 {g>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 c8 e8 {g>c}16 r16 {g>c}16 r16 {g>c}16 r16 e8 {g>c}16 r16 {g>c}16 r16 e8 o4 d8 e16 r16 f4 g8 a8 b4 o5 c8 o4 b16 r16 e2. d8 e8 f4 g8 a16 r16 b4 o5 c8 d16 r16 e2. o4 d8 e16 r16 f4 g8 a16 r16 b4 o5 c8 o4 b16 r16 e2. d8 c16 r16 f8 e16 r16 g8 f16 r16 a8 g16 r16 b8 a16 r16 o5 c8 o4 b16 r16 o5 d8 c16 r16 e16 f16 r16 d16 e1^4
C @9 v11 o3 f16 r4. r16 f16 r4. r16 f16 r4. r16 f16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r4. r16 f16 r4. r16 f16 r4. r16 f16 r4. r16 f16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r4. r16 d16 r16 {fa}16 r16 d16 r16 {fa}16 r16 o2 g16 r16 o3 {dg}16 r16 o2 g16 r16 o3 {dg}16 r16 c16 r16 {e>c}16 r16 c16 r16 {e>c}16 r16 o2 a16 r16 o3 c16 r16 o2 a16 r16 o3 c16 r16 d16 r16 {fa}16 r16 d16 r16 {fa}16 r16 o2 g16 r16 o3 {dg}16 r16 o2 g16 r16 o3 {dg}16 r16 c16 r16 {e>c}16 r16 c16 r16 {e>c}16 r16 o2 a16 r16 o3 c16 r16 o2 a16 r16 o3 c16 r16 d16 r16 {fa}16 r16 d16 r16 {fa}16 r16 o2 g16 r16 o3 {dg}16 r16 o2 g16 r16 o3 {dg}16 r16 c16 r16 {e>c}16 r16 c16 r16 {e>c}16 r16 o2 a16 r16 o3 c16 r16 o2 a16 r16 o3 c16 r16 d16 r16 {fa}16 r16 {fa}16 r8. d16 r16 {fa}16 r16 {fa}16 r8. c16 r16 {gb}16 r16 {gb}16 r8. c16 r16 {gb}16 r16 {gb}16 r8. e16 r16 {ab}16 r8. {ab}16 r16 e16 r16 {ab}16 r8. {ab}16 r16 e16 r16 {a-b}16 r16 {a-b}16 r16 {ea-b}16 r16 {ea-b}16 r8. e4
D @5 v5 o3 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 r8 f#16 r16 f#16 r16 f#16 r16 f#16 r8. f#16`;

/* ---------- MML parser ---------- */

// Copied from music.js, whole: the same subset, the same 16th
// grid, the same quirks, so the notes here are the notes there.
const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const LENGTH_STEPS = { 1: 16, 2: 8, 4: 4, 8: 2, 16: 1 };

function tokenizeMML(body, letter, errors) {
  const tokens = [];
  let i = 0;
  const fail = (msg) => errors.push(`Channel ${letter}: ${msg}`);
  while (i < body.length) {
    const ch = body[i];
    if (ch === " " || ch === "\t" || ch === "|") { i++; continue; }
    if (ch === ";") break;
    if (ch === "[") { tokens.push({ k: "[" }); i++; continue; }
    if (ch === "]") {
      i++;
      let n = "";
      while (i < body.length && /\d/.test(body[i])) n += body[i++];
      tokens.push({ k: "]", n: n ? parseInt(n, 10) : 2 });
      continue;
    }
    if (ch === "<" || ch === ">") { tokens.push({ k: ch }); i++; continue; }
    if (ch === "L") { tokens.push({ k: "L" }); i++; continue; }
    if (ch === "{") {
      // A chord: the notes inside the braces sound together and
      // share the one length written after the closing brace.
      // < and > inside step the octave for the notes after them
      // in that chord only; the channel's octave is untouched.
      i++;
      const tones = [];
      let off = 0, closed = false;
      while (i < body.length) {
        const c = body[i];
        if (c === "}") { closed = true; i++; break; }
        if (c === " " || c === "\t") { i++; continue; }
        if (c === "<") { off--; i++; continue; }
        if (c === ">") { off++; i++; continue; }
        const nc = c.toLowerCase();
        if (NOTE_PC[nc] !== undefined) {
          i++;
          let acc = 0;
          if (body[i] === "#" || body[i] === "+") { acc = 1; i++; }
          else if (body[i] === "-") { acc = -1; i++; }
          tones.push({ pc: NOTE_PC[nc], acc, off });
          continue;
        }
        fail(`"${c}" cannot sit inside a chord`);
        i++;
      }
      if (!closed) { fail("a { is never closed"); continue; }
      if (!tones.length) { fail("a chord needs a note inside its braces"); continue; }
      const len = readLength(body, () => i, (v) => { i = v; });
      tokens.push({ k: "chord", tones, len });
      continue;
    }
    if (ch === "}") { fail("a } with no {"); i++; continue; }
    if (ch === "^") {
      i++;
      const len = readLength(body, () => i, (v) => { i = v; });
      tokens.push({ k: "^", len });
      continue;
    }
    const cmd = ch.toLowerCase();
    if (cmd === "t" || cmd === "v" || cmd === "o" || cmd === "l" || ch === "@") {
      i++;
      let n = "";
      while (i < body.length && /\d/.test(body[i])) n += body[i++];
      let dots = 0;
      while (body[i] === ".") { dots++; i++; }
      if (!n) { fail(`"${ch}" needs a number after it`); continue; }
      tokens.push({ k: ch === "@" ? "@" : cmd, n: parseInt(n, 10), dots });
      continue;
    }
    if (NOTE_PC[cmd] !== undefined || cmd === "r") {
      i++;
      let acc = 0;
      if (body[i] === "#" || body[i] === "+") { acc = 1; i++; }
      else if (body[i] === "-") { acc = -1; i++; }
      const len = readLength(body, () => i, (v) => { i = v; });
      tokens.push({ k: cmd === "r" ? "r" : "n", pc: NOTE_PC[cmd], acc, len });
      continue;
    }
    fail(`I do not know "${ch}"`);
    i++;
  }
  return tokens;
}

function readLength(body, get, set) {
  let i = get();
  let n = "";
  while (i < body.length && /\d/.test(body[i])) n += body[i++];
  let dots = 0;
  while (body[i] === ".") { dots++; i++; }
  set(i);
  if (!n && !dots) return null;
  return { n: n ? parseInt(n, 10) : null, dots };
}

function lengthSteps(len, def, warnings, letter) {
  const n = len ? (len.n ?? def.n) : def.n;
  const dots = len ? len.dots : def.dots;
  const base = LENGTH_STEPS[n];
  if (base === undefined) {
    warnings.push(`Channel ${letter}: length ${n} is not one of 1, 2, 4, 8, 16; read as a quarter`);
    return 4 * (dots ? 1.5 : 1);
  }
  const steps = base * (dots === 1 ? 1.5 : dots === 2 ? 1.75 : 1);
  if (!Number.isInteger(steps)) {
    warnings.push(`Channel ${letter}: a dotted length fell between steps and was rounded`);
    return Math.max(1, Math.round(steps));
  }
  return steps;
}

function expandTokens(tokens, depth, errors, letter) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.k === "[") {
      let d = 1, j = i + 1;
      while (j < tokens.length && d > 0) {
        if (tokens[j].k === "[") d++;
        if (tokens[j].k === "]") d--;
        j++;
      }
      if (d > 0) { errors.push(`Channel ${letter}: a [ is never closed`); return out; }
      const closer = tokens[j - 1];
      if (depth >= 4) {
        errors.push(`Channel ${letter}: repeats nested too deep`);
        return out;
      }
      const inner = expandTokens(tokens.slice(i + 1, j - 1), depth + 1, errors, letter);
      for (let r = 0; r < closer.n; r++) out.push(...inner);
      i = j;
      continue;
    }
    if (tok.k === "]") { errors.push(`Channel ${letter}: a ] with no [`); i++; continue; }
    out.push(tok);
    i++;
  }
  return out;
}

function parseSong(text) {
  const errors = [], warnings = [];
  const lines = text.split("\n");
  const header = [];
  const bodies = new Map();
  let seenChannel = false;
  for (const raw of lines) {
    const m = raw.match(/^\s*([A-H])\s+(.*)$/) || raw.match(/^\s*([A-H])\s*$/);
    if (m) {
      seenChannel = true;
      const letter = m[1];
      bodies.set(letter, (bodies.get(letter) || "") + " " + (m[2] || ""));
    } else if (!seenChannel) {
      header.push(raw);
    } else if (raw.trim() && !raw.trim().startsWith(";")) {
      warnings.push(`A line that is not a channel line was ignored: "${raw.trim().slice(0, 24)}…"`);
    }
  }
  if (!bodies.size) errors.push("No channel lines. Start a line with a letter, A to H, then the music.");

  let tempo = null, loopStep = null;
  const channels = [];
  for (const letter of [...bodies.keys()].sort()) {
    const tokens = expandTokens(
      tokenizeMML(bodies.get(letter), letter, errors), 0, errors, letter);
    const st = { oct: 4, def: { n: 4, dots: 0 }, vol: 12, inst: 1 };
    const notes = [];
    let step = 0, lastGroup = null;
    for (const tok of tokens) {
      if (tok.k === "t") {
        if (tempo === null) tempo = tok.n;
        else if (tempo !== tok.n) warnings.push(`Channel ${letter}: tempo ${tok.n} ignored, the song is already at ${tempo}`);
      } else if (tok.k === "v") {
        if (tok.n < 0 || tok.n > 15) { errors.push(`Channel ${letter}: volume ${tok.n} is outside 0-15`); }
        st.vol = Math.max(0, Math.min(15, tok.n));
      } else if (tok.k === "o") {
        if (tok.n < 1 || tok.n > 7) errors.push(`Channel ${letter}: octave ${tok.n} is outside 1-7`);
        st.oct = Math.max(1, Math.min(7, tok.n));
      } else if (tok.k === "l") {
        if (!LENGTH_STEPS[tok.n]) errors.push(`Channel ${letter}: default length ${tok.n} is not one of 1, 2, 4, 8, 16`);
        else st.def = { n: tok.n, dots: tok.dots || 0 };
      } else if (tok.k === "@") {
        if (tok.n < 0 || tok.n >= INSTRUMENTS.length) {
          errors.push(`Channel ${letter}: there is no instrument @${tok.n} (the table runs @0 to @${INSTRUMENTS.length - 1})`);
        } else st.inst = tok.n;
      } else if (tok.k === "<") st.oct = Math.max(1, st.oct - 1);
      else if (tok.k === ">") st.oct = Math.min(7, st.oct + 1);
      else if (tok.k === "L") {
        if (loopStep === null) loopStep = step;
        else if (loopStep !== step) warnings.push(`Channel ${letter}: its L sits at a different step and was ignored`);
      } else if (tok.k === "r") {
        step += lengthSteps(tok.len, st.def, warnings, letter);
        lastGroup = null;
      } else if (tok.k === "^") {
        // A tie extends every note of the last event, one note
        // or a whole chord, and the cursor moves to its end.
        if (lastGroup) {
          const extra = lengthSteps(tok.len, st.def, warnings, letter);
          for (const n of lastGroup) n.len += extra;
          step = Math.max(step, ...lastGroup.map((n) => n.step + n.len));
        } else warnings.push(`Channel ${letter}: a ^ tie with no note before it`);
      } else if (tok.k === "n") {
        const len = lengthSteps(tok.len, st.def, warnings, letter);
        const midi = (st.oct + 1) * 12 + tok.pc + tok.acc;
        const note = { step, len, midi, inst: st.inst, vol: st.vol };
        notes.push(note);
        lastGroup = [note];
        step += len;
      } else if (tok.k === "chord") {
        const len = lengthSteps(tok.len, st.def, warnings, letter);
        const group = [];
        for (const tone of tok.tones) {
          const midi = (st.oct + 1 + tone.off) * 12 + tone.pc + tone.acc;
          const note = { step, len, midi, inst: st.inst, vol: st.vol };
          notes.push(note);
          group.push(note);
        }
        lastGroup = group;
        step += len;
      }
      if (step > 8192) { errors.push(`Channel ${letter}: the song runs past 8192 steps`); break; }
    }
    notes.sort((a, b) => a.step - b.step || a.midi - b.midi);
    if (notes.length) {
      channels.push({
        letter, notes,
        steps: notes.reduce((mx, n) => Math.max(mx, n.step + n.len), 0),
      });
    }
  }

  if (tempo === null) { tempo = 120; warnings.push("No tempo anywhere; playing at 120"); }
  if (tempo < 30 || tempo > 300) errors.push(`Tempo ${tempo} is outside 30-300`);
  const steps = channels.reduce((mx, c) => Math.max(mx, c.steps), 0);
  for (const c of channels) {
    if (c.steps < steps) warnings.push(`Channel ${c.letter} ends early, at step ${c.steps} of ${steps}`);
  }
  if (!steps) errors.push("The channels hold no notes.");
  return {
    ok: errors.length === 0, errors, warnings, header,
    tempo, loopStep: loopStep ?? 0, steps, channels,
  };
}

/* ---------- samples ---------- */

// The maker's loader, unchanged: once, lazily, decoded with a
// throwaway offline context so the buffers serve every render.
const sampleSets = new Map();
let samplesPromise = null;

function loadSamples() {
  if (samplesPromise) return samplesPromise;
  const decoder = new OfflineAudioContext(1, 1, 44100);
  const jobs = [];
  INSTRUMENTS.forEach((inst, idx) => {
    if (inst.kind !== "sample") return;
    sampleSets.set(idx, []);
    for (const [root, file] of inst.files) {
      jobs.push(
        fetch(AUDIO_BASE + file)
          .then((r) => { if (!r.ok) throw new Error(file); return r.arrayBuffer(); })
          .then((ab) => decoder.decodeAudioData(ab))
          .then((buf) => sampleSets.get(idx).push([root, buf]))
          .catch(() => { /* a missing sample silences its notes, nothing more */ })
      );
    }
  });
  samplesPromise = Promise.all(jobs).then(() => {
    for (const set of sampleSets.values()) set.sort((a, b) => a[0] - b[0]);
  });
  return samplesPromise;
}

/* ---------- voices ---------- */

// The maker's voices, unchanged.
function dutyWave(ctx, duty) {
  const N = 96;
  const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    real[k] = (2 / (Math.PI * k)) * Math.sin(2 * Math.PI * k * duty);
    imag[k] = (2 / (Math.PI * k)) * (1 - Math.cos(2 * Math.PI * k * duty));
  }
  return ctx.createPeriodicWave(real, imag);
}

function triWave(ctx) {
  const seq = [];
  for (let i = 0; i < 16; i++) seq.push(15 - i);
  for (let i = 0; i < 16; i++) seq.push(i);
  const N = seq.length, H = 16;
  const real = new Float32Array(H + 1), imag = new Float32Array(H + 1);
  for (let k = 1; k <= H; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const v = seq[n] / 7.5 - 1, a = (2 * Math.PI * k * n) / N;
      re += v * Math.cos(a);
      im += v * Math.sin(a);
    }
    real[k] = (2 / N) * re;
    imag[k] = (-2 / N) * im;
  }
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let lfsr = 0x7fff;
  for (let i = 0; i < len; i++) {
    const bit = ((lfsr ^ (lfsr >> 1)) & 1) * 2 - 1;
    data[i] = bit * 0.7;
    lfsr = (lfsr >> 1) | (((lfsr ^ (lfsr >> 1)) & 1) << 14);
    if (i % 3 === 2) data[i] = data[i - 1]; // hold samples: lowers the rattle
  }
  return buf;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function chipEnvelope(gain, t, dur, peak) {
  const p = gain.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + 0.004);
  if (dur > 0.15) {
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      p.setValueAtTime(peak * (1 - 0.07 * s), t + (dur * s) / (steps + 1));
    }
  }
  p.setValueAtTime(peak * 0.72, Math.max(t + 0.004, t + dur - 0.012));
  p.linearRampToValueAtTime(0, t + dur);
}

function scheduleChip(ctx, out, kit, n, t, dur) {
  const inst = INSTRUMENTS[n.inst];
  const peak = (n.vol / 15) * 0.4;
  if (inst.kind === "noise") {
    const src = ctx.createBufferSource();
    src.buffer = kit.noise;
    src.loop = true;
    src.playbackRate.value = Math.pow(2, (n.midi - 76) / 12);
    const g = ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(peak, t);
    p.exponentialRampToValueAtTime(0.001, t + Math.max(dur, 0.03));
    src.connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return;
  }
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(inst.kind === "tri" ? kit.tri : kit.duties[inst.duty]);
  osc.frequency.value = freqOf(n.midi);
  const g = ctx.createGain();
  if (inst.kind === "tri") {
    const p = g.gain, pk = 0.22 + 0.3 * (n.vol / 15);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(pk, t + 0.004);
    p.setValueAtTime(pk, Math.max(t + 0.004, t + dur - 0.006));
    p.linearRampToValueAtTime(0, t + dur);
  } else {
    chipEnvelope(g, t, dur, peak);
  }
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function scheduleSample(ctx, outs, n, t, dur) {
  const inst = INSTRUMENTS[n.inst];
  const set = sampleSets.get(n.inst);
  if (!set || !set.length) return;
  let [root, buf] = set[0];
  for (const cand of set) {
    if (Math.abs(cand[0] - n.midi) < Math.abs(root - n.midi)) [root, buf] = cand;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (n.midi - root) / 12);
  const g = ctx.createGain();
  src.connect(g);
  const p = g.gain, peak = (n.vol / 15) * 0.85;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + 0.008);
  p.setValueAtTime(peak, Math.max(t + 0.008, t + dur - 0.07));
  p.linearRampToValueAtTime(0, t + dur + 0.02);
  g.connect(outs.dry);
  if (inst.verb) {
    const send = ctx.createGain();
    send.gain.value = inst.verb;
    g.connect(send).connect(outs.verb);
  }
  if (inst.vib && dur > 0.35) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.value = 16;
    lfo.connect(depth).connect(src.detune);
    lfo.start(t + 0.18);
    lfo.stop(t + dur + 0.05);
  }
  src.start(t);
  src.stop(t + dur + 0.1);
}

/* ---------- renderer ---------- */

// The maker's renderer, unchanged: the whole loop, rendered
// once; playback is then a single looping buffer source.
async function renderSong(song) {
  const sr = 44100;
  const stepDur = 60 / song.tempo / 4;
  const dur = song.steps * stepDur;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx, 1.8, 2.8);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.5;
  verb.connect(verbOut).connect(master);
  const kit = {
    duties: {
      0.125: dutyWave(ctx, 0.125), 0.25: dutyWave(ctx, 0.25),
      0.5: dutyWave(ctx, 0.5), 0.75: dutyWave(ctx, 0.75),
    },
    tri: triWave(ctx),
    noise: noiseBuffer(ctx),
  };
  const outs = { dry: master, verb };
  for (const ch of song.channels) {
    for (const n of ch.notes) {
      const t = n.step * stepDur, d = n.len * stepDur;
      if (INSTRUMENTS[n.inst].kind === "sample") scheduleSample(ctx, outs, n, t, d);
      else scheduleChip(ctx, master, kit, n, t, d);
    }
  }
  const t0 = performance.now();
  const buffer = await ctx.startRendering();
  return {
    buffer, dur, stepDur,
    loopStart: song.loopStep * stepDur,
    loopDur: dur - song.loopStep * stepDur,
    renderMs: performance.now() - t0,
  };
}

// The render, from the shared persistent cache when this
// exact song was rendered before, rendered and stored
// otherwise. onRendering runs only when a real render is
// about to happen, so a cache hit never shows a rendering
// state; the result's fromCache flag drives the status
// wording.
async function obtainRender(song, onRendering) {
  const key = renderCacheKey(song);
  const hit = await readRender(key);
  if (hit) {
    const stepDur = 60 / song.tempo / 4;
    return {
      buffer: hit.buffer, dur: hit.dur, stepDur,
      loopStart: hit.loopStart, loopDur: hit.dur - hit.loopStart,
      renderMs: 0, fromCache: true,
    };
  }
  if (onRendering) onRendering();
  const rendered = await renderSong(song);
  writeRender(key, rendered);
  return rendered;
}

/* ---------- the demo ---------- */

const roll = document.querySelector("[data-music-demo-roll]");
const playButton = document.querySelector("[data-music-demo-play]");
const restartButton = document.querySelector("[data-music-demo-restart]");
const status = document.querySelector("[data-music-demo-status]");

if (roll && playButton) {
  const song = parseSong(SARIA_TEXT);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  // One shade per channel, all from the site palette in
  // tokens.css: the accent for the ocarina lead, then lighter
  // blues and ink shades as the channels sit lower.
  const PALETTES = {
    light: { A: "#1e5aa8", B: "#6ea8e1", C: "#8296b1", D: "#b9c6da", head: "#0f141d", rule: "#dfe6f0" },
    dark: { A: "#6ea8e1", B: "#a9cdf2", C: "#8296b1", D: "#52637c", head: "#e8ecf4", rule: "#212b3d" },
  };
  const resolvedDark = () => {
    const forced = document.documentElement.dataset.theme;
    if (forced === "dark") return true;
    if (forced === "light") return false;
    return systemDark.matches;
  };

  // The roll is a window, not the whole song: WINDOW_STEPS of
  // the song are on screen at once, and the window follows the
  // playing song in discrete jumps, one step column at a time,
  // locked to the 16th-step grid like everything else here.
  // The playhead sits HEAD_OFFSET steps into the window while
  // steps remain on both sides. Under reduced motion the
  // window (and the picture with it) moves by whole bars.
  const STEP_W = 4, ROW_H = 3;
  const WINDOW_STEPS = 48, HEAD_OFFSET = 12, BAR_STEPS = 16;
  let lo = Infinity, hi = -Infinity;
  for (const ch of song.channels) {
    for (const n of ch.notes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }
  }
  lo -= 1; hi += 1;
  const ROWS = hi - lo + 1;
  roll.width = WINDOW_STEPS * STEP_W;
  roll.height = ROWS * ROW_H;

  const notesLayer = document.createElement("canvas");
  notesLayer.width = song.steps * STEP_W;
  notesLayer.height = roll.height;

  function paintNotes() {
    const pal = PALETTES[resolvedDark() ? "dark" : "light"];
    const c = notesLayer.getContext("2d");
    c.clearRect(0, 0, notesLayer.width, notesLayer.height);
    // A faint line at each C, so the octaves read.
    c.fillStyle = pal.rule;
    for (let m = lo; m <= hi; m++) {
      if (m % 12 === 0) c.fillRect(0, (hi - m) * ROW_H + ROW_H - 1, notesLayer.width, 1);
    }
    for (const ch of song.channels) {
      c.fillStyle = pal[ch.letter] || pal.A;
      for (const n of ch.notes) {
        c.fillRect(
          n.step * STEP_W, (hi - n.midi) * ROW_H,
          Math.max(1, n.len * STEP_W - 1), ROW_H - 1);
      }
    }
  }

  function windowStart(step) {
    const maxStart = Math.max(0, song.steps - WINDOW_STEPS);
    if (step < 0) return 0;
    if (reducedMotion.matches) {
      const raw = step - HEAD_OFFSET;
      if (raw <= 0) return 0;
      return Math.min(maxStart, Math.floor(raw / BAR_STEPS) * BAR_STEPS);
    }
    return Math.min(maxStart, Math.max(0, step - HEAD_OFFSET));
  }

  function paint(step) {
    const c = roll.getContext("2d");
    const ws = windowStart(step);
    c.clearRect(0, 0, roll.width, roll.height);
    c.drawImage(
      notesLayer,
      ws * STEP_W, 0, WINDOW_STEPS * STEP_W, roll.height,
      0, 0, WINDOW_STEPS * STEP_W, roll.height);
    if (step >= 0) {
      const pal = PALETTES[resolvedDark() ? "dark" : "light"];
      c.fillStyle = pal.head;
      c.fillRect((step - ws) * STEP_W, 0, STEP_W, roll.height);
    }
  }

  // The maker's segment maths, minus the swap machinery: the
  // song never changes here, so one segment serves the visit.
  // A segment records the buffer-timeline offset it started
  // at, which is what makes pause possible: pausing reads the
  // current offset out of the segment before stopping the
  // source, and resuming starts a fresh segment at that
  // offset. pausedPos holds it between the two.
  const demo = {
    ctx: null, out: null, src: null, seg: null,
    rendered: null, renderPromise: null, playing: false, rendering: false, raf: 0,
    pausedPos: null,
  };

  // The one road to a rendered loop, shared by the background
  // preload below and by play(): whichever asks first starts the
  // work, and the other waits on the same promise instead of
  // rendering twice. A failure clears the promise, so a later press
  // of play retries rather than inheriting the preload's bad luck.
  function ensureRender(onRendering) {
    if (demo.rendered) return Promise.resolve(demo.rendered);
    if (demo.renderPromise) return demo.renderPromise;
    demo.renderPromise = (async () => {
      // The demo's render reports itself to the corner loader
      // the way the maker's do: samples first, then rendering
      // only when a real render is about to happen (the
      // obtainRender callback), "from cache" on a hit instead,
      // then done; a failure reaches the handle through the
      // catch. The loader only observes; the memoised promise
      // runs the work exactly as it did.
      const name = ((song.header || [])[0] || "")
        .replace(/^;\s*/, "").split(":")[0].trim() || "the demo song";
      const work = registerTask("rendering " + name);
      work.status("loading samples");
      try {
        await loadSamples();
        work.update(0.25);
        const rendered = await obtainRender(song, () => {
          work.status("rendering");
          work.update(0.5);
          if (onRendering) onRendering();
        });
        demo.rendered = rendered;
        if (rendered.fromCache) work.status("from cache");
        work.complete();
        return rendered;
      } catch (err) {
        work.fail(err && err.message ? err.message : "render failed");
        throw err;
      }
    })();
    demo.renderPromise.catch(() => {
      demo.renderPromise = null;
    });
    return demo.renderPromise;
  }

  // The position on the buffer's own timeline, in seconds:
  // the segment's start offset plus however long it has been
  // sounding, wrapped inside the loop once past the intro.
  // Sound and picture both read from this, so they cannot
  // disagree, playing or paused.
  function positionAt(now) {
    const { startCtxTime, offsetSec, rendered } = demo.seg;
    const t = offsetSec + Math.max(0, now - startCtxTime);
    const introDur = rendered.loopStart;
    if (t < introDur) return t;
    return introDur + ((t - introDur) % rendered.loopDur);
  }

  function stepFromPosition(pos) {
    const { rendered } = demo.seg || { rendered: demo.rendered };
    if (pos < rendered.loopStart) return Math.floor(pos / rendered.stepDur);
    return song.loopStep + Math.floor((pos - rendered.loopStart) / rendered.stepDur);
  }

  function stepAt(now) {
    return stepFromPosition(positionAt(now));
  }

  // The step the page should show right now: the live step
  // while playing, the held step while paused, and -1 (no
  // playhead) before the first play.
  function currentStep() {
    if (demo.playing && demo.seg) return stepAt(demo.ctx.currentTime);
    if (demo.pausedPos !== null) return stepFromPosition(demo.pausedPos);
    return -1;
  }

  function runPlayhead() {
    let lastStep = -1, lastWin = -1;
    const tick = () => {
      if (!demo.playing) return;
      const step = stepAt(demo.ctx.currentTime);
      const ws = windowStart(step);
      // Full motion: repaint as the step changes. Reduced
      // motion: repaint only when the window jumps a bar, so
      // the picture moves in bar-sized steps and no more.
      if (reducedMotion.matches ? ws !== lastWin : step !== lastStep) {
        lastStep = step;
        lastWin = ws;
        paint(step);
      }
      demo.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  // The two controls, kept honest about the state: the play
  // toggle reads pause while sounding and play otherwise, its
  // pressed state follows the sound, and during a render both
  // controls wait.
  function updateControls() {
    if (demo.rendering) {
      playButton.textContent = "rendering…";
      playButton.setAttribute("aria-pressed", "false");
      playButton.disabled = true;
      if (restartButton) restartButton.disabled = true;
      return;
    }
    playButton.textContent = demo.playing ? "pause" : "play";
    playButton.setAttribute("aria-pressed", String(demo.playing));
    playButton.disabled = false;
    if (restartButton) restartButton.disabled = false;
  }

  function renderNote() {
    if (status && demo.rendered) {
      status.textContent = demo.rendered.fromCache
        ? "from cache · loops"
        : `rendered in ${Math.round(demo.rendered.renderMs)} ms · loops`;
    }
  }

  function startSource(offsetSec) {
    if (demo.src) {
      try { demo.src.stop(); } catch { /* already stopped */ }
      demo.src.disconnect();
      demo.src = null;
    }
    cancelAnimationFrame(demo.raf);
    const src = demo.ctx.createBufferSource();
    src.buffer = demo.rendered.buffer;
    src.loop = true;
    src.loopStart = demo.rendered.loopStart;
    src.loopEnd = demo.rendered.dur;
    src.connect(demo.out);
    const startCtxTime = demo.ctx.currentTime + 0.08;
    src.start(startCtxTime, offsetSec);
    demo.src = src;
    demo.seg = { startCtxTime, offsetSec, rendered: demo.rendered };
    demo.playing = true;
    demo.pausedPos = null;
    updateControls();
    renderNote();
    runPlayhead();
  }

  function ensureCtx() {
    if (demo.ctx) return;
    demo.ctx = new AudioContext();
    demo.out = demo.ctx.createGain();
    demo.out.connect(demo.ctx.destination);
  }

  async function play() {
    if (demo.rendering || demo.playing) return;
    // Resuming from a pause starts where the pause held;
    // a first play starts at the top.
    const from = demo.pausedPos !== null ? demo.pausedPos : 0;
    if (demo.rendered) {
      // The background preload can land a buffer before any press of
      // play, in which case the playback context does not exist yet:
      // the first version of the preload missed this, and a press on a
      // preloaded demo threw inside startSource instead of playing.
      ensureCtx();
      await demo.ctx.resume();
      // A press of restart that landed while the context woke
      // has already started from the top; do not override it
      // with the resume this press was asked for.
      if (demo.playing) return;
      startSource(from);
      return;
    }
    demo.rendering = true;
    updateControls();
    try {
      ensureCtx();
      await demo.ctx.resume();
      if (!demo.rendered) {
        demo.rendered = await ensureRender(() => {
          if (status) status.textContent = "rendering the loop";
        });
      }
    } catch {
      demo.rendering = false;
      updateControls();
      if (status) status.textContent = "the loop did not render";
      return;
    }
    demo.rendering = false;
    startSource(0);
  }

  // Pause holds the position: the offset is read out of the
  // segment before the source stops, the roll freezes on the
  // held step, and the next play resumes from that offset.
  function pause() {
    if (!demo.playing) return;
    demo.pausedPos = positionAt(demo.ctx.currentTime);
    if (demo.src) {
      try { demo.src.stop(); } catch { /* already stopped */ }
      demo.src.disconnect();
      demo.src = null;
    }
    demo.playing = false;
    cancelAnimationFrame(demo.raf);
    updateControls();
    paint(stepFromPosition(demo.pausedPos));
  }

  async function restart() {
    if (demo.rendering) return;
    // Back to step 0 and playing from the top, from any state.
    // Before the first render this is simply play, which starts
    // at 0 too, and it builds the context a preloaded buffer
    // still needs before startSource can touch it.
    if (!demo.rendered) {
      play();
      return;
    }
    ensureCtx();
    await demo.ctx.resume();
    startSource(0);
  }

  function togglePlayPause() {
    if (demo.playing) pause();
    else play();
  }

  // A pointer press leaves the button holding the focus, and the
  // focus fill then outstays the press (Ben, 2026-11-22: both
  // buttons stayed lit after a tap). A click with a detail count
  // came from a pointer, so it hands the focus back once handled;
  // a keyboard click has detail 0 and keeps the focus, so the
  // focus-visible fill stays honest for keyboard users.
  function releasePointerFocus(event) {
    if (event.detail > 0) event.currentTarget.blur();
  }

  playButton.addEventListener("click", (event) => {
    togglePlayPause();
    releasePointerFocus(event);
  });
  restartButton?.addEventListener("click", (event) => {
    restart();
    releasePointerFocus(event);
  });

  // Repaint when the theme flips, from the toggle or the OS.
  // The picture keeps whatever step it is showing, so a flip
  // mid-play or mid-pause does not lose the position.
  new MutationObserver(() => { paintNotes(); paint(currentStep()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  systemDark.addEventListener("change", () => { paintNotes(); paint(currentStep()); });

  paintNotes();
  paint(-1);

  // The render, started in the background at load rather than on the
  // first press of play: the samples fetch and decode while the
  // visitor reads, the OfflineAudioContext renders without blocking
  // the page's own work, and the finished buffer simply waits in
  // demo.rendered for play to pick up. The boot log's music task is
  // this promise, so its line resolves when the render (or the cache
  // read) truly finishes, and says which of the two it was. Deferred
  // one tick so the module's own first paint is not the thing it
  // delays. A failure is swallowed here on purpose: the demo stays
  // exactly as usable as it was when rendering waited for play, and
  // play itself will retry and report honestly if it fails again.
  const musicBootT0 = performance.now();
  announceBootTask(
    "music",
    new Promise((resolve, reject) => {
      setTimeout(() => {
        ensureRender().then(
          (rendered) =>
            resolve({
              fromCache: !!rendered.fromCache,
              renderMs: rendered.renderMs,
              ms: performance.now() - musicBootT0,
            }),
          reject
        );
      }, 0);
    })
  );

  // A handle for checking the demo end to end: the parsed song,
  // the rendered buffer once it exists, and the output node the
  // playback runs through.
  window.__musicDemo = {
    song,
    get rendered() { return demo.rendered; },
    get playing() { return demo.playing; },
    get ctx() { return demo.ctx; },
    get out() { return demo.out; },
    stepNow: () => currentStep(),
    winNow: () => windowStart(currentStep()),
    windowStart,
  };
}
