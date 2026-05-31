'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldFadeOut, setShouldFadeOut] = useState(false);

  // letters of NeuraChat
  const neuraWord = "Neura".split("");
  const chatWord = "Chat".split("");

  // Neural Particle Canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    // Resize listener
    const handleResize = () => {
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle class
    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.size = Math.random() * 2 + 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.4)';
        ctx.fill();
      }
    }

    const particles: Particle[] = Array.from({ length: 40 }, () => new Particle());

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Connect particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const alpha = (1 - dist / 100) * 0.15;
            ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Update & Draw
      particles.forEach((p) => {
        p.update();
        p.draw();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 2.5 seconds timeout then redirect
    const bounceTimer = setTimeout(() => {
      setShouldFadeOut(true);
    }, 2500);

    const redirectTimer = setTimeout(() => {
      router.push('/chats');
    }, 2900);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      clearTimeout(bounceTimer);
      clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <AnimatePresence>
      {!shouldFadeOut && (
        <motion.main
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 w-full h-full md:max-w-md md:mx-auto bg-black flex flex-col items-center justify-center overflow-hidden z-50 select-none pb-20"
          id="splash-screen-container"
        >
          {/* Neural Canvas Background */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
          />

          {/* Logo Icon and typography */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            {/* Animated Logo Hexagon Badge */}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-16 h-16 bg-gradient-to-tr from-[#00D4FF]/20 to-[#FF006E]/20 border border-[#00D4FF]/40 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.3)] animate-pulse"
              id="splash-logo-container"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#FF006E] opacity-90 blur-[1px]" />
            </motion.div>

            {/* Bouncing text */}
            <div className="flex text-4xl sm:text-5xl font-extrabold font-display select-none tracking-tight">
              {/* Neura (Blue) */}
              {neuraWord.map((letter, idx) => (
                <motion.span
                  key={`neura-${idx}`}
                  initial={{ y: 80, opacity: 0, scale: 0.3 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 12,
                    delay: idx * 0.08,
                  }}
                  className="text-[#00D4FF] inline-block font-bold drop-shadow-[0_0_12px_rgba(0,212,255,0.6)]"
                >
                  {letter}
                </motion.span>
              ))}

              {/* Chat (Pink) */}
              {chatWord.map((letter, idx) => (
                <motion.span
                  key={`chat-${idx}`}
                  initial={{ y: 80, opacity: 0, scale: 0.3 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 12,
                    delay: (neuraWord.length + idx) * 0.08,
                  }}
                  className="text-[#FF006E] inline-block font-bold drop-shadow-[0_0_12px_rgba(FF,00,6E,0.6)]"
                >
                  {letter}
                </motion.span>
              ))}
            </div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="text-xs text-zinc-500 font-sans tracking-widest uppercase mt-2 h-4 text-center"
            >
              Your Neural Communication Hub
            </motion.p>
          </div>

          {/* Footer build credit or brand indicators - keeping it clean according to instruction */}
          <div className="absolute bottom-8 text-[11px] font-mono text-zinc-700 select-none">
            NeuraChat Engine v8.0.0
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}
