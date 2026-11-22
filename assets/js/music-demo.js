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
  The playhead follows the maker's step maths and moves the way
  everything on this site moves: one 16th step at a time, in
  jumps, on a fixed grid. Under reduced motion the roll is
  static and only the audio plays.
*/

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
const SARIA_TEXT = `; Saria's Song — The Legend of Zelda: Ocarina of Time (N64, 1998)
; C major, quick: 140, eighth notes. Transcribed from
; mio.t's note-for-note MIDI of the Lost Woods music
; (vgmusic.com): the ocarina line on ocarina, the English
; horn's top line on strings, the pizzicato bass on cello,
; the tambourine on noise. Full form: the tune twice, then
; the climbing middle section and its answer. The old
; build ran at 152 with the tune only, in quarter notes.
A @6 t140 v13 l8 o5 f a b4 f a b4 f a b o6 e d4 o5 b o6 c o5 b g16 r16 e2^8 d e g16 r16 e2^8 r8 f a b4 f a b4 f a b o6 e d4 o5 b o6 c e o5 b16 r16 g2^8 b g d16 r16 e2^8 r1 r1 r8 f g a4 b o6 c16 r16 d4 e f16 r16 g2. r1 r1 o5 f e16 r16 a g16 r16 b a16 r16 o6 c o5 b16 r16 o6 d c16 r16 e d16 r16 f e16 r16 o5 b16 o6 c16 r16 o5 a16 b1^4 r2.
B @8 v9 l16 o3 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 o3 c8 e8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 o3 c8 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 f8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 o3 c8 e8 o4 c r16 c r16 c r16 o3 e8 o4 c r16 c r16 o3 e8 o4 d8 e r16 f4 g8 a8 b4 o5 c8 o4 b r16 e2. d8 e8 f4 g8 a r16 b4 o5 c8 d r16 e2. o4 d8 e r16 f4 g8 a r16 b4 o5 c8 o4 b r16 e2. d8 c r16 f8 e r16 g8 f r16 a8 g r16 b8 a r16 o5 c8 o4 b r16 o5 d8 c r16 e f r16 d e1^4 r2.
C @9 v11 l16 o3 f r4. r16 f r4. r16 f r4. r16 f r4. r16 c r4. r16 c r4. r16 c r4. r16 c r4. r16 f r4. r16 f r4. r16 f r4. r16 f r4. r16 c r4. r16 c r4. r16 c r4. r16 c r4. r16 d r16 f r16 d r16 f r16 o2 g r16 o3 d r16 o2 g r16 o3 d r16 c r16 e r16 c r16 e r16 o2 a r16 o3 c r16 o2 a r16 o3 c r16 d r16 f r16 d r16 f r16 o2 g r16 o3 d r16 o2 g r16 o3 d r16 c r16 e r16 c r16 e r16 o2 a r16 o3 c r16 o2 a r16 o3 c r16 d r16 f r16 d r16 f r16 o2 g r16 o3 d r16 o2 g r16 o3 d r16 c r16 e r16 c r16 e r16 o2 a r16 o3 c r16 o2 a r16 o3 c r16 d r16 f r16 f r8. d r16 f r16 f r8. c r16 g r16 g r8. c r16 g r16 g r8. e r16 a r8. a r16 e r16 a r8. a r16 e r16 a- r16 a- r16 e r16 e r8. e4
D @5 v5 l16 [o3 f# r16 f# f# f# r16 f# r16 f# r16 f# f# f# r16 f# r16]8 [o3 f# r16 f# f# f# r16 f# f# f# r16 f# f# f# r16 f# f#]6 o3 f# r16 f# f# f# r8. f# r16 f# f# f# r8. o3 f# r16 f# f# f# r8. f# r16 f# f# f# r8. o3 f# r16 f# f# f# r16 f# f# f# r16 f# f# f# r16 f# f# r8 o3 f# r16 f# r16 f# r16 f# r8. f# r8.`;

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
    let step = 0, last = null;
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
        last = null;
      } else if (tok.k === "^") {
        if (last) last.len += lengthSteps(tok.len, st.def, warnings, letter);
        else warnings.push(`Channel ${letter}: a ^ tie with no note before it`);
        step += 0; // the tie extends the note; the cursor already sits at its end
        if (last) { /* cursor must advance past the extension */ }
        // Ties extend the previous note, and the cursor moves with it:
        // handled by tracking note end below.
        if (last) step = Math.max(step, last.step + last.len);
      } else if (tok.k === "n") {
        const len = lengthSteps(tok.len, st.def, warnings, letter);
        const midi = (st.oct + 1) * 12 + tok.pc + tok.acc;
        last = { step, len, midi, inst: st.inst, vol: st.vol };
        notes.push(last);
        step += len;
      }
      if (step > 8192) { errors.push(`Channel ${letter}: the song runs past 8192 steps`); break; }
    }
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

