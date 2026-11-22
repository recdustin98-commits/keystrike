import { wordsFor } from './words.js';

export const ZMAX = 130;   // meters ahead that are drawn
export const ZVIS = 128;   // words show as soon as their object appears at the top

function rng(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- Course: the same obstacles for everyone with the same seed ---------------- */
export class Course {
  constructor(seed, crew = 1) {
    this.r = rng(seed);
    this.crew = crew;
    this.spacing = 18.5 / (1 + 0.55 * (crew - 1));
    this.lastThreat = 0;
    this.list = [];
    this.next = ZMAX - 4;    // first obstacle appears at the horizon right at GO, not on top of you
  }
  ensure(upTo) {
    while (this.next < upTo) {
      this.add(this.next);
      const warm = this.next < 350 ? 1 + 0.8 * (1 - this.next / 350) : 1;   // sparse warm-up
      this.next += this.spacing * warm * (0.7 + this.r() * 0.6);
    }
  }
  add(d) {
    const r = this.r, id = this.list.length;
    // Mostly rocks in your lane (never a long empty stretch); fewer gold crystals on the sides.
    const roll = r();
    const threat = d - this.lastThreat > this.spacing * 2.2 || roll < Math.min(0.72, 0.6 + d / 25000);
    if (threat) this.lastThreat = d;
    const x = threat ? (r() * 2 - 1) * 0.3 : (r() < 0.5 ? -1 : 1) * (1 + r() * (1.3 + 0.3 * (this.crew - 1)));
    const pool = wordsFor(d);
    const used = new Set(this.list.slice(-Math.min(22, 10 + this.crew * 4)).map(o => o.w[0]));
    let w = null;
    for (let i = 0; i < 30; i++) { const c = pool[Math.floor(r() * pool.length)]; if (!used.has(c[0])) { w = c; break; } }
    if (!w) w = pool[Math.floor(r() * pool.length)];
    this.list.push({ id, d, x, threat, w, rot: r() * 6.28, spin: (r() * 2 - 1) * 1.2, v: Math.floor(r() * 6) });
  }
}

/* ---------------- Sprites (drawn once, reused every frame) ---------------- */
function makeAsteroid(seed) {
  const r = rng(seed * 977 + 13), S = 128, c = document.createElement('canvas');
  c.width = c.height = S; const g = c.getContext('2d'), cx = S / 2, cy = S / 2;
  const n = 13, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, R = 44 + r() * 14; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  const path = () => { g.beginPath(); pts.forEach((p, i) => { const q = pts[(i + 1) % n]; const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? g.quadraticCurveTo(p[0], p[1], mx, my) : g.moveTo(mx, my); }); g.closePath(); };
  path();
  const tones = [['#a08a78', '#6e5b4e', '#2b211c'], ['#9a8f86', '#625850', '#231e1b'], ['#a3785f', '#6a4636', '#2a1912']][seed % 3];
  const grd = g.createRadialGradient(cx - 18, cy - 20, 6, cx, cy, 62);
  grd.addColorStop(0, tones[0]); grd.addColorStop(0.55, tones[1]); grd.addColorStop(1, tones[2]);
  g.fillStyle = grd; g.fill();
  g.save(); path(); g.clip();
  for (let i = 0; i < 7; i++) {
    const x = cx + (r() * 2 - 1) * 32, y = cy + (r() * 2 - 1) * 32, R = 4 + r() * 9;
    g.fillStyle = 'rgba(20,14,10,.45)'; g.beginPath(); g.arc(x, y, R, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(255,230,200,.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x - 1, y - 1, R, 3.6, 5.6); g.stroke();
  }
  for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(r() * S, r() * S, 2, 2); }
  g.restore();
  g.strokeStyle = 'rgba(255,214,180,.35)'; g.lineWidth = 2; path(); g.save(); g.clip(); g.translate(-3, -3); path(); g.stroke(); g.restore();
  return c;
}
function makeCrystal() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const top = [64, 10], bot = [64, 118], L = [22, 54], R = [106, 54], ml = [44, 46], mr = [84, 46], mc = [64, 58];
  const tri = (a, b, d, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...d); g.closePath(); g.fill(); };
  tri(top, L, ml, '#ffe6a3'); tri(top, ml, mc, '#fff3c9'); tri(top, mc, mr, '#f6cf6a'); tri(top, mr, R, '#d9a63a');
  tri(L, ml, mc, '#f2c14e'); tri(R, mr, mc, '#b98322'); tri(L, mc, bot, '#d79f33'); tri(R, mc, bot, '#8f5f14');
  g.strokeStyle = 'rgba(255,250,230,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(...top); g.lineTo(...L); g.lineTo(...bot); g.lineTo(...R); g.closePath(); g.stroke();
  return c;
}

