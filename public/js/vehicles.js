// Binilebilen araçlar: motosiklet, dev çinçilla ve Türk avurtlağı. Tanımlar, sürüş fiziği ve 3D modeller.
import * as THREE from 'three';
import { stepCharacter, moveBody } from './physics.js';

// seatOff: binicinin "ayak" noktası (vuruş kutusu, ağ konumu) aracın tabanından bu kadar yukarıda.
// Binici oturur: kalçası (ayaktan 0.82 m yukarıda) eyerin üstündedir.
// body.bounce: engele çarpınca durmak yerine seker. hp: aracın canı. barY: can çubuğunun yüksekliği.
export const VEH = {
  moto: {
    name: 'Motosiklet', bin: 'Motosiklete bin', seatOff: 0.06, reach: 3, tpDist: 5, tpUp: 0.7, hp: 150, barY: 1.7,
    body: { radius: 0.6, height: 2.2, step: 0.6, airStep: 0.3, gravity: 24, snap: 0.65, launch: true, bounce: 0.6 },
    accel: 15, brake: 30, max: 24, boost: 33, rev: 7, turn: 2.3, hop: 6.5,
    hit: { hw: 0.65, y0: 0, y1: 1.15 },
  },
  chin: {
    name: 'Dev Çinçilla', bin: 'Çinçillaya bin', seatOff: 1.58, reach: 4.2, tpDist: 8.5, tpUp: 1.6, hp: 320, barY: 3.4,
    body: {
      radius: 1.05, height: 3.7, step: 0.9, airStep: 0.45, gravity: 24, snap: 0.8,
      jump: 17, groundAccel: 45, airAccel: 14, bounce: 0.55,
    },
    speed: 11, sprint: 15, hop: 0.35, gait: [5, 0.55], stride: 0.6,
    hit: { hw: 1.25, y0: 0.15, y1: 2.6 },
  },
  // Türk avurtlağı (Mesocricetus brandti): çinçilladan hızlı koşar, daha az zıplar
  ham: {
    name: 'Türk Avurtlağı', bin: 'Avurtlağa bin', seatOff: 0.93, reach: 3.6, tpDist: 7, tpUp: 1.2, hp: 240, barY: 2.6,
    body: {
      radius: 0.85, height: 3.0, step: 0.8, airStep: 0.4, gravity: 24, snap: 0.8,
      jump: 11, groundAccel: 60, airAccel: 14, bounce: 0.55,
    },
    speed: 16, sprint: 21, hop: 0.1, gait: [9, 0.8], stride: 0.9,
    hit: { hw: 1.0, y0: 0.1, y1: 1.9 },
  },
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------
// Sürüş fiziği (yalnızca binicinin tarayıcısında çalışır)
// v: {x,y,z,vx,vy,vz,yaw,onGround,lean,speed}
// ------------------------------------------------------------
// inp: {throttle: -1..1, steer: -1..1, hop, boost}
export function stepMoto(world, v, inp, dt) {
  const D = VEH.moto;
  let fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  let vs = v.vx * fx + v.vz * fz;
  if (v.onGround) {
    const max = inp.boost ? D.boost : D.max;
    if (inp.throttle > 0) vs += (vs < 0 ? D.brake : D.accel * (inp.boost ? 1.4 : 1)) * dt;
    else if (inp.throttle < 0) vs -= (vs > 0 ? D.brake : D.accel * 0.6) * dt;
    else vs -= Math.sign(vs) * Math.min(Math.abs(vs), (3 + Math.abs(vs) * 0.25) * dt);
    if (vs > max) vs = Math.max(max, vs - D.brake * 0.5 * dt); // nitro bitince yavaşça düş
    if (vs < -D.rev) vs = -D.rev;
    // Direksiyon: yavaşken dönmez, çok hızlıyken daha geniş döner
    const grip = Math.min(1, Math.abs(vs) / 5) * (Math.abs(vs) > 20 ? 0.75 : 1);
    v.yaw -= inp.steer * D.turn * grip * (vs < 0 ? -1 : 1) * dt;
    fx = -Math.sin(v.yaw); fz = -Math.cos(v.yaw);
    v.vx = fx * vs;
    v.vz = fz * vs;
    if (inp.hop) { v.vy = D.hop; v.onGround = false; v.jumped = true; }
  } else {
    v.yaw -= inp.steer * D.turn * 0.45 * dt;
  }
  moveBody(world, v, dt, D.body);
  fx = -Math.sin(v.yaw); fz = -Math.cos(v.yaw);
  // Engele çarptı: durmaz, seker. Sıyırarak çarpınca burun yeni yöne döner;
  // kafa kafaya çarpınca burun aynı kalır, motor geri seker.
  const impact = v.bounced || 0;
  if (impact > 2) {
    const hs = Math.hypot(v.vx, v.vz);
    if (hs > 1.5 && (v.vx * fx + v.vz * fz) / hs > 0.05) {
      v.yaw = Math.atan2(-v.vx, -v.vz);
      fx = -Math.sin(v.yaw); fz = -Math.cos(v.yaw);
    }
  }
  v.speed = v.vx * fx + v.vz * fz;
  v.crash = impact > 7 ? impact : 0;
  const targetLean = -inp.steer * Math.min(1, Math.abs(vs) / 10) * 0.45 * (v.onGround ? 1 : 0.4);
  v.lean += (targetLean - v.lean) * Math.min(1, dt * 8);
  v.steer = inp.steer;
}

// Binilen hayvanlar (çinçilla, avurtlak). inp: {wx, wz (dünya yönü), sprint, jump}
export function stepAnimal(world, v, inp, dt, kind) {
  const D = VEH[kind];
  const wasGround = v.onGround;
  const fallV = v.vy;
  stepCharacter(world, v, { x: inp.wx, z: inp.wz, speed: inp.sprint ? D.sprint : D.speed, jump: inp.jump && v.onGround }, dt, D.body);
  const hs = Math.hypot(v.vx, v.vz);
  if (hs > 1) v.yaw += wrap(Math.atan2(-v.vx, -v.vz) - v.yaw) * Math.min(1, dt * 7);
  v.speed = hs;
  if (!wasGround && v.onGround) v.landed = Math.min(v.landed || 0, fallV);
  if (wasGround && !v.onGround && v.vy > 5) v.hopped = true;
  v.crash = (v.bounced || 0) > 7 ? v.bounced : 0;
}

// ------------------------------------------------------------
// Modeller (-Z yönüne bakar, orijin yerde)
// ------------------------------------------------------------
const lam = (color, flat = false) => new THREE.MeshLambertMaterial({ color, flatShading: flat });
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildMoto(color) {
  const root = new THREE.Group();
  const lean = new THREE.Group(); // yatma ekseni: yerdeki ön-arka çizgi
  root.add(lean);
  const paint = lam(color), dark = lam(0x1c1d20), chrome = lam(0xb9c0c8), rubber = lam(0x111111);
  const wheels = [];
  for (const z of [-0.78, 0.72]) {
    const w = new THREE.Group();
    w.position.set(0, 0.38, z);
    mesh(w, new THREE.TorusGeometry(0.29, 0.09, 8, 18).rotateY(Math.PI / 2), rubber, 0, 0, 0);
    mesh(w, new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10).rotateZ(Math.PI / 2), chrome, 0, 0, 0);
    for (let i = 0; i < 3; i++) mesh(w, new THREE.BoxGeometry(0.03, 0.5, 0.04), chrome, 0, 0, 0, (i / 3) * Math.PI);
    lean.add(w);
    wheels.push(w);
  }
  // Gövde
  mesh(lean, new THREE.BoxGeometry(0.12, 0.12, 1.25), dark, 0, 0.62, 0.0, -0.18);
  mesh(lean, new THREE.BoxGeometry(0.32, 0.3, 0.38), lam(0x4a4f57), 0, 0.5, 0.02);
  mesh(lean, new THREE.BoxGeometry(0.34, 0.24, 0.55), paint, 0, 0.86, -0.22);
  mesh(lean, new THREE.BoxGeometry(0.28, 0.1, 0.6), dark, 0, 0.9, 0.3);
  mesh(lean, new THREE.BoxGeometry(0.22, 0.08, 0.45), paint, 0, 0.78, 0.66, 0.25);
  mesh(lean, new THREE.CylinderGeometry(0.045, 0.06, 0.6, 8).rotateX(Math.PI / 2), chrome, 0.2, 0.36, 0.42);
  // Ön çatal + gidon (direksiyon ile döner)
  const fork = new THREE.Group();
  fork.position.set(0, 0.38, -0.78);
  mesh(fork, new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), chrome, 0.1, 0.38, 0.12, -0.3);
  mesh(fork, new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), chrome, -0.1, 0.38, 0.12, -0.3);
  mesh(fork, new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6).rotateZ(Math.PI / 2), dark, 0, 0.72, 0.24);
  mesh(fork, new THREE.SphereGeometry(0.09, 10, 8), basic(0xfff3c4), 0, 0.55, -0.02);
  mesh(fork, new THREE.BoxGeometry(0.26, 0.16, 0.12), paint, 0, 0.58, 0.05);
  lean.add(fork);
  mesh(lean, new THREE.BoxGeometry(0.12, 0.05, 0.04), basic(0xff2020), 0, 0.85, 0.92);
  return { root, lean, wheels, fork };
}

