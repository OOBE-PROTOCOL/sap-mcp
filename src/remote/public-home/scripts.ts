/**
 * @name LANDING_SCRIPT
 * @description Tiny scroll-driven animation controller for the public protocol engine scene.
 */
export const LANDING_SCRIPT = `
(() => {
  const scene = document.querySelector('[data-engine-scene]');
  const machine = document.querySelector('[data-machine-section]');
  if ((!scene && !machine) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let ticking = false;

  const update = () => {
    if (scene) {
      const rect = scene.getBoundingClientRect();
      const progress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
      scene.style.setProperty('--engine-tilt', String(-12 + progress * 20) + 'deg');
      scene.style.setProperty('--engine-spin', String(progress * 48) + 'deg');
      scene.style.setProperty('--orbit-a', String(progress * -120) + 'deg');
      scene.style.setProperty('--orbit-b', String(progress * 150) + 'deg');
      scene.style.setProperty('--orbit-c', String(progress * 90) + 'deg');
      scene.style.setProperty('--chip-spread', String(progress * 24) + 'px');
      scene.style.setProperty('--hero-glow', String(.14 + progress * .34));
    }

    if (machine) {
      const rect = machine.getBoundingClientRect();
      const progress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
      machine.style.setProperty('--machine-progress', progress.toFixed(3));
      machine.style.setProperty('--machine-open', String(progress * 150) + 'px');
      machine.style.setProperty('--machine-rotate', String(-8 + progress * 16) + 'deg');
      machine.style.setProperty('--machine-fade', String(.18 + progress * .82));
      machine.style.setProperty('--machine-rail-scale', String(.4 + progress * .6));
    }
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
