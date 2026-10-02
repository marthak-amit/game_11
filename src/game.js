// Prism Rift - core 3D game (Three.js). Original mechanic: you fly INSIDE a rotating
// 8-lane neon tunnel. Walls have gaps; hugging the walls ("grazing") builds a score
// multiplier and Phase energy. Phase lets you ghost through everything for a few seconds.
import * as THREE from 'three';
import { store, SKINS } from './storage.js';
import { Sfx, haptic } from './audio.js';

const N = 8, STEP = (Math.PI * 2) / N, R = 5, SHIP_R = 3.9;
const ZONES = [190, 315, 42, 135, 262, 8]; // hue per zone
const DANGER = 0xff2d55, GOLD = 0xffe88a, GOOD = 0x4dff9a;
const TAU = Math.PI * 2;

const angDist = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const polar = (a, r, out) => out.set(Math.sin(a) * r, -Math.cos(a) * r, 0);

export class Game {
  constructor(canvas, cb) {
    this.cb = cb;
    this.state = 'menu';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 220);
    this.fog = new THREE.FogExp2(0x050510, 0.018);
    this.scene.fog = this.fog;
    this.hue = ZONES[0]; this.hueTarget = ZONES[0];
    this.envColor = new THREE.Color(); this.tmp = new THREE.Vector3(); this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion(); this.tmpS = new THREE.Vector3(1, 1, 1); this.tmpE = new THREE.Euler();

