/*
  The shared page chrome: one definition of the pieces every page
  carries, rendered by this file and no other.

  The pieces: the boot screen shell, the page nav (both rows), the
  theme scene control (masthead and footer), the footer system line
  with its clock and keys toggle, and the keys help panel. Until
  now each page held its own copy of all of them, and the copies
  drifted: the nav order was fixed in one round of edits and the
  pages rebuilt from an older tree quietly carried the old order
  again. Here the nav is a single list in a single file; a page
  cannot carry a different order, because it carries no nav at all.

  The mechanism, chosen for a site with no build step: this is a
  classic script loaded in <head>, before the body parses. Each
  page puts a one-line inline script where a piece of chrome goes,
  and the call replaces that script element with the rendered
  markup, during parsing, at that exact position. The markup is
  therefore in the document before anything below it is parsed,
  let alone painted: there is no late render to pop in and no
  layout shift, on a first load (where the boot screen covers the
  page anyway) or on a follow-up load (where the page shows at
  once). A module script could not promise that: modules run after
  parsing, so a module-rendered nav would arrive after first paint
  on a follow-up load.

  The cost, stated plainly: without JS the chrome does not render.
  The pages were already theatre without JS (the boot, the scenes,
  the clocks are all JS), and the content itself is untouched, but
  the nav and footer now join the list of things a no-JS visitor
  does not get. That is the price of one source of truth without a
  build step, and it is paid knowingly.

  This file also carries the two head scripts every page used to
  inline: the pre-paint theme read (it has to run before first
  paint, and this file is already in <head> for the components)
  and the GoatCounter path config (it has to exist before
  count.js loads, and count.js is tagged after this file).
*/

/* ---------- pre-paint theme ---------- */

// A saved theme applies before first paint, so it never flashes
// the other one. Same read the pages used to inline.
try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch {}

/* ---------- visit counting ---------- */

// GoatCounter. No cookies, no fingerprinting, no persistent
// identifier, nothing personal stored, so there is nothing to
// consent to and no banner to show.
//
// The site code in data-goatcounter (on the count.js tag in each
// page's <head>) is public on purpose. It is a write-only endpoint
// that hits are posted to, not a key, and it grants no read access
// to the dashboard. Anything that counts visits from the browser
// has to name its destination in the page source; there is no
// version of this that stays private.
//
// What that does leave open is someone pointing a mirror of this
// page at the same endpoint, so the path callback below drops any
// hit that did not come from the real host. It has to live in
// `path` and not in `filter`: count.js assigns over
// `goatcounter.filter` when it loads, but reads `goatcounter.path`,
// and a null path aborts the hit. If this site ever moves to a
// custom domain, add that hostname here or counting stops.
//
// count.js already skips localhost, file://, iframes and
// prerenders. It does not check Do Not Track, so that check is
// here too.
window.goatcounter = {
  path(p) {
    if (location.hostname !== "benemdon.github.io") return null;
    if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return null;
    return p;
  },
};

/* ---------- the components ---------- */

// The nav. One list, one order, every page, both rows. The current
// page is derived from the URL, never declared per page, so the
// marking cannot disagree with the page it lands on either.
const NAV_LINKS = [
  { href: "index.html", label: "home" },
  { href: "music.html", label: "music" },
];

function currentPage() {
  const file = location.pathname.split("/").pop();
  return file === "" ? "index.html" : file;
}

// The boot cover, laid the moment the boot shell is rendered,
// before the parser reaches the page below it. The full boot's
// covering mark (the document attribute the stylesheet hides
// main behind) used to be set by boot.js when the page's module
// finally ran, so for the whole module-graph fetch the page sat
// uncovered: a refresh showed the reader a blank page, no
// bootloader and no content, until the graph landed. The cover
// cannot wait for any module, so it is laid here, in the one
// script guaranteed to run during parsing. The decision mirrors
// boot.js's decideBootSurface with the inputs a parse-time
// script has: the home page covers on every load, any other
// page covers until the session has seen a full boot, and a
// reduced-motion load never covers. The experiment badge is
// not in the document yet at this point; badge pages boot in
// full on every load regardless, so a cover laid here can only
// agree with the decision boot.js makes when it arrives, and
// boot.js lifts the cover again on any load it decides against.
// The session flag is only read here, never written: boot.js
// spends it when the screen actually opens.
//
// The watchdog is the cover's failsafe: if boot.js never takes
// ownership of the screen (its module, or the page's graph
// behind it, failed to load at all), the cover and the shell
// come down and the page is revealed rather than held hidden
// behind a boot that is not coming. boot.js marks the shell
// when it takes ownership and clears this timer; a shell it
// owns is never touched here.
function coverBoot() {
  try {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced) return;
    const path = window.location.pathname || "";
    const home = path === "/" || path.endsWith("/index.html");
    let seen = false;
    try {
      seen = sessionStorage.getItem("boot-seen") === "1";
    } catch {
      // Storage refused: treat the load as a first one and cover.
    }
    if (!home && seen) return;
    document.documentElement.dataset.bootHide = "";
    window.__bootCoverTimer = setTimeout(() => {
      window.__bootCoverTimer = null;
      if (!document.documentElement.hasAttribute("data-boot-hide")) return;
      const boot = document.querySelector("[data-boot]");
      if (boot && boot.dataset.bootAdopted !== undefined) return;
      delete document.documentElement.dataset.bootHide;
      if (boot) boot.remove();
    }, 30000);
  } catch {
    // A cover that fails to lay must never break the page: the
    // boot falls back to opening when boot.js arrives, as it
    // did before the cover moved here.
  }
}

