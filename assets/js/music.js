/*
  The music maker, rebuilt. Songs are MML: the text notation game
  music was actually composed in, one line per channel. The grid and
  the text are two views of one song; editing either rewrites the
  other.

  There is no live scheduler. The whole loop is rendered once with
  OfflineAudioContext into a single buffer, and playback is that
  buffer on loop, so the phone's main thread does nothing per note
  and cannot stutter it. An edit re-renders and swaps in at the
  loop boundary.

  Two voice families, matched to the eras. The 8-bit songs use the
  fixed channels the hardware had: pulse waves at real duty cycles
  (PeriodicWave, not plain square), a stepped 32-step triangle, and
  LFSR noise, with stepped envelopes and no reverb. The Zelda songs
  are sample-based, as the N64 was: short recordings from VSCO-2 CE
  (Versilian Studios, CC0), trimmed and encoded to small MP3s under
  assets/audio/, pitch-shifted by playbackRate, with one generated
  -impulse convolver for the N64's space. Sample roots were set by
  measuring the recordings, not by trusting their file names: the
  VSCO wind and string folders label an octave below sounding pitch
  (their "C5" flute sounds C6), so each file here is named for the
  pitch it actually sounds.

  main.js is not loaded here: it assumes the home page's DOM. The
  theme toggle below is the same miniature mochi.js uses, same
  localStorage key, so a choice made on any page holds on all.
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

/* ---------- keys ---------- */

// The site's interaction model, in miniature, mirroring mochi.js:
// digit keys jump to sections and frame them, t works the theme
// toggle, ? opens the keys legend.
function setUpKeys() {
  const sections = document.querySelectorAll(".section");
  const keys = document.querySelector("[data-keys]");
  const keysToggle = document.querySelector("[data-keys-toggle]");
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (!sections.length || !keys || !keysToggle) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let jumpingUntil = 0;

  function frame(section) {
    for (const other of sections) {
      other.classList.toggle("is-active", other === section);
    }
  }

  const centreLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-50% 0px -50% 0px" }
  );
  for (const section of sections) centreLine.observe(section);

  function showKeys(open) {
    keys.hidden = !open;
    keysToggle.setAttribute("aria-expanded", String(open));
  }

  function jump(section) {
    section.scrollIntoView({
      behavior: reduced.matches ? "auto" : "smooth",
      block: "start",
    });
    jumpingUntil = performance.now() + (reduced.matches ? 0 : 1000);
    frame(section);
    history.replaceState(null, "", `#${section.querySelector("[id]").id}`);
  }

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const el = event.target;
    if (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= sections.length) {
      jump(sections[digit - 1]);
    } else if (event.key === "t") {
      themeToggle?.click();
    } else if (event.key === "?") {
      showKeys(keys.hidden);
    } else if (event.key === "Escape") {
      showKeys(false);
    } else {
      return;
    }
    event.preventDefault();
  });

  keysToggle.addEventListener("click", () => showKeys(keys.hidden));
}

/* ---------- instruments ---------- */

// The fixed table. @n in the text picks one of these; there is no
// instrument design beyond the list, by design. Chip voices first,
// then the sampled ones. Sample files are named for the pitch they
// sound (see the header note), and a voice uses the nearest root.
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

/* ---------- songs ---------- */

