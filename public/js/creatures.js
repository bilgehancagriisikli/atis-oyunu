// Anomalocaris: Kambriyen denizlerinin avcısı. Yanlardaki yüzgeç lobları dalga gibi çırparak uçar,
// başın önündeki iki dikenli kolla yakalar. Model −z yönüne bakar.
import * as THREE from 'three';
import { CREATURE } from './npc.js';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

let shared = null;
function parts() {
  if (shared) return shared;
  shared = {
    sphere: new THREE.SphereGeometry(1, 12, 8),
    lobe: new THREE.SphereGeometry(1, 10, 6),
    seg: new THREE.BoxGeometry(1, 1, 1),
    spine: new THREE.ConeGeometry(0.018, 0.12, 4),
    mouth: new THREE.TorusGeometry(0.09, 0.03, 6, 14),
    body: lam(0xb5532e),
    dark: lam(0x7a2f1a),
    lobeMat: lam(0xe0763c, { side: THREE.DoubleSide }),
    arm: lam(0xc98a4a),
    spineMat: lam(0xf0d9a8),
    eye: new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 120 }),
    fan: lam(0x3c6fa8, { side: THREE.DoubleSide }),
  };
  return shared;
}

function buildAnomalocaris() {
  const P = parts();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // Gövde: önden arkaya incelen 11 halka
  const N = 11, L = 1.9;
  const lobesL = [], lobesR = [];
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const z = -0.55 + k * L;
    const w = 0.34 * (1 - k * 0.6), h = 0.2 * (1 - k * 0.45);
    const s = mesh(body, P.sphere, i % 2 ? P.body : P.dark, 0, 0, z);
    s.scale.set(w, h, 0.13);
    // Yanlardaki yüzgeç lobları (her halkada bir çift)
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * w * 0.85, -0.02, z);
      body.add(pivot);
      const lobe = mesh(pivot, P.lobe, P.lobeMat, side * 0.22 * (1 - k * 0.35), 0, 0.03);
      lobe.scale.set(0.24 * (1 - k * 0.35), 0.018, 0.12);
      lobe.castShadow = false;
      (side < 0 ? lobesL : lobesR).push(pivot);
    }
  }
  // Baş kalkanı ve saplı gözler
  const head = mesh(body, P.sphere, P.dark, 0, 0.06, -0.62);
  head.scale.set(0.3, 0.13, 0.24);
  for (const side of [-1, 1]) {
    const stalk = mesh(body, P.seg, P.body, side * 0.22, 0.14, -0.66);
    stalk.scale.set(0.2, 0.045, 0.045);
    stalk.rotation.z = side * 0.35;
    mesh(body, P.sphere, P.eye, side * 0.33, 0.18, -0.66).scale.setScalar(0.07);
  }
  // Alt yüzde ağız (ananas dilimi biçimli halka)
  const mouth = mesh(body, P.mouth, P.spineMat, 0, -0.16, -0.5);
  mouth.rotation.x = Math.PI / 2;
  // Önde iki dikenli yakalama kolu (her biri 12 eklem)
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.12, -0.06, -0.78);
    body.add(arm);
    let parent = arm;
    const joints = [];
    for (let j = 0; j < 12; j++) {
      const joint = new THREE.Group();
      joint.position.z = j === 0 ? 0 : -0.07;
      parent.add(joint);
      const sz = 0.07 * (1 - j * 0.05);
      const seg = mesh(joint, P.seg, P.arm, 0, 0, -0.035);
      seg.scale.set(sz, sz, 0.075);
      seg.castShadow = false;
      if (j > 1) {
        const sp = mesh(joint, P.spine, P.spineMat, side * -0.02, -sz * 0.6, -0.035);
        sp.rotation.x = Math.PI;
        sp.castShadow = false;
      }
      joints.push(joint);
      parent = joint;
    }
    arms.push(joints);
  }
  // Kuyruk yelpazesi: üç çift V biçimli kanat
  const tail = new THREE.Group();
  tail.position.z = L - 0.5;
  body.add(tail);
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const f = mesh(tail, P.lobe, P.fan, side * (0.12 + i * 0.05), 0.02 * i, 0.12 + i * 0.07);
      f.scale.set(0.05, 0.012, 0.26 - i * 0.04);
      f.rotation.y = side * (0.35 + i * 0.22);
      f.castShadow = false;
    }
  }
  root.scale.setScalar(1.05);
  return { root, body, lobesL, lobesR, arms, tail };
}

