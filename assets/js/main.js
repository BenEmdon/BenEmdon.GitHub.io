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

  for (const frame of document.querySelectorAll("[data-dither]")) {
    const canvas = frame.querySelector("[data-dither-canvas]");
    const photo = frame.querySelector("img");

    attach(canvas, photo)
      .then((repaint) => repaints.push(repaint))
      // Without the dither the photo simply shows through, so there is nothing
      // to clean up on failure.
      .catch(() => {});

    // Hover handles the reveal on pointer devices; this covers touch.
    frame.addEventListener("click", () => {
      frame.classList.toggle("is-revealed");
    });
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
