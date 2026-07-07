import React, { useEffect, useRef } from 'react';

interface GlowingOrb {
  color: string;
  baseXFraction: number;
  baseYFraction: number;
  radiusFraction: number;
  speedMultiplier: number;
  phaseOffset: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
}

export default function InteractiveBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null; lastX: number | null; lastY: number | null }>({
    x: null,
    y: null,
    lastX: null,
    lastY: null
  });

  // Track scroll position for color and movement shift
  const scrollRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let ripples: Ripple[] = [];
    let lastRippleTime = 0;

    // Defined orbs with low-saturation elegant Macaron colors matching Image 2 exactly:
    // 嫩芽薄荷绿 (fresh mint green), 柔光薰衣草 (soft lavender), 腮红粉 (blush pink), 清透晴空蓝 (clear sky blue), 淡雅的蓝灰冰川色 (glacier blue-gray)
    const orbs: GlowingOrb[] = [
      {
        color: 'rgba(167, 243, 208, 0.48)', // 嫩芽薄荷绿
        baseXFraction: 0.28,
        baseYFraction: 0.35,
        radiusFraction: 0.38,
        speedMultiplier: 0.8,
        phaseOffset: 0.0
      },
      {
        color: 'rgba(233, 213, 255, 0.46)', // 柔光薰衣草
        baseXFraction: 0.72,
        baseYFraction: 0.28,
        radiusFraction: 0.42,
        speedMultiplier: 0.6,
        phaseOffset: 1.5
      },
      {
        color: 'rgba(251, 207, 232, 0.44)', // 腮红粉
        baseXFraction: 0.42,
        baseYFraction: 0.75,
        radiusFraction: 0.44,
        speedMultiplier: 0.75,
        phaseOffset: 3.2
      },
      {
        color: 'rgba(186, 230, 253, 0.50)', // 清透晴空蓝
        baseXFraction: 0.82,
        baseYFraction: 0.72,
        radiusFraction: 0.36,
        speedMultiplier: 0.5,
        phaseOffset: 4.8
      },
      {
        color: 'rgba(203, 213, 225, 0.40)', // 淡雅的蓝灰冰川色
        baseXFraction: 0.50,
        baseYFraction: 0.48,
        radiusFraction: 0.32,
        speedMultiplier: 0.9,
        phaseOffset: 2.1
      }
    ];

    // 5 elegant micro-wavy contour lines (白丝微波轮廓线)
    const contourLineFractions = [0.18, 0.34, 0.50, 0.66, 0.82];

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width || window.innerWidth;
      canvas.height = rect.height || window.innerHeight;
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(container);
    resizeCanvas();

    // Mouse handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      mouseRef.current.lastX = mouseRef.current.x;
      mouseRef.current.lastY = mouseRef.current.y;
      mouseRef.current.x = currentX;
      mouseRef.current.y = currentY;

      // Create interactive mouse wave ripple
      const now = Date.now();
      if (now - lastRippleTime > 80) { // throttled for fluid performance
        const dx = mouseRef.current.lastX !== null ? currentX - mouseRef.current.lastX : 0;
        const dy = mouseRef.current.lastY !== null ? currentY - mouseRef.current.lastY : 0;
        const speed = Math.sqrt(dx * dx + dy * dy);

        if (speed > 3) {
          ripples.push({
            x: currentX,
            y: currentY,
            radius: 2,
            maxRadius: Math.min(130, 40 + speed * 1.5),
            opacity: 0.55,
            speed: 1.8 + speed * 0.05
          });
          lastRippleTime = now;
        }
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.x = null;
      mouseRef.current.y = null;
    };

    const handleScroll = () => {
      scrollRef.current = window.scrollY;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Animation Loop
    let lastTime = 0;
    const render = (timestamp: number) => {
      if (!lastTime) lastTime = timestamp;
      const elapsed = timestamp - lastTime;

      const width = canvas.width;
      const height = canvas.height;
      const minDim = Math.min(width, height);

      // 1. Draw premium glacier cream base background (#cbd5e1)
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, width, height);

      // Slow organic movement formula using timestamp
      const timeSec = timestamp * 0.00035;

      // 2. Draw and blend Macaron glowing orbs with Compound Orbits
      ctx.globalCompositeOperation = 'multiply'; // Creates dreamy wet-on-wet watercolor blends

      orbs.forEach((orb) => {
        // Calculate organic orbital movement using compound superpositions of sine and cosine
        const movementScale = minDim * 0.12;
        const scrollOffset = scrollRef.current * 0.15 * orb.speedMultiplier;

        const dynamicX = width * orb.baseXFraction +
          Math.sin(timeSec * orb.speedMultiplier + orb.phaseOffset) * movementScale +
          Math.cos(timeSec * 0.45 * orb.speedMultiplier) * (movementScale * 0.4);

        const dynamicY = height * orb.baseYFraction +
          Math.cos(timeSec * 0.85 * orb.speedMultiplier + orb.phaseOffset) * movementScale +
          Math.sin(timeSec * 0.35 * orb.speedMultiplier) * (movementScale * 0.3) -
          scrollOffset;

        // Interactive mouse repellent force on orb centers
        let finalX = dynamicX;
        let finalY = dynamicY;
        const mouse = mouseRef.current;
        if (mouse.x !== null && mouse.y !== null) {
          const dx = dynamicX - mouse.x;
          const dy = dynamicY - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const repelRadius = minDim * 0.35;

          if (dist < repelRadius) {
            const force = (1 - dist / repelRadius) * 45; // Gentle push away
            const angle = Math.atan2(dy, dx);
            finalX += Math.cos(angle) * force;
            finalY += Math.sin(angle) * force;
          }
        }

        // Pulse the radius of each watercolor blob gently
        const sizePulse = 1 + Math.sin(timeSec * 1.2 * orb.speedMultiplier + orb.phaseOffset) * 0.12;
        const radius = minDim * orb.radiusFraction * sizePulse;

        // Render soft gradient
        const radialGrad = ctx.createRadialGradient(
          finalX, finalY, 0,
          finalX, finalY, radius
        );
        radialGrad.addColorStop(0, orb.color);
        radialGrad.addColorStop(0.4, orb.color.replace(/[\d.]+\)$/, '0.22)'));
        radialGrad.addColorStop(0.7, orb.color.replace(/[\d.]+\)$/, '0.08)'));
        radialGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        ctx.arc(finalX, finalY, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Restore composite operation for crisp layers
      ctx.globalCompositeOperation = 'source-over';

      // 3. Draw premium soft lighting overlay
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, height);
      overlayGrad.addColorStop(0, 'rgba(203, 213, 225, 0.15)');
      overlayGrad.addColorStop(1, 'rgba(148, 163, 184, 0.45)');
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, width, height);

      // 4. Update and draw 5 micro-wavy White-Silk Contour Lines (白丝微波轮廓线)
      contourLineFractions.forEach((fraction, lineIndex) => {
        ctx.beginPath();
        
        const segmentCount = Math.ceil(width / 8); // extremely dense and precise contour segment path
        const mouse = mouseRef.current;

        for (let i = 0; i <= segmentCount; i++) {
          const x = (i / segmentCount) * width;
          
          // Smooth fluid geographic wave formula
          const wavePhase1 = x * 0.0022 + timeSec * 1.1 + (lineIndex * 1.4);
          const wavePhase2 = x * 0.0008 - timeSec * 0.55 - (lineIndex * 0.85);
          
          const rawY = height * fraction +
            Math.sin(wavePhase1) * 22 +
            Math.cos(wavePhase2) * 14;

          // Interactive push and refraction bend
          let finalY = rawY;
          let finalX = x;

          if (mouse.x !== null && mouse.y !== null) {
            const dx = x - mouse.x;
            const dy = rawY - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const contourInfluenceRadius = 240;

            if (dist < contourInfluenceRadius) {
              const force = (1 - dist / contourInfluenceRadius) * 48;
              const angle = Math.atan2(dy, dx);
              finalY += Math.sin(angle) * force;
              finalX += Math.cos(angle) * force;
            }
          }

          if (i === 0) {
            ctx.moveTo(finalX, finalY);
          } else {
            ctx.lineTo(finalX, finalY);
          }
        }

        // Draw elegant white contour line with faint glowing shadow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 4;
        ctx.stroke();
        
        // Reset shadow to avoid affecting other primitives
        ctx.shadowBlur = 0;
      });

      // 5. Draw and update interactive ripples (鼠标拂过涟漪)
      ripples.forEach((r, idx) => {
        r.radius += r.speed;
        r.opacity = 1 - r.radius / r.maxRadius;

        if (r.opacity <= 0) {
          ripples.splice(idx, 1);
          return;
        }

        ctx.strokeStyle = `rgba(255, 255, 255, ${r.opacity * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw outer ring
        ctx.strokeStyle = `rgba(255, 255, 255, ${r.opacity * 0.25})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render(0);

    // Cleanups
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      id="interactive-bg-container"
      ref={containerRef}
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0"
    >
      <canvas
        id="interactive-bg-canvas"
        ref={canvasRef}
        className="w-full h-full block"
      />
    </div>
  );
}
