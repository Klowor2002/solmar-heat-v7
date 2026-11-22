// utils.js — shared math, the seeded random generator, and the world
// constants every other module agrees on.
//
// Solmar City is a square grid: avenues and streets cross every PITCH
// units, the asphalt is ROAD_W wide, and the blocks between them hold
// the buildings. The sea sits past the south edge (+z), with a beach
// strip and a pier. Everything that needs to know where a road is asks
// here, so the city can never disagree with the traffic.

export const PITCH = 60;          // distance between neighbouring road centres
export const ROAD_W = 16;         // asphalt width
export const BLOCKS = 10;         // blocks per side
export const HALF = (PITCH * BLOCKS) / 2;   // city spans -HALF..HALF on both axes
export const SEA_Z = HALF + 46;   // waterline: sand ends, the sea begins
export const LANE = 4.1;          // right-hand traffic lane offset from centre

// Deterministic random: mulberry32. The whole city is seeded, so a
// staged screenshot rebuilds the identical world on every machine.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function randPick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Wrap an angle to -PI..PI so steering never takes the long way round.
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function angleLerp(a, b, t) { return a + wrapAngle(b - a) * t; }

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
export function distSq2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

// Road geometry. Roads run along every grid line x = -HALF + k*PITCH
// (avenues, running north-south) and z likewise (streets, east-west).
export function roadCoord(k) { return -HALF + k * PITCH; }
export function onRoadX(x) { // near a north-south avenue?
  const m = ((x + HALF) % PITCH + PITCH) % PITCH;
  return m < ROAD_W / 2 || m > PITCH - ROAD_W / 2;
}
export function onRoadZ(z) {
  const m = ((z + HALF) % PITCH + PITCH) % PITCH;
  return m < ROAD_W / 2 || m > PITCH - ROAD_W / 2;
}
export function inCity(x, z) { return Math.abs(x) <= HALF + 8 && z >= -HALF - 8 && z <= SEA_Z + 30; }

// Snap a point to the nearest intersection centre.
export function nearestCrossing(x, z) {
  const kx = clamp(Math.round((x + HALF) / PITCH), 0, BLOCKS);
  const kz = clamp(Math.round((z + HALF) / PITCH), 0, BLOCKS);
  return { x: roadCoord(kx), z: roadCoord(kz) };
}

// Format a game clock (minutes since midnight) as HH:MM.
export function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function moneyText(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
