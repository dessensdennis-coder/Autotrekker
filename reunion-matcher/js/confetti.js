/* Piepklein confetti-effect (geen externe library). */
const Confetti = (() => {
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#c8a648', '#1f2f52', '#a9af2f', '#2a3f6b', '#e0d27a', '#8f942a'];
  let parts = [];
  let raf = null;

  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  addEventListener('resize', resize);
  resize();

  function burst(n = 90) {
    resize();
    for (let i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: innerHeight * 0.32,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * -11 - 4,
        g: 0.28 + Math.random() * 0.15,
        s: 5 + Math.random() * 7,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.life -= 0.008;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (parts.length) { raf = requestAnimationFrame(tick); }
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); raf = null; }
  }

  return { burst };
})();
