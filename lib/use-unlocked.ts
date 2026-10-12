'use client';

import { useEffect, useState } from 'react';
import { UNLOCKED_COLORS_KEY, FREE_BUBBLE_COLOR_IDS } from './ad-config';

// Reads the set of permanently-unlocked bubble color ids from localStorage.
export function getUnlockedColors(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(UNLOCKED_COLORS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isColorUnlocked(id: string): boolean {
  if (FREE_BUBBLE_COLOR_IDS.includes(id)) return true;
  return getUnlockedColors().includes(id);
}

export function unlockColor(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getUnlockedColors();
    if (!list.includes(id)) list.push(id);
    window.localStorage.setItem(UNLOCKED_COLORS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('neura-unlocked-colors-changed'));
  } catch {}
}

export function useUnlockedColors(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setList(getUnlockedColors());
    update();
    window.addEventListener('neura-unlocked-colors-changed', update);
    return () => window.removeEventListener('neura-unlocked-colors-changed', update);
  }, []);
  return list;
}
