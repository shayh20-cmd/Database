import { playLeafBurst } from './leaf-burst.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The page's closing beat: the light rises to the middle of the screen, bursts into a
// firework of leaves, and the results appear out of it. Runs once, triggered either by
// submitting a vote (which scrolls here first) or simply by scrolling here.
export function initResultsFinale(trail) {
  const frame = document.getElementById('frame-results');
  if (!frame || !gsap) return;

  const items = frame.querySelectorAll('[data-reveal-item]');
  let played = false;

  // The results stay hidden until the burst reveals them, so #frame-results is
  // deliberately not marked data-reveal — this owns its entrance instead of
  // initScrollReveal.
  if (!prefersReducedMotion) {
    gsap.set(items, { opacity: 0, y: 24 });
  }

  function revealResults() {
    gsap.to(items, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' });
  }

  // Re-pinning the hero on the way back up briefly changes the document height, which
  // shifts every trigger below it and can fire this one's onEnter at a scroll position
  // nowhere near the results. Confirming the frame is really on screen is cheaper and
  // steadier than trying to sequence around those refreshes.
  function playFinaleIfInView() {
    if (frame.getBoundingClientRect().top <= window.innerHeight * 0.3) playFinale();
  }

  function playFinale() {
    if (played) return;
    played = true;

    if (prefersReducedMotion || !trail) {
      revealResults();
      return;
    }

    // Hand the light over from the scroll-driven trail to this timeline, so the two
    // don't fight over its position and opacity.
    trail.releaseTrail();

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    gsap
      .timeline()
      .to(trail.beam, { opacity: 0, duration: 0.4 }, 0)
      .to(trail.leaf, { top: centerY, duration: 0.75, ease: 'power2.inOut' }, 0)
      .to(trail.leaf, { scale: 1.7, duration: 0.18, ease: 'power2.in' })
      .add(() => playLeafBurst(centerX, centerY))
      .to(trail.leaf, { opacity: 0, scale: 0.3, duration: 0.3 }, '<')
      .add(revealResults, '>-0.35');
  }

  document.addEventListener('funday:vote-submitted', () => {
    const target = frame.getBoundingClientRect().top + window.scrollY;

    if (prefersReducedMotion) {
      window.scrollTo(0, target);
      playFinale();
      return;
    }

    // Tweening a proxy rather than using scroll-behavior/ScrollToPlugin keeps the
    // duration under our control and lets the finale start the moment it lands.
    const proxy = { y: window.scrollY };
    gsap.to(proxy, {
      y: target,
      duration: 1.1,
      ease: 'power2.inOut',
      onUpdate: () => window.scrollTo(0, proxy.y),
      onComplete: playFinale,
    });
  });

  // Fallback for reaching the results without voting. Deliberately late (the frame has
  // to be most of the way up the screen): the vote frame directly above it stays partly
  // on screen for a while, and firing early would spend the burst before the reader has
  // arrived.
  if (ScrollTrigger) {
    ScrollTrigger.create({
      trigger: frame,
      start: 'top 25%',
      once: true,
      onEnter: playFinaleIfInView,
      onRefresh: playFinaleIfInView,
    });
  }
}
