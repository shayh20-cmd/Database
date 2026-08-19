const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function drawLeaf(ctx, x, y, color) {
  ctx.save();
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
      y: -Math.random() * canvas.height,
      color: randomLeafColor(),
    }));
  }

  function tick() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      const x = i * columnWidth + columnWidth / 2;
      drawLeaf(ctx, x, drop.y, drop.color);
      drop.y += 2 + Math.random() * 2;
      if (drop.y > canvas.height + 20) {
        drop.y = -20 - Math.random() * 100;
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
