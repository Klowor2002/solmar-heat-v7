// missions.js — the story and the side economies.
//
// Ten story jobs for Mona Reyes, chained: a pickup, a stolen Comet to
// fence, the Vulture alley, a timed getaway, the pier deal, a
// safehouse defence, a night deposit, the Neon Run checkpoint dash, an
// armoured-van intercept, and the Solmar Bank score that closes the
// story. Around them the city pays for itself: the Chop Shop fences
// stolen cars, courier drops and a checkpoint race are always on, a
// taxi hail pays a fare and a tip, and twelve golden tokens sit
// waiting in alleys and on the pier.
import * as THREE from 'three';
import { HALF, SEA_Z, clamp, dist2D, randRange } from './utils.js';
import { LANDMARKS } from './city.js';
import { spawnGang, givePistol, dropPickup } from './combat.js';
import { makeCar } from './vehicles.js';

export const ALLEY = { x: -52, z: 68 };
// Every checkpoint sits on a road crossing — the last one used to
// sit inside the bank's footprint, where no car could ever reach it.
const CHECKPOINTS = [
  { x: 0, z: -240 }, { x: 240, z: -120 }, { x: 180, z: 60 },
  { x: -60, z: 180 }, { x: -240, z: 0 }, { x: 0, z: -60 },
];

let beam = null, ring = null;

export function initMissions(state) {
  state.missions = { done: 0, active: false, index: -1, stage: '', timer: 0, killed: 0, need: 0, storyDone: false, holdT: 0, wave: 0 };
  state.marker = { visible: false, x: 0, z: 0 };
  state.side = { kind: null, stage: '', target: null, timer: 0, step: 0, fare: 0 };
  state.taxi = { done: 0 };
  state.tokens = [];
  beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.visible = false;
  state.scene.add(beam);
  ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  state.scene.add(ring);
  // Twelve golden tokens: alleys, rooftops' shadows, the pier, the beach.
  const spots = [
    [ALLEY.x + 6, ALLEY.z - 8], [LANDMARKS.bank.x - 24, LANDMARKS.bank.z + 24],
    [LANDMARKS.hotel.x + 20, LANDMARKS.hotel.z - 26], [30, SEA_Z + 18],
    [-200, -200], [210, -210], [LANDMARKS.chop.x + 22, LANDMARKS.chop.z - 20],
    [LANDMARKS.garage.x - 22, LANDMARKS.garage.z + 18], [-30, 250],
    [150, 262], [LANDMARKS.tower.x + 20, LANDMARKS.tower.z + 22], [-262, 120],
  ];
  const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  spots.forEach(([x, z], i) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1, z);
    state.scene.add(mesh);
    state.tokens.push({ i, x, z, mesh, taken: false });
  });
  state.onGangKill = () => {
    const m = state.missions;
    if (m.active && (m.stage === 'kill' || m.stage === 'defend')) m.killed++;
  };
}

export function showMarker(x, z) {
  beam.visible = true; ring.visible = true;
  beam.position.set(x, 13, z);
  ring.position.set(x, 0.4, z);
}
export function hideMarker() { beam.visible = false; ring.visible = false; }

// Landmark buildings are solid 36x36 blocks: their centres can never
// be reached, on foot or by car. Every job that points at a building
// points at its front door instead — the kerb 21 units south of the
// centre, clear of the walls and right where the marker reads best.
function doorOf(lm) { return { x: lm.x, z: lm.z + 21 }; }

function setTarget(state, x, z, objective) {
  state.missions.target = { x, z };
  showMarker(x, z);
  state.marker = { visible: true, x, z };
  if (objective) state.setObjective(objective);
}
function clearTarget(state) {
  hideMarker();
  state.marker.visible = false;
}

const TITLES = [
  'First Pickup', 'Hot Wheels', 'Alley Cats', 'The Getaway', 'Pier Pressure',
  'Home Defence', 'Night Deposit', 'Neon Run', 'Armoured Van', 'The Big Score',
];
export function missionTitle(i) { return TITLES[i] || ''; }