function barTexture(frac) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = frac > 0.5 ? '#ff9a4d' : frac > 0.25 ? '#f07a30' : '#ff4040';
  x.fillRect(2, 2, 124 * Math.max(0, frac), 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CreatureView {
  constructor(scene, c) {
    this.scene = scene;
    this.m = buildAnomalocaris();
    this.root = this.m.root;
    this.pos = new THREE.Vector3(c.x, c.y, c.z);
    this.target = this.pos.clone();
    this.yaw = this.tYaw = c.yaw || 0;
    this.pitch = 0;
    this.phase = Math.random() * 10;
    this.biteT = 0;
    this.dead = false;
    this.deadT = 0;
    this.vel = new THREE.Vector3();
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTexture(1), depthWrite: false }));
    this.bar.scale.set(1.2, 0.15, 1);
    this.bar.position.y = 0.75;
    this.bar.visible = false;
    this.root.add(this.bar);
    this.barFrac = 1;
    this.setHp(c.hp ?? CREATURE.hp);
    this.root.position.copy(this.pos);
    scene.add(this.root);
  }

  setTarget(x, y, z, yaw) {
    this.target.set(x, y, z);
    this.tYaw = yaw;
  }

  setHp(hp) {
    const frac = Math.round((hp / CREATURE.hp) * 40) / 40;
    this.bar.visible = hp < CREATURE.hp && hp > 0;
    if (frac === this.barFrac) return;
    this.barFrac = frac;
    const old = this.bar.material.map;
    this.bar.material.map = barTexture(frac);
    old.dispose();
  }

  bite() { this.biteT = 0.45; }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.bar.visible = false;
    this.vel.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2);
  }

  center(out) { return out.copy(this.pos); }

  update(dt, t) {
    const m = this.m;
    if (this.dead) {
      // Düşer, döner, söner
      this.deadT += dt;
      this.vel.y -= 14 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.root.rotation.z += dt * 3;
      this.root.position.copy(this.pos);
      this.root.scale.setScalar(Math.max(0.01, 1.05 * (1 - Math.max(0, this.deadT - 1.2) / 0.8)));
      return this.deadT > 2;
    }
    const prev = this.pos.clone();
    this.pos.lerp(this.target, Math.min(1, dt * 10));
    const sp = prev.distanceTo(this.pos) / Math.max(dt, 1e-4);
    let dy = this.tYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 6);
    // Yükselirken / alçalırken burnu o yöne eğilir
    const climb = (this.pos.y - prev.y) / Math.max(dt, 1e-4);
    this.pitch += (Math.max(-0.5, Math.min(0.5, climb * 0.06)) - this.pitch) * Math.min(1, dt * 4);
    this.root.position.copy(this.pos);
    this.root.position.y += Math.sin(t * 2.2 + this.phase) * 0.08;
    this.root.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // Yüzgeç dalgası: önden arkaya ilerler, hızlıyken daha sık
    const f = 7 + Math.min(10, sp) * 0.6;
    this.phase += dt * f;
    m.lobesL.forEach((p, i) => { p.rotation.z = Math.sin(this.phase - i * 0.65) * 0.55; });
    m.lobesR.forEach((p, i) => { p.rotation.z = -Math.sin(this.phase - i * 0.65) * 0.55; });
    m.tail.rotation.y = Math.sin(this.phase * 0.5) * 0.15;
    // Kollar: boşta hafif kıvrık, ısırırken açılıp kapanır
    this.biteT = Math.max(0, this.biteT - dt);
    const b = this.biteT > 0 ? Math.sin((1 - this.biteT / 0.45) * Math.PI) : 0;
    for (const joints of m.arms) {
      joints.forEach((j, k) => {
        if (k === 0) j.rotation.x = 0.5 - b * 1.1;
        else j.rotation.x = -(0.16 + Math.sin(t * 3 + k) * 0.02) * (1 - b * 0.7);
      });
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.root);
    // Geometri ve malzemeler ortak; yalnızca can çubuğunu bırak
    this.bar.material.map.dispose();
    this.bar.material.dispose();
  }
}
