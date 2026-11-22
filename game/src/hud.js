// hud.js — everything drawn over the 3D view: cash, the objective
// line, wanted stars, the clock, health and sprint bars, weapon and
// speed, the centre message, toasts, mission banners, the damage
// vignette, and the circular minimap with its blips.
//
// The minimap is a plain 2D canvas redrawn each frame: roads as a
// grid, the sea along the bottom, and one dot per thing that matters
// — blue for police, purple for Vultures, gold for tokens, a yellow
// diamond for the current objective.
import { PITCH, HALF, SEA_Z, clamp, clockText, moneyText } from './utils.js';

const el = {};
let mapCtx = null;

export function initHud() {
  for (const id of ['money', 'objective', 'stars', 'clock', 'radio', 'health-bar', 'sprint-bar',
    'weapon', 'ammo', 'speed', 'message', 'toast', 'banner', 'banner-title', 'banner-text',
    'hud', 'damage-flash', 'bust-wrap', 'bust-bar', 'crosshair']) {
    el[id] = document.getElementById(id);
  }
  const mm = document.getElementById('minimap');
  if (mm) mapCtx = mm.getContext('2d');
}

export function showHud(on) { if (el.hud) el.hud.style.display = on ? 'block' : 'none'; }

let toastTimer = 0;
export function toast(state, text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.style.opacity = '1';
  toastTimer = 2.6;
}

export function banner(state, title, text) {
  if (!el.banner) return;
  el['banner-title'].textContent = title;
  el['banner-text'].textContent = text;
  el.banner.style.display = 'flex';
  setTimeout(() => { el.banner.style.display = 'none'; }, 3400);
}

export function message(state, text) {
  if (el.message) el.message.textContent = text;
}

export function updateHud(dt, state) {
  if (!el.money) return;
  const p = state.player;
  el.money.textContent = moneyText(state.money);
  el.objective.textContent = state.objective || '';
  const w = Math.round(state.wanted);
  el.stars.textContent = '★★★★★'.slice(0, w) + '☆☆☆☆☆'.slice(0, 5 - w);
  el.stars.style.color = w > 0 ? '#ffd24a' : 'rgba(255,255,255,0.4)';
  el.clock.textContent = clockText(state.clockMin);
  el.radio.textContent = state.radioOn ? '♪ SOLMAR FM' : '♪ —';
  el['health-bar'].style.width = clamp(p.health, 0, 100) + '%';
  el['health-bar'].style.background = p.health < 30 ? '#e03a2a' : '#2ad44a';
  el['sprint-bar'].style.width = clamp(p.stamina, 0, 100) + '%';
  el.weapon.textContent = state.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
  el.ammo.textContent = state.weapon === 'pistol' ? `${state.ammo} / ${state.reserve}` : '—';
  el.speed.textContent = (p.inCar && p.car) ? `${Math.round(Math.abs(p.car.speed) * 3.1)} mph` : '';
  el.crosshair.style.display = (!p.inCar && state.weapon === 'pistol' && state.screen === 'game') ? 'block' : 'none';
  if (el['bust-wrap']) {
    el['bust-wrap'].style.display = state.bust > 0.02 ? 'block' : 'none';
    el['bust-bar'].style.width = clamp(state.bust * 100, 0, 100) + '%';
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0 && el.toast) el.toast.style.opacity = '0';
  }
  if (state.hurtFlash > 0) {
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 1.7);
    el['damage-flash'].style.opacity = String(state.hurtFlash * 0.9);
  }
  drawMinimap(state);
}

function mapXY(x, z) {
  const S = 150 / 760;
  return [(x + 380) * S, (z + 380) * S];
}

function drawMinimap(state) {
  if (!mapCtx) return;
  const g = mapCtx;
  g.clearRect(0, 0, 150, 150);
  g.fillStyle = '#241d38';
  g.fillRect(0, 0, 150, 150);
  // Sea along the south edge.
  const [, seaY] = mapXY(0, SEA_Z);
  g.fillStyle = '#1d5f7a';
  g.fillRect(0, seaY, 150, 150 - seaY);
  // Roads.
  g.strokeStyle = 'rgba(230,225,210,0.4)';
  g.lineWidth = 2;
  for (let k = 0; k <= 10; k++) {
    const at = -HALF + k * PITCH;
    const [rx] = mapXY(at, 0);
    g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx, seaY); g.stroke();
    const [, rz] = mapXY(0, at);
    g.beginPath(); g.moveTo(0, rz); g.lineTo(150, rz); g.stroke();
  }
  const dot = (x, z, color, r) => {
    const [mx, my] = mapXY(x, z);
    g.fillStyle = color;
    g.beginPath(); g.arc(mx, my, r, 0, 6.29); g.fill();
  };
  for (const t of state.tokens || []) if (!t.taken) dot(t.x, t.z, '#ffd24a', 2);
  for (const a of state.gang) if (!a.dead) dot(a.pos.x, a.pos.z, '#c95cff', 2.4);
  for (const c of state.footCops) if (!c.dead) dot(c.pos.x, c.pos.z, '#5aa2ff', 2.4);
  for (const c of state.copCars) dot(c.pos.x, c.pos.z, Math.floor(state.time * 3) % 2 ? '#ff5a5a' : '#5aa2ff', 2.6);
  if (state.marker && state.marker.visible) {
    const [mx, my] = mapXY(state.marker.x, state.marker.z);
    g.fillStyle = '#ffe14d';
    g.save(); g.translate(mx, my); g.rotate(Math.PI / 4); g.fillRect(-3.4, -3.4, 6.8, 6.8); g.restore();
  }
  // Jax: a white wedge pointing his way.
  const p = state.player;
  const [px, py] = mapXY(p.pos.x, p.pos.z);
  const h = p.inCar && p.car ? p.car.heading : p.heading;
  g.save();
  g.translate(px, py); g.rotate(h);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(-3.6, 4); g.closePath(); g.fill();
  g.restore();
}
