// Daily missions + login streak: the retention engine.
import { store, save, today } from './storage.js';

const TEMPLATES = [
  { type: 'shards', text: (n) => `Collect ${n} shards`,            vals: [40, 70, 120], reward: [40, 70, 110] },
  { type: 'grazes', text: (n) => `Graze ${n} walls`,               vals: [8, 15, 25],   reward: [40, 70, 110] },
  { type: 'score',  text: (n) => `Score ${n} in one run`,          vals: [1500, 3000, 6000], reward: [50, 90, 150] },
  { type: 'phases', text: (n) => `Use Phase ${n} times`,           vals: [1, 2, 3],     reward: [30, 50, 80] },
  { type: 'runs',   text: (n) => `Play ${n} runs`,                 vals: [3, 5, 8],     reward: [30, 50, 80] },
  { type: 'combo',  text: (n) => `Reach a x${n} multiplier`,       vals: [3, 5, 7],     reward: [40, 70, 110] },
];

function seeded(str) {
  let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

export function ensureMissions() {
  const s = store();
  if (s.missions.day === today()) return s.missions.list;
  const rnd = seeded(today());
  const pool = [...TEMPLATES].sort(() => rnd() - 0.5).slice(0, 3);
  s.missions = {
    day: today(),
    list: pool.map((t, i) => ({ type: t.type, goal: t.vals[i], reward: t.reward[i], text: t.text(t.vals[i]), progress: 0, claimed: false })),
  };
  save();
  return s.missions.list;
}

// run = { shards, grazes, score, phases, maxMult }
export function reportRun(run) {
  const list = ensureMissions();
  for (const m of list) {
    if (m.claimed) continue;
    if (m.type === 'score') m.progress = Math.max(m.progress, run.score);
    else if (m.type === 'combo') m.progress = Math.max(m.progress, run.maxMult);
    else if (m.type === 'runs') m.progress += 1;
    else m.progress += run[m.type] || 0;
    m.progress = Math.min(m.progress, m.goal);
  }
  save();
}

export function claimMission(i) {
  const m = ensureMissions()[i];
  if (!m || m.claimed || m.progress < m.goal) return 0;
  m.claimed = true; store().shards += m.reward; save();
  return m.reward;
}

export const DAILY_REWARDS = [25, 40, 60, 80, 120, 160, 300];

export function dailyStatus() {
  const d = store().daily, t = today();
  if (d.lastClaim === t) return { canClaim: false, day: d.streak };
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streak = d.lastClaim === y ? d.streak : 0;
  return { canClaim: true, day: streak };
}
export function claimDaily() {
  const st = dailyStatus(); if (!st.canClaim) return 0;
  const reward = DAILY_REWARDS[st.day % 7];
  const d = store().daily; d.lastClaim = today(); d.streak = st.day + 1;
  store().shards += reward; save(); return reward;
}
