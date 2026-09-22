'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const NEURA = 'Neura'.split('');
const CHAT = 'Chat'.split('');

export default function SplashScreen() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fadeOut, setFadeOut] = useState(false);

  // Lightweight neural particle background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 14;
    const MAX_DIST = 90;
    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 1.8 + 0.8,
    }));

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, width, height);

      // lines
      for (let i = 0; i < COUNT; i++) {
        const a = particles[i];
        for (let j = i + 1; j < COUNT; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_DIST * MAX_DIST) {
            const alpha = (1 - Math.sqrt(d2) / MAX_DIST) * 0.15;
            ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // dots
      ctx.fillStyle = 'rgba(0,212,255,0.5)';
      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx = -p.vx;
        if (p.y < 0 || p.y > height) p.vy = -p.vy;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Redirect timing
  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 1800);
    const t2 = setTimeout(() => router.push('/chats'), 2150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [router]);

  return (
    <div
      className={`fixed inset-0 w-full h-full md:max-w-md md:mx-auto bg-black flex flex-col items-center justify-center overflow-hidden z-50 select-none transition-opacity duration-300 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      id="splash-screen-container"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.85 }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo badge */}
        <div
          className="w-16 h-16 bg-gradient-to-tr from-[#00D4FF]/20 to-[#FF006E]/20 border border-[#00D4FF]/40 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.3)] splash-pop"
          id="splash-logo-container"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#FF006E] opacity-90 blur-[1px]" />
        </div>

        {/* Letters */}
        <div className="flex text-4xl sm:text-5xl font-extrabold select-none tracking-tight">
          {NEURA.map((letter, i) => (
            <span
              key={`n-${i}`}
              className="text-[#00D4FF] inline-block font-bold splash-letter"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {letter}
            </span>
          ))}
          {CHAT.map((letter, i) => (
            <span
              key={`c-${i}`}
              className="text-[#FF006E] inline-block font-bold splash-letter"
              style={{ animationDelay: `${(NEURA.length + i) * 60}ms` }}
            >
              {letter}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <p className="text-xs text-zinc-500 font-sans tracking-widest uppercase mt-2 h-4 text-center splash-fade">
          Your Neural Communication Hub
        </p>
      </div>

      <div className="absolute bottom-8 text-[11px] font-mono text-zinc-700 select-none">
        NeuraSaMu Build
      </div>
    </div>
  );
}