const SONGS = {
  storms: {
    title: "Song of Storms (Zelda)",
    text: `; Song of Storms — The Legend of Zelda: Ocarina of Time (N64, 1998)
; D minor, 6/8 at 190. Transcribed from Metal Master's
; note-for-note MIDI of the Windmill Hut music (vgmusic.com):
; the organ melody on ocarina, the reed organ chords carried
; by their top line on strings, the accordion bass on cello,
; the tambourine on noise. The old build had this at 144 in
; a loose 3/4 with invented harmony; the hut original is 6/8.
A @6 t190 v13 l8 o4 d f o5 d2 o4 d f o5 d2 e4. f e f e c o4 a2 a4 d4 f g a2. a4 d4 f g e2.
B @8 v9 l4 r4 o4 a a4. e8 b2 r4 o5 c c4. o4 e8 b2 r4 a a r4 a2 r4 a a r4 a2
C @9 v12 l4 o2 d2. e2. f2. e2. b-2. f2. b-2. a2.
D @5 v5 l8 r4 o3 f# r8 f# r4 f# f# f# f# r4. f# r8 f# r4 f# f# f# f# r4. f# r8 f# r4 f# f# f# f# r4. f# r8 f# r4 f# f# f# f#4`,
  },
  lullaby: {
    title: "Zelda's Lullaby (Zelda)",
    text: `; Zelda's Lullaby — The Legend of Zelda: Ocarina of Time (N64, 1998)
; G major, 3/4 at 110. The first full statement of Zelda's
; Theme, transcribed from Aaron Ritchie's MIDI of the theme
; (vgmusic.com): flute lead, the string chords split into
; two lines (top line on strings, bottom line on cello),
; and the harp part as written. The old build played it at
; 100 with an ending the theme does not have; it ends here
; on the long high D, as the theme does.
A @7 t110 v13 l2 o4 b o5 d4 o4 a g8 a8 b o5 d4 o4 a2. b o5 d4 a g4 d c8 o4 b8 a2. b o5 d4 o4 a g8 a8 b o5 d4 o4 a2. b o5 d4 a g4 o6 d1^2
B @8 v9 l4 o4 g2. a2. g2. a2. a2. g2. g2. f#2. g2. a2. g2. a2. a2. g2. g2. f#2.
C @9 v11 l4 o4 e2. f#2. e2. f#2. f#2. e2. e2. d2. c2. c2. c2. c2. o3 b2. b-2. a2. o4 c2.
D @10 v7 l8 o3 c g o4 e2 o3 c a o4 f#2 o3 c g o4 e2 o3 c a o4 f#2 o2 b o4 d a2 o2 b- o4 c# g2 o2 a o4 c g2 o3 d o4 c f#2 o3 c g o4 e2 o3 c a o4 f#2 o3 c16 r16 g o4 e2 o3 c a o4 f#2 o2 b o4 d a2 o2 b- o4 c# g2 o2 a o4 c g2 o3 d o4 c f#2`,
  },
  saria: {
    title: "Saria's Song (Zelda)",
    text: `; Saria's Song — The Legend of Zelda: Ocarina of Time (N64, 1998)
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
D @5 v5 l16 [o3 f# r16 f# f# f# r16 f# r16 f# r16 f# f# f# r16 f# r16]8 [o3 f# r16 f# f# f# r16 f# f# f# r16 f# f# f# r16 f# f#]6 o3 f# r16 f# f# f# r8. f# r16 f# f# f# r8. o3 f# r16 f# f# f# r8. f# r16 f# f# f# r8. o3 f# r16 f# f# f# r16 f# f# f# r16 f# f# f# r16 f# f# r8 o3 f# r16 f# r16 f# r16 f# r8. f# r8.`,
  },
  pallet: {
    title: "Pallet Town (Pokémon)",
    text: `; Pallet Town — Pokémon Red & Blue (Game Boy, 1996)
; G major, 4/4, 121 bpm, Junichi Masuda. Note-for-note
; from Nayuki's transcription of the Game Boy score
; (nayuki.io): channel 1 on the 50% pulse, channel 2 on
; the 25% pulse, channel 3 (triangle wave) on the
; triangle voice. Sixteen bars: the game's full loop.
; The old build's lead came from a guitar tab and left
; the score behind in the second half; this is the score.
A @2 t121 v13 l8 o4 b8. r16 o5 c d8. r16 g d c o4 b8. r16 g o5 d8. r16 d c o4 b r8 b o5 c o4 b o5 c4^16 r4 r16 o4 b o5 c o4 a b g a f# b8. r16 o5 c d8. r16 g d c o4 b8. r16 g o5 d8. r16 d g f# e8. r16 d c8. r16 o4 a b o5 c d c o4 b a g8. r16 f#8. r16 o5 c o4 g e g o5 d o4 a f# a b g d g b g d g o5 c o4 g e g o5 d o4 a f# a b g d g b g d g a e c e a e c e a e c e a e c e f# d c d g e c e g e c e f# d c d
B @1 v8 l8 o6 d c o5 b a o6 g e f# e d4^16 r16 o5 b g g a b o6 c4^16 r4 r16 o5 f# g a b4^16 r16 o6 c16 o5 b16 a4^16 r8. o6 d c o5 b o6 d g f# f# g e4^16 r16 d d4^16 r8. c o5 b a g o6 d c o5 b a g4^16 r4 r16 g a b o6 c4^16 r8. d4^16 r16 c o5 b4^16 r4 r16 g a b o6 c8. r16 c8. r16 d4^16 r16 c16 d16 o5 b4^16 r4 r16 b a g a4^16 r8. e8. r16 b8. r16 a4^16 r8. g8. r16 e8. r16 f#4^16 r8. g8. r16 b8. r16 b4^16 r8. a4^16 r8.
C @4 v12 l2 o4 g4^16 r16 e4^16 r16 f#8. r16 g4^16 r16 a4^16 r16 g8. r16 e4^16 r16 f#4^16 r16 e8. r16 g4^16 r16 e4^16 r16 d8. r16 g4^16 r16 e4^16 r16 f#8. r16 g4^16 r16 a4^16 r16 g8. r16 e4^16 r16 f#4^16 r16 a8. r16 g4^16 r16 e4^16 r16 d8. r16 c4.^16 r16 d4.^16 r16 g4.^16 r16 e8. r16 d8. r16 c4.^16 r16 d4.^16 r16 g4.^16 r16 a8. r16 g8. r16 e4.^16 r16 a4.^16 r16 e4.^16 r16 g4.^16 r16 f#4.^16 r16 e4.^16 r16 e4.^16 r16 f#`,
  },
  center: {
    title: "Pokémon Center (Pokémon)",
    text: `; Pokémon Center — Pokémon Red & Blue (Game Boy, 1996)
; D major, 4/4, 134 bpm, Junichi Masuda. Note-for-note
; from Nayuki's transcription of the Game Boy score
; (nayuki.io), channels mapped as in Pallet Town. The
; full sixteen bars this time: the old build cut the
; middle strain (bars 9 to 16) and shrank the bass to a
; two-note figure; the real triangle part walks the
; chord in eighths, all bar, every bar.
A @2 t134 v13 l8 o4 f# f f# o5 d8. r16 c# o4 b a b a g f# e f# g a a e a o5 c#8. r16 o4 b a g f# a b o5 c# d c# o4 b a f# f f# o5 d8. r16 c# o4 b a b a g f# e f# g a a e a o5 c#8. r16 o4 b a g f# e d e f# g a b f# e d8. r16 e f# g a b a g8. r16 e f# g a g f# e8. r16 c# d e g f# g a b a4.^16 r16 o5 d c# o4 b8. r16 a b o5 c# d e d c#8. r16 o4 b o5 c# d e c# o4 b a8. r16 g a b g a g f# e d e f# g
B @1 v8 l8 o5 d o4 a o5 d a8. r16 g8. r16 f# e c#4^16 r16 o4 a8. r16 e8. r16 o5 c# o4 a o5 c# f#8. r16 e8. r16 c# d f#4^16 r16 o4 a8. r16 e8. r16 o5 d o4 a o5 d a8. r16 g8. r16 f# e c#4^16 r16 o4 a8. r16 e8. r16 o5 c# o4 a o5 c# f#8. r16 e8. r16 c# d4^16 r8. o4 d8. r16 e8. r16 o5 f#4.^16 r16 a4.^16 r16 g a g f# e4.^16 r16 c#4.^16 r16 e4.^16 r16 f# g f# e d4.^16 r16 f#4.^16 r16 a4.^16 r16 g f# g a b4.^16 r16 a8. r16 g f# g4.^16 r16 f# g f# e d2
C @4 v12 l8 o4 d f# d f# d f# g f# e a e a e a e a e a e a e a g a f# a f# a f# a g a d f# d f# d f# g f# e a e a e a e a e a e a e a g a d f# d f# d b a g f# a f# a f# a f# a g b g b g b g b e g e g e g e g f# a f# a f# a a- a f# a f# a f# a f# a g b g b g b g b e g e g e g e g f# a f# a f# g f# e`,
  },
  lavender: {
    title: "Lavender Town (Pokémon)",
    text: `; Lavender Town — Pokémon Red & Blue (Game Boy, 1996)
; G major signature over E minor, 4/4, 127 bpm, Junichi
; Masuda. Note-for-note from Nayuki's transcription of
; the Game Boy score (nayuki.io), channels mapped as in
; Pallet Town, plus the pedal hi-hat on noise. Four bars
; of the high cycle alone (C G B F#), then the full
; texture; the L is where the game loops. The old build
; crawled at 96 with the cycle as slow half notes. At
; 127 the cycle is short pings, one a beat, over the
; half-note melody and a whole-note bass.
A @2 t127 v12 l4 r1 r1 r1 r1 L l4 o4 g4.^16 r16 g4.^16 r16 e4.^16 r16 e4.^16 r16 g8. r16 f#8. r16 e8. r16 b8. r16 c#4.^16 r16 c#4.^16 r16 g4.^16 r16 g4.^16 r16 f#4.^16 r16 f#4.^16 r16 b8. r16 g8. r16 f#8. r16 b8. r16 o5 c4.^16 r16 c4.^16 r16 o4 g4.^16 r16 g4.^16 r16 e4.^16 r16 e4.^16 r16 g8. r16 f#8. r16 e8. r16 b8. r16 c#4.^16 r16 c#4.^16 r16 g4.^16 r16 g4.^16 r16 f#4.^16 r16 f#4.^16 r16 b8. r16 g8. r16 f#8. r16 b8. r16 c4.^16 r16 c4.^16 r1 r1 r1 r1 r16
B @1 v11 l16 [o6 c r8. g r8. b r8. f# r8.]24
C @4 v12 l4 r1 r1 r1 r1 o4 e2.^8. r16 d2.^8. r16 c2.^8. r16 e8. r16 c8. r16 o3 b8. r16 o4 e8. r16 e2.^8. r16 d2.^8. r16 c2.^8. r16 e8. r16 c8. r16 o3 b8. r16 o4 e8. r16 e2.^8. r16 d2.^8. r16 c2.^8. r16 e8. r16 c8. r16 o3 b8. r16 o4 e8. r16 o6 b8. r16 g8. r16 f#8. r16 b8. r16 b8. r16 g8. r16 f#8. r16 b8. r16 o7 e8. r16 c8. r16 o6 b8. r16 o7 e8. r16 o4 e8. r16 g8. r16 f#8. r16 b8. r16 e2.^8. r16 d2.^8. r16 c2.^8. r16 e8. r16 c8. r16 o3 b8. r16 o4 e
D @5 v5 l8 r1 r1 r1 r1 o2 a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4. a- r4.`,
  },
  mario: {
    title: "Overworld (Mario)",
    text: `; Overworld — Super Mario Bros. (NES, 1985)
; C major, 4/4, Koji Kondo. Note-for-note from matOO's
; four-channel transcription of the NES score
; (vgmusic.com), cross-checked against KBY30's
; "Actually Perfect" rendition, which agrees note for
; note outside the triplet sections: square 1 on @1,
; square 2 on @2, triangle on @4, noise on @5. Tempo
; 200: Nintendo's own sheet music (via Nintendo Music)
; marks the theme 100 in cut time, 200 in quarter
; notes; the old build's 180 came from a piano book.
; The first 32 bars play once; the L marks the loop,
; the 72-bar body. Notes sound for at most an eighth,
; as both transcriptions have them. The triplet
; sections are squared to the 16th grid, the one
; figure this text format cannot spell exactly.
A @1 t200 v13 l8 o5 e e r8 e r8 c e r8 g r2. r8 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r4 o5 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r2 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 g f# f e- r8 e r8 o6 c r8 c c r2 r8 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 e- r4 d r4 c r1 r8 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 g f# f e- r8 e r8 o6 c r8 c c r2 r8 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 e- r4 d r4 c r2. r8 c c r8 c r8 c d r8 e c r8 o4 a g r4. o5 c c r8 c r8 c d e r1 c c r8 c r8 c d r8 e c r8 o4 a g r4. L l8 o5 e e r8 e r8 c e r8 g r2. r8 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r4 o5 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r4 o5 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b r16 o5 a a r16 a r16 g f r16 e c r8 o4 a g r4. o5 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b o5 f r8 f f r16 e d r16 c r2. r8 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b r16 o5 a a r16 a r16 g f r16 e c r8 o4 a g r4. o5 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b o5 f r8 f f r16 e d r16 c r2. r8 c c r8 c r8 c d r8 e c r8 o4 a g r4. o5 c c r8 c r8 c d e r1 c c r8 c r8 c d r8 e c r8 o4 a g r4. o5 e e r8 e r8 c e r8 g r2. r8 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b r16 o5 a a r16 a r16 g f r16 e c r8 o4 a g r4. o5 e c r8 o4 g r4 a- r8 a o5 f r8 f o4 a r4. b o5 f r8 f f r16 e d r16 c r2. r8 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r4 o5 c r4 o4 g r4 e r4 a r8 b r8 b- a r8 g r16 o5 e g r16 a r8 f g r8 e r8 c d o4 b r2 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 g f# f e- r8 e r8 o6 c r8 c c r2 r8 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 e- r4 d r4 c r1 r8 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 g f# f e- r8 e r8 o6 c r8 c c r2 r8 o5 g f# f e- r8 e r8 o4 a- a o5 c r8 o4 a o5 c d r4 e- r4 d r4 c r2. r8 c c r8 c r8 c d r8 e c r8 o4 a g r4. o5 c c r8 c r8 c d e r1 c c r8 c r8 c d r8 e c r8 o4 a g r4.
B @2 v9 l8 o4 f# f# r8 f# r8 f# f# r8 b r4. g r4. e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r4 e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r2 o5 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 o5 e e- d o4 b r8 o5 c r8 f r8 f f r2 r8 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 a- r4 f r4 e r1 r8 o5 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 o5 e e- d o4 b r8 o5 c r8 f r8 f f r2 r8 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 a- r4 f r4 e r2. r8 a- a- r8 a- r8 a- b- r8 g e r8 e c r4. a- a- r8 a- r8 a- b- g r1 a- a- r8 a- r8 a- b- r8 g e r8 e c r4. f# f# r8 f# r8 f# f# r8 b r4. g r4. e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r4 e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r4 o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g r16 o5 f f r16 f r16 e d r16 c o4 a r8 f e r4. o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g o5 d r8 d d r16 c o4 b r16 g e r8 e c r4. o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g r16 o5 f f r16 f r16 e d r16 c o4 a r8 f e r4. o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g o5 d r8 d d r16 c o4 b r16 g e r8 e c r4. a- a- r8 a- r8 a- b- r8 g e r8 e c r4. a- a- r8 a- r8 a- b- g r1 a- a- r8 a- r8 a- b- r8 g e r8 e c r4. f# f# r8 f# r8 f# f# r8 b r4. g r4. o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g r16 o5 f f r16 f r16 e d r16 c o4 a r8 f e r4. o5 c o4 a r8 e r4 e r8 f o5 c r8 c o4 f r4. g o5 d r8 d d r16 c o4 b r16 g e r8 e c r4. e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r4 e r4 c r4 o3 g r4 o4 c r8 d r8 c# c r8 c r16 g b r16 o5 c r8 o4 a b r8 a r8 e f d r2 o5 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 o5 e e- d o4 b r8 o5 c r8 f r8 f f r2 r8 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 a- r4 f r4 e r1 r8 o5 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 o5 e e- d o4 b r8 o5 c r8 f r8 f f r2 r8 e e- d o4 b r8 o5 c r8 o4 e f g r8 c e f r4 a- r4 f r4 e r2. r8 a- a- r8 a- r8 a- b- r8 g e r8 e c r4. a- a- r8 a- r8 a- b- g r1 a- a- r8 a- r8 a- b- r8 g e r8 e c r4.
C @4 v13 l8 o3 d d r8 d r8 d d r8 o4 g r4. o3 g r4. g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r4 e r4 g o4 c r8 o5 g r8 g g r8 o3 g r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r8 a- r4 b- r4 o4 c r4 o3 g g r8 c r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r4 e r4 g o4 c r8 o5 g r8 g g r8 o3 g r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r8 a- r4 b- r4 o4 c r4 o3 g g r8 c r8 o2 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 o3 d d r8 d r8 d d r8 o4 g r4. o3 g r4. g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 d r4 f g r8 b r8 g r8 g r8 o4 c c o3 g r8 c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 g g r8 g g r16 a b r16 o4 c r8 o3 g r8 c r4. c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 d r4 f g r8 b r8 g r8 g r8 o4 c c o3 g r8 c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 g g r8 g g r16 a b r16 o4 c r8 o3 g r8 c r4. o2 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 o3 d d r8 d r8 d d r8 o4 g r4. o3 g r4. c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 d r4 f g r8 b r8 g r8 g r8 o4 c c o3 g r8 c r4 f# g r8 o4 c r8 o3 f r8 f r8 o4 c c o3 f r8 g g r8 g g r16 a b r16 o4 c r8 o3 g r8 c r4. g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 g r4 e r4 c r4 f r8 g r8 f# f r8 e r16 o4 c e r16 f r8 d e r8 c r8 o3 a b g r4 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r4 e r4 g o4 c r8 o5 g r8 g g r8 o3 g r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r8 a- r4 b- r4 o4 c r4 o3 g g r8 c r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r4 e r4 g o4 c r8 o5 g r8 g g r8 o3 g r8 c r4 g r4 o4 c r8 o3 f r4 o4 c c r8 o3 f r8 c r8 a- r4 b- r4 o4 c r4 o3 g g r8 c r8 o2 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g r8 a- r4 o3 e- r4 a- r8 g r4 c r4 o2 g4
D @5 v7 l16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 [o2 f# r8. f# r8 f# f#8. r16 f# r8 f#]24 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 [o2 f# r8. f# r8 f# f#8. r16 f# r8 f#]8 [o2 f# r4 r16 f# r16 f#8. r16 f# r8.]16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 [o2 f# r4 r16 f# r16 f#8. r16 f# r8.]8 [o2 f# r8. f# r8 f# f#8. r16 f# r8 f#]24 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f# r16 o2 f#8. r16 f# r16 f#8. r16 f# r16 f#8. r16 o2 f#8. r8. f#8. r16 f# r16 f# r16 f#8`,
  },
};

