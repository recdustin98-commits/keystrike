import { Game } from './engine.js';
import { setupInput } from './input.js';
import { joinRoom } from './net.js';
import { submitScore, loadBoard, utcDay, daySeed } from './scores.js';

const $ = s => document.querySelector(s);
const LOCAL = new URLSearchParams(location.search).has('local');
const SEAT = ['#7fe0ff', '#ff7ab6', '#9dff8a', '#ffd166'];
const OPP = '#ff8a6b';
const PORTAL = (() => { try { return window.self !== window.top; } catch (e) { return true; } })() || /crazygames/i.test(document.referrer) || new URLSearchParams(location.search).has('portal');
const store = {
  get(k, d) { try { const v = localStorage.getItem('ks_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ks_' + k, JSON.stringify(v)); } catch (e) {} },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- sound ---------------- */
const sound = {
  on: store.get('sound', true), ac: null,
  ctx() { if (!this.on) return null; try { this.ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (this.ac.state === 'suspended') this.ac.resume(); return this.ac; } catch (e) { return null; } },
  tone(f1, f2, d, type = 'square', vol = 0.04) {
    const a = this.ctx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d);
  },
  noise(d, vol, freq) {
    const a = this.ctx(); if (!a) return; const n = a.sampleRate * d, b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start();
  },
  zap(n) { this.tone(900 + n * 60, 300, 0.06, 'square', 0.025); },
  boom(threat) { this.noise(0.35, 0.25, threat ? 900 : 2200); this.tone(threat ? 160 : 660, threat ? 50 : 1320, 0.2, 'triangle', 0.05); },
  hit() { this.noise(0.5, 0.4, 400); this.tone(90, 40, 0.4, 'sawtooth', 0.06); },
  miss() { this.tone(140, 110, 0.08, 'sawtooth', 0.03); },
  go() { this.tone(520, 1040, 0.25, 'triangle', 0.06); },
};

/* ---------------- state ---------------- */
const cv = $('#cv');
const me = { id: Math.random().toString(36).slice(2, 10), name: store.get('name', ''), color: SEAT[0] };
let device = store.get('dev', null);
if (!device) { device = 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set('dev', device); }
const expertOK = () => store.get('expertOK', false);
let lvl = store.get('lvl', 'beginner');
if (lvl === 'expert' && !expertOK()) lvl = 'beginner';
let run = { daily: false };
let game = new Game(cv, { mode: 'demo', me });
game.start();
let mode = 'menu';
let kbPref = store.get('kb2', null);   // 'game' | 'phone'
const touch = matchMedia('(pointer:coarse)').matches;
const gameKb = () => touch && (kbPref || 'game') === 'game';            // menu | count | play | pause | over
let session = null;           // online session
let countT = 0;

const input = setupInput({
  input: $('#ki'), spacer: $('#kbspace'),
  onChar: ch => { if (mode === 'play') game.press(ch); },
  onClear: () => { if (mode === 'play') game.clearTarget(); },
  isActive: () => mode === 'play' || mode === 'count',
});

/* ---------------- game keyboard ---------------- */
const gk = $('#gk');
gk.innerHTML = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row, i) =>
  `<div class="r">${i === 1 ? '<span class="sp"></span>' : ''}${i === 2 ? '<span class="k wide" style="visibility:hidden"></span>' : ''}${[...row].map(c => `<button class="k" data-k="${c}" aria-label="${c}">${c}</button>`).join('')}${i === 2 ? '<button class="k wide" data-k="clr" aria-label="Clear target">⌫</button>' : ''}${i === 1 ? '<span class="sp"></span>' : ''}</div>`).join('') + '<div class="pop"></div>';
const pop = gk.querySelector('.pop');
let popT = 0;
gk.addEventListener('pointerdown', e => {
  e.preventDefault();
  const b = e.target.closest('.k[data-k]'); if (!b) return;
  const k = b.dataset.k;
  b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 110);
  if (k !== 'clr') {
    const r = b.getBoundingClientRect(), g = gk.getBoundingClientRect();
    pop.textContent = k; pop.style.left = (r.left - g.left + r.width / 2) + 'px'; pop.style.top = (r.top - g.top + 4) + 'px';
    pop.classList.add('show'); clearTimeout(popT); popT = setTimeout(() => pop.classList.remove('show'), 120);
  }
  try { if (!/iPhone|iPad/.test(navigator.userAgent)) navigator.vibrate?.(6); } catch (err) {}
  if (mode !== 'play') return;
  if (k === 'clr') game.clearTarget(); else game.press(k);
});

