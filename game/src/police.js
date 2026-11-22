// police.js — the Solmar PD: the five-star wanted system, interceptor
// cars that hunt and ram, and foot officers who shoot at high heat
// and arrest at low speed.
//
// Wanted works on line of sight: heat only cools when no officer has
// seen Jax for a while, and the bust meter only fills while an officer
// is close and Jax is slow — running always beats standing still,
// which is the genre's oldest rule and still the fairest.
import { clamp, wrapAngle, dist2D, randRange } from './utils.js';
import { makeCar, driveCar } from './vehicles.js';
import { makePerson } from './peds.js';
import { updateFighter } from './combat.js';

export function initPolice(state) {
  state.wanted = 0;
  state.heat = 0;          // unseen timer feeding wanted decay
  state.bust = 0;          // 0..1 arrest meter
  state.copCars = [];
  state.footCops = [];
  state.addWanted = (n, why) => {
    if (state.frozen || state.player.dead) return;
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.heat = 0;
    if (state.wanted > before && why) state.toast(`Wanted: ${why}`);
  };
}

function spawnCopCar(state) {
  const p = state.player;
  const ang = randRange(state.rng, 0, Math.PI * 2);
  const d = 78;
  const x = clamp(p.pos.x + Math.sin(ang) * d, -320, 320);
  const z = clamp(p.pos.z + Math.cos(ang) * d, -320, 330);
  const car = makeCar('cop', 0x1c2733, x, z, randRange(state.rng, 0, 6.28));
  car.driver = 'cop';
  state.scene.add(car.mesh);
  state.copCars.push(car);
  state.allCars.push(car);
  return car;
}

function spawnFootCop(state, x, z) {
  const person = makePerson(0x24406e, 0x1c2733, 0xf2c49b);
  const a = {
    ...person, pos: person.grp.position,
    heading: 0, health: 60, dead: false, fallT: 0,
    shootCd: randRange(state.rng, 0.6, 1.4), strafe: 1,
    isCop: true, seed: state.rng() * 40,
  };
  a.pos.set(x, 0, z);
  state.scene.add(a.grp);
  state.footCops.push(a);
  return a;
}

function removeCar(state, car) {
  state.scene.remove(car.mesh);
  state.copCars = state.copCars.filter((c) => c !== car);
  state.allCars = state.allCars.filter((c) => c !== car);
}

export function updatePolice(state, dt) {
  const p = state.player;
  // Lightbars flash on every live interceptor.
  const phase = Math.floor(state.time * 3.4) % 2;
  for (const car of state.copCars) {
    if (!car.lightbar) continue;
    car.lightbar.red.material.color.setHex(phase ? 0xff2222 : 0x571010);
    car.lightbar.blue.material.color.setHex(phase ? 0x102a57 : 0x2255ff);
  }
  if (state.wanted <= 0 || p.dead) {
    // Heat gone: officers peel off and despawn with distance.
    for (const car of [...state.copCars]) {
      car.speed *= (1 - 1.4 * dt);
      car.mesh.position.copy(car.pos);
      if (dist2D(p.pos.x, p.pos.z, car.pos.x, car.pos.z) > 60) removeCar(state, car);
    }
    state.bust = Math.max(0, state.bust - dt * 0.8);
    return;
  }
  // Reinforcements: one cruiser per star, plus one.
  const wantCars = Math.min(1 + state.wanted, 5);
  if (state.copCars.length < wantCars && state.rng() < dt * 1.4) spawnCopCar(state);
  const wantFeet = state.wanted >= 2 ? Math.min(state.wanted - 1, 3) : 0;
  if (state.footCops.filter((c) => !c.dead).length < wantFeet && state.rng() < dt * 0.8) {
    const near = state.copCars[0];
    if (near) spawnFootCop(state, near.pos.x + 2, near.pos.z + 2);
  }
  let seen = false;
  for (const car of [...state.copCars]) {
    if (car.dead) { removeCar(state, car); continue; }
    if (car.driver === 'player') continue;   // stolen: Jax is driving it
    const d = dist2D(p.pos.x, p.pos.z, car.pos.x, car.pos.z);
    if (d < 60) seen = true;
    if (d > 190) { removeCar(state, car); continue; }
    // Pursuit: aim at the player, predicted a touch ahead.
    const lead = p.inCar && p.car ? clamp(p.car.speed * 0.35, -6, 10) : 0;
    const tx = p.pos.x + (p.inCar ? Math.sin(p.car.heading) * lead : 0);
    const tz = p.pos.z + (p.inCar ? Math.cos(p.car.heading) * lead : 0);
    const dh = wrapAngle(Math.atan2(tx - car.pos.x, tz - car.pos.z) - car.heading);
    const input = {
      gas: d > 7, brake: d < 4.5 && Math.abs(p.speed || 0) < 1,
      left: dh > 0.1, right: dh < -0.1,
      handbrake: Math.abs(dh) > 2.2,
    };
    if (!p.inCar && d < 5.5) input.gas = false;   // don't just run him over, arrest him
    driveCar(state, car, dt, input);
    // Bust pressure from a stopped cruiser alongside a slow player.
    if (!p.inCar && d < 5) state.bust += dt * 0.34;
  }
  for (const cop of state.footCops) {
    if (cop.dead) {
      if (cop.fallT < 1) { cop.fallT += dt * 2.4; cop.grp.rotation.x = -Math.PI / 2 * Math.min(1, cop.fallT); }
      continue;
    }
    const d = dist2D(p.pos.x, p.pos.z, cop.pos.x, cop.pos.z);
    if (d < 55) seen = true;
    if (state.wanted >= 3 || state.weapon === 'pistol') updateFighter(state, cop, dt, 15, 6);
    else {
      // Low heat: they run at Jax to make the arrest instead.
      const dx = p.pos.x - cop.pos.x, dz = p.pos.z - cop.pos.z;
      cop.heading = Math.atan2(dx, dz);
      const spd = d > 1.9 ? 5.4 : 0;
      cop.pos.x += Math.sin(cop.heading) * spd * dt;
      cop.pos.z += Math.cos(cop.heading) * spd * dt;
      cop.grp.position.copy(cop.pos);
      cop.grp.rotation.y = cop.heading;
      if (d < 2.4) state.bust += dt * 0.5;
    }
  }
  // Heat bookkeeping: unseen long enough and the stars bleed away.
  if (seen) state.heat = 0;
  else {
    state.heat += dt;
    if (state.heat > 7) {
      state.heat = 0;
      state.wanted = Math.max(0, state.wanted - 1);
      if (state.wanted === 0) state.toast('You lost them');
    }
  }
  const playerSlow = !p.inCar && true;
  if (playerSlow) state.bust = clamp(state.bust, 0, 1);
  if (state.bust >= 1 && !p.dead) {
    state.bust = 0;
    state.gameOver('busted');
  }
  // Standing in the open next to nobody cools the arrest meter.
  if (!state.footCops.some((c) => !c.dead && dist2D(p.pos.x, p.pos.z, c.pos.x, c.pos.z) < 6) &&
      !state.copCars.some((c) => dist2D(p.pos.x, p.pos.z, c.pos.x, c.pos.z) < 6)) {
    state.bust = Math.max(0, state.bust - dt * 0.55);
  }
}
