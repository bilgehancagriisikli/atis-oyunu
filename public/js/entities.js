// İstemci tarafı: taretler, havan mermileri, Anomalocaris yaratıkları, deniz kabuğu mayınları,
// yakalama silahının ipi ve çekilme, kedi tablosunun hasarı yansıtması. Game sınıfına karıştırılır.
import * as THREE from 'three';
import { TurretView } from './turrets.js';
import { CreatureView } from './creatures.js';
import { buildShellMine } from './decor.js';
import { TURRET, CREATURE, MINE } from './npc.js';
import { WEAPONS, hexColor } from './weapons.js';
import { rayVsBox } from './physics.js';
import { placeSegment } from './effects.js';
import { HALF } from './map.js';

const now = () => performance.now() / 1000;
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3();

// Işın - küre: ilk kesişme t'si ya da null
export function rayVsSphere(o, d, maxT, c, r) {
  const lx = c.x - o.x, ly = c.y - o.y, lz = c.z - o.z;
  const b = lx * d.x + ly * d.y + lz * d.z;
  const cc = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = b - Math.sqrt(disc);
  return t > 0 && t < maxT ? t : (cc < 0 && maxT > 0 ? 0.001 : null);
}

let ropeGeo = null, ropeMat = null, hookGeo = null, hookMat = null, shellGeo = null, shellMat = null;

