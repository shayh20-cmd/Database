const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildLeafMarker() {
  const leaf = document.createElement('div');
  leaf.className = 'leaf-trail';
  leaf.setAttribute('aria-hidden', 'true');
  leaf.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 20c-1-5 0-9 3-12 3-3 7-4 11-4 0 4-1 8-4 11-3 3-7 4-10 5z" />
      <path d="M8 18c2-4 5-7 9-9" />
    </svg>
  `;
  document.body.appendChild(leaf);
  return leaf;
}

function buildBeam() {
  const beam = document.createElement('div');
  beam.className = 'leaf-trail__beam';
  beam.setAttribute('aria-hidden', 'true');
  document.body.appendChild(beam);
  return beam;
}

export function initLeafTrail() {
  if (prefersReducedMotion || !gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const heroFrame = document.getElementById('frame-hero');
  const activitiesFrame = document.getElementById('frame-activities');
  const activitiesGrid = document.getElementById('activities-grid');
  const badge = document.querySelector('.badge-leaf');
  if (!heroFrame || !activitiesFrame || !activitiesGrid || !badge) return;

  const leaf = buildLeafMarker();
  const beam = buildBeam();
  const FADE_ZONE = 0.08;
  const cards = document.querySelectorAll('.activity-card');
  const borderInterp = gsap.utils.interpolate('#d8d8d5', '#237a33');
  const shadowInterp = gsap.utils.interpolate(
    '0 0 0px 0px rgba(35, 122, 51, 0)',
    '0 0 18px 2px rgba(35, 122, 51, 0.35)'
  );

  // Scene 1: hero — the trail is born at the badge and descends as the hero stays pinned.
  const heroPinDistance = Math.round(window.innerHeight * 2.5);
  const badgeRect = badge.getBoundingClientRect();
  const startY = badgeRect.top + badgeRect.height / 2;

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${heroPinDistance}`,
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      const vh = window.innerHeight;
      const progress = self.progress;
      const top = startY + progress * (vh - 40 - startY);
      const fade = Math.min(progress / FADE_ZONE, 1);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: startY, height: Math.max(top - startY, 0), opacity: fade * 0.8 });
    },
  });

  // Scene 2: activities — the trail continues downward while the frame stays pinned,
  // arriving at the card row and lighting the four activity tabs up as it lands.
  // Neither scene fades the trail out at its own boundary, so during the natural
  // scroll gap between the two pins the trail just holds its last position/opacity
  // instead of vanishing and popping back in.
  const activitiesPinDistance = Math.round(window.innerHeight * 1.4);
  const cardsY = activitiesGrid.getBoundingClientRect().top - activitiesFrame.getBoundingClientRect().top;

  ScrollTrigger.create({
    trigger: activitiesFrame,
    start: 'top top',
    end: `+=${activitiesPinDistance}`,
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;
      const top = 40 + progress * (cardsY - 40);
      const fade = Math.min((1 - progress) / 0.2, 1);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: 40, height: Math.max(top - 40, 0), opacity: fade * 0.8 });

      const glow = gsap.utils.clamp(0, 1, (progress - 0.55) / 0.45);
      gsap.set(cards, { borderColor: borderInterp(glow), boxShadow: shadowInterp(glow) });
    },
  });
}
