// Monetization layer. All game code calls ONLY these functions, so the real SDKs
// (AdMob + Google Play Billing via Capacitor) can be plugged in later at one place.
// In a plain browser / before accounts exist, a clearly-labelled simulator runs instead.
import { store, save } from './storage.js';

const overlay = () => document.getElementById('adsim');
const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

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
  // TODO(AdMob): replace with  AdMob.prepareRewardVideoAd / showRewardVideoAd  (see README)
  async rewarded(placement) {
    if (native() && window.__admobRewarded) return window.__admobRewarded(placement);
    return simulate('Rewarded video ad (simulated)', 3, 'Claim reward');
  },
  // Interstitial every few runs - never during gameplay, skipped for "Remove Ads" buyers.
  async interstitial() {
    const s = store();
    if (s.noAds) return;
    if (native() && window.__admobInterstitial) return window.__admobInterstitial();
    // Simulator intentionally silent for interstitials in dev.
  },
  banner(show) { /* TODO(AdMob): show/hide adaptive banner on menu screen only */ },
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