/* ---------- MML parser ---------- */

// The subset, whole: one line per channel, starting with its
// letter A-H. Notes a-g, # or + sharp, - flat, an optional length
// (1, 2, 4, 8, 16) and dots; r rests; ^ ties the next length onto
// the last note; o sets the octave, < and > move it; l sets the
// default length; v volume 0-15; @ instrument; t tempo; [ ]n
// repeats a passage; L marks where the loop restarts (everything
// before it plays once, as an intro). ; starts a comment.
// Lengths land on a 16th-note grid: that grid is the single source
// of truth for time, which is what lets the grid view and the text
// stay two views of one song.

const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const PC_NAME = ["c", "c#", "d", "e-", "e", "f", "f#", "g", "a-", "a", "b-", "b"];
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

// Reads "4", "8.", "2.." after a note. Returns {n, dots} or null
// when the note carries no length of its own.
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

// Repeats are expanded before the linear pass, so the note builder
// never has to think about them.
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

/* ---------- canonical text ---------- */

// The grid edits notes, not letters, so after a grid edit the text
// is rewritten from the notes: one line per channel, every length
// spelled out, octaves set absolutely when they change. What a
// person typed by hand is left exactly as typed until then.
const STEP_TOKENS = [[16, "1"], [12, "2."], [8, "2"], [6, "4."], [4, "4"], [3, "8."], [2, "8"], [1, "16"]];

