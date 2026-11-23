// Daily-challenge leaderboard. The database only accepts scores through a checked function (see supabase/schema.sql).
import { getClient } from './net.js';

const LOCAL = new URLSearchParams(location.search).has('local');
const fake = () => { try { return JSON.parse(localStorage.getItem('ks_fake') || '[]'); } catch (e) { return []; } };

export const utcDay = () => new Date().toISOString().slice(0, 10);
export function daySeed(level, day = utcDay()) {
  let h = 2166136261;
  for (const c of 'keystrike|' + level + '|' + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export async function submitScore(r) {
  if (LOCAL) {
    const a = fake(); a.push({ device: r.device, name: r.name, level: r.level, day: r.day, score: r.score, dist: r.dist });
    localStorage.setItem('ks_fake', JSON.stringify(a)); return { ok: true };
  }
  const { data, error } = await getClient().rpc('submit_score', {
    p_device: r.device, p_name: r.name, p_level: r.level, p_day: r.day, p_score: r.score, p_dist: r.dist,
    p_words: r.words, p_keys: r.keys, p_good: r.good, p_secs: r.secs,
  });
  if (error) throw error;
  return data;
}

export async function loadBoard(level, period, device) {
  if (LOCAL) {
    const best = new Map();
    for (const e of fake().filter(e => e.level === level)) { const b = best.get(e.device); if (!b || e.score > b.score) best.set(e.device, e); }
    const rows = [...best.values()].sort((a, b) => b.score - a.score).map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, dist: e.dist, mine: e.device === device }));
    return rows.filter(r => r.rank <= 10 || r.mine);
  }
  const { data, error } = await getClient().rpc('leaderboard', { p_level: level, p_period: period, p_device: device });
  if (error) throw error;
  return data || [];
}