function makeBackdrop(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1230'); bg.addColorStop(0.45, '#070b1f'); bg.addColorStop(1, '#04060f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(W * 0.78, H * 0.1, W * 0.75, 'rgba(120,60,170,.42)');
  blob(W * 0.15, H * 0.06, W * 0.6, 'rgba(40,110,170,.38)');
  blob(W * 0.55, H * 0.2, W * 0.45, 'rgba(190,70,120,.22)');
  blob(W * 0.3, H * 0.28, W * 0.35, 'rgba(60,170,170,.12)');
  const r = rng(7);
  for (let i = 0; i < 260; i++) { const a = r(); g.fillStyle = `rgba(255,255,255,${0.15 + a * 0.7})`; const s = a > 0.97 ? 2 : 1; g.fillRect(r() * W, r() * H * 0.7, s, s); }
  // ringed planet
  const px = W * 0.83, py = H * 0.14, pr = Math.min(W, H) * 0.05;
  const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
  pg.addColorStop(0, '#f1d3a4'); pg.addColorStop(0.6, '#c08a5a'); pg.addColorStop(1, '#5a3a25');
  g.save(); g.translate(px, py); g.rotate(-0.35);
  g.strokeStyle = 'rgba(240,215,170,.45)'; g.lineWidth = pr * 0.12; g.beginPath(); g.ellipse(0, 0, pr * 1.8, pr * 0.42, 0, Math.PI, 0); g.stroke();
  g.restore();
  g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, 6.28); g.fill();
  g.save(); g.translate(px, py); g.rotate(-0.35);
  g.strokeStyle = 'rgba(240,215,170,.6)'; g.lineWidth = pr * 0.12; g.beginPath(); g.ellipse(0, 0, pr * 1.8, pr * 0.42, 0, 0, Math.PI); g.stroke();
  g.restore();
  return c;
}

/* ---------------- The game ---------------- */
export class Game {
  constructor(canvas, o = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mode = o.mode || 'solo';            // solo | copilot | race | demo
    this.demo = this.mode === 'demo';
    this.seed = o.seed ?? ((Math.random() * 1e9) | 0);
    this.crew = o.crew || 1;
    this.auth = o.auth !== false;            // this device moves the plane and keeps score
    this.me = o.me || { id: 'me', color: '#7fe0ff', name: 'You' };
    this.seats = o.seats && o.seats.length ? o.seats : [this.me];   // co-pilots on this ship, in seat order
    this.raceLen = o.raceLen || 2000;
    this.cb = o.cb || {};
    this.course = new Course(this.seed, this.crew);
    this.dead = new Set();
    this.aims = new Map();                   // other seats: seatId -> {id, typed, color, name}
    this.target = null; this.typed = 0;
    this.p = { dist: 0, speed: 0, boostT: 0, slowT: 0, lives: this.mode === 'race' ? -1 : 3, score: 0, combo: 0, best: 0, finished: false, over: false, time: 0 };
    this.stats = { keys: 0, good: 0, words: 0 };
    this.parts = []; this.floats = []; this.beams = []; this.rings = [];
    this.shake = 0; this.flash = 0; this.flashCol = '255,60,50'; this.aim = 0; this.lo = 0;
    this.ghosts = [];
    this.running = false;
    this.autoT = 0;
    this.stars = Array.from({ length: 110 }, () => ({ a: Math.random() * 6.28, r: Math.random(), z: rnd(0.3, 1) }));
    this.ast = [0, 1, 2, 3, 4, 5].map(makeAsteroid);
    this.gem = makeCrystal();
    this.sound = o.sound || null;
  }