/* ---------------- screens ---------------- */
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  // While playing, only the hidden typing field may take focus (keeps Safari's form arrows inactive).
  for (const el of document.querySelectorAll('.screen input')) el.disabled = !id;
  document.body.classList.toggle('playing', !id);
  gk.hidden = !!id || !gameKb();
}
function msg(html) { $('#msg').innerHTML = html; }
function modal(html) { $('#card').innerHTML = html; $('#modal').hidden = !html; }

function renderMenu() {
  const b = store.get('best', 0);
  $('#bestLine').textContent = b ? `Best solo score ${b}` : '';
  $('#sndBtn').textContent = 'Sound ' + (sound.on ? 'on' : 'off');
  $('#kbBtn').hidden = !touch; $('#kbBtn').textContent = 'Keys: ' + (gameKb() ? 'built-in' : 'phone');
  $('#nameIn').value = me.name;
  $('#lvB').setAttribute('aria-pressed', lvl === 'beginner'); $('#lvX').setAttribute('aria-pressed', lvl === 'expert');
  $('#lvX').textContent = expertOK() ? 'Expert' : 'Expert (locked)'; $('#lvX').classList.toggle('lock', !expertOK());
  $('#lvHint').textContent = lvl === 'beginner' ? 'Slower, short words, 4 lives' : 'Fast, longer words, 3 lives';
}
function toMenu() {
  if (session) { session.room.leave(); session = null; }
  input.blur(); modal('');
  mode = 'menu'; game = new Game(cv, { mode: 'demo', me }); game.start();
  show('menu'); renderMenu(); msg('');
}

function needName() {
  const n = $('#nameIn').value.trim().slice(0, 12);
  if (!n) { $('#nameErr').textContent = 'Enter a name first'; $('#nameIn').focus(); return false; }
  me.name = n; store.set('name', n); $('#nameErr').textContent = ''; return true;
}

