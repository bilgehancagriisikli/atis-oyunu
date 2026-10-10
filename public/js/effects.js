// Görsel efektler: parçacıklar, izler, ışınlar, patlamalar, kara delik.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const _spriteTmp = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

// ------------------------------------------------------------
class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('size', this.aSize);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } },
      vertexShader: `
        attribute float size; attribute vec4 pcolor; varying vec4 vColor; uniform float scale;
        void main() {
          vColor = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, alpha = 1, grav = 0, drag = 0) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.grav[i] = grav; this.drag[i] = drag;
    this.rgb[i * 3] = color.r; this.rgb[i * 3 + 1] = color.g; this.rgb[i * 3 + 2] = color.b;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.rgb[to * 3 + k] = this.rgb[from * 3 + k];
    }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.count--;
        if (i !== this.count) this.copy(this.count, i);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.rgb[i * 3];
      this.col[i * 4 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 4 + 2] = this.rgb[i * 3 + 2];
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * Math.min(1, t * 12 + 0.3);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// Silindir parçası havuzu (izler, şimşek, raylı top)
class SegmentPool {
  constructor(scene, n) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    geo.translate(0, 0.5, 0);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      scene.add(m);
      this.items.push({ m, life: 0, max: 1, op: 1 });
    }
    this.next = 0;
  }

  add(a, b, color, width, life, opacity = 1) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    placeSegment(it.m, a, b, width);
    it.m.material.color.set(color);
    it.m.material.opacity = opacity;
    it.m.visible = true;
    it.life = it.max = life;
    it.op = opacity;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.life -= dt;
      if (it.life <= 0) { it.m.visible = false; continue; }
      it.m.material.opacity = it.op * (it.life / it.max);
    }
  }
}

export function placeSegment(m, a, b, width) {
  tmpV.subVectors(b, a);
  const len = tmpV.length();
  m.position.copy(a);
  if (len > 1e-5) {
    tmpQ.setFromUnitVectors(UP, tmpV.multiplyScalar(1 / len));
    m.quaternion.copy(tmpQ);
  }
  m.scale.set(width, Math.max(len, 1e-3), width);
}

// ------------------------------------------------------------
export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.glowTex = glowTexture();
    this.add = new Particles(scene, quality === 'low' ? 1500 : 4000, true);
    this.smoke = new Particles(scene, quality === 'low' ? 600 : 1500, false);
    this.segs = new SegmentPool(scene, 160);
    this.sprites = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.visible = false;
      s.renderOrder = 5;
      scene.add(s);
      this.sprites.push({ s, life: 0, max: 1, s0: 1, s1: 1 });
    }
    this.spriteNext = 0;
    this.lights = [];
    const nLights = quality === 'low' ? 0 : 4;
    for (let i = 0; i < nLights; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 20, 1.6);
      scene.add(l);
      this.lights.push({ l, life: 0, max: 1, i0: 0 });
    }
    this.lightNext = 0;
    // Patlama küreleri
    this.balls = [];
    const ballGeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({
        color: 0xffaa44, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.balls.push({ m, life: 0, max: 1, r: 1 });
    }
    this.ballNext = 0;
    this.blackholes = [];
    this.c = new THREE.Color();
  }

  color(hex) { return this.c.set(hex); }

  sprite(pos, color, size0, size1, life, opacity = 1) {
    const it = this.sprites[this.spriteNext];
    this.spriteNext = (this.spriteNext + 1) % this.sprites.length;
    it.s.position.copy(pos);
    it.s.material.color.set(color);
    it.s.material.opacity = opacity;
    it.s.scale.setScalar(size0);
    it.s.visible = true;
    it.life = it.max = life; it.s0 = size0; it.s1 = size1; it.op = opacity;
    return it;
  }

  flash(pos, color, intensity, range, life) {
    if (!this.lights.length) return;
    const it = this.lights[this.lightNext];
    this.lightNext = (this.lightNext + 1) % this.lights.length;
    it.l.position.copy(pos);
    it.l.color.set(color);
    it.l.distance = range;
    it.l.intensity = intensity;
    it.life = it.max = life; it.i0 = intensity;
  }

  tracer(a, b, color, width = 0.02) {
    this.segs.add(a, b, color, width, 0.08, 0.9);
  }

  muzzle(pos, color, big = false) {
    this.sprite(pos, color, big ? 0.5 : 0.3, big ? 0.9 : 0.5, 0.06, 1);
    this.flash(pos, color, big ? 30 : 12, 8, 0.06);
  }

  impact(pos, normal, color) {
    const c = this.color(color);
    const n = this.quality === 'low' ? 4 : 8;
    for (let i = 0; i < n; i++) {
      this.add.spawn(pos.x, pos.y, pos.z,
        normal.x * 3 + (Math.random() - 0.5) * 5, normal.y * 3 + Math.random() * 4, normal.z * 3 + (Math.random() - 0.5) * 5,
        0.25 + Math.random() * 0.2, 0.09, 0.02, c, 1, 14, 2);
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, normal.x * 0.6, 0.6, normal.z * 0.6, 0.6, 0.25, 0.7, this.color(0x999999), 0.5, -0.5, 1);
    this.sprite(pos, color, 0.25, 0.05, 0.08);
  }

  hitPlayer(pos, color = 0xff4444) {
    const c = this.color(color);
    for (let i = 0; i < 10; i++) {
      this.add.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5,
        0.3 + Math.random() * 0.2, 0.12, 0.03, c, 1, 12, 2);
    }
  }

  explosion(pos, radius, color = 0xff8a2a) {
    const b = this.balls[this.ballNext];
    this.ballNext = (this.ballNext + 1) % this.balls.length;
    b.m.position.copy(pos);
    b.m.material.color.set(color);
    b.m.visible = true;
    b.life = b.max = 0.35; b.r = radius * 0.65;
    this.flash(pos, color, 120, radius * 5, 0.35);
    this.sprite(pos, 0xffffff, radius * 1.2, radius * 2.4, 0.25, 0.9);
    const fire = this.color(color).clone();
    const n = this.quality === 'low' ? 30 : 70;
    for (let i = 0; i < n; i++) {
      const v = randDir(tmpV).multiplyScalar(radius * (1.2 + Math.random() * 2.2));
      this.add.spawn(pos.x, pos.y, pos.z, v.x, v.y + 2, v.z, 0.4 + Math.random() * 0.5, 0.6, 0.1, fire, 1, 6, 3);
    }
    const grey = this.color(0x555555).clone();
    for (let i = 0; i < n / 3; i++) {
      const v = randDir(tmpV).multiplyScalar(radius * 0.5);
      this.smoke.spawn(pos.x + v.x * 0.3, pos.y + v.y * 0.3, pos.z + v.z * 0.3, v.x, Math.abs(v.y) + 1.5, v.z,
        1.2 + Math.random(), 1.2, 3.5, grey, 0.55, -0.6, 1.5);
    }
  }

  rail(a, b, color) {
    this.segs.add(a, b, 0xffffff, 0.04, 0.35, 1);
    this.segs.add(a, b, color, 0.14, 0.7, 0.7);
    const c = this.color(color).clone();
    const dir = tmpV.subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    if (side.lengthSq() < 0.1) side.set(1, 0, 0);
    const up2 = new THREE.Vector3().crossVectors(side, dir);
    const steps = Math.min(240, Math.floor(len * 3));
    for (let i = 0; i < steps; i++) {
      const t = i / 3;
      const ang = t * 2.2;
      const p = a.clone().addScaledVector(dir, t)
        .addScaledVector(side, Math.cos(ang) * 0.18).addScaledVector(up2, Math.sin(ang) * 0.18);
      this.add.spawn(p.x, p.y, p.z, side.x * Math.cos(ang) * 0.4, 0.2, side.z * Math.cos(ang) * 0.4,
        0.6 + Math.random() * 0.4, 0.12, 0.02, c, 0.9, 0, 0.5);
    }
  }

  lightning(points, color) {
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const len = a.distanceTo(b);
        const n = Math.max(3, Math.floor(len / 1.4));
        let prev = a.clone();
        for (let j = 1; j <= n; j++) {
          const p = a.clone().lerp(b, j / n);
          if (j < n) p.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.9));
          this.segs.add(prev, p, k ? 0xffffff : color, k ? 0.025 : 0.07, 0.2, k ? 1 : 0.8);
          prev = p;
        }
        this.sprite(b, color, 0.8, 0.2, 0.2);
      }
    }
    const last = points[points.length - 1];
    this.flash(last, color, 25, 10, 0.15);
  }

  dust(pos) {
    const c = this.color(0xb8ab90).clone();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn(pos.x, pos.y + 0.1, pos.z, Math.cos(a) * 3, 0.4, Math.sin(a) * 3, 0.8, 0.5, 1.4, c, 0.5, 0, 3);
    }
  }

  pickup(pos, color) {
    const c = this.color(color).clone();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(a) * 3, 2 + Math.random() * 2, Math.sin(a) * 3, 0.5, 0.18, 0.02, c, 1, 4, 2);
    }
    this.sprite(pos, color, 1.5, 0.2, 0.3);
  }

  spawnFx(pos, color) {
    const c = this.color(color).clone();
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.6;
      this.add.spawn(pos.x + Math.cos(a) * r, pos.y + Math.random() * 1.8, pos.z + Math.sin(a) * r,
        0, 1.5 + Math.random() * 2, 0, 0.7, 0.15, 0.02, c, 1, 0, 0);
    }
  }

  // Kalıcı ışın (lazer / dondurucu)
  makeBeam() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geo.translate(0, 0.5, 0);
    const mk = (op) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 4;
      this.scene.add(m);
      return m;
    };
    const core = mk(1), outer = mk(0.45);
    const end = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    end.visible = false;
    this.scene.add(end);
    const fx = this;
    return {
      set(a, b, color, t) {
        core.visible = outer.visible = end.visible = true;
        const w = 1 + Math.sin(t * 60) * 0.2;
        placeSegment(core, a, b, 0.025 * w);
        placeSegment(outer, a, b, 0.09 * w);
        outer.material.color.set(color);
        end.material.color.set(color);
        end.position.copy(b);
        end.scale.setScalar(0.6 + Math.random() * 0.3);
        if (Math.random() < 0.5) {
          const c = fx.color(color);
          fx.add.spawn(b.x, b.y, b.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 0.1, 0.02, c, 1, 8, 1);
        }
      },
      hide() { core.visible = outer.visible = end.visible = false; },
      dispose() {
        fx.scene.remove(core, outer, end);
        core.material.dispose(); outer.material.dispose(); end.material.dispose();
      },
    };
  }

  // Mermi görselleri
  makeProjectile(kind) {
    const g = new THREE.Group();
    let glowSprite = null;
    let spinner = null;
    if (kind === 'rocket') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).rotateX(Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x5d6b3a }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0xd23b2b }));
      tip.position.z = -0.34;
      g.add(body, tip);
    } else if (kind === 'grenade') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: 0x4f7a2a })));
    } else if (kind === 'saw') {
      // Testere diski: uçuş yönüne dik, kendi ekseninde hızla döner
      spinner = new THREE.Group();
      const steel = new THREE.MeshLambertMaterial({ color: 0xd8e0ea });
      spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18).rotateX(Math.PI / 2), steel));
      const toothGeo = new THREE.BoxGeometry(0.08, 0.08, 0.03);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const tooth = new THREE.Mesh(toothGeo, steel);
        tooth.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
        tooth.rotation.z = a + Math.PI / 4;
        spinner.add(tooth);
      }
      spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x2b2e33 })));
      g.add(spinner);
    } else if (kind === 'zig') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf6ffc8 }));
      core.scale.z = 1.8;
      g.add(core);
    } else if (kind === 'worb') {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0x080210 })));
    }
    const glowColor = { rocket: 0xffaa44, grenade: 0x9cff4a, saw: 0xfff0c0, zig: 0xd4ff3a, worb: 0xffd76a }[kind] ?? 0xb040ff;
    glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: glowColor,
    }));
    glowSprite.scale.setScalar(kind === 'orb' || kind === 'worb' ? 1.6 : kind === 'zig' ? 1.1 : kind === 'saw' ? 0.6 : 0.5);
    if (kind === 'rocket') glowSprite.position.z = 0.3;
    g.add(glowSprite);
    this.scene.add(g);
    const fx = this;
    return {
      obj: g,
      trail(dt, t) {
        const p = g.position;
        if (kind === 'rocket') {
          fx.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.18, 0.35, 0.1, fx.color(0xffaa44), 1);
          fx.smoke.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, 1.0, 0.3, 1.1, fx.color(0x888888), 0.5, -0.3, 0.5);
        } else if (kind === 'grenade') {
          glowSprite.material.opacity = Math.sin(t * 20) > 0 ? 1 : 0.2;
          if (Math.random() < 0.5) fx.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.2, 0.12, 0.02, fx.color(0x9cff4a), 0.6);
        } else if (kind === 'saw') {
          spinner.rotation.z += dt * 40;
          if (Math.random() < 0.6) {
            const v = randDir(tmpV).multiplyScalar(2.5);
            fx.add.spawn(p.x, p.y, p.z, v.x, v.y, v.z, 0.25, 0.07, 0.02, fx.color(0xffd27a), 1, 8, 1);
          }
        } else if (kind === 'zig') {
          // İz parçacıkları zikzak çizgisini gösterir
          fx.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.45, 0.32, 0.05, fx.color(0xd4ff3a), 1);
          if (Math.random() < 0.4) {
            const v = randDir(tmpV).multiplyScalar(1.5);
            fx.add.spawn(p.x, p.y, p.z, v.x, v.y, v.z, 0.3, 0.1, 0.02, fx.color(0xffffff), 1);
          }
        } else if (kind === 'worb') {
          glowSprite.scale.setScalar(1.4 + Math.sin(t * 15) * 0.3);
          for (let i = 0; i < 2; i++) {
            const v = randDir(tmpV).multiplyScalar(0.3);
            fx.add.spawn(p.x + v.x, p.y + v.y, p.z + v.z, v.x * 6, v.y * 6, v.z * 6, 0.35, 0.15, 0.02, fx.color(0xffe9a0), 1);
          }
        } else {
          glowSprite.scale.setScalar(1.4 + Math.sin(t * 15) * 0.3);
          for (let i = 0; i < 2; i++) {
            const v = randDir(tmpV).multiplyScalar(0.6);
            fx.add.spawn(p.x + v.x, p.y + v.y, p.z + v.z, -v.x * 2, -v.y * 2, -v.z * 2, 0.3, 0.15, 0.02, fx.color(0xd080ff), 1);
          }
        }
      },
      dispose() {
        fx.scene.remove(g);
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      },
    };
  }

  // Kara delik (white=true: beyaz delik, her şeyi dışarı iter)
  blackhole(pos, dur, radius, white = false) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const core = new THREE.Mesh(new THREE.SphereGeometry(white ? 0.7 : 0.9, 20, 14),
      new THREE.MeshBasicMaterial({ color: white ? 0xffffff : 0x000000 }));
    g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: white ? 0xffe08a : 0x9b30ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.scale.setScalar(5);
    g.add(halo);
    const ringTex = ringTexture();
    const rings = [];
    for (let i = 0; i < 2; i++) {
      const col = white ? (i ? 0xffffff : 0xffd76a) : (i ? 0xff80ff : 0xb040ff);
      const r = new THREE.Mesh(new THREE.RingGeometry(1.1, 3.2, 48), new THREE.MeshBasicMaterial({
        map: ringTex, color: col, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      r.rotation.x = -Math.PI / 2 + (i ? 0.5 : -0.2);
      g.add(r);
      rings.push(r);
    }
    this.scene.add(g);
    this.blackholes.push({ g, core, halo, rings, t: 0, dur, radius, pos: pos.clone(), white });
    this.flash(pos, white ? 0xfff1b8 : 0xb040ff, 60, 20, 0.5);
  }

  // Işınlanma: iki noktada ışık sütunu
  teleport(from, to, color = 0x3ff0ff) {
    const c = this.color(color).clone();
    for (const [p, out] of [[from, 1], [to, -1]]) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4;
        this.add.spawn(p.x + Math.cos(a) * r, p.y + Math.random() * 2, p.z + Math.sin(a) * r,
          Math.cos(a) * out * 2, (Math.random() - 0.3) * 3, Math.sin(a) * out * 2, 0.6, 0.18, 0.02, c, 1, 0, 1);
      }
      this.sprite(_spriteTmp.set(p.x, p.y + 1, p.z), color, 2.5, 0.3, 0.35);
      this.flash(_spriteTmp, color, 30, 10, 0.3);
    }
    this.segs.add(from.clone().setY(from.y + 1), to.clone().setY(to.y + 1), color, 0.04, 0.25, 0.6);
  }

  // Jetpack alevi (aşağı doğru)
  jet(pos) {
    this.add.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.6, -6 - Math.random() * 3, (Math.random() - 0.5) * 0.6,
      0.22, 0.28, 0.05, this.color(Math.random() < 0.5 ? 0xffb347 : 0x6fd3ff), 1);
    if (Math.random() < 0.3) {
      this.smoke.spawn(pos.x, pos.y - 0.3, pos.z, (Math.random() - 0.5), -2, (Math.random() - 0.5), 0.8, 0.25, 0.9, this.color(0x999999), 0.35, -0.5, 1);
    }
  }

  // Motosiklet egzoz dumanı / toz
  exhaust(pos, speed) {
    if (Math.random() > 0.15 + Math.min(0.6, speed / 40)) return;
    this.smoke.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5,
      0.7, 0.18, 0.7, this.color(speed > 15 ? 0xb8ab90 : 0x777777), 0.35, -0.3, 1);
  }

  // Dev çinçilla yere iner: şok dalgası + toz
  stomp(pos, radius) {
    const c = this.color(0xc8bba0).clone();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      this.smoke.spawn(pos.x + Math.cos(a) * 0.8, pos.y + 0.15, pos.z + Math.sin(a) * 0.8,
        Math.cos(a) * radius * 2.2, 0.6, Math.sin(a) * radius * 2.2, 0.9, 0.7, 1.6, c, 0.55, 0, 2.5);
    }
    this.sprite(_spriteTmp.set(pos.x, pos.y + 0.3, pos.z), 0xfff3d0, 1, radius * 2, 0.25, 0.5);
  }

  // Işınlanma silahının hedef işareti (yerdeki halka + sütun)
  makeMarker(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2), mat);
    ring.position.y = 0.05;
    g.add(ring);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 16, 1, true), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    col.position.y = 0.9;
    g.add(col);
    g.visible = false;
    g.renderOrder = 5;
    this.scene.add(g);
    return {
      show(p, t) {
        g.visible = true;
        g.position.copy(p);
        ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
        ring.rotation.y = t;
      },
      hide() { g.visible = false; },
    };
  }

  update(dt, camera, renderer) {
    const h = renderer.domElement.height;
    const scale = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    this.add.mat.uniforms.scale.value = scale;
    this.smoke.mat.uniforms.scale.value = scale;
    this.add.update(dt);
    this.smoke.update(dt);
    this.segs.update(dt);
    for (const it of this.sprites) {
      if (!it.s.visible) continue;
      it.life -= dt;
      if (it.life <= 0) { it.s.visible = false; continue; }
      const t = 1 - it.life / it.max;
      it.s.scale.setScalar(it.s0 + (it.s1 - it.s0) * t);
      it.s.material.opacity = it.op * (1 - t);
    }
    for (const it of this.lights) {
      if (it.life <= 0) continue;
      it.life -= dt;
      it.l.intensity = it.life > 0 ? it.i0 * (it.life / it.max) : 0;
    }
    for (const b of this.balls) {
      if (!b.m.visible) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      const t = 1 - b.life / b.max;
      b.m.scale.setScalar(b.r * (0.3 + 0.7 * Math.sqrt(t)));
      b.m.material.opacity = 1 - t;
    }
    for (let i = this.blackholes.length - 1; i >= 0; i--) {
      const bh = this.blackholes[i];
      bh.t += dt;
      const k = Math.min(1, bh.t * 3) * (bh.t > bh.dur - 0.3 ? Math.max(0, (bh.dur - bh.t) / 0.3) : 1);
      bh.g.scale.setScalar(Math.max(0.01, k));
      bh.rings[0].rotation.z += dt * 3;
      bh.rings[1].rotation.z -= dt * 4.5;
      bh.halo.scale.setScalar(5 + Math.sin(bh.t * 8) * 0.6);
      const p = bh.pos;
      if (bh.white) {
        // Beyaz delik: parçacıklar merkezden dışarı saçılır
        const c = this.color(Math.random() < 0.5 ? 0xffffff : 0xffd76a).clone();
        for (let j = 0; j < 6; j++) {
          const v = randDir(tmpV);
          this.add.spawn(p.x + v.x * 0.6, p.y + v.y * 0.6, p.z + v.z * 0.6, v.x * bh.radius * 1.3 + v.z * 3, v.y * bh.radius * 0.6, v.z * bh.radius * 1.3 - v.x * 3,
            0.7, 0.22, 0.05, c, 1, 0, 0);
        }
      } else {
        const c = this.color(Math.random() < 0.5 ? 0xb040ff : 0xff80ff).clone();
        for (let j = 0; j < 6; j++) {
          const v = randDir(tmpV).multiplyScalar(bh.radius * (0.4 + Math.random() * 0.6));
          this.add.spawn(p.x + v.x, p.y + v.y * 0.5, p.z + v.z, -v.x * 1.4 + v.z * 0.6, -v.y * 0.7, -v.z * 1.4 - v.x * 0.6,
            0.7, 0.2, 0.05, c, 1, 0, 0);
        }
      }
      if (bh.t >= bh.dur) {
        this.scene.remove(bh.g);
        bh.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        if (bh.white) this.explosion(bh.pos, 7, 0xfff1b8); else this.explosion(bh.pos, 5, 0xc060ff);
        this.blackholes.splice(i, 1);
      }
    }
  }
}

let _ringTex = null;
function ringTexture() {
  if (_ringTex) return _ringTex;
  // RingGeometry düzlemsel UV kullanır: kare dokuda radyal geçiş
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.33, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  // Dönüş belli olsun diye sarmal çizgiler
  x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    x.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const a = k / 6 * Math.PI * 2 + t * 2.2, r = S * (0.17 + t * 0.33);
      const px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r;
      t === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
  }
  _ringTex = new THREE.CanvasTexture(c);
  return _ringTex;
}

function randDir(v) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return v.set(s * Math.cos(a), u, s * Math.sin(a));
}
