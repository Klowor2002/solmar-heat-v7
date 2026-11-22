// effects.js — the juice: one pooled particle system for sparks,
// smoke, debris and pickup sparkles, plus the camera-shake state the
// player camera reads.
//
// A single THREE.Points with a fixed pool: bursts just wake sleeping
// particles with a position, a colour and a velocity. No allocation
// in the hot loop, no per-effect objects.
import * as THREE from 'three';

const POOL = 420;

export function makeEffects(state) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(POOL * 3);
  const col = new Float32Array(POOL * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  state.scene.add(points);
  const parts = [];
  for (let i = 0; i < POOL; i++) {
    parts.push({ life: 0, vx: 0, vy: 0, vz: 0, grav: 0 });
    pos[i * 3 + 1] = -50;
  }
  let cursor = 0;
  const tmpColor = new THREE.Color();
  return {
    burst(x, y, z, n, colorHex, power = 3) {
      tmpColor.setHex(colorHex);
      for (let k = 0; k < n; k++) {
        const p = parts[cursor];
        const i = cursor;
        cursor = (cursor + 1) % POOL;
        p.life = 0.45 + Math.random() * 0.5;
        p.grav = -5.5;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        p.vx = (Math.random() - 0.5) * power * 2;
        p.vy = Math.random() * power * 1.4;
        p.vz = (Math.random() - 0.5) * power * 2;
        col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b;
      }
      geo.attributes.color.needsUpdate = true;
    },
    smoke(x, y, z, n = 2) {
      this.burst(x, y, z, n, 0x555560, 0.8);
    },
    update(dt) {
      for (let i = 0; i < POOL; i++) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { pos[i * 3 + 1] = -50; continue; }
        p.vy += p.grav * dt;
        pos[i * 3] += p.vx * dt;
        pos[i * 3 + 1] += p.vy * dt;
        pos[i * 3 + 2] += p.vz * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; p.vy = 0; }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
