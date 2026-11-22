// city.js — Solmar City itself: the grid, the buildings with their
// painted and neon signs, palms, lamps, the beach, the pier and the
// sea. Everything visual that never moves lives here, plus the
// blocker list the collision code asks about.
//
// Facades are canvas textures painted once at boot: a wall colour, a
// grid of windows (many lit — it is dusk in Solmar), and for the
// landmarks a sign band with the building's name. Six generic facades
// are shared across the whole grid so the city costs a handful of
// textures, not hundreds.
import * as THREE from 'three';
import { PITCH, ROAD_W, BLOCKS, HALF, SEA_Z, makeRng, randRange, randPick, clamp } from './utils.js';

export const LANDMARKS = {};   // filled by buildCity: name -> {x, z}

const WALL_TONES = [0xc9b8a3, 0xb7c4c9, 0xd9c9a8, 0xc4a7a0, 0xaebfae, 0xd3d7e0, 0xbfae90, 0xc9a3b8];
const NEON_SIGNS = [
  ['CLUB NEON', '#ff4fd8'], ['BAR SOLMAR', '#37e0ff'], ['DINER 24H', '#ffb347'],
  ['HOTEL MAR', '#ff6b6b'], ['PALMS CASINO', '#b98cff'], ['SURF SHOP', '#4dffb8'],
  ['LIQUOR', '#ffe14d'], ['TATTOO', '#ff4f7a'], ['RAMEN YA', '#7ae0ff'], ['GYM 24/7', '#a8ff4d'],
];

function facadeTexture(rng, tone, sign) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const col = '#' + tone.toString(16).padStart(6, '0');
  g.fillStyle = col; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 244, 128, 12);      // pavement shadow line
  const cols = 4, rows = 9;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.46;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#fff3c4') : 'rgba(24,28,44,0.85)';
      g.fillRect(10 + x * 29, 26 + y * 24, 18, 14);
    }
  }
  if (sign) {
    g.fillStyle = sign.bg; g.fillRect(0, 0, 128, 24);
    g.fillStyle = sign.fg; g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sign.text, 64, 13);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#33333d'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8e4da'; g.fillRect(2, 0, 3, 64); g.fillRect(59, 0, 3, 64);  // kerb lines
  g.fillStyle = '#ffd24a'; g.fillRect(30, 4, 4, 22);                            // centre dash
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function palmTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#2e8b57'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath(); g.moveTo(64, 70);
    g.quadraticCurveTo(64 + Math.cos(a) * 34, 70 + Math.sin(a) * 20 - 16, 64 + Math.cos(a) * 58, 70 + Math.sin(a) * 30 + 12);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Block centre for block index (bx, bz), 0-based from the north-west.
export function blockCentre(bx, bz) {
  return { x: -HALF + bx * PITCH + PITCH / 2, z: -HALF + bz * PITCH + PITCH / 2 };
}