  /* ---- rules ---- */
  base(d) {
    if (this.mode === 'race') return 11 + d * 0.003;
    if (this.demo) return 9;
    return Math.min(24, 9.5 + d * 0.0026);
  }
  level() { return 1 + Math.floor(this.p.dist / 400); }
  calcSpeed() {
    const p = this.p; let s = this.base(p.dist);
    if (p.slowT > 0) s *= 0.45;
    if (p.boostT > 0) s += this.mode === 'race' ? 5 : 3;
    return s;
  }

  start() { this.running = true; }

  visible() {
    const out = [], L = this.course.list, d0 = this.p.dist;
    for (let i = this.lo; i < L.length; i++) {
      const o = L[i], z = o.d - d0; if (z > ZMAX) break;
      if (!this.dead.has(o.id)) out.push([o, z]);
    }
    return out;
  }

  update(dt) {
    const p = this.p;
    this.t += dt;
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98; q.vy *= 0.98; q.life -= dt; }
    this.parts = this.parts.filter(q => q.life > 0);
    for (const f of this.floats) { f.y -= 36 * dt; f.life -= dt; }
    this.floats = this.floats.filter(f => f.life > 0);
    for (const b of this.beams) b.life -= dt; this.beams = this.beams.filter(b => b.life > 0);
    for (const r of this.rings) r.life -= dt; this.rings = this.rings.filter(r => r.life > 0);
    this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
    if (!this.running || p.over) return;

    p.time += dt;
    p.boostT = Math.max(0, p.boostT - dt); p.slowT = Math.max(0, p.slowT - dt);
    if (this.auth) p.speed = this.calcSpeed();
    p.dist += p.speed * dt;
    if (!this.auth && this.corr) { const k = Math.min(1, dt * 4); p.dist += this.corr * k; this.corr -= this.corr * k; }
    this.course.ensure(p.dist + ZMAX + 20);

    const L = this.course.list;
    for (let i = this.lo; i < L.length; i++) {
      const o = L[i], z = o.d - p.dist; if (z > ZMAX) break;
      if (this.dead.has(o.id)) continue;
      if (o.threat && z <= 1.2) this.hit(o);
      else if (!o.threat && z < -4) { this.dead.add(o.id); if (this.target === o) this.clearTarget(); }
    }
    while (this.lo < L.length && (this.dead.has(L[this.lo].id) || L[this.lo].d - p.dist < -6)) this.lo++;

