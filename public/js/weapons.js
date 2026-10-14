// Silah tanımları ve 3D modelleri.
import * as THREE from 'three';
import { turretItemModel } from './turrets.js';

// type: hitscan | projectile | beam | rail | chain | teleport | melee | fractal | grapple | deploy
// slot: 0-9 tuşları; aynı tuşa tekrar basınca gruptaki sonraki silaha geçilir
export const WEAPONS = {
  pistol: {
    name: 'Tabanca', slot: 1, type: 'hitscan', dmg: 18, hs: 2, rate: 4, spread: 0.01, range: 160,
    ammo: Infinity, color: 0xffd27a, sound: 'pistol', recoil: 0.05, weight: 0,
  },
  // Yakın dövüş: Minecraft elmas kılıcı. Tabanca gibi her doğuşta hazır gelir.
  sword: {
    name: 'Elmas Kılıç', slot: 1, type: 'melee', dmg: 45, reach: 2.9, arc: 0.8, maxTargets: 3, rate: 2.2, range: 3.5,
    ammo: Infinity, color: 0x4aedd9, sound: 'swoosh', recoil: 0, weight: 0,
  },
  shotgun: {
    name: 'Pompalı Tüfek', slot: 2, type: 'hitscan', pellets: 10, dmg: 9, hs: 1.5, rate: 1.1, spread: 0.075,
    range: 60, ammo: 14, color: 0xffb060, sound: 'shotgun', recoil: 0.14, weight: 14,
  },
  minigun: {
    name: 'Minigun', slot: 2, type: 'hitscan', dmg: 8, hs: 1.5, rate: 15, spread: 0.04, range: 130,
    ammo: 180, color: 0xffe08a, sound: 'minigun', recoil: 0.018, spin: 0.35, weight: 12,
  },
  bazooka: {
    name: 'Bazuka', slot: 3, type: 'projectile', proj: 'rocket', speed: 30, grav: 0, dmg: 110, radius: 6,
    kb: 17, rate: 0.85, ammo: 6, color: 0xff6a2a, sound: 'rocket', recoil: 0.2, weight: 12,
  },
  grenade: {
    name: 'Bomba Atar', slot: 3, type: 'projectile', proj: 'grenade', speed: 23, grav: 18, dmg: 90, radius: 5,
    kb: 12, fuse: 1.6, rate: 1.4, ammo: 10, color: 0x9cff4a, sound: 'grenade', recoil: 0.1, weight: 10,
  },
  laser: {
    name: 'Lazer Işını', slot: 4, type: 'beam', dmg: 7, tick: 0.1, range: 90, ammo: 100, drain: 22,
    color: 0xff2244, sound: 'laser', weight: 12,
  },
  freeze: {
    name: 'Dondurucu Işın', slot: 4, type: 'beam', dmg: 3, tick: 0.1, range: 45, ammo: 100, drain: 20,
    color: 0x66e0ff, slow: 1.6, sound: 'freeze', weight: 9,
  },
  railgun: {
    name: 'Raylı Top', slot: 4, type: 'rail', dmg: 95, hs: 1.5, rate: 0.7, range: 260, ammo: 6,
    color: 0x3aa0ff, sound: 'rail', recoil: 0.22, weight: 9,
  },
  tesla: {
    name: 'Yıldırım Silahı', slot: 5, type: 'chain', dmg: [30, 20, 14], range: 38, cone: 0.26, chain: 11,
    rate: 2.4, ammo: 30, color: 0xb9a6ff, sound: 'tesla', recoil: 0.06, weight: 10,
  },
  blackhole: {
    name: 'Kara Delik Topu', slot: 6, type: 'projectile', proj: 'orb', speed: 15, grav: 0, ammo: 2,
    rate: 0.5, color: 0xb040ff, sound: 'orb', recoil: 0.16, weight: 5,
    bh: { dur: 4, radius: 13, pull: 30, dps: 24, coreR: 3, finalDmg: 45, finalR: 5.5 },
  },
  // Kara deliğin tersi: herkesi dışarı fırlatır, sonunda patlar
  whitehole: {
    name: 'Beyaz Delik Topu', slot: 6, type: 'projectile', proj: 'worb', speed: 15, grav: 0, ammo: 2,
    rate: 0.5, color: 0xfff1b8, sound: 'worb', recoil: 0.16, weight: 5,
    wh: { dur: 3, radius: 15, push: 36, dps: 12, coreR: 4, finalDmg: 35, finalR: 7, finalKb: 22 },
  },
  // Döne döne giden: üç testere ekseni etrafında burgu gibi döner, oyuncuların içinden geçer
  saw: {
    name: 'Sarmal Testere', slot: 5, type: 'projectile', proj: 'saw', path: 'spiral', speed: 20, grav: 0,
    blades: 3, spiralR: 0.9, omega: 13, life: 3, dmg: 26, ammo: 12, rate: 1.2,
    color: 0xd8e0ea, sound: 'saw', recoil: 0.1, weight: 10,
  },
  // Zikzak çizerek giden enerji topu; bir rakibin yakınından geçince ya da bir yere değince patlar
  zigzag: {
    name: 'Zikzak Topu', slot: 3, type: 'projectile', proj: 'zig', path: 'zigzag', speed: 26, grav: 0,
    amp: 1.2, period: 0.34, fuse: 0.9, dmg: 48, radius: 2.8, kb: 7, ammo: 10, rate: 2,
    color: 0xd4ff3a, sound: 'zig', recoil: 0.08, weight: 10,
  },
  // 3x3x3 zeka küpü el bombası: sol tık atar, sağ tık atılan tüm küpleri patlatır
  rubik: {
    name: 'Zeka Küpü Bombası', slot: 8, type: 'projectile', proj: 'rubik', speed: 15, grav: 20, dmg: 85, radius: 5.5,
    kb: 14, life: 25, rate: 1.6, ammo: 5, color: 0xff3b3b, sound: 'throw', recoil: 0.04, weight: 9,
  },
  // Tek çizgi atar; çizgi ilerledikçe ağaç gibi dallanır. Her dal isabeti ayrı hasar verir.
  fractal: {
    name: 'Fraktal Silahı', slot: 9, type: 'fractal', dmg: 20, maxHits: 4, depth: 5, len: 8, ratio: 0.78, angle: 0.55,
    range: 40, rate: 1.1, ammo: 15, color: 0x7df9ff, sound: 'fractal', recoil: 0.12, weight: 9,
  },
  // Nişangahın gösterdiği yere ışınlar
  teleport: {
    name: 'Işınlanma Silahı', slot: 7, type: 'teleport', range: 120, ammo: 8, rate: 1.1,
    color: 0x3ff0ff, sound: 'tp', recoil: 0.08, weight: 8, telefrag: 200,
  },
  // Kancalı yakalama silahı: kanca bir rakibe takılırsa onu hızla kendine çeker
  grapple: {
    name: 'Yakalama Silahı', slot: 7, type: 'grapple', dmg: 8, range: 32, rate: 0.9, ammo: 8,
    color: 0xc9a46a, sound: 'grapple', recoil: 0.06, weight: 8, pull: { speed: 24, dur: 1.4 },
  },
  // Kurulabilen taretler: sol tıkla nişangahın gösterdiği yere (en fazla range metre) kurulur
  mush: {
    name: 'Mantar Taret', slot: 0, type: 'deploy', turret: 'mush', ammo: 1, rate: 1, range: 6,
    color: 0xe8443a, sound: 'deploy', recoil: 0, weight: 6,
  },
  tully: {
    name: 'Tullimonstrum Taret', slot: 0, type: 'deploy', turret: 'tully', ammo: 1, rate: 1, range: 6,
    color: 0xb59be0, sound: 'deploy', recoil: 0, weight: 7,
  },
};

