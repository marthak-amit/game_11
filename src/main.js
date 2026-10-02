import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Game } from './game.js';
import { Sfx, haptic } from './audio.js';
import { store, save, SKINS } from './storage.js';
import { INTERSTITIAL_EVERY_RUNS } from './adconfig.js';
import { Ads, Billing, PRODUCTS } from './monetization.js';
import { ensureMissions, reportRun, claimMission, dailyStatus, claimDaily, DAILY_REWARDS } from './missions.js';

const $ = (id) => document.getElementById(id);
const show = (id, v = true) => $(id).classList.toggle('hidden', !v);
const S = store();
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');
const REVIVE_COST = 60;
// Run an async handler at most once at a time - rapid multi-taps are ignored.
const busyKeys = new Set();
const once = (key, fn) => async (...a) => {
  if (busyKeys.has(key)) return; busyKeys.add(key);
  try { return await fn(...a); } finally { busyKeys.delete(key); }
};
let lastStats = null, reviveTimer = null, runsSinceAd = 0, doubled = false;

function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }
function pop(text, color = '#fff', big = false) {
  const d = document.createElement('div'); d.className = 'pop' + (big ? ' big' : ''); d.textContent = text; d.style.color = color;
  $('pops').appendChild(d); setTimeout(() => d.remove(), 950);
}

// ---------- game + HUD ----------
const hudCache = {};
const setText = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
const game = new Game($('c'), {
  frame(g) {
    if (g.state !== 'play' && g.state !== 'paused') return;
    setText('score', fmt(g.score)); setText('hudShards', fmt(g.shards));
    const m = g.mult(); setText('mult', 'x' + m); $('mult').classList.toggle('hot', m > 1);
    const ph = g.phaseT > 0, ready = g.energy >= 100 && !ph;
    $('energyFill').style.width = (ph ? (g.phaseT / 3.2) * 100 : g.energy) + '%';
    const b = $('btnPhase'); b.classList.toggle('ready', ready); b.classList.toggle('active', ph); b.disabled = !ready;
    setText('phaseLbl', ph ? 'PHASE!' : ready ? 'TAP · PHASE READY' : 'PHASE');
  },
  event(type, d) {
    if (type === 'graze') pop(d.mult > 1 ? `GRAZE x${d.mult}` : 'GRAZE', '#ffe88a');
    else if (type === 'combolost') pop('combo lost', '#ff6b8a');
    else if (type === 'zone') pop(`ZONE ${d.n}`, '#7df9ff', true);
    else if (type === 'phase') pop('PHASE SHIFT', '#ffffff', true);
    else if (type === 'boost') pop('BOOST!', '#4dff9a');
    else if (type === 'death') onDeath(d);
    else if (type === 'count') {
      const h = $('hint');
      if (d.n > 0) { h.classList.remove('hidden'); h.innerHTML = `<span class="count">${d.n}</span>`; }
      else { h.classList.add('hidden'); pop('GO!', '#4dff9a', true); }
    }
  },
});

