/**
 * @name LANDING_SCRIPT
 * @description Tiny scroll-driven animation controller for the public protocol engine scene.
 */
export const LANDING_SCRIPT = `
(() => {
  const scene = document.querySelector('[data-engine-scene]');
  if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let ticking = false;

  const update = () => {
    const rect = scene.getBoundingClientRect();
    const progress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
    scene.style.setProperty('--engine-tilt', String(-10 + progress * 18) + 'deg');
    scene.style.setProperty('--engine-spin', String(progress * 42) + 'deg');
    scene.style.setProperty('--ring-a', String(progress * -90) + 'deg');
    scene.style.setProperty('--ring-b', String(progress * 120) + 'deg');
    scene.style.setProperty('--trace-opacity', String(.22 + progress * .55));
    scene.style.setProperty('--node-a-x', String(10 - progress * 44) + 'px');
    scene.style.setProperty('--node-a-y', String(16 - progress * 34) + 'px');
    scene.style.setProperty('--node-b-x', String(8 - progress * 42) + 'px');
    scene.style.setProperty('--node-b-y', String(44 - progress * 40) + 'px');
    scene.style.setProperty('--node-c-x', String(44 - progress * 46) + 'px');
    scene.style.setProperty('--node-c-y', String(4 - progress * 40) + 'px');
    scene.style.setProperty('--node-d-x', String(34 - progress * 36) + 'px');
    scene.style.setProperty('--node-d-y', String(34 - progress * 38) + 'px');
    ticking = false;
  };

  const requestUpdate = () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  };

  update();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
})();
`;
