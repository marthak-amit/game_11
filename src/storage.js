// Persistent save data (localStorage), with safe fallbacks.
const KEY = 'prismrift.save.v1';

export const SKINS = [
  { id: 'dart',   name: 'Dart',     color: 0x00e5ff, shape: 'cone',  price: 0 },
  { id: 'comet',  name: 'Comet',    color: 0xff3df2, shape: 'tetra', price: 300 },
  { id: 'ember',  name: 'Ember',    color: 0xffa500, shape: 'octa',  price: 600 },
  { id: 'viper',  name: 'Viper',    color: 0x7dff4a, shape: 'blade', price: 1000 },
  { id: 'nova',   name: 'Nova',     color: 0xb06bff, shape: 'gem',   price: 1800 },
  { id: 'aurum',  name: 'Aurum',    color: 0xffe14d, shape: 'star',  price: 3000 },
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
