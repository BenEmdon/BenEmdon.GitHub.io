import { attach } from "./dither.js";

const THEME_KEY = "theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

// [data-theme] is only set once the visitor chooses; until then the OS decides.
function activeTheme() {
  return document.documentElement.dataset.theme ?? (systemDark.matches ? "dark" : "light");
}

function setUp() {
  const repaints = [];

  /* ---------- portrait ---------- */

  // Eight steps of it, matching the wordmark's own reveal. Few enough that each
  // one lands as a separate frame rather than reading as a fade.
  const DISSOLVE_STEPS = 8;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

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

  const syncToggle = () => {
    const next = activeTheme() === "dark" ? "light" : "dark";
    toggle.textContent = next;
    toggle.setAttribute("aria-label", `Switch to ${next} theme`);
  };

  toggle.addEventListener("click", () => {
    const next = activeTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private-mode Safari refuses writes; the theme still applies this visit.
    }
    syncToggle();
    repaints.forEach((repaint) => repaint());
  });

  // Untouched, the page follows the OS.
  systemDark.addEventListener("change", () => {
    if (document.documentElement.dataset.theme) return;
    syncToggle();
    repaints.forEach((repaint) => repaint());
  });

  syncToggle();

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

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
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

  /* ---------- wordmark spotlight ---------- */

  // Listens on the document rather than the wordmark: the art is 72px tall, so
  // a listener bound to it would only ever fire once the pointer was already
  // on top of the name, and would never hear about the pointer leaving the
  // window at all.
  if (wordmark && window.matchMedia("(hover: hover)").matches) {
    // Counted off the art itself rather than hardcoded, so re-rendering the
    // name at a different size or in a different font can't desync the grid.
    // The widest row, not the first: rows here are ragged, and sizing cells by
    // a short one walks the light off the end of the long ones.
    const rows = wordmark.textContent.split("\n");
    const columns = Math.max(...rows.map((row) => row.length));
    const range = document.createRange();
    let cell = { w: 1, h: 1 };
    let last = null;

    // Measured from the laid-out text, not from the element. The <pre> is a
    // block, so it is as wide as the column (576px) while the art inside it is
    // 540px — sizing cells by the box put the light five characters adrift by
    // the end of the name. A Range over the contents reports what was actually
    // painted.
    function measure() {
      range.selectNodeContents(wordmark);
      const art = range.getBoundingClientRect();
      cell = { w: art.width / columns, h: art.height / rows.length };
      // The gradient sizes its bands off this, so its edges land on character
      // boundaries instead of slicing a glyph down the middle.
      wordmark.style.setProperty("--cell", `${cell.w}px`);
    }

    measure();
    // Again once the block glyphs arrive. The subset loads display=block, so
    // the first measurement is taken against whatever the fallback was and
    // comes back with the wrong advance width — enough to put the light half a
    // dozen characters off by the end of the name.
    document.fonts.ready.then(measure);
    window.addEventListener("resize", measure);

    document.addEventListener("pointermove", (event) => {
      const box = wordmark.getBoundingClientRect();

      // The band is full height, so it would sit lit while you read the rest of
      // the page. Past a couple of rows' clearance above or below the art the
      // light is parked instead, and the name goes back to being type.
      const away =
        event.clientY < box.top - box.height || event.clientY > box.bottom + box.height;

      // Snapped to a boundary rather than a centre: the gradient's stops are
      // whole cells out from here, so this has to be a cell edge for them to
      // land on one too.
      const x = away
        ? -999
        : Math.round(Math.floor((event.clientX - box.left) / cell.w) * cell.w);

      // Most moves land in the cell the last one did. Bailing keeps this to one
      // style write per cell crossed rather than one per pointer event.
      if (x === last) return;
      last = x;

      wordmark.style.setProperty("--spot-x", `${x}px`);
    });
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
