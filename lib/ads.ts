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

let bannerVisible = false;

export async function showBanner(position: 'top' | 'bottom' = 'bottom'): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  if (bannerVisible) return;
  try {
    await AdMob.showBanner({
      adId: ACTIVE_ADS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: position === 'top'
        ? BannerAdPosition.TOP_CENTER
        : BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: true,
    });
    bannerVisible = true;
  } catch (e) {
    console.error('[ads] showBanner failed', e);
  }
}

export async function hideBanner(): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!bannerVisible) return;
  try {
    await AdMob.hideBanner();
    bannerVisible = false;
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
