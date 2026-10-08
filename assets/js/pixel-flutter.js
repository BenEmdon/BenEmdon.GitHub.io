// Decorative pixel weather, kept outside the reading column. One bounded
// canvas avoids hundreds of animated DOM nodes and any layout work per frame.
export function attachPixelFlutter(reduced) {
  const toggle = document.querySelector("[data-motion-toggle]");
  const page = document.querySelector(".page");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context || !toggle || !page) return { repaint() {} };

  canvas.className = "pixel-flutter";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const KEY = "pixel-motion";
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch {}
  let width = 0;
  let height = 0;
  let left = 0;
  let right = 0;
  let grid = 12;
  let pixels = [];
  let frame = 0;
  let last = 0;
  let time = 0;
  let color = "";
  let pointer = null;

  function repaint() {
    color = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim();
    // Resolve light-dark() and var() through the canvas element's CSS color.
    canvas.style.color = color;
    color = getComputedStyle(canvas).color;
  }

  function measure() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const bounds = page.getBoundingClientRect();
    const gutter = width < 640 ? 3 : 24;
    left = Math.max(0, bounds.left - gutter);
    right = Math.min(width, bounds.right + gutter);
    grid = width < 640 ? 8 : 12;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    // A seeded distribution keeps resize from randomly replacing the field.
    let seed = 1937;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    pixels = [];
    const count = Math.min(width < 640 ? 48 : 220, Math.floor((left + width - right) * height / 1600));
    for (let i = 0; i < count; i++) {
      const side = random() < 0.5 ? "left" : "right";
      const margin = side === "left" ? left : width - right;
      if (margin < 6) continue;
      // Bias toward the outer edge, leaving the page plenty of breathing room.
      const inset = Math.pow(random(), 1.8) * (margin - 6);
      pixels.push({
        x: side === "left" ? inset : width - inset - 6,
        y: random() * (height + 80),
        phase: random() * Math.PI * 2,
        speed: 4 + random() * 9,
        size: width < 640 ? 3 : (random() < 0.2 ? 6 : 4),
        alpha: 0.08 + random() * 0.22,
        side,
      });
    }
    context.clearRect(0, 0, width, height);
    repaint();
  }

  function draw(now) {
    frame = requestAnimationFrame(draw);
    if (now - last < 1000 / 24) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    time += dt;
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    const gustAge = pointer ? (now - pointer.at) / 1000 : 2;
    const gust = Math.max(0, 1 - gustAge / 1.2);

    for (const pixel of pixels) {
      pixel.y -= pixel.speed * dt;
      if (pixel.y < -40) pixel.y = height + 40;
      let x = pixel.x + Math.sin(time * 0.7 + pixel.phase + pixel.y / 180) * grid;
      let y = pixel.y + Math.cos(time * 0.9 + pixel.phase) * grid * 0.6;
      let energy = 0;
      if (gust) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        energy = Math.max(0, 1 - distance / 150) * gust;
        x += dx / Math.max(distance, 1) * energy * 30;
        y += dy / Math.max(distance, 1) * energy * 22;
      }
      // Snap the drift to a half-grid, so it reads as pixels rather than dust.
      x = Math.round(x / (grid / 2)) * (grid / 2);
      y = Math.round(y / (grid / 2)) * (grid / 2);
      const room = pixel.side === "left" ? left - x - pixel.size : x - right;
      if (room < 0) continue;
      const fade = Math.min(1, room / 30, Math.max(0, y / 50), Math.max(0, (height - y) / 50));
      context.globalAlpha = fade * Math.min(0.5, pixel.alpha * (0.75 + Math.sin(time + pixel.phase) * 0.25) + energy * 0.18);
      context.fillRect(x, y, pixel.size, pixel.size);
    }
    context.globalAlpha = 1;
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    pointer = null;
    const running = enabled && !reduced.matches;
    canvas.hidden = !running;
    toggle.hidden = false;
    toggle.disabled = reduced.matches;
    toggle.textContent = running ? "motion on" : "motion off";
    toggle.setAttribute("aria-pressed", String(running));
    toggle.setAttribute("aria-label", reduced.matches
      ? "Pixel motion off: follows your reduced-motion preference"
      : `Pixel motion ${running ? "on" : "off"}. ${running ? "Pause" : "Enable"} pixel animation.`);
    if (running && !document.hidden) frame = requestAnimationFrame(draw);
  }

  toggle.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch {}
    sync();
  });
  document.addEventListener("pointermove", (event) => {
    if (!enabled || reduced.matches || document.hidden || event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer = null; });
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  window.addEventListener("resize", measure, { passive: true });
  new ResizeObserver(measure).observe(page);
  measure();
  sync();
  return { repaint };
}
