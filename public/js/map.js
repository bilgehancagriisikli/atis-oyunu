// Harita: "Liman Üssü". Görsel modeller + çarpışma kutuları + doğma noktaları + mini harita.
import * as THREE from 'three';
import { World, PLAYER } from './physics.js';
import { makeTextures } from './textures.js';

export const HALF = 60; // oynanabilir alan yarı genişliği

const MATS = {
  ground: { tex: 'concrete', color: 0xffffff, s: 8 },
  concrete: { tex: 'concrete', color: 0xd8d6cf, s: 4 },
  brick: { tex: 'brick', color: 0xffffff, s: 3 },
  roof: { tex: 'roof', color: 0xffffff, s: 4 },
  metal: { tex: 'metal', color: 0xffffff, s: 2 },
  hazard: { tex: 'hazard', color: 0xffffff, s: 2 },
  wood: { tex: 'wood', color: 0xffffff, s: 1.2 },
  cRed: { tex: 'corrugated', color: 0xc0392b, s: 2.6 },
  cBlue: { tex: 'corrugated', color: 0x2f6db5, s: 2.6 },
  cGreen: { tex: 'corrugated', color: 0x3f8f4a, s: 2.6 },
  cOrange: { tex: 'corrugated', color: 0xe07b24, s: 2.6 },
  trunk: { color: 0x6b4a2b },
  leaves: { color: 0x3e7a35, flat: true },
  hill: { color: 0x5f7d48, flat: true },
  rock: { color: 0x8a8580, flat: true },
  grass: { tex: 'grass', color: 0xffffff, s: 10 },
};

// Dünya koordinatlarından UV (bitişik kutularda doku hizalı olur)
function worldUV(geo, s) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / s, z / s);
    else if (ax >= az) uv.setXY(i, z / s, y / s);
    else uv.setXY(i, x / s, y / s);
  }
}

