// vehicles.js — every car in Solmar: the factory that builds them
// (sedans, coupes, trucks, the armoured van, police interceptors with
// flashing lightbars) and the traffic system that drives the ones
// nobody is steering.
//
// Traffic keeps right-hand lanes, pauses for the car ahead, and turns
// at intersections, so the city reads as alive from any camera. Cars
// are plain groups of boxes and cylinders — cheap enough to run forty
// of them beside everything else.
import * as THREE from 'three';
import { PITCH, HALF, LANE, makeRng, randRange, randPick, clamp, wrapAngle } from './utils.js';
import { collideWorld } from './city.js';

const PAINT = [0xd94f3d, 0x3d7ad9, 0x59c96b, 0xe8c84a, 0xe8e8ec, 0x2b2f38, 0xb04fd0, 0x4fd0c8, 0xd97f2e, 0x8a93a3];
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a3d });

function buildMesh(kind, color) {
  const grp = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const isTruck = kind === 'truck' || kind === 'van';
  const bodyLen = isTruck ? 6.4 : (kind === 'coupe' ? 4.5 : 4.8);
  const bodyWid = isTruck ? 2.5 : 2.0;
  const bodyH = isTruck ? 1.5 : 0.62;
  const bodyY = isTruck ? 1.35 : 0.72;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyWid, bodyH, bodyLen), paint);
  body.position.y = bodyY;
  grp.add(body);
  if (isTruck) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(bodyWid, 1.0, 1.6),
      kind === 'van' ? new THREE.MeshLambertMaterial({ color: 0x707880 }) : paint);
    cab.position.set(0, 1.05, bodyLen / 2 - 0.7);
    grp.add(cab);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyWid * 0.82, 0.55, bodyLen * 0.46), glassMat);
    cabin.position.set(0, bodyY + 0.55, kind === 'coupe' ? -0.2 : 0.1);
    grp.add(cabin);
  }
  // Headlights and taillights: tiny emissive boxes that read at dusk.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    h.position.set(sx * bodyWid * 0.32, bodyY, bodyLen / 2 + 0.02);
    grp.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    t.position.set(sx * bodyWid * 0.32, bodyY, -bodyLen / 2 - 0.02);
    grp.add(t);
  }
  const wheels = [];
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx * (bodyWid / 2 + 0.06), 0.42, wz * (bodyLen / 2 - 1.05));
    grp.add(w);
    wheels.push(w);
  }
  let lightbar = null;
  if (kind === 'cop') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 0, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.32, 0, 0);
    bar.add(red); bar.add(blue);
    bar.position.set(0, bodyY + 0.95, 0.1);
    grp.add(bar);
    lightbar = { red, blue };
    const door = new THREE.Mesh(new THREE.BoxGeometry(bodyWid + 0.04, 0.5, 1.7),
      new THREE.MeshBasicMaterial({ color: 0xf2f4f8 }));
    door.position.set(0, bodyY + 0.05, 0.15);
    grp.add(door);
  }
  return { grp, wheels, lightbar, bodyLen, bodyWid };
}

let carSeq = 0;
export function makeCar(kind, color, x, z, heading) {
  const { grp, wheels, lightbar, bodyLen, bodyWid } = buildMesh(kind, color);
  grp.position.set(x, 0, z);
  grp.rotation.y = heading;
  return {
    id: carSeq++,
    kind, color,
    mesh: grp, wheels, lightbar, bodyLen, bodyWid,
    pos: grp.position,
    heading, speed: 0, steer: 0,
    driver: null,            // null = parked/traffic, 'player', 'cop', 'traffic'
    health: kind === 'van' ? 320 : 100,
    dead: false,
    axis: null, dir: 1, laneAt: 0, cruise: 11, waitT: 0,
  };
}

export function spinWheels(car, dt) {
  const w = (car.speed * dt) / 0.42;
  for (const wheel of car.wheels) wheel.rotation.x += w;
}

// --- traffic -------------------------------------------------------------------
export function spawnTraffic(state, count) {
  const rng = makeRng(777);
  state.traffic = [];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const line = Math.floor(rng() * 11) - 5;             // road index offset
    const along = randRange(rng, -HALF, HALF);
    const kind = rng() < 0.14 ? 'truck' : (rng() < 0.3 ? 'coupe' : 'sedan');
    const car = makeCar(kind, randPick(rng, PAINT), 0, 0, 0);
    placeOnRoad(car, axis, dir, line * PITCH, along);
    car.driver = 'traffic';
    car.cruise = randRange(rng, 9, 15);
    state.scene.add(car.mesh);
    state.traffic.push(car);
    state.allCars.push(car);
  }
}