// ---------- input ----------
const canvas = $('c');
let sx = 0, sy = 0, swiped = false;
canvas.addEventListener('pointerdown', (e) => {
  Sfx.unlock(); sx = e.clientX; sy = e.clientY; swiped = false;
  if (game.state === 'play') game.move(e.clientX < window.innerWidth / 2 ? -1 : 1);
});
canvas.addEventListener('pointermove', (e) => {
  if (!swiped && game.state === 'play' && sy - e.clientY > 70 && Math.abs(e.clientX - sx) < 90) { swiped = true; game.tryPhase(); }
});
$('btnPhase').addEventListener('pointerdown', (e) => { e.stopPropagation(); game.tryPhase(); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'ArrowLeft' || e.key === 'a') game.move(-1);
  else if (e.key === 'ArrowRight' || e.key === 'd') game.move(1);
  else if (e.key === ' ' || e.key === 'ArrowUp') { if (game.state === 'menu') startRun(0); else game.tryPhase(); }
  else if (e.key === 'Escape' || e.key === 'p') pauseToggle();
});
// Android system navigation (back button / gesture / home / app switch) -> Paused dialog
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    if (Ads.isBusy()) return;
    if (game.state === 'play' || game.state === 'ready') pauseToggle(true);
    else if (game.state === 'paused') { /* stay on the dialog; Resume / Quit are explicit */ }
    else if (!$('modal').classList.contains('hidden')) $('btnCloseModal').click();
    else if (!$('revive').classList.contains('hidden')) $('btnSkipRevive').click();
    else if (!$('results').classList.contains('hidden')) $('btnHome').click();
    else App.exitApp();
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive && !Ads.isBusy()) pauseToggle(true);
  });
}
document.addEventListener('visibilitychange', () => { if (document.hidden && (game.state === 'play' || game.state === 'ready') && !Ads.isBusy()) pauseToggle(true); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- flow ----------
function refreshMenu() {
  $('menuShards').textContent = fmt(S.shards); $('menuBest').textContent = fmt(S.best);
  const list = ensureMissions(); $('missionDot').classList.toggle('hidden', !(list.some((m) => m.progress >= m.goal && !m.claimed) || dailyStatus().canClaim));
}
function startRun(readySecs = 0) {
  if (typeof readySecs !== 'number') readySecs = 0;
  if (['play', 'ready', 'paused'].includes(game.state) || Ads.isBusy()) return;
  Ads.banner(false);
  Sfx.unlock(); Sfx.ui(); doubled = false;
  ['menu', 'results', 'revive', 'pause', 'modal'].forEach((x) => show(x, false)); show('hud', true);
  Object.keys(hudCache).forEach((k) => delete hudCache[k]);
  game.setSkin(S.skin); game.start(readySecs);
  if (!S.tutorialDone) {
    const h = $('hint'); h.classList.remove('hidden');
    h.innerHTML = 'TAP <b>LEFT</b> / <b>RIGHT</b> to switch lanes<br><small>Find the gap · skim the walls for combos</small>';
    setTimeout(() => h.classList.add('hidden'), 5500);
  }
}
function pauseToggle(force) {
  if (game.state === 'play' || game.state === 'ready') { game.pause(true); show('pause', true); $('hint').classList.add('hidden'); }
  else if (game.state === 'paused' && !force) { show('pause', false); game.pause(false); }
}
$('btnPause').onclick = () => { Sfx.ui(); pauseToggle(); };
$('btnResume').onclick = once('resume', async () => { Sfx.ui(); pauseToggle(); });
$('btnQuit').onclick = () => { Sfx.stopMusic(); goHome(); };
$('btnPlay').onclick = () => startRun(0);
$('btnAgain').onclick = once('again', async () => { const shown = await maybeInterstitial(); startRun(shown ? 2.4 : 0); });
$('btnHome').onclick = once('home', async () => { Sfx.ui(); await maybeInterstitial(); goHome(); });
function goHome() { ['results', 'revive', 'pause', 'hud'].forEach((x) => show(x, false)); game.toMenu(); show('menu', true); refreshMenu(); Ads.banner(true); }
async function maybeInterstitial() {
  runsSinceAd++;
  if (runsSinceAd >= INTERSTITIAL_EVERY_RUNS && S.runs > 2) { runsSinceAd = 0; return Ads.interstitial(); }
  return false;
}

function onDeath(stats) {
  lastStats = stats; show('hud', false);
  if (!stats.revived && stats.score >= 150) openRevive(); else showResults();
}
function openRevive() {
  show('revive', true);
  const cost = REVIVE_COST; $('reviveCost').textContent = cost; $('btnReviveGems').disabled = S.shards + game.shards < cost;
  let t = 5.0; const arc = $('ringArc'); clearInterval(reviveTimer);
  const upd = () => { $('reviveNum').textContent = Math.ceil(t); arc.style.strokeDashoffset = 276.5 * (1 - t / 5); };
  upd();
  reviveTimer = setInterval(() => { t -= 0.1; upd(); if (t <= 0) { clearInterval(reviveTimer); show('revive', false); showResults(); } }, 100);
}
function doRevive() { clearInterval(reviveTimer); show('revive', false); show('hud', true); game.revive(); Sfx.startMusic(); }
$('btnReviveAd').onclick = once('reviveAd', async () => {
  clearInterval(reviveTimer);
  if (await Ads.rewarded('revive')) doRevive(); else { show('revive', false); showResults(); }
});
$('btnReviveGems').onclick = once('reviveGems', async () => {
  if (game.state !== 'dead') return;
  if (S.shards + game.shards < REVIVE_COST) return;
  const fromRun = Math.min(game.shards, REVIVE_COST); game.shards -= fromRun; S.shards -= REVIVE_COST - fromRun;
  save(); doRevive();
});
$('btnSkipRevive').onclick = once('skip', async () => { if (game.state !== 'dead') return; clearInterval(reviveTimer); show('revive', false); showResults(); });

function showResults() {
  const st = game.runStats(); lastStats = st;
  const isBest = st.score > S.best; if (isBest) S.best = st.score;
  S.shards += st.shards; S.totalShards += st.shards; S.totalGrazes += st.grazes; S.totalPhases += st.phases; S.runs++;
  reportRun(st); save();
  $('resScore').textContent = fmt(st.score); $('resShards').textContent = '+' + st.shards; $('resGrazes').textContent = st.grazes; $('resMult').textContent = 'x' + st.maxMult;
  $('resBest').textContent = fmt(S.best); show('newBest', isBest);
  $('btnDouble').disabled = st.shards < 5; $('btnDouble').textContent = `▶ Watch ad · Double shards (+${st.shards})`; $('btnDouble').classList.toggle('hidden', st.shards < 5);
  show('results', true); if (isBest) Sfx.reward();
}
$('btnDouble').onclick = once('double', async () => {
  if (doubled || !(await Ads.rewarded('double'))) return;
  doubled = true; S.shards += lastStats.shards; save(); $('btnDouble').disabled = true; $('btnDouble').textContent = '✓ Doubled!'; Sfx.reward(); toast(`+${lastStats.shards} ◆`);
});
$('btnShare').onclick = async () => {
  const text = `I scored ${fmt(lastStats.score)} in PRISM RIFT! Can you beat me?`;
  try { if (navigator.share) await navigator.share({ title: 'Prism Rift', text, url: location.href }); else { await navigator.clipboard.writeText(text + ' ' + location.href); toast('Copied to clipboard'); } } catch (e) {}
};

// ---------- modals ----------
function openModal(title, html, bind) { $('modalTitle').textContent = title; $('modalBody').innerHTML = html; show('modal', true); if (bind) bind($('modalBody')); }
$('btnCloseModal').onclick = () => { Sfx.ui(); show('modal', false); refreshMenu(); };
document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { Sfx.unlock(); Sfx.ui(); ({ ships, missions, shop }[b.dataset.open])(); }));
$('btnSettings').onclick = () => { Sfx.unlock(); Sfx.ui(); settings(); };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function ships() {
  const rows = () => SKINS.map((s) => {
    const owned = S.owned.includes(s.id), sel = S.skin === s.id;
    return `<div class="item ${sel ? 'sel' : ''}"><div class="swatch" style="color:${hex(s.swatch)}"></div><div class="grow"><div class="t">${s.name}</div><div class="d">${owned ? (sel ? 'Equipped' : 'Owned') : s.price + ' ◆'}</div></div>
      <button data-id="${s.id}" ${sel ? 'disabled' : ''}>${owned ? 'Equip' : 'Buy'}</button></div>`;
  }).join('');
  openModal('SHIPS', rows(), (el) => {
    el.onclick = (e) => {
      const id = e.target.dataset && e.target.dataset.id; if (!id) return;
      const s = SKINS.find((x) => x.id === id);
      if (!S.owned.includes(id)) { if (S.shards < s.price) return toast('Not enough ◆ shards'); S.shards -= s.price; S.owned.push(id); Sfx.reward(); }
      S.skin = id; game.setSkin(id); save(); el.innerHTML = rows(); $('menuShards').textContent = fmt(S.shards); Sfx.ui();
    };
  });
}