/* ---------------- solo ---------------- */
function startSolo(daily) {
  sound.ctx();
  me.color = SEAT[0];
  const day = utcDay();
  run = { daily: !!daily, day, lvl };
  game = new Game(cv, { mode: 'solo', me, sound, diff: lvl, seed: daily ? daySeed(lvl, day) : undefined, cb: { onOver: () => endSolo() } });
  beginCountdown();
}
function beginCountdown() {
  show(null); modal(''); input.clear(); if (!gameKb()) input.focus();
  mode = 'count'; countT = 3.2;
}
function endSolo() {
  mode = 'over'; input.blur();
  const p = game.p, s = game.stats, key = run.daily ? 'bestd_' + run.lvl : 'best_' + run.lvl;
  const best = store.get(key, 0), nb = p.score > best;
  if (nb) store.set(key, p.score);
  let unlocked = false;
  if (run.lvl === 'beginner' && p.dist >= 1000 && !expertOK()) { store.set('expertOK', true); unlocked = true; }
  const levelName = run.lvl === 'beginner' ? 'Beginner' : 'Expert';
  modal(`<h2>${run.daily ? 'Daily challenge' : nb ? 'New best' : 'Ship down'}</h2>
    <div class="stats"><div><b>${p.score}</b><span>Score</span></div><div><b>${Math.round(p.dist)} m</b><span>Distance</span></div>
    <div><b>${s.words}</b><span>Words</span></div><div><b>${acc(s)}%</b><span>Accuracy</span></div></div>
    <p class="sub">${levelName} · Best combo x${p.best} · Best ${Math.max(best, p.score)}</p>
    ${unlocked ? '<p class="sub" style="color:var(--gold)">Expert unlocked. Pick it on the menu.</p>' : ''}
    <p id="rankLine" class="sub">${run.daily ? 'Saving your score…' : ''}</p>
    <button class="btn primary" data-a="again">${run.daily ? 'Try today\'s course again' : 'Fly again'}</button>
    ${run.daily ? `<button class="btn" data-a="board" data-lv="${run.lvl}" data-pd="day">Leaderboard</button>` : ''}
    <button class="btn" data-a="menu">Menu</button>`);
  if (run.daily) postScore(p, s, run);
}
async function postScore(p, s, r) {
  const set = t => { const el = $('#rankLine'); if (el) el.textContent = t; };
  try {
    const res = await submitScore({ device, name: me.name, level: r.lvl, day: r.day, score: p.score, dist: Math.round(p.dist), words: s.words, keys: s.keys, good: s.good, secs: +p.time.toFixed(1) });
    if (!res?.ok) { set(res?.error === 'implausible' ? 'Score not saved: run looked invalid.' : 'Score not saved.'); return; }
    const rows = await loadBoard(r.lvl, 'day', device), mine = rows.find(x => x.mine);
    set(mine ? `Today's rank: #${mine.rank}` : 'Score saved');
  } catch (e) { set("Couldn't reach the leaderboard. Your score wasn't saved."); }
}
let overHtml = '';
async function showBoard(level, period) {
  if (mode === 'over' && $('#rankLine')) overHtml = $('#card').innerHTML;
  const lv = level || run.lvl || lvl, pd = period || 'day';
  const tabs = (items, attr, cur) => `<div class="seg">${items.map(([v, t]) => `<button data-a="board" data-${attr}="${v}" aria-pressed="${v === cur}" ${attr === 'lv' ? `data-pd="${pd}"` : `data-lv="${lv}"`}>${t}</button>`).join('')}</div>`;
  modal(`<h2>Leaderboard</h2>
    ${tabs([['beginner', 'Beginner'], ['expert', 'Expert']], 'lv', lv)}
    ${tabs([['day', 'Today'], ['week', 'This week'], ['all', 'All time']], 'pd', pd)}
    <div id="lbBody" class="sub">Loading…</div>
    <p class="sub" style="font-size:12px">Daily challenge scores only. Everyone flies the same course each day.</p>
    <button class="btn" data-a="${mode === 'over' ? 'back' : 'close'}">Close</button>`);
  try {
    const rows = await loadBoard(lv, pd, device);
    $('#lbBody').innerHTML = rows.length ? `<table class="lb">${rows.map(r => `<tr class="${r.mine ? 'mine' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.score}</td><td>${r.dist} m</td></tr>`).join('')}</table>` : 'No scores yet. Be the first.';
  } catch (e) { $('#lbBody').textContent = "Couldn't load the leaderboard."; }
}
const acc = s => s.keys ? Math.round(s.good / s.keys * 100) : 100;

function pause() {
  if (session || (mode !== 'play' && mode !== 'count')) return;
  mode = 'pause'; input.blur();
  modal(`<h2>Paused</h2><button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="again">Restart</button><button class="btn" data-a="menu">Menu</button>`);
}

/* ---------------- online ---------------- */
async function enterRoom(code) {
  if (!needName()) return;
  code = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) { $('#netErr').textContent = 'Codes are 4 letters'; return; }
  $('#netErr').textContent = 'Connecting…';
  try {
    const state = { name: me.name, joined: Date.now(), mode: 'copilot', ready: false, level: lvl };
    const room = await joinRoom(code, me, state, LOCAL);
    session = { room, code, state, info: {}, cfg: null, crew: null, ghosts: {}, sendT: 0, stT: 0 };
    bindRoom(room);
    $('#netErr').textContent = '';
    history.replaceState(null, '', '#' + code);
    show('lobby'); renderLobby();
  } catch (e) {
    $('#netErr').textContent = 'Could not connect. Check your internet and try again.';
  }
}