export function startMission(state) {
  const m = state.missions;
  if (m.active || m.done >= TITLES.length) return;
  const i = m.done;
  m.active = true; m.index = i; m.killed = 0; m.holdT = 0; m.wave = 0;
  state.banner(missionTitle(i).toUpperCase(), 'Job ' + (i + 1) + ' of 10 — for Mona Reyes');
  const S = LANDMARKS.safehouse, B = LANDMARKS.bank, C = LANDMARKS.chop, H = LANDMARKS.hotel;
  if (i === 0) {
    m.stage = 'go';
    setTarget(state, ALLEY.x, ALLEY.z, 'First Pickup — meet Mona\'s contact in the Old Town');
  } else if (i === 1) {
    m.stage = 'go';
    const comet = makeCar('coupe', 0xff2e88, H.x + 10, H.z + 31, 1.2);
    state.scene.add(comet.mesh);
    state.allCars.push(comet);
    m.car = comet;
    setTarget(state, comet.pos.x, comet.pos.z, 'Hot Wheels — steal the pink Comet at the Lagoon Hotel');
  } else if (i === 2) {
    givePistol(state, 60);
    m.stage = 'go';
    setTarget(state, ALLEY.x, ALLEY.z, 'Alley Cats — the Vultures are waiting in the Old Town');
  } else if (i === 3) {
    m.stage = 'go';
    const d = doorOf(S);
    setTarget(state, d.x, d.z, 'The Getaway — get to the safehouse. The heat comes when you move');
  } else if (i === 4) {
    givePistol(state, 60);
    m.stage = 'go';
    setTarget(state, LANDMARKS.pier.x, LANDMARKS.pier.z - 20, 'Pier Pressure — a deal at the end of the pier');
  } else if (i === 5) {
    givePistol(state, 80);
    m.stage = 'defend'; m.need = 6;
    const d = doorOf(S);
    setTarget(state, d.x, d.z, 'Home Defence — hold the safehouse, wave one incoming');
    spawnGang(state, S.x + 26, S.z + 20, 2);
  } else if (i === 6) {
    m.stage = 'go';
    const d = doorOf(B);
    setTarget(state, d.x, d.z, 'Night Deposit — get inside the bank marker and hold');
  } else if (i === 7) {
    m.stage = 'checkpoints'; m.step = 0; m.timer = 115;
    const cp = CHECKPOINTS[0];
    setTarget(state, cp.x, cp.z, 'Neon Run — hit every neon checkpoint before the clock dies');
    state.toast('Neon Run: you need a car');
  } else if (i === 8) {
    m.stage = 'intercept';
    const van = makeCar('van', 0x707880, -240, -240, Math.PI / 2);
    van.driver = 'traffic'; van.axis = 'x'; van.dir = 1; van.laneAt = -236; van.cruise = 13;
    van.pos.set(-240, 0, -236);
    state.scene.add(van.mesh);
    state.allCars.push(van);
    state.traffic.push(van);
    m.van = van; m.vanHitCd = 0;
    setTarget(state, van.pos.x, van.pos.z, 'Armoured Van — ram it until it stops, then take the score');
  } else if (i === 9) {
    givePistol(state, 120);
    m.stage = 'go';
    const d = doorOf(B);
    setTarget(state, d.x, d.z, 'The Big Score — the Solmar Bank. Hold the lobby, then run');
  }
}

function completeMission(state, pay, text) {
  const m = state.missions;
  m.active = false; m.index = -1; m.done++;
  clearTarget(state);
  state.addMoney(pay);
  state.audio.missionDone();
  state.banner('JOB DONE', `${text} +$${pay}`);
  if (m.done >= TITLES.length) {
    m.storyDone = true;
    state.banner('STORY COMPLETE', 'Jax Moreno owns the night — free roam, the city is yours');
  }
  state.saveGame();
}

function failMission(state, why) {
  const m = state.missions;
  m.active = false; m.index = -1;
  clearTarget(state);
  if (m.car && m.car.driver !== 'player') { /* the Comet stays where it lies */ }
  state.toast(`Job failed — ${why}. Press M to retry`);
}

function atTarget(state, r) {
  const m = state.missions;
  if (!m.target) return false;
  return dist2D(state.player.pos.x, state.player.pos.z, m.target.x, m.target.z) < r;
}