function lengthChunks(steps) {
  const out = [];
  let rest = steps;
  while (rest > 0) {
    const [size, tok] = STEP_TOKENS.find(([s]) => s <= rest);
    out.push(tok);
    rest -= size;
  }
  return out;
}

function channelToMML(letter, ch, tempo, withTempo) {
  const parts = [letter];
  let curOct = null, curInst = null, curVol = null;
  let cursor = 0;
  const emitLen = (base, steps, tie) => {
    const chunks = lengthChunks(steps);
    let s = base + chunks[0];
    for (let i = 1; i < chunks.length; i++) s += tie ? `^${chunks[i]}` : ` ${base}${chunks[i]}`;
    return s;
  };
  for (const n of ch.notes) {
    if (n.step > cursor) {
      parts.push(emitLen("r", n.step - cursor, false));
      cursor = n.step;
    }
    if (n.inst !== curInst) { parts.push(`@${n.inst}`); curInst = n.inst; }
    if (withTempo && tempo !== null) { parts.push(`t${tempo}`); tempo = null; }
    if (n.vol !== curVol) { parts.push(`v${n.vol}`); curVol = n.vol; }
    const oct = Math.floor(n.midi / 12) - 1;
    if (oct !== curOct) { parts.push(`o${oct}`); curOct = oct; }
    parts.push(emitLen(PC_NAME[n.midi % 12], n.len, true));
    cursor = n.step + n.len;
  }
  return parts.join(" ");
}

