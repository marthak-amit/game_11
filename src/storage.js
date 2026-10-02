// Persistent save data (localStorage), with safe fallbacks.
const KEY = 'prismrift.save.v1';

export const SKINS = [
  { id: 'dart',   name: 'Apollo',  color: 0xff7a18, swatch: 0xe23c2b, price: 0 },
  { id: 'comet',  name: 'Shuttle', color: 0x7fd0ff, swatch: 0xc2622b, price: 300 },
  { id: 'ember',  name: 'Inferno', color: 0xff3a10, swatch: 0xff6a1a, price: 600 },
  { id: 'viper',  name: 'Stealth', color: 0x39ff7a, swatch: 0x39ff7a, price: 1000 },
  { id: 'nova',   name: 'Nebula',  color: 0xb06bff, swatch: 0x9b5cff, price: 1800 },
  { id: 'aurum',  name: 'Aurum',   color: 0xffd23a, swatch: 0xe8b923, price: 3000 },
];

const defaults = () => ({
  best: 0, shards: 0, runs: 0, totalShards: 0, totalGrazes: 0, totalPhases: 0,
  skin: 'dart', owned: ['dart'],
  sfx: true, music: true, haptics: true,
  noAds: false,
  daily: { lastClaim: '', streak: 0 },
  missions: { day: '', list: [] },
  tutorialDone: false,
});

let data = defaults();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = { ...defaults(), ...JSON.parse(raw) };
} catch (e) { /* storage unavailable */ }

export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
export const store = () => data;
export const today = () => new Date().toISOString().slice(0, 10);
