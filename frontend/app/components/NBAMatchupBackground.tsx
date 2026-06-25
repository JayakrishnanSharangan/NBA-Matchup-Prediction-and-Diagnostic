"use client";

import { useEffect, useRef } from "react";

interface NBAMatchupBackgroundProps {
  homeColor?: string;
  awayColor?: string;
}

const DEFAULT_HOME = "#C9082A";
const DEFAULT_AWAY = "#17408B";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

export default function NBAMatchupBackground({
  homeColor = DEFAULT_HOME,
  awayColor = DEFAULT_AWAY,
  theme = "dark",
}: NBAMatchupBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef({ home: homeColor, away: awayColor });
  const themeRef = useRef(theme);

  useEffect(() => {
    colorsRef.current = { home: homeColor, away: awayColor };
  }, [homeColor, awayColor]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const cursor = { x: -9999, y: -9999 };
    const onMouseMove = (e: MouseEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
    };
    window.addEventListener("mousemove", onMouseMove);

    // ── Tuned for full visual density across every section ──
    const PARTICLE_COUNT = 200;
    const CONNECT_DIST   = 160;
    const CURSOR_DIST    = 160;
    const MAX_SPEED      = 0.5;

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      x:      Math.random() * window.innerWidth,
      y:      Math.random() * window.innerHeight,
      vx:     (Math.random() - 0.5) * MAX_SPEED,
      vy:     (Math.random() - 0.5) * MAX_SPEED,
      alpha:  0.30 + Math.random() * 0.45,   // 0.30–0.75 — clearly visible
      radius: 3 + Math.random() * 9,          // 3–12px — wider range for depth
      phase:  Math.random() * Math.PI * 2,
    }));

    let frameId: number;
    let t = 0;

    const draw = () => {
      t += 0.007;
      const W = canvas.width;
      const H = canvas.height;
      const currentTheme = themeRef.current;

      // Base background gradient/solid color based on theme
      if (currentTheme === "light") {
        const bgGrad = ctx.createRadialGradient(
          W / 2, H / 2, 0,
          W / 2, H / 2, Math.max(W, H)
        );
        bgGrad.addColorStop(0, "#FFFFFF");
        bgGrad.addColorStop(0.5, "#FFF9F4");
        bgGrad.addColorStop(1, "#FFEADB");
        ctx.fillStyle = bgGrad;
      } else {
        ctx.fillStyle = "#05070F";
      }
      ctx.fillRect(0, 0, W, H);

      // ── Update positions ──
      for (const p of particles) {
        p.x += p.vx + Math.sin(t + p.phase) * 0.11;
        p.y += p.vy + Math.cos(t + p.phase * 0.8) * 0.08;

        if (p.x < -15) p.x = W + 15;
        if (p.x > W + 15) p.x = -15;
        if (p.y < -15) p.y = H + 15;
        if (p.y > H + 15) p.y = -15;

        // Magnetic cursor repel/attract
        const dx   = cursor.x - p.x;
        const dy   = cursor.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CURSOR_DIST && dist > 0) {
          const force = ((CURSOR_DIST - dist) / CURSOR_DIST) * 0.05;
          const dir   = p.alpha > 0.5 ? 1 : -1;
          p.vx += (dx / dist) * force * dir;
          p.vy += (dy / dist) * force * dir;
        }

        // Speed clamp
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED;
          p.vy = (p.vy / speed) * MAX_SPEED;
        }
      }

      // ── Mesh lines ──
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a  = particles[i];
          const b  = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_DIST) {
            const opacity = (1 - d / CONNECT_DIST) * 0.25;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            if (currentTheme === "light") {
              ctx.strokeStyle = `rgba(234, 88, 12, ${opacity * 0.3})`;
            } else {
              ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
            }
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // ── Hexagon particles ──
      const { home, away } = colorsRef.current;
      const homeRgb = hexToRgb(home);
      const awayRgb = hexToRgb(away);

      for (const p of particles) {
        const grad = ctx.createLinearGradient(
          p.x - p.radius, p.y - p.radius,
          p.x + p.radius, p.y + p.radius
        );
        grad.addColorStop(0, `rgba(${homeRgb.r},${homeRgb.g},${homeRgb.b},${p.alpha})`);
        grad.addColorStop(1, `rgba(${awayRgb.r},${awayRgb.g},${awayRgb.b},${p.alpha * 0.8})`);

        drawHexagon(ctx, p.x, p.y, p.radius);
        ctx.fillStyle = grad;
        ctx.fill();

        // Crisp edge stroke
        if (currentTheme === "light") {
          ctx.strokeStyle = `rgba(234, 88, 12, ${p.alpha * 0.28})`;
        } else {
          ctx.strokeStyle = `rgba(255,255,255,${p.alpha * 0.22})`;
        }
        ctx.lineWidth   = 0.5;
        ctx.stroke();
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
