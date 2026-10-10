// Gökten düşen cisimler: 5 Platon, 13 Arşimet (kalkık küp ve kalkık onikiyüzlünün sağ/sol biçimleriyle 15)
// ve 4 Kepler-Poinsot cismi. Dışbükey olanlar köşe koordinatlarından dışbükey örtü ile kurulur;
// yüzler kenar sayısına göre renklenir. Yıldız (Kepler-Poinsot) cisimlerin yüzleri kesişir.
import * as THREE from 'three';
import { ConvexHull } from '../vendor/ConvexHull.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const SQ2 = Math.SQRT2;

const EVEN = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
const ODD = [[1, 0, 2], [0, 2, 1], [2, 1, 0]];

// Sıfır olmayan bileşenlerin tüm işaret seçenekleri
function signs(v) {
  let out = [[]];
  for (const c of v) {
    const next = [];
    for (const o of out) {
      next.push([...o, c]);
      if (c !== 0) next.push([...o, -c]);
    }
    out = next;
  }
  return out;
}
const permute = (v, ps) => ps.map((p) => [v[p[0]], v[p[1]], v[p[2]]]);
const evenPerms = (v) => signs(v).flatMap((s) => permute(s, EVEN));
const allPerms = (v) => signs(v).flatMap((s) => permute(s, [...EVEN, ...ODD]));
const plusCount = (v) => v.filter((c) => c > 0).length;

function dedupe(pts) {
  const seen = new Set(), out = [];
  for (const p of pts) {
    const k = p.map((c) => Math.round(c * 1e5)).join(',');
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

// Kalkık küp: tribonacci sabiti t
const TRIB = 1.839286755214161;
function snubCube(mirror) {
  const pts = [];
  for (const s of signs([1, 1 / TRIB, TRIB])) {
    const evenOk = plusCount(s) % 2 === 0;
    for (const p of permute(s, EVEN)) if (evenOk !== mirror) pts.push(p);
    for (const p of permute(s, ODD)) if (evenOk === mirror) pts.push(p);
  }
  return pts;
}

// Kalkık onikiyüzlü: ikosahedral dönme grubunun (60 dönüşüm) tek bir başlangıç noktasına uygulanması.
// Başlangıç noktası tüm kenarlar eşit olacak şekilde sayısal olarak bulundu (kenar / çevrel yarıçap = 0.46386).
const SNUB_DODECA_SEED = [0.0894750752438524, -0.809980595540794, -0.579590929671513];
function icosaRotations() {
  const rot = (axis, ang) => {
    const l = Math.hypot(...axis);
    const [x, y, z] = axis.map((c) => c / l);
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
  };
  const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((sum, _v, k) => sum + A[i][k] * B[k][j], 0)));
  const key = (M) => M.flat().map((v) => Math.round(v * 1e6)).join(',');
  const gens = [rot([0, 1, PHI], (2 * Math.PI) / 5), rot([0, 0, 1], Math.PI)];
  const group = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]];
  const seen = new Set([key(group[0])]);
  for (let i = 0; i < group.length; i++) {
    for (const G of gens) {
      const M = mul(G, group[i]);
      const k = key(M);
      if (!seen.has(k)) { seen.add(k); group.push(M); }
    }
  }
  return group;
}
function snubDodeca(mirror) {
  const p = SNUB_DODECA_SEED;
  return icosaRotations().map((M) => {
    const q = M.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]);
    if (mirror) q[0] = -q[0];
    return q;
  });
}

const ICO = dedupe(evenPerms([0, 1, PHI]));
// İkosahedronun duali olacak şekilde hizalı (yıldızlı cisimler için yüz merkezleri ikosahedron köşelerinde)
const DODECA = dedupe([...signs([1, 1, 1]), ...evenPerms([0, PHI, 1 / PHI])]);