function songToText(song) {
  const lines = [...song.header];
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  song.channels.forEach((ch, i) => {
    lines.push(channelToMML(ch.letter, ch, i === 0 ? song.tempo : null, i === 0));
  });
  return lines.join("\n") + "\n";
}

/* ---------- samples ---------- */

// Loaded once, lazily, and decoded with a throwaway offline
// context so the buffers can serve every render. Each entry is
// [rootMidi, buffer]; a voice picks the nearest root and shifts.
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

function dutyWave(ctx, duty) {
  const N = 96;
  const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    real[k] = (2 / (Math.PI * k)) * Math.sin(2 * Math.PI * k * duty);
    imag[k] = (2 / (Math.PI * k)) * (1 - Math.cos(2 * Math.PI * k * duty));
  }
  return ctx.createPeriodicWave(real, imag);
}

// The NES triangle is not a smooth triangle: it is a 32-step,
// 4-bit staircase. Its wave is the DFT of that exact sequence.
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

// GB/NES noise is an LFSR bit-stream, not white noise: brighter
// and more metallic, and it loops like the hardware's does.
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
    // Stepped, the way the hardware envelopes step: a few flat
    // levels on the way down, never a smooth ramp.
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
    // The hardware triangle has no volume control. Volume in the
    // text only nudges it.
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
    // The susNV flute has no vibrato of its own; the N64 applied
    // it in the engine, late and shallow, so here it is likewise.
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

