import { useEffect, useRef } from 'react';

// A lightweight canvas overlay that bursts a few particles wherever the user clicks,
// anywhere in the app. Self-contained: mounts once in App, no per-element wiring needed.
export default function ClickSparks() {
  const canvasRef = useRef(null);
  const particles = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#017d8b', '#19bb47', '#e2fa04'];

    const spawn = (x, y) => {
      const count = 10;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 2 + Math.random() * 3;
        particles.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 2 + Math.random() * 2.5,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    };

    const onClick = (e) => spawn(e.clientX, e.clientY);
    window.addEventListener('click', onClick);

    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.05; // slight gravity
        p.life -= 0.025;
        if (p.life > 0) {
          ctx.globalAlpha = Math.max(p.life, 0);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      particles.current = particles.current.filter(p => p.life > 0);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="click-sparks-canvas" aria-hidden="true" />;
}