function missions() {
  const render = () => {
    const d = dailyStatus(), list = ensureMissions();
    const days = DAILY_REWARDS.map((r, i) => `<div class="day ${i === d.day % 7 && d.canClaim ? 'cur' : i < d.day % 7 || (!d.canClaim && i < d.day % 7 + 0) ? 'past' : ''}">D${i + 1}<br>◆${r}</div>`).join('');
    return `<div class="item" style="flex-direction:column;align-items:stretch"><div class="t">Daily login streak</div><div class="days">${days}</div>
      <button data-daily="1" ${d.canClaim ? '' : 'disabled'} style="margin-top:6px;padding:12px">${d.canClaim ? 'Claim ◆ ' + DAILY_REWARDS[d.day % 7] : 'Come back tomorrow'}</button></div>` +
      list.map((m, i) => `<div class="item"><div class="grow"><div class="t">${m.text}</div><div class="bar"><i style="width:${(m.progress / m.goal) * 100}%"></i></div><div class="d">${Math.floor(m.progress)} / ${m.goal}</div></div>
      <button data-m="${i}" ${m.progress >= m.goal && !m.claimed ? '' : 'disabled'}>${m.claimed ? '✓' : '◆ ' + m.reward}</button></div>`).join('');
  };
  openModal('MISSIONS', render(), (el) => {
    el.onclick = (e) => {
      const t = e.target; let r = 0;
      if (t.dataset.daily) r = claimDaily(); else if (t.dataset.m !== undefined) r = claimMission(+t.dataset.m);
      if (r) { Sfx.reward(); haptic(20); toast(`+${r} ◆`); el.innerHTML = render(); $('menuShards').textContent = fmt(S.shards); }
    };
  });
}

