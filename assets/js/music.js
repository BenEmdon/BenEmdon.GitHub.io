/*
  The music maker, rebuilt. Songs are MML: the text notation game
  music was actually composed in, one line per channel. The grid and
  the text are two views of one song; editing either rewrites the
  other.

  There is no live scheduler. The whole loop is rendered once with
  OfflineAudioContext into a single buffer, and playback is that
  buffer on loop, so the phone's main thread does nothing per note
  and cannot stutter it. An edit re-renders and swaps in at the
  loop boundary. Finished renders are kept in a persistent cache
  (render-cache.js, shared with the home page demo), so a repeat
  play on a later visit reads instead of rendering; a heavy song
  (a thousand notes or more) renders its channels in parallel
  across several offline contexts and mixes them, which the
  linearity of the chain makes exact.

  Two voice families. The chip voices are the fixed channels the
  old hardware had: pulse waves at real duty cycles (PeriodicWave,
  not plain square), a stepped 32-step triangle, and LFSR noise,
  with stepped envelopes and no reverb; they carry the DS battle
  theme's square leads, bass and drums. The rest is sample-based,
  as the N64 was: short recordings from VSCO-2 CE
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
import { animateWordmark, setUpStaticWordmark } from "./wordmark.js";
import { renderCacheKey, readRender, writeRender } from "./render-cache.js";

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
  const sceneButton = document.querySelector("[data-theme-scene-button]");
  if (!sceneButton) return;
  const sceneCurrent = document.querySelector("[data-theme-scene-current]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let mode = storedMode();
  let sceneCycleStarted = false;
  // The mode word beside the scene is a tap's receipt, not a permanent
  // readout: a tap shows it, it stays for about 2.5 seconds, then the
  // control is the picture alone again. The theme does not revert when
  // the word hides, and a fresh tap restarts the window.
  let sceneRevealed = false;
  let sceneRevealTimer;

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

  const sceneCanvas = document.querySelector("[data-theme-scene]");
  const themeScene = sceneCanvas
    ? createThemeScene(sceneCanvas, { dark: resolvedDark() })
    : null;

  function persistMode() {
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice holds this visit.
    }
  }

  // Where a scene click goes. The plain cycle is light, dark, system,
  // and back to light. One exception: the first click out of system
  // mode jumps to the opposite of whatever system is resolving to, so
  // the click always lands on a visible change; after that the plain
  // cycle runs from wherever it landed.
  function nextSceneMode() {
    if (!sceneCycleStarted && mode === "system") {
      return resolvedDark() ? "light" : "dark";
    }
    return nextMode(mode);
  }

  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    if (sceneCurrent) {
      sceneCurrent.textContent = mode;
      sceneCurrent.hidden = !sceneRevealed;
    }
    sceneButton.setAttribute(
      "aria-label",
      `Theme: ${mode}. Activate to switch to ${nextSceneMode()}`
    );
    themeScene?.setDark(resolvedDark(), reduced.matches);
  }

  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  // The picture is the control: clicking it advances the cycle, shows
  // the word, and restarts the word's window on every tap.
  sceneButton.addEventListener("click", () => {
    mode = nextSceneMode();
    sceneCycleStarted = true;
    sceneRevealed = true;
    persistMode();
    applyMode();
    clearTimeout(sceneRevealTimer);
    sceneRevealTimer = setTimeout(() => {
      sceneRevealed = false;
      applyMode();
    }, 2500);
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
  const themeToggle = document.querySelector("[data-theme-scene-button]");
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
  { name: "piano", kind: "sample", verb: 0.4,
    files: [[48, "piano-48.mp3"], [60, "piano-60.mp3"], [72, "piano-72.mp3"], [84, "piano-84.mp3"], [36, "piano-36.mp3"]] },
];
const AUDIO_BASE = "assets/audio/";

/* ---------- songs ---------- */

