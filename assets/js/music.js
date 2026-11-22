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
import { renderCacheKey, readRender, writeRender, verifyRenderData } from "./render-cache.js";
import { runBoot, registerTask } from "./boot.js?v=20261122m";

/* ---------- boot ---------- */

// The boot's zero: this page's task durations and the follow-up
// indicator's total both measure from the top of the module.
const bootT0 = performance.now();

// The clock's first tick, handed to the boot where the page
// starts up below.
let resolveClockTask;
const clockTask = new Promise((resolve) => { resolveClockTask = resolve; });

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
  const controlEls = document.querySelectorAll("[data-theme-scene-control]");
  if (!controlEls.length) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let mode = storedMode();
  let sceneCycleStarted = false;

  const resolvedDark = () =>
    mode === "dark" || (mode === "system" && systemDark.matches);

  // The same little landscape the home page masthead wears, drawn by
  // the same module: day in light, night in dark, swapped cell by
  // cell. It lives twice on the page, masthead and footer system
  // line, and one mode drives both. Each control keeps its own
  // painter and its own word window: the mode word beside a scene is
  // a tap's receipt, not a permanent readout, and the receipt shows
  // where the tap landed. The theme does not revert when the word
  // hides, and a fresh tap restarts the window on the control that
  // was tapped.
  const controls = [...controlEls].map((controlEl) => {
    const canvas = controlEl.querySelector("[data-theme-scene]");
    return {
      button: controlEl.querySelector("[data-theme-scene-button]"),
      current: controlEl.querySelector("[data-theme-scene-current]"),
      scene: canvas
        ? createThemeScene(canvas, { dark: resolvedDark() })
        : null,
      revealed: false,
      revealTimer: undefined,
    };
  });

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
    for (const control of controls) {
      if (control.current) {
        control.current.textContent = mode;
        control.current.hidden = !control.revealed;
      }
      control.button?.setAttribute(
        "aria-label",
        `Theme: ${mode}. Activate to switch to ${nextSceneMode()}`
      );
      control.scene?.setDark(resolvedDark(), reduced.matches);
    }
  }

  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  // The picture is the control: clicking it advances the cycle, shows
  // the word beside that picture, and restarts that word's window on
  // every tap.
  for (const control of controls) {
    control.button?.addEventListener("click", () => {
      mode = nextSceneMode();
      sceneCycleStarted = true;
      control.revealed = true;
      persistMode();
      applyMode();
      clearTimeout(control.revealTimer);
      control.revealTimer = setTimeout(() => {
        control.revealed = false;
        applyMode();
      }, 2500);
    });
  }

  applyMode();
}

/* ---------- clock ---------- */

