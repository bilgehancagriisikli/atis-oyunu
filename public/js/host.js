// Admin (sunucu) oyun mantığı: can, skor, kutular, doğma, kara delikler.
// Hareket her oyuncunun kendi tarayıcısında hesaplanır; hasar ve eşyalar burada onaylanır.
import { CONFIG } from './config.js';
import { hashAccessCode } from './sha256.js';
import { WEAPONS, randomCrateWeapon, STARTER } from './weapons.js';
import { VEH } from './vehicles.js';
import { POLY_COUNT } from './polyhedra.js';
import { HostEntities } from './host-entities.js';
import { HALF } from './map.js';

export const PLAYER_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x1abc9c,
  0xe67e22, 0xff6b9d, 0xbdc3c7, 0x34e7e4, 0xa3cb38, 0xfd7272,
];
export const CRATE_FALL_H = 30;
export const CRATE_FALL_SPEED = 5;
const RESPAWN_TIME = 3;
const SPAWN_PROTECT = 2;
const VEHICLE_RESET = 90; // terk edilen araç bu kadar saniye sonra park yerine döner
const VEHICLE_RESPAWN = 20; // patlayan araç bu kadar saniye sonra park yerinde yeniden çıkar
// Gökten düşen cisim (sıklık eskisinin 2,5 katı: 18-32 sn yerine 7,2-12,8 sn)
export const METEOR = { fall: 3.2, height: 55, radius: 7, dmg: 75, kb: 16, every: [18 / 2.5, 32 / 2.5] };

const r2 = (v) => Math.round(v * 100) / 100;

export class HostLogic {
  constructor(map) {
    this.map = map;
    this.world = map.world;
    this.players = new Map();
    this.conns = new Map();
    this.nextId = 1;
    this.crates = new Map();
    this.nextCrate = 1;
    this.holes = [];
    this.nextHole = 1;
    this.time = 0;
    this.crateTimer = 4;
    this.snapTimer = 0;
    this.infoTimer = 0;
    this.pingTimer = 0;
    this.holeTimer = 0;
    this.deliver = null;
    this.worker = null;
    this.vehicles = map.vehicleSpawns.map((v, i) => ({
      id: i + 1, kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw, rider: null, idle: 0, home: { ...v },
      hp: VEH[v.kind].hp, dead: false, respawnAt: 0,
    }));
    this.meteors = [];
    this.nextMeteor = 1;
    this.meteorTimer = 8;
    this.initEntities();
  }

  // --------------------------------------------------------
  start(adminName, deliver) {
    this.deliver = deliver;
    const p = this.createPlayer(0, adminName);
    this.players.set(0, p);
    // Başlangıçta yere inmiş birkaç kutu
    for (let i = 0; i < 4; i++) this.spawnCrate(true);
    this.spawnPlayer(p);
    this.sys(`Sunucu açıldı. Oyuncular oyuncu kodu ile katılabilir.`);
    this.startTicker();
  }