const SONGS = {
  storms: {
    title: "Song of Storms (Zelda)",
    text: `; Song of Storms: The Legend of Zelda: Ocarina of Time (N64, 1998)
; D minor, 6/8 at 190. The windmill hut music, transcribed
; from Metal Master's note-for-note MIDI (vgmusic.com):
; the melody on the ocarina sample, the bass on cello, the
; tambourine on noise. B is the reed organ part on strings,
; chords in full this time: the voicings come from The
; Ultimate Koopa's XG transcription of the same music,
; whose chord onsets and top notes match the line the last
; pass shipped at 12 of 14 chords. The other two onsets are
; single notes in that part too. Chord lengths follow it.
A @6 t190 v13 o4 d8 f8 o5 d2 o4 d8 f8 o5 d2 e4. f8 e8 f8 e8 c8 o4 a2 a4 d4 f8 g8 a2. a4 d4 f8 g8 e2.
B r4 @8 v9 o4 {dfa}4 {dfa}4. e8 {egb}2 r4 {fa>c}4 {fa>c}4. e8 {egb}2 r4 {dfa}4 {dfa}4 r4 {cfa}2 r4 {dfa}4 {dfa}4 r4 {c#ea}2
C @9 v12 o2 d2. e2. f2. e2. b-2. f2. b-2. a2.
D r4 @5 v5 o3 f#8 r8 f#8 r4 f#8 f#8 f#8 f#8 r4. f#8 r8 f#8 r4 f#8 f#8 f#8 f#8 r4. f#8 r8 f#8 r4 f#8 f#8 f#8 f#8 r4. f#8 r8 f#8 r4 f#8 f#8 f#8 f#4`,
  },
  lullaby: {
    title: "Zelda's Lullaby (Zelda)",
    text: `; Zelda's Lullaby: The Legend of Zelda: Ocarina of Time (N64, 1998)
; G major, 3/4 at 110. The first full statement of Zelda's
; Theme, from Aaron Marshall's MIDI of the theme
; (vgmusic.com). A is the flute, C is the harp part as
; written (it sits on two tracks in the file). B is the
; string section whole on one channel: violin, viola,
; cello and bass playing their chords together. The last
; pass split the strings into a top line and a cello line;
; that split is retired. Ends on the long high D.
A @7 t110 v13 o4 b2 o5 d4 o4 a2 g8 a8 b2 o5 d4 o4 a2. b2 o5 d4 a2 g4 d2 c8 o4 b8 a2. b2 o5 d4 o4 a2 g8 a8 b2 o5 d4 o4 a2. b2 o5 d4 a2 g4 o6 d1^2
B @8 v9 o4 {eg}2. {f#a}2. {eg}2. {f#a}2. {f#a}2. {eg}2. {eg}2. {df#}2. o3 {c>ceg}2. {c>cf#a}2. {c>ceg}2. {c>cf#a}2. o2 {b>b>f#a}2. {b->b->eg}2. {a>a>eg}2. o3 {d>df#}2.
C @10 v7 o3 c8 g8 o4 e2 o3 c8 a8 o4 f#2 o3 c8 g8 o4 e2 o3 c8 a8 o4 f#2 o2 b8 o4 d8 a2 o2 b-8 o4 c#8 g2 o2 a8 o4 c8 g2 o3 d8 o4 c8 f#2 o3 c8 g8 o4 e2 o3 c8 a8 o4 f#2 o3 c16 r16 g8 o4 e2 o3 c8 a8 o4 f#2 o2 b8 o4 d8 a2 o2 b-8 o4 c#8 g2 o2 a8 o4 c8 g2 o3 d8 o4 c8 f#2`,
  },
  saria: {
    title: "Saria's Song (Zelda)",
    text: `; Saria's Song: The Legend of Zelda: Ocarina of Time (N64, 1998)
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
D @5 v5 o3 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 r16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r8. f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 f#16 r16 f#16 f#16 r8 f#16 r16 f#16 r16 f#16 r16 f#16 r8. f#16`,
  },
  twinleaf: {
    title: "Twinleaf Town (Pokémon)",
    text: `; Twinleaf Town: Pokémon Diamond and Pearl (DS, 2006)
; F major, 4/4 at 80. The starting town's theme, from the
; NinSheetMusic piano arrangement (ninsheetmusic.org),
; split at middle C. The arrangement is written for
; piano, and both hands now play on the new piano
; sample; the last pass coloured the right hand as
; flute and the left as harp. The arrangement plays its
; form twice; one pass is kept, and it loops. The file
; is a human-playback export, so note starts were snapped
; to the step grid.
A @11 t80 v9 o4 {cg}4 o5 c4 o4 {cb}8 o5 c4 d8 o4 {c#>e}4 a-8 a8 c#8 b-4. {da}4 o5 d4 o4 {c#>c#}8 o5 d4 e8 o4 {c>f}4 f8 g4 a-4. {c>d}4 o5 c4 o4 {cg}8 o5 c4. o4 {cb}4 a4 {e>d}4 {c>e-}8 o5 e8 o4 d8 r8 o5 f4 o4 {da}4 o5 c4 o4 {db}8 c8 o5 c8 o4 d8 a4 {da-}4 g8 o5 c8 o4 b8 o5 c4 d8 e8 o4 g8 a4 o5 {cd}8 c2^8 o4 g8 o5 c8 o4 b8 o5 c4 o4 {c>d}8 o5 e8 g8 o6 c8 o4 c8 {g>>cd}8 o6 c4 o4 {f>f}8 {e>e}8 {d>d}8 o5 c4 o4 g8 o5 c8 o4 c8 o5 d4 c4. o4 g8 o5 d8 o4 c8 o5 c4 o4 g8 {ea}4 {c>c}4 o5 a4 f4 o4 b4 o5 d4 b4 a16 o4 c16 r16 d16 g16 e16 c16 r16 {e>c}16 c16 r8 {db}16 c16 o5 c8 o4 c16 r16 o5 a8 o4 {g>g}16 e16 r8 {e>e}16 c16 r8 {db-}4 a-4 a16 f16 c16 r16 {f>d}16 d16 r8 {c#>c#}8 o5 d4 o6 c16 o4 c16 o5 {da-}16 c16 o4 a-16 f16 {d>f}16 c16 r8 o5 c4 d4 e16 o4 c16 r16 e16 {g>f}8 o5 e8 c8 o4 g16 c16 d4 o5 d4 o4 {c>e-}8 o5 d8 c8 o4 a-4. o5 c1^2 o4 c8 c8 d8 d8 o5 f2 o4 {ceg}16 o5 c16 o4 c8 d8 f8
B r8 @11 v8 o3 e8 g8 e8 r8 e8 g8 e8 r8 e8 a8 c#8 r8 e8 a8 c#8 r8 f8 a8 f8 r8 f8 a8 f8 r8 f8 a8 f8 b8 f8 a-8 f8 r8 e8 g8 e8 r8 e8 a-8 e8 r8 e8 a8 e8 r8 a-8 r8 a-8 r8 f8 a8 f8 r8 f#8 a8 f#8 r4 g8 r8 g8 b8 r8 g8 o2 g8 o3 c8 o2 b8 o3 c4 g4. o2 f#8 o3 c8 o2 b8 o3 c4 a4. o2 g8 o3 c8 o2 b8 o3 c4 r4. g8 r4 b-4 r2 c8 f8 g8 r8 g8 f8 c4 c8 d8 g8 r8 g8 d8 c8 a4 r16 a16 r16 f16 c4 o2 a16 f16 r16 c16 o1 g16 o2 d16 r16 c16 o1 g16 o2 c16 d16 f16 g16 o3 c16 d16 f16 g16 r4. g16 r8 g16 e16 r8 g16 c16 r16 g16 e16 c16 r8 b-16 g16 r8 g16 e16 r16 b-16 g16 c16 b-16 a-16 e16 c8 r8 a16 r8 a16 f16 r16 a16 f16 d16 a16 f16 d16 r4. r16 a-16 f16 c4 f4 g16 r4. r16 e16 g16 r4. c16 f16 r16 a-16 r4 o2 a-16 o3 c16 r16 f16 a-4 o2 c8 c8 f8 f8 a-8 a-8 o3 c8 c8 f8 f8 g8 g8 r1 g8`,
  },
  route201: {
    title: "Route 201 (Pokémon)",
    text: `; Route 201: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 120, the tempo the arrangement is marked
; (Bouncy 120). From the NinSheetMusic piano arrangement
; (ninsheetmusic.org), split at middle C: right hand on
; the flute sample, left hand on harp. The arrangement
; states its 14-bar form twice, then tags an ending; one
; statement is kept, and it loops. Note starts were
; snapped to the step grid (human-playback export).
A r4 @7 t120 v9 o4 {ce}16 r4. r16 {cf}16 r4. r16 {dg}16 r4. r16 {cf}16 r8 o5 e16 {efg}8 {df}8 o4 {ce>ce}8 o5 {df}8 {ce}8 o4 {g>c}8 {ceg}8 r8 {fa}8 {eg}8 {cfa}8 {db}8 {e>c}8 o5 {cg}8 o4 {ce}16 r8 o5 f16 {fga}8 {eg}8 o4 {cf>fa}8 o5 {db}8 {e>c}8 {cg}8 o4 {ceg}8 e8 {d>f}8 {e>e}8 {f>d}8 {f#>c}8 {g>a}8 b8 {a>dg}16 o5 f16 o4 {g>e}16 o5 d16 o4 {fa>c}8 c16 r16 {fa>c}8 c16 r16 {eg>c}8 c16 r16 {eg>c}8 c16 r16 {gb>g}8 o5 f8 o4 {g>e}8 o5 d8 o4 {ce>e}8 o5 c8 o4 {eg}8 {c>d}8 {fa>c}8 c16 r16 {fa>c}8 c16 r16 {eg>c}8 c16 r16 {eg>c}8 c16 r16 {cg}8 o5 d8 o4 {g>e}8 o5 d8 o4 {cg}8 {c>c}16 g16 {e>c}16 o5 d16 o4 {c>e}16 o5 f16 o4 {c>g}16 f16 r16 c16 o5 c8 o4 {e>>c}8 d16 g16 r16 d16 {b>b}8 g8 {e>a}16 g16 o5 g16 o4 e16 o5 {ce}8 d8 o4 {c>e}16 e16 o5 c16 o4 c16 g8 {c>a}8 {f>g}16 c16 r16 f16 o5 c8 o4 {e>>c}8 a16 c16 r16 f16 {a>b}8 f8 {c>a}16 f16 o5 g8 {ce}16 o4 f16 o5 c16 o4 a-16 d8 {cg}8 {g>d}8 {b>c}8
B @10 v8 o3 c16 r16 c16 r8. g16 r16 c16 r16 c16 r8. a16 r16 c16 r16 c16 r8. b16 r16 c16 r16 c16 r8. a16 r16 c16 r16 c16 r8. g16 r16 e16 r16 e16 r8. g16 r16 f16 r16 f16 r8. a16 r16 c16 r16 c16 r8. g16 r16 f16 r16 f16 r8. a16 r16 c16 r16 c16 r8. g16 r16 f16 r16 f16 r4 r16 g16 r16 g16 r4 r16 f8 r8 f8 r8 c8 r8 c8 r8 g8 g8 a8 {gb}8 c8 g8 r8 c8 f8 r8 f8 r8 c8 r8 c8 r8 g8 g8 a8 {gb}8 c8 g8 r8 c8 f4. f8 g4. g8 e4. {eg}8 c4. e8 f4. f8 c4. c8 f8. c16 r8 f8 g16 r16 g16 r16 a16 r16 b16`,
  },
  jubilife: {
    title: "Jubilife City (Pokémon)",
    text: `; Jubilife City: Pokémon Diamond and Pearl (DS, 2006)
; 12/8. The big city's theme, from the NinSheetMusic
; piano arrangement (ninsheetmusic.org). The file marks
; 207 per quarter note, which is 69 per dotted-quarter
; beat; the song is written at t207 with the eighth note
; as the two-step unit, so one beat is a dotted quarter.
; Split at middle C: the right hand on the new piano
; sample (the last pass used flute; the part is the
; arrangement's chordal piano writing, and in the game
; the harmony rides on piano); the left hand's lowest
; note of each chord on cello, the rest of the chord on
; strings. The arrangement plays its form twice; one
; pass is kept. Starts snapped to the grid.
A @11 t207 v9 o4 {df#a}4. o5 a8 r8 o4 {df#a}8 o5 d8 r2 r8 g8 r4 f#8 r4 d8 o4 a8 r8 o5 e8 r4 o4 {c#e}4. o5 a8 r8 o4 {c#e}8 o5 d8 r2 r8 e8 r4 d8 r4 o4 a8 f#8 r8 b8 r4 a4 o5 d8 r4 d8 e4 d4 o4 a4 {df#b-}4 {df#b}8 r4 o5 d8 o4 {eg>e}8 b-8 {eg}8 o5 g8 r4 o4 {f#a>f#}4 {f#a>d}8 r4. g8 f#8 r8 o5 d8 r8 b8 o4 {a>df#a}4 {df#a}8 o5 g8 r4 o4 {gb>df#}4 {gb>d}8 o5 e8 d8 o4 {gb>de}8 {a>c#f#}4 {c#e}8 o5 d8 r4 g8 f#8 r8 d8 r8 o4 a8 o5 d8 r4 o4 a8 r4 o5 d8 r4 e8 f#8 g8 a4 d4 o4 {da}4 o5 a4 d4 o4 a4 o5 d8 r8 o4 d8 {df#a}4. o5 e8 r8 e8 o4 {f#a>f#}8 o5 e8 d8 o4 {f#>c#}4. {e>e}4 a8 {f#b}4. o5 d4 o4 a8 {a>c#}4. {c#eg>g}4 o5 c#8 o4 {a->d}4. {dfa->f}4 o5 b-8 o4 {ce-}4. o5 f4 o4 {ce-}8 o5 e-4. f8 e-8 a-8 b-4 b-8 o4 e-8 o5 a-4 o4 {ce-a-}4 o5 e-8 o4 {cb}8 o5 c8 o4 {e->c#}8 r4. o5 f4 o4 {ce-}8 o5 e-4. f8 e-8 a-8 b-4 b-8 o4 {ce-}8 o5 a-4 r4 e-8 o4 {e->c}8 o5 c#8 d8 e-4 e-4. o4 a-8 a-2 o5 c8 c#8 f4 e-4. o4 a-8 a-4 o5 c4 c#4 e-2 c8 e-8 a-4. o4 c4 c8 o5 b-4 o4 {ce-}4 o5 c8 o4 {ce->e-}8 o5 b-4. a-4. g4 a-4. a-4. g4 a-8 b-8 o6 c4. o5 g4 a-4 g4 a-8 b-4 g2^8 c8 c2. d8 r8 e8 o4 {df#a}4 o5 f#8 r4 g8 o4 {ceg}4.
B r1 r1 r1 @8 v8 o3 a4. r4 a8 r1 r1 r4 o2 {b>d}4 {b>d}8 r4. o3 {df#}4 {df#}8 r1 r1 r1 r1 r1 r1 r4. {df#b}4. r4. {df#b-}4. r4. {df#}4 r4 b4 r4 {df#}4 r2 {gb}8 r1 r2 a4. r4. {f#b}4. r1 r2 a-4. r4 a-8 r1 r8 a-4. r4. a-4 b-8 r2 r8 a-8 r1 r2 o2 {b->c#}4. o3 b-4 {gb-}8 o2 {b->c#}4. {a->c}4. {a->c}4. r4. {a->c}4 o3 c4. c2.^8 r4. {e-g}4 {e-g}8 r4. f#4 f#8 r2. o2 {a->c}4 {a->c}8 r4. {a->c}1^2 {e-gb-}4 {gb-}2 {a->c}2. o3 {gb}1^2
C @9 v10 o2 g4. r4 g8 r1 r8 g4. r4 g8 g8 r4 f#4. r4 f#8 r1 r8 f#4. r4 f#8 f#8 r4 e4 e8 r4. f#4 f#8 r4. b4 b8 r4. b-4 b-8 r4. g4. g8 d8 r8 g8 r8 g8 r2. g8 d8 r8 g8 r8 g8 r4. f#4 o3 a8 o2 f#8 c#8 r8 f#8 r8 f#8 r4. b8 r8 b8 r4. b-8 r8 b-8 r4. g4 g4 d4 g4 g4 b4 g4 g8 r4 g8 a4 a8 r4 a8 d4. o3 f#4. o2 d4. o3 d4. o2 a4. r4. b-4. r4. c#4. r4 c#8 r1 r8 o3 f4. r4. f4 a-8 o2 c#4. r4 c#8 r2. f4 f8 o3 a-4. o2 e-4 e-8 o3 g4 e-8 o2 c#4. c#4. f4. a-4. c#4 a-8 f4 a-8 a-4. f4. c4 c8 o3 c4 c8 o2 e-4 e-8 o3 e-4 e-8 o2 f4 o3 a-4. a-8 o2 e-4 e-8 r4. c#1^2 c4 e-2 f2. o3 c1^2 o2 b4. r4 b8 a4.`,
  },
  cynthia: {
    title: "Battle! (Champion Cynthia)",
    text: `; Battle! (Champion Cynthia): Pokémon Diamond and Pearl (DS, 2006)
; The champion battle theme, from a note-for-note rip of
; the game's own sequence data (vgmusic.com). The rip's
; first bar is silent setup; the music starts at its
; second bar. Its intro carries a tempo curve, 171 easing
; to 185; the song is written at the main tempo, 185.
; After a 7-bar intro the body loops, marked by the L.
; A: the two square-wave leads, on pulse 25%. B: the
; string tracks, as chords. C: the triangle bass; its
; lowest notes sit below this format's lowest octave and
; are written an octave up. D: the drum track, on noise,
; pitches kept as written, every hit one step long.
; E: the pulsing figure the theme opens with, on the
; new piano. The rip's GM map calls its track an
; orchestral harp, and the last pass played it on the
; harp sample; in the game that figure is the piano,
; so the whole track moves to piano here. F: the horn,
; orchestra hit and synth brass tracks, on strings.
; G: the agogo and guitar tracks, on pulse 50%. H: the
; rip's own piano track (marked bright acoustic piano
; in the rip), two fast runs late in the body, dropped
; by the last pass and restored on piano. Two tracks
; stay unused: one duplicates the bass, and one is a
; high piccolo line with no voice near it in the table.
; Note lengths were rounded to
; the step grid: the rip's notes are legato and overlap,
; and a channel here cannot ring past its next note.
A @1 t185 v13 o5 a-1^1 r1 r1 r1 r1 r1 L r1 r1 r2. o4 a-16 a16 o5 d16 e-16 a-2. f#8 a-8 a8 a-8 f#8 a8 a-4 g8 f8 f#2. f8 f#8 g8 f#8 f8 g8 f#4 e8 e-8 e2^8 o4 b8 o5 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o6 c8 c#2 o5 a-2. f#8 a-8 a8 a-8 f#8 a8 a-4 g8 f8 f#2. f8 f#8 g8 f#8 f8 g8 f#4 e8 e-8 o4 {b>e}8 a-8 b4. {b>e}8 {b>e}8 {a->a-}8 o5 {ea}8 o4 {b>a-}8 o5 {ea}8 {gb-}8 {a-b}8 e8 c#8 o4 b8 o5 {c#f#}8 o4 b-8 o5 c#4. {c#f#}8 {c#f#}8 o4 {b->b-}8 o5 {f#b}8 {c#b-}8 {f#b}8 {a->c}8 {b->c#}8 f#8 e-8 c#8 {e-a-}8 c8 e-4. {e->c}8 a-8 o6 {ce-}8 {cc#}8 o5 {a->c}8 o6 {c#e-}8 {cd}8 e-8 a-8 e-8 c#8 o5 {e->c}8 c8 e-4. {e->c}8 a-8 o6 {ce-}8 {cc#}8 o5 {a->c}8 {e->c#}8 {f>d}8 {a->e-}8 g8 f8 e-8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o4 b4. o5 f#4. e8 e-8 f#4 e8 e-8 o4 b4 a4 b4. o5 f#4. e8 e-8 f#4 e8 e-8 o4 b4 a4 o5 c4. g4. f8 e8 g4 f8 e8 c4 o4 g4 o5 c4. g4. f8 e8 g4 f8 e8 c4 o4 g4 r1 r1 r1 r1 r1 r1 r1 r1 o5 f#8 f1^1^1^2.^8
B @8 v9 o4 {a-a}1^1 r1 r1 r1 r1 r1 r1 r1 r2. o3 {e-a-}16 {ea}16 {a>d}16 {b->e-}16 o4 {e-a-}2. {c#f#}8 {e-a-}8 {ea}8 {e-a-}8 {c#f#}8 {ea}8 {e-a-}4 {dg}8 {cf}8 {c#f#}2. {cf}8 {c#f#}8 {dg}8 {c#f#}8 {cf}8 {dg}8 {c#f#}4 o3 {b>e}8 {b->e-}8 {b>e}2^8 {ea-b}8 {b>e}8 o4 {ea-}8 {f#a}16 o3 f16 {f#>ea-}16 g16 {a->f#a}16 a16 {b->gb-}16 b16 o4 {ca-b}16 o3 b16 b-16 a16 a-16 g16 f#16 f16 {f#>c#f#}2^8 {c#b->c#}8 o4 {c#f#}8 {f#b-}8 o3 {f#>a-b}16 g16 {a->f#b-}16 a16 {b->a-b}16 b16 o4 {ca>c}16 c#16 {db->c#}16 c#16 c16 o3 b16 b-16 a16 a-16 g16 o4 {e-a-}2. {c#f#}8 {e-a-}8 {ea}8 {e-a-}8 {c#f#}8 {ea}8 {e-a-}4 {dg}8 {cf}8 {c#f#}2. {cf}8 {c#f#}8 {dg}8 {c#f#}8 {cf}8 {dg}8 {c#f#}4 o3 {b>e}8 {b->e-}8 {b>e}2^8 {ea-b}8 {b>e}8 o4 {ea-}8 {f#a}16 o3 f16 {f#>ea-}16 g16 {a->f#a}16 a16 {b->gb-}16 b16 o4 {ca-b}16 o3 b16 b-16 a16 a-16 g16 f#16 f16 {f#>c#f#}2^8 {c#b->c#}8 o4 {c#f#}8 {f#b-}8 o3 {f#>a-b}16 g16 {a->f#b-}16 a16 {b->a-b}16 b16 o4 {ca>c}16 c#16 {db->c#}16 c#16 c16 o3 b16 b-16 a16 a-16 g16 {a->e-a-}2^8 {e->ce-}8 o4 a-16 e-16 {a->c}8 o3 {a->b->c#}16 a16 {b->a->c}16 b16 o4 {cb->c#}16 c#16 {db>d}16 e-16 {e>ce-}16 e-16 d16 c#16 c16 o3 b16 b-16 a16 {a->a->c}2^8 {e->ce-}8 o4 {e-a-}8 {a->c}8 o3 {a->b->c#}16 a16 {b->a->c}16 b16 o4 {cb->c#}16 c#16 {db>d}16 e-16 {e>ce-}16 e-16 d16 c#16 c16 o3 b16 b-16 a16 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o4 {b>cf#b}1^1 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 o5 {da>d}4 {cg>c}4 o4 {b>f#b}8 r2. r8 o1 {b>b}1 o4 b16 f#16 o3 a16 o4 b16 o5 b-16 f16 g16 o4 b16 o6 c#16 o5 e-16 g16 o4 g16 o5 c16 c#16 a16 o4 a16 o5 d16 g16 e16 f16 o6 e16 o5 f#16 o6 c16 o5 c16 a-16 o4 b16 o5 f#16 o4 a-16 d16 a-16 o5 d16 g16 {e-f#}8 {df}1^1^1^2.^8
C @4 v12 o1 e-4. r8 e-4. r8 e-4. r8 o2 e-8 e8 e-8 a8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 f8 o1 f8 o2 c#8 o1 f8 o2 c#8 o1 {f>e-}8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 f8 o1 f8 o2 c#8 o1 f8 o2 c#8 o1 {f>e-}8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 {f>>c#}8 o2 a-8 o1 {fb}8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8
D @5 v6 o2 c16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r8. c16 r8. c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {cb-}16 c16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {c>c#}16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 c16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 c16 c16 c16 c16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 {b->c#}16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 {b->c#}16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>c#}16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 c16 c16 c16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16
E r1 r2. r8 @11 v8 o2 a-16 a-16 o3 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 o2 b8 r4 b8 r4 b8 r4 b8 r4 b8 r8 b8 r8 o3 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 o2 b8 r4 b8 r4 b8 r4 b8 r4 b8 r8 b8 r8 o3 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r8 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 d8. r8. d8. r8. d8. r8. c#8. r8. c#8. r16 c#8. r16 e-8 r4 e-8 r4 e-8
F @8 v10 o5 c#1^1 o3 {a->a->a-}4. r1 r1 r1 r2 r8 {a->a->a-}4. r1 r1 r1 r1 r1 r1 r1 r1 r4 b8 o4 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o5 c8 c#2 r1 r1 r1 r1 r2 r8 o3 b8 o4 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o5 c8 c#2 o4 a-2^8 e-8 a-8 o5 c8 c#8 c8 c#8 d8 e-2 c2^8 o4 e-8 a-8 o5 c8 c#8 c8 c#8 d8 e-2 o4 e-2 c#2 a-4. f4. c#4 a-4. f4. c#4 o3 a-1 o5 e-2 c#2 o4 a-4. b-4. a-4 o5 c#4. f4. e4 f1 o2 {b>b>b}4. r1 r2 r8 {f#>f#>f#}4. r1 r2 r8 {g>g>g}4. r1 r2 r8 o3 {c>c>c}4. r1 r2 r8 o2 {b>b>b}4. r1 r2 r8 {g>g>g}4. r1 r2 r8 o3 {c>c>c}4. r1 r2 r8 {c>c>c}4. r1 r1 r1 r2 r8 o2 {b>b>b}4 r8 {b>b>b}4 r8 {b>b>b}4 r8 {b>b>b}4 r8 o4 {d>d}4 {c>c}4 o2 {b>b>b}4 r1 r1 r1 r2. o5 e-8 d1^1^1^2.^8 o3 {a->a-}4.
G @2 v9 o5 {e-a-}8 o4 {a>e-}8 a8 a-8 e-8 o3 b8 a-8 b8 o4 c8 e-8 a8 o5 c8 c#16 e-16 r16 f#16 a-16 a16 r16 b16 r1 r1 r1 r1 r8 o6 a-16 r16 a-16 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r2 r8. e-8 d8 e-8 r4 e8 r8 e-8 r1 c#8 c8 c#8 r4 d8 r8 c#8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 c8 g8 c8 g8 o5 c8 r8 o4 g8 r8 c8 g8 c8 g8 o5 c8 f8 o4 g8 o5 c8 o4 c8 g8 c8 g8 o5 c8 r8 o4 g8 r8 c8 g8 c8 g8 o5 c8 f8 o4 g8 o5 c8 o4 b8 f#8 o5 c8 o6 c8 o5 d8 o6 d8 o5 f#8 a8 o6 a8 f#8 c8 d8 c8 o5 a-8 f#8 d8 o2 b16 b16 b16 b16 b16 r16 b4^16 r16 b16 b16 b16 b16 b16 b16 b4. {f>g}8 o3 f8 o2 {a>b-}8 o3 e-8 o5 b4.^16 r16 b4.^16 r16 b4.^16 r1 r1 r2 r16 o4 c8 g8 f#8 e-8 c8 c#8 o3 b8 o4 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o3 b8 o4 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 r8 o6 a-16 r16 a-16
H r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 @11 v8 o5 d16 e16 f#16 a16 o6 c#16 e16 g16 a-16 o7 c#16 d16 c#16 c16 o6 a16 g16 e16 d16 o5 a16 o6 c16 d16 e-16 f#16 a-16 o7 c16 d16 c#16 e-16 c16 o6 a-16 o7 c16 o6 b16 f16 f#16`,
  },
  route209: {
    title: "Route 209 (Pokémon)",
    text: `; Route 209: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 85, the tempo in the file. From a note-for-note
; rip of the game's own sequence data (vgmusic.com).
; One intro bar plays once, then the 26-bar body loops,
; marked by the L; the rip states the body twice and
; the first statement is kept. Channels follow the
; rip's own instruments: A the piano and electric piano
; track on the piano sample, B the strings, C the
; electric bass on triangle, D the drums on noise,
; E the harp with the tubular bells folded in, F the
; flute, G the trombone and trumpet on strings, and
; H the cello line on the cello sample. Note lengths
; were capped at the next onset in each channel, and
; chord partners share the longest length in their
; group.
A @11 t85 v9 o6 b16 a16 e16 a16 b16 a16 e16 a16 b16 a16 e16 a16 e16 o5 b16 a16 e16 L a8 e8 a8 o6 c#16 d16 e8. f#16 e16 d16 c#16 o5 b16 o6 c#8 d8 c#8 o5 b8 a8 e8 a8 o6 c#16 d16 e8 o5 a8 e8 o6 c#16 d16 e16 d16 c#16 o5 b16 a8 e8 o6 c8 o5 b8 a16 e16 c16 d16 e8 a8 b8 a8 o6 a16 e16 e16 o5 a16 a16 e16 e16 o4 a16 a16 o5 e8 o4 a8 o5 e16 a16 o6 e16 a16 d16 d16 o5 a16 a16 d16 d16 a8 d4 d16 a16 o6 d16 a16 e16 {ef#a}16 o5 a16 {a>ea-}16 e16 {e>a}16 o4 a16 {a>a>c#}16 {e>e}16 {e>e>e}16 a16 {a>>b}16 o5 e16 {a>>e}16 o6 e16 {ab}16 d16 {df#a}16 o5 a16 {a>a-}16 d16 {d>a}16 o4 a16 {a>a>d}16 {d>f#}16 {d>>e}16 a16 {a>>b}16 o5 d16 {a>>e}16 o6 d16 o4 a8 r8 e8 o5 c#16 d16 e16 r16 f#8 e16 d16 c#16 o4 b16 a8 e8 a8 b4 o5 d8 c#8 o4 a8 b8 a8 e8 o5 c#16 d16 e8 f#8 e16 d16 c#16 o4 b16 a8 e8 a8 b4 o5 d8 c#8 o4 a8 a-8 a16 o5 f#16 a16 o6 c#16 o4 a-16 f#16 a-8 a16 o5 f16 a16 o6 c#16 o4 a-16 f#16 a-8 a16 o5 e16 e16 o6 c#16 o5 {a>e}16 o6 a8 r1 r1 r2 r16 o5 e8 b16 a8. e16 a16 b16 a8. e8 r1 r8. o6 b16 a16 e16 o7 c#16 d16 e16 o6 e16 a16 o7 e16 d16 c#16 o6 a16 e16 o4 {df#a>>d}16 o6 c#16 o5 a16 o4 {df#a>e}16 o5 d16 c#16 o4 a16 e16 a16 e16 o5 c#16 d16 e16 o4 {ea-b>a}16 o5 b16 o6 c#16 r8 o4 {c#ea}16 r8 {c#ea}16 r4 {ea-b}16 r8 {ea-b}16 r4 {f#a>c#}16 r8 {f#a>c#}16 r4 {ab>e}16 r16 {ab>e}16 {ab>e}16 r16 {c#ea}16 r16 {c#ea}16 r8 {c#ea}16 {c#ea}16 r16 {egb}16 r16 {egb}16 r8 {ef#a}16 {ef#a}16 r16 {f#a>d}16 r16 {df#a}16 r8 {df#a}16 {df#a}16 r16 {eab}16 r16 {ab>e}16 r16 {eab}16 {eab}16 {eab}16 r16 {c#ea}16 o6 b16 a16 e16 a16 b16 a16 e16 a16 b16 a16 e16 a16 e16 o5 b16 a16 e16 o6 b16 a16 d16 a16 b16 a16 d16 a16 b16 a16 d16 a16 d16 o5 b16 a16 e16
B r1 @8 v10 o4 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 a16 e16 a16 o5 e16 d16 c#16 o4 a16 e16 f16 c16 f16 a16 o5 c16 f16 c16 a16 o4 g16 d16 g16 b16 o5 d16 g16 d16 b16 r1 r1 r1 r1 r4 o3 e4 a4 b8 a4. d4 a4 b8 a4. e4 a4 b8 o4 c#4. o3 a4 a-4 o4 c#8 a-8 {f#a>c#}8 {f#a>c#}8 r4 {fa>c#}8 {fa>c#}8 r4 {ea>c#}8 {ea>c#}8 r8 {f#a>c#}8 r2 {a>d}16 r16 {a>d}16 {a>d}16 {f#a}16 {a>d}16 r16 {f#a}16 {b>e}16 r16 {b>e}16 {b>e}16 {a-b}16 {b>e}16 {ea-}16 {a-b}16 o5 {cf}16 r16 {cf}16 {cf}16 o4 {a>c}16 o5 {cf}16 r16 o4 {a>c}16 o5 {dg}16 r16 {dg}16 {dg}16 o4 {b>d}16 o5 {dg}16 r16 {e-a-}16 {ea}4 o4 b8 a4 e8 a16 e8. r1 r1 r1 r1 r1 r1 r1 r1 r4. o3 a8 d8 o2 b8 a8 e8
C r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 @4 v11 o1 a16 a8 r4 r16 o2 c#16 c#8 r4 r16 d16 d8 r4 r16 e16 e8 r4. o1 a16 a16 a16 r16 a16 o2 c#16 o1 a16 r16 o2 c#16 c#16 c#16 r16 e16 f#16 e16 r16 d16 d16 d16 r16 d16 a16 f#16 r16 e16 e16 e16 r16 e16 b16 a-16
D @5 v10 o2 d8 d8 d8 d16 d16 d8 d8 d8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 d8 d8 {d>a}8 d16 d16 {c>a}8. c16 d8 a-4 {da-}8 c16 d16 a-16 c16 {c>a}8. c16 d8 a-4 {da-}8 c16 d16 a-16 c16 c8 b-8 o3 c16 c16 o2 a-16 d16 b16 b16 a-16 d16 f16 f16 a-16 d16 c8 d8 o3 d16 o2 d16 a-16 d16 o3 c16 o2 d16 a-16 d16 g16 b16 a-16 g16 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 o4 a4 o2 c8 c8 f#8 o1 a8 o2 c8 c8 f#8 o1 a8 o2 c8 c8 d16 d16 {cb-}4. d16 d8 d16 c4 o3 a8 o2 f#16 d16 c4 o3 a8 o2 f#16 d16 c4 o3 a8 o2 f#16 d16 c4 o3 a8 o2 f#16 d16 c8. o3 c#8. r4. o2 d16 d8. c8 c8 d16 c8. o1 a8 o2 c8 d16 c8. c8 c8 d8 c8 c8 c8 d8 c8 r8 c8 d8 c8 a-8 {db-}8 {ca-}16 {db-}16 o1 a16 a16 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 o1 b16 o2 a-16 o1 a16 o2 a-16 f#16 a-16 o1 a16 o2 a-16 d8 d8 d8 d16 d16 d8 d8 d8 d16 d16 d8 d8 d8 d16 d16 d8 d8 d8 d16 d16
E r8 @10 v9 o3 e8 a8 b8 o4 c#8 e8 a8 o5 c#8 a2 o6 c#4 e8 o5 a2^8 o6 c#4 e8 o5 a2^8 o6 c#4 e8 o5 a2^8 o6 c4 o5 b4 r8 o3 {e>>c#}16 e16 {a>>e}16 a16 o4 {c#>a}16 c#16 {e>b}16 e16 {a>>c#}16 a16 {b>>e}16 b16 o5 {c#>a}16 c#16 r8 o3 {f#>>d}16 f#16 {a>>f#}16 a16 o4 {d>a}16 d16 {f#>b}16 f#16 {a>>d}16 a16 {b>>f#}16 b16 o5 {d>a}16 d16 c#1 r1 r4 o4 {ea-}4 r4 {a-b}4 r4 {a>c#}4 r4 {b>c#}4 r4 {ea-}4 r4 {a-b}4 r4 {a>c#}4 r4 {a->c#}4 r1 r1 r1 r1 o5 a1 a8 o3 {a>e}8 r16 {a>e}16 r4 o4 {df#}8 r16 {df#}16 r8 {ea}8 r16 {ea}16 r1 r1 r1 r1 r1 r2. r8 o3 e8 a8 b8 o4 c#8 e8 a8 o5 c#8 r8 o3 f#8 a8 o4 d8 f#8 a8 b8 o5 d8
F r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 @7 v10 o5 a8 e8 a8 o6 c4 o5 b8 a8 b4 b8 a2 r1 r4 a16 e16 r16 a16 r8 o6 c#16 d16 e16 f#16 r16 e16 r16 d16 c#16 o5 b16 a16 e16 r16 a16 r8 o6 d16 c#16 r16 o5 a16 r16 e16 e16 a16 b16 a16 r16 e16 r16 a16 r8 o6 c#16 d16 c#16 o5 b16 a16 e16 r16 a16 o6 c#16 d16 e16 e16 r16 o5 a16 r8 o6 f#16 e16 c#16 o5 a16 r16 e16 r16 o6 d16 c#16 o5 a16 b16 a1^4^16
G r1 @8 v9 o3 {a>c#}8 {a>c#}16 {a>c#}16 {ea>c#}8 {a>c#}16 {a>c#}16 {a->c#}8 {a->c#d}16 {a->c#}16 {a->c#e}8 {a->c#a}8 {a>c#}16 r16 {a>c#}16 {a>c#}16 {a>c#e}8 {a>c#}16 {a>c#}16 {a>c#}8 {a>c#d}16 {a>c#}16 {a>c#e}8 {a>c#a}8 {a>d}16 r16 {a>d}16 {a>d}16 {a>de}8 {a>d}16 {a>d}16 {a>e>c#}8 {a>e>d}16 {a>e}16 {a>e>e}8 {a>ea}8 {a>c}16 r16 {a>c}16 {a>c}16 {a>ce}8 {a>c}16 {a>c}16 {b>db}8 {b>d>c}16 {b>d}16 {b>db}8 {b>da}1^2^8 r1 r1 r1 r1 r1 r1 r1 r1 r8 o4 e8 a8 a-8 {da}8 o3 {a>e}16 o4 d16 a16 o3 a16 o4 {da-}8 e16 r16 o3 {b>a}16 o4 e16 b16 o3 b16 o4 {e>c}8 f16 r16 {cb}16 f16 o5 c16 o4 c16 {f>d}8 g16 r16 {d>c}16 g16 o5 d16 o4 d16 {g>e}1^8
H r1 @9 v10 o2 a4 a4 a-4 a-4 f#4 f#4 e4 e4 d4 d4 c#4 c#4 f4 f4 g4 g4 o1 a1^2. r4 a4. r2 r8 a4. r2 r8 a16 r16 a16 r8. a16 r16 o2 c#16 r16 c#16 r8. c#16 r16 d16 r16 d16 r8. d16 r16 e16 r16 e16 r8. e16 r16 o1 a16 r16 a16 r8. a16 r16 o2 c#16 r16 c#16 r8. c#16 r16 d16 r16 d16 r8. d16 r16 c#16 r16 c#16 r8. c#16 r4 r16 f#4 r4 f4 e8 e8 r8 e-8 r2 d8 d8 r16 a16 r16 o3 d16 o2 e8 e8 r16 b16 r16 o3 e16 o2 f8 f8 r16 o3 c16 r16 f16 o2 g8 g8 r16 o3 d16 r16 a-16 o1 a2.^16 o2 a8. o1 a8 r16 a4.^16 o2 d4 e8 o1 a8 r16 a4.^16 r4. a8 r16 a4.^16 r8. o2 e16`,
  },
  eterna: {
    title: "Eterna City (Pokémon)",
    text: `; Eterna City: Pokémon Diamond and Pearl (DS, 2006)
; 6/8, from the NinSheetMusic piano arrangement
; (ninsheetmusic.org), split at middle C: both hands
; on the piano sample, since the arrangement is
; written for piano. The sheet is marked at a dotted
; quarter of 87, which is 130.5 per quarter note; the
; song is written at t130. The arrangement's second
; half is a varied restatement of the first; the first
; statement, 65 bars, is kept, and it loops. The file
; is a human-playback export, so note starts were
; snapped to the step grid. Lengths were capped at the
; next onset in each channel, and chord partners share
; the longest length in their group.
A r1 r1 r1 @11 t130 v9 o5 f#4 a8 b4 o6 d8 e-16 e4^16 f#4. a8 e1 r4. e8 f16 f#8. e8 f8 f#8 a4. o7 c16 c#4^16 o6 b8 f#8 f8 o4 {d>>f#}2^8 d8 r4 {d>>a}16 o6 b-16 b8 d8 r8 d2. o5 b8 o6 d8 e8 a-16 a4^16 g8 a8 g8 f16 f#16 f8 f#8 o4 e-8 r4 o6 d4. o5 b8 o6 c#8 d8 c#16 d4^16 f8 e8 d8 e-16 e16 e-8 e8 o4 d8 r4 c#2. r4 {ea}8 {df#b}4 {a>d}8 {b>e}16 {b->e-}16 {b>e}8 o5 f#16 e16 o4 {ea>d}4 {b>e}8 o5 {ea}8 o4 {b>e}8 o5 {c#f#}16 o4 c#16 {f#a}4. r4. {eg}8 {c#f#}8 e8 o5 {c#f#}8 {c#f#}4 o4 {c#f#b>e}8 o5 {cf}8 {c#f#}8 {c#b-}4. o4 {c#f#>e>c#}4. o5 {f#b}8 o4 {b>f#}8 {db->f}8 {b>f#}2^8. f#16 {b>d}4 o5 a16 b-16 {gb}8 o4 {b>d}8 r8 {dgb>d}16 {b->c#}16 {b>d}2^8 {c#egb}8 {a>c#}8 o5 {c#e}8 {a-a}16 {ea}4^16 {dg}8 {ea}8 {dg}8 {ff#}16 o4 {b>f#}4^16 {d>da-b}8 {b>f#}8 {a>e}8 {b>d}4. {gb}8 {a>c#}8 {g>d}8 {f#>c#}16 o5 d16 o4 e8 d8 {b->f}8 {a>e}8 {gb->d}8 {f#a>d}4. g4 a8 {dg}4. {cd}16 e16 f#16 g16 a-16 a16 b-2. o5 c4. o4 c8 b-16 a16 g8 a8 d4 a8 o5 f#8 r8. o4 {cda}16 r8 {cda}8 {eg}8 {df#}8 a16 g16 {ab-}2. o5 c4. o4 c8 b-16 a16 g8 a8 o5 f16 f#4^16 o4 f#8 r16 g16 {a-a}16 f#16 r16 d16 r4 c16 d16 e16 g16 {ab-}2. o5 c4. o4 c8 b-16 a16 g8 a8 g16 o5 f#8. g8 o4 {f#>f#}8 o5 e8 d16 o4 {c>e-}8. c8 {c>c}8 b8 a8 {db}16 d16 g8 o5 g16 o4 d16 r8 c#4 d16 d16 r8 c#8 g16 a16 f#16 g16 e16 g16 {ab-}8 a8 g8 o5 g8 o4 c#16 r4 r16 d16 r16 d8 r8 d16 r16 {d>f#}16 {e>g}16 o5 {dea}4. o4 {dea}8 {dea}16 r4. r16 d16 {de}16 {eg}16 {ga}16 {a>d}16 o5 {de}16 {eg}16 {da-}16 {c#a}4. o4 {c#e}4 r8 o5 a-16 g16 f#8 e8 o4 {c#>c#}8 b8 a4 r2 d8 e-16 e8. f#16 {de}16 e4 f#8 a8 b8 f#8 e8 e-8 e2.^16 d16 {ef#}8 e8 d8 c#16 d1 d16 {ef}8 e8 d8 r2. c4 d8 d2.
B @11 v8 o2 d4 a8 o3 {df#}8 r8 o2 a8 d4 a8 {b>f#}8 b-8 a8 d4 a8 o3 {df#}8 r8 o2 a8 d4 a8 {b>f#}8 b-8 a8 d4 a8 o3 {df#}8 r8 o2 a8 d4 a8 {b>f#}8 b-8 a8 e4 b8 o3 {eg}8 r8 o2 b8 e8 b8 o3 e8 {eg}8 r8 o2 e8 f#4 o3 c#8 {f#a}8 r8 c#8 o2 f#4 o3 c#8 {f#a}8 r8 c#8 o2 b4 o3 f#8 b8 r8 f#8 o2 b8 o3 f#8 b8 o2 a4 o3 b8 o2 g4 o3 d8 {gb}8 r8 d8 o2 e4 b8 o3 {eg}8 r8 o2 b8 f#4 o3 c#8 {f#a}8 r8 c#8 o2 b8 o3 f#8 a8 b8 r8 f#8 o2 e4 b8 o3 {eg}8 r8 o2 b8 g8 o3 d8 g8 {gb-}8 r8 o2 g8 a8 o3 d8 e8 a8 r8 e16 o2 a16 o3 {ea}2. o2 d8 a8 o3 d8 a4. o2 e8 b8 o3 e16 g16 b4. o2 f#8 o3 c#8 f#8 r4. o2 e8 b8 o3 e16 b8. r8 b8 o2 f#8 o3 c#8 f#16 a4^16 c#8 o2 f#8 b-8 o3 e16 b-4.^16 o2 b8 o3 f#8 b8 o2 a4 o3 e8 o2 a-8 o3 d8 b8 r4 o2 e8 g8 o3 d8 g16 b4^16 d8 o2 g8 o3 c#8 a8 r4 c#8 o2 a8 o3 e8 g16 o2 b-16 o3 {egb-}4^16 o2 b16 o3 {df#a}4^16 e16 {a-b}4. o2 g8 o3 d8 g8 b2. o2 g8 o3 d8 g8 o2 d4. o3 g4 e16 d16 a4. f#4. o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {egb-}8 {egb-}8 {egb-}8 o2 a8 g8 d8 a8 d4. d8 c16 o3 c16 r8 c8 b-8 a8 {cga}8 o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {egb-}8 {egb-}8 {egb-}8 o2 b-8 o3 c8 o2 d8 a8 o3 d8 a8 r8 o2 d8 c16 o3 c16 r8 {ca}16 f#16 {egb-}16 a16 {df#}8 {cga}8 o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {dgb-}8 {dgb-}8 o2 g8 o3 {egb-}8 {egb-}8 {egb-}8 o2 a8 a8 d8 a8 o3 d8 a8 r8 d8 e-16 {f#a}16 r8 {f#a}8 a8 {gb}8 {f#a}8 {gb}16 {gb}16 e8 r16 {gb}16 e8 {gb}4 {egb}16 o2 {e>gb}16 r8 {e>gb}8 o3 d8 o2 e8 o3 {dgb}8 o2 g8 o3 {egb-}16 d16 g16 b-16 o2 g8 o3 {gb-}16 d16 b-8 o2 g8 o3 {gb-}16 d16 {gb-}8 o2 g8 o3 b16 g16 b16 r16 o2 a8 o3 a16 o2 a16 o3 a16 o2 a16 a8 o3 g16 o2 {a>a}16 o3 g16 o2 a16 {a>d}16 o3 e16 {eg}16 {ga}16 a16 r4. r16 o2 a8 o3 e8 a8 r4 {ea}8 o2 a8 o3 c#8 e8 a8 r8 o2 {a>e}8 d8 o3 f#8 o2 {a>a}8 o3 {df#b}4 o2 a8 d4 a8 {b>f#}8 b-8 a8 e4 b8 o3 {eg}8 r8 o2 b8 e8 b8 o3 e8 {eg}8 r8 o2 e8 g4 o3 d8 {gb}8 r8 d8 o2 g8 o3 d8 g8 {gb}8 r8 d8 o2 g4 o3 d8 {gb-}8 g8 {db-}8 o2 g8 b-8 o3 e8 {gb-}8 r8 o2 g8 d4 a8 o3 {df#}8 r8 o2 a8`,
  },
  canalave: {
    title: "Canalave City (Pokémon)",
    text: `; Canalave City: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 94, the tempo the arrangement is marked
; (Magico, quarter = 94). From the NinSheetMusic piano
; arrangement (ninsheetmusic.org), split at middle C:
; both hands on the piano sample, since the arrangement
; is written for piano. After a one-bar opening the
; arrangement states its form twice; the opening and
; the first statement are kept, and it loops. The file
; is a human-playback export, so note starts were
; snapped to the step grid. Lengths were capped at the
; next onset in each channel, and chord partners share
; the longest length in their group.
A r1 r16 @11 t94 v9 o4 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 o4 c#16 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 o4 c#8 e8 a8 b16 e16 {a>c#}4 {a-b}8 {a>c#}8 c#8 {b>d}8. a-16 o5 {c#e}8 o4 a-4 {c#f#}8 {e-a-}8 e8 {c#e}8 {e->c#}8 {c#d>d}8 {gb>e}4 f#8 e8 c#8 o5 e8 o4 {df#>f#}8 {c#>c#}16 {ef#}16 {a>c#e}4 {da>d}4 {c#f#>c#}4 {a>e}4 {fa>d}4. {b>e}8 c8 r8 {ca>d}8. c#16 {ea>c#}4^16 a16 o5 {c#ea}8 o4 {c#a-}8. a8 f#8. {e-f#b}4^16 b16 o5 {e-f#a}8 o4 {e-a-}8. a16 b16 f#8. a8 a-8 f#8 a-8 e8 e8 {d>e}8 o5 d16 o4 c#16 {ea>c#}4 {a-b}8 {a>c#}8 c#8 {b>d}8. a-16 o5 {c#e}8 o4 a-4 {c#f#}8 {e-a-}8 e8 {c#e}8 {e->c#}8 {c#>d}8 {gb>e}4 b8 b-8 {c#>c#}8 {b>e}8 {d>df#}8 {c#a>c#}16 f#16 {a>c#e}4 {f#>d}4 {df#>c#}8 c#16 {a>e}16 e16 {f>d}16 d16 f16 {a>d}8 {fa}8 {a>d}8 {b>e}8 {c>df}8. {b>e}8. {a>d}16 e16 {a>c#}4 {ea}8 o5 {da-}8 o4 c#8 o5 {ea}4^16 o4 e-16 {f#b}4. {e-f#}8 {b>a-}8. o5 {e-a}8 o4 {a>f#}8. {f#a}4. {ea-}16 {e-f#}16 {ea-}4 r16 c#16 {e-ef}16 {f#a-}16 a8 c16 e16 g16 e16 c16 r16 d16 r16 b8 g16 f8 g4 d4 {df}16 r16 {df}16 {ce}16 r16 {df}16 {ce}8 c16 f8. c16 f16 c16 r4 g16 a16 g16 f8 d16 {c#e}16 {df}8 f#16 g8 b-8 c#16 c#16 r8. g8 a-16 {cea}16 {ce}16 r16 c8. e-16 {ce}16 {ce}8 {d>d}16 o5 e16 o4 {f>d}16 o5 c16 o4 {db}16 o5 d16 o4 {ce>c}8. {cd}8. {cd}16 r4. b16 a16 b16 {cg>c}8. {cf}8. e16 {cf}16 e8. d16 o5 c16 o4 b16 a16 b16 {g>c}8. f8. e16 {fg}16 {eg}8 d8 c#16 d16 g16 b16 {cf>c}16 {cf}8 c8. {fb}16 {cf#>c}16 {dg>d}4. b16 g16 b16 {ea}16 {a>c#}16 o5 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 o4 c#16 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 r16 o4 {ea}16 o5 c#16 {c#b}16 o4 c#16 {a>e}16 o5 b16 {a>c#}16 c#16 o4 {b>e}16 a16 {e>c#}16
B r2. r8 @11 v8 o2 e8 {a>a}8 o3 e8 a8 b8 r8 a8 b8 e8 o2 a8 o3 e8 a8 b8 r8 a8 b8 e8 o2 a8 o3 e8 a8 b8 r8 a8 b8 e8 c#8 a-8 r2. o2 g8 o3 d8 b8 b-8 r8 b8 r4 o2 f#8 o3 d8 a8 b8 r8 b8 {ab}8 d16 a16 o2 f8 o3 d8 a8 b4 b8 a8 d8 o2 e8 o3 e8 a8 b8 r8 b8 a8 e16 b16 o2 e-8 b8 o3 f#8 b8 r8 b8 f#8 a8 o2 e8 b8 o3 f#8 e8 a-8 f#8 a8 a-8 o2 a8 o3 e8 a8 b8 r8 a8 b8 e8 c#8 a-8 r2. o2 g8 o3 d8 b8 b-8 r8 b8 r4 o2 f#8 o3 d8 a8 b8 r2 o2 f8 o3 d8 a8 b8 r8. b8. a8 o2 e8 o3 e8 a8 b8 r8 b8 a8 e8 o2 e-8 b8 o3 f#8 f8 a-8 f#8 b8 a8 o2 e8 b8 o3 f#8 e8 a-8 f#8 o2 {dg>a}16 o3 b16 r8 o2 {f>f}16 {f>fa}16 r16 {c>c}8. {f>f}16 {f>fa}16 r16 o3 b16 o2 {f>g}16 o3 d16 o2 b8 {f>eg}16 b16 {f#>e-f#b-}16 {g>egb}16 r16 {e>egb}4 {g>gb-}16 r16 {g>gb-}16 {c>cb-}16 r16 {g>gb-}16 {c>cgb-}8. {d>d}16 {d>df}16 o3 a16 o1 {a>a}8. o2 {c#>c#a}16 {d>df}16 o3 b16 {fg}16 o2 {g>g}16 o3 {df}16 f16 o2 {g>d}8. o3 {cb-}16 {cb}16 r16 {f#b-}16 {gb}16 r16 {ce-f#}16 {ceg}16 {c#gb-}16 {c#gb-}16 {gb-}16 o2 {g>gb-}8. {e>e}8 {f>f}16 {f>f}16 r16 {c>ca}8. {f>fa-b}16 {f>fg}16 {f>fa}8 o3 {db}8 {a-b}8 {ea-}8 o2 {a>a}8. o3 {cf#}8. o2 {g>g}16 o3 {df#a}8. {f#a}8 {f#a}8 {dfab}8 {da}8. o2 {a>a}8. o3 {c#a-b}16 {da}16 {a-b}8. {fa}4^16 {egb}8. o2 {b>gb}8. o3 {e-f#b-}16 {egb}16 {gb}8 {gb}8 {f#b-}16 {gb}8. o2 {f>a}16 {f>a}8 o3 {cfa}8. {fgb}16 {ga}16 {db}2 o2 a8 o3 e8 a8 b8 r8 a8 b8 e8 o2 a8 o3 e8 a8 b8 r8 a8 b8 e8`,
  },
  snowpoint: {
    title: "Snowpoint City (Pokémon)",
    text: `; Snowpoint City: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 104, the tempo the arrangement is marked
; (Distant, quarter = 104). From the NinSheetMusic
; piano arrangement (ninsheetmusic.org): the file's
; main voice on A, its accompaniment on B, and its
; two sparse upper voices together on C, all on the
; piano sample, since the arrangement is written for
; piano. The arrangement states its form twice; one
; statement is kept, and it loops. The file is a
; human-playback export, so note starts were snapped
; to the step grid. Lengths were capped at the next
; onset in each channel, and chord partners share the
; longest length in their group.
A @11 t104 v9 o5 a-8 r4. a8 r4. d8 r4. e-8 r4. b8 r4. o6 c#8 r4. o5 g8 r4. a-8 r4. a8 r2. r8 e-8 r2. r8 a-2 a2 d2 e-2 b2 o6 c#2 o5 g2 a-2 a2 c#2 e2 e-2 b2 o6 c2 o5 g2 a-2 a2 c#2 e2 f#2 r4 o6 e16 e16 o5 {eb}16 {eb}16 {a>e}16 {a>e}16 {eb}16 {eb>e}16 {eb}16 {eb}16 {a>e}16 {a>e}16 {eb}16 {eb}16 {a>e}16 a16 {ea>e}16 {ea>e}16 {eb}16 {eb}16 {a>e}16 {a>e}16 {eb}16 {eb}4^16 r8 o6 e16 e16 c16 r16 o5 a16 a16 f#8 e16 r16 c16 c16 o4 a16 r8. o5 b16 b16 a16 r16 e16 e16 o4 b8 a16 r16 e16 e16 o3 b16 r8. o6 e16 e16 c#16 r16 o5 a16 a16 a-8 e16 r16 c#16 c#16 o4 a16 r8. o5 b16 b16 a16 r16 e16 e16 o4 b8 a16 r16 e16 e16 o3 b16 r8. o6 e16 e16 o5 b16 r16 g16 g16 o6 e16 e16 o5 b16 r16 g16 g16 f#16 r8. o6 c16 c16 o5 a16 r16 f#16 f#16 o6 c16 c16 o5 a16 r16 f#16 f#16 e16 r8. o4 e16 e16 o3 {b>f#}16 r16 o4 {ea}16 {ea}16 {f#b}16 r16 {a>e}16 a16 {b>f#}16 {b>f#}16 {a>e}16 {a>e}16 r8 b16 b16 {a->e-}16 r16 {b>e}16 {b>e}16 o5 {ea-}16 r16 {eb}16 e16 {a->e-}16 {a->e-}16 {eb}16 r16 o7 e16 c#16 o6 b16 a-4^16 e16 c#16 o5 b16 a-4^16 o6 b16 a-16 f#16 e-4^16 o5 b16 a-16 f#16 e-4^16 o7 e-16 c16 o6 b-16 g4^16 e-16 c16 o5 b-16 g4^16 o6 b-16 g16 f16 d4^16 o5 b-16 g16 f16 d4^16 o7 c#16 o6 b-16 f#16 f16 c#16 o5 b-16 f#16 f2^16 o7 c#16 o6 b-16 f#16 f16 c#16 o5 b-16 f#16 f2^16 o7 e-16 c16 o6 a-16 g16 e-16 c16 o5 a-16 g2^16 o7 e-16 c#16 o6 b-16 f#16 f16 c#16 o5 b-16 f#2^16 o7 c16 o6 b-16 f16 e-2.^16 o5 a4 r2. o4 {a->e}4 r2. {a>f#}4 r2. o5 e4 r1 r2. r8 o6 e16 e16 r8 e16 e16 r8 e16 r16 e16 e16 r4 e16 e16 r8 e16 e16 r8 e16 r16 e16 e16 r4 e16 e16 r8 e16 e16 r8 e16 r16 e16 e16 r8 e8 r16 e16 e8 r16 e16 r16 e16 e16 r4 e16 e8 r16 e16 e8 r16 e16 r16 e16 e16 r4 e16 e8 r16 e16 e8 r8. e16 e16 r4 e16 e8 r16 e16 e8 r16 e16 r16 e16 e16 r4 e16 e16 e16 r16 e16 e16 e16 r16 e16 r16 e16 e16 r4 e16
B r1 r1 r1 r1 r1 r1 r8 @11 v8 o4 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 r16 {f#a>c#e}16 {f#a>c#e}16 r4 o3 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 r16 {ab>e-f#}16 {ab>e-f#}16 r4 {a-b>df}16 {a-b>df}16 r8 {a-b>df}16 {a-b>df}16 r8 {a-b>df}16 r16 {a-b>df}16 {a-b>df}16 r4 o4 {c#fa-b}16 {c#fa-b}16 r8 {c#fa-b}16 {c#fa-b}16 r8 {c#fa-b}16 r16 {c#fa-b}16 {c#fa-b}16 r4 o3 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 r16 {f#a>c#e}16 {f#a>c#e}16 r4 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 r16 {ab>e-f#}16 {ab>e-f#}16 r4 {a-b>e-f}16 {a-b>e-f}16 r8 {a-b>e-f}16 {a-b>e-f}16 r8 {a-b>e-f}16 r16 {a-b>e-f}16 {a-b>e-f}16 r4 o4 {c#fa-b}16 {c#fa-b}16 r8 {c#fa-b}16 {c#fa-b}16 r8 {c#fa-b}16 r16 {c#fa-b}16 {c#fa-b}16 r4 o3 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 {f#a>c#e}16 r8 {f#a>c#e}16 r16 {f#a>c#e}16 {f#a>c#e}16 r4 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 {ab>e-f#}16 r8 {ab>e-f#}16 r16 {ab>e-f#}16 {ab>e-f#}16 r8 o5 e2 r2 o4 b2 o5 e2 o3 {a>cef#}2 r2 {eab>e}2 r2 {a>c#ea-}2 r2 {a-b>e-e}2 r2 {gb>ef#}2 r2 {f#a>ce}2 r2 o2 {b>ef#a}2 r2 o3 {a-b>e-e}2 r2 o5 {c#ea-b}8 o4 {b>c#ea-}4. {b>c#ea-}8 {a-b>c#e}4. {a-b>e-f#}8 {f#a-b>e-}4. {f#a-b>e-}8 {e-f#a-b}4. o5 {ce-gb-}8 o4 {b->ce-g}4. {b->ce-g}8 {gb->ce-}4. {gb->df}8 {fgb->d}4. {fgb->d}8 {dfgb-}4. o3 {ff#b->c#}1 o4 f#2 a-4.^16 o3 a-16 o4 {ce-b-}1 o3 {b->c#f}2.^8. {e-f}16 {b->cf}1 {a>c#ea-}4 r2. {eb>e-}4 r2. {eb>e-}4 r2. {a-b>e-e}4 r2. o4 b8 r4. o5 a8 r4. a-8 r4. e8 r4. o4 a8 r4. o5 e8 r4. o4 b8 r4. o5 f#8 r4. e4 r2. e16 e16 o4 b16 r16 o5 b16 r4 r16 b16 r16 e16 e16 r8 o4 b16 r16 o5 b16 b16 e16 r16 e16 e16 o4 b16 r16 o5 b16 r16 b16 b16 e16 r16 e16 e16 o4 b16 r16 o5 b16 r4 r16 b16 r16 e16 e16 o4 b16 r16 o5 e8
C r8 @11 v9 o5 a-4. r8 a4. r8 d4. r8 e-4. r8 b4. r8 o6 c#4. r8 o5 g4. r8 a-4. r8 a4. r2 r8 e-4. r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r2 a2 a-2 e2 o4 b2 o5 a2 a-2 e2 o4 b2 o5 e2 o4 b8 o5 e8 g8 f#8 f#2 e8 c8 o4 a8 f#8 r1 r1 r1 r1 r1 r1 r2 c#2 r1 r1 c#2 f#2 r1 r1 r1 r1 r1 r8 b4. r8 o5 a4. r8 a-4. r8 e4. r8 o4 a4. r8 o5 e4. r8 o4 b4. r8 o5 f#4. r8 b16 b16 e16 r16 e16 e16 o4 b16 r16 o5 b16 r16 b16 b16 e16`,
  },
  hearthome: {
    title: "Hearthome City (Pokémon)",
    text: `; Hearthome City: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 150, the tempo the arrangement is marked.
; From the NinSheetMusic piano arrangement
; (ninsheetmusic.org), split at middle C: both hands
; on the piano sample, since the arrangement is
; written for piano. The arrangement states its form
; twice with a short ending; the first statement is
; kept, and it loops. The file is a human-playback
; export, so note starts were snapped to the step
; grid. Lengths were capped at the next onset in each
; channel, and chord partners share the longest length
; in their group.
A @11 t150 v9 o4 c8 c8 o6 c8 o4 {c>c}8 r8 {c>>c}8 o5 c8 r4. o6 c8 o5 c8 r8 o6 c8 o5 c8 r8 o4 {d>>c}8 r4 {d>>c}8 r4 {d>>c}8 r4 g8 {b>e-g}4. g8 a8 g8 o5 c8 o4 g8 o5 d8 c8 r8 {ce}8 o4 {g>f}8 {f#>f#}8 {g>g}8 {a>a}8 g8 {ga>c}8 r8 c8 r4 {ce>g}8 {ce}8 o5 c8 o4 a8 o5 {cd}8 o4 {a>c}8 r8 o5 c8 o4 {ce->g}8 o5 c8 o4 {f>d}8 o5 c8 r8 o4 {b>e-g}8 g8 o5 c8 c8 o4 g8 o5 d8 c8 r8 {ce}8 f8 f#8 g8 {cda}8 r8 c8 r8 d8 o4 {d>c}8 a-8 {g>e}8 r8 {e>c}8 r8 o5 d8 o4 {g>c}8 c8 {e>c}8 o5 g8 {cf}8 o4 {g>ce}8 o5 f8 r8 o4 {gb>dg}8 o5 c8 d8 a8 r4 o4 {a>a}8 o5 {cg}8 o4 {d>a}8 g8 {a>e}8 r8 o5 {eb}8 r8 a8 o4 {a>cg}8 o5 f8 o4 {g>ce}8 o5 d8 o4 {fa>c}8 r8 o5 f8 e8 r8 o4 {g>c}8 {a>d}8 {g>c}8 g8 o5 {cb}8 e8 a8 g8 {cf}8 o4 {a>e}16 a-16 {g>d}8 {c>c}8 g8 o5 d8 o4 {g>c}8 a8 {b>d}8 o5 {ce}8 {df}8 o4 {gb>g}8 {gb>a}8 o5 {gb}8 {ce>c}8 r8 o4 {g>e}8 e16 f16 {g>f}8 o5 {cg}4 o4 {a>ce-g}4 {a>ce-g}8 {a>ce-a}8 g8 o5 {cg}8 g8 {c>c}8 b8 {cg}8 o4 b8 {ce}8 {df}8 {e-f#}8 {eg}8 c8 {e>c}8 g8 o5 {cd}8 o4 {c>c}8 r8 {c>c}8 r8 {eg}8 r8 o5 c8 o4 {b>d}8 o5 c8 o4 {b>d}8 o5 {ce-}8 o4 {f#>e}8 a8 {c>c}8 e8 o5 d8 o4 {f#>c}8 a8 {c>c}8 d8 o5 e8 o4 e8 {e>c}8 {f#>d}8 {a>c}8 {f#b}8 {a>c}8 {eg}8 c8 {d>c}8 c8 o5 d8 o4 {c>c}8 g8 {c>c}8 r8 o5 {ce}8 o4 g8 {c>c}8 {a->d}8 {d>d}8 r8 {f>c}8 o5 e8 o4 e8 o5 d8 o4 d8 o5 {ce}8 {df}8 r8 {eg}8 r8 {g>d}8 r8 {b->e}8 {a>d}8 {g>c}8 r4 o6 {ce}8 r8 o5 {a>c}8 r8 {fg}8 {a>d}8 r8 {f>c}8 r8 o6 {ce}8 {ce}8 o5 {a->c}8 {f>d}8 {a->c}8 r4 o6 {ce}8 r8 o5 {g>c}8 r8 {eg}8 {g>d}8 r8 {e>c}8 r8 {b->e}8 {b->e}8 {g>c}8 {e>d}8 {g>c}8 r4 {a>cf}8 r8 {a>e}8 r8 {a>c}8 {fa}8 r8 {a>c}8 r8 {b>g}4 {g>e-}8 {e-b}8 o4 {b>g}8 o6 e-8 d8 o4 {cegb}8 r8 {cegb}8 r4 {cegb}8 r8 {cegb}8 r8 {c#fa->c}8 r8 {c#fa->c}8 {c#fa->c}8 r8 {c#fa->c}8 r8 {cegb}8 r8 {cegb}8 r4 {cegb}8 r8 {cegb}8 r4 {gb>e-}4. g8 a8 g8
B @11 v8 o3 {df}8 {df}8 r8 {df}8 r8 {df}8 r4 {c#fb}8 {c#fb}8 r8 {c#fb}8 r8 {c#fb}8 r4 {cg}8 r4 {cg}8 r4 {cg}8 r4. o2 g2. c8 g8 o3 {ceg}8 r8 o2 d8 o3 d8 r4 o2 e8 o3 {ceg}8 r2 e8 o2 e8 o3 {fa}8 {fa}8 r8 f8 r2 {fa-}8 r8 f8 f8 r8 g4 o2 g8 o3 c8 o2 c8 r8 c8 r8 d8 o3 d8 r8 o2 e8 o3 a-8 e8 r8 o2 e8 a-4 r8 f8 r8 f8 r8 o3 c8 o2 f8 r8 f8 r8 o3 c8 o2 f8 r4 g4 r8 f8 o3 c8 {fa}8 o2 f8 r8 o3 {gb}8 r8 o2 g8 e8 r8 o3 {egb}8 o2 a8 o3 {ea}8 o2 a8 o3 {eg}8 o2 g8 f8 o3 c8 {fa}8 {fa}8 b8 o2 g8 r8 g8 r8 c8 o3 {ce}8 r4. o2 g8 f#8 f8 r8 o3 {cfa}8 o2 f8 r8 {g>dg}8 r8 g8 {e>e}8 {e>e}8 r8 {a>a}8 r2 f4 f4 r8 f8 r8 f8 r8 {g>dg}8 r8 {g>dg}8 {g>dg}8 c8 d8 e-8 c8 r8 c8 r8 g8 c8 o3 b8 o2 c8 r8 c8 r8 c8 g8 c8 g8 a-8 a8 r8 d8 r8 a8 d8 r8 d8 r8 {a>a}8 r8 d8 a8 g8 f#8 g8 d8 r8 g8 r8 a8 g8 r8 g8 r8 g8 r8 f8 e8 e8 r8 a-8 b-8 r8 g8 r8 b-8 o3 c8 r8 e8 r8 o2 g8 r8 o3 c8 o2 g8 c8 d8 e8 f8 r4 f8 r8 c8 r8 c8 r8 f8 r8 f8 c8 r8 c8 r8 e8 r4 e8 r8 g8 r8 g8 r8 a8 r8 a8 c#8 r8 c#8 r8 d8 d8 r8 a8 r8 d8 a8 r4. c#8 b2^8 c8 r4 c8 g8 r4 g8 c#8 r4 c#8 a-8 r4 a-8 c8 r4 c8 g8 r4 g8 r8 o1 b8 o2 g2.`,
  },
  pokecenter: {
    title: "Pokémon Center (Pokémon)",
    text: `; Pokémon Center: Pokémon Diamond and Pearl (DS, 2006)
; 4/4 at 116, the tempo the arrangement is marked.
; From the NinSheetMusic piano arrangement of the
; daytime center theme (ninsheetmusic.org), split at
; middle C: both hands on the piano sample, since the
; arrangement is written for piano. The file states
; its 20-bar form twice; one statement is kept, and
; it loops. The file is a human-playback export, so
; note starts were snapped to the step grid. Lengths
; were capped at the next onset in each channel, and
; chord partners share the longest length in their
; group.
A @11 t116 v10 o4 e8 r8 e8 b8 r8 a8 r16 a-8 r16 f#8 e-8 r2. e-8 r8 e-8 a-8 r8 f#8 r16 e-8 r16 e8 a-8 r8 e-16 e16 r2 e8 r8 e16 b8 r8. a8 r8 a-8 f#16 e-8 r4 c16 c#8 r4. e-8 r8 e-16 a-8 r8. f#8 r8 e-8 e-16 e8 r4. e16 a-16 b16 e16 a-16 b16 o5 e16 a-8 o4 {a-b}16 r8 {a-b}8. o5 b8 o4 {a-b}16 r8 {a-b}8. o5 a8 o4 {a>c#b}8 o5 a16 o4 {a>c#}16 o5 a-8 f#8 o4 {a>c}16 r8 {a>c}8. {b>e-}16 b16 r16 {f#b}16 r16 {f#b}8. {f#>cf#}16 {f#>c}16 r16 o5 {e-f#}16 r16 {e-f#}8. {c#ea-}16 {c#e}16 a16 o4 {a->c#}16 o5 a-16 o4 {a->c#}16 o5 f#8 o4 {a->de}16 {a->d}16 r16 {eb}16 r16 {eb}16 r16 {a->e}16 o5 a-8 a-8 r8 b8 r8 b4 r8 a8 a-8 a8 b8 o4 {b->e>c#}16 {g>c#}16 {eb-}16 e16 c#8 r8 o5 b16 b8 r16 a8 a-8 a4 r4 a-8 a8 a-8 f#8 e8 a-8 o4 {a->b}16 b16 o5 {e>e}16 a-16 {a>e}8 r16 {e>c#}16 r8 {e>c#}8 r8 {e>c#}8 {a>e}8 {a>e}8 {a->e}8 r16 {eb}16 r8 {eb}8 r8 {eb}8 r16 {a->e}16 r16 {a->e}16 {f#>e-}8 {f#>e-}8 {f>d}8 {e>c#}8 r8 {eb}8 r8 {ea-}8 {e-a}8 {f#b}8 {b>e-}8 {a->e}8 r8 b8. o4 b8.
B @11 v8 o2 e8 {e>b}8 f#16 a-16 r16 e16 r16 e16 b8 r16 c#8 o1 b16 o2 e-8 e-8 f#16 b16 r16 e-16 r16 e-16 {b>f#b}8 r16 {c#>f#b}8 o1 b16 o2 f#8 o3 b16 o2 f#16 a16 b16 r16 f#16 r16 e-16 b8 r16 o1 b8 o2 e-16 e8 e8 a-16 b16 o3 b-16 o2 {e>b}16 r16 {e>gb-}16 {b>a-b}16 o1 b16 o3 {e-g}16 o2 {e>ea-}8 o1 b16 o2 e8 {e>b}8 a-16 b16 r16 e16 r8 e8 r16 e16 c#16 o1 b16 o2 e8 e8 a16 o3 c#16 r16 o2 {e>a-}16 o3 a8 o2 {e>e-a-}16 o3 {ea}16 r16 o2 {e>ce}16 {c#>c#}16 o1 {a>a}16 o2 f#8 o1 {b>>b}8 o2 a16 b16 r16 o1 b16 o2 e-8 o1 b8 o2 a16 b16 r16 o1 b16 o2 e16 e16 r16 f#16 r16 a-8 e16 o3 b16 o2 e16 b8 b16 c#8 e-16 e16 r8 e16 b16 r8 b16 f16 r8 f16 b16 r16 o3 f16 o2 b16 f#16 r8 f#16 o3 c#16 r8 c#16 o2 e16 r8 e16 o3 c16 r16 e16 c16 o1 b16 b16 o3 e-16 o2 f#16 o3 e-16 o2 f#16 o1 b16 o3 e-16 o2 c16 c16 o3 e-16 o2 f#16 o3 e-16 o2 f#16 c16 o3 e-16 o2 c#16 c#16 o3 e16 o2 a-16 o3 e16 o2 a-16 c#16 o3 e16 o1 b16 o2 d16 e16 b16 e16 a-16 b16 o3 d16 e16 e16 r16 o2 b16 r16 e8 r16 o3 d16 d16 r16 o2 b16 r16 e8 r16 a16 a16 e16 e16 a16 a16 o3 c#16 c#16 o2 b-8 r16 o3 b-16 g16 e16 c#16 o2 b-16 b8 b8 o3 e16 f#16 r16 o2 b16 r16 a16 o1 b16 o2 f#16 o1 b16 o2 e16 o1 b16 o2 a16 b8 b8 a16 b16 r16 f#16 e16 e16 o1 b16 o3 e16 r16 o2 b16 e16 b16 a16 a16 r16 o3 c#16 r8 o2 e8 a16 a16 r16 o3 c#16 r8 o2 e8 a-16 a-16 r16 b16 r8 e8 a-16 a-16 r16 b16 r8 o3 e8 o2 {b>b}8 {b>b}8 {b->b-}8 {a>a}8 r8 {a->a-}8 r16 e8 e16 b16 b16 r8 f#16 b16 r16 e16 r16 e16 r16 o3 e16 r16 o2 b16 o1 b16 o2 b16`,
  },
};