function buildChin() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // zıplama ile sıçrar / ezilir
  root.add(body);
  const fur = lam(0x9e9c98), furDark = lam(0x7d7b78), belly = lam(0xece6dc), pink = lam(0xf2b3be);
  const black = basic(0x0b0b0b), white = basic(0xffffff);
  const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  // Gövde
  const torso = mesh(body, sph(1, 22, 16), fur, 0, 1.35, 0.15);
  torso.scale.set(1.15, 1.0, 1.4);
  const bel = mesh(body, sph(0.9, 18, 12), belly, 0, 1.05, -0.35);
  bel.scale.set(0.95, 0.8, 1.0);
  // Kafa
  const head = new THREE.Group();
  head.position.set(0, 2.0, -1.2);
  body.add(head);
  const skull = mesh(head, sph(0.78, 20, 14), fur, 0, 0, 0);
  skull.scale.set(1, 0.92, 1.05);
  const snout = mesh(head, sph(0.46), belly, 0, -0.2, -0.62);
  snout.scale.set(1.15, 0.8, 0.8);
  mesh(head, sph(0.09, 8, 6), pink, 0, -0.08, -0.98);
  mesh(head, new THREE.BoxGeometry(0.07, 0.12, 0.04), white, -0.045, -0.45, -0.88);
  mesh(head, new THREE.BoxGeometry(0.07, 0.12, 0.04), white, 0.045, -0.45, -0.88);
  for (const sx of [-1, 1]) {
    mesh(head, sph(0.14, 10, 8), black, sx * 0.4, 0.15, -0.58);
    mesh(head, sph(0.045, 6, 5), white, sx * 0.43, 0.21, -0.7);
  }
  // Bıyıklar
  const wp = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      wp.push(new THREE.Vector3(sx * 0.25, -0.2 + i * 0.05, -0.9), new THREE.Vector3(sx * 1.05, -0.32 + i * 0.16, -0.75));
    }
  }
  head.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), new THREE.LineBasicMaterial({ color: 0x333333 })));
  // Kocaman yuvarlak kulaklar
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.42, 0.6, 0.12);
    e.rotation.z = -sx * 0.35;
    const outer = mesh(e, sph(0.5, 16, 12), fur, 0, 0.42, 0);
    outer.scale.set(1, 1.15, 0.25);
    const inner = mesh(e, sph(0.4, 14, 10), pink, 0, 0.42, -0.07);
    inner.scale.set(0.9, 1.05, 0.15);
    head.add(e);
    ears.push(e);
  }
  // Ön patiler
  const paws = [];
  for (const sx of [-1, 1]) {
    const p = mesh(body, sph(0.22, 10, 8), belly, sx * 0.38, 0.25, -1.15);
    p.scale.set(1, 0.8, 1.3);
    paws.push(p);
  }
  // Arka bacaklar (zıplarken uzanır)
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.72, 0.85, 0.55);
    const thigh = mesh(l, sph(0.55, 14, 10), fur, 0, 0, 0);
    thigh.scale.set(0.8, 1, 1.1);
    const foot = mesh(l, sph(0.3, 10, 8), furDark, 0, -0.65, -0.2);
    foot.scale.set(1.1, 0.7, 2.2);
    body.add(l);
    legs.push(l);
  }
  // Kabarık kıvrık kuyruk
  const tail = new THREE.Group();
  tail.position.set(0, 1.25, 1.45);
  body.add(tail);
  for (let i = 0; i < 6; i++) {
    const a = i / 5;
    mesh(tail, sph(0.34 - a * 0.1, 10, 8), i > 3 ? furDark : fur, 0, Math.sin(a * 2.2) * 1.2, a * 0.75 - Math.sin(a * 3) * 0.2);
  }
  // Eyer
  mesh(body, new THREE.CylinderGeometry(0.62, 0.62, 0.12, 18), lam(0xc0392b), 0, 2.33, 0.15);
  mesh(body, new THREE.BoxGeometry(0.8, 0.18, 0.9), lam(0x7a4a22), 0, 2.42, 0.15);
  mesh(body, new THREE.BoxGeometry(0.5, 0.2, 0.12), lam(0x5a3416), 0, 2.58, -0.22);
  return { root, body, head, ears, paws, legs, tail };
}

