import { useEffect, useRef } from 'react';

// Layered, drifting glow-lines behind the hero — an original canvas animation
// (not the React Bits component/shader) tuned to the Rendezvous palette.
export default function GhostFibers({
  lineColor = '#19bb47',
  glowColor = '#017d8b',
  layers = 5,
  speed = 0.25,
  waveAmplitude = 34,
  frequency = 1.6
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width, height;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width; height = rect.height;
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf;
    let t = 0;

    const draw = () => {
      t += speed * 0.01;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let l = 0; l < layers; l++) {
        const phase = l * 1.7;
        const yBase = height * (0.15 + (l / Math.max(layers - 1, 1)) * 0.7);
        const amp = waveAmplitude * (0.6 + 0.4 * Math.sin(l * 1.3));
        const alpha = 0.10 + (l / layers) * 0.16;

        ctx.beginPath();
        for (let x = 0; x <= width; x += 6) {
          const y = yBase
            + Math.sin(x * 0.0025 * frequency + t * 2 + phase) * amp
            + Math.sin(x * 0.006 * frequency - t * 1.3 + phase) * (amp * 0.4);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }

        // Soft outer glow pass
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 14;
        ctx.globalAlpha = alpha * 0.5;
        ctx.filter = 'blur(6px)';
        ctx.stroke();

        // Crisp fiber core
        ctx.filter = 'none';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = alpha + 0.12;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [lineColor, glowColor, layers, speed, waveAmplitude, frequency]);

  return <canvas ref={canvasRef} className="ghost-fibers-canvas" aria-hidden="true" />;
}