/* ---------- MML parser ---------- */

// The subset, whole: one line per channel, starting with its
// letter A-H. Notes a-g, # or + sharp, - flat, an optional length
// (1, 2, 4, 8, 16) and dots; r rests; ^ ties the next length onto
// the last note; o sets the octave, < and > move it; l sets the
// default length; v volume 0-15; @ instrument; t tempo; [ ]n
// repeats a passage; L marks where the loop restarts (everything
// before it plays once, as an intro). { } sounds its notes
// together, as one chord with one length: {ceg}4. Inside the
// braces only note letters, accidentals, and < > octave steps
// (local to the chord) may appear. ; starts a comment.
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
  // Notes are written out one step-group at a time: everything
  // sounding from the same step is one event, spelled as a chord
  // when it holds more than one pitch. When a group's tones run
  // for different lengths, the group takes the shortest length
  // and the longer tones re-enter as a fresh group where the
  // short ones end, so the text re-reads as the same events in
  // the same groups.
  const pending = ch.notes.map((n) => ({ ...n }));
  const byStepThenPitch = (a, b) => a.step - b.step || a.midi - b.midi;
  pending.sort(byStepThenPitch);
  while (pending.length) {
    const step = pending[0].step;
    const group = [];
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].step === step) group.unshift(pending.splice(i, 1)[0]);
    }
    group.sort((a, b) => a.midi - b.midi);
    if (step > cursor) {
      parts.push(emitLen("r", step - cursor, false));
      cursor = step;
    }
    const first = group[0];
    if (first.inst !== curInst) { parts.push(`@${first.inst}`); curInst = first.inst; }
    if (withTempo && tempo !== null) { parts.push(`t${tempo}`); tempo = null; }
    if (first.vol !== curVol) { parts.push(`v${first.vol}`); curVol = first.vol; }
    const minLen = Math.min(...group.map((n) => n.len));
    if (group.length === 1) {
      const oct = Math.floor(first.midi / 12) - 1;
      if (oct !== curOct) { parts.push(`o${oct}`); curOct = oct; }
      parts.push(emitLen(PC_NAME[first.midi % 12], minLen, true));
    } else {
      // The chord's home octave is its lowest tone's; the tones
      // ascend from there, stepping octaves inside the braces.
      // The channel's own octave is the home octave afterwards:
      // in-brace steps are local, as the parser reads them.
      const baseOct = Math.floor(group[0].midi / 12) - 1;
      if (baseOct !== curOct) { parts.push(`o${baseOct}`); curOct = baseOct; }
      let inner = "", prevOct = baseOct;
      for (const n of group) {
        const oct = Math.floor(n.midi / 12) - 1;
        while (prevOct < oct) { inner += ">"; prevOct++; }
        while (prevOct > oct) { inner += "<"; prevOct--; }
        inner += PC_NAME[n.midi % 12];
      }
      parts.push(emitLen(`{${inner}}`, minLen, true));
    }
    cursor = Math.max(cursor, step + minLen);
    for (const n of group) {
      if (n.len > minLen) {
        pending.push({ ...n, step: step + minLen, len: n.len - minLen });
      }
    }
    pending.sort(byStepThenPitch);
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
  const rate = Math.pow(2, (n.midi - root) / 12);
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  src.connect(g);
  const p = g.gain, peak = (n.vol / 15) * 0.85;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + 0.008);
  let stopAt = t + dur + 0.1;
  if (inst.name === "piano") {
    // A long press, simulated. The other sampled voices are faded
    // to zero at the written end of the note; the piano is not.
    // Its gain stays at peak past the written end and the
    // recording's own decay becomes the release, so the note
    // rings until the sample itself runs out and later notes
    // sound over the ring, the way they do with the damper pedal
    // down. The ring can never outlast the recording: 3.6 s of
    // sample, stretched or squeezed by the shift from the
    // nearest root. One short fade across the recording's last
    // 0.12 s keeps a sample that was trimmed before it fully
    // decayed from clicking off.
    const ringEnd = t + buf.duration / rate;
    p.setValueAtTime(peak, Math.max(t + 0.008, ringEnd - 0.12));
    p.linearRampToValueAtTime(0, ringEnd);
    stopAt = ringEnd + 0.1;
  } else {
    p.setValueAtTime(peak, Math.max(t + 0.008, t + dur - 0.07));
    p.linearRampToValueAtTime(0, t + dur + 0.02);
  }
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
  src.stop(stopAt);
}

