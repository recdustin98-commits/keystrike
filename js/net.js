// Room transport. Supabase Realtime in production; BroadcastChannel for local testing (?local=1).
import { createClient } from './vendor/supabase.js';

const SUPABASE_URL = 'https://egpmhkckdmhbkbtwtegl.supabase.co';
// Public (anon) key: safe to ship in a web page. Never put the service_role key here.
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncG1oa2NrZG1oYmtidHd0ZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMTc2NzEsImV4cCI6MjExMDg5MzY3MX0.0e0UM65DTwmi5dS8wnTgOa3hC2Hub7wZUiTk3pxLD94';

let client = null;

class Room {
  constructor(me) { this.me = me; this.handlers = {}; this.peerFns = []; this.list = []; }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  onPeers(fn) { this.peerFns.push(fn); fn(this.list); }
  dispatch(m) { if (!m || m.from === this.me.id) return; for (const fn of this.handlers[m.t] || []) fn(m); }
  setPeers(list) { this.list = list; for (const fn of this.peerFns) fn(list); }
  peers() { return this.list; }
}

class SupaRoom extends Room {
  async join(code, state) {
    client ||= createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 30 } } });
    this.ch = client.channel('ks-' + code, { config: { broadcast: { self: false }, presence: { key: this.me.id } } });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => this.dispatch(payload));
    this.ch.on('presence', { event: 'sync' }, () => {
      const st = this.ch.presenceState();
      this.setPeers(Object.entries(st).map(([id, arr]) => ({ id, ...arr[arr.length - 1] })));
    });
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('timeout')), 12000);
      this.ch.subscribe(s => {
        if (s === 'SUBSCRIBED') { clearTimeout(to); res(); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { clearTimeout(to); rej(new Error(s)); }
      });
    });
    await this.ch.track(state);   // once: presence changes are rate-limited by Supabase
  }
  send(t, d = {}) { this.ch?.send({ type: 'broadcast', event: 'm', payload: { t, from: this.me.id, ...d } }); }
  async leave() { try { await this.ch.untrack(); await client.removeChannel(this.ch); } catch (e) {} }
}

class LocalRoom extends Room {
  async join(code, state) {
    this.bc = new BroadcastChannel('ks-' + code);
    this.seen = new Map();
    this.bc.onmessage = e => {
      const m = e.data;
      if (m.t === '__p') { this.seen.set(m.from, { at: Date.now(), state: m.state }); this.sync(); return; }
      if (m.t === '__bye') { this.seen.delete(m.from); this.sync(); return; }
      this.dispatch(m);
    };
    this.state = state; this.beat();
    this.iv = setInterval(() => { this.beat(); this.sync(); }, 700);
  }
  beat() { this.bc.postMessage({ t: '__p', from: this.me.id, state: this.state }); }
  sync() {
    const now = Date.now();
    for (const [k, v] of this.seen) if (now - v.at > 2500) this.seen.delete(k);
    const list = [{ id: this.me.id, ...this.state }, ...[...this.seen].map(([id, v]) => ({ id, ...v.state }))];
    this.setPeers(list);
  }
  send(t, d = {}) { this.bc.postMessage({ t, from: this.me.id, ...d }); }
  async track(state) { this.state = state; this.beat(); this.sync(); }
  async leave() { clearInterval(this.iv); this.bc.postMessage({ t: '__bye', from: this.me.id }); this.bc.close(); }
}

export async function joinRoom(code, me, state, local) {
  const r = local ? new LocalRoom(me) : new SupaRoom(me);
  await r.join(code, state);
  return r;
}