// The whole loop, rendered once. Playback is then a single
// looping buffer source: nothing is scheduled live, ever.
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

/* ---------- player ---------- */

// Playhead maths lives here and nowhere else: a segment is
// {startCtxTime, rendered, song}; the loop region is the tail of
// the buffer after the intro (loopStep), and swaps re-base the
// segment at the boundary so the formula never changes shape.
const player = {
  ctx: null, src: null, seg: null, playing: false,
  rendered: null, song: null, dirty: true, pending: null, raf: 0,
};

function stepAt(now) {
  const { startCtxTime, rendered, song } = player.seg;
  const elapsed = now - startCtxTime;
  const introDur = rendered.loopStart;
  if (elapsed < introDur) return Math.floor(elapsed / rendered.stepDur);
  const inLoop = (elapsed - introDur) % rendered.loopDur;
  return song.loopStep + Math.floor(inLoop / rendered.stepDur);
}

async function startPlayback() {
  if (!player.ctx) player.ctx = new AudioContext();
  await player.ctx.resume();
  await loadSamples();
  if (player.dirty || !player.rendered) {
    setStatus("rendering…");
    player.rendered = await renderSong(player.song);
    player.dirty = false;
    player.pending = null;
    window.__lastRender = player.rendered;
  }
  stopSource();
  const src = player.ctx.createBufferSource();
  src.buffer = player.rendered.buffer;
  src.loop = true;
  src.loopStart = player.rendered.loopStart;
  src.loopEnd = player.rendered.dur;
  src.connect(player.ctx.destination);
  const startCtxTime = player.ctx.currentTime + 0.08;
  src.start(startCtxTime);
  player.src = src;
  player.seg = { startCtxTime, rendered: player.rendered, song: player.song };
  player.playing = true;
  setPlayUI(true);
  setStatus(readyText());
  runPlayhead();
}

function stopSource() {
  if (player.src) {
    try { player.src.stop(); } catch { /* already stopped */ }
    player.src.disconnect();
    player.src = null;
  }
}

function stopPlayback() {
  stopSource();
  player.pending = null;
  player.playing = false;
  cancelAnimationFrame(player.raf);
  setPlayUI(false);
  clearPlayhead();
  setStatus(readyText());
}

// When the song changes under a playing loop, the new render is
// swapped in at the next loop boundary: the old source stops and
// the new one starts there, already inside its loop.
function maybeSwap() {
  if (!player.pending || !player.seg) return;
  const now = player.ctx.currentTime;
  const { startCtxTime, rendered } = player.seg;
  const introDur = rendered.loopStart;
  const cycles = Math.max(
    0, Math.ceil((now - startCtxTime - introDur) / rendered.loopDur));
  const boundary = startCtxTime + introDur + cycles * rendered.loopDur;
  if (boundary - now > 0.25) return; // not close enough yet; keep checking
  const next = player.pending;
  player.pending = null;
  const src = player.ctx.createBufferSource();
  src.buffer = next.buffer;
  src.loop = true;
  src.loopStart = next.loopStart;
  src.loopEnd = next.dur;
  src.connect(player.ctx.destination);
  src.start(boundary, next.loopStart);
  player.src.stop(boundary);
  player.src = src;
  player.rendered = next;
  player.seg = { startCtxTime: boundary - next.loopStart, rendered: next, song: player.song };
  setStatus(readyText());
}

function runPlayhead() {
  let lastStep = -1;
  const tick = () => {
    if (!player.playing) return;
    maybeSwap();
    const step = stepAt(player.ctx.currentTime);
    if (step !== lastStep) {
      lastStep = step;
      paintPlayhead(step);
    }
    player.raf = requestAnimationFrame(tick);
  };
  tick();
}

