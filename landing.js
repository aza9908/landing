(function () {
  const canvas = document.getElementById('lp-mesh');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w, h, t = 0;
  const dots = [];
  const DOT_COUNT = 120;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function init() {
    dots.length = 0;
    for (let i = 0; i < DOT_COUNT; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.6,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += 0.008;

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const pulse = 0.4 + 0.6 * Math.sin(t * d.speed + d.phase);
      const x = d.x + Math.sin(t * 0.4 + d.phase) * 18;
      const y = d.y + Math.cos(t * 0.35 + d.phase) * 14;

      ctx.beginPath();
      ctx.arc(x, y, d.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 180, 220, ${0.15 * pulse})`;
      ctx.fill();

      for (let j = i + 1; j < dots.length; j++) {
        const d2 = dots[j];
        const x2 = d2.x + Math.sin(t * 0.4 + d2.phase) * 18;
        const y2 = d2.y + Math.cos(t * 0.35 + d2.phase) * 14;
        const dist = Math.hypot(x - x2, y - y2);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(140, 140, 200, ${0.06 * (1 - dist / 100)})`;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    init();
  });

  resize();
  init();
  draw();
})();