// Presence (name, join time) is sent once when joining: Supabase closes a player's connection if presence
// changes more than a few times per 30 s. Mode and Ready travel as ordinary messages instead.
const MY = () => ({ mode: session.state.mode, ready: session.state.ready, level: session.state.level });
function lobbyPeers() {
  return session.room.peers().map(p => ({ ...p, ...(p.id === me.id ? MY() : session.info[p.id] || {}) }));
}
function sendSt() { session?.room.send('st', { state: MY() }); }
function hostOf(peers) { return [...peers].sort((a, b) => (a.joined - b.joined) || (a.id < b.id ? -1 : 1))[0]; }
const lvName = l => l === 'expert' ? 'Expert' : 'Beginner';
function lobbyStatus(peers, host, m) {
  const n = peers.length, notReady = peers.filter(p => !p.ready).length;
  const sizeOk = m === 'copilot' ? n >= 2 && n <= 4 : n === 2;
  const why = n < 2 ? (m === 'copilot' ? 'Waiting for at least one more player' : 'Waiting for your opponent')
    : !sizeOk ? (m === 'copilot' ? 'Co-pilot takes up to 4 players' : '1v1 race needs exactly 2 players')
    : notReady ? `${notReady} ${notReady === 1 ? 'player is' : 'players are'} not ready` : '';
  return { ok: sizeOk && !notReady, why };
}

function renderLobby() {
  if (!session) return;
  let peers = lobbyPeers(), host = hostOf(peers);
  const m = host?.mode || 'copilot', lv = host?.level || 'beginner';
  if (session.lastMode && session.lastMode !== m && session.state.ready) { session.state.ready = false; sendSt(); peers = lobbyPeers(); }
  session.lastMode = m;
  const amHost = host && host.id === me.id;
  $('#lobbyCode').textContent = session.code;
  $('#modeCo').setAttribute('aria-pressed', m === 'copilot'); $('#modeRace').setAttribute('aria-pressed', m === 'race');
  $('#modeCo').disabled = $('#modeRace').disabled = !amHost;
  $('#modeHint').textContent = (m === 'copilot' ? 'Fly one ship together. Shared score and lives.' : 'Each pilot flies their own ship. First to 2,000 m wins.') + ' Level: ' + lvName(lv) + '.';
  const sorted = [...peers].sort((a, b) => a.joined - b.joined);
  $('#players').innerHTML = sorted.map(p => `<li><span class="dot" style="background:${p.id === me.id ? '#7fe0ff' : OPP}"></span>${esc(p.name || '?')}${p.id === me.id ? ' <em>you</em>' : ''}${host && p.id === host.id ? ' <em>host</em>' : ''}<span class="st ${p.ready ? 'ok' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span></li>`).join('');
  const st = lobbyStatus(peers, host, m), mineReady = !!session.state.ready;
  $('#readyBtn').textContent = mineReady ? 'Not ready (undo)' : "I'm ready";
  $('#readyBtn').className = 'btn ' + (mineReady ? 'small' : 'primary');
  $('#startBtn').hidden = !amHost; $('#startBtn').disabled = !st.ok;
  $('#waitHint').textContent = amHost ? st.why : st.ok ? 'Everyone is ready. Waiting for the host to start' : (mineReady ? 'Waiting for the others to get ready' : "Tap I'm ready when you're set");
}

function bindRoom(room) {
  let known = 0;
  room.onPeers(list => { if (list.length > known) sendSt(); known = list.length; if (!session?.cfg) renderLobby(); else checkAuthority(); });
  room.on('st', m => { if (!session) return; session.info[m.from] = m.state; if (!session.cfg) renderLobby(); });
  room.on('start', m => startOnline(m.cfg));
  room.on('aim', m => { if (game && session?.crew === m.crew) game.remoteAim(m.from, m.id, m.typed, m.color, m.name); });
  room.on('kill', m => { if (game && session?.crew === m.crew) game.remoteKill(m.id, m.from); });
  room.on('miss', m => { if (game && session?.crew === m.crew) game.remoteMiss(); });
  room.on('plane', m => {
    if (!session?.cfg || m.seed !== session.cfg.seed) return;
    if (m.crew === session.crew) game.applyPlane(m.s);
    else session.ghosts[m.crew] = { ...m.s, crew: m.crew };
  });
}

function setMyState(patch) { Object.assign(session.state, patch); sendSt(); renderLobby(); }

function hostStart() {
  const peers = [...lobbyPeers()].sort((a, b) => (a.joined - b.joined) || (a.id < b.id ? -1 : 1));
  const host = peers[0], m = host.mode || 'copilot';
  if (!lobbyStatus(peers, host, m).ok) return;
  const crews = m === 'copilot' ? { A: peers.map(p => p.id) } : { A: [peers[0].id], B: [peers[1].id] };
  const names = Object.fromEntries(peers.map(p => [p.id, p.name]));
  const cfg = { seed: (Math.random() * 1e9) | 0, mode: m, level: host.level || 'beginner', crews, names, raceLen: 2000 };
  session.room.send('start', { cfg });
  startOnline(cfg);
}

