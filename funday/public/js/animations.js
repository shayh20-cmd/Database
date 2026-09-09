const gsap = window.gsap;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function playFrameReveal(items) {
  if (prefersReducedMotion) {
    gsap.set(items, { opacity: 1, y: 0 });
    return;
  }

  gsap.fromTo(items, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out' });
}

export function initScrollReveal() {
  const frames = document.querySelectorAll('.frame[data-reveal]');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const frame = entry.target;
        const items = frame.querySelectorAll('[data-reveal-item]');
        playFrameReveal(items);
        observer.unobserve(frame);
      }
    },
    { threshold: 0.35 }
  );

  for (const frame of frames) {
    observer.observe(frame);
  }
}

export function initScrollCue() {
  const cue = document.querySelector('.scroll-cue');
  if (!cue || prefersReducedMotion) return;
  gsap.to(cue, {
    y: 10,
    duration: 1.1,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}