/* ---------- the demo ---------- */

const roll = document.querySelector("[data-music-demo-roll]");
const playButton = document.querySelector("[data-music-demo-play]");
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

  const STEP_W = 2, ROW_H = 3;
  let lo = Infinity, hi = -Infinity;
  for (const ch of song.channels) {
    for (const n of ch.notes) {
      if (n.midi < lo) lo = n.midi;
      if (n.midi > hi) hi = n.midi;
    }
  }
  lo -= 1; hi += 1;
  const ROWS = hi - lo + 1;
  roll.width = song.steps * STEP_W;
  roll.height = ROWS * ROW_H;

  const notesLayer = document.createElement("canvas");
  notesLayer.width = roll.width;
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

  function paint(step) {
    const c = roll.getContext("2d");
    c.clearRect(0, 0, roll.width, roll.height);
    c.drawImage(notesLayer, 0, 0);
    if (step >= 0 && !reducedMotion.matches) {
      const pal = PALETTES[resolvedDark() ? "dark" : "light"];
      c.fillStyle = pal.head;
      c.fillRect(step * STEP_W, 0, STEP_W, roll.height);
    }
  }

  // The maker's segment maths, minus the swap machinery: the
  // song never changes here, so one segment serves the visit.
  const demo = {
    ctx: null, out: null, src: null, seg: null,
    rendered: null, playing: false, rendering: false, raf: 0,
  };

  function stepAt(now) {
    const { startCtxTime, rendered } = demo.seg;
    const elapsed = now - startCtxTime;
    const introDur = rendered.loopStart;
    if (elapsed < introDur) return Math.floor(elapsed / rendered.stepDur);
    const inLoop = (elapsed - introDur) % rendered.loopDur;
    return song.loopStep + Math.floor(inLoop / rendered.stepDur);
  }

  function runPlayhead() {
    let lastStep = -1;
    const tick = () => {
      if (!demo.playing) return;
      const step = stepAt(demo.ctx.currentTime);
      if (step !== lastStep) {
        lastStep = step;
        paint(step);
      }
      demo.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function setButton(text, pressed, disabled) {
    playButton.textContent = text;
    playButton.setAttribute("aria-pressed", String(pressed));
    playButton.disabled = disabled;
  }

  async function play() {
    if (demo.rendering || demo.playing) return;
    demo.rendering = true;
    setButton("rendering…", false, true);
    if (status) status.textContent = "rendering the loop";
    try {
      if (!demo.ctx) {
        demo.ctx = new AudioContext();
        demo.out = demo.ctx.createGain();
        demo.out.connect(demo.ctx.destination);
      }
      await demo.ctx.resume();
      await loadSamples();
      if (!demo.rendered) demo.rendered = await renderSong(song);
    } catch {
      demo.rendering = false;
      setButton("play", false, false);
      if (status) status.textContent = "the loop did not render";
      return;
    }
    demo.rendering = false;
    const src = demo.ctx.createBufferSource();
    src.buffer = demo.rendered.buffer;
    src.loop = true;
    src.loopStart = demo.rendered.loopStart;
    src.loopEnd = demo.rendered.dur;
    src.connect(demo.out);
    const startCtxTime = demo.ctx.currentTime + 0.08;
    src.start(startCtxTime);
    demo.src = src;
    demo.seg = { startCtxTime, rendered: demo.rendered };
    demo.playing = true;
    setButton("stop", true, false);
    if (status) status.textContent = "Saria's Song, looping";
    if (!reducedMotion.matches) runPlayhead();
  }

  function stop() {
    if (demo.src) {
      try { demo.src.stop(); } catch { /* already stopped */ }
      demo.src.disconnect();
      demo.src = null;
    }
    demo.playing = false;
    cancelAnimationFrame(demo.raf);
    setButton("play", false, false);
    if (status) status.textContent = "";
    paint(-1);
  }

  playButton.addEventListener("click", () => {
    if (demo.playing) stop();
    else play();
  });

  // Repaint when the theme flips, from the toggle or the OS.
  new MutationObserver(() => { paintNotes(); paint(-1); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  systemDark.addEventListener("change", () => { paintNotes(); paint(-1); });

  paintNotes();
  paint(-1);

  // A handle for checking the demo end to end: the parsed song,
  // the rendered buffer once it exists, and the output node the
  // playback runs through.
  window.__musicDemo = {
    song,
    get rendered() { return demo.rendered; },
    get playing() { return demo.playing; },
    get ctx() { return demo.ctx; },
    get out() { return demo.out; },
    stepNow: () => (demo.seg ? stepAt(demo.ctx.currentTime) : -1),
  };
}
