# PRISM RIFT — 3D neon tunnel runner (mobile)

One-thumb 3D arcade game built with **Three.js + Vite** (100% free tech, no assets: all graphics are
procedural and all audio is synthesized, so the APK is tiny and loads instantly).

## The hook (original mechanic)
You fly **inside an 8-lane rotating tunnel**. Walls have gaps — tap left/right to rotate to the next lane.
* **Graze** — skimming right next to a wall = score multiplier (up to x8) + Phase energy. Risk = reward.
* **Phase** — full energy: swipe up / tap the bar → 3s ghost mode, 2x score, speed boost.
* Boost pads, shard spirals (flow breathers), slalom runs, rotating "kaleidoscope" walls that lock in late.
* Zones change colour/music every 1,100 m; difficulty ramps over ~2.5 min.

## Retention & revenue (ads/IAP are simulated until you add accounts)
| System | Where |
|---|---|
| Rewarded ad: revive (5s countdown), double shards, free shards | `src/monetization.js` → `Ads.rewarded` |
| Interstitial every 3 runs (never mid-run, off for "Remove Ads") | `Ads.interstitial` |
| IAP: shard packs (₹49/149/399), Remove Ads (₹199) | `Billing.purchase`, `PRODUCTS` |
| Daily login streak (7 days) + 3 daily missions | `src/missions.js` |
| 6 unlockable ships (soft-currency sink) | `src/storage.js` `SKINS` |
| Share-score button (virality) | `src/main.js` |

## Run
```bash
npm install
npm run dev      # open on phone via the LAN URL
npm run build    # production build in dist/
```

## Ship to Android (Play Store)
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap add android && npm run android:sync && npx cap open android
```
Then wire real monetization (only `src/monetization.js` changes):
1. `npm i @capacitor-community/admob`, then set `window.__admobRewarded(placement)` (resolve `true` on reward) and `window.__admobInterstitial()`.
2. Google Play Billing plugin, then set `window.__billingPurchase(productId)`.
3. Replace icon/splash and set `appId` in `capacitor.config.json`.

## Path to ₹10 lakh/month (honest numbers)
Revenue ≈ DAU × ad views/user/day × eCPM. Indian eCPM is low (~₹40–150), so ₹10L/month realistically
needs roughly 60–100k DAU at 8–10 ad views/user/day, or fewer users with good IAP. Targets: D1 ≥ 40%, D7 ≥ 12%.
Levers: short UA video creatives, tuning revive/double-shards placements, A/B tests, and a global release
(US/EU eCPM is ~10x higher). No game can guarantee this income; the game gives you the best shot.
