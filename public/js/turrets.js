// Kurulabilen taretlerin modelleri: mantar (havan topu) ve Tullimonstrum (tabanca).
import * as THREE from 'three';
import { TURRET } from './npc.js';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Can çubuğu dokusu (araçlarınkiyle aynı görünüm)
function barTexture(frac) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = frac > 0.5 ? '#ffb347' : frac > 0.25 ? '#f07a30' : '#ff4040';
  x.fillRect(2, 2, 124 * Math.max(0, frac), 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Kırmızı şapkalı, beyaz benekli mantar. Şapkanın tepesindeki ağız havan topunun namlusu.
function buildMushroom(color) {
  const root = new THREE.Group();
  const cream = lam(0xf3e6cf), capMat = lam(0xd8342a), spotMat = lam(0xfaf7ef), dark = lam(0x2a1a14);
  // Taban (volva) ve sap
  mesh(root, new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), cream, 0, 0, 0);
  const stem = mesh(root, new THREE.CylinderGeometry(0.2, 0.28, 1.1, 14), cream, 0, 0.6, 0);
  // Sapın üstündeki etek (annulus) ve sahibin rengi
  mesh(root, new THREE.CylinderGeometry(0.3, 0.24, 0.06, 16), cream, 0, 0.92, 0);
  mesh(root, new THREE.CylinderGeometry(0.215, 0.235, 0.12, 14), lam(color), 0, 0.42, 0);
  // Şapka: bastırılmış yarım küre + alt yüzde lameller
  const cap = new THREE.Group();
  cap.position.y = 1.12;
  root.add(cap);
  mesh(cap, new THREE.SphereGeometry(0.78, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), capMat, 0, 0, 0);
  const gills = mesh(cap, new THREE.CircleGeometry(0.77, 28).rotateX(Math.PI / 2), lam(0xe9d6b6, { side: THREE.DoubleSide }), 0, 0.005, 0);
  gills.castShadow = false;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const l = mesh(cap, new THREE.BoxGeometry(0.012, 0.02, 0.5), lam(0xcbb596), Math.sin(a) * 0.45, -0.005, Math.cos(a) * 0.45);
    l.rotation.y = a;
    l.castShadow = false;
  }
  // Beyaz benekler (sabit dağılım)
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39996, el = 0.25 + ((i * 0.37) % 1) * 0.95;
    const n = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const s = mesh(cap, new THREE.SphereGeometry(0.075 + (i % 3) * 0.02, 8, 6).scale(1, 0.35, 1), spotMat,
      n.x * 0.78, n.y * 0.78 * 0.62, n.z * 0.78);
    // Basık yarım kürenin yüzey normali boyunca yatır
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y / 0.62, n.z).normalize());
    s.castShadow = false;
  }
  // Havan namlusu: şapkanın tepesinden çıkan kısa koyu boru
  const tube = new THREE.Group();
  tube.position.y = 0.44;
  cap.add(tube);
  mesh(tube, new THREE.CylinderGeometry(0.15, 0.17, 0.26, 14, 1, true), lam(0x5b2a20, { side: THREE.DoubleSide }), 0, 0.08, 0);
  mesh(tube, new THREE.CircleGeometry(0.15, 14).rotateX(-Math.PI / 2), dark, 0, 0.05, 0);
  mesh(tube, new THREE.TorusGeometry(0.16, 0.025, 6, 16).rotateX(Math.PI / 2), lam(0xf3e6cf), 0, 0.21, 0);
  // Dipte küçük mantarlar
  for (const [x, z, s] of [[0.42, 0.12, 0.5], [-0.3, 0.36, 0.38], [-0.12, -0.44, 0.44]]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    mesh(g, new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), cream, 0, 0.2, 0);
    mesh(g, new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), capMat, 0, 0.38, 0);
    root.add(g);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.25, 0);
  tube.add(muzzle);
  return { root, cap, stem, tube, muzzle, yawPart: null, pitchPart: null };
}

