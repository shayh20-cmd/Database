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

function outlineActivityCards() {
  const cards = document.querySelectorAll('.activity-card');
  for (const card of cards) {
    gsap.fromTo(
      card,
      { borderColor: '#d8d8d5', boxShadow: '0 0 0px 0px rgba(35, 122, 51, 0)' },
      {
        borderColor: '#237a33',
        boxShadow: '0 0 18px 2px rgba(35, 122, 51, 0.35)',
        scrollTrigger: {
          trigger: card,
          start: 'top 75%',
          end: 'top 45%',
          scrub: true,
        },
      }
    );
  }
}

export function initLeafTrail() {
  if (prefersReducedMotion || !gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const heroFrame = document.getElementById('frame-hero');
  const activitiesFrame = document.getElementById('frame-activities');
  const badge = document.querySelector('.badge-leaf');
  if (!heroFrame || !activitiesFrame || !badge) return;

  const leaf = buildLeafMarker();
  const beam = buildBeam();
  const pinDistance = Math.round(window.innerHeight * 2.5);
  const FADE_ZONE = 0.08;
  const badgeRect = badge.getBoundingClientRect();
  const startY = badgeRect.top + badgeRect.height / 2;

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${pinDistance}`,
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      const vh = window.innerHeight;
      const progress = self.progress;
      const top = startY + progress * (vh - 40 - startY);
      const fade = Math.min(progress / FADE_ZONE, (1 - progress) / FADE_ZONE, 1);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: startY, height: Math.max(top - startY, 0), opacity: fade * 0.8 });
    },
  });

  outlineActivityCards();
}
