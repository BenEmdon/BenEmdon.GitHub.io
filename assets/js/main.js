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

  /* ---------- section anchors ---------- */

  const toast = document.querySelector("[data-toast]");
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = "";
    toast.append(
      Object.assign(document.createElement("span"), { className: "toast__bracket", textContent: "[" }),
      ` ${message} `,
      Object.assign(document.createElement("span"), { className: "toast__bracket", textContent: "]" })
    );
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2000);
  }

  // Restarts a CSS animation on repeat clicks: swapping the class back in on
  // the same tick is a no-op, so the old run has to be flushed first. Cleans
  // its own class up afterwards rather than leaving every visited section
  // permanently marked.
  function highlight(section) {
    if (!section) return;
    section.classList.remove("is-highlighted");
    void section.offsetWidth;
    section.classList.add("is-highlighted");
    section.addEventListener(
      "animationend",
      () => section.classList.remove("is-highlighted"),
      { once: true }
    );
  }

  function sectionForHash(hash) {
    const heading = document.getElementById(hash.slice(1));
    return heading?.closest(".section") ?? null;
  }

  for (const link of document.querySelectorAll(".anchor")) {
    link.addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}${link.getAttribute("href")}`;
      navigator.clipboard?.writeText(url).then(
        () => showToast("copied link to clipboard"),
        () => {} // clipboard permission denied; the hash still navigates fine
      );
      highlight(link.closest(".section"));
    });
  }

  if (location.hash) highlight(sectionForHash(location.hash));
  window.addEventListener("hashchange", () => highlight(sectionForHash(location.hash)));
}

setUp();
