const gsap = window.gsap;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function playConstructionReveal(frame, items) {
  if (prefersReducedMotion) {
    gsap.set(items, { opacity: 1, y: 0 });
    return;
  }

  const beam = document.createElement('div');
  beam.className = 'construction-beam';
  const bolt = document.createElement('div');
  bolt.className = 'construction-bolt';
  const leaf = document.createElement('div');
  leaf.className = 'construction-leaf';

  frame.append(beam, bolt, leaf);

  const timeline = gsap.timeline({
    onComplete: () => {
      beam.remove();
      bolt.remove();
      leaf.remove();
    },
  });

  timeline
    .fromTo(beam, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.35, ease: 'power2.out' })
    .fromTo(
      bolt,
      { scale: 0, rotate: -90, opacity: 0 },
      { scale: 1, rotate: 0, opacity: 1, duration: 0.3, ease: 'back.out(2)' },
      '-=0.1'
    )
    .to([beam, bolt], { opacity: 0, duration: 0.25 }, '+=0.05')
    .fromTo(
      items,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out' },
      '-=0.15'
    )
    .fromTo(leaf, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, '-=0.3')
    .to(leaf, { opacity: 0, duration: 0.4 }, '+=0.6');
}

export function initScrollReveal() {
  const frames = document.querySelectorAll('.frame[data-reveal]');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const frame = entry.target;
        const items = frame.querySelectorAll('[data-reveal-item]');
        playConstructionReveal(frame, items);
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
