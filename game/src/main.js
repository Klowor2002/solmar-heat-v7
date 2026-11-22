// main.js — boot and the loop: builds the world, owns the shared
// state every module reads, takes the input, and steps the city.
//
// State is one plain object passed everywhere. Systems live in their
// own modules; this file only wires them: player, traffic, police,
// gang, missions, effects, audio, HUD, save — and the staged-shot
// entry point the screenshots are taken through.
import * as THREE from 'three';
import { makeRng, clamp, dist2D } from './utils.js';
import { buildCity } from './city.js';
import { spawnTraffic, updateTraffic, makeCar } from './vehicles.js';
import { spawnPeds, updatePeds, carHitsPed } from './peds.js';
import { makePlayer, updatePlayer, updateCamera, addLook, nearestCar, enterCar, exitCar } from './player.js';
import { initCombat, updateCombat, updateGang, tryShoot, startReload } from './combat.js';
import { initPolice, updatePolice } from './police.js';
import { initMissions, updateMissions, startMission, startCourier, startRace, startTaxi } from './missions.js';
import { makeEffects } from './effects.js';
import { makeAudio } from './audio.js';
import * as hud from './hud.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1);

const state = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1600),
  renderer: null,
  rng: makeRng(1000 + seed),
  time: 0, clockMin: 19 * 60 + 20,
  screen: 'title', paused: false, frozen: false,
  shotName: null, shotCamera: null, camMode: 'foot',
  money: 0, objective: '', radioOn: true,
  player: null, allCars: [], traffic: [], copCars: [], footCops: [],
  gang: [], pickups: [], peds: [], tokens: [], blockers: [],
  shake: 0, hurtFlash: 0, threat: null, errors: [],
  lastHitWanted: -9,
  setObjective(t) { state.objective = t; },
  toast(t) { hud.toast(state, t); },
  banner(t, x) { hud.banner(state, t, x); },
  addMoney(n) { state.money += n; if (n > 0) state.audio.cash(); },
  saveGame() { storeSave(state); },
  exitCar() { exitCar(state); },
  updateTrafficOnly(dt) { updateTraffic(state, dt); },
  updatePedsOnly(dt) { updatePeds(state, dt); },
  updateGangOnly(dt) { updateGang(state, dt); },
  gameOver(kind) { gameOver(kind); },
};

window.addEventListener('error', (e) => {
  state.errors.push(String(e.message || e.error || 'unknown'));
});

// --- boot ----------------------------------------------------------------------
state.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
state.renderer.setSize(innerWidth, innerHeight);
state.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
document.getElementById('game').appendChild(state.renderer.domElement);
addEventListener('resize', () => {
  state.camera.aspect = innerWidth / innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(innerWidth, innerHeight);
});

buildCity(state);
state.effects = makeEffects(state);
state.audio = makeAudio(state);
state.player = makePlayer(state);
initCombat(state);
initPolice(state);
initMissions(state);
spawnTraffic(state, 26);
spawnPeds(state, 34);
hud.initHud();

// A starter car waits at the kerb south of the safehouse — clear of
// the building's 36x36 footprint, a short walk from the spawn point.
const starter = makeCar('sedan', 0x3d7ad9, -80, -64, 1.35);
state.scene.add(starter.mesh);
state.allCars.push(starter);
state.starterCar = starter;
state.player.pos.set(-90, 0, -70);

// --- input -----------------------------------------------------------------------
const keys = {};
let pointerLocked = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  state.audio.unlock();
  if (state.screen !== 'game') return;
  if (e.code === 'KeyE') {
    if (state.player.inCar) exitCar(state);
    else { const car = nearestCar(state, 3.4); if (car) enterCar(state, car); }
  }
  if (e.code === 'KeyM') startMission(state);
  if (e.code === 'KeyT') startCourier(state);
  if (e.code === 'KeyG') startRace(state);
  if (e.code === 'KeyY') startTaxi(state);
  if (e.code === 'Digit1') state.weapon = 'fists';
  if (e.code === 'Digit2' && state.reserve + state.ammo > 0) state.weapon = 'pistol';
  if (e.code === 'KeyR') startReload(state);
  if (e.code === 'KeyH' && state.player.inCar) state.audio.horn();
  if (e.code === 'Escape') togglePause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === state.renderer.domElement;
});
state.renderer.domElement.addEventListener('click', () => {
  state.audio.unlock();
  if (state.screen === 'game' && !state.player.inCar && !pointerLocked) {
    state.renderer.domElement.requestPointerLock();
  } else if (state.screen === 'game') {
    tryShoot(state);
  }
});
addEventListener('mousemove', (e) => {
  if (pointerLocked && state.screen === 'game') addLook(state.player, e.movementX, e.movementY);
});