/* ---------- renderer ---------- */

// The whole loop, rendered once. Playback is then a single
// looping buffer source: nothing is scheduled live, ever.
//
// One graph builder serves both render paths: it wires the
// chain (master gain, one convolver send, the chip kit) and
// schedules the given channels' notes, in order. The single
// render builds it with every channel; the parallel render
// builds it once per bin of channels, in separate contexts.
//
// beforeChannel, when given, is called with a channel's
// index and the count of noise draws accounted for so far,
// and returns how many further draws it consumed; the
// parallel builder uses it to keep the seeded draw sequence
// aligned with the single render's (see buildBinGraph).
function buildOfflineGraph(song, chanIdxs, sr, beforeChannel) {
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
  let noiseAccounted = 0;
  for (const ci of chanIdxs) {
    if (beforeChannel) noiseAccounted += beforeChannel(ci, noiseAccounted);
    for (const n of song.channels[ci].notes) {
      const t = n.step * stepDur, d = n.len * stepDur;
      if (INSTRUMENTS[n.inst].kind === "sample") scheduleSample(ctx, outs, n, t, d);
      else scheduleChip(ctx, master, kit, n, t, d);
      if (INSTRUMENTS[n.inst].kind === "noise") noiseAccounted++;
    }
  }
  return ctx;
}

