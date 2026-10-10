// Admin (sunucu) oyun mantığı: can, skor, kutular, doğma, kara delikler.
// Hareket her oyuncunun kendi tarayıcısında hesaplanır; hasar ve eşyalar burada onaylanır.
import { CONFIG } from './config.js';
import { hashAccessCode } from './sha256.js';
import { WEAPONS, randomCrateWeapon } from './weapons.js';

export const PLAYER_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x1abc9c,
  0xe67e22, 0xff6b9d, 0xbdc3c7, 0x34e7e4, 0xa3cb38, 0xfd7272,
];
export const CRATE_FALL_H = 30;
export const CRATE_FALL_SPEED = 5;
const RESPAWN_TIME = 3;
const SPAWN_PROTECT = 2;

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
    };
  }

  publicInfo(p) {
    return {
      id: p.id, name: p.name, color: p.color, hp: p.hp, alive: p.alive,
      x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), w: p.w, kills: p.kills, deaths: p.deaths,
    };
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
      holes: this.holes.map((h) => ({ id: h.id, p: [h.x, h.y, h.z], by: h.by, dur: h.dur - (this.time - h.born) })),
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
    p.alive = true;
    p.hp = 100;
    p.inv = new Set(['pistol']);
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
      x = r2((Math.random() * 2 - 1) * 55);
      z = r2((Math.random() * 2 - 1) * 55);
      y = this.world.groundAt(x, z, 60);
      // Kutu tamamen düz bir yüzeye otursun (direk tepesi, rampa, kenar olmasın)
      let ok = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]
        .every(([dx, dz]) => Math.abs(this.world.groundAt(x + dx, z + dz, 60) - y) < 0.01);
      for (const c of this.crates.values()) if (Math.hypot(c.x - x, c.z - z) < 10) ok = false;
      if (ok) break;
    }
    y = r2(y);
    const k = Math.random() < 0.25 ? 'h' : 'w';
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
    if (extra.fz) m.fz = extra.fz;
    if (extra.hs) m.hs = 1;
    this.broadcast(m);
    if (tg.hp <= 0) {
      tg.alive = false;
      tg.deaths++;
      tg.respawnAt = this.time + RESPAWN_TIME;
      tg.proj.clear();
      if (a && a !== tg) a.kills++;
      this.broadcast({ t: 'kill', tg: tg.id, a: a ? a.id : -1, w, k: a ? a.kills : 0, d: tg.deaths });
    }
  }

  // Atış hızı denetimi (tick aralığından bağımsız gerçek zaman)
  endProtection(p) {
    if (p.prot <= this.time) return;
    p.prot = 0;
    this.broadcast({ t: 'prot', id: p.id });
  }

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
        p.x = x; p.y = y; p.z = z;
        if (Array.isArray(msg.r)) { p.yaw = +msg.r[0] || 0; p.pitch = +msg.r[1] || 0; }
        if (WEAPONS[msg.w] && p.inv.has(msg.w)) p.w = msg.w;
        p.f = msg.f | 0;
        break;
      }
      case 'fire': {
        const W = WEAPONS[msg.w];
        if (!p.alive || !W || !p.inv.has(msg.w)) return;
        this.endProtection(p);
        if (W.type === 'projectile' && msg.id != null) {
          p.proj.set(msg.id, { w: msg.w, t: this.time });
          if (p.proj.size > 20) p.proj.delete(p.proj.keys().next().value);
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
        if (W.type === 'beam') {
          if (!this.rateOk(p, msg.tg + msg.w, W.tick * 0.6)) return;
          this.damage(tg, p, W.dmg, msg.w, W.slow ? { fz: W.slow } : {});
        } else if (W.type === 'hitscan' || W.type === 'rail') {
          if (!this.rateOk(p, msg.tg + msg.w, 0.6 / W.rate)) return;
          const n = Math.max(1, Math.min(W.pellets || 1, msg.n | 0));
          this.damage(tg, p, W.dmg * n * (msg.hs ? W.hs : 1), msg.w, { hs: !!msg.hs });
        }
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
        break;
      }
      case 'bh': {
        const pr = p.proj.get(msg.id);
        if (!pr || pr.w !== 'blackhole' || !Array.isArray(msg.p)) return;
        p.proj.delete(msg.id);
        const [x, y, z] = msg.p.map(Number);
        if (![x, y, z].every(Number.isFinite)) return;
        const B = WEAPONS.blackhole.bh;
        const h = { id: this.nextHole++, x: r2(x), y: r2(y), z: r2(z), by: id, born: this.time, dur: B.dur };
        this.holes.push(h);
        this.broadcast({ t: 'bh', id: h.id, p: [h.x, h.y, h.z], by: id, dur: B.dur, pid: msg.id });
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
        } else {
          p.inv.add(c.w);
          this.send(id, { t: 'give', w: c.w, n: WEAPONS[c.w].ammo });
        }
        this.crates.delete(c.id);
        this.broadcast({ t: 'cgone', id: c.id, by: id, k: c.k, w: c.w });
        break;
      }
      case 'empty':
        if (msg.w !== 'pistol') p.inv.delete(msg.w);
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
        break;
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
      const B = WEAPONS.blackhole.bh;
      for (let i = this.holes.length - 1; i >= 0; i--) {
        const h = this.holes[i];
        const owner = this.players.get(h.by) || null;
        const ended = this.time - h.born >= h.dur;
        for (const tg of this.players.values()) {
          if (!tg.alive) continue;
          const d = Math.hypot(tg.x - h.x, tg.y + 0.9 - h.y, tg.z - h.z);
          if (ended) {
            if (d < B.finalR) {
              const f = 1 - d / B.finalR;
              const inv = d > 0.1 ? 1 / d : 0;
              this.damage(tg, owner, B.finalDmg * (0.4 + 0.6 * f), 'blackhole',
                { kb: [r2((tg.x - h.x) * inv * 14), 9, r2((tg.z - h.z) * inv * 14)] });
            }
          } else if (d < B.coreR) {
            this.damage(tg, owner, B.dps * step, 'blackhole');
          }
        }
        if (ended) this.holes.splice(i, 1);
      }
    }

    // Anlık görüntü (20 Hz)
    this.snapTimer -= dt;
    if (this.snapTimer <= 0) {
      this.snapTimer = 0.05;
      const list = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        list.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.w, p.f, p.hp]);
      }
      this.broadcast({ t: 'snap', p: list });
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
