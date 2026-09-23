import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(prefix: string = "id"): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getCurrentTimestamp(): number {
  return Date.now();
}

export function getRandomCallDuration(): number {
  return Math.floor(Math.random() * 120) + 10;
}

export function triggerDial(phone: string) {
  // Prefer TelecomManager via the plugin. Fall back to tel: intent.
  if (typeof window === 'undefined') return;
  (async () => {
    try {
      const mod = await import('@/lib/telecom-plugin');
      const res = await mod.placeCall(phone);
      if (!res.success) {
        window.location.href = `tel:${phone}`;
      }
    } catch {
      window.location.href = `tel:${phone}`;
    }
  })();
}

export function triggerSms(phone: string, bodyText?: string) {
  if (typeof window !== 'undefined') {
    const bodyParam = bodyText ? `?body=${encodeURIComponent(bodyText)}` : '';
    window.location.href = `sms:${phone}${bodyParam}`;
  }
}