    this.buildTunnel(); this.buildPlayer(); this.buildParticles(); this.buildPools();
    this.resize(); window.addEventListener('resize', () => this.resize());
    this.reset(); this.state = 'menu';
    this.last = performance.now(); this.running = true;
    this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }

  // ---------- scene construction ----------
  buildTunnel() {
    this.RING_N = 36; this.RING_GAP = 4;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.rings = new THREE.InstancedMesh(new THREE.TorusGeometry(R + 0.25, 0.07, 5, 40), this.ringMat, this.RING_N);
    this.rings.frustumCulled = false; this.scene.add(this.rings);
    this.divMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const divGeo = new THREE.BoxGeometry(0.06, 0.04, 2.4);
    this.divs = new THREE.InstancedMesh(divGeo, this.divMat, this.RING_N * N);
    this.divs.frustumCulled = false; this.scene.add(this.divs);
    // lane guide that follows the ship
    this.guideMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(R * STEP * 0.8, 200).rotateX(-Math.PI / 2), this.guideMat);
    this.guide.position.z = -90; this.guide.frustumCulled = false;
    this.guideGroup = new THREE.Group(); this.guideGroup.add(this.guide); this.scene.add(this.guideGroup);
    this.guide.position.y = -R + 0.02;
    // speed streaks
    const n = 160, pos = new Float32Array(n * 3);
    this.streaks = { n, pos, geo: new THREE.BufferGeometry() };
    for (let i = 0; i < n; i++) this.respawnStreak(i, true);
    this.streaks.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.streakMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, map: dotTex(), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.streakPts = new THREE.Points(this.streaks.geo, this.streakMat); this.streakPts.frustumCulled = false; this.scene.add(this.streakPts);
  }
  respawnStreak(i, init) {
    const a = rnd(0, TAU), r = rnd(1, R - 0.3), p = this.streaks.pos;
    p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = Math.cos(a) * r; p[i * 3 + 2] = init ? rnd(-160, 8) : -160;
  }

  shipGeometry(shape) {
    switch (shape) {
      case 'tetra': return new THREE.TetrahedronGeometry(0.55).rotateX(0.6);
      case 'octa': return new THREE.OctahedronGeometry(0.5).scale(0.9, 0.7, 1.5);
      case 'blade': return new THREE.ConeGeometry(0.4, 1.7, 3).rotateX(-Math.PI / 2).scale(1.6, 0.5, 1);
      case 'gem': return new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.8, 1.3);
      case 'star': return new THREE.OctahedronGeometry(0.62, 0).scale(1.5, 0.45, 1.2);
      default: return new THREE.ConeGeometry(0.42, 1.5, 4).rotateX(-Math.PI / 2);
    }
  }
  buildPlayer() {
    this.player = new THREE.Group(); this.scene.add(this.player);
    this.shipHolder = new THREE.Group(); this.player.add(this.shipHolder);
    this.shipMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    this.shipEdgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.player.add(this.glow);
    this.setSkin(store().skin);
  }
  setSkin(id) {
    const skin = SKINS.find((s) => s.id === id) || SKINS[0];
    this.skin = skin;
    while (this.shipHolder.children.length) this.shipHolder.remove(this.shipHolder.children[0]);
    const g = this.shipGeometry(skin.shape);
    this.shipMat.color.setHex(skin.color).multiplyScalar(0.55);
    this.shipEdgeMat.color.setHex(0xffffff);
    this.shipHolder.add(new THREE.Mesh(g, this.shipMat), new THREE.LineSegments(new THREE.EdgesGeometry(g), this.shipEdgeMat));
    this.glow.material.color.setHex(skin.color);
  }

  buildParticles() {
    const n = 360; this.P = { n, i: 0, pos: new Float32Array(n * 3), col: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: new Float32Array(n), base: new Float32Array(n * 3) };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.P.col, 3));
    this.pMat = new THREE.PointsMaterial({ size: 0.22, map: dotTex(), alphaTest: 0.01, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pPts = new THREE.Points(g, this.pMat); this.pPts.frustumCulled = false; this.scene.add(this.pPts);
    for (let i = 0; i < n; i++) this.P.pos[i * 3 + 2] = 9999;
  }
  emit(x, y, z, vx, vy, vz, color, life) {
    const P = this.P, i = P.i; P.i = (P.i + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    const c = this.tmpC || (this.tmpC = new THREE.Color()); c.setHex(color);
    P.base[i * 3] = c.r; P.base[i * 3 + 1] = c.g; P.base[i * 3 + 2] = c.b; P.life[i] = life;
  }
  burst(x, y, z, color, count, speed) {
    for (let k = 0; k < count; k++) this.emit(x, y, z, rnd(-1, 1) * speed, rnd(-1, 1) * speed, rnd(-1, 1) * speed, color, rnd(0.4, 1.0));
  }
  updateParticles(dt) {
    const P = this.P;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { P.col[i * 3] = P.col[i * 3 + 1] = P.col[i * 3 + 2] = 0; continue; }
      P.life[i] -= dt; const k = Math.max(P.life[i], 0);
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += (P.vel[i * 3 + 2] + this.speed * 0.85) * dt;
      const f = Math.min(1, k * 2);
      P.col[i * 3] = P.base[i * 3] * f; P.col[i * 3 + 1] = P.base[i * 3 + 1] * f; P.col[i * 3 + 2] = P.base[i * 3 + 2] * f;
    }
    this.pPts.geometry.attributes.position.needsUpdate = true; this.pPts.geometry.attributes.color.needsUpdate = true;
  }

  buildPools() {
    this.blockGeo = new THREE.BoxGeometry(R * STEP * 0.78, 1.7, 1.5);
    this.blockEdges = new THREE.EdgesGeometry(this.blockGeo);
    this.blockFill = new THREE.MeshBasicMaterial({ color: 0x5a0d24 });
    this.blockLine = new THREE.LineBasicMaterial({ color: DANGER });
    this.blockGlow = new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shardGeo = new THREE.OctahedronGeometry(0.34, 0).scale(1, 1.5, 1);
    this.shardMat = new THREE.MeshBasicMaterial({ color: GOLD });
    this.padGeo = new THREE.BoxGeometry(R * STEP * 0.6, 0.06, 5);
    this.padMat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = { block: [], shard: [], pad: [] };
  }
  take(kind) {
    const list = this.pool[kind];
    for (const o of list) if (!o.visible) { o.visible = true; return o; }
    let o;
    if (kind === 'block') {
      o = new THREE.Group();
      const glow = new THREE.Mesh(this.blockGeo, this.blockGlow); glow.scale.setScalar(1.08);
      o.add(new THREE.Mesh(this.blockGeo, this.blockFill), new THREE.LineSegments(this.blockEdges, this.blockLine), glow);
    } else if (kind === 'shard') o = new THREE.Mesh(this.shardGeo, this.shardMat);
    else o = new THREE.Mesh(this.padGeo, this.padMat);
    this.scene.add(o); list.push(o); return o;
  }
  release(o) { o.visible = false; o.position.z = 9999; }

  // ---------- run control ----------
  reset() {
    this.D = 0; this.speed = 14; this.time = 0; this.score = 0; this.shards = 0; this.grazes = 0; this.phases = 0;
    this.combo = 0; this.maxMult = 1; this.sinceGraze = 0; this.energy = 0; this.phaseT = 0; this.graceT = 0; this.boostT = 0;
    this.lane = 0; this.a = 0; this.camA = 0; this.bank = 0; this.shake = 0; this.slow = 1; this.slowT = 0; this.zone = 0;
    this.revived = false; this.rows = []; this.nextAt = 70; this.prevGap = 0; this.rowCount = 0;
    for (const k in this.pool) for (const o of this.pool[k]) this.release(o);
    this.shipHolder.visible = true; this.glow.visible = true;
    this.hueTarget = this.hue = ZONES[0];
  }
  start() {
    this.reset(); this.state = 'play'; this.speed = 18; Sfx.intensity = 0; Sfx.startMusic();
    this.cb.event('start');
  }
  toMenu() { this.reset(); this.state = 'menu'; }
  pause(v) { if (this.state === 'play' && v) { this.state = 'paused'; } else if (this.state === 'paused' && !v) { this.state = 'play'; this.last = performance.now(); } }

  revive() {
    this.revived = true; this.state = 'play'; this.graceT = 2.5; this.slow = 1;
    // clear the near rows so the player gets a clean restart
    for (const r of this.rows) if (r.at - this.D < 55) this.killRow(r);
    this.rows = this.rows.filter((r) => !r.dead);
    this.shipHolder.visible = true; this.glow.visible = true;
    this.burst(this.player.position.x, this.player.position.y, 0, 0x7df9ff, 40, 6); Sfx.reward();
  }
  killRow(r) { r.dead = true; for (const o of r.objs) this.release(o); }

  // ---------- input ----------
  move(dir) {
    if (this.state === 'menu') return;
    if (this.state !== 'play') return;
    if (Math.abs(this.lane * STEP - this.a) > STEP * 1.6) return; // limit buffering
    this.lane += dir; Sfx.move(); haptic(6);
  }
  tryPhase() {
    if (this.state !== 'play' || this.phaseT > 0 || this.energy < 100) return false;
    this.phaseT = 3.2; this.energy = 0; this.phases++; this.slow = 1;
    Sfx.phase(); haptic([20, 30, 20]); this.cb.event('phase'); return true;
  }

  // ---------- level generation ----------
  get diff() { return clamp(this.D / 3600, 0, 1); }
  gapWidth() { const d = this.diff; if (d < 0.12) return 3; if (d < 0.45) return Math.random() < 0.65 ? 2 : 3; return Math.random() < 0.5 ? 1 : 2; }
  makeRow(at, gap, width, opts = {}) {
    const row = { at, gap, width, objs: [], blocked: [], shards: [], pads: [], done: false, spin: !!opts.spin, spinDir: Math.random() < 0.5 ? 1 : -1, k: 99 };
    for (let l = 0; l < N; l++) {
      const off = (l - gap + N) % N;
      if (off < width) continue;
      row.blocked.push(l);
      const b = this.take('block'); b.userData.lane = l; row.objs.push(b);
    }
    if (opts.shards !== false && Math.random() < 0.55) {
      for (let i = 0; i < width; i++) {
        if (Math.random() < 0.7) { const s = this.take('shard'); s.userData = { lane: (gap + i) % N, at: at - 3 }; row.shards.push(s); row.objs.push(s); }
      }
    }
    this.rows.push(row); this.placeRow(row); return row;
  }
  placeRow(row) {
    const rel = row.at - this.D;
    for (const o of row.objs) {
      if (o.userData.lane === undefined) continue;
      let th = o.userData.lane * STEP + (row.spin && row.k !== 99 ? row.k * STEP * row.spinDir : 0);
      if (o.userData.at !== undefined) { // shard
        polar(th, SHIP_R, this.tmp); o.position.copy(this.tmp); o.position.z = -(o.userData.at - this.D);
      } else {
        polar(th, R - 1.1, this.tmp); o.position.copy(this.tmp); o.position.z = -rel; o.rotation.z = th;
      }
    }
  }
  spawnArc() { // flowing shard spiral - reward / breather section
    const start = this.nextAt, dir = Math.random() < 0.5 ? 1 : -1, base = this.prevGap, len = 9;
    const row = { at: start, objs: [], blocked: [], shards: [], pads: [], done: true, dummy: true };
    for (let i = 0; i < len; i++) {
      const s = this.take('shard'); s.userData = { lane: (base + Math.round(i * 0.55) * dir + N * 4) % N, at: start + i * 4 };
      row.shards.push(s); row.objs.push(s);
    }
    row.endAt = start + len * 4; this.prevGap = row.shards[len - 1].userData.lane;
    this.rows.push(row); this.placeRow(row); this.nextAt = start + len * 4 + 18;
  }
  spawnBoost() {
    const lane = this.prevGap, row = { at: this.nextAt, objs: [], blocked: [], shards: [], pads: [], done: false, boost: lane };
    const p = this.take('pad'); p.userData = { lane, pad: true }; row.objs.push(p);
    for (let i = 1; i <= 4; i++) { const s = this.take('shard'); s.userData = { lane, at: this.nextAt + i * 3 }; row.shards.push(s); row.objs.push(s); }
    this.rows.push(row); row.pad = p; this.placePad(row); this.nextAt += 24;
  }
  placePad(row) { polar(row.boost * STEP, R - 0.1, this.tmp); row.pad.position.copy(this.tmp); row.pad.position.z = -(row.at - this.D); row.pad.rotation.z = row.boost * STEP; }
  spawn() {
    const d = this.diff, spd = this.speed, roll = Math.random();
    const gapT = lerp(0.85, 0.5, d);
    if (this.rowCount > 3 && roll < 0.1) return this.spawnBoost();
    if (this.rowCount > 2 && roll < 0.26) return this.spawnArc();
    if (d > 0.12 && roll < 0.5) { // slalom: tight S-curve of walls
      const n = 3 + ((Math.random() * 3) | 0), dir = Math.random() < 0.5 ? 1 : -1; let g = this.prevGap;
      for (let i = 0; i < n; i++) { g = (g + dir + N) % N; this.makeRow(this.nextAt, g, 3 - (d > 0.5 ? 1 : 0), { shards: i % 2 === 0 }); this.nextAt += spd * 0.4; }
      this.prevGap = g; this.nextAt += spd * gapT * 0.6; this.rowCount += n; return;
    }
    const maxShift = d < 0.2 ? 1 : 2; let shift = ((Math.random() * (maxShift * 2 + 1)) | 0) - maxShift;
    if (shift === 0 && Math.random() < 0.5) shift = Math.random() < 0.5 ? 1 : -1;
    const gap = (this.prevGap + shift + N) % N, spin = d > 0.3 && Math.random() < 0.28;
    this.makeRow(this.nextAt, gap, this.gapWidth(), { spin });
    this.prevGap = gap; this.rowCount++; this.nextAt += spd * (spin ? gapT + 0.35 : gapT);
  }

  // ---------- simulation ----------
  mult() { return Math.min(8, 1 + Math.floor(this.combo / 3)) * (this.phaseT > 0 ? 2 : 1); }
  addScore(v) { this.score += v * this.mult(); }
  gainEnergy(v) { if (this.phaseT <= 0) this.energy = Math.min(100, this.energy + v); }

  resolveRow(r) {
    r.done = true;
    if (r.boost !== undefined) {
      if (angDist(this.a, r.boost * STEP) < STEP * 0.6) { this.boostT = 1.3; this.gainEnergy(10); this.addScore(25); Sfx.boost(); haptic(15); this.cb.event('boost'); }
      return;
    }
    let dmin = 9, hit = false; const inv = this.phaseT > 0 || this.graceT > 0;
    for (const l of r.blocked) { const d = angDist(this.a, l * STEP); dmin = Math.min(dmin, d); if (d < STEP * 0.51) hit = true; }
    if (hit && !inv) return this.die();
    if (hit && inv) { // smash through in phase
      this.burst(this.player.position.x, this.player.position.y, -1, 0xffffff, 16, 5); haptic(8);
      this.addScore(10);
    } else if (dmin < STEP * 1.25 && r.blocked.length) {
      this.grazes++; this.combo++; this.sinceGraze = 0;
      this.gainEnergy(13); this.addScore(50); this.maxMult = Math.max(this.maxMult, this.mult());
      Sfx.graze(this.combo % 10); haptic(10);
      this.burst(this.player.position.x, this.player.position.y, 0, GOLD, 10, 3.5);
      this.cb.event('graze', { mult: this.mult(), combo: this.combo });
    } else this.sinceGraze++;
    if (this.sinceGraze >= 5 && this.combo > 0) { this.combo = 0; this.sinceGraze = 0; this.cb.event('combolost'); }
  }
  collectShards(r) {
    for (const s of r.shards) {
      if (!s.visible || s.userData.got) continue;
      if (s.userData.at - this.D < 0.6 && s.userData.at - this.D > -2) {
        if (angDist(this.a, s.userData.lane * STEP) < STEP * 0.62) {
          s.userData.got = true; this.release(s); this.shards++; this.addScore(10); this.gainEnergy(3);
          Sfx.shard(this.shardStreak = (this.shardStreak || 0) + 1 > 9 ? 0 : (this.shardStreak || 0) + 1);
          this.burst(this.player.position.x, this.player.position.y, -0.5, GOLD, 5, 2.5); haptic(4);
          this.cb.event('shard');
        } else if (s.userData.at - this.D < -0.8) { this.shardStreak = 0; }
      }
    }
  }

  die() {
    if (this.state !== 'play') return;
    this.state = 'dead'; this.shake = 1; this.slow = 0.25; this.slowT = 0.9;
    Sfx.crash(); haptic([60, 40, 90]); Sfx.stopMusic();
    const x = this.player.position.x, y = this.player.position.y;
    this.burst(x, y, 0, 0xffffff, 60, 9); this.burst(x, y, 0, this.skin.color, 60, 7); this.burst(x, y, 0, DANGER, 40, 8);
    this.shipHolder.visible = false; this.glow.visible = false;
    this.cb.event('death', this.runStats());
  }
  runStats() { return { score: Math.floor(this.score), shards: this.shards, grazes: this.grazes, phases: this.phases, maxMult: this.maxMult, distance: Math.floor(this.D), revived: this.revived }; }

  stepPlay(dt) {
    // speed curve
    const base = 18 + 26 * (1 - Math.exp(-this.time / 80));
    let target = base * (this.phaseT > 0 ? 1.3 : 1) * (this.boostT > 0 ? 1.25 : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * 3);
    this.D += this.speed * dt; this.time += dt; this.score += this.speed * dt * 0.33 * (this.phaseT > 0 ? 2 : 1);
    if (this.phaseT > 0) { this.phaseT -= dt; if (this.phaseT <= 0) { this.graceT = 0.6; Sfx.phaseEnd(); this.cb.event('phaseend'); } }
    if (this.graceT > 0) this.graceT -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    Sfx.intensity = clamp((this.speed - 18) / 26, 0, 1);

    const zone = Math.floor(this.D / 1100) % ZONES.length;
    if (zone !== this.zone) { this.zone = zone; this.hueTarget = ZONES[zone]; Sfx.zone(); this.cb.event('zone', { n: Math.floor(this.D / 1100) + 1 }); }

    while (this.nextAt - this.D < 150) this.spawn();
    for (const r of this.rows) {
      if (r.dead) continue;
      if (r.spin) { const k = Math.max(0, Math.ceil((r.at - this.D - 34) / 15)); if (k !== r.k) { r.k = k; this.placeRow(r); } }
      if (r.shards.length) this.collectShards(r);
      if (!r.done && !r.dummy && this.D >= r.at - 0.7) this.resolveRow(r);
      if (this.state !== 'play') return;
    }
    // recycle
    for (const r of this.rows) if (!r.dead && ((r.endAt || r.at) - this.D < -12)) this.killRow(r);
    this.rows = this.rows.filter((r) => !r.dead);
  }

  // ---------- frame ----------
  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.state === 'paused') { this.render(0); return; }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 1; }
    this.update(dt * this.slow, dt);
    this.render(dt);
  }

  update(dt, rawDt) {
    if (this.state === 'menu') { // attract mode: ship drifts calmly
      this.speed = 13; this.D += this.speed * dt; this.time += dt;
      this.a = Math.sin(this.time * 0.45) * STEP * 2.2;
      this.hue = lerp(this.hue, ZONES[(Math.floor(this.time / 6)) % ZONES.length], 0.01);
    } else if (this.state === 'play') {
      this.stepPlay(dt);
    } else if (this.state === 'dead') {
      this.D += this.speed * dt * 0.15;
    }
    if (this.state === 'play') {
      const tgt = this.lane * STEP; this.a += (tgt - this.a) * Math.min(1, dt * 24);
      this.hue += ((((this.hueTarget - this.hue + 540) % 360) - 180)) * Math.min(1, dt * 1.5);
    }
    this.bank += ((tgt0(this) - this.a) * 0.9 - this.bank) * Math.min(1, rawDt * 14);
    this.shake = Math.max(0, this.shake - rawDt * 1.8);
    this.updateParticles(rawDt);
  }

  render(dt) {
    const s = this.speed, hue = this.phaseT > 0 ? 0 : this.hue, ph = this.phaseT > 0;
    // environment colour
    if (ph) this.envColor.setHSL(0, 0, 0.92); else this.envColor.setHSL(((hue % 360) + 360) % 360 / 360, 0.95, 0.55);
    this.ringMat.color.copy(this.envColor); this.divMat.color.copy(this.envColor); this.guideMat.color.copy(this.envColor); this.streakMat.color.copy(this.envColor);
    const bg = this.bgColor || (this.bgColor = new THREE.Color()); bg.setHSL(((hue % 360) + 360) % 360 / 360, ph ? 0 : 0.7, ph ? 0.1 : 0.04); this.scene.background = bg; this.fog.color.copy(bg);

    // rings + dividers scroll
    const span = this.RING_N * this.RING_GAP, off = this.D % this.RING_GAP;
    for (let i = 0; i < this.RING_N; i++) {
      const z = -(i * this.RING_GAP - off) + 6; // behind camera wraps
      this.tmpQ.identity(); this.tmpS.set(1, 1, 1); this.tmp.set(0, 0, z - 0);
      this.tmpM.compose(this.tmp, this.tmpQ, this.tmpS); this.rings.setMatrixAt(i, this.tmpM);
      for (let l = 0; l < N; l++) {
        const th = (l + 0.5) * STEP; polar(th, R + 0.18, this.tmp); this.tmp.z = z - 2;
        this.tmpQ.setFromEuler(this.tmpE.set(0, 0, th)); this.tmpM.compose(this.tmp, this.tmpQ, this.tmpS); this.divs.setMatrixAt(i * N + l, this.tmpM);
      }
    }
    this.rings.instanceMatrix.needsUpdate = true; this.divs.instanceMatrix.needsUpdate = true;

    // streaks
    const sp = this.streaks.pos;
    for (let i = 0; i < this.streaks.n; i++) { sp[i * 3 + 2] += s * dt * 1.2; if (sp[i * 3 + 2] > 8) this.respawnStreak(i, false); }
    this.streaks.geo.attributes.position.needsUpdate = true;

    // rows follow the world
    for (const r of this.rows) {
      if (r.dead) continue;
      const rel = r.at - this.D;
      for (const o of r.objs) {
        if (o.userData.at !== undefined) { o.position.z = -(o.userData.at - this.D); o.rotation.y += dt * 3; }
        else if (o.userData.pad) o.position.z = -rel;
        else { o.position.z = -rel; }
      }
    }
    // blocks colour: danger stays readable; fade when phasing
    this.blockLine.color.setHex(ph ? 0x88aaff : DANGER); this.blockGlow.opacity = ph ? 0.08 : 0.3;

    // player
    polar(this.a, SHIP_R, this.player.position); this.player.rotation.z = this.a;
    this.shipHolder.rotation.z = clamp(this.bank, -0.9, 0.9) * 1.4; this.shipHolder.rotation.x = Math.sin(this.time * 9) * 0.03;
    const blink = this.graceT > 0 && !ph ? (Math.sin(this.time * 40) > 0 ? 0.35 : 1) : 1;
    this.shipMat.opacity = ph ? 0.45 : blink; this.shipEdgeMat.opacity = ph ? 0.8 : blink;
    this.glow.material.opacity = ph ? 0.42 : 0.18 + (this.boostT > 0 ? 0.2 : 0);
    this.glow.scale.setScalar(1 + Math.sin(this.time * 8) * 0.06 + (ph ? 0.4 : 0));
    this.guideGroup.rotation.z = this.a; this.guideGroup.position.set(0, 0, 0);
    // engine trail
    if (this.state !== 'dead' && this.shipHolder.visible) {
      const c = ph ? 0xffffff : this.skin.color, p = this.player.position;
      this.emit(p.x + rnd(-0.1, 0.1), p.y + rnd(-0.1, 0.1), 0.9, rnd(-0.4, 0.4), rnd(-0.4, 0.4), 6, c, 0.5);
    }

    // camera
    this.camA += (this.a - this.camA) * Math.min(1, (dt || 0.016) * 7);
    polar(this.camA, SHIP_R, this.tmp); this.tmp.multiplyScalar(0.3);
    const sh = this.shake * 0.35;
    this.camera.position.set(this.tmp.x + rnd(-sh, sh), this.tmp.y + rnd(-sh, sh), 8.5);
    this.camera.rotation.z = this.camA + rnd(-sh, sh) * 0.05;
    const fovT = 68 + clamp((s - 18) / 26, 0, 1) * 14 + (ph ? 10 : 0) + (this.boostT > 0 ? 6 : 0);
    this.camera.fov += (fovT - this.camera.fov) * Math.min(1, (dt || 0.016) * 4); this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    this.cb.frame && this.cb.frame(this);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 0.8 ? 72 : 64; this.camera.updateProjectionMatrix();
  }
}
function dotTex() {
  if (dotTex.t) return dotTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fff8'); g.addColorStop(1, '#fff0');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); return (dotTex.t = new THREE.CanvasTexture(c));
}
const tgt0 = (g) => g.lane * STEP;
