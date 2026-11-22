/*
  Blog experiment: the theme scene control, wired the same way the Mochi
  page wires it (mochi.js), minus everything page-specific. The picture
  is the control: clicking it cycles light, dark, system; the first
  click out of system jumps to the opposite of what system resolves to,
  so the click always lands on a visible change. The mode word beside
  the scene is a tap's receipt: it shows for about 2.5 seconds, then
  the control is the picture alone again.
*/

import { createThemeScene } from "./theme-scene.js";

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
      // Private-mode Safari refuses writes; the choice still holds this visit.
    }
  }

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

setUpThemeToggle();