    if (this.demo) this.autopilot(dt);
    if (this.mode === 'race' && this.auth && !p.finished && p.dist >= this.raceLen) { p.finished = true; this.cb.onFinish?.(); }
    if (this.auth && p.lives === 0 && !p.over) { p.over = true; this.cb.onOver?.(); }
  }

  autopilot(dt) {
    this.autoT -= dt; if (this.autoT > 0) return; this.autoT = 0.16;
    if (!this.target) {
      const c = this.visible().filter(([o, z]) => z < ZVIS - 20 && z > 8).sort((a, b) => (b[0].threat - a[0].threat) || (a[1] - b[1]))[0];
      if (!c || Math.random() < 0.35) return;
      this.press(c[0].w[0]);
    } else this.press(this.target.w[this.typed]);
  }

  pick(c) {
    // A rock someone else is already aiming at is theirs: never pick it.
    const taken = new Set([...this.aims.values()].map(a => a.id));
    const cand = this.visible().filter(([o, z]) => z > 1.5 && z < ZVIS && o.w[0] === c);
    const free = cand.filter(([o]) => !taken.has(o.id));
    const list = free;
    list.sort((a, b) => (b[0].threat - a[0].threat) || (a[1] - b[1]));
    return list[0] ? list[0][0] : null;
  }

  press(c) {
    if (!this.running || this.p.over || this.p.finished) return;
    if (!this.demo) this.stats.keys++;
    let o = this.target;
    if (!o) {
      o = this.pick(c);
      if (!o) return this.miss();
      this.target = o; this.typed = 0;
    }
    if (o.w[this.typed] !== c) return this.miss();
    this.typed++; if (!this.demo) this.stats.good++;
    this.beams.push({ o, life: 0.1, seat: this.me.id });
    this.sound?.zap(this.typed);
    this.cb.onAim?.(o.id, this.typed);
    if (this.typed >= o.w.length) this.kill(o, this.me.id, true);
  }

  clearTarget() { if (this.target) { this.target = null; this.typed = 0; this.cb.onAim?.(null, 0); } }

  miss() {
    this.shake = Math.max(this.shake, 0.12); this.sound?.miss();
    if (this.auth) this.p.combo = 0; else this.cb.onMiss?.();
  }

  boom(o, big) {
    const P = this.proj(o.x, o.d - this.p.dist), n = big ? 30 : 22;
    const cols = o.threat ? ['#ffb08a', '#ff7a4a', '#ffd9a8', '#8a6a55'] : ['#ffe6a3', '#f2c14e', '#fff', '#d99a2b'];
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(60, 260) * (0.5 + P.s); this.parts.push({ x: P.x, y: P.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.35, 0.8), c: cols[i % 4], r: rnd(1.5, 3.5) }); }
    this.rings.push({ x: P.x, y: P.y, r0: 10 * P.s, life: 0.35, c: o.threat ? '255,170,120' : '255,220,140' });
    return P;
  }

  kill(o, seat, local) {
    if (this.dead.has(o.id)) return;
    this.dead.add(o.id);
    const P = this.boom(o, true);
    if (this.target === o) { this.target = null; this.typed = 0; }
    for (const [k, a] of this.aims) if (a.id === o.id) this.aims.delete(k);
    if (local) { this.stats.words++; this.cb.onKill?.(o.id); this.cb.onAim?.(null, 0); }
    this.sound?.boom(o.threat);
    if (this.auth) this.award(o, P);
    else this.floats.push({ x: P.x, y: P.y, t: o.threat ? 'CLEAR' : 'BONUS', c: o.threat ? '#7fe0ff' : '#f2c14e', life: 0.8 });
  }

  award(o, P) {
    const p = this.p;
    p.combo++; p.best = Math.max(p.best, p.combo);
    const pts = Math.round(o.w.length * (o.threat ? 10 : 15) * (1 + Math.min(p.combo, 20) * 0.1));
    p.score += pts;
    p.boostT = Math.min(4, p.boostT + (o.threat ? 1.2 : 2));
    this.floats.push({ x: P.x, y: P.y, t: (o.threat ? '+' : 'BONUS +') + pts, c: o.threat ? '#7fe0ff' : '#f2c14e', life: 0.9 });
  }

  hit(o) {
    this.dead.add(o.id);
    this.boom(o, false);
    if (this.target === o) this.clearTarget();
    for (const [k, a] of this.aims) if (a.id === o.id) this.aims.delete(k);
    this.flash = 0.35; this.shake = 0.35; this.sound?.hit();
    try { navigator.vibrate && navigator.vibrate(90); } catch (e) {}
    if (!this.auth) return;
    const p = this.p; p.combo = 0;
    if (this.mode === 'race') p.slowT = 2;
    else if (p.lives > 0) p.lives--;
  }

  /* ---- multiplayer hooks ---- */
  remoteAim(seat, id, typed, color, name) {
    const prev = this.aims.get(seat);
    if (id == null) { this.aims.delete(seat); return; }
    this.aims.set(seat, { id, typed, color, name });
    const o = this.course.list[id];
    if (o && (!prev || prev.id !== id || typed > prev.typed)) this.beams.push({ o, life: 0.1, seat });
    // Both picked the same rock at the same moment: whoever typed more keeps it (tie: lower id).
    if (this.target && this.target.id === id && (typed > this.typed || (typed === this.typed && seat < this.me.id))) {
      const P = this.target._P;
      this.target = null; this.typed = 0; this.cb.onAim?.(null, 0);
      if (P) this.floats.push({ x: P.x, y: P.y - 20, t: name + ' has it', c: color, life: 0.9 });
    }
  }
  seatColor(id) { return (this.seats.find(s => s.id === id) || this.me).color; }
  gunPos(id) {
    const n = this.seats.length, i = Math.max(0, this.seats.findIndex(s => s.id === id)), sc = Math.min(1.2, this.W / 380);
    const OFF = [[0], [-22, 22], [-24, 0, 24], [-27, -9, 9, 27]][Math.min(n, 4) - 1];
    const x = this.W / 2 + (OFF[i] ?? 0) * sc, y = this.H - 52 + 6 + (n === 1 ? -22 : 10) * sc;
    return { x, y };
  }
  remoteKill(id, seat) { this.course.ensure(this.p.dist + ZMAX + 40); const o = this.course.list[id]; if (o) this.kill(o, seat, false); }
  remoteMiss() { if (this.auth) this.p.combo = 0; }
  planeState() { const p = this.p; return { dist: +p.dist.toFixed(2), speed: +p.speed.toFixed(2), lives: p.lives, score: p.score, combo: p.combo, best: p.best, boostT: +p.boostT.toFixed(2), slowT: +p.slowT.toFixed(2), finished: p.finished, over: p.over, time: +p.time.toFixed(2) }; }
  applyPlane(s) {
    if (this.auth) return;
    const p = this.p, diff = s.dist - p.dist;
    if (Math.abs(diff) > 20) { p.dist = s.dist; this.corr = 0; } else this.corr = diff;
    Object.assign(p, { speed: s.speed, lives: s.lives, score: s.score, combo: s.combo, best: s.best, boostT: s.boostT, slowT: s.slowT, finished: s.finished, over: s.over, time: s.time });
  }

  /* ---- drawing ---- */
  fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (!w || !h) return false;
    if (w !== this.W || h !== this.H) {
      this.W = w; this.H = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.back = makeBackdrop(Math.round(w * dpr), Math.round(h * dpr));
    }
    return true;
  }
  proj(x, z) {
    const f = clamp(1 - z / ZMAX, 0, 1.15), s = 0.26 + 0.74 * f;
    const hz = this.H * 0.17, sy = this.H - 52;
    return { x: this.W / 2 + x * this.W * 0.4 * s, y: hz + (sy - hz) * Math.pow(f, 1.12), s };
  }

  render(now) {
    if (!this.fit()) return;
    const { ctx: g, W, H, dpr, p } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.back, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.shake > 0) g.translate(rnd(-5, 5) * this.shake * 3, rnd(-5, 5) * this.shake * 3);
    const cx = W / 2, hz = H * 0.17, sy = H - 52, sp = Math.max(p.speed, 4);

    // warp stars
    g.lineCap = 'round';
    for (const s of this.stars) {
      s.r += sp * 0.00011 * s.z * (1 + s.r * 4) * (this.running ? 1 : 0.6);
      if (s.r > 1.25) { s.r = 0.02; s.a = Math.random() * 6.28; }
      const R = s.r * Math.max(W, H) * 0.8, len = Math.min(40, sp * 0.9 * s.r * s.z);
      const x = cx + Math.cos(s.a) * R, y = hz + Math.sin(s.a) * R * 0.75;
      g.strokeStyle = `rgba(210,230,255,${Math.min(0.85, s.r * 0.9) * s.z})`; g.lineWidth = s.z * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(s.a) * len, y - Math.sin(s.a) * len * 0.75); g.stroke();
    }

    // flight lane
    const nL = this.proj(-0.5, 0), nR = this.proj(0.5, 0), fL = this.proj(-0.5, ZMAX), fR = this.proj(0.5, ZMAX);
    const lg = g.createLinearGradient(0, fL.y, 0, sy);
    lg.addColorStop(0, 'rgba(127,224,255,0)'); lg.addColorStop(1, 'rgba(127,224,255,.10)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(fL.x, fL.y); g.lineTo(fR.x, fR.y); g.lineTo(nR.x, sy); g.lineTo(nL.x, sy); g.closePath(); g.fill();
    for (let k = 0; k < 14; k++) {
      const z = ((k * 10 - (p.dist % 10)) + 140) % 140; if (z > ZMAX) continue;
      const a = this.proj(-0.5, z), b = this.proj(-0.5, z + 4), c = this.proj(0.5, z), d = this.proj(0.5, z + 4);
      const al = 0.15 + 0.5 * (1 - z / ZMAX);
      g.strokeStyle = `rgba(127,224,255,${al})`; g.lineWidth = 1 + 2 * a.s;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.moveTo(c.x, c.y); g.lineTo(d.x, d.y); g.stroke();
    }

    // finish gate (race)
    if (this.mode === 'race') {
      const z = this.raceLen - p.dist;
      if (z > 0 && z < ZMAX) {
        const a = this.proj(-1.6, z), b = this.proj(1.6, z), h = 70 * a.s;
        g.strokeStyle = '#f2c14e'; g.lineWidth = 3 * a.s + 1; g.strokeRect(a.x, a.y - h, b.x - a.x, h);
        g.fillStyle = '#f2c14e'; g.font = `700 ${Math.round(10 + 14 * a.s)}px "Exo 2",sans-serif`; g.textAlign = 'center'; g.fillText('FINISH', (a.x + b.x) / 2, a.y - h - 6); g.textAlign = 'start';
      }
    }

    // ghost planes of other crews (race)
    for (const gh of this.ghosts) {
      const dz = gh.dist - p.dist, side = gh.side || 1;
      if (dz > -1 && dz < ZMAX) { const q = this.proj(side * 0.95, Math.max(dz, 2)); this.drawShip(q.x, q.y, 0.55 + 0.5 * q.s, gh.color, 0.45, now, 0); g.fillStyle = gh.color; g.font = '600 12px "Exo 2",sans-serif'; g.textAlign = 'center'; g.fillText(gh.name, q.x, q.y - 26 * q.s - 6); g.textAlign = 'start'; }
    }

    // obstacles, far to near
    const vis = this.visible().sort((a, b) => b[1] - a[1]);
    const k = Math.min(1.15, W / 400);
    for (const [o, z] of vis) {
      const P = this.proj(o.x, z), r = Math.max(3, (o.threat ? 34 : 24) * P.s * k);
      g.globalAlpha = clamp((ZMAX - z) / 12, 0, 1);   // fade in at the horizon
      if (o.threat) {
        if (z < 38) { g.strokeStyle = `rgba(255,80,60,${0.35 + Math.sin(now / 90) * 0.25})`; g.lineWidth = 3; g.beginPath(); g.arc(P.x, P.y, r + 7, 0, 6.28); g.stroke(); }
        g.save(); g.translate(P.x, P.y); g.rotate(o.rot + this.t * o.spin); g.drawImage(this.ast[o.v], -r * 1.1, -r * 1.1, r * 2.2, r * 2.2); g.restore();
      } else {
        g.save(); g.translate(P.x, P.y); g.rotate(Math.sin(this.t * 1.5 + o.rot) * 0.25); g.drawImage(this.gem, -r, -r, r * 2, r * 2); g.restore();
        const tw = (Math.sin(now / 160 + o.id) + 1) / 2; g.fillStyle = `rgba(255,250,220,${tw * 0.8})`; g.beginPath(); g.arc(P.x - r * 0.25, P.y - r * 0.45, 1.5 + tw * 2, 0, 6.28); g.fill();
      }
      for (const a of this.aims.values()) if (a.id === o.id) { g.strokeStyle = a.color; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.beginPath(); g.arc(P.x, P.y, r + 11, 0, 6.28); g.stroke(); g.setLineDash([]); }
      if (this.target === o) { g.strokeStyle = this.me.color; g.lineWidth = 2.5; g.beginPath(); g.arc(P.x, P.y, r + 11, 0, 6.28); g.stroke(); }
      g.globalAlpha = 1;
      o._P = P; o._r = r; o._z = z;
    }
    // labels (after all bodies so they stay readable). Nearest first; a label that would cover
    // another one is moved above its object, or left out until it is closer.
    const placed = [[cx - 46, sy - 34, 92, 74], [0, 0, W, 64]];   // ship and top bar stay clear
    const hitR = (x, y, w, h) => placed.some(([a, b, c, d]) => x < a + c && x + w > a && y < b + d && y + h > b);
    const near = vis.filter(([, z]) => z > 0 && z < ZVIS).sort((a, b) => {
      const pa = (a[0] === this.target || [...this.aims.values()].some(x => x.id === a[0].id)) ? -1 : 0;
      const pb = (b[0] === this.target || [...this.aims.values()].some(x => x.id === b[0].id)) ? -1 : 0;
      return (pa - pb) || (a[1] - b[1]);
    });
    for (const [o] of near) {
      const P = o._P, r = o._r;
      const fs = Math.round(clamp(12 + 9 * P.s, 12, 21));
      g.font = `600 ${fs}px "Exo 2",sans-serif`; g.textBaseline = 'middle';
      const mine = this.target === o, other = [...this.aims.values()].find(a => a.id === o.id);
      const typed = mine ? this.typed : other ? other.typed : 0, col = mine ? this.me.color : other ? other.color : null;
      const tw = g.measureText(o.w).width, pw = tw + 16, ph = fs + 9;
      // try below, then beside (right, left), then above the object
      const spots = [[P.x - pw / 2, P.y + r + 5], [P.x + r + 6, P.y - ph / 2], [P.x - r - 6 - pw, P.y - ph / 2], [P.x - pw / 2, P.y - r - ph - 5]]
        .map(([x, y]) => [clamp(x, 4, W - pw - 4), Math.min(H - ph - 4, y)]);
      let spot = spots.find(([x, y]) => !hitR(x, y, pw, ph));
      if (!spot) { if (!mine && !other) continue; spot = spots[0]; }
      const [px, py] = spot;
      placed.push([px - 3, py - 3, pw + 6, ph + 6]);
      g.globalAlpha = clamp((ZMAX - o._z) / 10, 0, 1);
      g.fillStyle = 'rgba(6,10,28,.86)'; g.strokeStyle = col || (o.threat ? 'rgba(255,130,100,.85)' : 'rgba(242,193,78,.7)'); g.lineWidth = col ? 2.5 : 1.2;
      g.beginPath(); g.roundRect(px, py, pw, ph, ph / 2); g.fill(); g.stroke();
      const done = o.w.slice(0, typed);
      g.fillStyle = col || '#fff'; g.fillText(done, px + 8, py + ph / 2 + 1);
      g.fillStyle = o.threat ? '#ffffff' : '#ffe7a8'; g.fillText(o.w.slice(typed), px + 8 + g.measureText(done).width, py + ph / 2 + 1);
      if (other && !mine) { g.font = '600 11px "Exo 2",sans-serif'; g.fillStyle = other.color; g.fillText(other.name, px, py - 8); }
      g.globalAlpha = 1;
    }
    g.textBaseline = 'alphabetic';

    // beams
    const tP = this.target && this.target._P;
    const want = tP ? Math.atan2(tP.x - cx, sy - tP.y) : 0; this.aim += (want - this.aim) * 0.25;
    g.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      if (!b.o._P) continue; const a = b.life / 0.1, G = this.gunPos(b.seat), col = this.seatColor(b.seat);
      g.strokeStyle = col; g.globalAlpha = 0.3 * a; g.lineWidth = 9; g.beginPath(); g.moveTo(G.x, G.y); g.lineTo(b.o._P.x, b.o._P.y); g.stroke();
      g.globalAlpha = a; g.strokeStyle = 'rgba(240,252,255,1)'; g.lineWidth = 2.5; g.stroke(); g.globalAlpha = 1;
    }
    for (const [seat, a] of this.aims) {
      const o = this.course.list[a.id]; if (!o || !o._P || this.dead.has(o.id)) continue; const G = this.gunPos(seat);
      g.strokeStyle = a.color; g.globalAlpha = 0.4; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(G.x, G.y); g.lineTo(o._P.x, o._P.y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    for (const r of this.rings) { const t = 1 - r.life / 0.35; g.strokeStyle = `rgba(${r.c},${1 - t})`; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, r.r0 + t * 60, 0, 6.28); g.stroke(); }
    for (const q of this.parts) { g.globalAlpha = Math.min(1, q.life * 2); g.fillStyle = q.c; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.28); g.fill(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    const crew = this.seats.length > 1;
    this.drawShip(cx, sy + 6, Math.min(1.2, W / 380), crew ? '#9fb4d8' : this.me.color, 1, now, crew ? 0 : clamp(this.aim * 0.4, -0.3, 0.3), p.boostT > 0);
    if (crew) {   // one gun per pilot, in that pilot's color, turning toward what they aim at
      for (const s of this.seats) {
        const G = this.gunPos(s.id), mine = s.id === this.me.id;
        const tgt = mine ? this.target : (() => { const a = this.aims.get(s.id); return a ? this.course.list[a.id] : null; })();
        const ang = tgt && tgt._P && !this.dead.has(tgt.id) ? Math.atan2(tgt._P.x - G.x, G.y - tgt._P.y) : 0;
        g.save(); g.translate(G.x, G.y); g.rotate(ang);
        g.fillStyle = s.color; g.fillRect(-2.5, -15, 5, 13);
        g.beginPath(); g.arc(0, 0, mine ? 7.5 : 6.5, 0, 6.28); g.fill();
        g.strokeStyle = mine ? '#ffffff' : 'rgba(4,6,15,.8)'; g.lineWidth = mine ? 2 : 1.5; g.stroke();
        g.restore();
        g.font = '700 11px "Exo 2",sans-serif'; g.textAlign = 'center'; g.fillStyle = s.color;
        g.fillText(mine ? 'YOU' : s.name.slice(0, 8), G.x, Math.min(H - 4, G.y + 40)); g.textAlign = 'start';
      }
    }

    g.textAlign = 'center'; g.font = '700 16px "Exo 2",sans-serif';
    for (const f of this.floats) { g.globalAlpha = Math.min(1, f.life * 2); g.fillStyle = f.c; g.fillText(f.t, f.x, f.y); }
    g.globalAlpha = 1; g.textAlign = 'start';

    if (p.boostT > 0) { const e = g.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.35, cx, H / 2, Math.max(W, H) * 0.75); e.addColorStop(0, 'rgba(127,224,255,0)'); e.addColorStop(1, `rgba(127,224,255,${Math.min(0.18, p.boostT * 0.08)})`); g.fillStyle = e; g.fillRect(0, 0, W, H); }
    if (p.combo >= 5) { const a = Math.min(0.22, (p.combo - 4) * 0.02); const e = g.createLinearGradient(0, H, 0, H * 0.6); e.addColorStop(0, `rgba(255,140,60,${a})`); e.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = e; g.fillRect(0, H * 0.6, W, H * 0.4); }
    if (this.flash > 0) { g.fillStyle = `rgba(${this.flashCol},${this.flash * 0.55})`; g.fillRect(-20, -20, W + 40, H + 40); }
  }

  drawShip(x, y, sc, col, alpha, now, rot, boost) {
    const g = this.ctx; g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(rot); g.scale(sc, sc);
    const fl = 14 + Math.sin(now / 40) * 4 + (boost ? 12 : 0);
    g.globalCompositeOperation = 'lighter';
    const eg = g.createRadialGradient(0, 20, 0, 0, 20 + fl * 0.5, fl);
    eg.addColorStop(0, 'rgba(255,255,255,.9)'); eg.addColorStop(0.3, col); eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.beginPath(); g.ellipse(-9, 22 + fl * 0.3, 5, fl * 0.7, 0, 0, 6.28); g.ellipse(9, 22 + fl * 0.3, 5, fl * 0.7, 0, 0, 6.28); g.fill();
    g.globalCompositeOperation = 'source-over';
    const body = g.createLinearGradient(-30, 0, 30, 0);
    body.addColorStop(0, '#6f7c8f'); body.addColorStop(0.45, '#e8eef6'); body.addColorStop(0.55, '#c9d3e0'); body.addColorStop(1, '#55606f');
    g.fillStyle = body;
    g.beginPath(); g.moveTo(0, -30); g.lineTo(7, -10); g.lineTo(9, 4); g.lineTo(32, 16); g.lineTo(32, 21); g.lineTo(11, 18); g.lineTo(8, 24); g.lineTo(-8, 24); g.lineTo(-11, 18); g.lineTo(-32, 21); g.lineTo(-32, 16); g.lineTo(-9, 4); g.lineTo(-7, -10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,30,45,.6)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = col; g.fillRect(-30, 16, 6, 3); g.fillRect(24, 16, 6, 3);
    const cg = g.createLinearGradient(0, -20, 0, 0); cg.addColorStop(0, '#dff7ff'); cg.addColorStop(1, '#2b6f8f');
    g.fillStyle = cg; g.beginPath(); g.ellipse(0, -9, 3.6, 9, 0, 0, 6.28); g.fill();
    g.restore();
  }
}