// Türk avurtlağı: altın-kahve sırt, siyah göğüs, beyaz kocaman avurtlar, küçük yuvarlak kulaklar
function buildHam() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = lam(0xb07a45), furDark = lam(0x8a5a30), black = lam(0x1e1a17), cream = lam(0xf3ede3);
  const pink = lam(0xf0a8b4), eye = basic(0x0b0b0b), white = basic(0xffffff);
  const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const torso = mesh(body, sph(0.85, 22, 16), fur, 0, 0.95, 0.1);
  torso.scale.set(1.0, 0.85, 1.3);
  const chest = mesh(body, sph(0.7, 16, 12), black, 0, 0.82, -0.62);
  chest.scale.set(0.82, 0.62, 0.5);
  const belly = mesh(body, sph(0.7, 16, 12), lam(0xd9cfc0), 0, 0.62, 0.2);
  belly.scale.set(0.85, 0.5, 1.0);
  const head = new THREE.Group();
  head.position.set(0, 1.42, -0.95);
  body.add(head);
  const skull = mesh(head, sph(0.55, 18, 14), fur, 0, 0, 0);
  skull.scale.set(1, 0.92, 1.05);
  // Avurtlar (yanak keseleri)
  for (const sx of [-1, 1]) {
    const cheek = mesh(head, sph(0.36, 14, 10), cream, sx * 0.42, -0.14, -0.12);
    cheek.scale.set(0.9, 0.85, 1.1);
    const stripe = mesh(head, sph(0.14, 10, 8), black, sx * 0.47, 0.02, -0.28);
    stripe.scale.set(0.4, 0.5, 1.4);
    mesh(head, sph(0.085, 8, 6), eye, sx * 0.24, 0.16, -0.43);
    mesh(head, sph(0.03, 6, 5), white, sx * 0.26, 0.2, -0.5);
  }
  const snout = mesh(head, sph(0.24), cream, 0, -0.12, -0.48);
  snout.scale.set(1.1, 0.85, 0.9);
  mesh(head, sph(0.06, 8, 6), pink, 0, -0.05, -0.7);
  const wp = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) wp.push(new THREE.Vector3(sx * 0.15, -0.12 + i * 0.04, -0.62), new THREE.Vector3(sx * 0.7, -0.22 + i * 0.12, -0.5));
  }
  head.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), new THREE.LineBasicMaterial({ color: 0x222222 })));
  const ears = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.32, 0.42, 0.12);
    const outer = mesh(e, sph(0.18, 10, 8), furDark, 0, 0.1, 0);
    outer.scale.set(1, 1, 0.35);
    const inner = mesh(e, sph(0.13, 10, 8), pink, 0, 0.1, -0.04);
    inner.scale.set(0.9, 0.9, 0.2);
    head.add(e);
    ears.push(e);
  }
  const paws = [];
  for (const sx of [-1, 1]) {
    const p = mesh(body, sph(0.16, 10, 8), pink, sx * 0.34, 0.15, -0.8);
    p.scale.set(1, 0.7, 1.3);
    paws.push(p);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.5, 0.5, 0.55);
    const thigh = mesh(l, sph(0.36, 12, 10), fur, 0, 0, 0);
    thigh.scale.set(0.8, 1, 1.05);
    const foot = mesh(l, sph(0.17, 10, 8), pink, 0, -0.38, -0.12);
    foot.scale.set(1, 0.6, 1.8);
    body.add(l);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.85, 1.12);
  body.add(tail);
  mesh(tail, sph(0.13, 8, 6), furDark, 0, 0, 0);
  // Eyer
  mesh(body, new THREE.CylinderGeometry(0.55, 0.55, 0.1, 18), lam(0x2e7d32), 0, 1.66, 0.12);
  mesh(body, new THREE.BoxGeometry(0.72, 0.16, 0.8), lam(0x7a4a22), 0, 1.74, 0.12);
  mesh(body, new THREE.BoxGeometry(0.45, 0.18, 0.1), lam(0x5a3416), 0, 1.88, -0.2);
  return { root, body, head, ears, paws, legs, tail };
}

