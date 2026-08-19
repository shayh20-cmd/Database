const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LEAF_MAX_ALPHA = 0.5;

function drawLeaf(ctx, x, y, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.quadraticCurveTo(6, 0, 0, 6);
  ctx.quadraticCurveTo(-6, 0, 0, -6);
  ctx.fill();
  ctx.restore();
}

function randomLeafColor() {
  return Math.random() > 0.5 ? '#8fb874' : '#3d5c33';
}

function randomSpawnY(canvasHeight) {
  return -Math.random() * canvasHeight * 0.6;
}

function leafAlpha(progress) {
  const fadeIn = Math.min(progress / 0.18, 1);
  const fadeOut = Math.min((1 - progress) / 0.4, 1);
  return Math.max(0, Math.min(fadeIn, fadeOut)) * LEAF_MAX_ALPHA;
}

export function initHeroRain() {
  if (prefersReducedMotion) return;
  const canvas = document.getElementById('hero-rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const frame = canvas.closest('.frame');

  const columnWidth = 26;
  let drops = [];
  let isRunning = false;
  let rafId = null;

  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const columns = Math.max(1, Math.floor(canvas.width / columnWidth));
    drops = new Array(columns).fill(0).map(() => ({
      y: (Math.random() * 1.3 - 0.3) * canvas.height,
      color: randomLeafColor(),
    }));
  }

  function tick() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const x = i * columnWidth + columnWidth / 2;
      const progress = Math.min(Math.max(drop.y / canvas.height, 0), 1);
      const alpha = leafAlpha(progress);
      if (alpha > 0) {
        drawLeaf(ctx, x, drop.y, drop.color, alpha);
      }
      drop.y += 2 + Math.random() * 2;
      if (drop.y > canvas.height + 20) {
        drop.y = randomSpawnY(canvas.height);
        drop.color = randomLeafColor();
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    tick();
  }

  function stop() {
    isRunning = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  window.addEventListener('resize', resize);
  resize();

  if (frame) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start();
          } else {
            stop();
          }
        }
      },
      { threshold: 0 }
    );
    observer.observe(frame);
  } else {
    start();
  }
}
