// ===== AdMob configuration =====
// Currently GOOGLE'S OFFICIAL TEST IDs (always fill, safe to click, no account needed).
// When you get your AdMob account, put your real IDs below, set TEST_MODE = false,
// and ALSO put your real App ID in android/app/src/main/res/values/strings.xml (admob_app_id).
export const TEST_MODE = true;

export const AD_UNITS = {
  banner:       'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded:     'ca-app-pub-3940256099942544/5224354917',
};
// How often (in finished runs) an interstitial may show.
export const INTERSTITIAL_EVERY_RUNS = 3;
