'use client';

export interface CallTheme {
  id: string;
  name: string;
  // background
  bg: string;
  glowTop: string;
  glowBottom: string;
  labelColor: string;
  // avatar
  haloColor: string;
  avatarBg: string;
  avatarBorder: string;
  avatarText: string;
  avatarShadow: string;
  // text
  nameColor: string;
  numberColor: string;
  statusColor: string;
  statusGlow: string;
  // controls
  ctrlBg: string;
  ctrlBorder: string;
  ctrlText: string;
  ctrlActiveBg: string;
  ctrlActiveBorder: string;
  // end / accept / snooze
  endBg: string;
  endShadow: string;
  snoozeBg: string;
  snoozeText: string;
  acceptBg: string;
  acceptShadow: string;
}

export const CALL_THEMES: CallTheme[] = [
  {
    id: 'neon',
    name: 'Neon (Default)',
    bg: 'radial-gradient(circle at 50% 25%, #001b26 0%, #000 65%)',
    glowTop: 'rgba(0,212,255,0.30)',
    glowBottom: 'rgba(255,0,110,0.22)',
    labelColor: '#52525b',
    haloColor: 'rgba(0,212,255,0.35)',
    avatarBg: '#0a0a0a',
    avatarBorder: '#00D4FF',
    avatarText: '#00D4FF',
    avatarShadow: 'rgba(0,212,255,0.55)',
    nameColor: '#ffffff',
    numberColor: '#71717a',
    statusColor: '#00D4FF',
    statusGlow: 'rgba(0,212,255,0.6)',
    ctrlBg: 'rgba(24,24,27,0.85)',
    ctrlBorder: '#27272a',
    ctrlText: '#d4d4d8',
    ctrlActiveBg: 'rgba(0,212,255,0.15)',
    ctrlActiveBorder: '#00D4FF',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#3f3f46',
    snoozeText: '#ffffff',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'cyber-green',
    name: 'Cyber Green',
    bg: 'radial-gradient(circle at 50% 20%, #001a0a 0%, #000 65%)',
    glowTop: 'rgba(34,197,94,0.32)',
    glowBottom: 'rgba(16,185,129,0.20)',
    labelColor: '#4d7c5a',
    haloColor: 'rgba(34,197,94,0.38)',
    avatarBg: '#051a0f',
    avatarBorder: '#22c55e',
    avatarText: '#86efac',
    avatarShadow: 'rgba(34,197,94,0.55)',
    nameColor: '#d1fae5',
    numberColor: '#86efac',
    statusColor: '#22c55e',
    statusGlow: 'rgba(34,197,94,0.6)',
    ctrlBg: 'rgba(5,26,15,0.9)',
    ctrlBorder: '#14532d',
    ctrlText: '#86efac',
    ctrlActiveBg: 'rgba(34,197,94,0.18)',
    ctrlActiveBorder: '#22c55e',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#14532d',
    snoozeText: '#d1fae5',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    bg: 'radial-gradient(circle at 50% 20%, #2a0e4a 0%, #0a0114 65%)',
    glowTop: 'rgba(168,85,247,0.36)',
    glowBottom: 'rgba(236,72,153,0.22)',
    labelColor: '#7a6a8a',
    haloColor: 'rgba(168,85,247,0.40)',
    avatarBg: '#1a0533',
    avatarBorder: '#a855f7',
    avatarText: '#e9d5ff',
    avatarShadow: 'rgba(168,85,247,0.6)',
    nameColor: '#f5f3ff',
    numberColor: '#c084fc',
    statusColor: '#c084fc',
    statusGlow: 'rgba(168,85,247,0.6)',
    ctrlBg: 'rgba(30,10,55,0.85)',
    ctrlBorder: '#4c1d95',
    ctrlText: '#e9d5ff',
    ctrlActiveBg: 'rgba(168,85,247,0.20)',
    ctrlActiveBorder: '#c084fc',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#4c1d95',
    snoozeText: '#e9d5ff',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    bg: 'linear-gradient(180deg, #3a1108 0%, #1a0304 65%, #0a0000 100%)',
    glowTop: 'rgba(251,146,60,0.38)',
    glowBottom: 'rgba(239,68,68,0.22)',
    labelColor: '#92400e',
    haloColor: 'rgba(251,146,60,0.42)',
    avatarBg: '#1a0803',
    avatarBorder: '#fb923c',
    avatarText: '#fed7aa',
    avatarShadow: 'rgba(251,146,60,0.6)',
    nameColor: '#fff7ed',
    numberColor: '#fdba74',
    statusColor: '#fb923c',
    statusGlow: 'rgba(251,146,60,0.6)',
    ctrlBg: 'rgba(40,12,4,0.85)',
    ctrlBorder: '#7c2d12',
    ctrlText: '#fed7aa',
    ctrlActiveBg: 'rgba(251,146,60,0.20)',
    ctrlActiveBorder: '#fb923c',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#7c2d12',
    snoozeText: '#fed7aa',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    bg: '#f4f4f5',
    glowTop: 'rgba(24,24,27,0.08)',
    glowBottom: 'rgba(24,24,27,0.06)',
    labelColor: '#71717a',
    haloColor: 'rgba(24,24,27,0.12)',
    avatarBg: '#e4e4e7',
    avatarBorder: '#18181b',
    avatarText: '#18181b',
    avatarShadow: 'rgba(0,0,0,0.15)',
    nameColor: '#18181b',
    numberColor: '#52525b',
    statusColor: '#18181b',
    statusGlow: 'rgba(0,0,0,0.1)',
    ctrlBg: '#ffffff',
    ctrlBorder: '#e4e4e7',
    ctrlText: '#3f3f46',
    ctrlActiveBg: '#18181b',
    ctrlActiveBorder: '#18181b',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.35)',
    snoozeBg: '#e4e4e7',
    snoozeText: '#18181b',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.35)',
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    bg: 'radial-gradient(circle at 50% 20%, #001d3d 0%, #000814 65%)',
    glowTop: 'rgba(59,130,246,0.32)',
    glowBottom: 'rgba(14,165,233,0.22)',
    labelColor: '#3b82f6',
    haloColor: 'rgba(59,130,246,0.38)',
    avatarBg: '#0a1929',
    avatarBorder: '#3b82f6',
    avatarText: '#bfdbfe',
    avatarShadow: 'rgba(59,130,246,0.55)',
    nameColor: '#eff6ff',
    numberColor: '#93c5fd',
    statusColor: '#3b82f6',
    statusGlow: 'rgba(59,130,246,0.6)',
    ctrlBg: 'rgba(10,25,41,0.85)',
    ctrlBorder: '#1e3a5f',
    ctrlText: '#bfdbfe',
    ctrlActiveBg: 'rgba(59,130,246,0.20)',
    ctrlActiveBorder: '#3b82f6',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#1e3a5f',
    snoozeText: '#bfdbfe',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'midnight-rose',
    name: 'Midnight Rose',
    bg: 'radial-gradient(circle at 50% 20%, #3a0520 0%, #0a0005 65%)',
    glowTop: 'rgba(236,72,153,0.36)',
    glowBottom: 'rgba(244,63,94,0.22)',
    labelColor: '#9d174d',
    haloColor: 'rgba(236,72,153,0.40)',
    avatarBg: '#1f0312',
    avatarBorder: '#ec4899',
    avatarText: '#fbcfe8',
    avatarShadow: 'rgba(236,72,153,0.6)',
    nameColor: '#fdf2f8',
    numberColor: '#f9a8d4',
    statusColor: '#ec4899',
    statusGlow: 'rgba(236,72,153,0.6)',
    ctrlBg: 'rgba(40,5,20,0.85)',
    ctrlBorder: '#831843',
    ctrlText: '#fbcfe8',
    ctrlActiveBg: 'rgba(236,72,153,0.20)',
    ctrlActiveBorder: '#ec4899',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#831843',
    snoozeText: '#fbcfe8',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'carbon-mono',
    name: 'Carbon Monochrome',
    bg: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)',
    glowTop: 'rgba(255,255,255,0.10)',
    glowBottom: 'rgba(255,255,255,0.06)',
    labelColor: '#71717a',
    haloColor: 'rgba(255,255,255,0.14)',
    avatarBg: '#0a0a0a',
    avatarBorder: '#e4e4e7',
    avatarText: '#f4f4f5',
    avatarShadow: 'rgba(255,255,255,0.35)',
    nameColor: '#ffffff',
    numberColor: '#a1a1aa',
    statusColor: '#f4f4f5',
    statusGlow: 'rgba(255,255,255,0.3)',
    ctrlBg: 'rgba(24,24,27,0.9)',
    ctrlBorder: '#3f3f46',
    ctrlText: '#e4e4e7',
    ctrlActiveBg: 'rgba(255,255,255,0.15)',
    ctrlActiveBorder: '#e4e4e7',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#3f3f46',
    snoozeText: '#ffffff',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'aurora-teal',
    name: 'Aurora Teal',
    bg: 'radial-gradient(circle at 50% 20%, #042f2e 0%, #001010 65%)',
    glowTop: 'rgba(20,184,166,0.36)',
    glowBottom: 'rgba(139,92,246,0.22)',
    labelColor: '#14b8a6',
    haloColor: 'rgba(20,184,166,0.40)',
    avatarBg: '#03201f',
    avatarBorder: '#14b8a6',
    avatarText: '#99f6e4',
    avatarShadow: 'rgba(20,184,166,0.6)',
    nameColor: '#f0fdfa',
    numberColor: '#5eead4',
    statusColor: '#14b8a6',
    statusGlow: 'rgba(20,184,166,0.6)',
    ctrlBg: 'rgba(4,47,46,0.85)',
    ctrlBorder: '#115e59',
    ctrlText: '#99f6e4',
    ctrlActiveBg: 'rgba(20,184,166,0.20)',
    ctrlActiveBorder: '#5eead4',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#115e59',
    snoozeText: '#99f6e4',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'crimson-red',
    name: 'Crimson Red',
    bg: 'radial-gradient(circle at 50% 20%, #450a0a 0%, #0a0000 65%)',
    glowTop: 'rgba(239,68,68,0.38)',
    glowBottom: 'rgba(251,146,60,0.22)',
    labelColor: '#b91c1c',
    haloColor: 'rgba(239,68,68,0.42)',
    avatarBg: '#2a0505',
    avatarBorder: '#ef4444',
    avatarText: '#fecaca',
    avatarShadow: 'rgba(239,68,68,0.6)',
    nameColor: '#fef2f2',
    numberColor: '#fca5a5',
    statusColor: '#ef4444',
    statusGlow: 'rgba(239,68,68,0.6)',
    ctrlBg: 'rgba(45,5,5,0.85)',
    ctrlBorder: '#7f1d1d',
    ctrlText: '#fecaca',
    ctrlActiveBg: 'rgba(239,68,68,0.20)',
    ctrlActiveBorder: '#ef4444',
    endBg: '#dc2626',
    endShadow: 'rgba(220,38,38,0.55)',
    snoozeBg: '#7f1d1d',
    snoozeText: '#fecaca',
    acceptBg: '#10b981',
    acceptShadow: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'obsidian-gold',
    name: 'Obsidian Gold',
    bg: 'linear-gradient(180deg, #000 0%, #050505 55%, #0a0a0a 100%)',
    glowTop: 'rgba(212,175,55,0.20)',
    glowBottom: 'rgba(212,175,55,0.12)',
    labelColor: '#a18751',
    haloColor: 'rgba(212,175,55,0.28)',
    avatarBg: '#000000',
    avatarBorder: '#d4af37',
    avatarText: '#f4d47c',
    avatarShadow: 'rgba(212,175,55,0.55)',
    nameColor: '#f5e6c5',
    numberColor: '#a18751',
    statusColor: '#d4af37',
    statusGlow: 'rgba(212,175,55,0.6)',
    ctrlBg: 'rgba(0,0,0,0.85)',
    ctrlBorder: '#2a2418',
    ctrlText: '#d4af37',
    ctrlActiveBg: 'rgba(212,175,55,0.12)',
    ctrlActiveBorder: '#d4af37',
    endBg: '#b91c1c',
    endShadow: 'rgba(185,28,28,0.5)',
    snoozeBg: '#2a2418',
    snoozeText: '#d4af37',
    acceptBg: '#d4af37',
    acceptShadow: 'rgba(212,175,55,0.55)',
  },
];

const STORAGE_KEY = 'call_ui_theme_id';
const DEFAULT_THEME_ID = 'neon';

export function getCallThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function setCallThemeId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
    // Notify any listening components in real time.
    window.dispatchEvent(new CustomEvent('neura-call-theme-change', { detail: { id } }));
  } catch {}
}

export function getCallTheme(id?: string): CallTheme {
  const wanted = id || getCallThemeId();
  return CALL_THEMES.find((t) => t.id === wanted) || CALL_THEMES[0];
}

// Hook-friendly: keep a listener so the call screen updates instantly when
// the user picks a new theme.
export function subscribeCallTheme(cb: (id: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { id?: string } | undefined;
    cb(detail?.id || getCallThemeId());
  };
  window.addEventListener('neura-call-theme-change', handler);
  return () => window.removeEventListener('neura-call-theme-change', handler);
}