export function updateMissions(state, dt) {
  // Token spin + collection, story or not.
  for (const t of state.tokens) {
    if (t.taken) continue;
    t.mesh.rotation.y += dt * 2.4;
    t.mesh.position.y = 1 + Math.sin(state.time * 2.6 + t.i) * 0.16;
    if (dist2D(state.player.pos.x, state.player.pos.z, t.x, t.z) < 2.4) {
      t.taken = true;
      state.scene.remove(t.mesh);
      state.addMoney(25);
      state.audio.pickup();
      const left = state.tokens.filter((k) => !k.taken).length;
      state.toast(left ? `Golden token! ${left} still hidden` : 'Every golden token found!');
      state.saveGame();
    }
  }
  if (ring.visible) ring.rotation.z += dt * 0.8;
  updateSide(state, dt);
  const m = state.missions;
  if (!m.active) return;
  const p = state.player;
  const S = LANDMARKS.safehouse, C = LANDMARKS.chop;
  if (m.timer > 0) {
    m.timer -= dt;
    state.setObjective(state.objective.replace(/ \(\d+s\)$/, '') + ` (${Math.ceil(m.timer)}s)`);
    if (m.timer <= 0) { failMission(state, 'out of time'); return; }
  }
  switch (m.index) {
    case 0:
      if (m.stage === 'go' && atTarget(state, 4)) {
        m.stage = 'deliver';
        const d = doorOf(S);
        setTarget(state, d.x, d.z, 'First Pickup — take the package to the safehouse');
        state.toast('Package in hand');
      } else if (m.stage === 'deliver' && atTarget(state, 5)) completeMission(state, 150, 'First Pickup.');
      break;
    case 1:
      if (m.stage === 'go') {
        setTarget(state, m.car.pos.x, m.car.pos.z, 'Hot Wheels — steal the pink Comet at the Lagoon Hotel');
        state.marker = { visible: true, x: m.car.pos.x, z: m.car.pos.z };
        if (p.inCar && p.car === m.car) {
          m.stage = 'deliver';
          const d = doorOf(C);
          setTarget(state, d.x, d.z, 'Hot Wheels — fence the Comet at Reyes Chop Shop');
        }
      } else if (m.stage === 'deliver' && atTarget(state, 7) && p.inCar && p.car === m.car) {
        state.exitCar();
        state.scene.remove(m.car.mesh);
        state.allCars = state.allCars.filter((c) => c !== m.car);
        completeMission(state, 300, 'Hot Wheels.');
      }
      break;
    case 2:
      if (m.stage === 'go' && atTarget(state, 9)) {
        m.stage = 'kill'; m.need = 4;
        spawnGang(state, ALLEY.x - 6, ALLEY.z + 16, 4);
        state.setObjective('Alley Cats — clear out the Vultures, 0 of 4');
      } else if (m.stage === 'kill') {
        state.setObjective(`Alley Cats — clear out the Vultures, ${m.killed} of 4`);
        if (m.killed >= 4) completeMission(state, 350, 'Alley Cats.');
      }
      break;
    case 3:
      if (m.stage === 'go') {
        if (p.inCar && Math.abs(p.car.speed) > 4 && state.wanted === 0) {
          state.addWanted(3, 'the getaway');
          m.stage = 'escape'; m.timer = 50;
          state.setObjective('The Getaway — reach the safehouse');
        }
      } else if (m.stage === 'escape' && atTarget(state, 6)) completeMission(state, 400, 'The Getaway.');
      break;
    case 4:
      if (m.stage === 'go' && atTarget(state, 8)) {
        m.stage = 'kill'; m.need = 5;
        spawnGang(state, LANDMARKS.pier.x - 4, LANDMARKS.pier.z - 34, 5);
        state.setObjective('Pier Pressure — the deal went loud, 0 of 5');
      } else if (m.stage === 'kill') {
        state.setObjective(`Pier Pressure — the deal went loud, ${m.killed} of 5`);
        if (m.killed >= 5) {
          m.stage = 'escape';
          state.addWanted(2, 'the pier shootout');
          const d = doorOf(LANDMARKS.garage);
          setTarget(state, d.x, d.z, 'Pier Pressure — lose the heat at Mona\'s Garage');
        }
      } else if (m.stage === 'escape' && atTarget(state, 6)) completeMission(state, 500, 'Pier Pressure.');
      break;
    case 5:
      if (m.stage === 'defend') {
        state.setObjective(`Home Defence — Vultures down: ${m.killed} of 6`);
        if (m.killed === 2 && m.wave === 0) { m.wave = 1; spawnGang(state, S.x - 24, S.z + 26, 2); state.toast('Wave two!'); }
        if (m.killed === 4 && m.wave === 1) { m.wave = 2; spawnGang(state, S.x + 20, S.z - 24, 2); state.toast('Final wave!'); }
        if (m.killed >= 6) completeMission(state, 550, 'Home Defence.');
      }
      break;
    case 6:
      if (m.stage === 'go' && atTarget(state, 6) && !p.inCar) {
        m.stage = 'hold'; m.holdT = 5;
        state.setObjective('Night Deposit — hold your ground…');
      } else if (m.stage === 'hold') {
        if (!atTarget(state, 7)) { m.stage = 'go'; }
        else {
          m.holdT -= dt;
          state.setObjective(`Night Deposit — cracking the vault, ${Math.ceil(m.holdT)}…`);
          if (m.holdT <= 0) {
            m.stage = 'escape';
            state.addWanted(3, 'the bank job');
            dropPickup(state, p.pos.x + 2, p.pos.z + 2, 'cash', 220);
            const d = doorOf(S);
            setTarget(state, d.x, d.z, 'Night Deposit — get the take to the safehouse');
          }
        }
      } else if (m.stage === 'escape' && atTarget(state, 6)) completeMission(state, 650, 'Night Deposit.');
      break;
    case 7:
      if (m.stage === 'checkpoints') {
        const cp = CHECKPOINTS[m.step];
        if (p.inCar && dist2D(p.pos.x, p.pos.z, cp.x, cp.z) < 9) {
          m.step++;
          state.audio.pickup();
          if (m.step >= CHECKPOINTS.length) { completeMission(state, 600, 'Neon Run.'); break; }
          const nx = CHECKPOINTS[m.step];
          setTarget(state, nx.x, nx.z, `Neon Run — checkpoint ${m.step + 1} of ${CHECKPOINTS.length}`);
        }
      }
      break;
    case 8:
      if (m.stage === 'intercept' && m.van) {
        const van = m.van;
        setTarget(state, van.pos.x, van.pos.z, `Armoured Van — ram it until it stops (armour ${Math.max(0, Math.ceil(van.health))})`);
        state.marker = { visible: true, x: van.pos.x, z: van.pos.z };
        m.vanHitCd -= dt;
        if (p.inCar && m.vanHitCd <= 0 && dist2D(p.pos.x, p.pos.z, van.pos.x, van.pos.z) < 4.4 && Math.abs(p.car.speed) > 7) {
          van.health -= Math.abs(p.car.speed) * 2.6;
          m.vanHitCd = 0.5;
          state.effects.burst(van.pos.x, 1, van.pos.z, 10, 0xffcf6e, 3.4);
          state.shake = 0.3;
          state.audio.gunshot(0.1);
          if (van.health <= 0 && !van.dead) {
            van.dead = true; van.driver = null; van.speed = 0;
            state.traffic = state.traffic.filter((c) => c !== van);
            m.stage = 'grab';
            setTarget(state, van.pos.x, van.pos.z, 'Armoured Van — it\'s stopped! Take the score on foot');
          }
        }
      } else if (m.stage === 'grab' && !p.inCar && dist2D(p.pos.x, p.pos.z, m.van.pos.x, m.van.pos.z) < 3.4) {
        m.stage = 'escape';
        state.addWanted(4, 'the armoured van');
        state.addMoney(300);
        const d = doorOf(C);
        setTarget(state, d.x, d.z, 'Armoured Van — get to Reyes Chop Shop');
        state.toast('Score in hand — run!');
      } else if (m.stage === 'escape' && atTarget(state, 7)) completeMission(state, 800, 'Armoured Van.');
      break;
    case 9:
      if (m.stage === 'go' && atTarget(state, 6) && !p.inCar) {
        m.stage = 'hold'; m.holdT = 8;
        state.addWanted(4, 'the big score');
        state.setObjective('The Big Score — hold the lobby…');
      } else if (m.stage === 'hold') {
        if (!atTarget(state, 8)) m.holdT = Math.min(m.holdT + dt * 0.5, 8);
        else {
          m.holdT -= dt;
          state.setObjective(`The Big Score — vault crew working, ${Math.ceil(m.holdT)}…`);
          if (m.holdT <= 0) {
            m.stage = 'escape';
            const d = doorOf(S);
            setTarget(state, d.x, d.z, 'The Big Score — get it all to the safehouse');
          }
        }
      } else if (m.stage === 'escape' && atTarget(state, 6)) completeMission(state, 1200, 'The Big Score.');
      break;
  }
}

