const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FADE_ZONE = 0.12;

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

export function initLeafTrail() {
  if (prefersReducedMotion || !gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const heroFrame = document.getElementById('frame-hero');
  const badge = document.querySelector('.badge-leaf');
  if (!heroFrame || !badge) return;

  const leaf = buildLeafMarker();
  const beam = buildBeam();
  const cards = document.querySelectorAll('.activity-card');
  const outlines = Array.from(cards).map(buildCardOutline);
  const shadowInterp = gsap.utils.interpolate(
    '0 0 0px 0px rgba(35, 122, 51, 0)',
    '0 0 18px 2px rgba(35, 122, 51, 0.35)'
  );

  const badgeRect = badge.getBoundingClientRect();
  const startY = badgeRect.top + badgeRect.height / 2;
  // Where the light settles and stays: a fixed beacon near the bottom of the screen.
  const restY = window.innerHeight - 48;
  const lightY = restY + 13;

  // The hero pin is the page's one deliberate hold — about one and a bit screens of
  // scrolling during which the light is born at the badge and descends to its resting
  // point. Everything after it scrolls at the normal 1:1 rate.
  //
  // Earlier versions tried to keep the light's viewport position glued to the cards'
  // viewport position, which forced a tiny travel distance (~40px) across several
  // screens of pinned scrolling — so the light looked frozen, and the two pinned scenes
  // ran at wildly different rates. Instead the light now simply comes to rest and the
  // page scrolls past it, which is both continuous and evenly paced.
  const heroPinDistance = Math.round(window.innerHeight * 1.2);
  const trailRange = heroPinDistance + window.innerHeight * 4;

  // Created before the pin trigger: once heroFrame is pinned, GSAP measures a fresh
  // 'top top' against its spacer-wrapped layout instead of its original position.
  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${trailRange}`,
    scrub: true,
    onUpdate: (self) => {
      const descent = gsap.utils.clamp(0, 1, (self.progress * trailRange) / heroPinDistance);
      const tipY = startY + descent * (restY - startY);
      // Anchor the beam to the badge's live position, so it visibly starts at the icon
      // while the icon is on screen, and simply streams in from above once it isn't.
      const anchor = badge.getBoundingClientRect();
      const beamTop = Math.min(anchor.top + anchor.height / 2, tipY);
      const fade = Math.min(descent / FADE_ZONE, 1);
      gsap.set(leaf, { top: tipY, opacity: fade });
      gsap.set(beam, { top: beamTop, height: Math.max(tipY - beamTop, 0), opacity: fade * 0.8 });
    },
  });

  ScrollTrigger.create({
    trigger: heroFrame,
    start: 'top top',
    end: `+=${heroPinDistance}`,
    pin: true,
  });

  // Each card sweeps up through the resting light, and its outline draws top-to-bottom
  // as it passes: the draw starts when the card's top edge reaches the light and
  // completes when its bottom edge does.
  cards.forEach((card, index) => {
    const rect = outlines[index];
    const length = Number(rect.style.strokeDasharray);
    ScrollTrigger.create({
      trigger: card,
      start: `top ${lightY}px`,
      end: `bottom ${lightY}px`,
      scrub: true,
      onUpdate: (self) => {
        gsap.set(rect, { strokeDashoffset: length * (1 - self.progress) });
        gsap.set(card, { boxShadow: shadowInterp(self.progress) });
      },
    });
  });
}