function startOnline(cfg) {
  if (!session) return;
  sound.ctx();
  session.cfg = cfg; session.ghosts = {};
  session.state.ready = false; for (const k in session.info) session.info[k] = { ...session.info[k], ready: false };
  session.crew = Object.keys(cfg.crews).find(k => cfg.crews[k].includes(me.id));
  if (!session.crew) return;                       // joined after the start: stay in lobby
  const list = cfg.crews[session.crew], seat = list.indexOf(me.id);
  me.color = SEAT[seat % SEAT.length];
  const present = new Set(session.room.peers().map(p => p.id));
  const auth = list.find(id => present.has(id)) || list[0];
  game = new Game(cv, {
    mode: cfg.mode === 'race' ? 'race' : 'copilot', seed: cfg.seed, crew: list.length, raceLen: cfg.raceLen,
    auth: auth === me.id, me, sound, diff: cfg.level,
    seats: cfg.mode === 'race' ? null : list.map((id, i) => ({ id, name: cfg.names[id] || '?', color: SEAT[i % SEAT.length] })),
    cb: {
      onAim: (id, typed) => session?.room.send('aim', { crew: session.crew, id, typed, color: me.color, name: me.name }),
      onKill: id => session?.room.send('kill', { crew: session.crew, id }),
      onMiss: () => session?.room.send('miss', { crew: session.crew }),
    },
  });
  beginCountdown();
}

function checkAuthority() {
  if (!session?.cfg || !game || mode === 'menu') return;
  const list = session.cfg.crews[session.crew] || [], present = new Set(session.room.peers().map(p => p.id));
  const auth = list.find(id => present.has(id));
  if (auth === me.id && !game.auth) game.auth = true;
}

function onlineTick(dt) {
  if (session && !session.cfg) { session.stT -= dt; if (session.stT <= 0) { session.stT = 2.5; sendSt(); } }   // late joiners learn teams
  if (!session?.cfg || !game) return;
  session.sendT -= dt;
  if (game.auth && session.sendT <= 0 && (mode === 'play' || mode === 'over')) {
    session.sendT = 0.15;
    session.room.send('plane', { crew: session.crew, seed: session.cfg.seed, s: game.planeState() });
  }
  const others = Object.values(session.ghosts);
  const nm = c => session.cfg.names[session.cfg.crews[c]?.[0]] || 'Rival';
  game.ghosts = others.map(g => ({ dist: g.dist, color: OPP, name: nm(g.crew), side: session.crew === 'A' ? 1 : -1 }));
  if (mode !== 'play') return;
  if (session.cfg.mode === 'race') {
    const done = game.p.finished || others.some(g => g.finished);
    if (done) endRace();
  } else if (game.p.over) endCopilot();
}

function endRace() {
  mode = 'over'; input.blur();
  const nm = c => esc(session.cfg.names[session.cfg.crews[c]?.[0]] || 'Rival');
  const mine = { crew: session.crew, dist: game.p.dist, finished: game.p.finished, time: game.p.time };
  const all = [mine, ...Object.values(session.ghosts)].sort((a, b) => (b.finished - a.finished) || (a.finished ? a.time - b.time : b.dist - a.dist));
  const won = all[0].crew === session.crew;
  modal(`<h2>${won ? 'You win' : 'You lost'}</h2>
    <ol class="rank">${all.map(c => `<li style="color:${c.crew === session.crew ? '#7fe0ff' : OPP}">${c.crew === session.crew ? 'You' : nm(c.crew)}<span>${c.finished ? c.time.toFixed(1) + ' s' : Math.round(c.dist) + ' m'}</span></li>`).join('')}</ol>
    <p class="sub">You typed ${game.stats.words} words · ${acc(game.stats)}% accuracy</p>
    <button class="btn primary" data-a="lobby">Back to lobby</button><button class="btn" data-a="menu">Leave</button>`);
}
function endCopilot() {
  mode = 'over'; input.blur();
  const p = game.p;
  modal(`<h2>Ship down</h2>
    <div class="stats"><div><b>${p.score}</b><span>Team score</span></div><div><b>${Math.round(p.dist)} m</b><span>Distance</span></div>
    <div><b>${game.stats.words}</b><span>Your words</span></div><div><b>${acc(game.stats)}%</b><span>Your accuracy</span></div></div>
    <p class="sub">Best team combo x${p.best}</p>
    <button class="btn primary" data-a="lobby">Back to lobby</button><button class="btn" data-a="menu">Leave</button>`);
}

