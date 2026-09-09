const gsap = window.gsap;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LEAF_COLORS = ['var(--knafo-sage)', 'var(--knafo-sage-dark)'];
const SPAWN_INTERVAL_MS = 60;

let lastSpawn = 0;

function spawnTrailLeaf(x, y) {
  const leaf = document.createElement('div');
  leaf.className = 'cursor-leaf';
  leaf.style.left = `${x}px`;
  leaf.style.top = `${y}px`;
  leaf.style.background = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
  leaf.style.setProperty('--leaf-rotate', `${-55 + Math.random() * 20}deg`);
  document.body.appendChild(leaf);

  gsap.fromTo(
    leaf,
    { opacity: 0.85, scale: 1 },
    {
      opacity: 0,
      scale: 0.4,
      y: 28,
      duration: 0.9,
      ease: 'power1.out',
      onComplete: () => leaf.remove(),
    }
  );
}

function handleMouseMove(event) {
  const now = performance.now();
  if (now - lastSpawn < SPAWN_INTERVAL_MS) return;
  lastSpawn = now;
  spawnTrailLeaf(event.clientX, event.clientY);
}

export function initCursorTrail() {
  if (prefersReducedMotion) return;
  window.addEventListener('mousemove', handleMouseMove);
}