// The footer system line is the same on every page, this one
// included: Ottawa, and Ottawa's time. Mirrors the home page's clock
// in main.js: his time, not the reader's (the footer says Ottawa),
// and landed on the minute rather than drifting a second past it.
function setUpClock() {
  const clock = document.querySelector("[data-clock]");
  const clockTime = document.querySelector("[data-clock-time]");
  const hours = document.querySelector("[data-clock-hours]");
  const minutes = document.querySelector("[data-clock-minutes]");
  if (!clock || !clockTime || !hours || !minutes) return;

  const inOttawa = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  function tick() {
    const now = new Date();
    const parts = Object.fromEntries(
      inOttawa.formatToParts(now).map(({ type, value }) => [type, value])
    );
    hours.textContent = parts.hour;
    minutes.textContent = parts.minute;
    clockTime.dateTime = `${parts.hour}:${parts.minute}`;
    clock.hidden = false;
    resolveClockTask?.({ value: `ottawa ${parts.hour}:${parts.minute}` });
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  tick();
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

  // The frame's scroll source: a zero-height band a third of
  // the way down the viewport, two-thirds toward the top
  // (Ben's call, 2026-11-22). Insetting the root 33.333% from
  // the top and 66.667% from the bottom leaves no box, so a
  // section "intersects" exactly while it straddles that
  // line, and the framed section sits in the upper part of
  // the screen with more of what follows in view. On a
  // desktop the pointer is the frame's source instead: the
  // hover rule in layout.css stands this one down while the
  // mouse is over any section. Dead centre was the old line.
  const focusLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-33.333% 0px -66.667% 0px" }
  );
  for (const section of sections) focusLine.observe(section);

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
    files: [[55, "strings-55.mp3"], [62, "strings-62.mp3"], [69, "strings-69.mp3"], [72, "strings-72.mp3"]] },
  { name: "cello", kind: "sample", verb: 0.5,
    files: [[60, "cello-60.mp3"]] },
  { name: "harp", kind: "sample", verb: 0.35,
    files: [[48, "harp-48.mp3"], [72, "harp-72.mp3"]] },
  { name: "piano", kind: "sample", verb: 0.4,
    files: [[48, "piano-48.mp3"], [60, "piano-60.mp3"], [72, "piano-72.mp3"], [84, "piano-84.mp3"], [36, "piano-36.mp3"]] },
  // Two shaped chip voices, appended for Cynthia's battle theme.
  // The DS has no square-wave generator: its synth leads are
  // short looped samples, band-limited by the sample rate and
  // the output path, so an ideal square at full bandwidth is
  // far brighter than the thing it names. These roll the
  // square's harmonics off past a knee, filter what is left,
  // and start slower. See shapedWave.
  { name: "synth lead", kind: "lead", wave: "lead", cutoff: 2600, attack: 0.025, level: 0.9, detune: 5 },
  { name: "soft square", kind: "lead", wave: "soft", cutoff: 2400, attack: 0.018, level: 0.9, pluck: 0.3 },
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
; A: the two synth leads. The rip's GM map calls them
; square leads, but the DS plays a sampled synth, and a
; raw pulse 25% at full bandwidth was harsh enough that
; Ben flagged the opening by ear; A now plays on the
; synth lead voice (@12), a shaped and filtered square.
; B: the string tracks, as chords. C: the triangle bass; its
; lowest notes sit below this format's lowest octave and
; are written an octave up. D: the drum track, on noise,
; pitches kept as written, every hit one step long.
; E: the pulsing figure the theme opens with, on the
; new piano. The rip's GM map calls its track an
; orchestral harp, and the last pass played it on the
; harp sample; in the game that figure is the piano,
; so the whole track moves to piano here. F: the horn,
; orchestra hit and synth brass tracks, on strings.
; G: the agogo and guitar tracks, on the soft square
; (@13), shaped and filtered for the same reason. H: the
; rip's own piano track (marked bright acoustic piano
; in the rip), two fast runs late in the body, dropped
; by the last pass and restored on piano. Two tracks
; stay unused: one duplicates the bass, and one is a
; high piccolo line with no voice near it in the table.
; Note lengths were rounded to
; the step grid: the rip's notes are legato and overlap,
; and a channel here cannot ring past its next note.
A @12 t185 v13 o5 a-1^1 r1 r1 r1 r1 r1 L r1 r1 r2. o4 a-16 a16 o5 d16 e-16 a-2. f#8 a-8 a8 a-8 f#8 a8 a-4 g8 f8 f#2. f8 f#8 g8 f#8 f8 g8 f#4 e8 e-8 e2^8 o4 b8 o5 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o6 c8 c#2 o5 a-2. f#8 a-8 a8 a-8 f#8 a8 a-4 g8 f8 f#2. f8 f#8 g8 f#8 f8 g8 f#4 e8 e-8 o4 {b>e}8 a-8 b4. {b>e}8 {b>e}8 {a->a-}8 o5 {ea}8 o4 {b>a-}8 o5 {ea}8 {gb-}8 {a-b}8 e8 c#8 o4 b8 o5 {c#f#}8 o4 b-8 o5 c#4. {c#f#}8 {c#f#}8 o4 {b->b-}8 o5 {f#b}8 {c#b-}8 {f#b}8 {a->c}8 {b->c#}8 f#8 e-8 c#8 {e-a-}8 c8 e-4. {e->c}8 a-8 o6 {ce-}8 {cc#}8 o5 {a->c}8 o6 {c#e-}8 {cd}8 e-8 a-8 e-8 c#8 o5 {e->c}8 c8 e-4. {e->c}8 a-8 o6 {ce-}8 {cc#}8 o5 {a->c}8 {e->c#}8 {f>d}8 {a->e-}8 g8 f8 e-8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o4 b4. o5 f#4. e8 e-8 f#4 e8 e-8 o4 b4 a4 b4. o5 f#4. e8 e-8 f#4 e8 e-8 o4 b4 a4 o5 c4. g4. f8 e8 g4 f8 e8 c4 o4 g4 o5 c4. g4. f8 e8 g4 f8 e8 c4 o4 g4 r1 r1 r1 r1 r1 r1 r1 r1 o5 f#8 f1^1^1^2.^8
B @8 v9 o4 {a-a}1^1 r1 r1 r1 r1 r1 r1 r1 r2. o3 {e-a-}16 {ea}16 {a>d}16 {b->e-}16 o4 {e-a-}2. {c#f#}8 {e-a-}8 {ea}8 {e-a-}8 {c#f#}8 {ea}8 {e-a-}4 {dg}8 {cf}8 {c#f#}2. {cf}8 {c#f#}8 {dg}8 {c#f#}8 {cf}8 {dg}8 {c#f#}4 o3 {b>e}8 {b->e-}8 {b>e}2^8 {ea-b}8 {b>e}8 o4 {ea-}8 {f#a}16 o3 f16 {f#>ea-}16 g16 {a->f#a}16 a16 {b->gb-}16 b16 o4 {ca-b}16 o3 b16 b-16 a16 a-16 g16 f#16 f16 {f#>c#f#}2^8 {c#b->c#}8 o4 {c#f#}8 {f#b-}8 o3 {f#>a-b}16 g16 {a->f#b-}16 a16 {b->a-b}16 b16 o4 {ca>c}16 c#16 {db->c#}16 c#16 c16 o3 b16 b-16 a16 a-16 g16 o4 {e-a-}2. {c#f#}8 {e-a-}8 {ea}8 {e-a-}8 {c#f#}8 {ea}8 {e-a-}4 {dg}8 {cf}8 {c#f#}2. {cf}8 {c#f#}8 {dg}8 {c#f#}8 {cf}8 {dg}8 {c#f#}4 o3 {b>e}8 {b->e-}8 {b>e}2^8 {ea-b}8 {b>e}8 o4 {ea-}8 {f#a}16 o3 f16 {f#>ea-}16 g16 {a->f#a}16 a16 {b->gb-}16 b16 o4 {ca-b}16 o3 b16 b-16 a16 a-16 g16 f#16 f16 {f#>c#f#}2^8 {c#b->c#}8 o4 {c#f#}8 {f#b-}8 o3 {f#>a-b}16 g16 {a->f#b-}16 a16 {b->a-b}16 b16 o4 {ca>c}16 c#16 {db->c#}16 c#16 c16 o3 b16 b-16 a16 a-16 g16 {a->e-a-}2^8 {e->ce-}8 o4 a-16 e-16 {a->c}8 o3 {a->b->c#}16 a16 {b->a->c}16 b16 o4 {cb->c#}16 c#16 {db>d}16 e-16 {e>ce-}16 e-16 d16 c#16 c16 o3 b16 b-16 a16 {a->a->c}2^8 {e->ce-}8 o4 {e-a-}8 {a->c}8 o3 {a->b->c#}16 a16 {b->a->c}16 b16 o4 {cb->c#}16 c#16 {db>d}16 e-16 {e>ce-}16 e-16 d16 c#16 c16 o3 b16 b-16 a16 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o4 {b>cf#b}1^1 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 {b>f#b}16 r4 r16 o5 {da>d}4 {cg>c}4 o4 {b>f#b}8 r2. r8 o1 {b>b}1 o4 b16 f#16 o3 a16 o4 b16 o5 b-16 f16 g16 o4 b16 o6 c#16 o5 e-16 g16 o4 g16 o5 c16 c#16 a16 o4 a16 o5 d16 g16 e16 f16 o6 e16 o5 f#16 o6 c16 o5 c16 a-16 o4 b16 o5 f#16 o4 a-16 d16 a-16 o5 d16 g16 {e-f#}8 {df}1^1^1^2.^8
C @4 v12 o1 e-4. r8 e-4. r8 e-4. r8 o2 e-8 e8 e-8 a8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 b8 o2 e8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 f8 o1 f8 o2 c#8 o1 f8 o2 c#8 o1 {f>e-}8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 c#8 o2 f#8 o1 c#8 o2 f#8 o1 e-8 o2 f8 o1 f8 o2 c#8 o1 f8 o2 c#8 o1 {f>e-}8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 c#8 o2 f8 o1 f8 o2 a-8 o1 f8 o2 a-8 o1 {f>>c#}8 o2 a-8 o1 {fb}8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 c8 o1 b-8 o2 c8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 f8 d8 o1 b8 o2 f#8 f8 d8 o1 b8 o2 d8 o1 b-8 o2 c#8 o1 b8 o2 f#8 f8 c#8 f#8 e8 a8 d8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 c8 g8 f#8 e-8 c8 c#8 o1 b8 o2 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o1 b8 o2 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8 o1 e-8 o2 a-8
D @5 v6 o2 c16 r4. r16 c16 r4. r16 c16 r4. r16 c16 r8. c16 r8. c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {cb-}16 c16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {c>c#}16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 c16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 d16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 r16 {db-}16 r16 c16 c16 c16 c16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 {b->c#}16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 {b->c#}16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>a}16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 c16 r16 b-16 r16 {c>c#}16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 r8. c16 c16 c16 c16 {cd}16 r16 {db-}16 d16 {cd}16 r16 {db-}16 r16 {cd}16 d16 {db-}16 r16 {cd}16 r16 {db-}16 d16
E r1 r2. r8 @11 v8 o2 a-16 a-16 o3 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 o2 b8 r4 b8 r4 b8 r4 b8 r4 b8 r8 b8 r8 o3 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 o2 b8 r4 b8 r4 b8 r4 b8 r4 b8 r8 b8 r8 o3 c#8 r4 c#8 r4 c#8 r4 c#8 r4 c#8 r8 c#8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r4 e-8 r8 e-8 r4 e-8 r4 e-8 r4 e-8 r4 e-8 r8 e-8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r8 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r16 e-8. r8. e-8. r8. e-8. r8. e-8. r16 e-8. r8. e-8. r16 d8. r8. d8. r8. d8. r8. c#8. r8. c#8. r16 c#8. r16 e-8 r4 e-8 r4 e-8
F @8 v10 o5 c#1^1 o3 {a->a->a-}4. r1 r1 r1 r2 r8 {a->a->a-}4. r1 r1 r1 r1 r1 r1 r1 r1 r4 b8 o4 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o5 c8 c#2 r1 r1 r1 r1 r2 r8 o3 b8 o4 e8 a-8 a8 a-8 a8 b-8 b2 f#2^8 c#8 f#8 b-8 b8 b-8 b8 o5 c8 c#2 o4 a-2^8 e-8 a-8 o5 c8 c#8 c8 c#8 d8 e-2 c2^8 o4 e-8 a-8 o5 c8 c#8 c8 c#8 d8 e-2 o4 e-2 c#2 a-4. f4. c#4 a-4. f4. c#4 o3 a-1 o5 e-2 c#2 o4 a-4. b-4. a-4 o5 c#4. f4. e4 f1 o2 {b>b>b}4. r1 r2 r8 {f#>f#>f#}4. r1 r2 r8 {g>g>g}4. r1 r2 r8 o3 {c>c>c}4. r1 r2 r8 o2 {b>b>b}4. r1 r2 r8 {g>g>g}4. r1 r2 r8 o3 {c>c>c}4. r1 r2 r8 {c>c>c}4. r1 r1 r1 r2 r8 o2 {b>b>b}4 r8 {b>b>b}4 r8 {b>b>b}4 r8 {b>b>b}4 r8 o4 {d>d}4 {c>c}4 o2 {b>b>b}4 r1 r1 r1 r2. o5 e-8 d1^1^1^2.^8 o3 {a->a-}4.
G @13 v9 o5 {e-a-}8 o4 {a>e-}8 a8 a-8 e-8 o3 b8 a-8 b8 o4 c8 e-8 a8 o5 c8 c#16 e-16 r16 f#16 a-16 a16 r16 b16 r1 r1 r1 r1 r8 o6 a-16 r16 a-16 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r2 r8. e-8 d8 e-8 r4 e8 r8 e-8 r1 c#8 c8 c#8 r4 d8 r8 c#8 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 r8 f#8 r8 o3 b8 o4 f#8 o3 b8 o4 f#8 b8 o5 e8 o4 f#8 b8 c8 g8 c8 g8 o5 c8 r8 o4 g8 r8 c8 g8 c8 g8 o5 c8 f8 o4 g8 o5 c8 o4 c8 g8 c8 g8 o5 c8 r8 o4 g8 r8 c8 g8 c8 g8 o5 c8 f8 o4 g8 o5 c8 o4 b8 f#8 o5 c8 o6 c8 o5 d8 o6 d8 o5 f#8 a8 o6 a8 f#8 c8 d8 c8 o5 a-8 f#8 d8 o2 b16 b16 b16 b16 b16 r16 b4^16 r16 b16 b16 b16 b16 b16 b16 b4. {f>g}8 o3 f8 o2 {a>b-}8 o3 e-8 o5 b4.^16 r16 b4.^16 r16 b4.^16 r1 r1 r2 r16 o4 c8 g8 f#8 e-8 c8 c#8 o3 b8 o4 c#8 c8 g8 f#8 e-8 c8 e-8 f#8 e-8 c8 g8 f#8 e-8 c8 e-8 o3 b8 o4 d8 c8 g8 f#8 d8 g8 f8 b-8 e-8 r8 o6 a-16 r16 a-16
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
let samplesReady = false;

function loadSamples() {
  if (samplesPromise) return samplesPromise;
  const decoder = new OfflineAudioContext(1, 1, 44100);
  const jobs = [];
  // The one sample load reports itself to the corner loader,
  // registered here where the memoised promise is created:
  // its share is the fraction of files settled, and it
  // completes when the load does. The loader only observes;
  // the load below runs exactly as it did.
  const work = registerTask("loading samples");
  let settledFiles = 0;
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
  for (const job of jobs) {
    job.then(() => {
      settledFiles += 1;
      work.update(jobs.length ? settledFiles / jobs.length : 1);
    });
  }
  samplesPromise = Promise.all(jobs).then(() => {
    for (const set of sampleSets.values()) set.sort((a, b) => a[0] - b[0]);
    samplesReady = true;
    work.complete();
  });
  samplesPromise.catch(() => work.fail("samples failed to load"));
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

// A square wave whose odd harmonics roll off past a knee
// instead of running flat to the 96th partial: the shape of a
// sampled synth lead rather than an ideal pulse. knee is the
// harmonic where the rolloff reaches half strength.
function shapedWave(ctx, knee) {
  const N = 48;
  const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k += 2) {
    imag[k] = -(4 / (Math.PI * k)) / (1 + (k / knee) * (k / knee));
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

function chipEnvelope(gain, t, dur, peak, attack = 0.004) {
  const p = gain.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  if (dur > 0.15) {
    // Stepped, the way the hardware envelopes step: a few flat
    // levels on the way down, never a smooth ramp.
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      p.setValueAtTime(peak * (1 - 0.07 * s), t + (dur * s) / (steps + 1));
    }
  }
  p.setValueAtTime(peak * 0.72, Math.max(t + attack, t + dur - 0.012));
  p.linearRampToValueAtTime(0, t + dur);
}

// A plucked envelope for a lead voice: the chip envelope's
// attack and release, but instead of holding near the peak
// it decays toward a low sustain, the way a picked string
// or a struck bar settles. sustain is the fraction of peak
// it settles to, reached within about 150 ms. Cynthia's
// soft square (@13) is the only voice that asks for it:
// its sources are an agogo and a guitar, and both decay.
function pluckEnvelope(gain, t, dur, peak, attack, sustain) {
  const p = gain.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(peak * sustain, t + attack, 0.045);
  p.cancelAndHoldAtTime(Math.max(t + attack, t + dur - 0.012));
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
  if (inst.kind === "lead") {
    // Shaped wave, a low-pass, a slower attack, and (on the
    // lead) a second oscillator a few cents off for body: the
    // sampled-synth character the pulse waves are too raw for.
    const g = ctx.createGain();
    if (inst.pluck) pluckEnvelope(g, t, dur, peak * (inst.level ?? 1), inst.attack ?? 0.004, inst.pluck);
    else chipEnvelope(g, t, dur, peak * (inst.level ?? 1), inst.attack ?? 0.004);
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = inst.cutoff;
    flt.Q.value = 0.4;
    const voice = (detune, trim) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(kit.waves[inst.wave]);
      o.frequency.value = freqOf(n.midi);
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = trim;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    if (inst.detune) { voice(-inst.detune, 0.72); voice(inst.detune, 0.5); }
    else voice(0, 1);
    flt.connect(g).connect(out);
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

/* ----- one song piano cap ----- */

// Battle! (Champion Cynthia) is the one song whose piano ring
// is capped. Its figure pulses: eighth-note strikes, about
// 0.16 s each, every four to six steps (0.32 to 0.49 s), and
// under the long-press ring every strike rings for the full
// 3.6 s of the recording, so as many as nine rings sound at
// once and the figure smears into a wash. There the ring is
// released 0.25 s after the written note ends instead: a
// pulse is done by about 0.41 s, inside the usual six-step
// period, and only the quiet end of the fade overlaps the
// tightest four-step pairs. The cap keys on the header line
// the song carries in its own text, so it follows the song
// through text and grid edits and reaches no other song.
// The same @11 piano serves every song in the table; the
// slow songs, Snowpoint included, keep the full ring.
function pianoRingCap(song) {
  return song.header.some((l) => l.includes("Champion Cynthia"))
    ? 0.25 : null;
}

function scheduleSample(ctx, outs, n, t, dur, ringCap = null) {
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
    // In the capped song the fade runs from the written end
    // of the note across the release instead, so the ring is
    // done shortly after the note is. A note whose written
    // end plus the release already runs past the recording
    // keeps the full ring; the cap only ever shortens.
    let fadeFrom = ringEnd - 0.12, fadeTo = ringEnd;
    if (ringCap !== null && t + dur + ringCap < ringEnd) {
      fadeFrom = t + dur;
      fadeTo = t + dur + ringCap;
    }
    p.setValueAtTime(peak, Math.max(t + 0.008, fadeFrom));
    p.linearRampToValueAtTime(0, fadeTo);
    stopAt = fadeTo + 0.1;
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
    waves: { lead: shapedWave(ctx, 9), soft: shapedWave(ctx, 8) },
    tri: triWave(ctx),
    noise: noiseBuffer(ctx),
  };
  const outs = { dry: master, verb };
  const ringCap = pianoRingCap(song);
  let noiseAccounted = 0;
  for (const ci of chanIdxs) {
    if (beforeChannel) noiseAccounted += beforeChannel(ci, noiseAccounted);
    for (const n of song.channels[ci].notes) {
      const t = n.step * stepDur, d = n.len * stepDur;
      if (INSTRUMENTS[n.inst].kind === "sample") scheduleSample(ctx, outs, n, t, d, ringCap);
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
  // The single render is one render, so it reports itself to
  // the corner loader as one task, however it was reached:
  // a light song on the plain path, the parallel path's
  // fallback, or the verification retry. The loader only
  // observes; the render runs exactly as it did, and a
  // failure reaches the handle before it propagates.
  const work = registerTask("rendering " + songName(song));
  try {
    const buffer = await ctx.startRendering();
    work.complete();
    return renderResult(song, buffer, performance.now() - t0);
  } catch (err) {
    work.fail(err && err.message ? err.message : "render failed");
    throw err;
  }
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
// much more than its share. Each finished bin is mixed
// with the running mixdown on arrival, pairwise, by the
// audio engine rather than sample by sample in JS, which
// keeps peak memory near the mixdown plus a bin or two
// instead of every bin, and keeps the per-sample adds off
// the main thread entirely.
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

// Two rendered buffers summed by the audio engine in its
// own offline context, rather than sample by sample in JS:
// the same addition, but the main thread never runs the
// per-sample loop (measured at roughly 300 ms of adds for
// the heaviest song). The summation order changes, which
// moves the result by float rounding only.
function mixBuffers(a, b, frames, sr) {
  const ctx = new OfflineAudioContext(2, frames, sr);
  for (const buf of [a, b]) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }
  return ctx.startRendering();
}

// A bin's loader label: the song's name, then the channel
// or channels the bin carries, by their letters, so the
// loader's expanded panel reads as the steps the render
// really took.
function binLabel(song, bin) {
  const letters = bin.map((ci) => song.channels[ci].letter);
  return songName(song) + " · channel" +
    (letters.length > 1 ? "s " : " ") + letters.join("+");
}

async function renderSongParallel(song) {
  const sr = 44100;
  const stepDur = 60 / song.tempo / 4;
  const frames = Math.ceil(song.steps * stepDur * sr);
  const bins = planBins(song);
  const ctxs = bins.map((bin) => buildBinGraph(song, bin, sr));
  const t0 = performance.now();
  // Each bin reports itself to the corner loader as its own
  // task, registered once every graph is built, so a build
  // failure registers nothing and falls back clean. A bin
  // render has no internal progress to report, so its task
  // sits at zero while the render runs and completes when
  // the render settles; a failed bin fails its task with
  // the reason and rethrows, so renderSongBest's fallback
  // sees the failure exactly as it did.
  const binWork = bins.map((bin) => registerTask(binLabel(song, bin)));
  // The pairwise mixdown chain: mixes run one at a time, in
  // arrival order, so the buffers alive at once stay at the
  // mixdown, the arriving bin and the mix being rendered. A
  // mix failure is held and rethrown once the bins have
  // settled, so renderSongBest's single-render fallback
  // sees it exactly as it saw a failed context.
  let mixdown = null;
  let mixError = null;
  let chain = Promise.resolve();
  const mixIn = (buf) => {
    chain = chain.then(async () => {
      if (mixError) return;
      try {
        mixdown = mixdown === null
          ? buf
          : await mixBuffers(mixdown, buf, frames, sr);
      } catch (err) {
        mixError = err;
      }
    });
  };
  await Promise.all(ctxs.map((ctx, i) =>
    ctx.startRendering().then(
      (buf) => {
        ctxs[i] = null; // release the bin as soon as it has rendered
        binWork[i].complete();
        mixIn(buf);
      },
      (err) => {
        binWork[i].fail(
          err && err.message ? err.message : "render failed");
        throw err;
      }
    )
  ));
  await chain;
  if (mixError) throw mixError;
  return renderResult(song, mixdown, performance.now() - t0);
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

/* ----- obtaining a render: the gate ----- */

// Every playable buffer passes through here, and a buffer is
// playable only when all three are true: the samples have
// loaded, the render promise has fully settled, and the
// result passes verifyRenderData. A cache hit is gated the
// same way as a fresh render (readRender has already checked
// its stored signature; the sanity band is re-run here), so
// nothing reaches the player, or the cache, on the strength
// of having been stored once.
//
// One render at a time per song: the boot preload, the play
// button and the background re-render after an edit all ask
// through this map, keyed by the cache key, so a heavy song
// is never rendered twice at once however many callers ask.
//
// The status line hears the difference through the result's
// fromCache flag, so a cache hit never claims a render time.
// announce is for the foreground play path; a background
// re-render while a loop is playing leaves the status alone.
const rendersInFlight = new Map();

async function obtainRender(song, { announce = true } = {}) {
  const key = renderCacheKey(song);
  const shared = rendersInFlight.get(key);
  if (shared) return shared;
  const pending = obtainVerifiedRender(song, key, announce);
  rendersInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (rendersInFlight.get(key) === pending) {
      rendersInFlight.delete(key);
    }
  }
}

async function obtainVerifiedRender(song, key, announce) {
  // The gate registers no task of its own: each step of the
  // work reports itself to the corner loader as its own
  // task, so the batch for one render reads as the steps it
  // really took. The samples load registers inside
  // loadSamples, a parallel render registers one task per
  // bin inside renderSongParallel, a single render registers
  // one inside renderSong, and verification registers its
  // own below. The loader only observes; the gate runs
  // exactly as it did, and each failure reaches the task
  // that owns the step that failed.
  if (announce && !samplesReady) setStatus("loading samples\u2026");
  await loadSamples();
  const hit = await readRender(key);
  if (hit && checkBuffer(hit.buffer).ok) {
    // A cache hit renders nothing, but the stored buffer
    // still passes the band above before it may play, so
    // verification is the step that ran: its task completes
    // on the spot, carrying the honest label.
    const stepDur = 60 / song.tempo / 4;
    const work = registerTask("verifying " + songName(song));
    work.status("from cache");
    work.complete();
    return {
      buffer: hit.buffer, dur: hit.dur, stepDur,
      loopStart: hit.loopStart, loopDur: hit.dur - hit.loopStart,
      renderMs: 0, fromCache: true,
    };
  }
  if (announce) setStatus("rendering\u2026");
  let rendered = await renderSongBest(song);
  const work = registerTask("verifying " + songName(song));
  if (announce) setStatus("verifying\u2026");
  let check = checkBuffer(rendered.buffer);
  if (!check.ok) {
    // A wrong-but-complete render, the failure the parallel
    // path can produce without throwing, earns exactly one
    // retry through the plain single render, which registers
    // its own task like any single render. The verification
    // task stays open across the retry: verification is not
    // done until a buffer passes. If the retry fails
    // verification too, nothing is stored and nothing plays,
    // the task fails with the check's reason, and the throw
    // tells every caller so.
    if (announce) setStatus("rendering\u2026");
    rendered = await renderSong(song);
    check = checkBuffer(rendered.buffer);
    if (!check.ok) {
      const err = verifyError(check.reason);
      work.fail(err.message);
      if (announce) {
        setStatus(renderFailureText(err, "so nothing was played."), true);
      }
      throw err;
    }
  }
  work.complete();
  writeRender(key, rendered);
  return rendered;
}

// The display name the details block derives from the first
// header line, "Name: Game (System, Year)": the part before
// the colon, with the comment marker stripped.
function songName(song) {
  const head = (song.header || [])
    .map((l) => l.replace(/^;\s*/, "").trim())
    .filter((l) => l.length);
  return (head[0] || "song").split(":")[0].trim() || "song";
}

function checkBuffer(buffer) {
  return verifyRenderData(
    [buffer.getChannelData(0), buffer.getChannelData(1)]);
}

// Verification failures carry the check's own reason, so
// the status line can say what actually failed instead of
// giving every rejection the same words. A render that
// threw carries no reason, and the status says the render
// itself failed: the two stop looking identical.
const VERIFY_REASON_TEXT = {
  length: "came out the wrong length",
  garbage: "came out with bad data in it",
  stuck: "came out stuck on one value",
  peak: "came out too loud",
  silent: "came out silent",
  imbalance: "came out with one side missing",
};

function verifyError(reason) {
  const err = new Error(`render failed verification: ${reason}`);
  err.verifyReason = reason;
  return err;
}

function renderFailureText(err, tail) {
  if (err && err.verifyReason) {
    const what = VERIFY_REASON_TEXT[err.verifyReason] || "did not check out";
    return `The render ${what}, ${tail}`;
  }
  return `The render itself failed, ${tail}`;
}


/* ---------- player ---------- */

// Playhead maths lives here and nowhere else: a segment is
// {startCtxTime, rendered, song}; the loop region is the tail of
// the buffer after the intro (loopStep), and swaps re-base the
// segment at the boundary so the formula never changes shape.
const player = {
  ctx: null, src: null, outSrc: null, seg: null, playing: false,
  rendered: null, song: null, dirty: true, pending: null, raf: 0,
};

// A start is async: it waits on samples and a render before
// it can make a sound, so a stop pressed mid-start cannot
// reach it through the source alone. The generation is the
// latest word on whether sound may exist at all: a start
// takes the next number, stopPlayback raises it, and a start
// that resumes from a wait to find its number stale stands
// down instead of starting. A stop therefore lands in every
// state, and nothing already in flight can produce sound
// after it; the next sound needs a fresh start.
let playGeneration = 0;

function stepAt(now) {
  const { startCtxTime, rendered, song } = player.seg;
  const elapsed = now - startCtxTime;
  const introDur = rendered.loopStart;
  if (elapsed < introDur) return Math.floor(elapsed / rendered.stepDur);
  const inLoop = (elapsed - introDur) % rendered.loopDur;
  return song.loopStep + Math.floor(inLoop / rendered.stepDur);
}

async function startPlayback() {
  const gen = ++playGeneration;
  if (!player.ctx) player.ctx = new AudioContext();
  await player.ctx.resume();
  await loadSamples();
  if (gen !== playGeneration) return; // a stop landed while starting
  if (player.dirty || !player.rendered) {
    const rendered = await obtainRender(player.song);
    if (gen !== playGeneration) return; // a stop landed while rendering
    player.rendered = rendered;
    player.dirty = false;
    player.pending = null;
    renderedKeys = keySetOf(player.song);
    pendingRenderKeys = null;
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
  refreshPlayGate();
  setStatus(readyText());
  runPlayhead();
}

function stopSource() {
  if (player.src) {
    try { player.src.stop(); } catch { /* already stopped */ }
    player.src.disconnect();
    player.src = null;
  }
  // A swap keeps the outgoing source reachable until its
  // boundary: a stop inside that window silences it at once
  // too, instead of letting it play out to the boundary.
  if (player.outSrc) {
    try { player.outSrc.stop(); } catch { /* already stopped */ }
    player.outSrc.disconnect();
    player.outSrc = null;
  }
}

function stopPlayback() {
  playGeneration++;
  stopSource();
  player.pending = null;
  player.playing = false;
  cancelAnimationFrame(player.raf);
  setPlayUI(false);
  clearPlayhead();
  refreshPlayGate();
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
  player.outSrc = player.src;
  player.src = src;
  player.rendered = next;
  renderedKeys = pendingRenderKeys;
  pendingRenderKeys = null;
  refreshNoteStates();
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

/* ----- background render scheduling ----- */

// A background re-render (the two songChanged paths below)
// waits for a quiet moment before it starts: no scroll or
// pointer interaction for QUIET_MS, and, while a loop is
// playing, a browser idle callback on top of that, so a
// heavy render never lands in the middle of scrolling or
// listening. Browsers without idle callbacks fall back to
// the quiet check alone. The foreground render behind a
// press of play is exempt: the press is the intent. Each
// song change takes a generation number, and a queued
// request whose generation has been superseded never
// starts at all.
const QUIET_MS = 1200;
// Starts in the past: a page that has seen no interaction
// yet is quiet by definition.
let lastInteractAt = -QUIET_MS;
let bgGeneration = 0;

function markInteract() {
  lastInteractAt = performance.now();
}
window.addEventListener("scroll", markInteract,
  { passive: true, capture: true });
window.addEventListener("pointerdown", markInteract, { passive: true });

// Resolves once the moment is quiet. onWait, if given, is
// called once, at the moment the wait actually engages.
function whenQuiet(onWait) {
  return new Promise((resolve) => {
    let waited = false;
    const defer = () => {
      if (waited) return;
      waited = true;
      if (onWait) onWait();
    };
    const check = () => {
      const since = performance.now() - lastInteractAt;
      if (since < QUIET_MS) {
        defer();
        setTimeout(check, QUIET_MS - since);
        return;
      }
      if (player.playing && "requestIdleCallback" in window) {
        defer();
        requestIdleCallback(() => {
          // An interaction may have landed during the idle
          // wait; if so, the quiet clock starts over.
          if (performance.now() - lastInteractAt < QUIET_MS) check();
          else resolve();
        });
        return;
      }
      resolve();
    };
    check();
  });
}

// A background render reports itself to the corner loader
// from the moment it is queued, not only from the moment the
// quiet-guarded render starts: while the visitor keeps
// tapping and scrolling, the wait below can stretch on, and
// the loader should show the work sitting in the queue the
// whole time, the way it shows a play-press render at once.
// The queued task ends when the render actually starts (the
// pipeline's own tasks take over from there: one per bin,
// plus verification), as superseded when a newer song change
// replaces it before its turn comes, or as failed when the
// chain dies before the render could start.
function registerQueuedRender(song) {
  const work = registerTask("waiting to render " + songName(song));
  let settled = false;
  return {
    start() {
      if (settled) return;
      settled = true;
      work.complete();
    },
    supersede() {
      if (settled) return;
      settled = true;
      work.status("superseded");
      work.complete();
    },
    fail(err) {
      if (settled) return;
      settled = true;
      work.fail(err && err.message ? err.message : "render failed");
    },
  };
}

// A song change: if it parses, it becomes the song. While playing,
// the re-render is prepared in the background and swapped at the
// loop boundary; while stopped, it simply waits for the next play.
function songChanged(parsed, { restart = false } = {}) {
  player.song = parsed;
  player.dirty = true;
  refreshPlayGate();
  const gen = ++bgGeneration;
  if (!player.playing) {
    const queued = registerQueuedRender(parsed);
    // Experiment (live note feedback): while stopped, still
    // render in the background, so a note wearing the pending
    // colour clears at the moment its render actually lands,
    // not when a timer guesses it might have. Samples first:
    // a render without them would miss every sampled voice.
    // The render itself waits for a quiet moment; while it
    // waits, the status line says so, once.
    let saidWaiting = false;
    loadSamples()
      .then(() => whenQuiet(() => {
        if (!saidWaiting && player.song === parsed && !player.playing) {
          saidWaiting = true;
          setStatus("waiting for a quiet moment to render\u2026");
        }
      }))
      .then(() => {
        if (gen !== bgGeneration) {
          queued.supersede();
          return null;
        }
        queued.start();
        return obtainRender(parsed, { announce: false });
      })
      .then((rendered) => {
        if (!rendered) return; // superseded while waiting
        if (player.song === parsed && !player.playing) {
          player.rendered = rendered;
          player.dirty = false;
          player.pending = null;
          renderedKeys = keySetOf(parsed);
          pendingRenderKeys = null;
          window.__lastRender = rendered;
          refreshNoteStates();
          refreshPlayGate();
          setStatus(readyText());
        }
      })
      .catch((err) => {
        // A failed background render leaves the notes pending
        // and the play gate closed, which is the truth; the
        // status line says so too, naming what failed.
        queued.fail(err);
        if (player.song === parsed && !player.playing) {
          setStatus(
            renderFailureText(err, "so this song cannot play yet."), true);
        }
      });
    return;
  }
  if (restart) {
    startPlayback();
    return;
  }
  const queued = registerQueuedRender(parsed);
  whenQuiet()
    .then(() => {
      if (gen !== bgGeneration || player.song !== parsed) {
        queued.supersede();
        return null;
      }
      queued.start();
      return obtainRender(parsed, { announce: false });
    })
    .then((rendered) => {
      if (!rendered) return; // superseded while waiting
      if (player.song === parsed && player.playing) {
        player.pending = rendered;
        pendingRenderKeys = keySetOf(parsed);
        window.__lastRender = rendered;
      }
    })
    .catch(() => {
      queued.fail();
      /* a render that fails the gate simply never swaps in */
    });
}

/* ---------- page ---------- */

const textEl = document.querySelector("[data-song-text]");
const gridEl = document.querySelector("[data-grid]");
const panelEl = document.querySelector(".music-panel");
const factsEl = document.querySelector("[data-song-facts]");
const factNameEl = document.querySelector("[data-fact-name]");
const factMetaEl = document.querySelector("[data-fact-meta]");
const factKeyEl = document.querySelector("[data-fact-key]");
const statusEl = document.querySelector("[data-status]");
const textStatusEl = document.querySelector("[data-text-status]");
const playBtn = document.querySelector("[data-play]");
// The gate starts closed: no render is staged yet, so there
// is nothing a press of play could honestly start.
playBtn.disabled = true;
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

// The play gate: while stopped, play is enabled only when
// a verified render is staged for the current song and the
// song has not been edited since. Every staging path calls
// this when a render lands, and every adoption calls it when
// it dirties the song, so the button always tells the truth
// about whether pressing it could play.
function refreshPlayGate() {
  playBtn.disabled = player.playing
    ? false
    : !(player.rendered && !player.dirty);
}

function setPlayUI(playing) {
  playBtn.textContent = playing ? "stop" : "play";
  playBtn.setAttribute("aria-pressed", String(playing));
}

function updateTempoUI() {
  if (player.song) tempoValueEl.textContent = `${player.song.tempo} bpm`;
}

/* ----- grid ----- */

const gridState = { letter: null };

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

/* ----- the grid view: blocks in a sliding window ----- */

// The song data is the state; this view is a projection of it.
// Nothing here reads state back from the page: a note's block
// gets its position and its state class from the song and the
// render key sets at the moment it is materialised, and the
// playhead step and the window live in JS variables, never in
// the DOM. The grid used to build one button per step per
// pitch row, about 100,000 elements for the longest song,
// which is what smeared and blanked this page on a phone.
// Now the strip's background draws the step and lane lines,
// one block element stands for each note, and only the notes
// inside the visible window, plus a buffer on each side, get
// elements at all. The strip keeps the song's full width, so
// the panel scrolls exactly as far as it did.
//
// The geometry constants mirror music.css (the .gstrip
// vars): a cell is 14px, or 22px under the coarse-pointer
// media query, with a 1px gap after each step and 4px more
// before each beat step; lanes sit on a 25px pitch over a
// 24px line. The pure functions take the cell size as an
// argument so the test harness can run them without a page.

/* [view-math: pure] */
const LANE_H = 24;
const LANE_PITCH = 25;
const WINDOW_BUFFER_STEPS = 24;
const WINDOW_SLACK_STEPS = 8;

function cellPitch(cell) { return cell + 1; }
function groupWidth(cell) { return 4 * cellPitch(cell) + 4; }

// The left edge of a step, in px from the note layer's left.
function stepX(step, cell) {
  return cellPitch(cell) * step + 4 * Math.floor(step / 4);
}

// The step a layer x falls in: the inverse of stepX. The
// wider gap before a beat step belongs to the step before it.
function stepAtX(x, cell) {
  if (x <= 0) return 0;
  const g = Math.floor(x / groupWidth(cell));
  const r = x - g * groupWidth(cell);
  return g * 4 + Math.min(3, Math.floor(r / cellPitch(cell)));
}

// A note's block: left edge and width in px. The width runs
// to the note's last step's right edge, so the gaps inside a
// long note are part of the block, as they were part of its
// cells.
function noteSpan(note, cell) {
  const left = stepX(note.step, cell);
  return { left, width: stepX(note.step + note.len - 1, cell) + cell - left };
}

// A block's top edge within its strip: lanes sit on the
// pitch, each lane's line is LANE_H tall, and the block
// centres in it.
function blockTop(lane, cell) {
  return lane * LANE_PITCH + 1 + (LANE_H - cell) / 2;
}

// The pitch lanes of a channel, highest first, with one
// spare lane above and below the used pitches: the same rows
// the cell grid built.
function laneRows(ch) {
  const pitches = [...new Set(ch.notes.map((n) => n.midi))].sort((a, b) => b - a);
  if (!pitches.length) return [];
  return [pitches[0] + 1, ...pitches, pitches[pitches.length - 1] - 1]
    .filter((m, i, a) => m >= 24 && m <= 96 && a.indexOf(m) === i);
}

// The steps the viewport shows, as [lo, hi): originX is the
// note layer's left edge in the panel's scroll coordinates.
function visibleSteps(originX, scrollLeft, clientWidth, cell) {
  return [
    stepAtX(scrollLeft - originX, cell),
    stepAtX(scrollLeft - originX + clientWidth, cell) + 1,
  ];
}

// The window to materialise, or null when the visible steps
// sit comfortably inside the one already built: the window
// recentres only when the view nears its edge, so ordinary
// scrolling and the playhead's follow do not rebuild blocks
// on every step.
function materialWindow(win, originX, scrollLeft, clientWidth, steps, cell, force) {
  const [lo, hi] = visibleSteps(originX, scrollLeft, clientWidth, cell);
  if (!force && win.start >= 0 &&
      lo >= win.start + WINDOW_SLACK_STEPS && hi <= win.end - WINDOW_SLACK_STEPS) {
    return null;
  }
  return [
    Math.max(0, lo - WINDOW_BUFFER_STEPS),
    Math.min(steps, hi + WINDOW_BUFFER_STEPS),
  ];
}

// Ghost spans: notes in the sounding render but no longer
// in the song, rebuilt from their keys. A key is
// letter|midi|step|len|inst|vol (see noteKey).
function ghostSpans(rendered, current) {
  const spans = [];
  if (!rendered) return spans;
  for (const k of rendered) {
    if (current.has(k)) continue;
    const [letter, midi, step, len] = k.split("|");
    spans.push({ letter, midi: Number(midi), step: Number(step), len: Number(len) });
  }
  return spans;
}
/* [/view-math: pure] */

// The view's own state, all of it JS: the strips built for
// the current song, the materialised window, the note
// layer's left edge in scroll coordinates, and the playhead
// step on show.
const view = {
  strips: [],
  start: -1,
  end: -1,
  originX: 0,
  step: -1,
  framed: false,
};

// A block's note, held in JS: a keyboard press on a block
// arrives with no coordinates, so the block's identity comes
// from here, never from the element.
const blockNote = new WeakMap();

// The cell size follows the same media query the CSS vars
// follow; the size is a fact about the environment, read
// from the query, never measured off an element.
const coarseCells = window.matchMedia("(max-width: 34rem), (pointer: coarse)");
function cellSize() { return coarseCells.matches ? 22 : 14; }

// Every channel gets its own strip, stacked in the one
// panel: the whole song is as wide as it ever was, and
// because all the strips live in the same scrolling panel,
// they share the one scrollLeft and the playhead line lines
// up down the stack.
//
// The scaffold build runs in slices, as the cell build did:
// each slice spends a few milliseconds building strips, then
// yields, so even the heaviest song never blocks the page's
// first paint or a scroll. A build a newer song supersedes
// stops at its next slice, by token; the window materialises
// when the last slice lands.
let gridBuildToken = 0;

function scheduleGridSlice(fn) {
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => fn(), { timeout: 60 });
  } else {
    setTimeout(fn, 0);
  }
}

function buildGrid() {
  const token = ++gridBuildToken;
  gridEl.innerHTML = "";
  view.strips = [];
  view.start = -1;
  view.end = -1;
  const song = player.song;
  if (!song) return;
  if (!song.channels.some((c) => c.letter === gridState.letter)) {
    gridState.letter = song.channels[0]?.letter ?? null;
  }
  const builders = song.channels.map((ch) => channelStripSteps(ch, song));
  let idx = 0;
  const slice = () => {
    if (token !== gridBuildToken) return;
    const t0 = performance.now();
    while (idx < builders.length && performance.now() - t0 < 12) {
      if (builders[idx].next().done) idx++;
    }
    if (idx < builders.length) {
      scheduleGridSlice(slice);
      return;
    }
    calibrateView();
    materialiseWindow(true);
    paintPlayhead(view.step);
  };
  slice();
}

// One channel's scaffold, built as a generator: the header
// first, then the strip with its pitch labels and its empty
// note layer. Blocks arrive with the window, not the
// scaffold, so building a song never builds its notes.
function* channelStripSteps(ch, song) {
  const head = document.createElement("div");
  head.className = "gchan";
  const used = [...new Set(ch.notes.map((n) => n.inst))]
    .map((i) => INSTRUMENTS[i].name).join(", ");
  head.innerHTML =
    `<span class="gchan__name">${ch.letter}</span>` +
    `<span class="gchan__inst">${used}</span>`;
  gridEl.appendChild(head);

  const rows = laneRows(ch);
  const entry = {
    ch, rows,
    laneOf: new Map(rows.map((m, i) => [m, i])),
    strip: null, layer: null, play: null, blocks: [],
  };
  view.strips.push(entry);
  if (!rows.length) return;

  const cell = cellSize();
  const layerW = stepX(song.steps - 1, cell) + cell;
  const strip = document.createElement("div");
  strip.className = "gstrip";
  strip.style.width = `calc(3.4rem + 1px + ${layerW}px)`;
  strip.style.height = `${rows.length * LANE_PITCH}px`;
  const layer = document.createElement("div");
  layer.className = "glayer";
  layer.style.width = `${layerW}px`;
  strip.appendChild(layer);
  const play = document.createElement("div");
  play.className = "gplay";
  play.hidden = true;
  layer.appendChild(play);
  // The pitch labels are in-flow sticky spans (see .glabel
  // in music.css): one per lane, stacked down the strip in
  // row order, each a lane pitch tall, and stuck to the
  // panel's left edge while the layer scrolls under them.
  // No per-label position is set here; the stack is the
  // position.
  for (let i = 0; i < rows.length; i++) {
    const label = document.createElement("span");
    label.className = "glabel";
    label.textContent = pitchName(rows[i]);
    strip.appendChild(label);
  }
  entry.strip = strip;
  entry.layer = layer;
  entry.play = play;
  gridEl.appendChild(strip);
  yield;
}

// The note layer's left edge in the panel's scroll
// coordinates, measured from the layout (a measurement of
// the environment, not state): every strip's layer shares
// the one offset.
function calibrateView() {
  const first = view.strips.find((s) => s.layer);
  if (!first || !panelEl) { view.originX = 0; return; }
  const pr = panelEl.getBoundingClientRect();
  const lr = first.layer.getBoundingClientRect();
  view.originX = lr.left - pr.left - panelEl.clientLeft + panelEl.scrollLeft;
}

// Build the current window's blocks from the song data:
// the notes intersecting it, each wearing the state the
// data says (pending when its key is not in the sounding
// render), plus ghost blocks for spans the render still
// sounds. The blocks already on the page are removed and
// rebuilt from the data every time; nothing is read back
// from them.
function materialiseWindow(force = false) {
  const song = player.song;
  if (!song || !panelEl || !view.strips.length) return;
  const cell = cellSize();
  const win = materialWindow(view, view.originX,
    panelEl.scrollLeft, panelEl.clientWidth, song.steps, cell, force);
  if (!win) return;
  const [start, end] = win;
  view.start = start;
  view.end = end;
  const cur = keySetOf(song);
  const ghosts = ghostSpans(renderedKeys, cur);
  for (const entry of view.strips) {
    for (const b of entry.blocks) b.remove();
    entry.blocks = [];
    if (!entry.layer) continue;
    const frag = document.createDocumentFragment();
    const addBlock = (midi, step, len, cls, note) => {
      const lane = entry.laneOf.get(midi);
      if (lane === undefined) return;
      if (step + len <= start || step >= end) return;
      const span = noteSpan({ step, len }, cell);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "gblock " + cls;
      el.style.left = `${span.left}px`;
      el.style.width = `${span.width}px`;
      el.style.top = `${blockTop(lane, cell)}px`;
      el.setAttribute("aria-label",
        `${pitchName(midi)}, step ${step + 1}, channel ${entry.ch.letter}`);
      if (note) blockNote.set(el, { ch: entry.ch, note });
      frag.appendChild(el);
      entry.blocks.push(el);
    };
    for (const n of entry.ch.notes) {
      const pending = renderedKeys && !renderedKeys.has(noteKey(entry.ch.letter, n));
      addBlock(n.midi, n.step, n.len, pending ? "c-on c-pending" : "c-on", n);
    }
    for (const g of ghosts) {
      if (g.letter === entry.ch.letter) {
        addBlock(g.midi, g.step, g.len, "c-ghost", null);
      }
    }
    entry.layer.appendChild(frag);
    if (entry.play) entry.layer.appendChild(entry.play);
  }
}

// Scrolling and the playhead's follow both move the
// viewport; the window follows on the next frame, and only
// when the visible steps near the materialised edge (see
// materialWindow).
function scheduleMaterialise() {
  if (view.framed) return;
  view.framed = true;
  requestAnimationFrame(() => {
    view.framed = false;
    materialiseWindow(false);
  });
}

if (panelEl) {
  panelEl.addEventListener("scroll", scheduleMaterialise, { passive: true });
}
window.addEventListener("resize", () => {
  calibrateView();
  materialiseWindow(true);
});
coarseCells.addEventListener?.("change", () => buildGrid());

function paintPlayhead(step) {
  // One line per strip, moved by transform. The step lives
  // in view.step, so a strip rebuilt under a playing song
  // can be handed its line back (buildGrid does).
  view.step = step;
  for (const entry of view.strips) {
    if (!entry.play) continue;
    if (step < 0) {
      entry.play.hidden = true;
      continue;
    }
    entry.play.hidden = false;
    entry.play.style.transform = `translateX(${stepX(step, cellSize()) - 1}px)`;
  }
}

function clearPlayhead() {
  paintPlayhead(-1);
}

// How far in from the panel's left edge the playhead sits
// while the grid follows it, as a fraction of the visible
// panel: a quarter in, the same spot the home page demo's
// playhead holds (12 of its 48 window steps). A fraction,
// not a step count, because this grid's cells change width
// with the window (wider cells on a phone), so no fixed
// step count holds the quarter at every size. In steps it
// works out to about 4 on a phone and about 10 on desktop.
const PLAYHEAD_LEAD_FRACTION = 0.25;

function followPlayhead(step) {
  // While a song plays, the grid panel follows the playhead the
  // way the home page demo's window does: on every step the panel
  // scrolls so the step sits PLAYHEAD_LEAD_FRACTION of the
  // visible panel in from its left edge, so the playhead holds
  // still and the grid moves under it, one step at a time. (The
  // old policy only scrolled when the step was about to leave
  // the panel, which read as a long stillness and then a page-
  // sized lurch.) The scroll is a plain assignment on the step
  // change: no animated scrolling, and the panel only ever
  // moves sideways. At the song's start and end the scroll
  // clamps, and the playhead crosses the first or last stretch
  // itself, again like the demo. When playback stops the panel
  // stays where it is.

  if (!panelEl || step < 0) return;
  const x = view.originX + stepX(step, cellSize());
  const lead = PLAYHEAD_LEAD_FRACTION * panelEl.clientWidth;
  const maxScroll = Math.max(0, panelEl.scrollWidth - panelEl.clientWidth);
  const target = Math.min(Math.max(0, x - lead), maxScroll);
  if (panelEl.scrollLeft !== target) panelEl.scrollLeft = target;
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
    // notes at different pitches may overlap freely, so the
    // overlap cleanup and the next-note clamp below only apply
    // to notes at the same pitch as the new one. Same-pitch
    // conflicts under the new span are cut back or removed, and
    // the new note stops at the next same-pitch note.
    const s = fresh.step, e = fresh.step + fresh.len;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n === fresh) continue;
      if (n.midi !== fresh.midi) continue;
      if (n.step === s) continue;
      if (n.step < e && n.step + n.len > s) {
        if (n.step >= s) notes.splice(i, 1);
        else n.len = s - n.step;
      }
    }
    const next = notes
      .filter((n) => n !== fresh && n.midi === fresh.midi && n.step > s)
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
  textEl.value = notesText(player.song);
  const parsed = parseSong(text);
  if (parsed.ok) adoptSong(parsed);
}

gridEl.addEventListener("click", (event) => {
  const song = player.song;
  if (!song) return;
  let ch, step, midi;
  // A tap computes its step and pitch from its position in
  // the strip: the page holds no per-cell identity to read.
  // A keyboard press on a note block arrives with no
  // position (detail 0); the block's note comes from the
  // JS-held map instead.
  const hit = event.detail === 0 ? blockNote.get(event.target) : undefined;
  if (hit) {
    ch = hit.ch;
    step = hit.note.step;
    midi = hit.note.midi;
  } else {
    const layerEl = event.target.closest(".glayer");
    if (!layerEl) return;
    const entry = view.strips.find((s) => s.layer === layerEl);
    if (!entry) return;
    const rect = layerEl.getBoundingClientRect();
    step = Math.min(song.steps - 1,
      stepAtX(event.clientX - rect.left, cellSize()));
    const lane = Math.floor((event.clientY - rect.top - 1) / LANE_PITCH);
    if (lane < 0 || lane >= entry.rows.length) return;
    midi = entry.rows[lane];
    ch = entry.ch;
  }
  gridState.letter = ch.letter;
  const before = ch.notes.find(
    (n) => n.midi === midi && step >= n.step && step < n.step + n.len);
  gridEdit(ch, step, midi);
  // Live feedback: a tap that creates a note (or extends one
  // into this step) hears that note at once, through the same
  // voice the render uses. A tap that deletes or shortens a
  // note stays silent: there is no new note to hear.
  const after = ch.notes.find(
    (n) => n.midi === midi && step >= n.step && step < n.step + n.len);
  if (after && !before) {
    previewNote(after, 60 / player.song.tempo / 4);
  }
});

/* ----- live note feedback + pending colour (experiment) ----- */

// A note's identity, for telling the song being edited apart
// from the song the current render was made from. Two renders
// of the same text share every key; any edit moves at least
// one key.
const noteKey = (letter, n) =>
  [letter, n.midi, n.step, n.len, n.inst, n.vol].join("|");

function keySetOf(song) {
  const set = new Set();
  if (!song) return set;
  for (const ch of song.channels) {
    for (const n of ch.notes) set.add(noteKey(ch.letter, n));
  }
  return set;
}

// The keys inside the render a listener would hear right now
// (or, while stopped, the render waiting for the next play),
// and inside the render waiting at the loop boundary. A note
// in the edited song but not in renderedKeys has not been
// heard yet: it wears the pending colour until the swap or
// the background render actually lands. A note in renderedKeys
// but no longer in the song is still sounding: it shows as a
// ghost until the same moment. Neither state ever clears on
// a timer.
let renderedKeys = null;
let pendingRenderKeys = null;

function refreshNoteStates() {
  if (!player.song || !gridEl) return;
  // A note's state is a fact about the data: pending when
  // its key is not in the sounding render's key set, a ghost
  // when a key in that set has left the song. The blocks are
  // a projection of those facts, rebuilt by the window's
  // materialisation, so a state change is a
  // re-materialisation; nothing is scanned or read back from
  // the page to decide a state.
  materialiseWindow(true);
}

// One graph builder for every live voice: the same chain the
// offline render wires (master gain 0.9, one convolver send at
// 0.5, the same chip kit), so a tapped note sounds like the
// loop it is about to join. The offline measurement path in
// the test harness builds the identical graph on an offline
// context through this same function.
function buildVoiceGraph(ctx) {
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
  return { master, kit, outs: { dry: master, verb } };
}

let liveGraph = null;
function ensureLiveGraph() {
  if (!player.ctx) player.ctx = new AudioContext();
  if (liveGraph && liveGraph.ctx === player.ctx) return liveGraph;
  const g = buildVoiceGraph(player.ctx);
  liveGraph = { ctx: player.ctx, ...g };
  return liveGraph;
}

// Play one note now, through the render's own voice functions,
// unchanged. Works stopped or playing: the loop is a separate
// buffer source on the same context and never notices.
async function previewNote(n, stepDur) {
  await loadSamples();
  if (!player.ctx) player.ctx = new AudioContext();
  await player.ctx.resume();
  const g = ensureLiveGraph();
  const t = player.ctx.currentTime + 0.01;
  const dur = Math.max(1, n.len) * stepDur;
  if (INSTRUMENTS[n.inst].kind === "sample") {
    scheduleSample(player.ctx, g.outs, n, t, dur);
  } else {
    scheduleChip(player.ctx, g.master, g.kit, n, t, dur);
  }
}

// Debug and measurement hooks, in the spirit of __lastRender:
// the verification harness drives the tap path and reads the
// pending state through here.
window.__liveNotes = {
  player, previewNote, ensureLiveGraph, buildVoiceGraph,
  scheduleSample, scheduleChip, keySetOf, refreshNoteStates,
  INSTRUMENTS, parseSong, renderSongBest,
  get renderedKeys() { return renderedKeys; },
  get pendingRenderKeys() { return pendingRenderKeys; },
};

/* ----- song adoption ----- */

function adoptSong(parsed, { restart = false } = {}) {
  songChanged(parsed, { restart });
  if (!gridState.letter ||
      !parsed.channels.some((c) => c.letter === gridState.letter)) {
    gridState.letter = parsed.channels[0]?.letter ?? null;
  }
  buildGrid();
  updateTempoUI();
  updateSongFacts(parsed);
  fitText();
  showIssues(parsed);
}

function markSongButton(key) {
  for (const btn of document.querySelectorAll("[data-song]")) {
    const current = btn.dataset.song === key;
    btn.setAttribute("aria-current", String(current));
    if (!current) continue;
    // Keep the current row in view inside the capped list,
    // moving the list only as much as it takes.
    const list = btn.closest(".songlist");
    if (!list) continue;
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    if (br.top < lr.top) {
      list.scrollTop += br.top - lr.top;
    } else if (br.bottom > lr.bottom) {
      list.scrollTop += br.bottom - lr.bottom;
    }
  }
}

// The notes box shows the channel lines only. The header
// comments stay with the song (the details block shows their
// music facts), so the text here is the listing itself.
function notesText(song) {
  const lines = songToText(song).split("\n");
  const first = lines.findIndex((l) => /^\s*[A-H](\s|$)/.test(l));
  return lines.slice(first < 0 ? lines.length : first).join("\n");
}

// The notes box never scrolls: its height is fitted to its
// full content, wrapped lines and all, the way code areas
// elsewhere on the site show everything and scroll nothing.
function fitText() {
  if (!textEl) return;
  textEl.style.height = "auto";
  textEl.style.height = textEl.scrollHeight + "px";
  for (let i = 0; i < 2; i++) {
    const short = textEl.scrollHeight - textEl.clientHeight;
    if (short <= 0) break;
    textEl.style.height = textEl.offsetHeight + short + "px";
  }
}

// The details block: the music facts from the song's header.
// Line one is "Name: Game (System, Year)" in every song; line
// two leads with the key and time in most, and where it does
// not (it goes straight to where the transcription came from)
// there is no key line to show. The rest of the header prose
// stays out of the panel.
function updateSongFacts(song) {
  if (!factsEl) return;
  const head = (song.header || [])
    .map((l) => l.replace(/^;\s*/, "").trim())
    .filter((l) => l.length);
  const m = (head[0] || "").match(
    /^(.+?):\s*(.+?)\s*\(([^,]+),\s*(\d{4})\)\s*$/);
  if (!m) {
    factsEl.hidden = true;
    return;
  }
  factsEl.hidden = false;
  factNameEl.textContent = m[1];
  factMetaEl.textContent = `${m[2]} · ${m[3]} · ${m[4]}`;
  const km = (head[1] || "").match(
    /^([A-G][#b]? (?:major|minor))?(?:\s*,\s*)?(\d+\/\d+(?: at \d+)?|quick: \d+)?/);
  const key = km ? [km[1], km[2]].filter(Boolean).join(" · ") : "";
  factKeyEl.hidden = !key;
  factKeyEl.textContent = key;
}

function loadSong(key, { restart = false } = {}) {
  const song = SONGS[key];
  if (!song) return;
  const parsed = parseSong(song.text + "\n");
  markSongButton(key);
  if (panelEl) panelEl.scrollLeft = 0;
  if (parsed.ok) adoptSong(parsed, { restart });
  else showIssues(parsed);
  textEl.value = notesText(parsed);
  fitText();
}

for (const btn of document.querySelectorAll("[data-song]")) {
  btn.addEventListener("click", () => {
    loadSong(btn.dataset.song, { restart: player.playing });
  });
}

/* ----- transport ----- */

let starting = false;
playBtn.addEventListener("click", async () => {
  // While a start is still in flight the button reads stop,
  // and pressing it is a stop like any other: the generation
  // bump in stopPlayback stands the pending start down, so
  // no sound follows a stop press, ever.
  if (player.playing || starting) { stopPlayback(); return; }
  starting = true;
  setPlayUI(true);
  try {
    await startPlayback();
  } catch (err) {
    setPlayUI(false);
    setStatus(renderFailureText(err, "so nothing was played."), true);
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
    const parsed = parseBoxText();
    if (parsed.ok) { markSongButton(null); adoptSong(parsed); }
  });
}

/* ----- text editing ----- */

// The box holds the channel lines; the song's header rides
// along from the song itself. A pasted text that brings its
// own header comments is parsed as the full text it is.
function parseBoxText() {
  const raw = textEl.value;
  const firstLine = raw.split("\n").find((l) => l.trim()) || "";
  if (firstLine.trim().startsWith(";") || !player.song) {
    return parseSong(raw);
  }
  const head = (player.song.header || []).join("\n");
  return parseSong(head ? head + "\n" + raw : raw);
}

let textTimer = 0;
textEl.addEventListener("input", () => {
  fitText();
  clearTimeout(textTimer);
  textTimer = setTimeout(() => {
    const parsed = parseBoxText();
    if (!parsed.ok) { showIssues(parsed); return; }
    markSongButton(null);
    adoptSong(parsed);
  }, 300);
});

// Wrapping changes with the width and with the font arriving,
// so the fit is redone then too: the box must never be left
// with anything to scroll.
window.addEventListener("resize", fitText);
if (document.fonts?.ready) document.fonts.ready.then(() => fitText());

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
setUpClock();
setUpKeys();
loadSong("storms");

// The boot's view of this page's real startup work: the samples
// loading (loadSamples is memoized, so this is the same fetch the
// first render waits on), the default song's render, which cannot
// start until the samples land and resolves through the same
// obtainRender the play button uses, cache reads included, and
// the clock's first tick. Starting the samples here mirrors the
// home page's demo preload. The render's buffer is stored on the
// player when the song is still current and still needs it, so
// pressing play afterwards is instant. The samples and render
// tasks are marked selfReports: both register themselves with
// the corner loader where the work runs (loadSamples under its
// own name, the render as its per-step tasks), so runBoot lists
// them for the boot screen without registering them a second
// time. The clock is the boot's own step and registers there.
const bootSong = player.song;
const samplesTask = loadSamples().then(() => performance.now() - bootT0);
const renderTask = (async () => {
  await samplesTask;
  const startedAt = performance.now();
  const rendered = await obtainRender(bootSong, { announce: false });
  const wallMs = performance.now() - startedAt;
  if (player.song === bootSong && player.dirty && !player.rendered) {
    player.rendered = rendered;
    player.dirty = false;
    window.__lastRender = rendered;
  }
  refreshPlayGate();
  return {
    fromCache: rendered.fromCache === true,
    ms: wallMs,
    renderMs: rendered.renderMs,
  };
})();
runBoot(
  [
    { label: "loading samples", promise: samplesTask, selfReports: true,
      format: (ms) => `${Math.round(ms)} ms` },
    { label: "rendering song", promise: renderTask, selfReports: true,
      format: (r) => (r.fromCache
        ? `from cache · ${Math.round(r.ms)} ms`
        : `rendered in ${Math.round(r.renderMs)} ms`) },
    { label: "syncing clock", promise: clockTask,
      format: (r) => r.value },
  ],
  { t0: bootT0 }
);
