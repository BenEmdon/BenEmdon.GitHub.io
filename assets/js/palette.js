// Experiment: command palette + working terminal prompt.
// Vanilla JS, no build step. Deliberately decoupled from main.js:
// theme and keys are driven by clicking the existing footer buttons,
// jumps use scrollIntoView + hash, exactly like the 1-5 keys do.
//
// Pixel rule: the strip at the top of the palette is a fixed grid of
// 4px squares on an 8px pitch. On open, squares light in place in
// 75ms steps, left to right. Nothing moves, nothing fades. The strip
// is a short segment (16 cells) and lights several cells per step, so
// it finishes in ~300ms instead of trailing a fast typist.
// prefers-reduced-motion: every square lights at once, jumps are instant.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const STEP_MS = 75;
const PITCH = 8;
const CELL = 4;

const HIRING_URL = "https://stripe.com/careers/listing/staff-software-engineer-code-forge/8293644";

function jumpTo(id) {
  const heading = document.getElementById(id);
  const section = heading?.closest(".section") || heading;
  if (!section) return;
  section.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}
function clickTheme() { document.querySelector("[data-theme-toggle]")?.click(); }
function toggleKeys() {
  const keys = document.querySelector("[data-keys]");
  if (keys?.hidden) document.querySelector("[data-keys-toggle]")?.click();
}
function openExternal(url) { window.open(url, "_blank", "noopener"); }

const COMMANDS = [
  { id: "whoami",    cat: "go",    title: "whoami",    hint: "role, team, org, Ottawa",        key: "1", keywords: "identity ben role", run: () => jumpTo("whoami") },
  { id: "about",     cat: "go",    title: "about",     hint: "systems between writing and shipping", key: "2", keywords: "bio interests", run: () => jumpTo("about") },
  { id: "thinking",  cat: "go",    title: "thinking",  hint: "version control, blob storage, AI review", key: "3", keywords: "ideas questions", run: () => jumpTo("thinking") },
  { id: "work",      cat: "go",    title: "work",      hint: "Stripe, GitHub, Shopify, Carleton", key: "4", keywords: "cv resume jobs history", run: () => jumpTo("work") },
  { id: "elsewhere", cat: "go",    title: "elsewhere", hint: "x, linkedin, instagram, github", key: "5", keywords: "social links contact", run: () => jumpTo("elsewhere") },
  { id: "hiring",    cat: "open",  title: "hiring: Staff SWE, Code Forge", hint: "Stripe · office or remote · seniors welcome", key: "↵", keywords: "job careers role apply stripe code forge", run: () => openExternal(HIRING_URL) },
  { id: "github",    cat: "open",  title: "github",    hint: "@BenEmdon",   key: "", keywords: "code repos", run: () => openExternal("https://github.com/BenEmdon") },
  { id: "linkedin",  cat: "open",  title: "linkedin",  hint: "in/benemdon", key: "", keywords: "social profile", run: () => openExternal("https://www.linkedin.com/in/benemdon") },
  { id: "x",         cat: "open",  title: "x",         hint: "@BenEmdon",   key: "", keywords: "twitter social", run: () => openExternal("https://x.com/BenEmdon") },
  { id: "instagram", cat: "open",  title: "instagram", hint: "@ben.emdon",  key: "", keywords: "social photos", run: () => openExternal("https://www.instagram.com/ben.emdon/") },
  { id: "theme",     cat: "do",    title: "theme",     hint: "cycle system / light / dark", key: "t", keywords: "dark light mode toggle", run: clickTheme },
  { id: "keys",      cat: "do",    title: "keys",      hint: "show the keyboard legend", key: "?", keywords: "help shortcuts legend", run: toggleKeys },
  { id: "top",       cat: "go",    title: "top",       hint: "back to the wordmark", key: "", keywords: "home start scroll up", run: () => window.scrollTo({ top: 0, behavior: reduced.matches ? "auto" : "smooth" }) },
];

// Subsequence fuzzy score: contiguous runs and word starts score more.
function fuzzyScore(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 + (t.startsWith(q) ? 40 : 0) - t.indexOf(q);
  let qi = 0, score = 0, run = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++; run++; score += run * 2 + (ti === 0 || t[ti - 1] === " " ? 6 : 0);
    } else run = 0;
  }
  return qi === q.length ? score : -1;
}
function search(query) {
  if (!query.trim()) return COMMANDS.slice();
  return COMMANDS
    .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, c.keywords), fuzzyScore(query, c.hint)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

/* ---------- palette ---------- */

const root = document.querySelector("[data-palette]");
const input = document.querySelector("[data-palette-input]");
const list = document.querySelector("[data-palette-list]");
const count = document.querySelector("[data-palette-count]");
const strip = document.querySelector("[data-palette-pixels]");
let results = COMMANDS.slice();
let selected = 0;
let lastFocus = null;
let stripTimer = 0;