/* ---------------- HUD ---------------- */
let hudCache = '';
function hud() {
  if (mode === 'menu') return;
  const p = game.p;
  let center;
  if (game.mode === 'race') {
    const L = game.raceLen, pct = d => Math.min(100, d / L * 100).toFixed(1);
    const gh = game.ghosts.map(g => `<i class="mk" style="left:${pct(g.dist)}%;background:${g.color}"></i>`).join('');
    const lead = game.ghosts.length ? Math.round(p.dist - Math.max(...game.ghosts.map(g => g.dist))) : 0;
    center = `<div class="race"><div class="bar"><i class="fin"></i>${gh}<i class="mk me" style="left:${pct(p.dist)}%;background:${me.color}"></i></div><small>${Math.round(p.dist)} / ${L} m · ${lead >= 0 ? '+' : ''}${lead} m</small></div>`;
  } else center = `<div class="dist">${Math.round(p.dist)} m<small>${game.target ? (touch ? '⌫ = new target' : 'Enter = new target') : 'Lv ' + game.level()}</small></div>`;
  const lives = p.lives >= 0 ? `<span class="hp">${'♥'.repeat(p.lives)}<s>${'♥'.repeat(Math.max(0, game.maxLives - p.lives))}</s></span>` : '';
  const html = `<div class="sc">${p.score}</div>${center}<div class="rt">${lives}<span class="cb">${p.combo > 1 ? 'x' + p.combo : ''}</span></div>`;
  if (html !== hudCache) { hudCache = html; $('#hudMain').innerHTML = html; }
}

/* ---------------- loop ---------------- */
let last = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
  if (mode === 'count') {
    countT -= dt; const n = Math.ceil(countT);
    msg(countT > 0 ? `<b class="count">${Math.min(3, n)}</b>` : '');
    if (countT <= 0) { mode = 'play'; game.start(); sound.go(); }
  }
  // Freeze the world while paused and during the resume countdown; it moves only in play (and in the menu demo).
  if (mode === 'play' || mode === 'over' || mode === 'menu' || !game.running) game.update(dt);
  game.render(now);
  onlineTick(dt);
  hud();
  $('#tap').hidden = !(input.coarse && !gameKb() && (mode === 'play' || mode === 'count') && !input.focused());
  requestAnimationFrame(loop);
}
if (LOCAL) window.__ks = () => game;
requestAnimationFrame(loop);

