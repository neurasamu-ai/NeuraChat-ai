'use client';

import { FREE_BUBBLE_COLOR_IDS } from './ad-config';
import { BUBBLE_COLORS } from './bubble-colors';

// A color is "unlocked" when it is either free or the current selection.
// Selecting a new color therefore locks the previous one back — the user
// must watch another ad to switch to a different premium color.
export function isColorUnlocked(id: string, currentBubbleHex: string): boolean {
  if (FREE_BUBBLE_COLOR_IDS.includes(id)) return true;
  const c = BUBBLE_COLORS.find((x) => x.id === id);
  if (!c) return false;
  return c.hex.toLowerCase() === currentBubbleHex.toLowerCase();
}

// No-op kept for API compatibility: the persistence is now the profile's
// bubbleColor value, written by the settings screen.
export function unlockColor(_id: string): void {}

// Kept for compatibility with existing callers — no persistent list now.
export function getUnlockedColors(): string[] {
  return [];
}

export function useUnlockedColors(): string[] {
  return [];
}