function placeOnRoad(car, axis, dir, lineAt, along) {
  car.axis = axis; car.dir = dir;
  if (axis === 'z') {
    car.laneAt = lineAt - dir * LANE;
    car.pos.set(car.laneAt, 0, along);
    car.heading = dir > 0 ? 0 : Math.PI;
  } else {
    car.laneAt = lineAt + dir * LANE;
    car.pos.set(along, 0, car.laneAt);
    car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
}

// One traffic step: follow the lane, slow for the car ahead, turn at
// crossings, wrap around the world edge so density never dies out.
export function updateTraffic(state, dt) {
  for (const car of state.traffic) {
    if (car.driver !== 'traffic' || car.dead) continue;
    let target = car.cruise;
    // Car ahead in the same lane?
    for (const other of state.allCars) {
      if (other === car || other.dead) continue;
      const rel = axisRel(car, other);
      if (rel && rel.ahead > 0 && rel.ahead < 9 && Math.abs(rel.side) < 1.8) {
        target = Math.min(target, Math.max(0, (rel.ahead - 5) * 1.6));
      }
    }
    if (car.waitT > 0) { car.waitT -= dt; target = 0; }
    car.speed += clamp(target - car.speed, -22 * dt, 7 * dt);
    advance(state, car, dt);
    spinWheels(car, dt);
  }
}

// Position of `other` in car's road frame: ahead distance along its
// travel axis and sideways offset, or null when not on the same road.
function axisRel(car, other) {
  if (car.axis === 'z') {
    if (Math.abs(other.pos.x - car.laneAt) > 3.4) return null;
    return { ahead: (other.pos.z - car.pos.z) * car.dir, side: other.pos.x - car.laneAt };
  }
  if (Math.abs(other.pos.z - car.laneAt) > 3.4) return null;
  return { ahead: (other.pos.x - car.pos.x) * car.dir, side: other.pos.z - car.laneAt };
}

function advance(state, car, dt) {
  const step = car.speed * dt;
  if (car.axis === 'z') car.pos.z += step * car.dir;
  else car.pos.x += step * car.dir;
  // At a crossing, sometimes turn onto the crossing road.
  const cross = nearestLine(car);
  if (cross !== null && Math.abs(cross.dist) < 1.2 && car.speed > 2) {
    if (state.rng() < 0.28) {
      const turnDir = state.rng() < 0.5 ? 1 : -1;
      if (car.axis === 'z') { placeOnRoad(car, 'x', turnDir, cross.at, car.pos.x); }
      else { placeOnRoad(car, 'z', turnDir, cross.at, car.pos.z); }
      return;
    }
  }
  // Wrap at the world edge onto the same road, far side.
  if (car.axis === 'z' && Math.abs(car.pos.z) > HALF + 24) {
    car.pos.z = -Math.sign(car.pos.z) * (HALF + 20);
  }
  if (car.axis === 'x' && Math.abs(car.pos.x) > HALF + 24) {
    car.pos.x = -Math.sign(car.pos.x) * (HALF + 20);
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
}

function nearestLine(car) {
  const v = car.axis === 'z' ? car.pos.z : car.pos.x;
  const k = Math.round((v + HALF) / PITCH);
  if (k < 0 || k > 10) return null;
  const at = -HALF + k * PITCH;
  const along = car.axis === 'z' ? car.pos.z : car.pos.x;
  const dist = (at - along) * car.dir;
  return dist > -1.5 && dist < 14 ? { at, dist } : null;
}

// Arcade driving for whoever holds the wheel (player or police):
// accelerate, brake/reverse, steer with speed-sensitive bite, and a
// handbrake that lets the back end step out.
export function driveCar(state, car, dt, input) {
  const maxF = car.kind === 'coupe' ? 34 : (car.kind === 'truck' || car.kind === 'van' ? 24 : 29);
  const maxR = 9;
  if (input.gas) car.speed += (car.speed < 0 ? 26 : 15) * dt;
  if (input.brake) car.speed -= (car.speed > 0 ? 30 : 11) * dt;
  if (!input.gas && !input.brake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
  }
  car.speed = clamp(car.speed, -maxR, maxF);
  car.speed *= (1 - 0.25 * dt);   // rolling drag
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  car.steer += clamp(steerTarget * 0.62 - car.steer, -3.4 * dt, 3.4 * dt);
  const grip = input.handbrake ? 0.55 : 1;
  const turnRate = car.steer * clamp(Math.abs(car.speed) / 9, 0, 1.35) * grip * Math.sign(car.speed || 1);
  car.heading += turnRate * dt * 1.9;
  car.heading = wrapAngle(car.heading);
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  const hit = collideWorld(state, car.pos, 1.6);
  if (hit && Math.abs(car.speed) > 8) {
    state.effects.burst(car.pos.x, 0.8, car.pos.z, 6, 0xffcf6e, 2.6);
    state.shake = Math.min(0.5, Math.abs(car.speed) * 0.012);
    car.health -= Math.abs(car.speed) * 0.7;
  }
  if (hit) car.speed *= 0.55;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -car.steer * clamp(Math.abs(car.speed) / 30, 0, 1) * 0.05;
  spinWheels(car, dt);
  return hit;
}