function readInput() {
  return {
    forward: !!keys.KeyW || !!keys.ArrowUp,
    back: !!keys.KeyS || !!keys.ArrowDown,
    left: !!keys.KeyA || !!keys.ArrowLeft,
    right: !!keys.KeyD || !!keys.ArrowRight,
    sprint: !!keys.ShiftLeft || !!keys.ShiftRight,
    jump: !!keys.Space,
    gas: !!keys.KeyW || !!keys.ArrowUp,
    brake: !!keys.KeyS || !!keys.ArrowDown,
    handbrake: !!keys.Space,
  };
}

// --- screens ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function showScreen(id) {
  for (const s of ['title-screen', 'pause-screen', 'end-screen']) {
    $(s).style.display = s === id ? 'flex' : 'none';
  }
  hud.showHud(id === null);
}
function beginGame(fresh) {
  if (fresh) {
    clearSave();
    state.money = 0;
    state.missions.done = 0;
  } else {
    const s = loadSave();
    if (s) {
      state.money = s.money;
      state.missions.done = s.missionsDone;
      state.missions.storyDone = s.storyDone;
      state.taxi.done = s.taxiDone;
      for (const t of state.tokens) {
        if (s.tokens.includes(t.i)) {
          t.taken = true;
          state.scene.remove(t.mesh);
        }
      }
      if (s.pos && !state.missions.storyDone) state.player.pos.set(s.pos.x, 0, s.pos.z);
    }
  }
  state.screen = 'game';
  showScreen(null);
  state.setObjective(state.missions.done >= 10
    ? 'Free roam — the city is yours (T courier · G race · Y taxi)'
    : 'Press M for the next job — Mona is waiting');
  state.banner('SOLMAR CITY', 'Ten jobs between Jax and a clean life');
}
function togglePause() {
  if (state.screen === 'game') {
    state.paused = true; state.screen = 'pause';
    showScreen('pause-screen');
    document.exitPointerLock && document.exitPointerLock();
  } else if (state.screen === 'pause') {
    state.paused = false; state.screen = 'game';
    showScreen(null);
  }
}
function gameOver(kind) {
  if (state.player.dead) return;
  state.player.dead = true;
  state.screen = 'end';
  document.exitPointerLock && document.exitPointerLock();
  $('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  $('end-text').textContent = kind === 'busted'
    ? 'The Solmar PD finally got the cuffs on. The fine stings; the night goes on.'
    : 'St Brisa patched Jax up and sent the bill. The night goes on.';
  showScreen('end-screen');
}
$('new-game').addEventListener('click', () => beginGame(true));
$('continue-game').addEventListener('click', () => beginGame(false));
$('resume-game').addEventListener('click', togglePause);
$('retry-game').addEventListener('click', () => {
  state.money = Math.max(0, state.money - ($('end-title').textContent === 'BUSTED' ? Math.floor(state.money * 0.1) : 100));
  state.saveGame();
  location.reload();
});
$('title-game').addEventListener('click', () => location.reload());
if (loadSave()) $('continue-game').style.display = '';

// --- collisions between the player's car and the world of cars --------------------
function carCarCollisions(dt) {
  const mine = state.player.car;
  if (!state.player.inCar || !mine) return;
  for (const other of state.allCars) {
    if (other === mine || other.dead) continue;
    const d = dist2D(mine.pos.x, mine.pos.z, other.pos.x, other.pos.z);
    if (d < 3.1 && d > 0.001) {
      const push = (3.1 - d) / 2;
      const nx = (other.pos.x - mine.pos.x) / d, nz = (other.pos.z - mine.pos.z) / d;
      other.pos.x += nx * push; other.pos.z += nz * push;
      mine.pos.x -= nx * push; mine.pos.z -= nz * push;
      other.mesh.position.copy(other.pos);
      if (Math.abs(mine.speed) > 9) {
        state.effects.burst(other.pos.x, 0.8, other.pos.z, 8, 0xffcf6e, 3);
        state.shake = Math.min(0.45, Math.abs(mine.speed) * 0.012);
        other.health -= Math.abs(mine.speed) * 1.1;
        mine.speed *= 0.72;
        if (other.driver === 'traffic') { other.waitT = 1.2; other.speed = 0; }
        if (other.kind === 'cop') state.addWanted(1, 'ramming a cruiser');
      }
    }
  }
}

function peopleCollisions() {
  for (const car of state.allCars) {
    if (Math.abs(car.speed || 0) < 3.5) continue;
    if (carHitsPed(state, car)) {
      if (car.driver === 'player' && state.time - state.lastHitWanted > 5) {
        state.lastHitWanted = state.time;
        state.addWanted(1, 'hit and run');
      }
    }
  }
}

// --- the loop ----------------------------------------------------------------------
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  // Clamp at zero too: the first frame's rAF timestamp can predate
  // the stored clock, and a negative dt runs every decay backwards.
  let dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  if (state.frozen) {
    // A staged shot: render the frozen frame, nothing steps.
    state.renderer.render(state.scene, state.camera);
    return;
  }
  if (state.screen === 'title' || state.screen === 'end') {
    // Slow aerial drift behind the menus.
    state.time += dt;
    const t = state.time * 0.03;
    state.camera.position.set(Math.sin(t) * 210, 120, Math.cos(t) * 210);
    state.camera.lookAt(0, 0, 40);
    updateTraffic(state, dt);
    updatePeds(state, dt);
    state.effects.update(dt);
    state.renderer.render(state.scene, state.camera);
    return;
  }
  if (state.paused) { state.renderer.render(state.scene, state.camera); return; }
  state.time += dt;
  state.clockMin = (state.clockMin + dt * 0.6) % (24 * 60);
  const input = readInput();
  updatePlayer(state, dt, input);
  if (keys.Space && !state.player.inCar && state.screen === 'game') { /* jump handled in player */ }
  if ((keys.MouseDown || keys.KeyF) && !state.player.inCar) tryShoot(state);
  updateTraffic(state, dt);
  updatePolice(state, dt);
  updateGang(state, dt);
  updateCombat(state, dt);
  updateMissions(state, dt);
  updatePeds(state, dt);
  carCarCollisions(dt);
  peopleCollisions();
  state.effects.update(dt);
  // Drift smoke from a hurt player car.
  const pc = state.player.car;
  if (state.player.inCar && pc && pc.health < 45 && Math.random() < dt * 6) {
    state.effects.smoke(pc.pos.x, 1.4, pc.pos.z, 2);
  }
  for (const cl of state.clouds) {
    cl.position.x += dt * 1.1;
    if (cl.position.x > 700) cl.position.x = -700;
  }
  state.audio.update();
  updateCamera(state, dt);
  hud.updateHud(dt, state);
  state.renderer.render(state.scene, state.camera);
}
state.renderer.domElement.addEventListener('mousedown', () => { keys.MouseDown = true; });
addEventListener('mouseup', () => { keys.MouseDown = false; });

// A ?debug=1 page may reach the state from the console: the capture
// script verifies staged scenes and smoke-tests a live run with it.
if (params.has('debug')) window.__solmar = state;

// --- staged screenshots --------------------------------------------------------------
if (shotName && SHOT_NAMES.includes(shotName)) {
  state.screen = 'game';
  showScreen(null);
  // The starter sedan import lands async; shots stage on the next
  // tick so every actor exists before the scene is composed.
  setTimeout(() => stageShot(state, shotName), 60);
}
requestAnimationFrame(animate);
