'use client';

import React from 'react';

interface AiHubLogoProps {
  size?: number;       // px
  animated?: boolean;  // shimmer + pulse
  className?: string;
}

// Premium AI hub logo: layered neon mark with a subtle slow shimmer and
// two orbiting particles. Pure SVG, no image assets. Designed to sit on
// both dark and light backgrounds.
export default function AiHubLogo({
  size = 56,
  animated = true,
  className = '',
}: AiHubLogoProps) {
  const gid = React.useId().replace(/:/g, '');
  const gradientId = `ai-grad-${gid}`;
  const glowId = `ai-glow-${gid}`;
  const shineId = `ai-shine-${gid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{
        filter: animated
          ? 'drop-shadow(0 0 10px rgba(0,212,255,0.35)) drop-shadow(0 0 22px rgba(255,0,110,0.2))'
          : 'none',
      }}
    >
      <defs>
        {/* Main gradient: cyan -> violet -> pink */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#FF006E" />
        </linearGradient>

        {/* Soft inner glow */}
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
        </radialGradient>

        {/* Diagonal shine that sweeps across the glyph */}
        <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          {animated && (
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="-1.2 0"
              to="1.2 0"
              dur="3.5s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
      </defs>

      {/* Soft halo behind everything */}
      <circle cx="32" cy="32" r="30" fill={`url(#${glowId})`} />

      {/* Outer ring (thin) */}
      <circle
        cx="32"
        cy="32"
        r="27"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1"
        opacity="0.55"
      />

      {/* Inner rounded square — the "chip" */}
      <rect
        x="14"
        y="14"
        width="36"
        height="36"
        rx="11"
        fill="#0a0a0a"
        stroke={`url(#${gradientId})`}
        strokeWidth="2"
      />

      {/* AI monogram: stylized A (up-right stroke) + I (vertical bar) */}
      <g
        stroke={`url(#${gradientId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* A: two slanted strokes meeting at the top-right */}
        <path d="M 22 42 L 29.5 23 L 37 42" />
        {/* A crossbar */}
        <path d="M 25.2 35 L 33.8 35" opacity="0.85" />
        {/* I: vertical bar */}
        <path d="M 42 23 L 42 42" />
      </g>

      {/* Shine overlay clipped to the rounded square */}
      <rect
        x="14"
        y="14"
        width="36"
        height="36"
        rx="11"
        fill={`url(#${shineId})`}
        style={{ mixBlendMode: 'screen' }}
        pointerEvents="none"
      />

      {/* Orbiting particle 1 — cyan, top-right */}
      {animated && (
        <circle r="1.6" fill="#00D4FF" opacity="0.9">
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            path="M 32 4 A 28 28 0 0 1 60 32 A 28 28 0 0 1 32 60 A 28 28 0 0 1 4 32 A 28 28 0 0 1 32 4 Z"
          />
        </circle>
      )}

      {/* Orbiting particle 2 — pink, offset phase */}
      {animated && (
        <circle r="1.3" fill="#FF006E" opacity="0.9">
          <animateMotion
            dur="9s"
            begin="2.2s"
            repeatCount="indefinite"
            path="M 32 4 A 28 28 0 0 1 60 32 A 28 28 0 0 1 32 60 A 28 28 0 0 1 4 32 A 28 28 0 0 1 32 4 Z"
          />
        </circle>
      )}
    </svg>
  );
}
