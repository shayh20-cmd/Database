const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';

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

// Overlays each card with an SVG rect stroke so its outline can be drawn on,
// starting from the top edge, rather than just fading a CSS border in place.
function buildCardOutline(card) {
  const rect0 = card.getBoundingClientRect();
  const width = rect0.width;
  const height = rect0.height;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('activity-card__outline');

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', 0.75);
  rect.setAttribute('y', 0.75);
  rect.setAttribute('width', Math.max(width - 1.5, 0));
  rect.setAttribute('height', Math.max(height - 1.5, 0));
  rect.setAttribute('rx', 12);
  rect.setAttribute('ry', 12);
  svg.appendChild(rect);
  card.appendChild(svg);

  const length = rect.getTotalLength();
  rect.style.strokeDasharray = String(length);
  rect.style.strokeDashoffset = String(length);
  return rect;
}

function segment(progress, pStart, pEnd, vStart, vEnd) {
  const t = gsap.utils.clamp(0, 1, (progress - pStart) / (pEnd - pStart));
  return vStart + t * (vEnd - vStart);
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
  const shadowInterp = gsap.utils.interpolate(
    '0 0 0px 0px rgba(35, 122, 51, 0)',
    '0 0 18px 2px rgba(35, 122, 51, 0.35)'
  );
  const outlines = Array.from(cards).map(buildCardOutline);

  // Scene 1: hero — the trail is born at the badge and descends as the hero stays pinned,
  // continuing past the bottom edge so it exits the screen rather than stopping mid-air.
  // (The activities card row sits higher on screen than the badge does in the hero, so a
  // trail that always moves downward can never land exactly on the cards without first
  // leaving the viewport — same as a light exiting one film frame and continuing into
  // the next, rather than reversing direction to "back up" onto a target above it.)
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
      const top = startY + progress * (vh + 40 - startY);
      const fade = Math.min(progress / FADE_ZONE, 1);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: startY, height: Math.max(top - startY, 0), opacity: fade * 0.8 });
    },
  });

  // Scene 2: activities — the trail re-enters from above the viewport (continuing the
  // same downward motion, never reversing), arrives at the card row and draws each
  // card's outline top-to-bottom as it lands, then keeps moving down toward the
  // handoff to the next frame, fading only once there is nowhere further to go.
  const activitiesPinDistance = Math.round(window.innerHeight * 1.4);
  const cardsY = activitiesGrid.getBoundingClientRect().top - activitiesFrame.getBoundingClientRect().top;
  const enterY = -40;
  const exitY = window.innerHeight - 40;

  ScrollTrigger.create({
    trigger: activitiesFrame,
    start: 'top top',
    end: `+=${activitiesPinDistance}`,
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;
      let top;
      if (progress < 0.3) top = segment(progress, 0, 0.3, enterY, cardsY);
      else if (progress < 0.7) top = cardsY;
      else top = segment(progress, 0.7, 1, cardsY, exitY);

      const fade = progress < 0.85 ? 1 : Math.max(0, 1 - (progress - 0.85) / 0.15);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: Math.min(top, 40), height: Math.max(top - Math.min(top, 40), 0), opacity: fade * 0.8 });

      const draw = segment(progress, 0.3, 0.7, 0, 1);
      gsap.set(cards, { boxShadow: shadowInterp(draw) });
      for (const rect of outlines) {
        const length = Number(rect.style.strokeDasharray);
        gsap.set(rect, { strokeDashoffset: length * (1 - draw) });
      }
    },
  });
}