// kind: 'c' = dışbükey (köşelerden), 's' = yıldız (hazır yüzler)
export const SOLIDS = [
  // Platon cisimleri
  { name: 'Düzgün Dörtyüzlü', fam: 'Platon', pts: () => [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] },
  { name: 'Küp', fam: 'Platon', pts: () => signs([1, 1, 1]) },
  { name: 'Düzgün Sekizyüzlü', fam: 'Platon', pts: () => allPerms([1, 0, 0]) },
  { name: 'Düzgün Onikiyüzlü', fam: 'Platon', pts: () => DODECA },
  { name: 'Düzgün Yirmiyüzlü', fam: 'Platon', pts: () => ICO },
  // Arşimet cisimleri
  { name: 'Kesik Dörtyüzlü', fam: 'Arşimet', pts: () => allPerms([3, 1, 1]).filter((p) => p.filter((c) => c < 0).length % 2 === 0) },
  { name: 'Küpoktahedron', fam: 'Arşimet', pts: () => allPerms([1, 1, 0]) },
  { name: 'Kesik Küp', fam: 'Arşimet', pts: () => allPerms([SQ2 - 1, 1, 1]) },
  { name: 'Kesik Sekizyüzlü', fam: 'Arşimet', pts: () => allPerms([0, 1, 2]) },
  { name: 'Rombikuboktahedron', fam: 'Arşimet', pts: () => allPerms([1, 1, 1 + SQ2]) },
  { name: 'Kesik Küpoktahedron', fam: 'Arşimet', pts: () => allPerms([1, 1 + SQ2, 1 + 2 * SQ2]) },
  { name: 'Kalkık Küp (sol)', fam: 'Arşimet', pts: () => snubCube(false) },
  { name: 'Kalkık Küp (sağ)', fam: 'Arşimet', pts: () => snubCube(true) },
  { name: 'İkosidodekahedron', fam: 'Arşimet', pts: () => [...evenPerms([0, 0, PHI]), ...evenPerms([0.5, PHI / 2, PHI * PHI / 2])] },
  { name: 'Kesik Onikiyüzlü', fam: 'Arşimet', pts: () => [...evenPerms([0, 1 / PHI, 2 + PHI]), ...evenPerms([1 / PHI, PHI, 2 * PHI]), ...evenPerms([PHI, 2, PHI + 1])] },
  { name: 'Kesik Yirmiyüzlü (futbol topu)', fam: 'Arşimet', pts: () => [...evenPerms([0, 1, 3 * PHI]), ...evenPerms([1, 2 + PHI, 2 * PHI]), ...evenPerms([PHI, 2, PHI ** 3])] },
  { name: 'Rombikosidodekahedron', fam: 'Arşimet', pts: () => [...evenPerms([1, 1, PHI ** 3]), ...evenPerms([PHI * PHI, PHI, 2 * PHI]), ...evenPerms([2 + PHI, 0, PHI * PHI])] },
  {
    name: 'Kesik İkosidodekahedron', fam: 'Arşimet', pts: () => [
      ...evenPerms([1 / PHI, 1 / PHI, 3 + PHI]), ...evenPerms([2 / PHI, PHI, 1 + 2 * PHI]),
      ...evenPerms([1 / PHI, PHI * PHI, -1 + 3 * PHI]), ...evenPerms([-1 + 2 * PHI, 2, 2 + PHI]), ...evenPerms([PHI, 3, 2 * PHI]),
    ],
  },
  { name: 'Kalkık Onikiyüzlü (sol)', fam: 'Arşimet', pts: () => snubDodeca(false) },
  { name: 'Kalkık Onikiyüzlü (sağ)', fam: 'Arşimet', pts: () => snubDodeca(true) },
  // Kepler-Poinsot cisimleri
  { name: 'Küçük Yıldızlı Onikiyüzlü', fam: 'Kepler-Poinsot', star: 'ssd' },
  { name: 'Büyük Onikiyüzlü', fam: 'Kepler-Poinsot', star: 'gd' },
  { name: 'Büyük Yıldızlı Onikiyüzlü', fam: 'Kepler-Poinsot', star: 'gsd' },
  { name: 'Büyük Yirmiyüzlü', fam: 'Kepler-Poinsot', star: 'gi' },
];

const SIDE_COLORS = { 3: 0xff5a5a, 4: 0xffd23f, 5: 0x3fa9ff, 6: 0x4cd964, 8: 0xc06cff, 10: 0xff8c42 };

// Dışbükey cismin yüzleri: örtü üçgenleri aynı düzlemdekiler birleştirilerek çokgenlere ayrılır
export function convexFaces(points) {
  const hull = new ConvexHull().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const groups = [];
  for (const f of hull.faces) {
    const tri = [];
    let e = f.edge;
    do { tri.push(e.head().point.clone()); e = e.next; } while (e !== f.edge);
    let g = groups.find((q) => q.n.dot(f.normal) > 0.9999 && Math.abs(q.c - f.constant) < 1e-4);
    if (!g) { g = { n: f.normal.clone(), c: f.constant, tris: [], verts: new Set() }; groups.push(g); }
    g.tris.push(tri);
    for (const v of tri) g.verts.add(v.toArray().map((c) => c.toFixed(4)).join(','));
  }
  return groups.map((g) => ({ sides: g.verts.size, tris: g.tris }));
}