// Silah olmayan öldürme sebepleri (öldürme akışında görünen isimler)
export const KILL_NAMES = {
  moto: 'Motosiklet', chin: 'Dev Çinçilla', ham: 'Türk Avurtlağı', vboom: 'Araç Patlaması',
  anomalo: 'Anomalocaris', shellmine: 'Deniz Kabuğu Mayını', mirror: 'Kedi Tablosu',
};
let polyNames = [];
export function setPolyNames(names) { polyNames = names; }
export function killName(w) {
  if (WEAPONS[w]) return WEAPONS[w].name;
  if (typeof w === 'string' && w.startsWith('poly')) return polyNames[+w.slice(4)] || 'Gökten Düşen Cisim';
  return KILL_NAMES[w] || w;
}

// Liste / tekerlek sırası (tuş gruplarına göre)
export const WEAPON_ORDER = [
  'pistol', 'sword', 'shotgun', 'minigun', 'bazooka', 'grenade', 'zigzag', 'laser', 'freeze', 'railgun',
  'tesla', 'saw', 'blackhole', 'whitehole', 'teleport', 'grapple', 'rubik', 'fractal', 'mush', 'tully',
];

// Her doğuşta verilen, hiç bitmeyen silahlar
export const STARTER = ['pistol', 'sword'];