function mergeGeometries(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[io + k] = src[k] + vo;
    vo += g.attributes.position.count;
    io += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Rampa (kama) geometrisi
function wedgeGeometry(c) {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1, axis, asc } = c;
  // Yüksek kenarın köşeleri
  const hiAt = (x, z) => {
    if (axis === 'x') return asc > 0 ? x === x1 : x === x0;
    return asc > 0 ? z === z1 : z === z0;
  };
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const top = corners.map(([x, z]) => [x, hiAt(x, z) ? y1 : y0, z]);
  const bot = corners.map(([x, z]) => [x, y0, z]);
  const center = [(x0 + x1) / 2, y0 + (y1 - y0) / 3, (z0 + z1) / 2];
  const faces = [
    [bot[0], bot[1], bot[2], bot[3]],
    [top[0], top[1], top[2], top[3]],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const f = [bot[i], bot[j], top[j], top[i]];
    // Sıfır yükseklikli kenarları üçgene indir
    const uniq = f.filter((v, k) => f.findIndex((w) => w[0] === v[0] && w[1] === v[1] && w[2] === v[2]) === k);
    if (uniq.length >= 3) faces.push(uniq);
  }
  const pos = [], nor = [], uvs = [], idx = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f of faces) {
    a.fromArray(f[0]); b.fromArray(f[1]); cc.fromArray(f[2]);
    n.subVectors(b, a).cross(cc.clone().sub(a)).normalize();
    const fc = f.reduce((s, v) => [s[0] + v[0] / f.length, s[1] + v[1] / f.length, s[2] + v[2] / f.length], [0, 0, 0]);
    const out = (fc[0] - center[0]) * n.x + (fc[1] - center[1]) * n.y + (fc[2] - center[2]) * n.z;
    if (out < 0) { f = f.slice().reverse(); n.negate(); }
    const base = pos.length / 3;
    for (const v of f) { pos.push(...v); nor.push(n.x, n.y, n.z); uvs.push(0, 0); }
    for (let k = 1; k < f.length - 1; k++) idx.push(base, base + k, base + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

class Builder {
  constructor(world, tex) {
    this.world = world;
    this.tex = tex;
    this.buckets = {};
  }

  push(matKey, geo) {
    worldUV(geo, MATS[matKey].s || 1);
    (this.buckets[matKey] ||= []).push(geo);
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, mat, solid = true) {
    const g = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    this.push(mat, g);
    if (solid) return this.world.addBox(minX, minY, minZ, maxX, maxY, maxZ);
    return null;
  }

  // Merkez + boyut ile kutu (alt yükseklik y)
  cbox(cx, y, cz, w, h, d, mat, solid = true) {
    return this.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2, mat, solid);
  }

  ramp(minX, minY, minZ, maxX, maxY, maxZ, axis, asc, mat) {
    const c = this.world.addRamp(minX, minY, minZ, maxX, maxY, maxZ, axis, asc);
    this.push(mat, wedgeGeometry(c));
    return c;
  }

  // Basamaklar: axis boyunca start'tan dir yönünde
  stairs(axis, start, dir, a0, a1, n, stepH, stepD, mat) {
    for (let k = 0; k < n; k++) {
      const s0 = start + dir * k * stepD, s1 = start + dir * (k + 1) * stepD;
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const h = (k + 1) * stepH;
      if (axis === 'z') this.box(a0, 0, lo, a1, h, hi, mat);
      else this.box(lo, 0, a0, hi, h, a1, mat);
    }
  }

  // Açıklıklı duvar. axis: duvarın uzandığı eksen
  wall(axis, a0, a1, f0, f1, y0, h, openings, mat) {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let cur = a0;
    const seg = (s0, s1, yy0, yy1) => {
      if (s1 - s0 < 0.01 || yy1 - yy0 < 0.01) return;
      if (axis === 'x') this.box(s0, yy0, f0, s1, yy1, f1, mat);
      else this.box(f0, yy0, s0, f1, yy1, s1, mat);
    };
    for (const o of ops) {
      seg(cur, o.a, y0, y0 + h);
      seg(o.a, o.b, y0, y0 + o.y0);
      seg(o.a, o.b, y0 + o.y1, y0 + h);
      cur = o.b;
    }
    seg(cur, a1, y0, y0 + h);
  }

  build(scene, quality) {
    const meshes = [];
    for (const [key, list] of Object.entries(this.buckets)) {
      const def = MATS[key];
      const mat = new THREE.MeshLambertMaterial({
        color: def.color,
        map: def.tex ? this.tex[def.tex] : null,
        flatShading: !!def.flat,
      });
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = quality !== 'low' && key !== 'ground' && key !== 'hill' && key !== 'grass';
      mesh.receiveShadow = quality !== 'low';
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      meshes.push(mesh);
      for (const g of list) g.dispose();
    }
    return meshes;
  }
}

// ------------------------------------------------------------
export function buildMap(scene, quality = 'high') {
  const world = new World();
  const tex = makeTextures();
  const B = new Builder(world, tex);

  // Zemin
  world.addBox(-400, -2, -400, 400, 0, 400);
  const groundGeo = new THREE.BoxGeometry(2 * HALF + 4, 0.2, 2 * HALF + 4);
  groundGeo.translate(0, -0.1, 0);
  B.push('ground', groundGeo);
  const grassGeo = new THREE.BoxGeometry(500, 0.2, 500);
  grassGeo.translate(0, -0.12, 0);
  B.push('grass', grassGeo);

  // Çevre duvarları
  const WH = 6;
  B.box(-HALF - 2, 0, -HALF - 2, HALF + 2, WH, -HALF, 'concrete');
  B.box(-HALF - 2, 0, HALF, HALF + 2, WH, HALF + 2, 'concrete');
  B.box(-HALF - 2, 0, -HALF, -HALF, WH, HALF, 'concrete');
  B.box(HALF, 0, -HALF, HALF + 2, WH, HALF, 'concrete');
  // Görünmez yüksek bariyer: roket/kara delik ile duvarın üstünden dışarı uçulmasın
  // (mermiler bu bariyerden geçer: ghost)
  world.addBox(-HALF - 2, WH, -HALF - 2, HALF + 2, 80, -HALF).ghost = true;
  world.addBox(-HALF - 2, WH, HALF, HALF + 2, 80, HALF + 2).ghost = true;
  world.addBox(-HALF - 2, WH, -HALF, -HALF, 80, HALF).ghost = true;
  world.addBox(HALF, WH, -HALF, HALF + 2, 80, HALF).ghost = true;
  // Duvar üstü şerit (görsel)
  B.box(-HALF - 2.05, WH, -HALF - 2.05, HALF + 2.05, WH + 0.25, -HALF + 0.05, 'hazard', false);
  B.box(-HALF - 2.05, WH, HALF - 0.05, HALF + 2.05, WH + 0.25, HALF + 2.05, 'hazard', false);
  B.box(-HALF - 2.05, WH, -HALF, -HALF + 0.05, WH + 0.25, HALF, 'hazard', false);
  B.box(HALF - 0.05, WH, -HALF, HALF + 2.05, WH + 0.25, HALF, 'hazard', false);

  // ---------------- Merkez platform ----------------
  B.box(-7, 0, -7, 7, 3, 7, 'concrete');
  B.box(-7.06, 2.6, -7.06, 7.06, 3, -7, 'hazard', false);
  B.box(-7.06, 2.6, 7, 7.06, 3, 7.06, 'hazard', false);
  B.box(-7.06, 2.6, -7, -7, 3, 7, 'hazard', false);
  B.box(7, 2.6, -7, 7.06, 3, 7, 'hazard', false);
  B.ramp(-2.5, 0, -15, 2.5, 3, -7, 'z', 1, 'metal');
  B.ramp(-2.5, 0, 7, 2.5, 3, 15, 'z', -1, 'metal');
  // Siper duvarları (ortada zıplama sandıklarına açılan boşluk)
  B.box(6.3, 3, -5, 7, 4.2, -1.6, 'metal');
  B.box(6.3, 3, 1.6, 7, 4.2, 5, 'metal');
  B.box(-7, 3, -5, -6.3, 4.2, -1.6, 'metal');
  B.box(-7, 3, 1.6, -6.3, 4.2, 5, 'metal');
  B.box(-1.2, 3, -1.2, 1.2, 4.5, 1.2, 'metal');
  // Zıplama sandıkları
  B.box(7, 0, -1.2, 9.4, 1.5, 1.2, 'wood');
  B.box(-9.4, 0, -1.2, -7, 1.5, 1.2, 'wood');
  B.box(7, 0, 4, 8.4, 1.4, 5.4, 'wood');
  B.box(-8.4, 0, -5.4, -7, 1.4, -4, 'wood');

  // ---------------- Binalar ----------------
  const BW = 16, BD = 12, BH = 5, T = 0.6, RT = BH + 0.4;
  const building = (cx, cz, o) => {
    const x0 = cx - BW / 2, x1 = cx + BW / 2, z0 = cz - BD / 2, z1 = cz + BD / 2;
    const door = (c) => ({ a: c - 1.5, b: c + 1.5, y0: 0, y1: 3 });
    const win = (c) => ({ a: c - 1.1, b: c + 1.1, y0: 1.3, y1: 2.5 });
    const ops = { n: [], s: [], w: [], e: [] };
    for (const [side, c] of o.doors) ops[side].push(door(c));
    for (const [side, c] of o.windows) ops[side].push(win(c));
    B.wall('x', x0, x1, z0, z0 + T, 0, BH, ops.n, 'brick');
    B.wall('x', x0, x1, z1 - T, z1, 0, BH, ops.s, 'brick');
    B.wall('z', z0 + T, z1 - T, x0, x0 + T, 0, BH, ops.w, 'brick');
    B.wall('z', z0 + T, z1 - T, x1 - T, x1, 0, BH, ops.e, 'brick');
    B.box(x0, BH, z0, x1, RT, z1, 'roof');
    // Çatı korkuluğu (boşluklu)
    const P = 0.3, PH = 0.9;
    const gaps = { n: [], s: [], w: [], e: [] };
    for (const [side, a, b] of o.roofGaps) gaps[side].push({ a, b, y0: 0, y1: PH });
    const pw = (axis, a0, a1, f0, f1, list) => B.wall(axis, a0, a1, f0, f1, RT, PH, list, 'concrete');
    pw('x', x0, x1, z0, z0 + P, gaps.n);
    pw('x', x0, x1, z1 - P, z1, gaps.s);
    pw('z', z0 + P, z1 - P, x0, x0 + P, gaps.w);
    pw('z', z0 + P, z1 - P, x1 - P, x1, gaps.e);
    // İç sandıklar
    for (const [dx, dz, stack] of o.crates) {
      B.cbox(cx + dx, 0, cz + dz, 1.2, 1.2, 1.2, 'wood');
      if (stack) B.cbox(cx + dx, 1.2, cz + dz, 1.2, 1.2, 1.2, 'wood');
    }
  };

  // KB (kuzeybatı)
  building(-32, -32, {
    doors: [['e', -32], ['s', -32]],
    windows: [['n', -36], ['n', -28], ['w', -32]],
    roofGaps: [['w', -37.7, -35.2], ['e', -33.5, -30.5]],
    crates: [[-6.2, -4.2, true], [-4.9, -4.2, false], [5.5, 3.8, false]],
  });
  // Çatıya çıkış: rampa + üstte düz sahanlık
  B.box(-42.6, 0, -38, -40, RT, -35, 'concrete');
  B.ramp(-42.6, 0, -35, -40, RT, -23, 'z', -1, 'metal');

  // KD (kuzeydoğu)
  building(32, -32, {
    doors: [['w', -32], ['s', 32]],
    windows: [['n', 28], ['n', 36], ['e', -30]],
    roofGaps: [['e', -37.7, -35.2], ['w', -33.5, -30.5]],
    crates: [[6.2, -4.2, true], [-5.5, 3.8, false], [6.2, 3.8, false]],
  });
  B.box(40, 0, -38, 42.4, RT, -35, 'concrete');
  B.stairs('z', -35 + 11 * 0.85, -1, 40, 42.4, 11, RT / 12, 0.85, 'concrete');

  // GB (güneybatı)
  building(-32, 32, {
    doors: [['e', 32], ['n', -32]],
    windows: [['s', -36], ['s', -28], ['w', 34]],
    roofGaps: [['w', 35.2, 37.7]],
    crates: [[-6.2, 4.2, true], [5.5, -3.8, false], [-6.2, -3.8, false]],
  });
  B.box(-42.4, 0, 35, -40, RT, 38, 'concrete');
  B.stairs('z', 35 - 11 * 0.85, 1, -42.4, -40, 11, RT / 12, 0.85, 'concrete');

  // GD (güneydoğu)
  building(32, 32, {
    doors: [['w', 32], ['n', 32]],
    windows: [['s', 28], ['s', 36], ['e', 30]],
    roofGaps: [['e', 35.2, 37.7]],
    crates: [[6.2, 4.2, true], [4.9, 4.2, false], [-5.5, -3.8, false]],
  });
  B.box(40, 0, 35, 42.6, RT, 38, 'concrete');
  B.ramp(40, 0, 23, 42.6, RT, 35, 'z', 1, 'metal');

  // Köprü (KB çatısı <-> KD çatısı)
  B.box(-24, BH, -33.5, 24, RT, -30.5, 'metal');
  B.box(-24, RT, -33.5, 24, RT + 1, -33.32, 'hazard');
  B.box(-24, RT, -30.68, 24, RT + 1, -30.5, 'hazard');
  for (const px of [-12, 0, 12]) B.box(px - 0.4, 0, -32.4, px + 0.4, BH, -31.6, 'concrete');

  // ---------------- Konteynerler ----------------
  const CL = 6, CW = 2.44, CH = 2.6;
  const contX = (x0, z0, y, mat) => B.box(x0, y, z0, x0 + CL, y + CH, z0 + CW, mat);
  const contZ = (x0, z0, y, mat) => B.box(x0, y, z0, x0 + CW, y + CH, z0 + CL, mat);

  // Batı kümesi
  contX(-50, -7, 0, 'cOrange');
  contZ(-52, -1, 0, 'cGreen');
  contX(-46, 4, 0, 'cRed');
  contX(-46, 4, CH, 'cBlue');
  // Doğu kümesi
  contX(44, 4.56, 0, 'cBlue');
  contZ(49.56, -5, 0, 'cRed');
  contX(40, -6.44, 0, 'cGreen');
  contX(40, -6.44, CH, 'cOrange');
  // Güney avlusu
  contX(-12, 34, 0, 'cRed');
  B.ramp(-6, 0, 34, 0, CH, 34 + CW, 'x', -1, 'metal');
  contX(-12, 38.6, 0, 'cBlue');
  contX(6, 34, 0, 'cGreen');
  contX(6, 34, CH, 'cOrange');
  contZ(2, 40, 0, 'cBlue');
  // Kuzey (köprü altı)
  contZ(-18, -46, 0, 'cGreen');
  contX(10, -47, 0, 'cRed');

  // Motosiklet atlama rampaları (ucu havada biter; önlerinde uzun düz yol var)
  B.ramp(-1.5, 0, 21, 1.5, 1.7, 27, 'z', 1, 'hazard'); // güney yolu
  B.ramp(10, 0, -54.5, 16, 1.6, -51.5, 'x', 1, 'hazard'); // kuzey şerit, doğuya
  B.ramp(13, 0, 51, 19.5, 1.5, 54, 'x', 1, 'hazard'); // güney şerit, doğuya

  // Tahta sandıklar (yığınlar)
  const crate = (x, z, n = 1) => {
    for (let k = 0; k < n; k++) B.cbox(x, k * 1.2, z, 1.2, 1.2, 1.2, 'wood');
  };
  crate(-43, -2, 2); crate(-41.8, -2); crate(-47, 1.2);
  crate(43, 2, 2); crate(41.8, 2); crate(47, -1.2);
  crate(16, 16, 2); crate(17.2, 16); crate(16, 17.2);
  crate(-16, -16, 2); crate(-17.2, -16); crate(-16, -17.2);
  crate(-17, 15); crate(-17, 16.2, 2);
  crate(15, -17); crate(16.2, -17, 2);
  crate(-3, 44, 2); crate(-1.8, 44);
  crate(0, -40, 2); crate(1.2, -40); crate(-6, -38);
  crate(-24, 0, 1); crate(24, 0, 1); crate(-25.2, 0.6, 2); crate(25.2, -0.6, 2);

  // Beton bariyerler
  const bar = (cx, cz, alongX) => {
    if (alongX) B.cbox(cx, 0, cz, 3, 1.1, 0.7, 'concrete');
    else B.cbox(cx, 0, cz, 0.7, 1.1, 3, 'concrete');
  };
  bar(20, -6, false); bar(20, 6, false); bar(-20, -6, false); bar(-20, 6, false);
  bar(-7, 21, true); bar(7, 21, true); bar(-7, -21, true); bar(7, -21, true);
  bar(32, -16, true); bar(-32, 16, true); bar(-32, -16, true); bar(32, 16, true);
  bar(48, 24, false); bar(-48, -24, false); bar(48, -24, false); bar(-48, 24, false);

  // Ağaçlar
  const tryTree = (x, z) => {
    if (world.overlapsPlayer(x, 0, z, 1.0)) return;
    B.cbox(x, 0, z, 0.6, 3.2, 0.6, 'trunk');
    const g = new THREE.IcosahedronGeometry(1.9, 0);
    g.scale(1, 1.25, 1);
    g.translate(x, 4.4, z);
    const g2 = toIndexed(g);
    B.push('leaves', g2);
  };
  for (const v of [-50, -22, -8, 8, 22, 50]) {
    tryTree(v, -56); tryTree(v, 56);
    tryTree(-56, v); tryTree(56, v);
  }

  // Dekor: dış tepeler ve kayalar
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + Math.random() * 0.1;
    const r = 110 + Math.random() * 60;
    const h = 18 + Math.random() * 30;
    const g = new THREE.ConeGeometry(18 + Math.random() * 16, h, 6 + (i % 3));
    g.translate(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    B.push('hill', toIndexed(g));
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 25;
    const g = new THREE.DodecahedronGeometry(2 + Math.random() * 3, 0);
    g.translate(Math.cos(a) * r, 0.5, Math.sin(a) * r);
    B.push('rock', toIndexed(g));
  }

  const meshes = B.build(scene, quality);

  // Yollar
  const roadMat = new THREE.MeshLambertMaterial({
    map: tex.asphalt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (const rot of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(6, 2 * HALF);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 20);
    const m = new THREE.Mesh(g, roadMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.y = 0.012;
    m.receiveShadow = quality !== 'low';
    scene.add(m);
  }

  // Lamba direkleri (ışıklı)
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  for (const [x, z] of [[4, 22], [-4, -22], [22, -4], [-22, 4], [4, -50], [-4, 50], [50, 4], [-50, -4]]) {
    world.addBox(x - 0.15, 0, z - 0.15, x + 0.15, 5.5, z + 0.15);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.5, 6), poleMat);
    pole.position.set(x, 2.75, z);
    pole.castShadow = quality !== 'low';
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bulbMat);
    bulb.position.set(x, 5.6, z);
    scene.add(bulb);
  }

  // Merkezdeki işaret feneri
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 3, 6),
    new THREE.MeshBasicMaterial({ color: 0x6ff2ff }),
  );
  beacon.position.set(0, 6, 0);
  scene.add(beacon);

  // ---------------- Doğma noktaları ----------------
  const cand = [
    [52, 52], [-52, 52], [52, -52], [-52, -52],
    [0, 52], [0, -53], [54, 14], [-54, -14], [54, -16], [-54, 16],
    [-32, -32], [32, -32], [-32, 32], [32, 32],
    [18, 24], [-18, -24], [24, -18], [-24, 18],
    [-12, 0], [12, 0], [0, 19], [0, -25],
  ];
  const spawns = [];
  for (const [x, z] of cand) {
    const y = world.groundAt(x, z, 1);
    if (!world.overlapsPlayer(x, y, z, PLAYER.radius + 0.3)) spawns.push({ x, y, z });
  }

  // ---------------- Araç park yerleri ----------------
  const vehicleSpawns = [];
  for (const [kind, x, z, yaw] of [
    ['moto', -50, -44, Math.PI / 2], ['moto', 50, -44, -Math.PI / 2],
    ['moto', -50, 44, Math.PI / 2], ['moto', 50, 44, -Math.PI / 2],
    ['chin', 0, -45, Math.PI], ['chin', -20, 50, 0],
  ]) {
    vehicleSpawns.push({ kind, x, y: world.groundAt(x, z, 1), z, yaw });
  }

  return {
    world,
    tex,
    meshes,
    spawns,
    vehicleSpawns,
    minimap: drawMinimap(world),
    update(t) {
      beacon.material.color.setHSL(0.5 + Math.sin(t * 2) * 0.05, 1, 0.55 + Math.sin(t * 4) * 0.15);
    },
  };
}