/* ---------------- wiring ---------------- */
$('#soloBtn').onclick = () => { if (needName()) startSolo(false); };
$('#dailyBtn').onclick = () => { if (needName()) startSolo(true); };
$('#lbBtn').onclick = () => showBoard(lvl, 'day');
$('#lvB').onclick = () => { lvl = 'beginner'; store.set('lvl', lvl); renderMenu(); };
$('#lvX').onclick = () => {
  if (expertOK()) { lvl = 'expert'; store.set('lvl', lvl); renderMenu(); return; }
  modal(`<h2>Expert is locked</h2><p class="sub">It unlocks when you fly 1,000 m on Beginner. Already a fast typist?</p>
    <button class="btn primary" data-a="unlock">Unlock Expert now</button><button class="btn" data-a="close">Stay on Beginner</button>`);
};
if (PORTAL) $('#onlineBtn').hidden = true;
$('#onlineBtn').onclick = () => { if (needName()) { show('online'); $('#netErr').textContent = ''; } };
$('#kbBtn').onclick = () => { kbPref = gameKb() ? 'phone' : 'game'; store.set('kb2', kbPref); renderMenu(); };
$('#sndBtn').onclick = () => { sound.on = !sound.on; store.set('sound', sound.on); renderMenu(); };
$('#createBtn').onclick = () => { const c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); $('#codeIn').value = c; enterRoom(c); };
$('#joinBtn').onclick = () => enterRoom($('#codeIn').value);
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') enterRoom($('#codeIn').value); });
$('#backBtn').onclick = () => toMenu();
$('#leaveLobby').onclick = () => { history.replaceState(null, '', location.pathname + location.search); toMenu(); };
$('#modeCo').onclick = () => setMyState({ mode: 'copilot' });
$('#modeRace').onclick = () => setMyState({ mode: 'race' });
$('#readyBtn').onclick = () => setMyState({ ready: !session.state.ready });
$('#startBtn').onclick = () => hostStart();
$('#shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '#' + session.code;
  try { if (navigator.share) { await navigator.share({ title: 'Keystrike', text: `Join my Keystrike game. Code ${session.code}`, url }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(url); $('#shareBtn').textContent = 'Link copied'; setTimeout(() => $('#shareBtn').textContent = 'Share invite', 1600); } catch (e) {}
};
$('#pauseBtn').onclick = () => session ? (confirmLeave()) : pause();
function confirmLeave() { modal(`<h2>Leave the game?</h2><button class="btn primary" data-a="stay">Keep playing</button><button class="btn" data-a="menu">Leave</button>`); }
// Tapping the game must not move focus off the hidden typing field (Android would keep the keyboard
// open but send the letters nowhere). Cancelling pointerdown also cancels the follow-up mousedown.
const keepFocus = e => { if (!gameKb() && (mode === 'play' || mode === 'count') && !e.target.closest('button')) { e.preventDefault(); input.focus(); } };
$('#stage').addEventListener('pointerdown', keepFocus);
$('#stage').addEventListener('mousedown', keepFocus);
$('#stage').addEventListener('touchend', e => { if (!gameKb() && (mode === 'play' || mode === 'count') && !e.target.closest('button')) { e.preventDefault(); input.focus(); } }, { passive: false });
$('#card').addEventListener('click', e => {
  const a = e.target.closest('button')?.dataset.a; if (!a) return;
  if (a === 'menu') toMenu();
  if (a === 'again') startSolo(run.daily);
  if (a === 'unlock') { store.set('expertOK', true); lvl = 'expert'; store.set('lvl', lvl); modal(''); renderMenu(); }
  if (a === 'board') showBoard(e.target.closest('button').dataset.lv, e.target.closest('button').dataset.pd);
  if (a === 'back') modal(overHtml);
  if (a === 'resume') { modal(''); if (!gameKb()) input.focus(); mode = 'count'; countT = 2.2; }
  if (a === 'stay') { modal(''); if (!gameKb()) input.focus(); }
  if (a === 'close') modal('');
  if (a === 'lobby') { modal(''); mode = 'menu'; session.cfg = null; session.state.ready = false; sendSt(); game = new Game(cv, { mode: 'demo', me }); game.start(); show('lobby'); renderLobby(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

renderMenu();
show('menu');
const hashCode = location.hash.slice(1).toUpperCase();
if (/^[A-Z]{4}$/.test(hashCode)) { $('#codeIn').value = hashCode; if (me.name) show('online'); }

/* ---------------- install as an app ---------------- */
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installEvt = null;
if ('serviceWorker' in navigator && !PORTAL) navigator.serviceWorker.register('sw.js').catch(() => {});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installBtn').hidden = PORTAL; });
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; installEvt = null; });
if (!standalone && isIOS && !PORTAL) $('#installBtn').hidden = false;
$('#installBtn').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('#installBtn').hidden = true; return; }
  const safari = isIOS && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  modal(`<h2>Get the app</h2>
    ${safari ? `<ol class="steps"><li>Tap the <b>Share</b> button <span class="shr" aria-hidden="true">⬆︎</span> in Safari's toolbar</li><li>Scroll and tap <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>`
      : `<p class="sub">Open <b>keystrike-lac.vercel.app</b> in Safari, then tap Share → <b>Add to Home Screen</b>.</p>`}
    <p class="sub">Keystrike then opens full screen from its own icon, without the address bar.</p>
    <button class="btn primary" data-a="close">Got it</button>`);
};