function renderResult(song, buffer, renderMs) {
  const stepDur = 60 / song.tempo / 4;
  const dur = song.steps * stepDur;
  return {
    buffer, dur, stepDur,
    loopStart: song.loopStep * stepDur,
    loopDur: dur - song.loopStep * stepDur,
    renderMs,
  };
}

async function renderSong(song) {
  const sr = 44100;
  const ctx = buildOfflineGraph(
    song, song.channels.map((_, i) => i), sr, null);
  const t0 = performance.now();
  const buffer = await ctx.startRendering();
  return renderResult(song, buffer, performance.now() - t0);
}

/* ----- channel-parallel rendering, for heavy songs ----- */

// The chain is linear (gains and one convolution, nothing
// that squashes), so a song's channels can be rendered in
// separate offline contexts at the same time and summed:
// the mix is the same audio, summed in a different order.
// Splitting is gated to heavy songs, because each context
// pays for its own full-length convolver and the light
// songs measure flat or slower split. Channels are packed
// into balanced bins by note count, at most one context
// per hardware thread (capped at 8), so no context carries
// much more than its share. Each finished bin is mixed in
// and released on arrival, which keeps peak memory near
// the mixed buffer plus one bin instead of every bin.
const PARALLEL_MIN_NOTES = 1000;
const PARALLEL_SEED = 0x9e3779b9;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How many Math.random draws the single render has spent on
// noise-note offsets by the time it reaches channel chanIdx:
// one per noise note in the channels before it. (The reverb
// impulse is the only other draw, and it comes first.)
function noiseDrawsBefore(song, chanIdx) {
  let c = 0;
  for (let i = 0; i < chanIdx; i++) {
    for (const n of song.channels[i].notes) {
      if (INSTRUMENTS[n.inst].kind === "noise") c++;
    }
  }
  return c;
}