const STRIP_CELLS = 16;
const STRIP_PER_STEP = 4;
function lightStrip() {
  clearInterval(stripTimer);
  strip.replaceChildren();
  const fit = Math.floor(strip.clientWidth / PITCH) || STRIP_CELLS;
  const n = Math.max(8, Math.min(STRIP_CELLS, fit));
  const cells = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "palette__pixel";
    el.style.left = `${i * PITCH + 2}px`;
    strip.append(el);
    cells.push(el);
  }
  if (reduced.matches) { cells.forEach((el) => el.classList.add("is-lit")); return; }
  let i = 0;
  stripTimer = setInterval(() => {
    if (i >= cells.length) { clearInterval(stripTimer); return; }
    for (let k = 0; k < STRIP_PER_STEP && i < cells.length; k++) {
      cells[i++].classList.add("is-lit");
    }
  }, STEP_MS);
}

function render() {
  list.replaceChildren();
  if (!results.length) {
    const li = document.createElement("li");
    li.className = "palette__empty";
    li.textContent = "no match. esc to close, or try: work, hiring, theme";
    list.append(li);
  }
  results.forEach((cmd, i) => {
    const li = document.createElement("li");
    li.className = "palette__item" + (i === selected ? " is-selected" : "");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === selected));
    const cat = document.createElement("span"); cat.className = "palette__item-cat"; cat.textContent = cmd.cat;
    const title = document.createElement("span"); title.className = "palette__item-title"; title.textContent = cmd.title;
    const hint = document.createElement("span"); hint.className = "palette__item-hint"; hint.textContent = cmd.hint;
    li.append(cat, title, hint);
    if (cmd.key) { const k = document.createElement("span"); k.className = "palette__item-key"; k.textContent = cmd.key; li.append(k); window.mochiKeycap?.(k, cmd.key); }
    li.addEventListener("pointermove", () => { if (selected !== i) { selected = i; render(); } });
    li.addEventListener("click", () => run(cmd));
    list.append(li);
  });
  count.textContent = `${results.length} command${results.length === 1 ? "" : "s"}`;
}

function openPalette() {
  if (!root.hidden) return;
  lastFocus = document.activeElement;
  root.hidden = false;
  input.value = "";
  results = COMMANDS.slice();
  selected = 0;
  render();
  lightStrip();
  input.focus();
}
function closePalette() {
  if (root.hidden) return;
  root.hidden = true;
  clearInterval(stripTimer);
  if (lastFocus && lastFocus !== input) lastFocus.focus?.();
}
function run(cmd) { closePalette(); cmd?.run(); }

input?.addEventListener("input", () => { results = search(input.value); selected = 0; render(); });
input?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { selected = Math.min(selected + 1, results.length - 1); render(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { selected = Math.max(selected - 1, 0); render(); e.preventDefault(); }
  else if (e.key === "Enter") { run(results[selected]); e.preventDefault(); }
  else if (e.key === "Tab") { selected = (selected + (e.shiftKey ? -1 : 1) + results.length) % Math.max(results.length, 1); render(); e.preventDefault(); }
});
root?.querySelector("[data-palette-close]")?.addEventListener("click", closePalette);
document.querySelector("[data-palette-open]")?.addEventListener("click", openPalette);

function isTyping(el) {
  return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ""));
}
document.addEventListener("keydown", (e) => {
  const modK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
  if (modK) { e.preventDefault(); root.hidden ? openPalette() : closePalette(); return; }
  if (!root.hidden) {
    if (e.key === "Escape") { closePalette(); e.preventDefault(); }
    return; // palette input owns the rest; main.js already ignores inputs
  }
  if (e.key === "/" && !isTyping(e.target)) { openPalette(); e.preventDefault(); }
});

/* ---------- footer terminal prompt ---------- */

const form = document.querySelector("[data-term-form]");
const termInput = document.querySelector("[data-term-input]");
const out = document.querySelector("[data-term-out]");
const SECTIONS = ["whoami", "about", "thinking", "work", "elsewhere"];
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = termInput.value.trim();
  const cmd = raw.toLowerCase();
  termInput.value = "";
  if (!cmd) return;
  if (cmd === "help") out.textContent = "commands: whoami · about · thinking · work · elsewhere · hiring · theme · palette · clear";
  else if (cmd === "clear") out.textContent = "";
  else if (cmd === "theme") { clickTheme(); out.textContent = "theme cycled. press t anywhere, or use the footer toggle."; }
  else if (cmd === "palette" || cmd === "cmd+k") { out.textContent = ""; openPalette(); }
  else if (cmd === "hiring") {
    out.textContent = "Staff Software Engineer, Code Forge at Stripe. Opening the listing…";
    openExternal(HIRING_URL);
  } else if (SECTIONS.includes(cmd)) { out.textContent = `$ ${cmd}`; jumpTo(cmd); }
  else if (cmd === "top" || cmd === "home") { out.textContent = "$ top"; window.scrollTo({ top: 0, behavior: reduced.matches ? "auto" : "smooth" }); }
  else out.textContent = `command not found: ${raw} — try help`;
});