// Replace the calling inline script with the parsed markup. Runs
// during parsing, so the nodes take the script's place in the
// document before the parser moves on.
function mount(html) {
  const script = document.currentScript;
  if (!script) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  script.replaceWith(...tpl.content.childNodes);
}

function sceneControlHTML(masthead) {
  return (
    `<div class="theme-scene-control${masthead ? " theme-scene-control--masthead" : ""}" data-theme-scene-control>` +
    `<button class="theme-scene-button" type="button" data-theme-scene-button aria-label="Theme: system. Activate to switch to light">` +
    `<canvas class="theme-scene" data-theme-scene width="24" height="12" aria-hidden="true"></canvas>` +
    `</button>` +
    `<span class="theme-scene-current" data-theme-scene-current hidden>system</span>` +
    `</div>`
  );
}

window.SiteChrome = {
  // The boot screen. Ships hidden and empty: boot.js fills it and
  // takes it away again. aria-hidden because it is theatre; a
  // screen reader should be reading the page below it.
  boot() {
    mount(
      `<div class="boot" data-boot aria-hidden="true" hidden>` +
        `<div class="boot__inner">` +
        `<div data-boot-logo></div>` +
        `<div class="boot__row">` +
        `<div class="boot__icon" data-boot-icon></div>` +
        `<div class="boot__main"><ul class="boot__log" data-boot-log></ul></div>` +
        `</div></div></div>`
    );
    coverBoot();
  },

  // One nav component, two placements. The bottom row is the same
  // component with its own accessible name, as before.
  nav(position) {
    const here = currentPage();
    const links = NAV_LINKS.map(
      (l) =>
        `<a href="${l.href}"${l.href === here ? ` aria-current="page"` : ""}>${l.label}</a>`
    ).join("");
    mount(
      `<nav class="pagenav" aria-label="${position === "bottom" ? "Pages (bottom)" : "Pages"}">${links}</nav>`
    );
  },

  sceneControl(masthead) {
    mount(sceneControlHTML(!!masthead));
  },

  // The footer system line, the same on every page: Ottawa, ON and
  // Ottawa's live time, the keys toggle, and the footer scene
  // control. The clock ships hidden and is unwrapped by the page's
  // clock wiring, so a visitor without JS sees "Ottawa, ON" rather
  // than a dead --:--.
  footer() {
    mount(
      `<footer class="footer">` +
        `<p>Ottawa, ON<span class="clock" data-clock hidden><time class="clock__time" data-clock-time><span data-clock-hours>--</span><span class="clock__tick" aria-hidden="true">:</span><span data-clock-minutes>--</span></time></span></p>` +
        `<div class="footer__controls">` +
        `<button class="footer__button" type="button" data-keys-toggle aria-expanded="false" aria-controls="keys"><kbd>?</kbd> keys</button>` +
        sceneControlHTML(false) +
        `</div></footer>`
    );
  },

  // The keys help. The shell and the two standing entries (theme,
  // this panel) live here; the numbered entries are the page's own
  // section list, handed in at the mount point. Ships hidden and
  // stays hidden without JS, since every key it lists is wired up
  // in the page's script.
  keys(entries) {
    const items = [...entries, ["t", "theme"], ["?", "this"]]
      .map(
        ([cap, label]) =>
          `<li><kbd data-cap="${cap}">${cap}</kbd><span class="keys__label">${label}</span></li>`
      )
      .join("");
    mount(`<div class="keys" id="keys" data-keys hidden><ul class="keys__list">${items}</ul></div>`);
  },
};
