import { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';

const WinBurst = forwardRef(function WinBurst(_, ref) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);

  useImperativeHandle(ref, () => ({
    fire(cx, cy) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Sync canvas resolution to CSS size
      canvas.width = canvas.offsetWidth || 600;
      canvas.height = canvas.offsetHeight || 400;
      const x = cx ?? canvas.width / 2;
      const y = cy ?? canvas.height / 3;
      const burst = Array.from({ length: 72 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 7;
        return {
          x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 4,
          life: 1,
          hue: Math.floor(Math.random() * 60 + 30),
          size: 2.5 + Math.random() * 4,
          shape: Math.random() > 0.5 ? 'rect' : 'circle',
        };
      });
      particlesRef.current = [...particlesRef.current, ...burst];
      cancelAnimationFrame(rafRef.current);

      function tick() {
        const canvas2 = canvasRef.current;
        if (!canvas2) return;
        const ctx = canvas2.getContext('2d');
        ctx.clearRect(0, 0, canvas2.width, canvas2.height);
        particlesRef.current = particlesRef.current.filter(p => p.life > 0.02);
        particlesRef.current.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          p.vy += 0.18; p.vx *= 0.98;
          p.life *= 0.94;
          ctx.globalAlpha = p.life * p.life;
          ctx.fillStyle = `hsl(${p.hue},100%,60%)`;
          if (p.shape === 'rect') {
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.6);
          } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
        if (particlesRef.current.length > 0) rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    },
  }));

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-50"
      style={{ width: '100%', height: '100%' }}
    />
  );
});

export default WinBurst;
