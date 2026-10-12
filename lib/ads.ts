'use client';

import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize, RewardAdPluginEvents } from '@capacitor-community/admob';
import { ACTIVE_ADS, INTERSTITIAL_MIN_GAP_MS } from './ad-config';

let initialized = false;
let lastInterstitialAt = 0;

export function isAdsAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function initAds(): Promise<boolean> {
  if (initialized) return true;
  if (!isAdsAvailable()) return false;
  try {
    await AdMob.initialize({ initializeForTesting: true });
    initialized = true;
    return true;
  } catch (e) {
    console.error('[ads] init failed', e);
    return false;
  }
}

// ---- Banner ----
//
// AdMob.showBanner is idempotent — calling it while a banner is already
// showing just updates the position. So we do NOT gate it behind a
// module-level "visible" flag: doing that caused a race where the new
// screen mounted (skipped because the flag was still true) before the
// old screen unmounted and hid the banner, leaving nothing on screen.

export async function showBanner(position: 'top' | 'bottom' = 'bottom'): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  try {
    await AdMob.showBanner({
      adId: ACTIVE_ADS.banner,
      // Fixed BANNER size is more reliable than ADAPTIVE_BANNER across ROMs.
      adSize: BannerAdSize.BANNER,
      position: position === 'top'
        ? BannerAdPosition.TOP_CENTER
        : BannerAdPosition.BOTTOM_CENTER,
      // Non-zero margin lifts the banner above the system navigation bar.
      margin: position === 'top' ? 24 : 56,
      isTesting: true,
    });
    console.log('[ads] banner shown, pos=' + position);
  } catch (e) {
    console.error('[ads] showBanner failed', e);
  }
}

export async function hideBanner(): Promise<void> {
  if (!isAdsAvailable()) return;
  try {
    await AdMob.hideBanner();
  } catch (e) {
    console.error('[ads] hideBanner failed', e);
  }
}

// ---- Interstitial ----

export async function showInterstitial(): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  const now = Date.now();
  if (now - lastInterstitialAt < INTERSTITIAL_MIN_GAP_MS) return;
  try {
    await AdMob.prepareInterstitial({
      adId: ACTIVE_ADS.interstitial,
      isTesting: true,
    });
    await AdMob.showInterstitial();
    lastInterstitialAt = now;
  } catch (e) {
    console.error('[ads] interstitial failed', e);
  }
}

// ---- Rewarded (used as "watch 1 ad -> 12h ad-free") ----

export async function showRewarded(): Promise<boolean> {
  if (!isAdsAvailable()) return false;
  if (!initialized) await initAds();
  return new Promise<boolean>(async (resolve) => {
    try {
      let earned = false;
      const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        earned = true;
      });
      const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, async () => {
        try { rewardListener.remove(); } catch {}
        try { dismissListener.remove(); } catch {}
        resolve(earned);
      });
      await AdMob.prepareRewardVideoAd({
        adId: ACTIVE_ADS.rewarded,
        isTesting: true,
      });
      await AdMob.showRewardVideoAd();
    } catch (e) {
      console.error('[ads] rewarded failed', e);
      resolve(false);
    }
  });
}
