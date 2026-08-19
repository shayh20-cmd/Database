const gsap = window.gsap;

const BURST_COLORS = ['#8fb874', '#3d5c33', '#237a33', '#bfe0a8'];

function buildParticle(color) {
  const particle = document.createElement('div');
  particle.className = 'leaf-burst__particle';
  particle.style.background = color;
  document.body.appendChild(particle);
  return particle;
}

function buildFlash() {
  const flash = document.createElement('div');
  flash.className = 'leaf-burst__flash';
  document.body.appendChild(flash);
  return flash;
}

// A firework of leaves: one bright flash at the origin, then a spray of leaf particles
// thrown outward in every direction, tumbling and drifting down as they fade.
export function playLeafBurst(x, y, count = 64) {
  if (!gsap) return;

  const flash = buildFlash();
  gsap.set(flash, { x, y, scale: 0.2, opacity: 0.9 });
  gsap.to(flash, {
    scale: 5,
    opacity: 0,
    duration: 0.7,
    ease: 'power2.out',
    onComplete: () => flash.remove(),
  });

  const reach = Math.max(window.innerWidth, window.innerHeight) * 0.55;

  for (let i = 0; i < count; i += 1) {
    // Spread the angles evenly and then jitter, so the ring stays even rather than
    // clumping the way fully random angles would.
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const distance = 120 + Math.random() * reach;
    const particle = buildParticle(BURST_COLORS[i % BURST_COLORS.length]);

    gsap.set(particle, {
      x,
      y,
      opacity: 1,
      scale: 0.4 + Math.random() * 0.8,
      rotate: Math.random() * 360,
    });

    gsap.to(particle, {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance + 90, // a little gravity on the way out
      rotate: `+=${(Math.random() - 0.5) * 540}`,
      opacity: 0,
      scale: 0.2,
      duration: 1.1 + Math.random() * 0.9,
      ease: 'power3.out',
      onComplete: () => particle.remove(),
    });
  }
}
