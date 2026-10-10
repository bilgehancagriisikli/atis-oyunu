// Diğer oyuncuların 3D karakter modeli.
import * as THREE from 'three';
import { buildWeaponModel } from './weapons.js';
import { PLAYER } from './physics.js';

const tmp = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let _flameTex = null;
function flameTexture() {
  if (_flameTex) return _flameTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,200,120,0.8)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _flameTex = new THREE.CanvasTexture(c);
  return _flameTex;
}

function nameTexture(name, color, hp) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const x = c.getContext('2d');
  x.font = 'bold 30px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 6;
  x.strokeStyle = 'rgba(0,0,0,0.75)';
  x.strokeText(name, 128, 24);
  x.fillStyle = '#' + color.toString(16).padStart(6, '0');
  x.fillText(name, 128, 24);
  x.fillStyle = 'rgba(0,0,0,0.6)';
  x.fillRect(48, 50, 160, 12);
  x.fillStyle = hp > 50 ? '#3ee070' : hp > 25 ? '#f0c030' : '#ff4040';
  x.fillRect(50, 52, 156 * Math.max(0, hp) / 100, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Avatar {
  constructor(scene, info) {
    this.scene = scene;
    this.id = info.id;
    this.name = info.name;
    this.color = info.color;
    this.hp = info.hp ?? 100;
    this.alive = false;
    this.pos = new THREE.Vector3(info.x || 0, info.y || 0, info.z || 0);
    this.target = this.pos.clone();
    this.yaw = info.yaw || 0;
    this.targetYaw = this.yaw;
    this.pitch = 0;
    this.targetPitch = 0;
    this.flags = 0;
    this.walk = 0;
    this.deathT = -1;
    this.protUntil = 0;
    this.frozenUntil = 0;
    this.lastFire = -99;
    this.weaponId = null;
    this.weaponCache = {};
    this.mountKind = null;
    this.vyaw = 0;
    this.targetVyaw = 0;
    this.swingT = 0;

    const body = new THREE.MeshLambertMaterial({ color: info.color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x24272c });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
    const visor = new THREE.MeshBasicMaterial({ color: 0x9ff6ff });
    this.tintMats = [body, dark, skin];
    this.baseColors = this.tintMats.map((m) => m.color.clone());

    const root = new THREE.Group();
    root.rotation.order = 'YXZ'; // ölünce kendi arkasına düşsün
    this.root = root;
    const mk = (geo, mat, x, y, z, parent = root) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Bacaklar (kalçadan döner)
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0.82, 0); root.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0.82, 0); root.add(this.legR);
    mk(new THREE.BoxGeometry(0.2, 0.8, 0.24), dark, 0, -0.4, 0, this.legL);
    mk(new THREE.BoxGeometry(0.2, 0.8, 0.24), dark, 0, -0.4, 0, this.legR);
    mk(new THREE.BoxGeometry(0.22, 0.1, 0.3), dark, 0, -0.78, -0.04, this.legL);
    mk(new THREE.BoxGeometry(0.22, 0.1, 0.3), dark, 0, -0.78, -0.04, this.legR);
    // Gövde
    mk(new THREE.BoxGeometry(0.56, 0.62, 0.3), body, 0, 1.12, 0);
    mk(new THREE.BoxGeometry(0.58, 0.1, 0.32), dark, 0, 0.84, 0);
    mk(new THREE.BoxGeometry(0.4, 0.4, 0.12), dark, 0, 1.14, 0.2);
    // Üst gövde (bakış açısıyla eğilir)
    this.upper = new THREE.Group();
    this.upper.rotation.order = 'YXZ'; // araçta yana/arkaya bakarken nişan ekseni doğru kalsın
    this.upper.position.set(0, 1.38, 0);
    root.add(this.upper);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.04, 0);
    this.upper.add(this.head);
    mk(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin, 0, 0.2, 0, this.head);
    mk(new THREE.BoxGeometry(0.39, 0.16, 0.39), body, 0, 0.36, 0, this.head);
    mk(new THREE.BoxGeometry(0.3, 0.1, 0.05), visor, 0, 0.22, -0.18, this.head);
    // Kollar silahı tutar
    this.arms = new THREE.Group();
    this.arms.position.set(0, -0.04, 0);
    this.upper.add(this.arms);
    const armL = mk(new THREE.BoxGeometry(0.14, 0.14, 0.5), body, -0.22, -0.06, -0.2, this.arms);
    armL.rotation.y = 0.35;
    mk(new THREE.BoxGeometry(0.14, 0.14, 0.5), body, 0.27, -0.06, -0.22, this.arms);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.14, -0.04, -0.5);
    this.gunHolder.scale.setScalar(1.3);
    this.arms.add(this.gunHolder);

    // Jetpack (sırtta iki tüp + alevler)
    this.jet = new THREE.Group();
    const tankMat = new THREE.MeshLambertMaterial({ color: 0xcfd8e3 });
    this.flames = [];
    for (const sx of [-1, 1]) {
      mk(new THREE.CylinderGeometry(0.1, 0.1, 0.48, 10), tankMat, sx * 0.13, 1.17, 0.3, this.jet);
      mk(new THREE.ConeGeometry(0.08, 0.12, 8).rotateX(Math.PI), dark, sx * 0.13, 0.88, 0.3, this.jet);
      const f = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      f.position.set(sx * 0.13, 0.7, 0.3);
      f.scale.set(0.3, 0.55, 1);
      this.jet.add(f);
      this.flames.push(f);
    }
    mk(new THREE.BoxGeometry(0.2, 0.3, 0.1), new THREE.MeshLambertMaterial({ color: 0x3fa9ff }), 0, 1.17, 0.27, this.jet);
    this.jet.visible = false;
    root.add(this.jet);

    // Doğma koruma kalkanı
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 16, 12),
      new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.bubble.position.y = 0.95;
    this.bubble.visible = false;
    root.add(this.bubble);

    // İsim etiketi
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(this.name, this.color, this.hp), depthWrite: false }));
    this.tag.scale.set(1.7, 0.48, 1);
    this.tag.position.y = 2.25;
    this.tag.renderOrder = 6;
    root.add(this.tag);

    root.visible = false;
    root.position.copy(this.pos);
    scene.add(root);
    this.setWeapon('pistol');
  }

  setWeapon(id) {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.weapon) this.gunHolder.remove(this.weapon.group);
    this.weapon = this.weaponCache[id] ||= buildWeaponModel(id);
    this.gunHolder.add(this.weapon.group);
  }

  setHp(hp) {
    if (hp === this.hp) return;
    this.hp = hp;
    const old = this.tag.material.map;
    this.tag.material.map = nameTexture(this.name, this.color, hp);
    old.dispose();
  }

  // Araca bindi / indi. vyaw: aracın yönü (binici kafasını ayrıca çevirebilir)
  setMount(kind, vyaw) {
    if (kind !== this.mountKind) {
      this.mountKind = kind;
      this.vyaw = vyaw;
    }
    this.targetVyaw = vyaw;
  }

  // Kılıç savurma animasyonu
  swing() { this.swingT = 0.3; }

  // Jetpack alev uçlarının dünya konumları (parçacıklar için)
  jetNozzles(a, b) {
    this.root.updateMatrixWorld(true);
    this.flames[0].getWorldPosition(a);
    this.flames[1].getWorldPosition(b);
  }

  setTarget(x, y, z, yaw, pitch, flags) {
    this.target.set(x, y, z);
    this.targetYaw = yaw;
    this.targetPitch = pitch;
    this.flags = flags;
    if (this.pos.distanceToSquared(this.target) > 36) this.pos.copy(this.target);
  }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.target.set(x, y, z);
    this.yaw = this.targetYaw = yaw;
    this.root.position.copy(this.pos);
  }

  spawn(x, y, z, yaw, protUntil) {
    this.teleport(x, y, z, yaw);
    this.alive = true;
    this.deathT = -1;
    this.root.visible = true;
    this.root.rotation.set(0, yaw, 0);
    this.protUntil = protUntil;
    this.frozenUntil = 0;
    this.mountKind = null;
    this.flags = 0;
    this.setHp(100);
  }

  die() {
    this.alive = false;
    this.deathT = 0;
  }

  eye(out) {
    return out.set(this.pos.x, this.pos.y + PLAYER.eye, this.pos.z);
  }

  center(out) {
    return out.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  muzzleWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.weapon.muzzle.getWorldPosition(out);
  }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, now) {
    if (this.deathT >= 0) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      this.root.rotation.x = k * 1.45;
      this.root.position.y = this.pos.y + Math.max(0, this.deathT - 1.4) * -0.8;
      if (this.deathT > 2.6) this.root.visible = false;
      return;
    }
    if (!this.alive) return;
    const a = 1 - Math.exp(-dt * 14);
    const before = tmp.copy(this.pos);
    this.pos.lerp(this.target, a);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    this.yaw += wrap(this.targetYaw - this.yaw) * a;
    this.vyaw += wrap(this.targetVyaw - this.vyaw) * a;
    this.pitch += (this.targetPitch - this.pitch) * a;
    this.pose(dt, now, moved);
  }

  // Kendi karakterimiz (üçüncü şahıs kamerası): ara değer yok, doğrudan konum
  syncLocal(x, y, z, yaw, pitch, flags, mountKind, vyaw, dt, now) {
    const moved = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.pos.set(x, y, z);
    this.target.copy(this.pos);
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = pitch;
    this.flags = flags;
    this.mountKind = mountKind;
    this.vyaw = this.targetVyaw = vyaw;
    this.pose(dt, now, moved);
  }

  pose(dt, now, moved) {
    this.root.position.copy(this.pos);
    this.upper.rotation.x = this.pitch * 0.85;
    if (this.mountKind) {
      // Araçta oturur: gövde araç yönünde, üst gövde bakış yönünde
      this.root.rotation.set(0, this.vyaw, 0);
      this.upper.rotation.y = wrap(this.yaw - this.vyaw);
      const chin = this.mountKind === 'chin';
      this.legL.rotation.set(chin ? 0.9 : 1.25, 0, chin ? -0.55 : -0.12);
      this.legR.rotation.set(chin ? 0.9 : 1.25, 0, chin ? 0.55 : 0.12);
    } else {
      this.root.rotation.set(0, this.yaw, 0);
      this.upper.rotation.y = 0;
      // Yürüme animasyonu
      const speed = moved / Math.max(dt, 1e-4);
      const onGround = (this.flags & 1) !== 0;
      if (onGround && speed > 0.5) this.walk += moved * 2.6;
      const amp = onGround ? Math.min(0.8, speed * 0.09) : 0.35;
      const swing = onGround ? Math.sin(this.walk) * amp : amp;
      this.legL.rotation.set(swing, 0, 0);
      this.legR.rotation.set(onGround ? -swing : -amp * 0.4, 0, 0);
    }
    // Kılıç savurma: kollar yukarıdan aşağı iner
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt);
      const k = 1 - this.swingT / 0.3;
      this.arms.rotation.set(0.9 - Math.sin(k * Math.PI) * 2.0, Math.sin(k * Math.PI) * 0.5, 0);
    } else this.arms.rotation.set(0, 0, 0);
    // Jetpack: bit 4 = takılı, bit 8 = itiş
    this.jet.visible = (this.flags & 4) !== 0;
    const thrust = (this.flags & 8) !== 0;
    for (const f of this.flames) {
      f.visible = thrust;
      if (thrust) f.scale.set(0.28 + Math.random() * 0.08, 0.5 + Math.random() * 0.25, 1);
    }
    // Kalkan + donma
    this.bubble.visible = now < this.protUntil;
    if (this.bubble.visible) this.bubble.material.opacity = 0.12 + Math.sin(now * 12) * 0.06;
    const frozen = now < this.frozenUntil;
    if (frozen !== this.wasFrozen) {
      this.wasFrozen = frozen;
      this.tintMats.forEach((m, i) => {
        if (frozen) m.color.setRGB(0.6, 0.9, 1.0); else m.color.copy(this.baseColors[i]);
      });
    }
    if (this.weapon.spin) this.weapon.spin.rotation.z += dt * (now - this.lastFire < 0.3 ? 30 : 2);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // Zeka küpünün malzeme dizisi ve dokuları ortak önbellekte; dokunma
      if (o.material && !Array.isArray(o.material) && o.material.map) o.material.map.dispose();
    });
  }
}
