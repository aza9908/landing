(function () {
  const canvas = document.getElementById('lp-mesh');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w, h, t = 0;
  const dots = [];
  let DOT_COUNT = 140;

  function resize() {
    w = canvas.width = window.innerWidth * (window.devicePixelRatio > 1 ? 1.5 : 1);
    h = canvas.height = window.innerHeight * (window.devicePixelRatio > 1 ? 1.5 : 1);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    DOT_COUNT = window.innerWidth < 768 ? 70 : 140;
  }

  function init() {
    dots.length = 0;
    for (let i = 0; i < DOT_COUNT; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.7,
        amp: 12 + Math.random() * 28,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += 0.01;

    // soft wave bands
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      const yBase = h * (0.35 + band * 0.12);
      for (let x = 0; x <= w; x += 8) {
        const y =
          yBase +
          Math.sin(x * 0.004 + t * 0.6 + band) * (28 + band * 10) +
          Math.sin(x * 0.01 + t * 0.3) * 12;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(140, 150, 220, ${0.04 + band * 0.015})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const pulse = 0.35 + 0.65 * Math.sin(t * d.speed + d.phase);
      const x = d.x + Math.sin(t * 0.45 + d.phase) * d.amp;
      const y = d.y + Math.cos(t * 0.38 + d.phase) * (d.amp * 0.7);

      ctx.beginPath();
      ctx.arc(x, y, d.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190, 190, 240, ${0.12 + 0.18 * pulse})`;
      ctx.fill();

      for (let j = i + 1; j < Math.min(i + 8, dots.length); j++) {
        const d2 = dots[j];
        const x2 = d2.x + Math.sin(t * 0.45 + d2.phase) * d2.amp;
        const y2 = d2.y + Math.cos(t * 0.38 + d2.phase) * (d2.amp * 0.7);
        const dist = Math.hypot(x - x2, y - y2);
        const maxD = Math.min(w, h) * 0.08;
        if (dist < maxD) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(150, 150, 220, ${0.08 * (1 - dist / maxD)})`;
          ctx.lineWidth = 0.8;
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
