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
  if (!heroFrame || !activitiesFrame) return;

  const leaf = buildLeafMarker();
  const beam = buildBeam();
  const extraScroll = Math.round(window.innerHeight * 0.6);

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'bottom bottom',
    endTrigger: activitiesFrame,
    end: `bottom top-=${extraScroll}`,
    scrub: true,
    onUpdate: (self) => {
      const vh = window.innerHeight;
      const top = 40 + self.progress * (vh - 80);
      gsap.set(leaf, { top });
      gsap.set(beam, { top: 0, height: top, opacity: Math.min(self.progress * 3, 1) * 0.8 });
    },
    onLeave: () => {
      gsap.to([leaf, beam], { opacity: 0, duration: 0.3 });
    },
    onEnterBack: () => {
      gsap.to(leaf, { opacity: 1, duration: 0.3 });
    },
    onLeaveBack: () => {
      gsap.to([leaf, beam], { opacity: 0, duration: 0.3 });
    },
  });

  outlineActivityCards();
}
