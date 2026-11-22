// player.js — Jax Moreno: on-foot movement with a proper third-person
// camera, sprinting and jumping, stealing cars, and the chase camera
// that leans back as the speed climbs.
//
// The camera is the game's feel, so it is smoothed twice: position
// lerps toward the ideal spot and the look-at point leads the motion,
// which is what makes driving read as fast rather than frantic.
import { clamp, wrapAngle, angleLerp, dist2D } from './utils.js';
import { collideWorld } from './city.js';
import { makePerson, animatePerson } from './peds.js';
import { driveCar } from './vehicles.js';

export function makePlayer(state) {
  const person = makePerson(0xd94f3d, 0x2b3550, 0xc68863);
  state.scene.add(person.grp);
  return {
    ...person,
    meshVisible: (v) => { person.grp.visible = v; },
    pos: person.grp.position,
    heading: 0, camYaw: Math.PI, camPitch: 0.24,
    vy: 0, grounded: true,
    health: 100, stamina: 100,
    inCar: false, car: null,
    dead: false, bustT: 0,
  };
}

// Nearest car the player could get into, or null.
export function nearestCar(state, maxD) {
  const p = state.player;
  let best = null, bestD = maxD;
  for (const car of state.allCars) {
    if (car.dead) continue;
    const d = dist2D(p.pos.x, p.pos.z, car.pos.x, car.pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  if (car.driver === 'traffic') {
    state.addWanted(1, 'car theft');
    state.toast('Stolen! The owner called it in');
  }
  if (car.driver === 'cop') state.addWanted(2, 'stealing a police car');
  if (car.driver === 'traffic' || car.driver === 'cop') car.stolen = true;
  car.driver = 'player';
  car.waitT = 0;
  p.inCar = true;
  p.car = car;
  p.meshVisible(false);
  state.camMode = 'car';
  state.audio.engineStart();
}

export function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  p.inCar = false;
  p.car = null;
  const side = car.heading + Math.PI / 2;
  p.pos.set(car.pos.x + Math.sin(side) * 2.2, 0, car.pos.z + Math.cos(side) * 2.2);
  p.heading = car.heading;
  p.meshVisible(true);
  state.camMode = 'foot';
}

// Attach the visibility toggle the person group needs (kept here so
// shots.js can hide Jax while he is staged inside a car).
export function updatePlayer(state, dt, input) {
  const p = state.player;
  if (p.inCar && p.car) {
    driveCar(state, p.car, dt, input);
    p.pos.copy(p.car.pos);
    if (state.time % 0.5 < dt) state.threat = { x: p.pos.x, z: p.pos.z };
    return;
  }
  // On foot: movement is relative to where the camera looks.
  let mx = 0, mz = 0;
  if (input.forward) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const moving = (mx !== 0 || mz !== 0);
  const sprinting = input.sprint && p.stamina > 1 && moving;
  const speed = sprinting ? 7.6 : 4.4;
  p.stamina = clamp(p.stamina + (sprinting ? -26 : 17) * dt, 0, 100);
  if (moving) {
    const len = Math.sqrt(mx * mx + mz * mz);
    const dx = mx / len, dz = mz / len;
    const sin = Math.sin(p.camYaw), cos = Math.cos(p.camYaw);
    const wx = dz * sin - dx * cos;
    const wz = dx * sin + dz * cos;
    p.pos.x += wx * speed * dt;
    p.pos.z += wz * speed * dt;
    p.heading = angleLerp(p.heading, Math.atan2(wx, wz), clamp(dt * 11, 0, 1));
  }
  if (input.jump && p.grounded) { p.vy = 6.4; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= 17 * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
  }
  collideWorld(state, p.pos, 0.5);
  p.grp.position.copy(p.pos);
  p.grp.rotation.y = p.heading;
  animatePerson(p, moving ? speed : 0, state.time);
}

export function addLook(p, dx, dy) {
  p.camYaw -= dx * 0.0026;
  p.camYaw = wrapAngle(p.camYaw);
  p.camPitch = clamp(p.camPitch + dy * 0.0021, -0.12, 0.95);
}

// The camera: a foot cam that trails Jax, a chase cam that widens
// with speed, and an aerial drift for menus. Staged shots set
// state.shotCamera and skip all of this.
export function updateCamera(state, dt) {
  const cam = state.camera;
  const p = state.player;
  if (state.shotCamera) {
    cam.position.set(...state.shotCamera.pos);
    cam.lookAt(...state.shotCamera.look);
    return;
  }
  const k = clamp(dt * 5.2, 0, 1);
  if (p.inCar && p.car) {
    const car = p.car;
    const back = 8.6 + Math.abs(car.speed) * 0.16;
    const tx = car.pos.x - Math.sin(car.heading) * back;
    const tz = car.pos.z - Math.cos(car.heading) * back;
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.z += (tz - cam.position.z) * k;
    cam.position.y += ((2.9 + Math.abs(car.speed) * 0.02) - cam.position.y) * k;
    const lx = car.pos.x + Math.sin(car.heading) * 9;
    const lz = car.pos.z + Math.cos(car.heading) * 9;
    cam.lookAt(lx, 1.2, lz);
    const targetFov = 62 + clamp(Math.abs(car.speed), 0, 34) * 0.55;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * k; cam.updateProjectionMatrix(); }
  } else {
    const d = 7.4;
    const tx = p.pos.x - Math.sin(p.camYaw) * Math.cos(p.camPitch) * d;
    const tz = p.pos.z - Math.cos(p.camYaw) * Math.cos(p.camPitch) * d;
    const ty = p.pos.y + 1.6 + Math.sin(p.camPitch) * d;
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    cam.lookAt(p.pos.x, p.pos.y + 1.5, p.pos.z);
    if (Math.abs(cam.fov - 60) > 0.1) { cam.fov += (60 - cam.fov) * k; cam.updateProjectionMatrix(); }
  }
  if (state.shake > 0.003) {
    cam.position.x += (Math.random() - 0.5) * state.shake;
    cam.position.y += (Math.random() - 0.5) * state.shake * 0.6;
    state.shake *= Math.pow(0.0015, dt);
  }
}
