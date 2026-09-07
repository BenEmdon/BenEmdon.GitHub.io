import { attach } from "./dither.js";
import { createWordmark } from "./wordmark.js";

const THEME_KEY = "theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

// [data-theme] is only set once the visitor chooses; until then the OS decides.
function activeTheme() {
  return document.documentElement.dataset.theme ?? (systemDark.matches ? "dark" : "light");
}

function setUp() {
  const repaints = [];

  /* ---------- wordmark ---------- */

  const wordmarkCanvas = document.querySelector("[data-wordmark-canvas]");
  if (wordmarkCanvas) repaints.push(createWordmark(wordmarkCanvas));

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
}

setUp();
