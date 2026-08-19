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

  // The activities card row is deliberately laid out near the bottom of its frame (see
  // #frame-activities in styles.css) so its top edge sits just below the hero badge's own
  // position — close enough that a single, always-visible, always-descending trail can
  // travel from the badge straight down onto the cards without ever leaving the screen
  // or reversing direction. That's the geometry the rest of this file leans on.
  const badgeRect = badge.getBoundingClientRect();
  const startY = badgeRect.top + badgeRect.height / 2;
  const cardsY = activitiesGrid.getBoundingClientRect().top - activitiesFrame.getBoundingClientRect().top;
  const exitY = window.innerHeight - 40;

  // Scene 1: hero — the trail is born at the badge and eases down toward the card row's
  // position while the hero stays pinned (and for the natural extra viewport of scrolling
  // GSAP's pin spacing reserves afterward), so it's exactly at the cards the instant scene
  // 2 takes over. See the note on the second ScrollTrigger below for why this spans that
  // extra distance and why it's created before the pin trigger.
  const heroPinDistance = Math.round(window.innerHeight * 2.5);
  const heroVisibleDistance = heroPinDistance + window.innerHeight;

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${heroVisibleDistance}`,
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;
      const top = startY + progress * (cardsY - startY);
      const fade = Math.min(progress / FADE_ZONE, 1);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: startY, height: Math.max(top - startY, 0), opacity: fade * 0.8 });
    },
  });

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${heroPinDistance}`,
    pin: true,
  });

  // Scene 2: activities — the trail is already sitting exactly on the card row when this
  // pin engages, so it holds there and draws each card's outline top-to-bottom, then
  // keeps moving down (still the same direction, never reversing) toward the handoff to
  // the next frame, fading only once there is nowhere further to go.
  const activitiesPinDistance = Math.round(window.innerHeight * 1.4);

  ScrollTrigger.create({
    trigger: activitiesFrame,
    start: 'top top',
    end: `+=${activitiesPinDistance}`,
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      const progress = self.progress;
      const top = progress < 0.4 ? cardsY : segment(progress, 0.4, 1, cardsY, exitY);

      const fade = progress < 0.85 ? 1 : Math.max(0, 1 - (progress - 0.85) / 0.15);
      gsap.set(leaf, { top, opacity: fade });
      gsap.set(beam, { top: 40, height: Math.max(top - 40, 0), opacity: fade * 0.8 });

      const draw = segment(progress, 0, 0.4, 0, 1);
      gsap.set(cards, { boxShadow: shadowInterp(draw) });
      for (const rect of outlines) {
        const length = Number(rect.style.strokeDasharray);
        gsap.set(rect, { strokeDashoffset: length * (1 - draw) });
      }
    },
  });
}
