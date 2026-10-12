'use client';

// v2 — preload pattern for interstitial + rewarded

import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize, RewardAdPluginEvents } from '@capacitor-community/admob';
import { ACTIVE_ADS, INTERSTITIAL_MIN_GAP_MS, USE_TEST_ADS } from './ad-config';

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
    await AdMob.initialize({ initializeForTesting: USE_TEST_ADS });
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

export async function showBanner(position: 'top' | 'bottom' = 'top'): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  try {
    await AdMob.showBanner({
      adId: ACTIVE_ADS.banner,
      // LARGE_BANNER = 320x100. Twice the height of the default BANNER so
      // the impression is worth something and stays readable.
      adSize: BannerAdSize.LARGE_BANNER,
      position: position === 'top'
        ? BannerAdPosition.TOP_CENTER
        : BannerAdPosition.BOTTOM_CENTER,
      // Top: sits just under the status bar. Bottom: above the nav bar.
      margin: position === 'top' ? 8 : 80,
      isTesting: USE_TEST_ADS,
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
//
// The plugin has to prepare the ad before it can be shown. We preload at
// app start (and again after each dismissal) so a tap on an entry point
// can show the interstitial instantly. If nothing is ready, we skip the
// ad entirely rather than blocking the user's navigation.

let interstitialReady = false;
let interstitialLoading = false;

export async function preloadInterstitial(): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  if (interstitialReady || interstitialLoading) return;
  interstitialLoading = true;
  try {
    await AdMob.prepareInterstitial({
      adId: ACTIVE_ADS.interstitial,
      isTesting: USE_TEST_ADS,
    });
    interstitialReady = true;
  } catch (e) {
    console.error('[ads] interstitial preload failed', e);
  } finally {
    interstitialLoading = false;
  }
}

// Returns true when an interstitial was actually shown. Callers can then
// decide whether to wait or navigate immediately.
export async function showInterstitial(): Promise<boolean> {
  if (!isAdsAvailable()) return false;
  if (!initialized) await initAds();
  const now = Date.now();
  if (now - lastInterstitialAt < INTERSTITIAL_MIN_GAP_MS) return false;
  if (!interstitialReady) {
    // Kick off a background load for next time, but let the user through.
    preloadInterstitial();
    return false;
  }
  interstitialReady = false;
  try {
    await AdMob.showInterstitial();
    lastInterstitialAt = now;
    // Re-arm for the next tap.
    setTimeout(() => { preloadInterstitial(); }, 800);
    return true;
  } catch (e) {
    console.error('[ads] interstitial show failed', e);
    preloadInterstitial();
    return false;
  }
}

// ---- Rewarded (used as "watch 1 ad -> 12h ad-free") ----

let rewardedReady = false;
let rewardedLoading = false;

export async function preloadRewarded(): Promise<void> {
  if (!isAdsAvailable()) return;
  if (!initialized) await initAds();
  if (rewardedReady || rewardedLoading) return;
  rewardedLoading = true;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: ACTIVE_ADS.rewarded,
      isTesting: USE_TEST_ADS,
    });
    rewardedReady = true;
  } catch (e) {
    console.error('[ads] rewarded preload failed', e);
  } finally {
    rewardedLoading = false;
  }
}

export async function showRewarded(): Promise<boolean> {
  if (!isAdsAvailable()) return false;
  if (!initialized) await initAds();
  if (!rewardedReady) {
    // Load now and show as soon as it is ready — rewarded is user-initiated
    // so it is fine to make the user wait here.
    try {
      await AdMob.prepareRewardVideoAd({
        adId: ACTIVE_ADS.rewarded,
        isTesting: USE_TEST_ADS,
      });
      rewardedReady = true;
    } catch (e) {
      console.error('[ads] rewarded prepare failed', e);
      return false;
    }
  }
  rewardedReady = false;
  return new Promise<boolean>(async (resolve) => {
    try {
      let earned = false;
      const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        earned = true;
      });
      const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, async () => {
        try { rewardListener.remove(); } catch {}
        try { dismissListener.remove(); } catch {}
        setTimeout(() => { preloadRewarded(); }, 800);
        resolve(earned);
      });
      await AdMob.showRewardVideoAd();
    } catch (e) {
      console.error('[ads] rewarded show failed', e);
      preloadRewarded();
      resolve(false);
    }
  });
}