function shop() {
  const html = `<div class="item"><div class="grow"><div class="t">Free shards</div><div class="d">Watch a short video</div></div><button data-free="1">▶ +50 ◆</button></div>` +
    PRODUCTS.filter((p) => !(p.id === 'no_ads' && S.noAds)).map((p) => `<div class="item"><div class="grow"><div class="t">${p.title}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</div><div class="d">${p.desc}</div></div><button data-p="${p.id}">${p.price}</button></div>`).join('');
  openModal('SHOP', html, (el) => {
    el.onclick = once('shop', async (e) => {
      const t = e.target;
      if (t.dataset.free) { if (await Ads.rewarded('shop')) { S.shards += 50; save(); Sfx.reward(); toast('+50 ◆'); $('menuShards').textContent = fmt(S.shards); } }
      else if (t.dataset.p) { if (await Billing.purchase(t.dataset.p)) { Sfx.reward(); toast('Purchase complete!'); $('menuShards').textContent = fmt(S.shards); shop(); } }
    });
  });
}

function settings() {
  const row = (k, label) => `<div class="toggle" data-k="${k}">${label}<div class="sw ${S[k] ? 'on' : ''}"></div></div>`;
  openModal('SETTINGS', row('sfx', 'Sound effects') + row('music', 'Music') + row('haptics', 'Vibration') +
    `<div class="d" style="opacity:.6;font-size:12px;padding:6px">Prism Rift v1.0 · Best ${fmt(S.best)} · ${S.runs} runs</div>`, (el) => {
    el.onclick = (e) => {
      const r = e.target.closest('[data-k]'); if (!r) return; const k = r.dataset.k; S[k] = !S[k]; save();
      r.querySelector('.sw').classList.toggle('on', S[k]); if (k === 'music') { S.music ? Sfx.startMusic() : Sfx.stopMusic(); } Sfx.ui();
    };
  });
}

refreshMenu(); window.__toast = toast; Ads.init().then(() => Ads.banner(true));
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('localhost') && !Ads.isNative()) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__game = game; // debugging hook