// A song change: if it parses, it becomes the song. While playing,
// the re-render is prepared in the background and swapped at the
// loop boundary; while stopped, it simply waits for the next play.
function songChanged(parsed, { restart = false } = {}) {
  player.song = parsed;
  player.dirty = true;
  if (!player.playing) return;
  if (restart) {
    startPlayback();
    return;
  }
  renderSong(parsed).then((rendered) => {
    if (player.song === parsed && player.playing) {
      player.pending = rendered;
      window.__lastRender = rendered;
    }
  });
}

/* ---------- page ---------- */

const textEl = document.querySelector("[data-song-text]");
const gridEl = document.querySelector("[data-grid]");
const tabsEl = document.querySelector("[data-ptabs]");
const statusEl = document.querySelector("[data-status]");
const textStatusEl = document.querySelector("[data-text-status]");
const playBtn = document.querySelector("[data-play]");
const tempoValueEl = document.querySelector("[data-tempo-value]");

function setStatus(msg, isError = false) {
  for (const el of [statusEl, textStatusEl]) {
    if (!el) continue;
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
  }
}

function readyText() {
  const s = player.song;
  if (!s) return "";
  let msg = `${s.steps} steps · ${s.channels.length} channels · ${s.tempo} bpm`;
  if (player.rendered && !player.dirty && !player.pending) {
    msg += ` · rendered in ${Math.round(player.rendered.renderMs)} ms`;
  }
  if (s.warnings.length) msg += ` · ${s.warnings[0]}`;
  return msg;
}

function showIssues(parsed) {
  if (!parsed.ok) {
    setStatus(parsed.errors[0], true);
    return;
  }
  setStatus(readyText());
}

function setPlayUI(playing) {
  playBtn.textContent = playing ? "stop" : "play";
  playBtn.setAttribute("aria-pressed", String(playing));
}

function updateTempoUI() {
  if (player.song) tempoValueEl.textContent = `${player.song.tempo} bpm`;
}

/* ----- grid ----- */

const gridState = { letter: null, cellsByStep: new Map(), lastCol: -1 };

const pitchName = (midi) =>
  PC_NAME[midi % 12].replace(/^./, (c) => c.toUpperCase()) +
  (Math.floor(midi / 12) - 1);

function currentChannel() {
  if (!player.song) return null;
  return (
    player.song.channels.find((c) => c.letter === gridState.letter) ||
    player.song.channels[0]
  );
}

function buildTabs() {
  tabsEl.innerHTML = "";
  if (!player.song || player.song.channels.length < 2) {
    tabsEl.hidden = true;
    return;
  }
  tabsEl.hidden = false;
  for (const ch of player.song.channels) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "music-btn";
    const instName = INSTRUMENTS[ch.notes[0].inst].name;
    btn.textContent = `${ch.letter} · ${instName}`;
    btn.setAttribute("aria-pressed", String(ch === currentChannel()));
    btn.addEventListener("click", () => {
      gridState.letter = ch.letter;
      buildTabs();
      buildGrid();
    });
    tabsEl.appendChild(btn);
  }
}

function buildGrid() {
  gridEl.innerHTML = "";
  gridState.cellsByStep = new Map();
  gridState.lastCol = -1;
  const ch = currentChannel();
  if (!ch) return;
  gridState.letter = ch.letter;
  const song = player.song;

  const head = document.createElement("div");
  head.className = "gchan";
  const used = [...new Set(ch.notes.map((n) => n.inst))]
    .map((i) => INSTRUMENTS[i].name).join(", ");
  head.innerHTML =
    `<span class="gchan__name">${ch.letter}</span>` +
    `<span class="gchan__inst">${used}</span>`;
  gridEl.appendChild(head);

  const pitches = [...new Set(ch.notes.map((n) => n.midi))].sort((a, b) => b - a);
  if (!pitches.length) return;
  const rows = [pitches[0] + 1, ...pitches, pitches[pitches.length - 1] - 1]
    .filter((m, i, a) => m >= 24 && m <= 96 && a.indexOf(m) === i);

  const frag = document.createDocumentFragment();
  for (const midi of rows) {
    const row = document.createElement("div");
    row.className = "grow";
    const label = document.createElement("span");
    label.className = "glabel";
    label.textContent = pitchName(midi);
    row.appendChild(label);
    for (let step = 0; step < song.steps; step++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell" + (step % 4 === 0 && step > 0 ? " beat" : "");
      cell.dataset.step = step;
      cell.dataset.midi = midi;
      cell.setAttribute("aria-label", `${pitchName(midi)}, step ${step + 1}`);
      const note = ch.notes.find(
        (n) => n.midi === midi && step >= n.step && step < n.step + n.len);
      if (note) cell.classList.add(step === note.step ? "c-on" : "c-sus");
      if (!gridState.cellsByStep.has(step)) gridState.cellsByStep.set(step, []);
      gridState.cellsByStep.get(step).push(cell);
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }
  gridEl.appendChild(frag);
}

function paintPlayhead(step) {
  const prev = gridState.cellsByStep.get(gridState.lastCol) || [];
  for (const c of prev) c.classList.remove("is-now");
  const next = gridState.cellsByStep.get(step) || [];
  for (const c of next) c.classList.add("is-now");
  gridState.lastCol = step;
}

function clearPlayhead() {
  paintPlayhead(-1);
  gridState.lastCol = -1;
}

function gridEdit(ch, step, midi) {
  const notes = ch.notes;
  const hit = notes.find(
    (n) => n.midi === midi && step >= n.step && step < n.step + n.len);
  if (hit) {
    if (step === hit.step) notes.splice(notes.indexOf(hit), 1);
    else hit.len = step - hit.step;
  } else {
    let fresh = notes.find((n) => n.midi === midi && n.step + n.len === step);
    if (fresh) {
      fresh.len += 2;
    } else {
      const before =
        [...notes].reverse().find((n) => n.step <= step) || notes[0];
      fresh = {
        step, len: 2, midi,
        inst: before ? before.inst : 1,
        vol: before ? before.vol : 12,
      };
      notes.push(fresh);
    }
    // A channel is one voice: anything else under the new span is
    // cut back or removed, and the new note stops at the next one.
    const s = fresh.step, e = fresh.step + fresh.len;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n === fresh) continue;
      if (n.step < e && n.step + n.len > s) {
        if (n.step >= s) notes.splice(i, 1);
        else n.len = s - n.step;
      }
    }
    const next = notes
      .filter((n) => n !== fresh && n.step > s)
      .sort((a, b) => a.step - b.step)[0];
    if (next && fresh.step + fresh.len > next.step) {
      fresh.len = Math.max(1, next.step - fresh.step);
    }
    notes.sort((a, b) => a.step - b.step);
  }
  ch.steps = notes.reduce((mx, n) => Math.max(mx, n.step + n.len), 0);
  player.song.steps = player.song.channels
    .reduce((mx, c) => Math.max(mx, c.steps), 0);
  const text = songToText(player.song);
  textEl.value = text;
  const parsed = parseSong(text);
  if (parsed.ok) adoptSong(parsed);
}

gridEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const ch = currentChannel();
  if (!ch) return;
  gridEdit(ch, Number(cell.dataset.step), Number(cell.dataset.midi));
});

/* ----- song adoption ----- */

function adoptSong(parsed, { restart = false } = {}) {
  songChanged(parsed, { restart });
  if (!gridState.letter ||
      !parsed.channels.some((c) => c.letter === gridState.letter)) {
    gridState.letter = parsed.channels[0]?.letter ?? null;
  }
  buildTabs();
  buildGrid();
  updateTempoUI();
  showIssues(parsed);
}

function markSongButton(key) {
  for (const btn of document.querySelectorAll("[data-song]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.song === key));
  }
}

function loadSong(key, { restart = false } = {}) {
  const song = SONGS[key];
  if (!song) return;
  textEl.value = song.text + "\n";
  const parsed = parseSong(textEl.value);
  markSongButton(key);
  if (parsed.ok) adoptSong(parsed, { restart });
  else showIssues(parsed);
}

for (const btn of document.querySelectorAll("[data-song]")) {
  btn.addEventListener("click", () => {
    loadSong(btn.dataset.song, { restart: player.playing });
  });
}

/* ----- transport ----- */

let starting = false;
playBtn.addEventListener("click", async () => {
  if (player.playing) { stopPlayback(); return; }
  if (starting) return;
  starting = true;
  try {
    await startPlayback();
  } catch {
    setStatus("The loop could not be rendered.", true);
  }
  starting = false;
});

for (const btn of document.querySelectorAll("[data-tempo]")) {
  btn.addEventListener("click", () => {
    if (!player.song) return;
    const dir = Number(btn.dataset.tempo);
    const target = Math.max(40, Math.min(280, player.song.tempo + dir * 4));
    const lines = textEl.value.split("\n");
    let done = false;
    for (let i = 0; i < lines.length && !done; i++) {
      if (!/^\s*[A-H]\s/.test(lines[i])) continue;
      const [body, ...comment] = lines[i].split(";");
      if (/\bt\d+\b/.test(body)) {
        lines[i] = [body.replace(/\bt\d+\b/, `t${target}`), ...comment].join(";");
        done = true;
      }
    }
    if (!done) {
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\s*[A-H]\s+)/);
        if (m) {
          lines[i] = m[1] + `t${target} ` + lines[i].slice(m[1].length);
          break;
        }
      }
    }
    textEl.value = lines.join("\n");
    const parsed = parseSong(textEl.value);
    if (parsed.ok) { markSongButton(null); adoptSong(parsed); }
  });
}

/* ----- text editing ----- */

let textTimer = 0;
textEl.addEventListener("input", () => {
  clearTimeout(textTimer);
  textTimer = setTimeout(() => {
    const parsed = parseSong(textEl.value);
    if (!parsed.ok) { showIssues(parsed); return; }
    markSongButton(null);
    adoptSong(parsed);
  }, 300);
});

// Warm the sample cache on the first touch, so the first press of
// play is not also the first download.
window.addEventListener("pointerdown", () => loadSamples(), { once: true });

/* ----- go ----- */

setUpThemeToggle();
setUpKeys();
loadSong("storms");