export function buildCity(state) {
  const rng = makeRng(20261);
  const scene = state.scene;
  state.blockers = [];

  // --- sky, light, sea air -------------------------------------------------
  scene.background = new THREE.Color(0x2c2140);
  scene.fog = new THREE.Fog(0x4a3560, 260, 900);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.5);
  sun.position.set(-160, 190, 260);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8f7fd4, 0x2e2a3a, 0.85));
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(16, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false }));
  sunBall.position.set(-320, 120, 620);
  scene.add(sunBall);

  // --- ground, roads --------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH * BLOCKS + 320, PITCH * BLOCKS + 320),
    new THREE.MeshLambertMaterial({ color: 0x8d8578 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.06, 60);
  scene.add(ground);

  const roadTex = roadTexture();
  const roadMatNS = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeoNS = new THREE.PlaneGeometry(ROAD_W, PITCH * BLOCKS + ROAD_W);
  const roadMatEW = roadMatNS.clone();
  for (let k = 0; k <= BLOCKS; k++) {
    const at = -HALF + k * PITCH;
    const ns = new THREE.Mesh(roadGeoNS, roadMatNS);
    ns.rotation.x = -Math.PI / 2; ns.position.set(at, 0, 0);
    ns.material.map.repeat.set(1, (PITCH * BLOCKS) / 8);
    scene.add(ns);
    const ew = new THREE.Mesh(roadGeoNS, roadMatEW);
    ew.rotation.x = -Math.PI / 2; ew.rotation.z = Math.PI / 2; ew.position.set(0, 0.005, at);
    scene.add(ew);
  }

  // --- buildings --------------------------------------------------------------
  const facades = WALL_TONES.map((t) => facadeTexture(rng, t, null));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const landmarkAt = {
    '4,1': { name: 'tower', label: 'SOLMAR TOWER', bg: '#1c1440', fg: '#ffd24a', h: 96 },
    '5,4': { name: 'bank', label: 'SOLMAR BANK', bg: '#20301e', fg: '#ffe9a8', h: 30 },
    '2,7': { name: 'chop', label: 'REYES CHOP SHOP', bg: '#401616', fg: '#ff9a5c', h: 12 },
    '7,6': { name: 'garage', label: "MONA'S GARAGE", bg: '#14303a', fg: '#7ae0ff', h: 13 },
    '3,3': { name: 'safehouse', label: 'SAFEHOUSE', bg: '#2c2c34', fg: '#cfc8e8', h: 10 },
    '6,8': { name: 'hotel', label: 'LAGOON HOTEL', bg: '#3a1440', fg: '#ff9ad4', h: 34 },
    '8,2': { name: 'hospital', label: 'ST BRISA HOSPITAL', bg: '#e8e8e8', fg: '#d43a3a', h: 26 },
    '1,4': { name: 'precinct', label: 'SOLMAR PD', bg: '#14213d', fg: '#a8c8ff', h: 18 },
  };
  let neonIdx = 0;
  for (let bx = 0; bx < BLOCKS; bx++) {
    for (let bz = 0; bz < BLOCKS; bz++) {
      const key = bx + ',' + bz;
      const c = blockCentre(bx, bz);
      const lm = landmarkAt[key];
      if (lm) {
        const tex = facadeTexture(rng, 0xcfc4b0, { text: lm.label, bg: lm.bg, fg: lm.fg });
        const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex }));
        const w = lm.name === 'tower' ? 26 : 36;
        m.scale.set(w, lm.h, w);
        m.position.set(c.x, lm.h / 2, c.z);
        scene.add(m);
        state.blockers.push({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - w / 2, maxZ: c.z + w / 2 });
        LANDMARKS[lm.name] = { x: c.x, z: c.z };
        addRoofProps(state, rng, c.x, c.z, w, lm.h);
        continue;
      }
      if ((bx * 7 + bz * 13) % 17 === 0) continue;   // the odd plaza / car park block stays open
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = randRange(rng, 13, 20), d = randRange(rng, 13, 20);
        const h = randRange(rng, 10, 44) * (rng() < 0.12 ? 1.7 : 1);
        const ox = n === 1 ? 0 : randRange(rng, -11, 11);
        const oz = n === 1 ? 0 : randRange(rng, -11, 11);
        let sign = null;
        if (rng() < 0.16 && neonIdx < NEON_SIGNS.length * 2) {
          const s = NEON_SIGNS[neonIdx++ % NEON_SIGNS.length];
          sign = { text: s[0], bg: '#120e24', fg: s[1] };
        }
        const tex = sign ? facadeTexture(rng, randPick(rng, WALL_TONES), sign)
                         : randPick(rng, facades);
        const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ map: tex }));
        m.scale.set(w, h, d);
        m.position.set(c.x + ox, h / 2, c.z + oz);
        scene.add(m);
        state.blockers.push({
          minX: c.x + ox - w / 2, maxX: c.x + ox + w / 2,
          minZ: c.z + oz - d / 2, maxZ: c.z + oz + d / 2,
        });
        if (h > 20 && rng() < 0.5) addRoofProps(state, rng, c.x + ox, c.z + oz, Math.min(w, d), h);
      }
    }
  }

  // --- palms and lamps --------------------------------------------------------
  const palmTex = palmTexture();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const frondMat = new THREE.MeshLambertMaterial({ map: palmTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.4 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 5);
  const frondGeo = new THREE.PlaneGeometry(7.5, 7.5);
  for (let i = 0; i < 130; i++) {
    const alongAvenue = rng() < 0.5;
    const k = Math.floor(rng() * (BLOCKS + 1));
    const t = randRange(rng, -HALF, HALF);
    const side = rng() < 0.5 ? -1 : 1;
    const x = alongAvenue ? -HALF + k * PITCH + side * (ROAD_W / 2 + 1.6) : t;
    const z = alongAvenue ? t : -HALF + k * PITCH + side * (ROAD_W / 2 + 1.6);
    if (Math.abs(x) > HALF + 4 || z > HALF - 2) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.2, z);
    trunk.rotation.z = randRange(rng, -0.09, 0.09);
    scene.add(trunk);
    const fronds = new THREE.Mesh(frondGeo, frondMat);
    fronds.position.set(x, 6.9, z);
    fronds.rotation.set(-Math.PI / 2.6, rng() * Math.PI, 0);
    scene.add(fronds);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const lampGeo = new THREE.SphereGeometry(0.42, 6, 6);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5);
  for (let k = 0; k <= BLOCKS; k += 1) {
    for (let j = 0; j <= BLOCKS; j += 2) {
      const x = -HALF + k * PITCH + ROAD_W / 2 + 1.1;
      const z = -HALF + j * PITCH + ROAD_W / 2 + 1.1;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.7, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(lampGeo, lampMat);
      bulb.position.set(x, 5.5, z);
      scene.add(bulb);
    }
  }

  // --- beach, pier, sea, hills, clouds -----------------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH * BLOCKS + 320, SEA_Z - HALF + 60),
    new THREE.MeshLambertMaterial({ color: 0xe3cf9e }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (HALF + SEA_Z + 30) / 2);
  scene.add(sand);

  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b46 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 74), pierMat);
  pier.position.set(30, 0.6, SEA_Z + 22);
  scene.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 6), pierMat);
    post.position.set(30 + (i % 2 ? 4 : -4), -0.4, SEA_Z - 4 + Math.floor(i / 2) * 26);
    scene.add(post);
  }
  LANDMARKS.pier = { x: 30, z: SEA_Z + 40 };
  LANDMARKS.beach = { x: -60, z: HALF + 20 };

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 700),
    new THREE.MeshLambertMaterial({ color: 0x1d5f7a, transparent: true, opacity: 0.94 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.12, SEA_Z + 320);
  scene.add(sea);
  state.sea = sea;

  const hillMat = new THREE.MeshLambertMaterial({ color: 0x4c4258 });
  for (let i = 0; i < 7; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(randRange(rng, 90, 170), randRange(rng, 50, 110), 7), hillMat);
    hill.position.set(-560 + i * 180, 0, -HALF - 190 - (i % 3) * 60);
    scene.add(hill);
  }
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf7e8ff, transparent: true, opacity: 0.5, fog: false });
  state.clouds = [];
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 18, 40), 8, 6), cloudMat);
    cl.scale.y = 0.32;
    cl.position.set(randRange(rng, -600, 600), randRange(rng, 130, 190), randRange(rng, -500, 500));
    scene.add(cl);
    state.clouds.push(cl);
  }
  return LANDMARKS;
}