function planBins(song) {
  const maxBins = Math.max(1, Math.min(
    navigator.hardwareConcurrency || 4, 8, song.channels.length));
  const bins = Array.from({ length: maxBins }, () => ({ chans: [], notes: 0 }));
  const bySize = song.channels
    .map((ch, i) => ({ i, n: ch.notes.length }))
    .sort((a, b) => b.n - a.n);
  for (const c of bySize) {
    let lightest = bins[0];
    for (const b of bins) if (b.notes < lightest.notes) lightest = b;
    lightest.chans.push(c.i);
    lightest.notes += c.n;
  }
  return bins
    .filter((b) => b.chans.length)
    .map((b) => b.chans.sort((a, b) => a - b));
}

// One bin's graph, built under a seeded Math.random, the
// method the render-lab harness verified: with the seed
// reset per bin, the reverb impulse is drawn identically in
// every bin (and as in a seeded single render), and before
// each channel the generator is fast-forwarded past the
// noise draws of the channels that precede it in the song
// but are not in this bin, so every noise note's offset
// lands where the single render put it. The result is that
// the parallel mix matches the single render to float
// rounding, and a heavy song renders the same way every
// time. Math.random is restored before this returns; graph
// building is synchronous, so nothing else can interleave.
function buildBinGraph(song, bin, sr) {
  const realRandom = Math.random;
  Math.random = mulberry32(PARALLEL_SEED);
  try {
    return buildOfflineGraph(song, bin, sr, (ci, accounted) => {
      const skip = noiseDrawsBefore(song, ci) - accounted;
      for (let i = 0; i < skip; i++) Math.random();
      return skip;
    });
  } finally {
    Math.random = realRandom;
  }
}