// Tullimonstrum (Tully canavarı): halkalı uzun gövde, iki yana uzanan göz çubuğu,
// ucunda dişli kıskaç olan uzun hortum. Hortum namludur.
function buildTully(color) {
  const root = new THREE.Group();
  const body = lam(0x7d6a8a), stripe = lam(0x5b4a68), pale = lam(0xb7a8c4), black = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 90 });
  const metal = lam(0x50565e);
  // Üç ayak + direk
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(root, new THREE.CylinderGeometry(0.035, 0.045, 0.8, 6), metal, Math.sin(a) * 0.28, 0.36, Math.cos(a) * 0.28);
    leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
  }
  mesh(root, new THREE.CylinderGeometry(0.07, 0.09, 0.95, 8), metal, 0, 0.62, 0);
  mesh(root, new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), lam(color), 0, 0.85, 0);
  // Dönen kafa (yaw) ve eğilen gövde (pitch)
  const yawPart = new THREE.Group();
  yawPart.position.y = 1.15;
  root.add(yawPart);
  mesh(yawPart, new THREE.SphereGeometry(0.11, 10, 8), metal, 0, -0.05, 0);
  const pitchPart = new THREE.Group();
  yawPart.add(pitchPart);
  // Halkalı gövde: önden (−z) arkaya incelen segmentler
  const N = 10;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const r = 0.17 * (1 - Math.abs(k - 0.32) * 0.95) + 0.05;
    const seg = mesh(pitchPart, new THREE.SphereGeometry(1, 12, 8), i % 2 ? stripe : body, 0, 0.12, -0.32 + k * 1.05);
    seg.scale.set(r * 1.25, r, 0.085);
  }
  // Kuyruk yüzgeçleri (eşkenar dörtgen) ve dikey yüzgeç
  for (const s of [-1, 1]) {
    const fin = mesh(pitchPart, new THREE.BoxGeometry(0.34, 0.02, 0.22), pale, s * 0.17, 0.12, 0.78);
    fin.rotation.y = s * 0.7;
  }
  const vfin = mesh(pitchPart, new THREE.BoxGeometry(0.02, 0.2, 0.18), pale, 0, 0.24, 0.72);
  vfin.rotation.x = -0.4;
  // Göz çubuğu: gövdenin önüne çaprazlama uzanan çubuk, uçlarında gözler
  mesh(pitchPart, new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8).rotateZ(Math.PI / 2), body, 0, 0.26, -0.18);
  for (const s of [-1, 1]) mesh(pitchPart, new THREE.SphereGeometry(0.07, 10, 8), black, s * 0.48, 0.26, -0.18);
  // Hortum (namlu) ve ucunda kıskaç
  mesh(pitchPart, new THREE.CylinderGeometry(0.03, 0.045, 0.62, 8).rotateX(Math.PI / 2), pale, 0, 0.12, -0.62);
  const claw = new THREE.Group();
  claw.position.set(0, 0.12, -0.95);
  pitchPart.add(claw);
  const jaws = [];
  for (const s of [-1, 1]) {
    const jaw = new THREE.Group();
    jaw.position.y = s * 0.025;
    claw.add(jaw);
    mesh(jaw, new THREE.BoxGeometry(0.07, 0.025, 0.14), stripe, 0, s * 0.012, -0.06);
    for (let k = 0; k < 3; k++) {
      const tooth = mesh(jaw, new THREE.ConeGeometry(0.012, 0.035, 5), lam(0xf4f0e6), -0.024 + k * 0.024, -s * 0.012, -0.1);
      tooth.rotation.x = s > 0 ? Math.PI : 0;
    }
    jaws.push(jaw);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.16);
  claw.add(muzzle);
  return { root, yawPart, pitchPart, claw, jaws, muzzle };
}

export class TurretView {
  constructor(scene, kind, color) {
    this.scene = scene;
    this.kind = kind;
    this.m = kind === 'mush' ? buildMushroom(color) : buildTully(color);
    this.root = this.m.root;
    this.yaw = 0; this.pitch = 0; this.tYaw = 0; this.tPitch = 0;
    this.kick = 0;
    this.born = performance.now() / 1000;
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTexture(1), depthWrite: false }));
    this.bar.scale.set(1.2, 0.15, 1);
    this.bar.position.y = 2.25;
    this.bar.visible = false;
    this.root.add(this.bar);
    this.barFrac = 1;
    scene.add(this.root);
  }

  setPose(x, y, z, yaw) {
    this.root.position.set(x, y, z);
    this.yaw = this.tYaw = yaw;
    if (this.m.yawPart) this.m.yawPart.rotation.y = yaw;
  }

  aim(yaw, pitch) { this.tYaw = yaw; this.tPitch = pitch; }

  fire() { this.kick = 1; }

  setHp(hp) {
    const max = TURRET[this.kind].hp;
    const frac = Math.round((hp / max) * 40) / 40;
    this.bar.visible = hp < max && hp > 0;
    if (frac === this.barFrac) return;
    this.barFrac = frac;
    const old = this.bar.material.map;
    this.bar.material.map = barTexture(frac);
    old.dispose();
  }

  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.m.muzzle.getWorldPosition(out);
  }

  update(dt, t) {
    const m = this.m;
    // Kurulurken yerden büyüyerek çıkar
    const grow = Math.min(1, (t - this.born) / 0.5);
    this.root.scale.setScalar(0.2 + 0.8 * (1 - Math.pow(1 - grow, 3)));
    this.kick = Math.max(0, this.kick - dt * 4);
    if (this.kind === 'mush') {
      // Atışta şapka basılır, sonra yaylanır; boşta hafifçe nefes alır
      const breathe = 1 + Math.sin(t * 1.7) * 0.02;
      m.cap.scale.set(1 + this.kick * 0.12, breathe * (1 - this.kick * 0.22), 1 + this.kick * 0.12);
    } else {
      const k = Math.min(1, dt * TURRET.tully.turn);
      let dy = this.tYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * k;
      this.pitch += (this.tPitch - this.pitch) * k;
      m.yawPart.rotation.y = this.yaw;
      m.pitchPart.rotation.x = this.pitch;
      m.pitchPart.position.z = this.kick * 0.08;
      const open = this.kick > 0.5 ? (1 - this.kick) * 2 : this.kick * 0.6;
      m.jaws[0].rotation.x = -open * 0.6;
      m.jaws[1].rotation.x = open * 0.6;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

// Elde taşınan taret eşyası (silah görünümü için küçük model)
export function turretItemModel(kind, color = 0xffffff) {
  const m = kind === 'mush' ? buildMushroom(color) : buildTully(color);
  m.root.scale.setScalar(0.17);
  m.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return m.root;
}