export function randomCrateWeapon() {
  const list = WEAPON_ORDER.filter((w) => WEAPONS[w].weight > 0);
  const total = list.reduce((s, w) => s + WEAPONS[w].weight, 0);
  let r = Math.random() * total;
  for (const w of list) {
    r -= WEAPONS[w].weight;
    if (r <= 0) return w;
  }
  return list[0];
}

export function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// ------------------------------------------------------------
// Modeller (-Z yönüne bakar)
// ------------------------------------------------------------
const matCache = {};
function lam(color) {
  return (matCache['l' + color] ||= new THREE.MeshLambertMaterial({ color }));
}
function glow(color) {
  return (matCache['g' + color] ||= new THREE.MeshBasicMaterial({ color }));
}

function add(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Z ekseni boyunca silindir (r1: arka/+Z, r2: ön/-Z)
const cylZ = (r1, r2, len, seg = 10) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2);
const torusZ = (r, t) => new THREE.TorusGeometry(r, t, 6, 14);

// Minecraft elmas kılıcı: 16x16 piksel resmin 1 piksel kalınlığında kabartması
const SWORD_PIXELS = [
  '.............KKK',
  '............KWDK',
  '...........KWDdK',
  '..........KWDdK.',
  '.........KWDdK..',
  '........KWDdK...',
  '.......KWDdK....',
  '..KK..KWDdK.....',
  '..KdKKWDdK......',
  '...KdWDdK.......',
  '...KdDdK........',
  '....KbdKK.......',
  '...KbKKdK.......',
  '.KKbK..KK.......',
  'KBbK............',
  'KKK.............',
];
const SWORD_COLORS = { K: 0x0b3d34, W: 0xb4fff2, D: 0x4aedd9, d: 0x23b39b, b: 0x6b4f2a, B: 0x4a3415 };

function mergeBoxes(list) {
  // list: BoxGeometry'ler (indeksli, konumlandırılmış) -> tek geometri
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
    vo += g.attributes.position.count;
    io += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function buildSwordPixels(px) {
  const g = new THREE.Group();
  const byColor = {};
  SWORD_PIXELS.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const b = new THREE.BoxGeometry(px, px, px * 1.2);
      b.translate((c - 7.5) * px, (7.5 - r) * px, 0);
      (byColor[ch] ||= []).push(b);
    });
  });
  for (const [ch, list] of Object.entries(byColor)) g.add(new THREE.Mesh(mergeBoxes(list), lam(SWORD_COLORS[ch])));
  return g;
}

// Zeka küpü yüzleri: 3x3 renkli çıkartma, siyah aralar (karışık dizilim)
const RUBIK_COLORS = ['#ffffff', '#ffd500', '#c41e3a', '#ff5800', '#0051ba', '#009e60'];
let rubikMats = null;
export function rubikMaterials() {
  if (rubikMats) return rubikMats;
  rubikMats = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 9; i++) {
      // Merkez kendi rengi, diğerleri karışık
      const col = i === 4 ? RUBIK_COLORS[f] : RUBIK_COLORS[(f * 7 + i * 5 + (i * i) % 4) % 6];
      x.fillStyle = col;
      const r = Math.floor(i / 3), k = i % 3;
      x.beginPath();
      x.roundRect ? x.roundRect(4 + k * 31, 4 + r * 31, 27, 27, 5) : x.rect(4 + k * 31, 4 + r * 31, 27, 27);
      x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    rubikMats.push(new THREE.MeshLambertMaterial({ map: t }));
  }
  return rubikMats;
}

