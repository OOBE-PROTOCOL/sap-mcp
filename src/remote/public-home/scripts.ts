/**
 * @name LANDING_SCRIPT
 * @description Tiny scroll-driven animation controller for the public protocol engine scene.
 */
export const LANDING_SCRIPT = `
(() => {
  const dropdowns = Array.from(document.querySelectorAll('[data-nav-dropdown]'));
  const mobileToggle = document.querySelector('[data-mobile-nav-toggle]');
  const mobilePanel = document.querySelector('#mobile-nav-panel');
  const mobileCloseTargets = Array.from(document.querySelectorAll('[data-mobile-nav-close], [data-mobile-nav-link]'));
  const setDetectedOs = () => {
    const platform = String(navigator.platform || '').toLowerCase();
    const userAgent = String(navigator.userAgent || '').toLowerCase();
    const os = userAgent.includes('windows') || platform.includes('win')
      ? 'windows'
      : userAgent.includes('linux') || platform.includes('linux')
        ? 'linux'
        : 'macos';
    document.documentElement.dataset.os = os;
  };

  setDetectedOs();

  const setMobileNavOpen = (isOpen) => {
    document.documentElement.classList.toggle('mobile-nav-open', isOpen);

    if (mobileToggle) {
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      mobileToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    }

    if (mobilePanel) {
      mobilePanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
  };

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      setMobileNavOpen(!document.documentElement.classList.contains('mobile-nav-open'));
    });
  }

  mobileCloseTargets.forEach((target) => {
    target.addEventListener('click', () => {
      setMobileNavOpen(false);
    });
  });

  dropdowns.forEach((dropdown) => {
    dropdown.addEventListener('toggle', () => {
      if (!dropdown.open) {
        return;
      }

      dropdowns.forEach((other) => {
        if (other !== dropdown) {
          other.open = false;
        }
      });
    });
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (dropdowns.some((dropdown) => dropdown.contains(target))) {
      return;
    }

    dropdowns.forEach((dropdown) => {
      dropdown.open = false;
    });
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    dropdowns.forEach((dropdown) => {
      dropdown.open = false;
    });
    setMobileNavOpen(false);
  });

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