export const GameEntities = {
  initEntities() {
    this.turrets = new Map();
    this.shells = new Map();
    this.creatures = new Map();
    this.dying = [];
    this.mines = new Map();
    this.ropes = [];
    this.pull = null;
    this.purrAt = 0;
    this.deployMarker = this.fx.makeMarker(0xffa040);
  },

  entitiesFromWelcome(w) {
    for (const tu of w.turrets || []) this.addTurret(tu);
    for (const c of w.creatures || []) this.addCreature(c, false);
    for (const m of w.mines || []) this.addMine(m);
  },

  // ------------------------------------------------------------
  // Ağ mesajları. İşlenirse true döner.
  handleEntity(msg) {
    const t = now();
    switch (msg.t) {
      case 'tur': this.addTurret(msg.tu); return true;
      case 'tdmg': {
        const tu = this.turrets.get(msg.tu);
        if (!tu) return true;
        tu.hp = msg.hp;
        tu.view.setHp(msg.hp);
        if (msg.a === this.myId) { this.hud.hitmarker('hit'); this.sfx.play('hit'); }
        return true;
      }
      case 'tdead': {
        const tu = this.turrets.get(msg.tu);
        if (!tu) return true;
        _p.set(tu.x, tu.y + 0.8, tu.z);
        if (msg.d) { this.fx.explosion(_p, 2.5, tu.kind === 'mush' ? 0xff5040 : 0xb59be0); this.sfx.play('explosion', _p, 0.6); } else { this.fx.spawnFx(_p.setY(tu.y), 0xffffff); }
        tu.view.dispose();
        this.turrets.delete(msg.tu);
        return true;
      }
      case 'tfire': {
        const tu = this.turrets.get(msg.tu);
        if (!tu || !Array.isArray(msg.e)) return true;
        tu.view.fire();
        const m = tu.view.muzzleWorld(_p);
        const e = _q.fromArray(msg.e);
        this.fx.tracer(m, e, 0xd8c8ff, 0.02);
        this.fx.muzzle(m, 0xd8c8ff);
        this.fx.impact(e, _r.set(0, 1, 0), 0xd8c8ff);
        this.sfx.play('tully', m, 0.8);
        return true;
      }
      case 'tshot': {
        const tu = this.turrets.get(msg.tu);
        if (tu) {
          tu.view.fire();
          const m = tu.view.muzzleWorld(_p);
          this.fx.dust(m);
          this.sfx.play('mortar', m);
        }
        if (Array.isArray(msg.o) && Array.isArray(msg.v)) this.addShell(msg.id, msg.o, msg.v);
        return true;
      }
      case 'tboom': {
        const s = this.shells.get(msg.id);
        if (s) { this.scene.remove(s.mesh); this.shells.delete(msg.id); }
        if (Array.isArray(msg.p)) this.explosionFx(_p.fromArray(msg.p), TURRET.mush.radius, 0xff6a3a);
        return true;
      }
      case 'cre': {
        this.addCreature(msg.c, true);
        if (msg.g) {
          const d = Math.hypot(msg.c.p[0] - this.me.x, msg.c.p[2] - this.me.z);
          if (d < 60) this.hud.center('⚠ ANOMALOCARIS SÜRÜSÜ GELİYOR!', '#ff9a4d', 2.2);
          this.sfx.play('screech', _p.fromArray(msg.c.p));
        }
        return true;
      }
      case 'cdmg': {
        const c = this.creatures.get(msg.c);
        if (!c) return true;
        c.hp = msg.hp;
        c.view.setHp(msg.hp);
        if (msg.a === this.myId) { this.hud.hitmarker('hit'); this.sfx.play('hit'); }
        return true;
      }
      case 'cdead': {
        const c = this.creatures.get(msg.c);
        if (c) {
          c.view.die();
          this.dying.push(c.view);
          this.creatures.delete(msg.c);
          this.fx.hitPlayer(c.view.pos, 0xff9a4d);
          this.sfx.play('cdie', c.view.pos);
        }
        if (msg.a === this.myId) {
          this.hud.hitmarker('kill');
          this.hud.center('ANOMALOCARIS AVLANDI!', '#ff9a4d', 1.5);
        }
        return true;
      }
      case 'cbite': {
        const c = this.creatures.get(msg.c);
        if (c) { c.view.bite(); this.sfx.play('bite', c.view.pos, 0.9); }
        return true;
      }
      case 'mine': this.addMine(msg.m); return true;
      case 'mboom': {
        const m = this.mines.get(msg.m);
        if (m) { this.scene.remove(m.mesh); this.mines.delete(msg.m); }
        if (Array.isArray(msg.p)) {
          _p.fromArray(msg.p);
          this.sfx.play('click', _p);
          this.explosionFx(_p.setY(_p.y + 0.3), MINE.radius, 0xffc070);
          this.fx.dust(_p);
          if (msg.by === this.myId) this.hud.center('DENİZ KABUĞU MAYINI!', '#ffc070', 1.5);
        }
        return true;
      }
      case 'grab': this.onGrab(msg, t); return true;
      case 'mir': {
        // Kedi tablosu hasarı geri yansıttı: tablodan atana kırmızı ışın
        const P = this.map.painting;
        if (msg.id != null) this.removeProjectile(msg.id);
        P.flash();
        _p.fromArray(P.center);
        const to = msg.by === this.myId ? _q.set(this.me.x, this.me.y + 1.1, this.me.z) : this.players.get(msg.by)?.avatar?.center(_q);
        if (to) this.fx.lightning([_p.clone(), to.clone()], 0xff3050);
        this.sfx.play('meow', _p);
        if (msg.by === this.myId) this.hud.center('🐱 KEDİ TABLOSU HASARI SANA YANSITTI!', '#ff7090', 1.6);
        return true;
      }
    }
    return false;
  },

  // Anlık görüntü: yaratık konumları ve taret nişanları
  entitySnap(msg) {
    if (Array.isArray(msg.cr)) {
      for (const [id, x, y, z, yaw] of msg.cr) {
        const c = this.creatures.get(id);
        if (c) c.view.setTarget(x, y, z, yaw);
      }
    }
    if (Array.isArray(msg.ta)) {
      for (const [id, yaw, pitch] of msg.ta) {
        const tu = this.turrets.get(id);
        if (tu) tu.view.aim(yaw, pitch);
      }
    }
  },

  // ------------------------------------------------------------
  addTurret(info) {
    if (this.turrets.has(info.id) || !TURRET[info.k] || !Array.isArray(info.p)) return;
    const owner = this.players.get(info.o);
    const view = new TurretView(this.scene, info.k, owner ? owner.color : 0xffffff);
    const [x, y, z] = info.p;
    view.setPose(x, y, z, info.yaw || 0);
    view.setHp(info.hp);
    if ((info.age || 0) > 0.5) view.born -= 10; // zaten kurulmuş: büyüme animasyonu yok
    else this.sfx.play('deploy', _p.set(x, y, z));
    this.turrets.set(info.id, { id: info.id, kind: info.k, owner: info.o, x, y, z, hp: info.hp, view });
  },

  addShell(id, o, v) {
    if (!shellGeo) {
      shellGeo = new THREE.SphereGeometry(0.2, 12, 8);
      shellMat = new THREE.MeshLambertMaterial({ color: 0xd8342a, emissive: 0x551008 });
    }
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.fromArray(o);
    this.scene.add(mesh);
    this.shells.set(id, { o: new THREE.Vector3().fromArray(o), v: new THREE.Vector3().fromArray(v), born: now(), mesh });
  },

  addCreature(info, fresh) {
    if (this.creatures.has(info.id) || !Array.isArray(info.p)) return;
    const [x, y, z] = info.p;
    const view = new CreatureView(this.scene, { x, y, z, yaw: info.yaw, hp: info.hp });
    if (fresh) this.fx.spawnFx(_p.set(x, y - 0.5, z), 0xff9a4d);
    this.creatures.set(info.id, { id: info.id, hp: info.hp, view });
  },

  addMine(info) {
    if (this.mines.has(info.id) || !Array.isArray(info.p)) return;
    const mesh = buildShellMine();
    mesh.position.fromArray(info.p);
    mesh.position.y += 0.005;
    mesh.rotation.y = info.yaw || 0;
    this.scene.add(mesh);
    this.mines.set(info.id, { id: info.id, x: info.p[0], y: info.p[1], z: info.p[2], mesh });
  },

  // ------------------------------------------------------------
  // Yakalama silahı
  makeRope() {
    if (!ropeGeo) {
      ropeGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
      ropeMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
      hookGeo = new THREE.ConeGeometry(0.07, 0.18, 4);
      hookMat = new THREE.MeshLambertMaterial({ color: 0xb8c0c8 });
    }
    const line = new THREE.Mesh(ropeGeo, ropeMat);
    const hook = new THREE.Mesh(hookGeo, hookMat);
    line.frustumCulled = false;
    this.scene.add(line, hook);
    return { line, hook };
  },

  // Atılan kanca: uca uçar, takılmazsa geri sarılır. fromFn: ipin başlangıcı (silah ucu)
  shootRope(fromFn, end, by) {
    const r = { ...this.makeRope(), from: fromFn, end: end.clone(), born: now(), by, mode: 'shot' };
    this.ropes.push(r);
    return r;
  },

  onGrab(msg, t) {
    const W = WEAPONS.grapple;
    const by = msg.by;
    const fromFn = by === this.myId
      ? (out) => (this.me.alive ? this.muzzleWorld(out) : null)
      : (out) => { const av = this.players.get(by)?.avatar; return av && av.alive ? av.muzzleWorld(out) : null; };
    let toFn = null;
    if (msg.c != null) {
      toFn = (out) => { const c = this.creatures.get(msg.c); return c ? out.copy(c.view.pos) : null; };
    } else if (msg.tg === this.myId) {
      toFn = (out) => (this.me.alive ? out.set(this.me.x, this.me.y + 1.1, this.me.z) : null);
      // Bu oyuncu çekiliyor
      if (this.me.veh) this.dismount();
      // Süre oyun zamanıyla sayılır (düşük FPS'te oyun yavaşlasa da çekilme yarıda kalmasın)
      this.pull = { by, left: msg.dur || W.pull.dur };
      this.hud.center('YAKALANDIN!', '#ffcf6a', 1);
      this.sfx.play('reel', null, 0.9);
    } else {
      toFn = (out) => { const av = this.players.get(msg.tg)?.avatar; return av && av.alive ? av.center(out) : null; };
    }
    // Atanın uçmakta olan kancasını yakalanana bağla
    const shot = this.ropes.find((r) => r.mode === 'shot' && r.by === by);
    const r = shot || { ...this.makeRope(), by };
    Object.assign(r, { mode: 'pull', from: fromFn, to: toFn, until: t + (msg.dur || W.pull.dur) });
    if (!shot) this.ropes.push(r);
    this.sfx.play('reel', fromFn(_p) || null, 0.6);
  },

  // Çekilen oyuncunun hızı: atana doğru, araya duvar girerse yine de süre bitince biter
  applyPull(dt, wish) {
    const P = this.pull;
    if (!P) return false;
    const me = this.me;
    const av = this.players.get(P.by)?.avatar;
    P.left -= dt;
    if (!av || !av.alive || P.left <= 0 || !me.alive) {
      // Çekilme yarıda kesildi: savrulma hızı sönsün
      this.pull = null;
      me.vx *= 0.3; me.vz *= 0.3; me.vy = Math.min(me.vy, 2);
      return false;
    }
    const dx = av.pos.x - me.x, dy = av.pos.y + 0.3 - me.y, dz = av.pos.z - me.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 2.0) {
      this.pull = null;
      me.vx *= 0.2; me.vz *= 0.2; me.vy = Math.min(me.vy, 2);
      return false;
    }
    // Bu karede atanın 1,6 m önünü geçmeyecek hız (düşük FPS'te içine girmesin)
    const s = Math.min(WEAPONS.grapple.pull.speed, Math.max(0, d - 1.6) / Math.max(dt, 1e-3));
    me.vx = dx / d * s; me.vz = dz / d * s;
    me.vy = dy / d * s + Math.min(4, s * 0.2);
    me.onGround = false;
    wish.x = 0; wish.z = 0; wish.speed = 0; wish.jump = false;
    return true;
  },

  updateRopes(t) {
    for (let i = this.ropes.length - 1; i >= 0; i--) {
      const r = this.ropes[i];
      const a = r.from(_p);
      let b = null, done = !a;
      if (!done && r.mode === 'shot') {
        // 0,12 sn uçar, 0,3 sn bekler, sonra geri sarılır
        const k = t - r.born;
        const f = k < 0.12 ? k / 0.12 : k < 0.3 ? 1 : 1 - (k - 0.3) / 0.25;
        if (f <= 0) done = true;
        else b = _q.copy(a).lerp(r.end, Math.min(1, f));
      } else if (!done) {
        b = r.to(_q);
        // Bizi çeken ip, çekilme bitene kadar durur
        const pulling = this.pull && r.by === this.pull.by;
        if (!b || (t > r.until && !pulling) || a.distanceTo(b) < 2.0) done = true;
      }
      if (done) {
        this.scene.remove(r.line, r.hook);
        this.ropes.splice(i, 1);
        continue;
      }
      placeSegment(r.line, a, b, 0.025);
      r.hook.position.copy(b);
      _r.subVectors(b, a).normalize();
      r.hook.quaternion.setFromUnitVectors(_q.set(0, 1, 0), _r);
    }
  },

  // ------------------------------------------------------------
  updateEntities(dt, t) {
    for (const tu of this.turrets.values()) tu.view.update(dt, t);
    for (const c of this.creatures.values()) c.view.update(dt, t);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (this.dying[i].update(dt, t)) { this.dying[i].dispose(); this.dying.splice(i, 1); }
    }
    const g = TURRET.mush.grav;
    for (const [id, s] of this.shells) {
      const k = t - s.born;
      if (k > 9) { this.scene.remove(s.mesh); this.shells.delete(id); continue; }
      s.mesh.position.set(s.o.x + s.v.x * k, s.o.y + s.v.y * k - 0.5 * g * k * k, s.o.z + s.v.z * k);
      s.mesh.rotation.x += dt * 6;
      this.fx.sporeTrail(s.mesh.position);
    }
    this.updateRopes(t);
    this.updateDeployMarker(t);
    // Uyuyan kedinin yanına gelince mırlar
    const cat = this.map.cat;
    if (cat && t > this.purrAt && Math.hypot(cat.pos.x - this.me.x, cat.pos.y - this.me.y, cat.pos.z - this.me.z) < 10) {
      this.purrAt = t + 2.8;
      this.sfx.play('purr', cat.pos, 0.9);
    }
  },

  // ------------------------------------------------------------
  // Taret kurma yeri: nişangahın gösterdiği zemin (en fazla W.range metre)
  deploySpot(W) {
    const me = this.me;
    const { o, d } = this.aimRay();
    const hit = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, W.range + 1.5);
    let t = hit ? hit.t : W.range;
    if (hit && hit.ny < 0.7) t = Math.max(0, hit.t - 0.6); // duvara bakıyorsa önüne
    let x = o.x + d.x * t, z = o.z + d.z * t;
    const yTop = o.y + d.y * t + 0.3;
    // Oyuncudan en fazla range metre
    const hx = x - me.x, hz = z - me.z, hl = Math.hypot(hx, hz);
    if (hl > W.range) { x = me.x + hx / hl * W.range; z = me.z + hz / hl * W.range; }
    if (Math.abs(x) > HALF - 0.8 || Math.abs(z) > HALF - 0.8) return null;
    const g = this.world.groundAt(x, z, Math.max(yTop, me.y + 0.6));
    if (Math.abs(g - me.y) > 3.5 || this.world.overlapsPlayer(x, g, z, 0.45, 1.4)) return null;
    // Mantar havan topu yukarı ateş eder: üstü kapalı yere kurulamaz
    if (W.turret === 'mush' && this.world.raycast(x, g + TURRET.mush.muzzleY, z, 0, 1, 0, 12)) return null;
    return new THREE.Vector3(x, g, z);
  },

  updateDeployMarker(t) {
    const W = WEAPONS[this.me.cur];
    if (!this.me.alive || !W || W.type !== 'deploy') { this.deployMarker.hide(); return; }
    const p = this.deploySpot(W);
    if (p) this.deployMarker.show(p, t); else this.deployMarker.hide();
  },

  fireDeploy(W, w) {
    const p = this.deploySpot(W);
    if (!p) {
      this.hud.center('Buraya taret kurulamaz!', '#ff8080', 1);
      this.sfx.play('empty');
      return false;
    }
    this.send({ t: 'deploy', w, p: [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100), yaw: Math.round(this.me.yaw * 1000) / 1000 });
    this.hud.center(`${W.name.toLocaleUpperCase('tr')} KURULDU`, hexColor(W.color), 1.2);
    return true;
  },

  fireGrapple(W, o, base, muzzle) {
    const r = this.trace(o, base, W.range);
    const h = r.hits[0];
    // Önce 'fire' gider: diğer oyuncularda uçan kanca oluşur, ardından gelen 'grab' onu çekme ipine çevirir
    this.shootRope((out) => (this.me.alive ? this.muzzleWorld(out) : null), r.end, this.myId);
    this.send({ t: 'fire', w: 'grapple', e: [r.end.x, r.end.y, r.end.z].map((v) => Math.round(v * 100) / 100) });
    if (h && h.id != null) this.send({ t: 'grab', tg: h.id });
    else if (h && h.cid != null) this.send({ t: 'grab', c: h.cid });
  },

  // ------------------------------------------------------------
  // İsabet hedefleri: taretler (kendi taretlerimiz hariç), yaratıklar, kedi tablosu
  traceEntities(o, d, maxT, hits) {
    for (const tu of this.turrets.values()) {
      if (tu.owner === this.myId) continue;
      const H = TURRET[tu.kind].hit;
      const tb = rayVsBox(o.x, o.y, o.z, d.x, d.y, d.z, maxT, tu.x - H.hw, tu.y, tu.z - H.hw, tu.x + H.hw, tu.y + H.y1, tu.z + H.hw);
      if (tb !== null) hits.push({ tid: tu.id, t: tb, head: false });
    }
    for (const c of this.creatures.values()) {
      const tc = rayVsSphere(o, d, maxT, c.view.pos, CREATURE.r);
      if (tc !== null) hits.push({ cid: c.id, t: tc, head: false });
    }
    const P = this.map.painting;
    const tp = rayVsBox(o.x, o.y, o.z, d.x, d.y, d.z, maxT, P.minX, P.minY, P.minZ, P.maxX, P.maxY, P.maxZ);
    if (tp !== null) hits.push({ mirror: true, t: tp, head: false });
  },

  // Nokta bir tarete / yaratığa / tabloya değiyor mu (mermiler için). Değdiği hedefi döndürür.
  pointHitsEntity(x, y, z, extra) {
    for (const tu of this.turrets.values()) {
      if (tu.owner === this.myId) continue;
      const H = TURRET[tu.kind].hit, hw = H.hw + extra;
      if (Math.abs(x - tu.x) < hw && Math.abs(z - tu.z) < hw && y > tu.y - extra && y < tu.y + H.y1 + extra) return { tid: tu.id };
    }
    for (const c of this.creatures.values()) {
      const p = c.view.pos;
      if (Math.hypot(x - p.x, y - p.y, z - p.z) < CREATURE.r + extra) return { cid: c.id };
    }
    const P = this.map.painting;
    if (x > P.minX - extra && x < P.maxX + extra && y > P.minY - extra && y < P.maxY + extra && z > P.minZ - extra && z < P.maxZ + extra) return { mirror: true };
    return null;
  },

  // Kılıç ve fraktal için hedef merkezleri
  entityTargets() {
    const out = [];
    for (const tu of this.turrets.values()) {
      if (tu.owner === this.myId) continue;
      out.push({ h: { tid: tu.id }, c: new THREE.Vector3(tu.x, tu.y + TURRET[tu.kind].hit.y1 / 2, tu.z), r: TURRET[tu.kind].hit.hw });
    }
    for (const c of this.creatures.values()) out.push({ h: { cid: c.id }, c: c.view.pos.clone(), r: CREATURE.r });
    // Tablo yalnızca odanın içinden (duvarın önünden) vurulabilir, duvarın arkasından değil
    const P = this.map.painting;
    if (this.me.z > P.maxZ) out.push({ h: { mirror: true }, c: new THREE.Vector3().fromArray(P.center), r: (P.maxX - P.minX) / 2, mirror: true });
    return out;
  },

  // Oyuncu dışındaki hedeflere isabet mesajı
  sendEntityHit(h, w, n, pid) {
    const extra = pid != null ? { id: pid } : {};
    if (h.tid != null) this.send({ t: 'thit', tu: h.tid, w, n, ...extra });
    else if (h.cid != null) this.send({ t: 'chit', c: h.cid, w, n, ...extra });
    else if (h.mirror) { this.send({ t: 'mirror', w, n, ...extra }); this.map.painting.flash(); }
    else return false;
    return true;
  },
};
