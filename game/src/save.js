// save.js — progress in localStorage: cash, story progress, tokens,
// and where Jax was standing. Everything read back is clamped to
// sane ranges, because a save is just text in a browser and the game
// should never trust it further than it can throw it.
import { clamp } from './utils.js';

const KEY = 'solmar-heat-neon-run-v7';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    return {
      money: clamp(Math.floor(s.money) || 0, 0, 9999999),
      missionsDone: clamp(Math.floor(s.missionsDone) || 0, 0, 10),
      tokens: Array.isArray(s.tokens) ? s.tokens.filter((t) => Number.isInteger(t) && t >= 0 && t < 12) : [],
      storyDone: !!s.storyDone,
      taxiDone: clamp(Math.floor(s.taxiDone) || 0, 0, 9999),
      pos: (s.pos && isFinite(s.pos.x) && isFinite(s.pos.z))
        ? { x: clamp(s.pos.x, -330, 330), z: clamp(s.pos.z, -330, 390) } : null,
    };
  } catch (e) {
    return null;
  }
}

export function storeSave(state) {
  try {
    const p = state.player;
    localStorage.setItem(KEY, JSON.stringify({
      money: Math.floor(state.money),
      missionsDone: state.missions.done,
      tokens: state.tokens.filter((t) => t.taken).map((t) => t.i),
      storyDone: state.missions.storyDone,
      taxiDone: state.taxi.done,
      pos: { x: Math.round(p.pos.x), z: Math.round(p.pos.z) },
    }));
  } catch (e) { /* a full or blocked store is not worth an error */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