// --- side economies --------------------------------------------------------------
function updateSide(state, dt) {
  const p = state.player;
  const side = state.side;
  // Chop Shop fencing: any stolen car delivered here sells — except
  // the car a story job is riding on, which the job itself pays for.
  if (p.inCar && p.car && p.car.stolen && !(state.missions.active && state.missions.car === p.car)) {
    const C = doorOf(LANDMARKS.chop);
    if (dist2D(p.pos.x, p.pos.z, C.x, C.z) < 9) {
      const car = p.car;
      const price = car.kind === 'coupe' ? 260 : car.kind === 'truck' ? 300 : 170;
      state.exitCar();
      state.scene.remove(car.mesh);
      state.allCars = state.allCars.filter((c) => c !== car);
      if (state.traffic.includes(car)) state.traffic = state.traffic.filter((c) => c !== car);
      state.addMoney(price);
      state.audio.cash();
      state.toast(`Fenced at the Chop Shop +$${price}`);
      state.saveGame();
      return;
    }
  }
  if (!side.kind) return;
  if (side.timer > 0) {
    side.timer -= dt;
    if (side.timer <= 0) {
      state.toast(side.kind === 'taxi' ? 'Fare walked away' : 'Job timed out');
      side.kind = null; clearTarget(state);
      state.setObjective('Free roam — M job · T courier · G race · Y taxi');
      return;
    }
  }
  const t = side.target;
  if (!t) return;
  showMarker(t.x, t.z);
  state.marker = { visible: true, x: t.x, z: t.z };
  const d = dist2D(p.pos.x, p.pos.z, t.x, t.z);
  if (side.kind === 'courier' && d < 6 && p.inCar) {
    state.addMoney(side.fare);
    state.audio.cash();
    state.toast(`Courier delivered +$${side.fare}`);
    side.kind = null; clearTarget(state); state.saveGame();
  } else if (side.kind === 'race' && d < 9 && p.inCar) {
    side.step++;
    state.audio.pickup();
    if (side.step >= CHECKPOINTS.length) {
      state.addMoney(320);
      state.audio.cash();
      state.toast('Race won! +$320');
      side.kind = null; clearTarget(state); state.saveGame();
    } else {
      const nx = CHECKPOINTS[side.step];
      side.target = nx;
      state.setObjective(`Street race — checkpoint ${side.step + 1} of ${CHECKPOINTS.length} (${Math.ceil(side.timer)}s)`);
    }
  } else if (side.kind === 'taxi') {
    if (side.stage === 'pickup' && d < 6 && p.inCar && Math.abs(p.car.speed) < 1.5) {
      side.stage = 'drop';
      const dx = randRange(state.rng, -240, 240), dz = randRange(state.rng, -240, 200);
      side.target = { x: dx, z: dz };
      side.timer = 55;
      state.setObjective('Taxi — drop your fare at the marker');
      state.toast('Fare aboard — step on it for a tip');
    } else if (side.stage === 'drop' && d < 6 && p.inCar && Math.abs(p.car.speed) < 1.5) {
      const tip = Math.round(side.timer * 1.6);
      state.addMoney(60 + tip);
      state.audio.cash();
      state.taxi.done++;
      state.toast(`Taxi fare $60 + $${tip} tip`);
      side.kind = null; clearTarget(state); state.saveGame();
    }
  }
}