function addRoofProps(state, rng, x, z, w, h) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x6a6f78 });
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    if (rng() < 0.4) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 3.4, 8), mat);
      tower.position.set(x + randRange(rng, -w / 4, w / 4), h + 1.7, z + randRange(rng, -w / 4, w / 4));
      state.scene.add(tower);
    } else {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2), mat);
      ac.position.set(x + randRange(rng, -w / 4, w / 4), h + 0.6, z + randRange(rng, -w / 4, w / 4));
      state.scene.add(ac);
    }
  }
}

// Resolve a circle (the mover) out of every building blocker and keep
// it inside the world. Mutates pos, returns true if it hit anything.
export function collideWorld(state, pos, radius) {
  let hit = false;
  for (const b of state.blockers) {
    if (pos.x > b.minX - radius && pos.x < b.maxX + radius &&
        pos.z > b.minZ - radius && pos.z < b.maxZ + radius) {
      const dxl = pos.x - (b.minX - radius), dxr = (b.maxX + radius) - pos.x;
      const dzl = pos.z - (b.minZ - radius), dzr = (b.maxZ + radius) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = b.minX - radius;
      else if (m === dxr) pos.x = b.maxX + radius;
      else if (m === dzl) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
      hit = true;
    }
  }
  pos.x = clamp(pos.x, -HALF - 30, HALF + 30);
  pos.z = clamp(pos.z, -HALF - 30, SEA_Z + 52);
  return hit;
}