  // Sekme arka plana alınsa da çalışsın diye zamanlayıcı Worker içinde
  startTicker() {
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.tick(dt);
    };
    try {
      const src = 'setInterval(() => postMessage(0), 50);';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = step;
    } catch (e) {
      this.interval = setInterval(step, 50);
    }
  }

  stop() {
    if (this.worker) this.worker.terminate();
    if (this.interval) clearInterval(this.interval);
    for (const c of this.conns.values()) {
      try { c.close(); } catch (e) { /* yok say */ }
    }
  }

  createPlayer(id, name) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[id % PLAYER_COLORS.length];
    return {
      id, name, color,
      hp: 100, alive: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, w: 'pistol', f: 0,
      kills: 0, deaths: 0, inv: new Set(['pistol']), prot: 0, respawnAt: 0,
      lastHit: {}, proj: new Map(), ping: 0, lastChat: 0, lastSeen: performance.now(),
      veh: null, jet: false,
    };
  }

  publicInfo(p) {
    return {
      id: p.id, name: p.name, color: p.color, hp: p.hp, alive: p.alive,
      x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), w: p.w, kills: p.kills, deaths: p.deaths,
    };
  }

  vehInfo(v) {
    return { id: v.id, k: v.kind, p: [r2(v.x), r2(v.y), r2(v.z)], yaw: r2(v.yaw), r: v.rider, hp: Math.round(v.hp), dead: v.dead ? 1 : 0 };
  }

  // Araca hasar (silah, patlama, gökten düşen cisim)
  damageVehicle(v, amount, attacker, w) {
    if (!v || v.dead || !(amount > 0)) return; // NaN da reddedilir
    v.hp = Math.max(0, v.hp - amount);
    this.broadcast({ t: 'vdmg', v: v.id, hp: Math.round(v.hp), a: attacker ? attacker.id : -1 });
    if (v.hp <= 0) this.destroyVehicle(v, attacker, w);
  }

  // Araç parçalanır: binici fırlar ve hasar alır, araç bir süre sonra park yerinde çıkar
  destroyVehicle(v, attacker, w) {
    const rider = v.rider !== null ? this.players.get(v.rider) : null;
    if (rider) this.releaseVehicle(rider);
    v.dead = true;
    v.respawnAt = this.time + VEHICLE_RESPAWN;
    this.broadcast({ t: 'vdead', v: v.id, p: [r2(v.x), r2(v.y), r2(v.z)] });
    if (rider && rider.alive) this.damage(rider, attacker, 35, w || 'vboom', { kb: [0, 12, 0] });
  }

  reviveVehicle(v) {
    v.dead = false;
    v.hp = VEH[v.kind].hp;
    v.rider = null;
    v.x = v.home.x; v.y = v.home.y; v.z = v.home.z; v.yaw = v.home.yaw;
    v.idle = this.time;
    this.broadcast({ t: 'vspawn', v: v.id, p: [v.x, v.y, v.z], yaw: r2(v.yaw), hp: v.hp });
  }

  // Patlama alan hasarı araçlara da işler
  splashVehicles(bx, by, bz, radius, maxDmg, attacker, w) {
    for (const v of this.vehicles) {
      if (v.dead) continue;
      const H = VEH[v.kind].hit;
      const d = Math.hypot(v.x - bx, v.y + (H.y0 + H.y1) / 2 - by, v.z - bz);
      if (d >= radius + H.hw) continue;
      const f = Math.max(0, 1 - Math.max(0, d - H.hw) / radius);
      this.damageVehicle(v, maxDmg * Math.pow(f, 0.8), attacker, w);
    }
  }

  // Gökten rastgele bir cisim düşer (önce yere uyarı halkası çıkar)
  spawnMeteor(atX, atZ) {
    const x = r2(atX ?? (Math.random() * 2 - 1) * (HALF - 6));
    const z = r2(atZ ?? (Math.random() * 2 - 1) * (HALF - 6));
    const y = r2(this.world.groundAt(x, z, 60));
    const m = { id: this.nextMeteor++, s: Math.floor(Math.random() * POLY_COUNT), x, y, z, born: this.time };
    this.meteors.push(m);
    this.broadcast({ t: 'met', id: m.id, s: m.s, p: [x, y, z], dur: METEOR.fall, age: 0 });
  }

  meteorImpact(m) {
    const w = 'poly' + m.s;
    for (const tg of this.players.values()) {
      if (!tg.alive) continue;
      const cx = tg.x - m.x, cy = tg.y + 0.9 - m.y, cz = tg.z - m.z;
      const d = Math.hypot(cx, cy, cz);
      if (d >= METEOR.radius) continue;
      const f = 1 - d / METEOR.radius;
      const inv = d > 0.1 ? 1 / d : 0;
      this.damage(tg, null, METEOR.dmg * Math.pow(f, 0.7), w,
        { kb: [r2(cx * inv * METEOR.kb * f), r2(METEOR.kb * 0.6 * f + 3), r2(cz * inv * METEOR.kb * f)] });
    }
    this.splashVehicles(m.x, m.y + 0.5, m.z, METEOR.radius, METEOR.dmg * 1.2, null, w);
    this.splashEntities(m.x, m.y + 0.5, m.z, METEOR.radius, METEOR.dmg * 1.2, null, w);
  }

  vehicle(id) {
    return this.vehicles.find((v) => v.id === id) || null;
  }

  // Aracı bırak (inme, ölüm, çıkış, ışınlanma). Havada bırakılan araç altındaki zemine konur.
  parkVehicle(v, x, y, z, yaw, forced) {
    const g = this.world.supportHeight(x, z, VEH[v.kind].body.radius, y + 0.5);
    if (g > -Infinity) y = g;
    const rider = this.players.get(v.rider);
    if (rider) rider.veh = null;
    const by = v.rider;
    v.rider = null;
    v.x = x; v.y = y; v.z = z; v.yaw = yaw;
    v.idle = this.time;
    this.broadcast({ t: 'dismount', v: v.id, by, p: [r2(x), r2(y), r2(z)], yaw: r2(yaw), f: forced ? 1 : 0 });
  }

  releaseVehicle(p) {
    const v = p.veh ? this.vehicle(p.veh) : null;
    if (v && v.rider === p.id) this.parkVehicle(v, v.x, v.y, v.z, v.yaw, true);
    p.veh = null;
  }

  resetVehicle(v) {
    if (v.rider !== null) return;
    // Park yerinde biri duruyorsa bekle
    for (const p of this.players.values()) {
      if (p.alive && Math.hypot(p.x - v.home.x, p.z - v.home.z) < 2.5) return;
    }
    v.x = v.home.x; v.y = v.home.y; v.z = v.home.z; v.yaw = v.home.yaw;
    v.idle = this.time;
    this.broadcast({ t: 'vpos', v: v.id, p: [v.x, v.y, v.z], yaw: r2(v.yaw) });
  }

  crateInfo(c) {
    return { id: c.id, x: c.x, y: c.y, z: c.z, k: c.k, w: c.w, age: r2(this.time - c.born) };
  }

  welcomeData(id) {
    return {
      id,
      time: this.time,
      players: [...this.players.values()].map((p) => this.publicInfo(p)),
      crates: [...this.crates.values()].map((c) => this.crateInfo(c)),
      holes: this.holes.map((h) => ({ id: h.id, k: h.k, p: [h.x, h.y, h.z], by: h.by, dur: h.dur - (this.time - h.born) })),
      vehicles: this.vehicles.map((v) => this.vehInfo(v)),
      meteors: this.meteors.map((m) => ({ id: m.id, s: m.s, p: [m.x, m.y, m.z], dur: METEOR.fall, age: r2(this.time - m.born) })),
      ...this.entitiesWelcome(),
      cubes: [...this.players.values()].flatMap((q) => [...q.proj]
        .filter(([, r]) => r.w === 'rubik' && r.o && this.time - r.t < WEAPONS.rubik.life)
        .map(([pid, r]) => ({ id: pid, by: q.id, o: r.o, v: r.v, age: r2(this.time - r.t) }))),
    };
  }

  // --------------------------------------------------------
  send(id, msg) {
    if (id === 0) { this.deliver && this.deliver(msg); return; }
    const c = this.conns.get(id);
    if (c && c.open) {
      try { c.send(msg); } catch (e) { console.warn('gönderim hatası', e); }
    }
  }

  broadcast(msg, except = -1) {
    for (const id of this.players.keys()) if (id !== except) this.send(id, msg);
  }

  sys(text) {
    this.broadcast({ t: 'chat', sys: text });
  }

  // --------------------------------------------------------
  handleConnection(conn) {
    let id = null;
    const reject = (msg) => {
      try { conn.send({ t: 'err', msg }); } catch (e) { /* yok say */ }
      setTimeout(() => conn.close(), 600);
    };
    const helloTimer = setTimeout(() => { if (id === null) conn.close(); }, 12000);
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (id !== null) { this.receive(id, msg); return; }
      if (msg.t !== 'hello') return;
      clearTimeout(helloTimer);
      if (msg.v !== CONFIG.VERSION) return reject('Oyun sürümü uyuşmuyor. Sayfayı yenile (Ctrl+F5).');
      if (hashAccessCode(msg.code || '') !== CONFIG.PLAYER_CODE_HASH) return reject('Geçersiz erişim kodu.');
      const name = String(msg.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
      if (!name) return reject('Kullanıcı adı boş olamaz.');
      if (name.toLocaleUpperCase('tr') === CONFIG.ADMIN_NAME.toLocaleUpperCase('tr')) {
        return reject(`"${CONFIG.ADMIN_NAME}" ismi admin'e ayrılmıştır.`);
      }
      const lower = name.toLocaleLowerCase('tr');
      for (const p of this.players.values()) {
        if (p.name.toLocaleLowerCase('tr') === lower) return reject('Bu kullanıcı adı şu an oyunda. Başka bir isim seç.');
      }
      if (this.players.size >= CONFIG.MAX_PLAYERS) return reject('Sunucu dolu.');
      id = this.nextId++;
      const p = this.createPlayer(id, name);
      this.players.set(id, p);
      this.conns.set(id, conn);
      this.send(id, { t: 'welcome', ...this.welcomeData(id) });
      this.broadcast({ t: 'join', pl: this.publicInfo(p) }, id);
      this.spawnPlayer(p);
      this.sys(`${name} oyuna katıldı.`);
    });
    conn.on('close', () => {
      clearTimeout(helloTimer);
      if (id !== null) this.removePlayer(id);
    });
    conn.on('error', (e) => console.warn('bağlantı hatası', e));
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.releaseVehicle(p);
    this.removePlayerEntities(id);
    this.players.delete(id);
    this.conns.delete(id);
    this.broadcast({ t: 'leave', id });
    this.sys(`${p.name} oyundan ayrıldı.`);
  }

  kick(id, reason) {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.send(id, { t: 'kick', msg: reason });
    setTimeout(() => { try { conn.close(); } catch (e) { /* yok say */ } this.removePlayer(id); }, 400);
  }

  // --------------------------------------------------------
  pickSpawn(p) {
    const others = [...this.players.values()].filter((o) => o.alive && o !== p);
    const scored = this.map.spawns.map((s) => {
      let d = 999;
      for (const o of others) d = Math.min(d, Math.hypot(o.x - s.x, o.z - s.z));
      return { s, d: d + Math.random() * 12 };
    });
    scored.sort((a, b) => b.d - a.d);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
  }

  spawnPlayer(p) {
    const s = this.pickSpawn(p);
    this.releaseVehicle(p);
    p.alive = true;
    p.hp = 100;
    p.jet = false;
    p.inv = new Set(STARTER);
    p.w = 'pistol';
    p.prot = this.time + SPAWN_PROTECT;
    p.respawnAt = 0;
    p.x = s.x; p.y = s.y; p.z = s.z;
    p.yaw = Math.atan2(s.x, s.z);
    this.broadcast({ t: 'spawn', id: p.id, p: [s.x, s.y, s.z], yaw: r2(p.yaw), prot: SPAWN_PROTECT });
  }

  // --------------------------------------------------------
  spawnCrate(landed = false) {
    let x = 0, z = 0, y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = r2((Math.random() * 2 - 1) * (HALF - 5));
      z = r2((Math.random() * 2 - 1) * (HALF - 5));
      y = this.world.groundAt(x, z, 60);
      // Kutu tamamen düz bir yüzeye otursun (direk tepesi, rampa, kenar olmasın)
      let ok = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]
        .every(([dx, dz]) => Math.abs(this.world.groundAt(x + dx, z + dz, 60) - y) < 0.01);
      for (const c of this.crates.values()) if (Math.hypot(c.x - x, c.z - z) < 10) ok = false;
      if (ok) break;
    }
    y = r2(y);
    // h: can, j: jetpack, w: silah
    const roll = Math.random();
    const k = roll < 0.2 ? 'h' : roll < 0.3 ? 'j' : 'w';
    const c = {
      id: this.nextCrate++, x, y, z, k, w: k === 'w' ? randomCrateWeapon() : null,
      born: this.time - (landed ? CRATE_FALL_H / CRATE_FALL_SPEED : 0),
    };
    this.crates.set(c.id, c);
    this.broadcast({ t: 'crate', c: this.crateInfo(c) });
  }

  crateHeight(c) {
    const age = this.time - c.born;
    return Math.max(c.y, c.y + CRATE_FALL_H - CRATE_FALL_SPEED * age);
  }

  // --------------------------------------------------------
  damage(tg, a, amount, w, extra = {}) {
    if (!tg.alive) return;
    if (tg.prot > this.time) {
      if (extra.kb) this.send(tg.id, { t: 'dmg', tg: tg.id, a: a ? a.id : -1, hp: tg.hp, w, kb: extra.kb, prot: 1 });
      return;
    }
    amount = Math.max(1, Math.round(amount));
    tg.hp = Math.max(0, tg.hp - amount);
    const m = { t: 'dmg', tg: tg.id, a: a ? a.id : -1, hp: tg.hp, w, n: amount };
    if (extra.kb) m.kb = extra.kb;
    if (extra.from) m.f = extra.from.map(r2); // hasar yönü göstergesi için kaynak (taret, yaratık, patlama)
    if (extra.fz) m.fz = extra.fz;
    if (extra.hs) m.hs = 1;
    this.broadcast(m);
    if (tg.hp <= 0) {
      tg.alive = false;
      tg.deaths++;
      tg.respawnAt = this.time + RESPAWN_TIME;
      tg.proj.clear();
      tg.jet = false;
      this.releaseVehicle(tg);
      if (a && a !== tg) a.kills++;
      this.broadcast({ t: 'kill', tg: tg.id, a: a ? a.id : -1, w, k: a ? a.kills : 0, d: tg.deaths });
    }
  }

  // Ateş eden oyuncunun doğma koruması biter
  endProtection(p) {
    if (p.prot <= this.time) return;
    p.prot = 0;
    this.broadcast({ t: 'prot', id: p.id });
  }

  // Atış hızı denetimi (tick aralığından bağımsız gerçek zaman)
  rateOk(p, key, minInterval) {
    const t = performance.now() / 1000;
    const last = p.lastHit[key] || -9;
    if (t - last < minInterval) return false;
    p.lastHit[key] = t;
    return true;
  }

  receive(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeen = performance.now();
    switch (msg.t) {
      case 'st': {
        if (!p.alive || !Array.isArray(msg.p)) return;
        const [x, y, z] = msg.p.map(Number);
        if (![x, y, z].every(Number.isFinite)) return;
        // Binmeden önce gönderilmiş (araç bilgisi olmayan) eski konumlar oyuncuyu eyerden indirmesin
        const stale = p.veh && !(Array.isArray(msg.v) && msg.v[0] === p.veh);
        // Yatay hız tahmini (mantar taretinin önden nişan alması için)
        const nowS = performance.now() / 1000, dts = nowS - (p.stT || 0);
        if (dts > 0.01 && dts < 0.5 && !stale) {
          p.vxe = (p.vxe || 0) * 0.6 + Math.max(-30, Math.min(30, (x - p.x) / dts)) * 0.4;
          p.vze = (p.vze || 0) * 0.6 + Math.max(-30, Math.min(30, (z - p.z) / dts)) * 0.4;
        } else { p.vxe = 0; p.vze = 0; }
        p.stT = nowS;
        if (!stale) { p.x = x; p.y = y; p.z = z; }
        if (Array.isArray(msg.r)) { p.yaw = +msg.r[0] || 0; p.pitch = +msg.r[1] || 0; }
        if (WEAPONS[msg.w] && p.inv.has(msg.w)) p.w = msg.w;
        p.f = msg.f | 0;
        // Bindiği araç binicinin altında hareket eder
        const v = p.veh ? this.vehicle(p.veh) : null;
        if (v && Array.isArray(msg.v) && msg.v[0] === v.id) {
          v.x = x; v.y = y - VEH[v.kind].seatOff; v.z = z;
          if (Number.isFinite(+msg.v[1])) v.yaw = +msg.v[1];
        }
        break;
      }
      case 'fire': {
        const W = WEAPONS[msg.w];
        if (!p.alive || !W || !p.inv.has(msg.w)) return;
        this.endProtection(p);
        if (W.type === 'projectile') {
          // Testere tek atışta birden çok mermi (ids) gönderir
          const ids = Array.isArray(msg.ids) ? msg.ids.slice(0, W.blades || 1) : msg.id != null ? [msg.id] : [];
          const vec = (a) => Array.isArray(a) && a.length === 3 && a.every((c) => Number.isFinite(c)) ? a : null;
          // Zeka küpleri uzun bekler: sonradan katılanlara gösterebilmek için atış verisi saklanır
          const launch = msg.w === 'rubik' && vec(msg.o) && vec(msg.v) ? { o: msg.o, v: msg.v } : null;
          for (const pid of ids) p.proj.set(pid, { w: msg.w, t: this.time, ...launch });
          // Sınır aşılınca en eski mermi silinir; uzun süre bekleyen zeka küpleri korunur
          while (p.proj.size > 40) {
            let victim = null;
            for (const [k, v] of p.proj) if (v.w !== 'rubik') { victim = k; break; }
            p.proj.delete(victim ?? p.proj.keys().next().value);
          }
        }
        this.broadcast({ ...msg, by: id }, id);
        break;
      }
      case 'beam':
        if (msg.on) this.endProtection(p);
        if (WEAPONS[msg.w] && WEAPONS[msg.w].type === 'beam') this.broadcast({ t: 'beam', by: id, on: !!msg.on, w: msg.w }, id);
        break;
      case 'hit': {
        const W = WEAPONS[msg.w];
        const tg = this.players.get(msg.tg);
        if (!p.alive || !W || !tg || tg === p || !p.inv.has(msg.w)) return;
        if (Math.hypot(tg.x - p.x, tg.y - p.y, tg.z - p.z) > (W.range || 100) + 8) return;
        // mt: binicinin aracına isabet (daha az hasar)
        const mk = msg.mt ? 0.6 : 1;
        if (W.type === 'beam') {
          if (!this.rateOk(p, msg.tg + msg.w, W.tick * 0.6)) return;
          this.damage(tg, p, W.dmg * mk, msg.w, W.slow ? { fz: W.slow } : {});
        } else if (W.type === 'hitscan' || W.type === 'rail') {
          if (!this.rateOk(p, msg.tg + msg.w, 0.6 / W.rate)) return;
          const n = Math.max(1, Math.min(W.pellets || 1, msg.n | 0));
          this.damage(tg, p, W.dmg * n * (msg.hs ? W.hs : 1) * mk, msg.w, { hs: !!msg.hs });
        } else if (W.type === 'melee') {
          // Sunucudaki konumlar biraz geriden gelir; menzile pay bırakılır
          if (Math.hypot(tg.x - p.x, tg.y - p.y, tg.z - p.z) > W.range + 2) return;
          if (!this.rateOk(p, msg.tg + msg.w, 0.6 / W.rate)) return;
          this.endProtection(p);
          this.damage(tg, p, W.dmg, msg.w);
        } else if (W.type === 'fractal') {
          if (!this.rateOk(p, msg.tg + msg.w, 0.6 / W.rate)) return;
          const n = Math.max(1, Math.min(W.maxHits, msg.n | 0));
          this.damage(tg, p, W.dmg * n, msg.w);
        }
        break;
      }
      case 'vhit': {
        // Araca isabet (binili ya da park halinde)
        const W = WEAPONS[msg.w];
        const v = this.vehicle(msg.v);
        if (!W || !v || v.dead) return;
        // Testere: her bıçak ayrı mermidir; phit gibi mermi kimliğiyle (her araca bir kez) doğrulanır.
        // Son mermiyle silah envanterden düşmüş olabilir, bu yüzden envanter ve hız sınırı aranmaz.
        if (msg.w === 'saw') {
          const pr = p.proj.get(msg.id);
          if (!pr || pr.w !== 'saw' || this.time - pr.t > 6 || Math.hypot(v.x - p.x, v.z - p.z) > 90) return;
          pr.hits ||= new Set();
          if (pr.hits.has('v' + v.id)) return;
          pr.hits.add('v' + v.id);
          this.damageVehicle(v, W.dmg, p, 'saw');
          break;
        }
        if (!p.alive || !p.inv.has(msg.w)) return;
        if (Math.hypot(v.x - p.x, v.z - p.z) > (W.range || 100) + 10) return;
        if (!this.rateOk(p, 'v' + msg.v + msg.w, W.type === 'beam' ? W.tick * 0.6 : 0.6 / (W.rate || 2))) return;
        const n = Math.max(1, Math.min(W.pellets || W.maxHits || W.blades || 1, msg.n | 0));
        const per = Array.isArray(W.dmg) ? W.dmg[0] : W.dmg;
        if (!Number.isFinite(per)) return; // hasarı olmayan silahlar (delikler, ışınlanma)
        this.damageVehicle(v, per * n, p, msg.w);
        break;
      }
      case 'zap': {
        const W = WEAPONS.tesla;
        if (!p.alive || !p.inv.has('tesla') || !Array.isArray(msg.tg)) return;
        if (!this.rateOk(p, 'zap', 0.6 / W.rate)) return;
        this.endProtection(p);
        const seen = new Set();
        msg.tg.slice(0, 3).forEach((tid, i) => {
          const tg = this.players.get(tid);
          if (!tg || tg === p || seen.has(tid)) return;
          seen.add(tid);
          this.damage(tg, p, W.dmg[i], 'tesla');
        });
        this.broadcast({ t: 'zap', by: id, tg: msg.tg.slice(0, 3), e: msg.e }, id);
        break;
      }
      case 'boom': {
        const pr = p.proj.get(msg.id);
        if (!pr || !Array.isArray(msg.p)) return;
        p.proj.delete(msg.id);
        const W = WEAPONS[pr.w];
        if (!W || !(W.radius > 0)) return; // patlamayan mermiler (testere)
        const [bx, by, bz] = msg.p.map(Number);
        if (![bx, by, bz].every(Number.isFinite)) return;
        this.broadcast({ t: 'boom', by: id, w: pr.w, p: [bx, by, bz], id: msg.id }, id);
        for (const tg of this.players.values()) {
          if (!tg.alive) continue;
          const cx = tg.x - bx, cy = tg.y + 0.9 - by, cz = tg.z - bz;
          const d = Math.hypot(cx, cy, cz);
          if (d >= W.radius) continue;
          const f = 1 - d / W.radius;
          let dmg = W.dmg * Math.pow(f, 0.8);
          if (tg === p) dmg *= 0.4;
          const inv = d > 0.1 ? 1 / d : 0;
          const kb = [r2(cx * inv * W.kb * f), r2((d > 0.1 ? cy * inv : 1) * W.kb * f + W.kb * 0.35 * f), r2(cz * inv * W.kb * f)];
          this.damage(tg, p, dmg, pr.w, { kb });
        }
        this.splashVehicles(bx, by, bz, W.radius, W.dmg, p, pr.w);
        this.splashEntities(bx, by, bz, W.radius, W.dmg, p, pr.w);
        break;
      }
      case 'bh': {
        const pr = p.proj.get(msg.id);
        if (!pr || (pr.w !== 'blackhole' && pr.w !== 'whitehole') || !Array.isArray(msg.p)) return;
        p.proj.delete(msg.id);
        const [x, y, z] = msg.p.map(Number);
        if (![x, y, z].every(Number.isFinite)) return;
        const white = pr.w === 'whitehole';
        const P = white ? WEAPONS.whitehole.wh : WEAPONS.blackhole.bh;
        const h = { id: this.nextHole++, k: white ? 'w' : 'b', x: r2(x), y: r2(y), z: r2(z), by: id, born: this.time, dur: P.dur };
        this.holes.push(h);
        this.broadcast({ t: 'bh', id: h.id, k: h.k, p: [h.x, h.y, h.z], by: id, dur: P.dur, pid: msg.id });
        break;
      }
      case 'phit': {
        // Testere bir oyuncunun içinden geçti (her testere her oyuncuya bir kez)
        const pr = p.proj.get(msg.id);
        const tg = this.players.get(msg.tg);
        if (!pr || pr.w !== 'saw' || !tg || tg === p || !tg.alive || this.time - pr.t > 6) return;
        if (Math.hypot(tg.x - p.x, tg.z - p.z) > 90) return;
        pr.hits ||= new Set();
        if (pr.hits.has(tg.id)) return;
        pr.hits.add(tg.id);
        this.damage(tg, p, WEAPONS.saw.dmg, 'saw');
        break;
      }
      case 'tp': {
        const W = WEAPONS.teleport;
        if (!p.alive || !p.inv.has('teleport') || !Array.isArray(msg.to)) return;
        const [x, y, z] = msg.to.map(Number);
        if (![x, y, z].every(Number.isFinite) || Math.abs(x) > HALF || Math.abs(z) > HALF || y < -5 || y > 80) return;
        if (Math.hypot(x - p.x, y - p.y, z - p.z) > W.range + 12) return;
        if (!this.rateOk(p, 'tp', 0.6 / W.rate)) return;
        this.releaseVehicle(p);
        const from = [r2(p.x), r2(p.y), r2(p.z)];
        p.x = x; p.y = y; p.z = z;
        this.endProtection(p);
        this.broadcast({ t: 'tp', id, from, to: [r2(x), r2(y), r2(z)] }, id);
        // Işınlanma ezmesi: varılan noktada duran oyuncu ölür
        for (const tg of this.players.values()) {
          if (tg === p || !tg.alive) continue;
          if (Math.hypot(tg.x - x, tg.z - z) < 0.9 && Math.abs(tg.y - y) < 1.6) this.damage(tg, p, W.telefrag, 'teleport');
        }
        break;
      }
      case 'mount': {
        const v = this.vehicle(msg.v);
        if (!v || v.dead || !p.alive || p.veh || v.rider !== null) return;
        if (Math.hypot(v.x - p.x, v.z - p.z) > VEH[v.kind].reach + 2.5 || Math.abs(v.y - p.y) > 4) return;
        v.rider = id;
        p.veh = v.id;
        p.x = v.x; p.y = v.y + VEH[v.kind].seatOff; p.z = v.z;
        this.broadcast({ t: 'mount', v: v.id, by: id });
        break;
      }
      case 'dismount': {
        const v = this.vehicle(msg.v);
        if (!v || v.rider !== id) return;
        let [x, y, z] = Array.isArray(msg.p) ? msg.p.map(Number) : [v.x, v.y, v.z];
        if (![x, y, z].every(Number.isFinite) || Math.hypot(x - v.x, z - v.z) > 8 || Math.abs(y - v.y) > 6) [x, y, z] = [v.x, v.y, v.z];
        const yaw = Number.isFinite(+msg.yaw) ? +msg.yaw : v.yaw;
        this.parkVehicle(v, x, y, z, yaw, false);
        break;
      }
      case 'ram': {
        // Motosikletle çarpma / çinçillayla üstüne atlama
        const v = p.veh ? this.vehicle(p.veh) : null;
        const tg = this.players.get(msg.tg);
        if (!v || !p.alive || !tg || tg === p || !tg.alive || v.kind !== msg.k) return;
        const dx = tg.x - p.x, dz = tg.z - p.z, dist = Math.hypot(dx, dz);
        if (dist > (v.kind === 'chin' ? 7 : 5) || Math.abs(tg.y - p.y) > 5) return;
        if (!this.rateOk(p, 'ram' + tg.id, 0.8)) return;
        const sp = Math.min(40, Math.abs(+msg.s || 0));
        const inv = dist > 0.1 ? 1 / dist : 0;
        if (v.kind === 'moto' || v.kind === 'ham') {
          // Hızla çarpma (motosiklet / avurtlak)
          if (sp < 8) return;
          this.damage(tg, p, Math.max(15, Math.min(70, sp * (v.kind === 'ham' ? 2.4 : 2.8))), v.kind,
            { kb: [r2(dx * inv * sp * 0.7), 6, r2(dz * inv * sp * 0.7)] });
        } else {
          if (sp < 10) return;
          this.damage(tg, p, Math.max(30, Math.min(70, sp * 2.5)), 'chin', { kb: [r2(dx * inv * 13), 9, r2(dz * inv * 13)] });
        }
        this.endProtection(p);
        break;
      }
      case 'pick': {
        const c = this.crates.get(msg.c);
        if (!c || !p.alive) return;
        const cy = this.crateHeight(c);
        if (Math.hypot(c.x - p.x, c.z - p.z) > 4 || Math.abs(p.y + 0.9 - (cy + 0.5)) > 3) return;
        if (c.k === 'h') {
          if (p.hp >= 100) return;
          p.hp = Math.min(100, p.hp + 50);
          this.broadcast({ t: 'heal', tg: id, hp: p.hp });
        } else if (c.k === 'j') {
          p.jet = true;
          this.send(id, { t: 'give', item: 'jet' });
        } else {
          p.inv.add(c.w);
          this.send(id, { t: 'give', w: c.w, n: WEAPONS[c.w].ammo });
        }
        this.crates.delete(c.id);
        this.broadcast({ t: 'cgone', id: c.id, by: id, k: c.k, w: c.w });
        break;
      }
      case 'empty':
        if (STARTER.includes(msg.w)) return;
        p.inv.delete(msg.w);
        if (p.w === msg.w) p.w = 'pistol';
        break;
      case 'chat': {
        const m = String(msg.m || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
        if (!m || this.time - p.lastChat < 0.4) return;
        p.lastChat = this.time;
        this.broadcast({ t: 'chat', n: p.name, c: p.color, m });
        break;
      }
      case 'hpong':
        if (typeof msg.ts === 'number') p.ping = Math.round(performance.now() - msg.ts);
        break;
      case 'admin':
        if (id !== 0) return;
        if (msg.a === 'kick') this.kick(msg.tg, 'Admin seni oyundan attı.');
        if (msg.a === 'reset') {
          for (const q of this.players.values()) { q.kills = 0; q.deaths = 0; }
          this.broadcast({ t: 'reset' });
          this.sys('Admin skorları sıfırladı.');
        }
        if (msg.a === 'crates') { for (let i = 0; i < 3; i++) this.spawnCrate(); }
        if (msg.a === 'vreset') {
          for (const v of this.vehicles) { if (v.dead) this.reviveVehicle(v); else this.resetVehicle(v); }
        }
        if (msg.a === 'meteor') this.spawnMeteor();
        if (msg.a === 'creatures') this.spawnCreatures();
        break;
      default:
        this.receiveEntity(id, p, msg);
    }
  }

  // --------------------------------------------------------
  tick(dt) {
    this.time += dt;

    // Yeniden doğma
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAt && this.time >= p.respawnAt) this.spawnPlayer(p);
    }

    // Kutular
    this.crateTimer -= dt;
    const maxCrates = Math.min(10, 4 + Math.ceil(this.players.size / 2));
    if (this.crateTimer <= 0) {
      this.crateTimer = 6 + Math.random() * 3;
      if (this.crates.size < maxCrates) this.spawnCrate();
    }

    // Kara delikler
    this.holeTimer += dt;
    if (this.holeTimer >= 0.25) {
      const step = this.holeTimer;
      this.holeTimer = 0;
      for (let i = this.holes.length - 1; i >= 0; i--) {
        const h = this.holes[i];
        const white = h.k === 'w';
        const B = white ? WEAPONS.whitehole.wh : WEAPONS.blackhole.bh;
        const w = white ? 'whitehole' : 'blackhole';
        const owner = this.players.get(h.by) || null;
        const ended = this.time - h.born >= h.dur;
        for (const tg of this.players.values()) {
          if (!tg.alive) continue;
          const d = Math.hypot(tg.x - h.x, tg.y + 0.9 - h.y, tg.z - h.z);
          if (ended) {
            if (d < B.finalR) {
              const f = 1 - d / B.finalR;
              const inv = d > 0.1 ? 1 / d : 0;
              const kb = B.finalKb || 14;
              this.damage(tg, owner, B.finalDmg * (0.4 + 0.6 * f), w,
                { kb: [r2((tg.x - h.x) * inv * kb), white ? 12 : 9, r2((tg.z - h.z) * inv * kb)] });
            }
          } else if (d < B.coreR) {
            this.damage(tg, owner, B.dps * step, w);
          }
        }
        if (ended) {
          this.splashVehicles(h.x, h.y, h.z, B.finalR, B.finalDmg, owner, w);
          this.splashEntities(h.x, h.y, h.z, B.finalR, B.finalDmg, owner, w);
          this.holes.splice(i, 1);
        }
      }
      // Patlayan araçlar park yerinde yeniden çıkar
      for (const v of this.vehicles) if (v.dead && this.time >= v.respawnAt) this.reviveVehicle(v);
      // Terk edilen araçlar park yerine döner
      for (const v of this.vehicles) {
        if (v.rider !== null || v.dead) continue;
        const away = Math.hypot(v.x - v.home.x, v.z - v.home.z) > 3 || v.y < -10;
        if (away && (this.time - v.idle > VEHICLE_RESET || v.y < -10)) this.resetVehicle(v);
      }
    }

    // Gökten düşen cisimler
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = METEOR.every[0] + Math.random() * (METEOR.every[1] - METEOR.every[0]);
      this.spawnMeteor();
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      if (this.time - this.meteors[i].born >= METEOR.fall) {
        this.meteorImpact(this.meteors[i]);
        this.meteors.splice(i, 1);
      }
    }

    // Taretler, yaratıklar, mayınlar
    this.tickEntities(dt);

    // Anlık görüntü (20 Hz)
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 0.05;
      const list = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const e = [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.w, p.f, p.hp];
        const v = p.veh ? this.vehicle(p.veh) : null;
        if (v) e.push(v.id, r2(v.yaw));
        list.push(e);
      }
      const snap = { t: 'snap', p: list };
      this.entitiesSnap(snap);
      this.broadcast(snap);
    }

    // Skor + ping; 30 sn ses vermeyen oyuncu düşürülür (sekmesi kapanmış ama bağlantısı kopmamış)
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = 2;
      const ts = performance.now();
      for (const id of [...this.conns.keys()]) {
        const p = this.players.get(id);
        if (p && ts - p.lastSeen > 30000) {
          try { this.conns.get(id).close(); } catch (e) { /* yok say */ }
          this.removePlayer(id);
          continue;
        }
        this.send(id, { t: 'hping', ts });
      }
    }
    this.infoTimer -= dt;
    if (this.infoTimer <= 0) {
      this.infoTimer = 1;
      this.broadcast({ t: 'info', p: [...this.players.values()].map((p) => [p.id, p.kills, p.deaths, p.ping]) });
    }
  }
}

// Taretler, yaratıklar, mayınlar, yakalama silahı, kedi tablosu (host-entities.js)
Object.assign(HostLogic.prototype, HostEntities);