// Pentagram yüzü: 5 uç üçgeni + ortadaki beşgen. P: uç noktaları çember sırasıyla (yıldız sırasıyla değil);
// iç köşe, komşu iki ucun açıortayında, çevrel yarıçapın 1/φ² katı uzaklıkta
function pentagram(P) {
  const c = P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / 5);
  const R = P[0].distanceTo(c);
  const Q = P.map((p, i) => {
    const q = p.clone().sub(c).add(P[(i + 1) % 5].clone().sub(c)).normalize();
    return c.clone().addScaledVector(q, R * 0.381966);
  });
  const tris = [];
  for (let i = 0; i < 5; i++) tris.push([P[i], Q[i], Q[(i + 4) % 5]]);
  for (let i = 1; i < 4; i++) tris.push([Q[0], Q[i], Q[i + 1]]);
  return tris;
}

// Düzlemdeki noktaları merkez çevresinde açıya göre sırala
function ringOrder(pts, axis) {
  const n = axis.clone().normalize();
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const u = pts[0].clone().sub(c).normalize();
  const w = new THREE.Vector3().crossVectors(n, u);
  return pts.slice().sort((a, b) => {
    const da = a.clone().sub(c), db = b.clone().sub(c);
    return Math.atan2(da.dot(w), da.dot(u)) - Math.atan2(db.dot(w), db.dot(u));
  });
}

export function starFaces(kind) {
  const ico = ICO.map((p) => new THREE.Vector3(...p));
  const faces = [];
  if (kind === 'gi') {
    // Büyük yirmiyüzlü: kenarları 2φ olan 20 üçgen
    const L = 2 * PHI;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
      const a = ico[i], b = ico[j], c = ico[k];
      if ([a.distanceTo(b), b.distanceTo(c), a.distanceTo(c)].every((d) => Math.abs(d - L) < 1e-3)) faces.push({ sides: 3, tris: [[a, b, c]] });
    }
    return faces;
  }
  if (kind === 'gsd') {
    // Büyük yıldızlı onikiyüzlü: onikiyüzlü köşelerinden, her eksende içteki halkadan pentagram
    const dod = DODECA.map((p) => new THREE.Vector3(...p));
    for (const v of ico) {
      const n = v.clone().normalize();
      const pos = dod.map((p) => ({ p, d: p.dot(n) })).filter((q) => q.d > 0.01).sort((a, b) => a.d - b.d);
      const ring = ringOrder(pos.slice(0, 5).map((q) => q.p), n);
      faces.push({ sides: 5, tris: pentagram(ring) });
    }
    return faces;
  }
  // Büyük onikiyüzlü (beşgen) ve küçük yıldızlı onikiyüzlü (pentagram): her köşenin 5 komşusu
  for (const v of ico) {
    const ring = ringOrder(ico.filter((q) => Math.abs(q.distanceTo(v) - 2) < 1e-3), v);
    if (kind === 'gd') {
      const tris = [];
      for (let i = 1; i < 4; i++) tris.push([ring[0], ring[i], ring[i + 1]]);
      faces.push({ sides: 5, tris });
    } else {
      faces.push({ sides: 5, tris: pentagram(ring) });
    }
  }
  return faces;
}

const cache = new Map();

// Dünya boyutunda (çevrel yarıçap = radius) düz gölgeli, renkli geometri
export function solidGeometry(index, radius = 2) {
  const key = index + ':' + radius;
  if (cache.has(key)) return cache.get(key);
  const S = SOLIDS[index];
  const faces = S.star ? starFaces(S.star) : convexFaces(dedupe(S.pts()));
  let maxR = 0;
  for (const f of faces) for (const t of f.tris) for (const v of t) maxR = Math.max(maxR, v.length());
  const k = radius / maxR;
  const pos = [], col = [];
  const c = new THREE.Color();
  faces.forEach((f, fi) => {
    if (S.star) c.setHSL(fi / faces.length, 0.75, 0.55);
    else c.set(SIDE_COLORS[f.sides] || 0xdddddd).offsetHSL(0, 0, ((fi * 37) % 7 - 3) * 0.015);
    for (const t of f.tris) {
      for (const v of t) { pos.push(v.x * k, v.y * k, v.z * k); col.push(c.r, c.g, c.b); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.userData.star = !!S.star;
  cache.set(key, g);
  return g;
}

export const POLY_COUNT = SOLIDS.length;
