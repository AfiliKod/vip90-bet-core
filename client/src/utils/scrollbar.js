const FADE_MS = 800;
const timers = new WeakMap();

document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!(el instanceof Element)) return;
  el.classList.add('is-scrolling');
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), FADE_MS));
}, { passive: true, capture: true });