function makeStereoBuffer(frames, sr) {
  try {
    return new AudioBuffer({ length: frames, numberOfChannels: 2, sampleRate: sr });
  } catch {
    return new OfflineAudioContext(1, 1, sr).createBuffer(2, frames, sr);
  }
}

async function renderSongParallel(song) {
  const sr = 44100;
  const stepDur = 60 / song.tempo / 4;
  const frames = Math.ceil(song.steps * stepDur * sr);
  const bins = planBins(song);
  const ctxs = bins.map((bin) => buildBinGraph(song, bin, sr));
  const mixed = makeStereoBuffer(frames, sr);
  const t0 = performance.now();
  await Promise.all(ctxs.map((ctx, i) =>
    ctx.startRendering().then((buf) => {
      for (let ch = 0; ch < 2; ch++) {
        const acc = mixed.getChannelData(ch);
        const d = buf.getChannelData(ch);
        for (let f = 0; f < frames; f++) acc[f] += d[f];
      }
      ctxs[i] = null; // release the bin as soon as it is mixed in
    })
  ));
  return renderResult(song, mixed, performance.now() - t0);
}

// The render entry point everywhere below: parallel for
// heavy songs, the plain single render otherwise, and the
// single render again if anything in the parallel path
// fails.
async function renderSongBest(song) {
  const notes = song.channels.reduce((a, c) => a + c.notes.length, 0);
  if (notes >= PARALLEL_MIN_NOTES && planBins(song).length > 1) {
    try {
      return await renderSongParallel(song);
    } catch {
      // A failed context or a refused buffer falls back to
      // the single render for this song, as if never split.
    }
  }
  return renderSong(song);
}

