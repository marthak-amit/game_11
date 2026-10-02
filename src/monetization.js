// Monetization layer. All game code calls ONLY these functions, so the real SDKs
// (AdMob + Google Play Billing via Capacitor) can be plugged in later at one place.
// In a plain browser / before accounts exist, a clearly-labelled simulator runs instead.
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { store, save } from './storage.js';
import { TEST_MODE, AD_UNITS } from './adconfig.js';

const overlay = () => document.getElementById('adsim');
const native = () => Capacitor.isNativePlatform();

function simulate(title, seconds, okLabel) {
  return new Promise((resolve) => {
    const el = overlay();
    el.querySelector('h3').textContent = title;
    const btn = el.querySelector('button.ok'), cancel = el.querySelector('button.cancel');
    const cd = el.querySelector('.cd');
    let left = seconds; btn.disabled = true; btn.textContent = okLabel; cd.textContent = left;
    el.classList.add('show');
    const tm = setInterval(() => { left--; cd.textContent = Math.max(left, 0); if (left <= 0) { btn.disabled = false; clearInterval(tm); } }, 1000);
    const done = (v) => { clearInterval(tm); el.classList.remove('show'); btn.onclick = cancel.onclick = null; resolve(v); };
    btn.onclick = () => done(true); cancel.onclick = () => done(false);
  });
}

export const Ads = {
  _init: null,
  isNative: native,
  init() {
    if (!native()) return Promise.resolve();
    return (this._init ||= AdMob.initialize({ initializeForTesting: TEST_MODE }).then(() => this.preloadInterstitial()).catch((e) => console.warn('AdMob init', e)));
  },
  preloadInterstitial() {
    return AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: TEST_MODE }).catch(() => {});
  },
  // Resolves true only if the user earned the reward.
  async rewarded(placement) {
    if (!native()) return simulate('Rewarded video ad (simulated)', 3, 'Claim reward');
    await this.init();
    let earned = false;
    const h = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; });
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, isTesting: TEST_MODE });
      await AdMob.showRewardVideoAd();
    } catch (e) { console.warn('rewarded failed', e); window.__toast && window.__toast('Ad not available, try again'); }
    h.remove();
    return earned;
  },
  // Interstitial between runs - never during gameplay, skipped for "Remove Ads" buyers.
  async interstitial() {
    if (store().noAds || !native()) return;
    try { await this.init(); await AdMob.showInterstitial(); } catch (e) { /* not loaded yet */ }
    this.preloadInterstitial();
  },
  async banner(show) {
    if (!native() || store().noAds) return;
    try {
      await this.init();
      if (show) { await AdMob.showBanner({ adId: AD_UNITS.banner, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TEST_MODE }); document.body.classList.add('banner-on'); }
      else { await AdMob.removeBanner(); document.body.classList.remove('banner-on'); }
    } catch (e) { console.warn('banner', e); }
  },
};

export const PRODUCTS = [
  { id: 'shards_small',  title: '500 Shards',   desc: 'Starter pack',           price: '₹49',  give: { shards: 500 } },
  { id: 'shards_medium', title: '1,500 Shards', desc: 'Best value',             price: '₹149', give: { shards: 1500 }, badge: 'POPULAR' },
  { id: 'shards_large',  title: '5,000 Shards', desc: 'Unlock everything fast', price: '₹399', give: { shards: 5000 }, badge: 'BEST DEAL' },
  { id: 'no_ads',        title: 'Remove Ads',   desc: 'No interstitials ever + 500 Shards', price: '₹199', give: { shards: 500, noAds: true } },
];

export const Billing = {
  // TODO(Play Billing): call the real purchase flow, then grant on success.
  async purchase(id) {
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p) return false;
    let ok = false;
    if (native() && window.__billingPurchase) ok = await window.__billingPurchase(id);
    else ok = await simulate(`Buy "${p.title}" for ${p.price}? (test mode, no real charge)`, 1, 'Confirm purchase');
    if (!ok) return false;
    const s = store();
    if (p.give.shards) s.shards += p.give.shards;
    if (p.give.noAds) s.noAds = true;
    save();
    return true;
  },
};
