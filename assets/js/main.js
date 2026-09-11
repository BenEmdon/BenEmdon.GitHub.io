import { attach } from "./dither.js";
import { animateWordmark } from "./wordmark.js";

const THEME_KEY = "theme";
// The cycle the toggle walks. "system" is where everyone starts, and it is
// less a stored preference than the absence of one: in that mode nothing is
// pinned and color-scheme follows the OS.
const MODES = ["system", "light", "dark"];
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return MODES.includes(saved) ? saved : "system";
  } catch {
    // Private-mode Safari refuses reads as well as writes.
    return "system";
  }
}

const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

function setUp() {
  const repaints = [];

  // Read by the portrait dissolve and by keyed jumps, so it sits above both
  // rather than inside whichever one happened to need it first.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- portrait ---------- */

  // Eight steps of it, matching the wordmark's own reveal. Few enough that each
  // one lands as a separate frame rather than reading as a fade.
  const DISSOLVE_STEPS = 8;

  for (const frame of document.querySelectorAll("[data-dither]")) {
    const canvas = frame.querySelector("[data-dither-canvas]");
    const photo = frame.querySelector("img");

    attach(canvas, photo)
      .then((portrait) => {
        repaints.push(portrait.repaint);

        let step = 0;
        let timer;

        // Driven from here rather than by a CSS transition on opacity, because
        // the point is that the dither comes apart in blocks: cells of it wink
        // out in a scrambled order until the photograph underneath is all that
        // is left. A fade would just make it fainter.
        function dissolve(toward) {
          clearInterval(timer);

          // One jump for anyone who asked not to be animated. They still get
          // the photograph, just not the six frames on the way to it.
          if (reduced.matches) {
            step = toward;
            portrait.reveal(step / DISSOLVE_STEPS);
            return;
          }

          timer = setInterval(() => {
            step += Math.sign(toward - step);
            portrait.reveal(step / DISSOLVE_STEPS);
            if (step === toward) clearInterval(timer);
          }, 320 / DISSOLVE_STEPS);
        }

        const show = () => dissolve(DISSOLVE_STEPS);
        const hide = () => dissolve(0);

        // Keyboard gets it either way.
        frame.addEventListener("focus", show);
        frame.addEventListener("blur", hide);

        if (window.matchMedia("(hover: hover)").matches) {
          frame.addEventListener("pointerenter", show);
          frame.addEventListener("pointerleave", hide);
        } else {
          // Touch has no hover to hold it open, so a tap latches. These cannot
          // both be bound: on touch a tap fires pointerenter, then click, then
          // pointerleave the moment the finger lifts, which would close the
          // photo again the instant the tap opened it.
          let latched = false;
          frame.addEventListener("click", () => {
            latched = !latched;
            dissolve(latched ? DISSOLVE_STEPS : 0);
          });
        }
      })
      // Without the dither the photo simply shows through, so there is nothing
      // to clean up on failure.
      .catch(() => {});
  }

  /* ---------- theme ---------- */

  const toggle = document.querySelector("[data-theme-toggle]");
  let mode = storedMode();

  // Only light and dark pin [data-theme]. System mode removes it, which is the
  // same state the inline script in <head> leaves the page in before first
  // paint, so there is nothing to flash on load either way.
  function applyMode() {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }

    const resolved = systemDark.matches ? "dark" : "light";
    toggle.textContent = mode;
    toggle.setAttribute(
      "aria-label",
      `Theme: ${mode === "system" ? `system (${resolved})` : mode}. ` +
        `Switch to ${nextMode(mode)}.`
    );

    // The dither reads its two colours back out of CSS, so it has to be
    // redrawn whenever the resolved theme could have moved under it.
    repaints.forEach((repaint) => repaint());
  }

  toggle.addEventListener("click", () => {
    mode = nextMode(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Private-mode Safari refuses writes; the choice still holds this visit.
    }
    applyMode();
  });

  // Only in system mode does the OS still get a vote.
  systemDark.addEventListener("change", () => {
    if (mode === "system") applyMode();
  });

  applyMode();

  /* ---------- section in view ---------- */

  const sections = document.querySelectorAll(".section");

  // A zero-height band pinned to the middle of the viewport: inset the root
  // 50% from top and bottom and no box is left, so a section "intersects"
  // exactly while it straddles the centre line. Sections do not overlap, so at
  // most one qualifies at a time. Cheaper and steadier than measuring rects on
  // every scroll event.
  // While a keyed jump is in flight the observer stands down: see frame().
  let jumpingUntil = 0;

  function frame(section) {
    for (const other of sections) other.classList.toggle("is-active", other === section);
  }

  const centreLine = new IntersectionObserver(
    (entries) => {
      if (performance.now() < jumpingUntil) return;

      // Between two sections sit a divider and its margins — about 72px where
      // nothing is at the centre. Clearing the frame there makes it strobe, so
      // whichever section reached the middle last keeps it until the next one
      // arrives.
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (arrived) frame(arrived.target);
    },
    { rootMargin: "-50% 0px -50% 0px" }
  );

  for (const section of sections) centreLine.observe(section);

  /* ---------- keys ---------- */

  const keys = document.querySelector("[data-keys]");
  const keysToggle = document.querySelector("[data-keys-toggle]");

  function showKeys(open) {
    keys.hidden = !open;
    keysToggle.setAttribute("aria-expanded", String(open));
  }

  // Landing a section at the top of the viewport puts the centre line past the
  // short ones and into whatever follows, so the frame would confirm the wrong
  // section. Rather than move the line, hold the observer off for the length of
  // the scroll and frame the target directly; once the lock lapses there is no
  // further scroll to correct it, and the next real one hands control back.
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
    // ? is Shift+/, so shiftKey has to stay allowed.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const el = event.target;
    if (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName)) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= sections.length) {
      jump(sections[digit - 1]);
    } else if (event.key === "t") {
      toggle.click();
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

  /* ---------- wordmark boot ---------- */

  const wordmark = document.querySelector(".wordmark");

  // The block glyphs are served display=block, so for up to three seconds the
  // wordmark is laid out but painting nothing. Starting the reveal on load
  // would run it against an empty box and pop the finished art in afterwards.
  // fonts.ready resolves either way — on a failed load too — so the class is
  // always eventually added.
  document.fonts.ready.then(() => wordmark?.classList.add("is-booting"));

  animateWordmark(wordmark, reduced);

  /* ---------- boot ---------- */

  // Every value here is already stated somewhere further down the page. The
  // log is a bit of theatre; it is not the place to introduce a fact.
  const BOOT_LOG = [
    ["initializing", "ok"],
    ["resolving identity", "ben emdon"],
    ["mounting teams", "code forge, code review"],
    ["locating", "ottawa, ca"],
  ];

  // Braille rather than the circle spinners git-merge uses: Iosevka draws
  // those at two columns and these at one, so these keep the mark column the
  // same width from frame to frame.
  const SPINNER = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];

  // Roughly 2.3s of log, plus however long main.js took to arrive. Slow enough
  // that each line lands as its own event and the spinner gets a few frames on
  // screen before it resolves, rather than the whole thing reading as one
  // flash. Anything much past this stops being a flourish and starts being a
  // wait, which is what the skip is for.
  const LINE_EVERY = 200;
  const LINE_SETTLES = 240;
  const LAST_BEAT = 1300;

  const boot = document.querySelector("[data-boot]");

  // Runs on every load, the way the page it is borrowed from does. Skipped outright for anyone who asked not to be animated:
  // for them it is a blank screen between them and the content, which is the
  // opposite of the point.
  if (boot && !reduced.matches) {
    const log = boot.querySelector("[data-boot-log]");
    const logo = wordmark.cloneNode(true);
    boot.querySelector("[data-boot-logo]").append(logo);
    boot.hidden = false;

    // The clone is taken before the block glyphs have loaded, since they are
    // served display=block and the boot starts immediately. Rather than hold
    // the whole screen for the font, let the logo run the same paint-in the
    // real one does, the moment it can.
    document.fonts.ready.then(() => logo.classList.add("is-booting"));

    const timers = [];
    const marks = [];
    let frame = 0;

    const spin = setInterval(() => {
      frame = (frame + 1) % SPINNER.length;
      for (const mark of marks) {
        if (!mark.dataset.done) mark.textContent = SPINNER[frame];
      }
    }, 80);

    function done() {
      clearInterval(spin);
      timers.forEach(clearTimeout);
      removeEventListener("keydown", done);
      boot.remove();
    }

    // Nobody should be held here. Any key or any click cuts to the page. The
    // click listener leaves with the element; the keydown one has to be taken
    // off by hand, or it outlives the boot and fires on the first key the
    // visitor presses at the real page.
    addEventListener("keydown", done);
    boot.addEventListener("click", done);

    function span(className, text) {
      const el = document.createElement("span");
      el.className = className;
      el.textContent = text;
      return el;
    }

    BOOT_LOG.forEach(([task, value], i) => {
      timers.push(
        setTimeout(() => {
          const line = document.createElement("li");
          line.className = "boot__line";

          const mark = span("boot__mark", SPINNER[frame]);
          const result = span("boot__value is-pending", "_");
          marks.push(mark);

          line.append(
            mark,
            span("boot__task", task),
            // Longer than any gap it has to fill; the overflow is clipped.
            span("boot__dots", ".".repeat(80)),
            result
          );
          log.append(line);

          timers.push(
            setTimeout(() => {
              mark.dataset.done = "1";
              mark.textContent = "\u2713";
              result.className = "boot__value";
              result.textContent = value;
            }, LINE_SETTLES)
          );
        }, i * LINE_EVERY)
      );
    });

    // A beat on the finished log, then out.
    timers.push(setTimeout(done, BOOT_LOG.length * LINE_EVERY + LINE_SETTLES + LAST_BEAT));
  }

  /* ---------- clock ---------- */

  const clock = document.querySelector("[data-clock]");
  const clockTime = document.querySelector("[data-clock-time]");
  const hours = document.querySelector("[data-clock-hours]");
  const minutes = document.querySelector("[data-clock-minutes]");

  // His time, not the reader's: the footer already says Ottawa. hourCycle
  // rather than hour12: false, which resolves to h24 in some locales and
  // prints midnight as 24:07.
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

    // Land on the minute rather than drifting a second past it, which a fixed
    // 60s interval would do a little more of every hour.
    setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  if (clock) tick();
}

setUp();