export function startCourier(state) {
  if (state.side.kind || state.missions.active) return;
  const x = randRange(state.rng, -260, 260), z = randRange(state.rng, -260, 220);
  const d = dist2D(state.player.pos.x, state.player.pos.z, x, z);
  state.side = { kind: 'courier', stage: 'go', target: { x, z }, timer: Math.max(35, d * 0.55), step: 0, fare: 90 + Math.round(d * 0.35) };
  state.setObjective('Courier — deliver the package (car required)');
}

export function startRace(state) {
  if (state.side.kind || state.missions.active || !state.player.inCar) {
    if (!state.player.inCar) state.toast('Street race: get in a car first');
    return;
  }
  state.side = { kind: 'race', stage: 'go', target: CHECKPOINTS[0], timer: 130, step: 0, fare: 0 };
  state.setObjective('Street race — checkpoint 1 of ' + CHECKPOINTS.length);
}

export function startTaxi(state) {
  if (state.side.kind || state.missions.active || !state.player.inCar) {
    if (!state.player.inCar) state.toast('Taxi: you need a car to pick up a fare');
    return;
  }
  // The fare waits at a random pavement point across town.
  const x = randRange(state.rng, -260, 260), z = randRange(state.rng, -260, 220);
  state.side = { kind: 'taxi', stage: 'pickup', target: { x, z }, timer: 60, step: 0, fare: 0 };
  state.setObjective('Taxi — pick up the fare at the marker');
}
