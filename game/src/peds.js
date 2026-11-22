// peds.js — the people of Solmar: one low-poly character builder the
// player, pedestrians, gang and foot police all share, and the
// pedestrian system that strolls them along the pavements.
//
// A person is a group of boxes with swinging arms and legs; the walk
// cycle is just sin(time) applied to the limb pivots, so a crowd costs
// almost nothing. Pedestrians pick pavement targets, stroll to them,
// and run screaming (well, running) when gunfire or a siren scares
// them.
import * as THREE from 'three';
import { HALF, PITCH, ROAD_W, makeRng, randRange, randPick, clamp } from './utils.js';
import { collideWorld } from './city.js';

const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0x6e4530, 0xffdbac];
const SHIRT = [0xd94f3d, 0x3d7ad9, 0x59c96b, 0xe8c84a, 0xe8e8ec, 0xb04fd0, 0x4fd0c8, 0xff8ab0, 0x2b2f38];
const PANTS = [0x2b3550, 0x4a3b2c, 0x5a5f6a, 0x27332a, 0x704214];

export function makePerson(shirt, pants, skin) {
  const grp = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legGeo = new THREE.BoxGeometry(0.21, 0.78, 0.24);
  const armGeo = new THREE.BoxGeometry(0.17, 0.72, 0.2);
  function limb(geo, color, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.y = -geo.parameters.height / 2 + 0.04;
    pivot.add(m);
    grp.add(pivot);
    return pivot;
  }
  const legL = limb(legGeo, pants, -0.14, 0.8, 0);
  const legR = limb(legGeo, pants, 0.14, 0.8, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), mat(shirt));
  torso.position.y = 1.13;
  grp.add(torso);
  const armL = limb(armGeo, shirt, -0.37, 1.42, 0);
  const armR = limb(armGeo, shirt, 0.37, 1.42, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), mat(skin));
  head.position.y = 1.66;
  grp.add(head);
  return { grp, legL, legR, armL, armR, torso, head };
}

export function animatePerson(person, speed, t) {
  const swing = clamp(Math.abs(speed) / 4, 0, 1.6) * 0.62;
  const ph = t * (4 + Math.abs(speed) * 1.35);
  person.legL.rotation.x = Math.sin(ph) * swing;
  person.legR.rotation.x = -Math.sin(ph) * swing;
  person.armL.rotation.x = -Math.sin(ph) * swing * 0.8;
  person.armR.rotation.x = Math.sin(ph) * swing * 0.8;
}

export function spawnPeds(state, count) {
  const rng = makeRng(4242);
  state.peds = [];
  for (let i = 0; i < count; i++) {
    const person = makePerson(randPick(rng, SHIRT), randPick(rng, PANTS), randPick(rng, SKIN));
    const p = {
      ...person,
      pos: person.grp.position,
      heading: randRange(rng, 0, Math.PI * 2),
      speed: 0, walkSpeed: randRange(rng, 1.1, 1.9),
      target: null, panicT: 0, dead: false, fallT: 0, seed: rng() * 100,
    };
    pickTarget(state, p, rng);
    p.pos.set(p.target.x + randRange(rng, -8, 8), 0, p.target.z + randRange(rng, -8, 8));
    state.scene.add(p.grp);
    state.peds.push(p);
  }
}

// Pavement targets: just off a random road, anywhere in the grid.
function pickTarget(state, p, rng) {
  const alongAvenue = rng() < 0.5;
  const k = Math.floor(rng() * 11);
  const side = rng() < 0.5 ? -1 : 1;
  const off = side * (ROAD_W / 2 + randRange(rng, 1.2, 3.4));
  const along = randRange(rng, -HALF + 6, HALF - 4);
  p.target = alongAvenue
    ? { x: -HALF + k * PITCH + off, z: along }
    : { x: along, z: -HALF + k * PITCH + off };
}

export function scarePeds(state, x, z, radius) {
  for (const p of state.peds) {
    if (p.dead) continue;
    const dx = p.pos.x - x, dz = p.pos.z - z;
    if (dx * dx + dz * dz < radius * radius) p.panicT = Math.max(p.panicT, 2.6);
  }
}

export function updatePeds(state, dt) {
  const rng = state.rng;
  for (const p of state.peds) {
    if (p.dead) {
      if (p.fallT < 1) { p.fallT += dt * 2.2; p.grp.rotation.x = -Math.PI / 2 * Math.min(1, p.fallT); }
      continue;
    }
    if (p.panicT > 0) p.panicT -= dt;
    const panicking = p.panicT > 0;
    let tx = p.target.x, tz = p.target.z;
    if (panicking && state.threat) {
      tx = p.pos.x + (p.pos.x - state.threat.x) * 2;
      tz = p.pos.z + (p.pos.z - state.threat.z) * 2;
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!panicking && d < 2.2) { pickTarget(state, p, rng); continue; }
    const want = Math.atan2(dx, dz);
    let dh = want - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += clamp(dh, -5 * dt, 5 * dt);
    const spd = panicking ? 4.6 : p.walkSpeed;
    p.speed += clamp(spd - p.speed, -8 * dt, 8 * dt);
    p.pos.x += Math.sin(p.heading) * p.speed * dt;
    p.pos.z += Math.cos(p.heading) * p.speed * dt;
    collideWorld(state, p.pos, 0.45);
    p.grp.position.copy(p.pos);
    p.grp.rotation.y = p.heading;
    animatePerson(p, p.speed, state.time + p.seed);
  }
}

// A car that connects with a pedestrian puts them down. Called by the
// main loop's car-vs-people pass; returns true when it connected.
export function carHitsPed(state, car) {
  if (Math.abs(car.speed) < 3.5) return false;
  let any = false;
  for (const p of state.peds) {
    if (p.dead) continue;
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    if (dx * dx + dz * dz < 2.6 * 2.6) {
      p.dead = true; p.fallT = 0;
      state.effects.burst(p.pos.x, 1, p.pos.z, 8, 0xd94f3d, 3);
      any = true;
    }
  }
  return any;
}