// Can çubuğu (araç hasar görünce üstünde belirir)
function barTexture(frac) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = frac > 0.5 ? '#3ee070' : frac > 0.25 ? '#f0c030' : '#ff4040';
  x.fillRect(2, 2, 124 * Math.max(0, frac), 12);
  return new THREE.CanvasTexture(c);
}

// Aracın sahnedeki görünümü
export class VehicleView {
  constructor(scene, kind, color) {
    this.scene = scene;
    this.kind = kind;
    this.m = kind === 'moto' ? buildMoto(color) : kind === 'ham' ? buildHam() : buildChin();
    this.root = this.m.root;
    this.phase = 0;
    this.squash = 0;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTexture(1), depthWrite: false }));
    this.bar.scale.set(1.4, 0.18, 1);
    this.bar.position.y = VEH[kind].barY;
    this.bar.visible = false;
    this.bar.renderOrder = 6;
    this.root.add(this.bar);
    this.barShow = false;
    this.barHidden = false;
    scene.add(this.root);
  }

  // Binildiğinde çubuk binicinin başının üstüne çıkar; kendi aracımızda gizli (HUD'da gösterilir)
  placeBar(ridden, hidden) {
    this.bar.position.y = ridden ? VEH[this.kind].seatOff + 2.2 : VEH[this.kind].barY;
    this.barHidden = hidden;
    this.bar.visible = this.barShow && !hidden;
  }

  setHp(hp, max) {
    const frac = Math.round((hp / max) * 40) / 40;
    this.barShow = hp < max && hp > 0;
    this.bar.visible = this.barShow && !this.barHidden;
    if (frac === this.barFrac) return;
    this.barFrac = frac;
    const old = this.bar.material.map;
    this.bar.material.map = barTexture(frac);
    old.dispose();
  }

  setPose(x, y, z, yaw) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  // s: {speed, onGround, steer, lean, ridden}
  animate(dt, t, s) {
    const m = this.m;
    if (this.kind === 'moto') {
      for (const w of m.wheels) w.rotation.x -= (s.speed / 0.38) * dt;
      m.lean.rotation.z = s.lean || 0;
      m.fork.rotation.y = -(s.steer || 0) * 0.35;
      // Park halinde yana yatık dursun
      if (!s.ridden) m.lean.rotation.z = 0.18;
      return;
    }
    // Hayvan yürüyüşü: çinçilla sıçrar, avurtlak hızlı hızlı koşturur
    const D = VEH[this.kind];
    const sp = Math.abs(s.speed);
    const moving = s.onGround && sp > 0.8;
    if (moving) this.phase += dt * (D.gait[0] + sp * D.gait[1]);
    const hop = moving ? Math.abs(Math.sin(this.phase)) : 0;
    this.squash = Math.max(0, this.squash - dt * 4);
    const air = !s.onGround;
    m.body.position.y = hop * D.hop;
    const breathe = 1 + Math.sin(t * 2.2) * 0.015;
    m.body.scale.set(breathe + this.squash * 0.15, (air ? 1.05 : 1) * breathe - this.squash * 0.18, air ? 1.06 : 1);
    for (let i = 0; i < 2; i++) {
      // Avurtlak bacakları sırayla, çinçillanınki birlikte
      const ph = this.kind === 'ham' ? this.phase + i * Math.PI : this.phase;
      m.legs[i].rotation.x = air ? 0.7 : moving ? Math.sin(ph) * D.stride : 0;
      if (m.pawZ === undefined) m.pawZ = m.paws[0].position.z;
      m.paws[i].position.z = m.pawZ + (moving ? Math.cos(ph) * 0.15 : 0);
      m.ears[i].rotation.x = air ? 0.55 : moving ? Math.sin(this.phase * 2) * 0.15 : Math.sin(t * 1.3 + i) * 0.05;
    }
    m.head.rotation.x = air ? -0.15 : 0;
    m.tail.rotation.y = Math.sin(t * 1.6) * 0.25;
    m.tail.rotation.x = air ? -0.4 : 0;
  }

  land(strength) { this.squash = Math.min(1, strength); }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