function toIndexed(g) {
  // Polyhedron geometrileri indekssizdir; birleştirme için indeks ekle
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// Mini harita: yukarıdan görünüm (256px = 128m)
export const MINIMAP_RANGE = 64;
function drawMinimap(world) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const k = S / (MINIMAP_RANGE * 2);
  x.fillStyle = '#4a5a3a'; x.fillRect(0, 0, S, S);
  x.fillStyle = '#6f6e68';
  x.fillRect((MINIMAP_RANGE - HALF) * k, (MINIMAP_RANGE - HALF) * k, HALF * 2 * k, HALF * 2 * k);
  x.fillStyle = '#4b4c50';
  x.fillRect((MINIMAP_RANGE - 3) * k, (MINIMAP_RANGE - HALF) * k, 6 * k, HALF * 2 * k);
  x.fillRect((MINIMAP_RANGE - HALF) * k, (MINIMAP_RANGE - 3) * k, HALF * 2 * k, 6 * k);
  const list = world.colliders.filter((q) => q.maxX - q.minX < 200 && !q.ghost).sort((a, b) => a.maxY - b.maxY);
  for (const q of list) {
    const h = Math.min(1, q.maxY / 7);
    const v = Math.round(110 + h * 130);
    x.fillStyle = q.type === 'ramp' ? `rgb(${v},${v},${Math.round(v * 0.7)})` : `rgb(${v},${v},${v})`;
    x.fillRect((q.minX + MINIMAP_RANGE) * k, (q.minZ + MINIMAP_RANGE) * k,
      Math.max(1, (q.maxX - q.minX) * k), Math.max(1, (q.maxZ - q.minZ) * k));
  }
  return c;
}
