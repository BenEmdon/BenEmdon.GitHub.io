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
  const centreLine = new IntersectionObserver(
    (entries) => {
      // Between two sections sit a divider and its margins — about 72px where
      // nothing is at the centre. Clearing the frame there makes it strobe, so
      // whichever section reached the middle last keeps it until the next one
      // arrives.
      const arrived = entries.findLast((entry) => entry.isIntersecting);
      if (!arrived) return;

      for (const section of sections) {
        section.classList.toggle("is-active", section === arrived.target);
      }
    },
    { rootMargin: "-50% 0px -50% 0px" }
  );

  for (const section of sections) centreLine.observe(section);
}

setUp();