export function buildWeaponModel(id) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let spin = null;
  const glows = [];
  const DARK = lam(0x2b2e33), BLACK = lam(0x18191b), METAL = lam(0x5a6068), WOOD = lam(0x7a4a22);

  switch (id) {
    case 'pistol':
      add(g, box(0.06, 0.07, 0.26), DARK, 0, 0.03, -0.1);
      add(g, box(0.05, 0.15, 0.075), BLACK, 0, -0.06, 0.0, 0.25);
      add(g, cylZ(0.016, 0.016, 0.04), METAL, 0, 0.03, -0.24);
      add(g, box(0.012, 0.02, 0.02), lam(0xffd27a), 0, 0.075, -0.2);
      muzzle.position.set(0, 0.03, -0.27);
      break;
    case 'shotgun':
      add(g, cylZ(0.025, 0.025, 0.7), METAL, 0, 0.035, -0.35);
      add(g, cylZ(0.02, 0.02, 0.5), DARK, 0, -0.015, -0.3);
      add(g, box(0.075, 0.065, 0.18), WOOD, 0, -0.02, -0.36);
      add(g, box(0.07, 0.1, 0.24), DARK, 0, 0.01, 0.0);
      add(g, box(0.06, 0.11, 0.26), WOOD, 0, -0.04, 0.22, -0.15);
      muzzle.position.set(0, 0.035, -0.72);
      break;
    case 'minigun': {
      add(g, box(0.15, 0.15, 0.3), DARK, 0, 0, 0.02);
      add(g, box(0.04, 0.05, 0.18), BLACK, 0, 0.11, 0.0);
      add(g, box(0.1, 0.13, 0.15), lam(0x56602f), -0.13, -0.03, 0.04);
      spin = new THREE.Group();
      spin.position.set(0, 0, -0.14);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(spin, cylZ(0.017, 0.017, 0.5, 6), METAL, Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.24);
      }
      add(spin, cylZ(0.07, 0.07, 0.03, 12), DARK, 0, 0, -0.42);
      add(spin, cylZ(0.065, 0.065, 0.03, 12), DARK, 0, 0, -0.1);
      g.add(spin);
      muzzle.position.set(0, 0, -0.62);
      break;
    }
    case 'bazooka': {
      const OL = lam(0x4b5d2a);
      add(g, cylZ(0.07, 0.07, 1.0, 14), OL, 0, 0.03, -0.15);
      add(g, cylZ(0.07, 0.09, 0.12, 14), OL, 0, 0.03, -0.68);
      add(g, cylZ(0.095, 0.07, 0.14, 14), OL, 0, 0.03, 0.4);
      add(g, cylZ(0.055, 0.0, 0.12, 10), lam(0xd23b2b), 0, 0.03, -0.72);
      add(g, box(0.04, 0.12, 0.05), BLACK, 0, -0.08, -0.05, 0.2);
      add(g, box(0.04, 0.1, 0.05), BLACK, 0, -0.07, -0.3, 0.2);
      add(g, box(0.03, 0.06, 0.12), DARK, -0.08, 0.1, -0.1);
      add(g, box(0.1, 0.02, 0.6), lam(0xf2c230), 0, 0.105, -0.15);
      muzzle.position.set(0, 0.03, -0.75);
      break;
    }
    case 'grenade': {
      add(g, cylZ(0.085, 0.085, 0.16, 12), DARK, 0, -0.01, -0.06);
      add(g, cylZ(0.087, 0.087, 0.03, 12), lam(0xff8a1f), 0, -0.01, -0.06);
      add(g, cylZ(0.048, 0.048, 0.36, 12), METAL, 0, 0.03, -0.32);
      add(g, cylZ(0.056, 0.056, 0.05, 12), lam(0x9cff4a), 0, 0.03, -0.48);
      add(g, box(0.06, 0.09, 0.22), DARK, 0, 0.0, 0.14);
      add(g, box(0.045, 0.12, 0.06), BLACK, 0, -0.1, 0.06, 0.25);
      muzzle.position.set(0, 0.03, -0.52);
      break;
    }
    case 'laser': {
      const W = lam(0xe8e8ee);
      add(g, box(0.08, 0.1, 0.38), W, 0, 0.0, -0.08);
      add(g, box(0.05, 0.13, 0.07), DARK, 0, -0.09, 0.04, 0.25);
      add(g, cylZ(0.03, 0.04, 0.16, 10), DARK, 0, 0.02, -0.33);
      for (let i = 0; i < 3; i++) {
        const r = add(g, torusZ(0.045, 0.01), glow(0xff2244), 0, 0.02, -0.28 - i * 0.05);
        glows.push(r);
      }
      glows.push(add(g, new THREE.SphereGeometry(0.025, 10, 8), glow(0xff8899), 0, 0.02, -0.42));
      add(g, box(0.02, 0.03, 0.2), glow(0xff2244), 0.041, 0.0, -0.06);
      muzzle.position.set(0, 0.02, -0.44);
      break;
    }
    case 'freeze': {
      const W = lam(0xdff4ff);
      add(g, box(0.09, 0.09, 0.34), W, 0, 0, -0.06);
      add(g, box(0.05, 0.13, 0.07), DARK, 0, -0.09, 0.05, 0.25);
      glows.push(add(g, cylZ(0.045, 0.045, 0.22, 12), glow(0x66e0ff), 0, 0.09, -0.04));
      add(g, cylZ(0.05, 0.05, 0.02, 12), METAL, 0, 0.09, 0.075);
      add(g, cylZ(0.05, 0.05, 0.02, 12), METAL, 0, 0.09, -0.155);
      add(g, cylZ(0.03, 0.065, 0.14, 12), METAL, 0, 0, -0.3);
      glows.push(add(g, torusZ(0.06, 0.008), glow(0xaaf0ff), 0, 0, -0.37));
      muzzle.position.set(0, 0, -0.4);
      break;
    }
    case 'railgun': {
      add(g, box(0.1, 0.11, 0.28), DARK, 0, 0, 0.12);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, box(0.02, 0.035, 0.8), METAL, 0.04, 0, -0.38);
      add(g, box(0.02, 0.035, 0.8), METAL, -0.04, 0, -0.38);
      glows.push(add(g, box(0.02, 0.012, 0.76), glow(0x3aa0ff), 0, 0, -0.38));
      for (let i = 0; i < 4; i++) {
        glows.push(add(g, torusZ(0.06, 0.008), glow(0x7cc4ff), 0, 0, -0.1 - i * 0.17));
      }
      add(g, box(0.03, 0.04, 0.1), DARK, 0, 0.08, 0.05);
      muzzle.position.set(0, 0, -0.8);
      break;
    }
    case 'tesla': {
      const CU = lam(0xb8733a);
      add(g, box(0.09, 0.1, 0.26), DARK, 0, -0.01, 0.06);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, cylZ(0.02, 0.02, 0.36, 8), CU, 0, 0.0, -0.2);
      for (let i = 0; i < 4; i++) add(g, torusZ(0.04, 0.012), CU, 0, 0.0, -0.08 - i * 0.07);
      glows.push(add(g, new THREE.SphereGeometry(0.045, 12, 10), glow(0xd9ccff), 0, 0.0, -0.4));
      add(g, box(0.008, 0.008, 0.08), CU, 0.035, 0.03, -0.42, 0, 0.3);
      add(g, box(0.008, 0.008, 0.08), CU, -0.035, 0.03, -0.42, 0, -0.3);
      add(g, box(0.008, 0.008, 0.08), CU, 0, -0.04, -0.42, -0.3);
      muzzle.position.set(0, 0, -0.44);
      break;
    }
    case 'blackhole': {
      const P = lam(0x3a2050);
      add(g, box(0.11, 0.11, 0.3), P, 0, -0.01, 0.08);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.12, 0.25);
      add(g, cylZ(0.05, 0.07, 0.16, 12), DARK, 0, 0, -0.14);
      add(g, new THREE.SphereGeometry(0.1, 16, 12), lam(0x0b0610), 0, 0, -0.3);
      glows.push(add(g, torusZ(0.11, 0.012), glow(0xb040ff), 0, 0, -0.3));
      const r2 = add(g, torusZ(0.11, 0.008), glow(0xe0a0ff), 0, 0, -0.3, Math.PI / 2);
      glows.push(r2);
      spin = new THREE.Group();
      spin.position.set(0, 0, -0.3);
      spin.add(r2);
      r2.position.set(0, 0, 0);
      g.add(spin);
      muzzle.position.set(0, 0, -0.42);
      break;
    }
    case 'whitehole': {
      const W = lam(0xeae6da);
      add(g, box(0.11, 0.11, 0.3), W, 0, -0.01, 0.08);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.12, 0.25);
      add(g, cylZ(0.05, 0.07, 0.16, 12), lam(0xc9a64a), 0, 0, -0.14);
      glows.push(add(g, new THREE.SphereGeometry(0.09, 16, 12), glow(0xffffff), 0, 0, -0.3));
      glows.push(add(g, torusZ(0.12, 0.012), glow(0xffd76a), 0, 0, -0.3));
      spin = new THREE.Group();
      spin.position.set(0, 0, -0.3);
      const r2 = add(spin, torusZ(0.12, 0.008), glow(0xfff6d0), 0, 0, 0, Math.PI / 2);
      glows.push(r2);
      g.add(spin);
      muzzle.position.set(0, 0, -0.42);
      break;
    }
    case 'saw': {
      add(g, box(0.1, 0.1, 0.3), lam(0x3b4652), 0, -0.01, 0.06);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, cylZ(0.035, 0.05, 0.2, 10), METAL, 0, 0, -0.17);
      add(g, box(0.02, 0.02, 0.2), lam(0xf2c230), 0.055, 0.02, 0.04);
      spin = new THREE.Group();
      spin.position.set(0, 0, -0.3);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const disc = new THREE.Group();
        disc.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0);
        add(disc, cylZ(0.045, 0.045, 0.01, 12), lam(0xd8e0ea), 0, 0, 0);
        for (let k = 0; k < 6; k++) {
          const b = (k / 6) * Math.PI * 2;
          add(disc, box(0.014, 0.014, 0.01), lam(0xaab4c0), Math.cos(b) * 0.05, Math.sin(b) * 0.05, 0, 0, 0, b);
        }
        spin.add(disc);
      }
      g.add(spin);
      muzzle.position.set(0, 0, -0.34);
      break;
    }
    case 'zigzag': {
      const G = lam(0x2f3a1a);
      add(g, box(0.09, 0.1, 0.32), G, 0, 0, 0.05);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      // Şimşek biçimli zikzak namlu
      for (let i = 0; i < 4; i++) {
        glows.push(add(g, box(0.02, 0.02, 0.1), glow(0xd4ff3a), (i % 2 ? -1 : 1) * 0.025, 0.02, -0.14 - i * 0.07, 0, (i % 2 ? 1 : -1) * 0.6));
      }
      add(g, box(0.07, 0.03, 0.3), G, 0, -0.03, -0.24);
      glows.push(add(g, new THREE.SphereGeometry(0.035, 10, 8), glow(0xf4ffb0), 0, 0.02, -0.42));
      muzzle.position.set(0, 0.02, -0.45);
      break;
    }
    case 'sword': {
      // Kılıç: piksel resmin köşegeni ileri-yukarı bakacak şekilde
      const sw = buildSwordPixels(0.032);
      const holder = new THREE.Group();
      holder.add(sw);
      sw.rotation.z = -Math.PI / 4; // köşegen dikey olsun (uç yukarı)
      holder.rotation.x = -1.0; // uç ileri eğilsin
      holder.position.set(0, 0.05, -0.12);
      g.add(holder);
      muzzle.position.set(0, 0.25, -0.45);
      break;
    }
    case 'rubik': {
      add(g, new THREE.BoxGeometry(0.16, 0.16, 0.16), rubikMaterials(), 0, 0.02, -0.15, 0.4, 0.5, 0.1);
      add(g, box(0.07, 0.07, 0.12), lam(0xe0b48a), 0.05, -0.06, -0.06, 0.3);
      muzzle.position.set(0, 0.02, -0.25);
      break;
    }
    case 'fractal': {
      const W = lam(0x1b2b3a);
      add(g, box(0.09, 0.1, 0.3), W, 0, 0, 0.06);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, cylZ(0.025, 0.04, 0.16, 8), DARK, 0, 0.01, -0.16);
      // Namlu ucunda küçük dallanan kristal
      const tip = new THREE.Group();
      tip.position.set(0, 0.01, -0.26);
      const seg = (x1, y1, z1, x2, y2, z2) => {
        const a1 = new THREE.Vector3(x1, y1, z1), a2 = new THREE.Vector3(x2, y2, z2);
        const m = add(tip, box(0.012, 0.012, a1.distanceTo(a2)), glow(0x7df9ff), (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
        m.lookAt(tip.localToWorld(a2.clone()));
        glows.push(m);
      };
      seg(0, 0, 0, 0, 0, -0.08);
      seg(0, 0, -0.08, 0.04, 0.03, -0.13); seg(0, 0, -0.08, -0.04, 0.03, -0.13);
      seg(0.04, 0.03, -0.13, 0.07, 0.03, -0.16); seg(0.04, 0.03, -0.13, 0.03, 0.07, -0.16);
      seg(-0.04, 0.03, -0.13, -0.07, 0.03, -0.16); seg(-0.04, 0.03, -0.13, -0.03, 0.07, -0.16);
      g.add(tip);
      muzzle.position.set(0, 0.01, -0.34);
      break;
    }
    case 'grapple': {
      const B2 = lam(0x4a3b2a);
      add(g, box(0.09, 0.1, 0.3), B2, 0, 0, 0.06);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, cylZ(0.034, 0.034, 0.2, 10), METAL, 0, 0.01, -0.16);
      // Yanda sarılı ip
      add(g, torusZ(0.05, 0.02), lam(0xc9a46a), 0.07, 0, 0.03, 0, Math.PI / 2, 0);
      add(g, cylZ(0.04, 0.04, 0.05, 10), lam(0xa8844f), 0.07, 0, 0.03, 0, Math.PI / 2, 0);
      // Üç çatallı kanca
      const hook = new THREE.Group();
      hook.position.set(0, 0.01, -0.28);
      g.add(hook);
      add(hook, box(0.03, 0.03, 0.06), METAL, 0, 0, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        add(hook, box(0.012, 0.012, 0.07), lam(0xb8c0c8), Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.045, -Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0);
      }
      muzzle.position.set(0, 0.01, -0.34);
      break;
    }
    case 'mush':
    case 'tully': {
      const m = turretItemModel(id);
      m.position.set(0, -0.08, -0.22);
      m.rotation.y = id === 'tully' ? 0 : 0.4;
      g.add(m);
      muzzle.position.set(0, 0.12, -0.3);
      break;
    }
    case 'teleport': {
      const W = lam(0xdfe8f0);
      add(g, box(0.08, 0.1, 0.3), W, 0, 0, 0.06);
      add(g, box(0.05, 0.13, 0.07), BLACK, 0, -0.1, 0.1, 0.25);
      add(g, cylZ(0.03, 0.04, 0.18, 10), DARK, 0, 0.01, -0.17);
      glows.push(add(g, torusZ(0.075, 0.012), glow(0x3ff0ff), 0, 0.01, -0.3));
      spin = new THREE.Group();
      spin.position.set(0, 0.01, -0.3);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        glows.push(add(spin, box(0.012, 0.05, 0.01), glow(0xa8ffff), Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0, 0, 0, a));
      }
      g.add(spin);
      add(g, box(0.02, 0.03, 0.2), glow(0x3ff0ff), 0.041, 0.0, 0.0);
      muzzle.position.set(0, 0.01, -0.32);
      break;
    }
  }
  g.add(muzzle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, muzzle, spin, glows };
}
