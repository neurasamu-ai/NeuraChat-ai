// Palette for outgoing SMS bubble color. Users pick one of these in
// Settings → Appearance. Each entry has a hex and a display name.
export interface BubbleColor {
  id: string;
  name: string;
  hex: string;
}

export const BUBBLE_COLORS: BubbleColor[] = [
  { id: 'neon-yellow', name: 'Neon Yellow', hex: '#cbfe00' },
  { id: 'cyber-cyan',  name: 'Cyber Cyan',  hex: '#00D4FF' },
  { id: 'emerald',     name: 'Emerald',     hex: '#10b981' },
  { id: 'sunset',      name: 'Sunset',      hex: '#f97316' },
  { id: 'hot-pink',    name: 'Hot Pink',    hex: '#FF006E' },
  { id: 'violet',      name: 'Violet',      hex: '#8b5cf6' },
  { id: 'rose',        name: 'Rose',        hex: '#f43f5e' },
  { id: 'sky',         name: 'Sky',         hex: '#0ea5e9' },
  { id: 'amber',       name: 'Amber',       hex: '#f59e0b' },
  { id: 'teal',        name: 'Teal',        hex: '#14b8a6' },
  { id: 'slate',       name: 'Slate',       hex: '#475569' },
  { id: 'rose-gold',   name: 'Rose Gold',   hex: '#e8b4b8' },
];

export const DEFAULT_BUBBLE_COLOR = BUBBLE_COLORS[0].hex;

export function getBubbleColorHex(idOrHex: string | undefined): string {
  if (!idOrHex) return DEFAULT_BUBBLE_COLOR;
  if (idOrHex.startsWith('#')) return idOrHex;
  const found = BUBBLE_COLORS.find((c) => c.id === idOrHex);
  return found?.hex || DEFAULT_BUBBLE_COLOR;
}

// Returns a dark, readable text color for a given bubble background so the
// outgoing bubble text stays legible across the whole palette.
export function bubbleTextColor(hex: string): string {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    // Perceived luminance.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#18181b' : '#ffffff';
  } catch {
    return '#18181b';
  }
}
