'use client';

// AdMob configuration. Test IDs are used by default — swap them for your
// real IDs once your AdMob account has the app + units created.
//
// Real IDs look like:
//   App ID:        ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
//   Banner:        ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
//   Interstitial:  ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW
//   Rewarded:      ca-app-pub-XXXXXXXXXXXXXXXX/VVVVVVVVVV

export interface AdIds {
  appId: string;
  banner: string;
  interstitial: string;
  rewarded: string;
}

// Google's official test IDs (safe for development, never serve real ads).
export const TEST_ADS: AdIds = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

// Flip to production once real IDs are ready.
export const USE_TEST_ADS = true;

// Placeholder — replace the four strings when going live.
export const PRODUCTION_ADS: AdIds = {
  appId: 'ca-app-pub-0000000000000000~0000000000',
  banner: 'ca-app-pub-0000000000000000/0000000000',
  interstitial: 'ca-app-pub-0000000000000000/0000000000',
  rewarded: 'ca-app-pub-0000000000000000/0000000000',
};

export const ACTIVE_ADS: AdIds = USE_TEST_ADS ? TEST_ADS : PRODUCTION_ADS;

// Frequency / policy knobs.
export const INTERSTITIAL_MIN_GAP_MS = 60 * 1000;      // 1 minute between interstitials
export const AD_FREE_HOURS_REWARDED = 2;               // each rewarded ad adds 2h (cumulative)
export const AD_FREE_STORAGE_KEY = 'neura_ad_free_until';

// Bubble colors that are free by default. All other palette entries need
// a one-time "watch a rewarded ad" unlock, stored permanently.
export const FREE_BUBBLE_COLOR_IDS = ['neon-yellow', 'cyber-cyan', 'emerald', 'hot-pink'];
export const UNLOCKED_COLORS_KEY = 'neura_unlocked_colors';

