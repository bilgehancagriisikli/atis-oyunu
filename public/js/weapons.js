// Silah tanımları ve 3D modelleri.
import * as THREE from 'three';

// type: hitscan | projectile | beam | rail | chain
export const WEAPONS = {
  pistol: {
    name: 'Tabanca', type: 'hitscan', dmg: 18, hs: 2, rate: 4, spread: 0.01, range: 160,
    ammo: Infinity, color: 0xffd27a, sound: 'pistol', recoil: 0.05, weight: 0,
  },
  shotgun: {
    name: 'Pompalı Tüfek', type: 'hitscan', pellets: 10, dmg: 9, hs: 1.5, rate: 1.1, spread: 0.075,
    range: 60, ammo: 14, color: 0xffb060, sound: 'shotgun', recoil: 0.14, weight: 14,
  },
  minigun: {
    name: 'Minigun', type: 'hitscan', dmg: 8, hs: 1.5, rate: 15, spread: 0.04, range: 130,
    ammo: 180, color: 0xffe08a, sound: 'minigun', recoil: 0.018, spin: 0.35, weight: 12,
  },
  bazooka: {
    name: 'Bazuka', type: 'projectile', proj: 'rocket', speed: 30, grav: 0, dmg: 110, radius: 6,
    kb: 17, rate: 0.85, ammo: 6, color: 0xff6a2a, sound: 'rocket', recoil: 0.2, weight: 12,
  },
  grenade: {
    name: 'Bomba Atar', type: 'projectile', proj: 'grenade', speed: 23, grav: 18, dmg: 90, radius: 5,
    kb: 12, fuse: 1.6, rate: 1.4, ammo: 10, color: 0x9cff4a, sound: 'grenade', recoil: 0.1, weight: 10,
  },
  laser: {
    name: 'Lazer Işını', type: 'beam', dmg: 7, tick: 0.1, range: 90, ammo: 100, drain: 22,
    color: 0xff2244, sound: 'laser', weight: 12,
  },
  freeze: {
    name: 'Dondurucu Işın', type: 'beam', dmg: 3, tick: 0.1, range: 45, ammo: 100, drain: 20,
    color: 0x66e0ff, slow: 1.6, sound: 'freeze', weight: 9,
  },
  railgun: {
    name: 'Raylı Top', type: 'rail', dmg: 95, hs: 1.5, rate: 0.7, range: 260, ammo: 6,
    color: 0x3aa0ff, sound: 'rail', recoil: 0.22, weight: 9,
  },
  tesla: {
    name: 'Yıldırım Silahı', type: 'chain', dmg: [30, 20, 14], range: 38, cone: 0.26, chain: 11,
    rate: 2.4, ammo: 30, color: 0xb9a6ff, sound: 'tesla', recoil: 0.06, weight: 10,
  },
  blackhole: {
    name: 'Kara Delik Topu', type: 'projectile', proj: 'orb', speed: 15, grav: 0, ammo: 2,
    rate: 0.5, color: 0xb040ff, sound: 'orb', recoil: 0.16, weight: 5,
    bh: { dur: 4, radius: 13, pull: 30, dps: 24, coreR: 3, finalDmg: 45, finalR: 5.5 },
  },
};

// Tuş sırası (1..0)
export const WEAPON_ORDER = ['pistol', 'shotgun', 'minigun', 'bazooka', 'grenade', 'laser', 'freeze', 'railgun', 'tesla', 'blackhole'];

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
  }
  g.add(muzzle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, muzzle, spin, glows };
}
