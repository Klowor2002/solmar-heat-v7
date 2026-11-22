// shots.js — the four staged screenshot scenes, same contract as
// every Solmar build: the world is seeded, the actors are placed by
// hand, the simulation runs exactly 150 fixed steps, and the frame
// freezes. Same seed, same steps, same picture, on every machine.
//
//   cover   — a four-star chase down the central avenue at dusk.
//   street  — on foot outside Mona's Garage, first job on the HUD.
//   mission — the Vulture alley shootout, pistol drawn.
//   city    — the whole grid from the air: tower, beach, sea.
import { makeCar } from './vehicles.js';
import { spawnGang, givePistol } from './combat.js';
import { showMarker, ALLEY } from './missions.js';
import { updateCamera } from './player.js';
import { LANDMARKS } from './city.js';
import * as hud from './hud.js';

export const SHOT_NAMES = ['cover', 'street', 'mission', 'city'];
const PRE_STEPS = 150;
const STEP = 1 / 60;

function placePlayerCar(state, car, x, z, heading, speed) {
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = speed;
  car.driver = 'player';
  state.player.inCar = true;
  state.player.car = car;
  state.player.pos.copy(car.pos);
  state.player.meshVisible(false);
  state.camMode = 'car';
}

function addShotCop(state, x, z, speed) {
  const car = makeCar('cop', 0x1c2733, x, z, 0);
  car.driver = 'cop';
  car.speed = speed;
  state.scene.add(car.mesh);
  state.copCars.push(car);
  state.allCars.push(car);
  return car;
}

export function stageShot(state, name) {
  const p = state.player;
  state.shotName = name;
  state.shotCamera = null;
  state.time = 3.7;   // a fixed clock so lightbars and glows sit still
  if (name === 'cover') {
    const hero = makeCar('coupe', 0xff2e88, -4, 40, 0, 25);
    state.scene.add(hero.mesh);
    state.allCars.push(hero);
    placePlayerCar(state, hero, -4, 40, 0, 25);
    addShotCop(state, -1.5, 31, 24.6);
    addShotCop(state, -7, 26, 24.1);
    state.wanted = 4;
    state.missions.active = true;
    state.missions.index = 3;
    state.missions.stage = 'escape';
    state.missions.timer = 45;
    state.setObjective('The Getaway — reach the safehouse before the timer runs out');
    showMarker(LANDMARKS.safehouse.x, LANDMARKS.safehouse.z + 21);
  } else if (name === 'street') {
    const G = LANDMARKS.garage;
    p.pos.set(G.x, 0, G.z + 46);
    p.heading = Math.atan2(0, -16);
    p.camYaw = p.heading;
    p.camPitch = 0.1;
    p.meshVisible(true);
    state.missions.active = true;
    state.missions.index = 0;
    state.missions.stage = 'go';
    showMarker(G.x, G.z + 21);
    state.setObjective('First Pickup — meet Mona at her garage');
  } else if (name === 'mission') {
    p.pos.set(ALLEY.x - 4, 0, ALLEY.z - 12);
    p.heading = Math.atan2(-2, 28);
    p.camYaw = p.heading;
    p.meshVisible(true);
    givePistol(state, 48);
    state.ammo = 12;
    state.wanted = 2;
    state.missions.active = true;
    state.missions.index = 2;
    state.missions.stage = 'kill';
    state.missions.killed = 0;
    state.missions.need = 4;
    spawnGang(state, ALLEY.x - 6, ALLEY.z + 16, 4);
    state.setObjective('Alley Cats — clear out the Vultures, 0 of 4');
    for (const car of state.traffic) {
      const dx = car.pos.x - ALLEY.x, dz = car.pos.z - ALLEY.z;
      if (dx * dx + dz * dz < 55 * 55) { car.pos.x += 170; car.pos.z += 130; }
    }
  } else if (name === 'city') {
    const parked = makeCar('sedan', 0x3d7ad9, 4, 150, Math.PI, 0);
    state.scene.add(parked.mesh);
    state.allCars.push(parked);
    p.pos.set(10, 0, 158);
    p.meshVisible(true);
    state.setObjective('Free roam — press M for the next job');
    state.shotCamera = { pos: [-40, 150, -270], look: [10, 0, 90] };
  }
  for (let i = 0; i < PRE_STEPS; i++) stepShot(state, STEP);
  state.frozen = true;
  if (state.shotCamera) {
    state.camera.position.set(...state.shotCamera.pos);
    state.camera.lookAt(...state.shotCamera.look);
  } else if (name === 'cover') {
    // Frame the chase from behind and above the hero car, wherever
    // the pre-sim carried it: cops in frame, avenue running away.
    const car = p.car;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    state.camera.position.set(car.pos.x - fx * 13.5, 3.9, car.pos.z - fz * 13.5);
    state.camera.lookAt(car.pos.x + fx * 16, 1.1, car.pos.z + fz * 16);
  } else {
    state.camMode = p.inCar ? 'car' : 'foot';
    updateCamera(state, 0.016);
    updateCamera(state, 0.5);
  }
  hud.updateHud(0, state);
  const msg = document.getElementById('message');
  if (msg) msg.textContent = '';
  document.title = 'SHOT-READY';
  const dbg = document.getElementById('debug');
  if (dbg && new URLSearchParams(location.search).has('debug')) {
    dbg.style.display = 'block';
    const cops = state.copCars.map((c) => `${c.pos.x.toFixed(1)},${c.pos.z.toFixed(1)}`).join(' | ');
    dbg.textContent =
      `shot=${name} player=${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)} wanted=${state.wanted}\n` +
      `cops=${cops} gang=${state.gang.length} errors=${state.errors.length}\n` +
      (state.errors.length ? state.errors.join('\n') : 'no errors');
  }
}

// The reduced simulation a staged scene runs: the hero car cruises
// straight, staged cops give chase, traffic and people keep moving,
// the gang closes in. No input, no mission bookkeeping — the scene
// was composed by hand and the steps only settle it into motion.
export function stepShot(state, dt) {
  const p = state.player;
  if (p.inCar && p.car) {
    p.car.pos.x += Math.sin(p.car.heading) * p.car.speed * dt;
    p.car.pos.z += Math.cos(p.car.heading) * p.car.speed * dt;
    p.car.mesh.position.copy(p.car.pos);
    p.car.mesh.rotation.y = p.car.heading;
    p.pos.copy(p.car.pos);
  }
  for (const car of state.copCars) {
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    const want = Math.atan2(dx, dz);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-1.7 * dt, Math.min(1.7 * dt, dh));
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }
  state.updateTrafficOnly(dt);
  state.updatePedsOnly(dt);
  state.updateGangOnly(dt);
  state.effects.update(dt);
}