/* ----- obtaining a render: cache first ----- */

// A render, from wherever it comes: the persistent cache if
// this exact song has been rendered on an earlier visit, a
// fresh render (written through to the cache) otherwise.
// The status line hears the difference through the result's
// fromCache flag, so a cache hit never claims a render time.
// announce is for the foreground play path; a background
// re-render while a loop is playing leaves the status alone.
async function obtainRender(song, { announce = true } = {}) {
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
  if (announce) setStatus("rendering…");
  const rendered = await renderSongBest(song);
  writeRender(key, rendered);
  return rendered;
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
    player.rendered = await obtainRender(player.song);
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
      followPlayhead(step);
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
  obtainRender(parsed, { announce: false }).then((rendered) => {
    if (player.song === parsed && player.playing) {
      player.pending = rendered;
      window.__lastRender = rendered;
    }
  });
}

/* ---------- page ---------- */

const textEl = document.querySelector("[data-song-text]");
const gridEl = document.querySelector("[data-grid]");
const panelEl = document.querySelector(".music-panel");
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
    msg += player.rendered.fromCache
      ? " · from cache"
      : ` · rendered in ${Math.round(player.rendered.renderMs)} ms`;
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

function followPlayhead(step) {
  // While a song plays, the grid panel follows the playhead.
  // When the current step would leave the visible part of the
  // panel, the panel jumps so the step sits 12 steps in from
  // the panel's left edge, the same offset the home page demo
  // uses. The jump is a plain scroll assignment: no animated
  // scrolling, and the panel only ever moves sideways. When
  // playback stops the panel stays where it is.
  if (!panelEl || step < 0) return;
  const cells = gridState.cellsByStep.get(step);
  if (!cells || !cells.length) return;
  const panelRect = panelEl.getBoundingClientRect();
  const cellRect = cells[0].getBoundingClientRect();
  const w = cellRect.width;
  if (!w) return;
  const x = cellRect.left - panelRect.left + panelEl.scrollLeft;
  const lead = 12 * w;
  const viewL = panelEl.scrollLeft;
  const viewR = viewL + panelEl.clientWidth;
  if (x < viewL + lead || x + w > viewR) {
    panelEl.scrollLeft = Math.max(0, x - lead);
  }
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
    // A channel is one voice, but a voice may sound a chord:
    // notes that start together are partners, and a new span
    // never cuts a partner that shares its first step. Anything
    // else under the new span is cut back or removed, and the
    // new note stops at the next one.
    const s = fresh.step, e = fresh.step + fresh.len;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n === fresh) continue;
      if (n.step === s) continue;
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
    notes.sort((a, b) => a.step - b.step || a.midi - b.midi);
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
  if (panelEl) panelEl.scrollLeft = 0;
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

// The wordmark gets the home page's own treatment, wired the
// way main.js wires it: the stepped boot reveal starts once
// the block-glyph font is ready, and wordmark.js splits the
// art into fixed cells and runs its scan on pointer devices.
// On touch devices the scan never runs, so wordmark.js does
// the split statically instead, after the same font wait:
// fixed cells at the measured glyph width, spaces included,
// which is what keeps the letters from merging together in
// a phone browser.
const wordmark = document.querySelector(".wordmark");
document.fonts.ready.then(() => wordmark?.classList.add("is-booting"));
animateWordmark(wordmark, window.matchMedia("(prefers-reduced-motion: reduce)"));
if (wordmark && !window.matchMedia("(hover: hover)").matches) {
  setUpStaticWordmark(wordmark);
}

setUpThemeToggle();
setUpKeys();
loadSong("storms");
