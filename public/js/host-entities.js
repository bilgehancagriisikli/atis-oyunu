// Sunucu tarafı: kurulabilen taretler, havan mermileri, Anomalocaris yaratıkları, deniz kabuğu mayınları,
// yakalama silahı ve hasarı geri yansıtan kedi tablosu. HostLogic sınıfına karıştırılır (host.js).
import { WEAPONS } from './weapons.js';
import { VEH } from './vehicles.js';
import { TURRET, CREATURE, MINE } from './npc.js';
import { rayVsPlayer, pointNearPlayer } from './physics.js';
import { HALF } from './map.js';

const r2 = (v) => Math.round(v * 100) / 100;
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Işın - küre: ilk kesişme t'si ya da null
function rayVsSphere(ox, oy, oz, dx, dy, dz, maxT, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = b - Math.sqrt(disc);
  return t > 0 && t < maxT ? t : null;
}

// Noktanın XZ düzleminde bir doğru parçasına uzaklığı
function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export const HostEntities = {
  initEntities() {
    this.turrets = [];
    this.nextTurret = 1;
    this.shells = [];
    this.nextShell = 1;
    this.creatures = [];
    this.nextCreature = 1;
    this.creatureTimer = CREATURE.first;
    this.mines = [];
    this.nextMine = 1;
    this.mineTimer = MINE.first;
  },

  turretInfo(tu) {
    return { id: tu.id, k: tu.kind, o: tu.owner, p: [tu.x, tu.y, tu.z], yaw: r2(tu.yaw), hp: Math.round(tu.hp), age: r2(this.time - tu.born) };
  },
  creatureInfo(c) {
    return { id: c.id, p: [r2(c.x), r2(c.y), r2(c.z)], yaw: r2(c.yaw), hp: Math.round(c.hp) };
  },
  mineInfo(m) {
    return { id: m.id, p: [m.x, m.y, m.z], yaw: r2(m.yaw), armed: this.time - m.born >= MINE.arm ? 1 : 0 };
  },

  entitiesWelcome() {
    return {
      turrets: this.turrets.map((tu) => this.turretInfo(tu)),
      creatures: this.creatures.map((c) => this.creatureInfo(c)),
      mines: this.mines.map((m) => this.mineInfo(m)),
    };
  },

  turretById(id) { return this.turrets.find((t) => t.id === id) || null; },
  creatureById(id) { return this.creatures.find((c) => c.id === id) || null; },

  // Testere bıçağı: mermi kimliğiyle (her hedefe bir kez) doğrulanır
  sawOnce(p, msg, key) {
    const pr = p.proj.get(msg.id);
    if (!pr || pr.w !== 'saw' || this.time - pr.t > 6) return false;
    pr.hits ||= new Set();
    if (pr.hits.has(key)) return false;
    pr.hits.add(key);
    return true;
  },

  // Silah isabetini doğrula: hasar miktarı ya da null
  weaponHitAmount(p, msg, key, tx, tz) {
    const W = WEAPONS[msg.w];
    if (!W) return null;
    if (msg.w === 'saw' && msg.id != null) {
      if (Math.hypot(tx - p.x, tz - p.z) > 90 || !this.sawOnce(p, msg, key)) return null;
      return W.dmg;
    }
    if (!p.alive || !p.inv.has(msg.w)) return null;
    const range = W.type === 'melee' ? W.range + 3 : (W.range || 100) + 10;
    if (Math.hypot(tx - p.x, tz - p.z) > range) return null;
    const per = Array.isArray(W.dmg) ? W.dmg[0] : W.dmg;
    if (!Number.isFinite(per)) return null;
    if (!this.rateOk(p, key + msg.w, W.type === 'beam' ? W.tick * 0.6 : 0.6 / (W.rate || 2))) return null;
    const n = Math.max(1, Math.min(W.pellets || W.maxHits || 1, msg.n | 0));
    return per * n;
  },

  receiveEntity(id, p, msg) {
    switch (msg.t) {
      case 'deploy': this.deployTurret(id, p, msg); break;
      case 'thit': {
        const tu = this.turretById(msg.tu);
        if (!tu || tu.owner === id) return; // kendi taretine hasar yok
        const amt = this.weaponHitAmount(p, msg, 't' + tu.id, tu.x, tu.z);
        if (amt) this.damageTurret(tu, amt, p, msg.w);
        break;
      }
      case 'chit': {
        const c = this.creatureById(msg.c);
        if (!c) return;
        const amt = this.weaponHitAmount(p, msg, 'c' + c.id, c.x, c.z);
        if (amt) this.damageCreature(c, amt, p, msg.w);
        break;
      }
      case 'grab': this.grab(id, p, msg); break;
      case 'mirror': this.mirror(id, p, msg); break;
    }
  },

  // ------------------------------------------------------------
  // Taretler
  deployTurret(id, p, msg) {
    const W = WEAPONS[msg.w];
    if (!p.alive || !W || W.type !== 'deploy' || !p.inv.has(msg.w) || !Array.isArray(msg.p)) return;
    const [x, y, z] = msg.p.map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    if (Math.hypot(x - p.x, z - p.z) > W.range + 3 || Math.abs(y - p.y) > 4) return;
    if (Math.abs(x) > HALF - 0.8 || Math.abs(z) > HALF - 0.8) return;
    const g = this.world.groundAt(x, z, y + 0.6);
    if (Math.abs(g - y) > 0.4 || this.world.overlapsPlayer(x, g, z, 0.45, 1.4)) return;
    if (!this.rateOk(p, 'deploy', 0.8)) return;
    // Oyuncu başına sınır: fazlası kurulunca en eskisi söner
    const own = this.turrets.filter((t) => t.owner === id);
    while (own.length >= TURRET.perOwner) this.removeTurret(own.shift(), false);
    if (this.turrets.length >= TURRET.max) this.removeTurret(this.turrets[0], false);
    const T = TURRET[W.turret];
    const tu = {
      id: this.nextTurret++, kind: W.turret, owner: id, x: r2(x), y: r2(g), z: r2(z),
      yaw: Number.isFinite(+msg.yaw) ? wrap(+msg.yaw) : 0, pitch: 0, hp: T.hp, born: this.time,
      next: this.time + 1, target: null, retarget: 0,
    };
    this.turrets.push(tu);
    this.endProtection(p);
    this.broadcast({ t: 'tur', tu: this.turretInfo(tu) });
  },

  damageTurret(tu, amount, attacker, w) {
    if (!(amount > 0) || !this.turrets.includes(tu)) return;
    tu.hp = Math.max(0, tu.hp - amount);
    this.broadcast({ t: 'tdmg', tu: tu.id, hp: Math.round(tu.hp), a: attacker ? attacker.id : -1 });
    if (tu.hp <= 0) this.removeTurret(tu, true);
  },

  removeTurret(tu, destroyed) {
    const i = this.turrets.indexOf(tu);
    if (i < 0) return;
    this.turrets.splice(i, 1);
    this.broadcast({ t: 'tdead', tu: tu.id, p: [tu.x, tu.y, tu.z], d: destroyed ? 1 : 0 });
  },

  // Hedef adayları: sahibi dışındaki canlı, korumasız oyuncular ve yaratıklar
  turretTargets(tu) {
    const out = [];
    for (const q of this.players.values()) {
      if (!q.alive || q.id === tu.owner || q.prot > this.time) continue;
      out.push({ p: q, x: q.x, y: q.y, z: q.z, cy: q.y + 1.1 });
    }
    for (const c of this.creatures) out.push({ c, x: c.x, y: c.y - 0.4, z: c.z, cy: c.y });
    return out;
  },

  tickTurrets(dt) {
    for (const tu of [...this.turrets]) {
      const T = TURRET[tu.kind];
      if (this.time - tu.born > T.life) { this.removeTurret(tu, false); continue; }
      const owner = this.players.get(tu.owner) || null;
      if (tu.kind === 'mush') this.mortarThink(tu, T, owner);
      else this.tullyThink(tu, T, owner, dt);
    }
    // Havan mermileri: analitik balistik yol, çarpınca patlar
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const t1 = this.time - s.born, t0 = s.last;
      s.last = t1;
      const g = TURRET.mush.grav;
      const at = (t) => [s.o[0] + s.v[0] * t, s.o[1] + s.v[1] * t - 0.5 * g * t * t, s.o[2] + s.v[2] * t];
      const a = at(t0), b = at(t1);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      let hitAt = null;
      if (len > 1e-6) {
        const hit = this.world.raycast(a[0], a[1], a[2], dx / len, dy / len, dz / len, len);
        let tMax = hit ? hit.t : len;
        // Bir oyuncuya doğrudan isabet
        const n = Math.max(1, Math.ceil(tMax / 0.4));
        for (let k = 1; k <= n && !hitAt; k++) {
          const f = (k / n) * tMax;
          const x = a[0] + dx / len * f, y = a[1] + dy / len * f, z = a[2] + dz / len * f;
          for (const q of this.players.values()) {
            if (q.alive && q.id !== s.owner && pointNearPlayer(x, y, z, q.x, q.y, q.z, 0.2)) { hitAt = [x, y, z]; tMax = f; break; }
          }
        }
        if (!hitAt && hit) {
          hitAt = [a[0] + dx / len * hit.t + hit.nx * 0.2, a[1] + dy / len * hit.t + hit.ny * 0.2, a[2] + dz / len * hit.t + hit.nz * 0.2];
        }
      }
      if (!hitAt && (t1 > 8 || b[1] < -5)) hitAt = b;
      if (hitAt) {
        this.shells.splice(i, 1);
        const T = TURRET.mush;
        const owner = this.players.get(s.owner) || null;
        this.broadcast({ t: 'tboom', id: s.id, p: hitAt.map(r2) });
        this.blast(hitAt[0], hitAt[1], hitAt[2], T.radius, T.dmg, T.kb, owner, 'mush', s.owner);
      }
    }
  },

  // Mantar: menzildeki en yakın hedefe kavisli mermi (görüş hattı gerekmez, hareketliye biraz önden nişan)
  mortarThink(tu, T, owner) {
    if (this.time < tu.next) return;
    let best = null, bd = Infinity;
    for (const c of this.turretTargets(tu)) {
      const d = Math.hypot(c.x - tu.x, c.z - tu.z);
      if (d < T.minRange || d > T.range || d >= bd) continue;
      bd = d; best = c;
    }
    if (!best) { tu.next = this.time + 0.5; return; }
    const o = [tu.x, tu.y + T.muzzleY, tu.z];
    const flight = Math.max(1.3, Math.min(3.2, 1.1 + bd * 0.04));
    const lead = best.p ? T.lead * flight : 0;
    const px = best.x + (best.p ? (best.p.vxe || 0) * lead : 0);
    const pz = best.z + (best.p ? (best.p.vze || 0) * lead : 0);
    const py = this.world.groundAt(px, pz, best.y + 1);
    const v = [(px - o[0]) / flight, (py - o[1] + 0.5 * T.grav * flight * flight) / flight, (pz - o[2]) / flight];
    const s = { id: this.nextShell++, tu: tu.id, owner: tu.owner, o: o.map(r2), v: v.map(r2), born: this.time, last: 0 };
    this.shells.push(s);
    tu.next = this.time + T.every;
    this.broadcast({ t: 'tshot', tu: tu.id, id: s.id, o: s.o, v: s.v });
  },

  // Tullimonstrum: hedefe döner, nişan tutunca tabanca hasarıyla ateş eder (görüş hattı gerekir)
  tullyThink(tu, T, owner, dt) {
    const eyeY = tu.y + T.muzzleY;
    if (this.time >= tu.retarget) {
      tu.retarget = this.time + 0.3;
      let best = null, bd = Infinity;
      for (const c of this.turretTargets(tu)) {
        const dx = c.x - tu.x, dy = c.cy - eyeY, dz = c.z - tu.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > T.range || d >= bd) continue;
        if (this.world.raycast(tu.x, eyeY, tu.z, dx / d, dy / d, dz / d, d - 0.3)) continue;
        bd = d; best = c;
      }
      tu.target = best;
    }
    const c = tu.target;
    if (!c) return;
    // Hedef öldüyse / gittiyse bırak
    if ((c.p && (!c.p.alive || !this.players.has(c.p.id))) || (c.c && !this.creatures.includes(c.c))) { tu.target = null; return; }
    const tx = c.p ? c.p.x : c.c.x, ty = c.p ? c.p.y + 1.1 : c.c.y, tz = c.p ? c.p.z : c.c.z;
    const dx = tx - tu.x, dy = ty - eyeY, dz = tz - tu.z;
    const hd = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz), wantP = Math.atan2(dy, hd);
    const err = wrap(want - tu.yaw);
    const step = T.turn * dt;
    tu.yaw = wrap(tu.yaw + Math.max(-step, Math.min(step, err)));
    tu.pitch += (wantP - tu.pitch) * Math.min(1, dt * T.turn);
    if (Math.abs(err) > 0.12 || this.time < tu.next) return;
    tu.next = this.time + T.every;
    // Hortumun ucundan, biraz sapmalı atış
    const cp = Math.cos(tu.pitch);
    const fx = -Math.sin(tu.yaw) * cp, fy = Math.sin(tu.pitch), fz = -Math.cos(tu.yaw) * cp;
    const ox = tu.x + fx * T.reach, oy = eyeY + fy * T.reach, oz = tu.z + fz * T.reach;
    let dxs = tx - ox, dys = ty - oy, dzs = tz - oz;
    const dl = Math.hypot(dxs, dys, dzs) || 1;
    dxs = dxs / dl + (Math.random() - 0.5) * 2 * T.spread;
    dys = dys / dl + (Math.random() - 0.5) * 2 * T.spread;
    dzs = dzs / dl + (Math.random() - 0.5) * 2 * T.spread;
    const nl = Math.hypot(dxs, dys, dzs);
    dxs /= nl; dys /= nl; dzs /= nl;
    const wall = this.world.raycast(ox, oy, oz, dxs, dys, dzs, T.range);
    let endT = wall ? wall.t : T.range;
    let hitP = null, hitC = null, head = false;
    for (const q of this.players.values()) {
      if (!q.alive || q.id === tu.owner) continue;
      const h = rayVsPlayer(ox, oy, oz, dxs, dys, dzs, endT, q.x, q.y, q.z);
      if (h) { endT = h.t; hitP = q; hitC = null; head = h.head; }
    }
    for (const cr of this.creatures) {
      const t = rayVsSphere(ox, oy, oz, dxs, dys, dzs, endT, cr.x, cr.y, cr.z, CREATURE.r);
      if (t !== null) { endT = t; hitC = cr; hitP = null; }
    }
    this.broadcast({ t: 'tfire', tu: tu.id, e: [r2(ox + dxs * endT), r2(oy + dys * endT), r2(oz + dzs * endT)] });
    if (hitP) this.damage(hitP, owner, T.dmg * (head ? T.hs : 1), 'tully', { hs: head, from: [tu.x, tu.z] });
    else if (hitC) this.damageCreature(hitC, T.dmg, owner, 'tully');
  },

  // Patlama: oyuncular, araçlar, yaratıklar, taretler (sahibinin taretleri hariç)
  blast(bx, by, bz, radius, maxDmg, kb, attacker, w, ownerId = attacker ? attacker.id : -1) {
    for (const tg of this.players.values()) {
      if (!tg.alive) continue;
      const cx = tg.x - bx, cy = tg.y + 0.9 - by, cz = tg.z - bz;
      const d = Math.hypot(cx, cy, cz);
      if (d >= radius) continue;
      const f = 1 - d / radius;
      let dmg = maxDmg * Math.pow(f, 0.8);
      if (tg.id === ownerId) dmg *= 0.4;
      const inv = d > 0.1 ? 1 / d : 0;
      this.damage(tg, attacker, dmg, w, {
        kb: [r2(cx * inv * kb * f), r2((d > 0.1 ? cy * inv : 1) * kb * f + kb * 0.35 * f), r2(cz * inv * kb * f)],
        from: [bx, bz],
      });
    }
    this.splashVehicles(bx, by, bz, radius, maxDmg, attacker, w);
    this.splashEntities(bx, by, bz, radius, maxDmg, attacker, w, ownerId);
  },

  splashEntities(bx, by, bz, radius, maxDmg, attacker, w, ownerId = attacker ? attacker.id : -1) {
    for (const c of [...this.creatures]) {
      const d = Math.hypot(c.x - bx, c.y - by, c.z - bz);
      if (d >= radius + CREATURE.r) continue;
      const f = Math.max(0, 1 - Math.max(0, d - CREATURE.r) / radius);
      this.damageCreature(c, maxDmg * Math.pow(f, 0.8), attacker, w);
    }
    for (const tu of [...this.turrets]) {
      if (tu.owner === ownerId) continue;
      const d = Math.hypot(tu.x - bx, tu.y + 0.8 - by, tu.z - bz);
      if (d >= radius + 0.6) continue;
      const f = Math.max(0, 1 - Math.max(0, d - 0.6) / radius);
      this.damageTurret(tu, maxDmg * Math.pow(f, 0.8), attacker, w);
    }
  },

  // ------------------------------------------------------------
  // Anomalocaris yaratıkları
  spawnCreatures(n = Math.round(rand(CREATURE.group[0], CREATURE.group[1])), atX, atZ) {
    let x = 0, y = 0, z = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = atX ?? rand(-HALF + 8, HALF - 8);
      z = atZ ?? rand(-HALF + 8, HALF - 8);
      y = this.world.groundAt(x, z, 40) + 4.5;
      if (this.world.overlapsPlayer(x, y - 1.2, z, 2, 2.4)) continue;
      let near = false;
      for (const q of this.players.values()) if (q.alive && Math.hypot(q.x - x, q.z - z) < 22) near = true;
      if (!near || atX !== undefined) break;
    }
    for (let i = 0; i < n && this.creatures.length < CREATURE.max; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = {
        id: this.nextCreature++, x: r2(x + Math.cos(a) * 1.8), y: r2(y + i * 0.4), z: r2(z + Math.sin(a) * 1.8),
        vx: 0, vy: 0, vz: 0, yaw: rand(-Math.PI, Math.PI), hp: CREATURE.hp, nextBite: 0, target: null, retarget: 0,
        home: [x, y, z], pullBy: null, pullUntil: 0,
      };
      this.creatures.push(c);
      this.broadcast({ t: 'cre', c: this.creatureInfo(c), g: i === 0 ? 1 : 0 });
    }
  },

  damageCreature(c, amount, attacker, w) {
    if (!(amount > 0) || !this.creatures.includes(c)) return;
    c.hp = Math.max(0, c.hp - amount);
    this.broadcast({ t: 'cdmg', c: c.id, hp: Math.round(c.hp), a: attacker ? attacker.id : -1 });
    if (c.hp <= 0) {
      this.creatures.splice(this.creatures.indexOf(c), 1);
      this.broadcast({ t: 'cdead', c: c.id, p: [r2(c.x), r2(c.y), r2(c.z)], a: attacker ? attacker.id : -1, w });
    }
  },

  tickCreatures(dt) {
    this.creatureTimer -= dt;
    if (this.creatureTimer <= 0) {
      this.creatureTimer = rand(CREATURE.every[0], CREATURE.every[1]);
      if (this.creatures.length < CREATURE.max) this.spawnCreatures();
    }
    const S = CREATURE.speed;
    for (const c of this.creatures) {
      let dvx = 0, dvy = 0, dvz = 0, tgt = null;
      const puller = c.pullBy !== null && this.time < c.pullUntil ? this.players.get(c.pullBy) : null;
      if (puller && puller.alive) {
        // Yakalama silahı: çekene doğru hızla sürüklenir
        const dx = puller.x - c.x, dy = puller.y + 1.2 - c.y, dz = puller.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 2.2) c.pullUntil = 0;
        else { dvx = dx / d * 20; dvy = dy / d * 20; dvz = dz / d * 20; }
      } else {
        c.pullBy = null;
        if (this.time >= c.retarget) {
          c.retarget = this.time + 0.5;
          let best = null, bd = CREATURE.aggro;
          for (const q of this.players.values()) {
            if (!q.alive || q.prot > this.time) continue;
            const d = Math.hypot(q.x - c.x, q.y + 1.1 - c.y, q.z - c.z);
            if (d < bd) { bd = d; best = q; }
          }
          c.target = best ? best.id : null;
        }
        tgt = c.target !== null ? this.players.get(c.target) : null;
        if (tgt && !tgt.alive) { tgt = null; c.target = null; }
        let wx, wy, wz, sp;
        if (tgt) { wx = tgt.x; wy = tgt.y + 1.1; wz = tgt.z; sp = S; } else {
          // Hedef yoksa doğduğu yerin çevresinde süzülür
          const a = this.time * 0.35 + c.id;
          wx = c.home[0] + Math.cos(a) * 8; wy = c.home[1]; wz = c.home[2] + Math.sin(a) * 8; sp = S * 0.4;
        }
        const dx = wx - c.x, dy = wy - c.y, dz = wz - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.6) {
          dvx = dx / d * sp; dvy = dy / d * sp; dvz = dz / d * sp;
          // Hedefle arasında engel varsa yükselerek üstünden aşar (hedefin ötesindeki zemin engel sayılmaz)
          const ahead = this.world.raycast(c.x, c.y, c.z, dvx / sp, dvy / sp, dvz / sp, Math.min(2.4, d - 0.4));
          if (ahead) { dvy = Math.max(dvy, sp * 0.9); dvx *= 0.3; dvz *= 0.3; }
        }
        const g = this.world.groundAt(c.x, c.z, c.y + 0.3);
        if (c.y - g < 1.0) dvy = Math.max(dvy, 3);
      }
      const k = Math.min(1, dt * 3);
      c.vx += (dvx - c.vx) * k; c.vy += (dvy - c.vy) * k; c.vz += (dvz - c.vz) * k;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
      if (!this.world.overlapsPlayer(nx, ny - 0.35, nz, 0.55, 0.7)) { c.x = nx; c.y = ny; c.z = nz; } else if (!this.world.overlapsPlayer(c.x, ny + 0.25, c.z, 0.55, 0.7)) {
        c.y = ny + 0.25; c.vx *= 0.3; c.vz *= 0.3;
      } else { c.vx *= -0.3; c.vy = Math.abs(c.vy) * 0.3 + 1; c.vz *= -0.3; }
      c.x = Math.max(-HALF + 1, Math.min(HALF - 1, c.x));
      c.z = Math.max(-HALF + 1, Math.min(HALF - 1, c.z));
      c.y = Math.max(0.6, Math.min(35, c.y));
      if (Math.hypot(c.vx, c.vz) > 0.5) c.yaw = wrap(c.yaw + wrap(Math.atan2(-c.vx, -c.vz) - c.yaw) * Math.min(1, dt * 5));
      // Isırma: yalnızca yakın saldırı
      if (tgt && this.time >= c.nextBite) {
        const dx = tgt.x - c.x, dy = tgt.y + 1.1 - c.y, dz = tgt.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < CREATURE.reach) {
          c.nextBite = this.time + CREATURE.biteCd;
          const inv = d > 0.1 ? 1 / d : 0;
          this.broadcast({ t: 'cbite', c: c.id, tg: tgt.id });
          this.damage(tgt, null, CREATURE.bite, 'anomalo', { kb: [r2(dx * inv * 5), 3, r2(dz * inv * 5)], from: [c.x, c.z] });
        }
      }
    }
  },

  // ------------------------------------------------------------
  // Deniz kabuğu mayınları
  spawnMine() {
    let x = 0, y = 0, z = 0, ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      x = r2(rand(-HALF + 4, HALF - 4));
      z = r2(rand(-HALF + 4, HALF - 4));
      y = this.world.groundAt(x, z, 60);
      ok = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].every(([dx, dz]) => Math.abs(this.world.groundAt(x + dx, z + dz, 60) - y) < 0.01);
      const far = (list, d) => list.every((o) => Math.hypot(o.x - x, o.z - z) >= d);
      ok &&= far([...this.players.values()].filter((q) => q.alive), 10) && far(this.mines, 6) && far([...this.crates.values()], 3)
        && far(this.map.trampolines, 3.5) && far(this.map.spawns, 4) && far(this.vehicles.map((v) => v.home), 4) && far(this.turrets, 2);
    }
    if (!ok) return;
    const m = { id: this.nextMine++, x, y: r2(y), z, yaw: r2(rand(-Math.PI, Math.PI)), born: this.time };
    this.mines.push(m);
    this.broadcast({ t: 'mine', m: this.mineInfo(m) });
  },

  explodeMine(m, by) {
    const i = this.mines.indexOf(m);
    if (i < 0) return;
    this.mines.splice(i, 1);
    this.broadcast({ t: 'mboom', m: m.id, p: [m.x, m.y, m.z], by: by ? by.id : -1 });
    this.blast(m.x, m.y + 0.3, m.z, MINE.radius, MINE.dmg, MINE.kb, null, 'shellmine', -1);
  },

  tickMines(dt) {
    this.mineTimer -= dt;
    if (this.mineTimer <= 0) {
      this.mineTimer = rand(MINE.every[0], MINE.every[1]);
      if (this.mines.length < MINE.max) this.spawnMine();
    }
    // Üstünden geçen (yaya ya da araçla) mayını patlatır. Hızlı araçlar atlamasın diye
    // son tick'ten bu yana gidilen yol parçası denetlenir.
    for (const p of this.players.values()) {
      if (!p.alive) { p.mpx = undefined; continue; }
      if (p.mpx === undefined || Math.hypot(p.x - p.mpx, p.z - p.mpz) > 10) { p.mpx = p.x; p.mpz = p.z; }
      const v = p.veh ? this.vehicle(p.veh) : null;
      const footY = v ? p.y - VEH[v.kind].seatOff : p.y;
      const extra = v ? VEH[v.kind].body.radius * 0.8 : 0;
      for (const m of [...this.mines]) {
        if (this.time - m.born < MINE.arm || Math.abs(footY - m.y) > 0.9) continue;
        if (distToSeg(m.x, m.z, p.mpx, p.mpz, p.x, p.z) < MINE.trigger + extra) this.explodeMine(m, p);
      }
      p.mpx = p.x; p.mpz = p.z;
    }
  },

  // ------------------------------------------------------------
  // Yakalama silahı: kanca takılan rakip (ya da yaratık) atana doğru çekilir
  grab(id, p, msg) {
    const W = WEAPONS.grapple;
    if (!p.alive || !p.inv.has('grapple')) return;
    if (!this.rateOk(p, 'grab', 0.6 / W.rate)) return;
    this.endProtection(p);
    if (msg.c != null) {
      const c = this.creatureById(msg.c);
      if (!c || Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) > W.range + 6) return;
      c.pullBy = id;
      c.pullUntil = this.time + W.pull.dur;
      this.broadcast({ t: 'grab', by: id, c: c.id, dur: W.pull.dur });
      this.damageCreature(c, W.dmg, p, 'grapple');
      return;
    }
    const tg = this.players.get(msg.tg);
    if (!tg || tg === p || !tg.alive || tg.prot > this.time) return;
    if (Math.hypot(tg.x - p.x, tg.y - p.y, tg.z - p.z) > W.range + 6) return;
    this.releaseVehicle(tg); // araçtan sökülüp alınır
    this.damage(tg, p, W.dmg, 'grapple');
    if (tg.alive) this.broadcast({ t: 'grab', by: id, tg: tg.id, dur: W.pull.dur });
  },

  // ------------------------------------------------------------
  // Kedi tablosu: ona isabet eden hasar ateş edene döner
  mirror(id, p, msg) {
    const P = this.map.painting;
    if (!P) return;
    const [px, py, pz] = P.center;
    let amount = null, w = msg.w;
    if (msg.id != null) {
      const pr = p.proj.get(msg.id);
      if (!pr) return;
      w = pr.w;
      if (pr.w === 'saw') {
        if (Math.hypot(px - p.x, pz - p.z) > 90 || !this.sawOnce(p, msg, 'mirror')) return;
        amount = WEAPONS.saw.dmg;
      } else {
        const W = WEAPONS[pr.w];
        if (!W || !(W.radius > 0)) return; // yalnızca patlayan mermiler yansır
        p.proj.delete(msg.id);
        amount = W.dmg;
      }
    } else {
      amount = this.weaponHitAmount(p, msg, 'mirror', px, pz);
    }
    if (!amount) return;
    this.broadcast({ t: 'mir', by: id, p: [px, py, pz], w });
    this.damage(p, p, amount, 'mirror');
  },

  // Oyuncu ayrılınca taretleri söner
  removePlayerEntities(id) {
    for (const tu of this.turrets.filter((t) => t.owner === id)) this.removeTurret(tu, false);
    for (const c of this.creatures) if (c.pullBy === id) c.pullBy = null;
  },

  tickEntities(dt) {
    this.tickTurrets(dt);
    this.tickCreatures(dt);
    this.tickMines(dt);
  },

  // Anlık görüntüye eklenenler: yaratık konumları, Tullimonstrum taretlerinin nişanı
  entitiesSnap(msg) {
    if (this.creatures.length) msg.cr = this.creatures.map((c) => [c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yaw)]);
    const ta = [];
    for (const tu of this.turrets) if (tu.kind === 'tully') ta.push([tu.id, r2(tu.yaw), r2(tu.pitch)]);
    if (ta.length) msg.ta = ta;
  },
};
