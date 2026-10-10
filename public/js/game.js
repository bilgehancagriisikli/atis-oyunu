// Ana oyun: sahne, yerel oyuncu, silahlar, ağ mesajları, çizim döngüsü.
import * as THREE from 'three';
import { buildMap, HALF } from './map.js';
import { PLAYER, stepCharacter, rayVsPlayer, rayVsBox, pointNearPlayer } from './physics.js';
import { WEAPONS, WEAPON_ORDER, buildWeaponModel, hexColor, killName } from './weapons.js';
import { Effects } from './effects.js';
import { Avatar } from './avatar.js';
import { CRATE_FALL_H, CRATE_FALL_SPEED } from './host.js';
import { VEH, VehicleView, stepMoto, stepChin } from './vehicles.js';

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];
const now = () => performance.now() / 1000;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const MOTO_COLORS = [0xd23b2b, 0x2f6db5, 0x2fa84f, 0xf2c230];
const CRATE_COLORS = { h: 0x30e060, j: 0x3fa9ff, w: 0xffb627 };
// Jetpack ile havadayken daha iyi yön kontrolü
const JET_BODY = { ...PLAYER, airAccel: 30 };

// Yol izleyen mermiler (sarmal testere, zikzak) için konum
function pathPos(out, P, t, W) {
  out.copy(P.o).addScaledVector(P.d, W.speed * t);
  if (W.path === 'spiral') {
    const R = W.spiralR * Math.min(1, t / 0.15);
    const a = W.omega * t + P.ph;
    out.addScaledVector(P.u, Math.cos(a) * R).addScaledVector(P.w, Math.sin(a) * R);
  } else {
    // Üçgen dalga: keskin zikzak
    const tri = (2 / Math.PI) * Math.asin(Math.sin((2 * Math.PI * t) / W.period));
    out.addScaledVector(P.u, tri * W.amp * Math.min(1, t / 0.08));
  }
  return out;
}

export class Game {
  constructor(o) {
    this.settings = o.settings;
    this.sfx = o.sfx;
    this.hud = o.hud;
    this.input = o.input;
    this.sendFn = o.send;
    this.isHost = o.isHost;
    this.container = o.container;
    this.inbox = [];
    this.players = new Map();
    this.crates = new Map();
    this.projectiles = [];
    this.holes = [];
    this.beams = new Map();
    this.projSeq = 0;
    this.chatOpen = false;
    this.bigMap = false;
    this.running = false;
    this.shake = 0;
    this.recoil = 0;
    this.sendTimer = 0;
    this.boardTimer = 0;
    this.fps = 60;
    this.avgDt = 1 / 60;
    this.myPing = 0;
    this.vehicles = new Map();
    this.ride = null; // bindiğimiz aracın fiziği
    this.ramT = {};
    this.tpMounted = true; // araçtayken üçüncü şahıs kamera
    this.tpFoot = false;
    this.selfAv = null;
    this.nearVeh = null;

    const q = this.settings.quality;
    const r = new THREE.WebGLRenderer({ antialias: q === 'high', powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.25 : 1.75));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = q !== 'low';
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.autoClear = false;
    r.domElement.id = 'game-canvas';
    this.container.prepend(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb7d0e6, 80, 280);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.setupSky();
    this.setupLights(q);
    this.map = buildMap(this.scene, q);
    this.world = this.map.world;
    this.fx = new Effects(this.scene, q);
    this.crateTex = this.map.tex;
    this.marker = this.fx.makeMarker(0x3ff0ff);

    // Elde tutulan silah (ayrı sahnede çizilir, duvara girmez)
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xdfefff, 0x554433, 2.2));
    const vl = new THREE.DirectionalLight(0xffffff, 2.2);
    vl.position.set(1, 2, 1);
    this.vmScene.add(vl);
    this.vmHolder = new THREE.Group();
    this.vmHolder.scale.setScalar(0.62);
    this.vmScene.add(this.vmHolder);
    this.vmModels = {};
    this.vm = null;
    this.vmSway = new THREE.Vector2();

    this.me = {
      id: -1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, yaw: 0, pitch: 0,
      alive: false, hp: 100, inv: { pistol: Infinity }, cur: 'pistol', last: 'pistol',
      fireCd: 0, beamOn: false, beamTick: 0, spin: 0, slowUntil: 0, protUntil: 0,
      bob: 0, switchT: 0, deathAt: 0, respawnAt: 0,
      veh: null, jetpack: false, fuel: 0, jetting: false,
    };
    this.camY = 0;

    this.onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = this.vmCamera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.vmCamera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this.onResize);
    this.input.onKey = (code, e) => this.handleKey(code, e);
  }

  setupSky() {
    const geo = new THREE.SphereGeometry(500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x3d7fd1) },
        horizon: { value: new THREE.Color(0xb7d0e6) },
        bottom: { value: new THREE.Color(0x8a9a80) },
        sunDir: { value: new THREE.Vector3(0.5, 0.65, 0.35).normalize() },
      },
      vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          float s = max(dot(d, sunDir), 0.0);
          c += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 6.0 + pow(s, 10.0) * 0.25);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  setupLights(q) {
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b5a45, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
    sun.position.set(50, 65, 35);
    if (q !== 'low') {
      sun.castShadow = true;
      const s = q === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(s, s);
      const c = sun.shadow.camera;
      c.left = -75; c.right = 75; c.top = 75; c.bottom = -75; c.near = 10; c.far = 200;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.04;
    }
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  // --------------------------------------------------------
  init(welcome) {
    this.myId = welcome.id;
    this.me.id = welcome.id;
    for (const p of welcome.players) this.addPlayer(p);
    const t = now();
    for (const c of welcome.crates) this.addCrate(c, t);
    for (const h of welcome.holes || []) this.addHole(h);
    for (const v of welcome.vehicles || []) this.addVehicle(v);
    const mine = this.players.get(this.myId);
    this.selfAv = new Avatar(this.scene, { id: this.myId, name: mine ? mine.name : '', color: mine ? mine.color : 0xffffff });
    this.selfAv.tag.visible = false;
    this.selfAv.alive = true;
    this.warmup();
    this.selfAv.root.visible = false;
    this.setViewWeapon('pistol');
    this.running = true;
    this.last = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(ts);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // İlk patlamada / silah değişiminde takılma olmasın diye tüm shader'ları baştan derle
  warmup() {
    try {
      const hidden = [];
      this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      this.renderer.compile(this.scene, this.camera);
      hidden.forEach((o) => { o.visible = false; });
      for (const w of WEAPON_ORDER) {
        this.setViewWeapon(w);
        this.renderer.compile(this.vmScene, this.vmCamera);
      }
    } catch (e) {
      console.warn('shader ön derleme atlandı', e);
    }
  }

  push(msg) {
    this.inbox.push(msg);
    // Sekme arka plandayken kareler durur; eski anlık görüntüleri at, kuyruk şişmesin
    if (this.inbox.length > 1500) {
      const lastSnap = this.inbox.findLastIndex((m) => m.t === 'snap');
      this.inbox = this.inbox.filter((m, i) => m.t !== 'snap' || i === lastSnap);
    }
  }
  send(msg) { this.sendFn(msg); }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.onKey = null;
    if (this.myBeamSnd) this.myBeamSnd.stop();
    if (this.jetSnd) this.jetSnd.stop();
    for (const b of this.beams.values()) if (b.snd) b.snd.stop();
    for (const v of this.vehicles.values()) if (v.snd) v.snd.stop();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  controlsActive() { return this.input.active() && !this.chatOpen; }

  // --------------------------------------------------------
  handleKey(code, e) {
    if (this.chatOpen) {
      if (code === 'Enter') {
        const m = this.hud.el.chatInput.value.trim();
        if (m) this.send({ t: 'chat', m });
        this.setChat(false);
        return true;
      }
      if (code === 'Escape') { this.setChat(false); return true; }
      return false;
    }
    if (e.repeat) return false;
    if (code === 'Escape' && this.input.free) { this.input.unlock(); return true; }
    if (!this.input.active()) return false;
    if (code === 'KeyT' || code === 'Enter') { this.setChat(true); return true; }
    if (code === 'KeyM') { this.bigMap = !this.bigMap; this.hud.showBigMap(this.bigMap); return true; }
    if (code === 'KeyQ') { this.switchWeapon(this.me.last); return true; }
    if (code === 'KeyE') { this.toggleMount(); return true; }
    if (code === 'KeyV') {
      if (this.me.veh) this.tpMounted = !this.tpMounted; else this.tpFoot = !this.tpFoot;
      return true;
    }
    const m = /^Digit(\d)$/.exec(code);
    if (m) {
      this.selectSlot(parseInt(m[1], 10));
      return true;
    }
    return false;
  }

  // Aynı tuşa tekrar basınca gruptaki sonraki silah
  selectSlot(n) {
    const me = this.me;
    const list = WEAPON_ORDER.filter((w) => WEAPONS[w].slot === n && w in me.inv);
    if (!list.length) return;
    const i = list.indexOf(me.cur);
    this.switchWeapon(list[(i + 1) % list.length]);
  }

  setChat(v) {
    this.chatOpen = v;
    this.input.keys.clear();
    this.input.mouse = [false, false, false];
    this.hud.openChat(v);
  }

  // --------------------------------------------------------
  // Oyuncular
  addPlayer(info) {
    if (this.players.has(info.id)) return;
    const rec = { id: info.id, name: info.name, color: info.color, kills: info.kills || 0, deaths: info.deaths || 0, ping: 0, avatar: null };
    if (info.id !== this.myId) {
      rec.avatar = new Avatar(this.scene, info);
      if (info.alive) rec.avatar.spawn(info.x, info.y, info.z, info.yaw || 0, 0);
      if (info.w) rec.avatar.setWeapon(info.w);
    }
    this.players.set(info.id, rec);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.avatar) p.avatar.dispose();
    this.stopRemoteBeam(id);
    this.players.delete(id);
  }

  pname(id) {
    const p = this.players.get(id);
    return p ? p.name : '???';
  }

  // --------------------------------------------------------
  // Ağ mesajları
  handle(msg) {
    const me = this.me;
    const t = now();
    switch (msg.t) {
      case 'join': this.addPlayer(msg.pl); break;
      case 'leave': this.removePlayer(msg.id); break;
      case 'snap':
        for (const e of msg.p) {
          const [id, x, y, z, yaw, pitch, w, f, hp, vid, vyaw] = e;
          if (id === this.myId) continue;
          const p = this.players.get(id);
          if (!p || !p.avatar || !p.avatar.alive) continue;
          p.avatar.setTarget(x, y, z, yaw, pitch, f);
          const veh = vid != null ? this.vehicles.get(vid) : null;
          p.avatar.setMount(veh ? veh.kind : null, vyaw || 0);
          if (WEAPONS[w]) p.avatar.setWeapon(w);
          p.avatar.setHp(hp);
        }
        break;
      case 'spawn': {
        const [x, y, z] = msg.p;
        if (msg.id === this.myId) {
          Object.assign(me, {
            x, y, z, vx: 0, vy: 0, vz: 0, yaw: msg.yaw, pitch: 0, alive: true, hp: 100, onGround: true,
            inv: { pistol: Infinity }, cur: 'pistol', last: 'pistol', spin: 0, slowUntil: 0,
            protUntil: t + (msg.prot || 0), fireCd: 0.3, veh: null, jetpack: false, fuel: 0, jetting: false,
          });
          this.ride = null;
          this.stopJetSound();
          this.camY = y + PLAYER.eye;
          this.setViewWeapon('pistol');
          this.hud.hideDeath();
          this.sfx.play('spawn');
        } else {
          const p = this.players.get(msg.id);
          if (p && p.avatar) p.avatar.spawn(x, y, z, msg.yaw, t + (msg.prot || 0));
        }
        this.fx.spawnFx(_a.set(x, y, z), this.players.get(msg.id)?.color || 0xffffff);
        break;
      }
      case 'dmg': {
        const p = this.players.get(msg.tg);
        if (p && p.avatar) {
          p.avatar.setHp(msg.hp);
          if (msg.fz) p.avatar.frozenUntil = t + msg.fz;
          if (msg.n) this.fx.hitPlayer(p.avatar.center(_a), msg.fz ? 0x88e8ff : 0xff4444);
        }
        if (msg.tg === this.myId) {
          if (!msg.prot) me.hp = msg.hp;
          if (msg.kb) {
            // Araçtaysak savrulma aracı iter
            const b = me.veh && this.ride ? this.ride : me;
            b.vx += msg.kb[0]; b.vy += msg.kb[1]; b.vz += msg.kb[2];
            if (msg.kb[1] > 0) b.onGround = false;
          }
          if (msg.fz) me.slowUntil = t + msg.fz;
          if (msg.n) {
            let ang = null;
            const att = this.players.get(msg.a);
            if (att && att.avatar && msg.a !== this.myId) {
              const dx = att.avatar.pos.x - me.x, dz = att.avatar.pos.z - me.z;
              const fwd = -Math.sin(me.yaw) * dx - Math.cos(me.yaw) * dz;
              const right = Math.cos(me.yaw) * dx - Math.sin(me.yaw) * dz;
              ang = Math.atan2(right, fwd);
            }
            this.hud.hurt(ang);
            this.sfx.play(msg.fz ? 'freezehit' : 'hurt', null, 0.7);
            this.shake = Math.min(1, this.shake + 0.15);
          }
        } else if (msg.a === this.myId && msg.n) {
          this.hud.hitmarker(msg.hs ? 'head' : 'hit');
          this.sfx.play(msg.hs ? 'headshot' : 'hit');
        }
        break;
      }
      case 'kill': {
        const victim = this.players.get(msg.tg);
        const killer = this.players.get(msg.a);
        if (killer && msg.a !== msg.tg) killer.kills = msg.k;
        if (victim) victim.deaths = msg.d;
        const wn = killName(msg.w);
        if (victim) this.hud.feed(killer, victim, wn, msg.a === this.myId || msg.tg === this.myId);
        if (msg.tg === this.myId) {
          me.alive = false;
          me.deathAt = t;
          me.respawnAt = t + 3;
          me.veh = null;
          me.jetting = false;
          this.ride = null;
          this.stopJetSound();
          this.marker.hide();
          this.stopBeam();
          const txt = !killer || msg.a === msg.tg ? 'Kendini vurdun!' : `${killer.name} seni ${wn} ile öldürdü`;
          this.hud.showDeath(txt);
          this.sfx.play('death');
        } else {
          if (victim && victim.avatar) victim.avatar.die();
          this.stopRemoteBeam(msg.tg);
          if (msg.a === this.myId) {
            this.hud.hitmarker('kill');
            this.sfx.play('kill');
            this.hud.center(`${victim ? victim.name : ''} öldürüldü!`, '#ff5b5b', 1.5);
          }
        }
        break;
      }
      case 'fire': this.remoteFire(msg); break;
      case 'beam':
        if (msg.on) this.startRemoteBeam(msg.by, msg.w); else this.stopRemoteBeam(msg.by);
        break;
      case 'zap': this.remoteZap(msg); break;
      case 'boom': {
        this.removeProjectile(msg.id);
        const W = WEAPONS[msg.w];
        _a.fromArray(msg.p);
        this.explosionFx(_a, W ? W.radius : 5, W ? W.color : 0xff8a2a);
        break;
      }
      case 'bh':
        this.removeProjectile(msg.pid);
        this.addHole(msg);
        break;
      case 'tp': {
        // Başka bir oyuncu ışınlandı
        const p = this.players.get(msg.id);
        const from = new THREE.Vector3().fromArray(msg.from), to = new THREE.Vector3().fromArray(msg.to);
        if (p && p.avatar && p.avatar.alive) p.avatar.teleport(to.x, to.y, to.z, p.avatar.yaw);
        this.fx.teleport(from, to, WEAPONS.teleport.color);
        this.sfx.play('tp', from, 0.8);
        this.sfx.play('tp', to, 0.8);
        break;
      }
      case 'mount': {
        const v = this.vehicles.get(msg.v);
        if (!v) break;
        v.rider = msg.by;
        if (msg.by === this.myId) {
          // Öldüysek sunucu zaten aracı bırakacak
          if (!me.alive || me.veh) break;
          this.ride = {
            kind: v.kind, x: v.x, y: v.y, z: v.z, vx: 0, vy: 0, vz: 0, yaw: v.yaw, onGround: true,
            lean: 0, speed: 0, steer: 0, groundVy: 0, landed: 0,
          };
          me.veh = v.id;
          me.jetting = false;
          me.yaw = v.yaw; // kamera aracın arkasından başlasın
          this.stopJetSound();
          this.sfx.play('mount');
          if (v.kind === 'chin') this.sfx.play('squeak');
          this.hud.center(`${VEH[v.kind].name.toLocaleUpperCase('tr')}! [E] ile in`, '#ffd27a', 2);
        } else {
          const p = this.players.get(msg.by);
          if (p && p.avatar) p.avatar.setMount(v.kind, v.yaw);
        }
        break;
      }
      case 'dismount': {
        const v = this.vehicles.get(msg.v);
        if (!v) break;
        v.rider = null;
        [v.x, v.y, v.z] = msg.p;
        v.yaw = msg.yaw;
        // Sunucu bizi araçtan indirdiyse (ölüm, ışınlanma)
        if (msg.by === this.myId && me.veh === v.id) { this.ride = null; me.veh = null; }
        const p = this.players.get(msg.by);
        if (p && p.avatar) p.avatar.setMount(null, 0);
        break;
      }
      case 'vpos': {
        const v = this.vehicles.get(msg.v);
        if (v && v.rider == null) { [v.x, v.y, v.z] = msg.p; v.yaw = msg.yaw; }
        break;
      }
      case 'crate': this.addCrate(msg.c, t); break;
      case 'cgone': {
        const c = this.crates.get(msg.id);
        if (c) {
          this.fx.pickup(c.group.position.clone().setY(c.group.position.y + 0.6), CRATE_COLORS[c.k]);
          this.scene.remove(c.group);
          // Dokular paylaşımlı; yalnızca geometri ve malzemeleri bırak
          c.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          this.crates.delete(msg.id);
        }
        if (msg.by === this.myId && msg.k === 'h') this.hud.center('+50 CAN', '#3ee070', 1.5);
        break;
      }
      case 'give': {
        if (msg.item === 'jet') {
          me.jetpack = true;
          me.fuel = 100;
          this.hud.center('JETPACK ALINDI! Havada Boşluk tuşunu basılı tut', '#3fa9ff', 2.5);
          this.sfx.play('pickup');
          break;
        }
        const W = WEAPONS[msg.w];
        if (!W) break;
        const isNew = !(msg.w in me.inv);
        if (W.type === 'beam') me.inv[msg.w] = 100;
        else me.inv[msg.w] = Math.min((me.inv[msg.w] || 0) + msg.n, msg.n * 2);
        if (isNew) this.switchWeapon(msg.w);
        this.hud.center(`${W.name.toLocaleUpperCase('tr')} ALINDI!`, hexColor(W.color), 2);
        this.sfx.play('pickup');
        break;
      }
      case 'heal':
        if (msg.tg === this.myId) { me.hp = msg.hp; this.sfx.play('health'); } else {
          const p = this.players.get(msg.tg);
          if (p && p.avatar) p.avatar.setHp(msg.hp);
        }
        break;
      case 'chat':
        if (msg.sys) this.hud.chat(null, 0, msg.sys, true);
        else { this.hud.chat(msg.n, msg.c, msg.m); this.sfx.play('chat'); }
        break;
      case 'info':
        for (const [id, k, d, ping] of msg.p) {
          const p = this.players.get(id);
          if (p) { p.kills = k; p.deaths = d; p.ping = ping; }
          if (id === this.myId) this.myPing = ping;
        }
        break;
      case 'prot':
        if (msg.id === this.myId) me.protUntil = 0;
        else {
          const p = this.players.get(msg.id);
          if (p && p.avatar) p.avatar.protUntil = 0;
        }
        break;
      case 'reset':
        for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; }
        break;
    }
  }

  // --------------------------------------------------------
  frame(ts) {
    // Fizik zaten 1/60 alt adımlarla çalışır; düşük FPS'te oyun yavaşlamasın diye 0.1 sn'ye kadar izin ver
    const raw = Math.max(0.0001, (ts - this.last) / 1000);
    const dt = Math.min(0.1, raw);
    this.last = ts;
    this.avgDt += (Math.min(raw, 1) - this.avgDt) * 0.05;
    this.fps = 1 / this.avgDt;
    const t = now();
    const inbox = this.inbox;
    this.inbox = [];
    for (const m of inbox) this.handle(m);

    this.updateLocal(dt, t);
    this.updateRemotes(dt, t);
    this.updateVehicles(dt, t);
    this.updateCrates(dt, t);
    this.updateProjectiles(dt, t);
    this.updateHoles(t);
    this.updateRemoteBeams(t);
    this.map.update(t);

    // Durum gönder (20 Hz)
    this.sendTimer -= dt;
    if (this.sendTimer <= 0 && this.me.alive) {
      this.sendTimer = 0.05;
      const me = this.me;
      const m = { t: 'st', p: [r2(me.x), r2(me.y), r2(me.z)], r: [r3(me.yaw), r3(me.pitch)], w: me.cur, f: this.flags() };
      if (me.veh && this.ride) m.v = [me.veh, r3(this.ride.yaw)];
      this.send(m);
    }

    this.updateCamera(dt, t);
    // Atış, bu karenin kamera yönüyle yapılır (bir kare geriden nişan olmasın)
    if (this.me.alive) this.updateWeapon(dt, t, this.controlsActive() && this.input.mouse[0]);
    this.updateMarker(t);
    this.jetParticles();
    this.sfx.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.me.yaw);
    this.fx.update(dt, this.camera, this.renderer);
    this.updateViewmodel(dt, t);
    this.updateHud(dt, t);

    this.sky.position.copy(this.camera.position);
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.me.alive && !this.thirdPerson()) {
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  // --------------------------------------------------------
  updateLocal(dt, t) {
    const me = this.me;
    const inp = this.input;
    const m = inp.consumeMouse();
    const active = this.controlsActive();
    if (active) {
      const k = this.settings.sens * 0.0022;
      me.yaw -= m.dx * k;
      me.pitch -= m.dy * k * (this.settings.invert ? -1 : 1);
      me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
      if (m.wheel) this.cycleWeapon(m.wheel);
      this.vmSway.x += (-m.dx * 0.00025 - this.vmSway.x) * Math.min(1, dt * 10);
      this.vmSway.y += (m.dy * 0.00025 - this.vmSway.y) * Math.min(1, dt * 10);
    }
    if (!me.alive) return;

    let f = 0, s = 0, jump = false, sprint = false;
    if (active) {
      f = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
      s = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0);
      jump = inp.down('Space');
      sprint = inp.down('ShiftLeft', 'ShiftRight') && f > 0;
    }
    // Bakış yönüne göre dünya hareket yönü
    const wx = -Math.sin(me.yaw) * f + Math.cos(me.yaw) * s;
    const wz = -Math.cos(me.yaw) * f - Math.sin(me.yaw) * s;

    if (me.veh && this.ride) {
      this.updateRide(dt, t, f, s, jump, sprint, wx, wz);
    } else {
      const slow = t < me.slowUntil ? 0.45 : 1;
      const heavy = me.cur === 'minigun' && me.spin > 0.3 ? 0.7 : 1;
      const wish = { x: wx, z: wz, speed: (sprint ? PLAYER.sprint : PLAYER.speed) * slow * heavy, jump: jump && me.onGround };
      me.sprinting = sprint;

      // Jetpack: havada Boşluk basılıyken yukarı itiş, yerde yakıt dolar
      let body = PLAYER;
      const wasJetting = me.jetting;
      me.jetting = false;
      if (me.jetpack) {
        if (jump && !me.onGround && me.fuel > 0) {
          me.jetting = true;
          me.vy = Math.min(me.vy + 40 * dt, 8);
          me.fuel = Math.max(0, me.fuel - 22 * dt);
          body = JET_BODY;
          wish.speed = Math.max(wish.speed, 9.5);
        } else if (me.onGround) me.fuel = Math.min(100, me.fuel + 20 * dt);
      }
      if (me.jetting && !wasJetting) {
        this.sfx.play('jetstart', null, 0.6);
        this.jetSnd = this.jetSnd || this.sfx.loop('jet', null);
      } else if (!me.jetting && wasJetting) this.stopJetSound();

      this.applyHoles(me, 0.9, dt);

      const fallV = me.vy;
      const wasGround = me.onGround;
      let rem = dt;
      while (rem > 1e-6) {
        const st = Math.min(rem, 1 / 60);
        stepCharacter(this.world, me, wish, st, body);
        wish.jump = false;
        rem -= st;
      }
      if (!wasGround && me.onGround && fallV < -13) this.sfx.play('land', null, 0.5);
      if (me.y < -30) {
        const sp = this.map.spawns[0];
        me.x = sp.x; me.y = sp.y; me.z = sp.z; me.vx = me.vy = me.vz = 0;
      }
      this.nearVeh = this.nearestVehicle();
    }
  }

  // Bindiğimiz aracı sür
  updateRide(dt, t, f, s, jump, sprint, wx, wz) {
    const me = this.me;
    const R = this.ride;
    const D = VEH[R.kind];
    const wasGround = R.onGround;
    const fallV = R.vy;
    me.sprinting = false;
    this.applyHoles(R, R.kind === 'chin' ? 1.5 : 0.8, dt);
    let rem = dt, first = true;
    while (rem > 1e-6) {
      const st = Math.min(rem, 1 / 60);
      if (R.kind === 'moto') stepMoto(this.world, R, { throttle: f, steer: s, hop: jump && first, boost: sprint }, st);
      else stepChin(this.world, R, { wx, wz, sprint: this.input.down('ShiftLeft', 'ShiftRight'), jump: jump && first }, st);
      first = false;
      rem -= st;
    }
    me.x = R.x; me.y = R.y + D.seatOff; me.z = R.z;
    me.vx = R.vx; me.vy = R.vy; me.vz = R.vz;
    me.onGround = R.onGround;
    const veh = this.vehicles.get(me.veh);

    if (R.kind === 'moto') {
      if (R.crash > 0) {
        this.sfx.play('crash', null, Math.min(1, R.crash / 18));
        this.shake = Math.min(1, this.shake + R.crash * 0.03);
      }
      if (!wasGround && R.onGround && fallV < -8) this.sfx.play('land', null, 0.6);
      // Motosikletle çarpma
      const sp = Math.abs(R.speed);
      if (sp >= 9) {
        for (const p of this.players.values()) {
          const av = p.avatar;
          if (!av || !av.alive) continue;
          const dx = av.pos.x - R.x, dz = av.pos.z - R.z, dy = av.pos.y - R.y;
          if (dx * dx + dz * dz > 1.5 * 1.5 || dy < -1.2 || dy > 2.2 || t - (this.ramT[p.id] || 0) < 1) continue;
          this.ramT[p.id] = t;
          this.send({ t: 'ram', tg: p.id, k: 'moto', s: r2(sp) });
          this.fx.hitPlayer(av.center(_a));
          this.sfx.play('crash', av.pos, 0.6);
          R.vx *= 0.75; R.vz *= 0.75;
        }
      }
    } else {
      if (R.hopped) { R.hopped = false; this.sfx.play('squeak', null, 0.7); }
      if (R.landed < -8) {
        if (veh) veh.view.land(Math.min(1, -R.landed / 20));
        this.sfx.play('stomp', null, Math.min(1, -R.landed / 18));
        // Yüksekten inişte çevredekiler ezilir
        if (R.landed < -12) {
          this.fx.stomp(_a.set(R.x, R.y, R.z), 4);
          this.shake = Math.min(1, this.shake + 0.4);
          for (const p of this.players.values()) {
            const av = p.avatar;
            if (!av || !av.alive) continue;
            const dx = av.pos.x - R.x, dz = av.pos.z - R.z, dy = av.pos.y - R.y;
            if (dx * dx + dz * dz > 4 * 4 || dy < -2.5 || dy > 2.5) continue;
            this.send({ t: 'ram', tg: p.id, k: 'chin', s: r2(-R.landed) });
          }
        }
      }
      R.landed = 0;
    }
    if (R.y < -30) this.dismount();
  }

  // Kara delik içine çeker, beyaz delik dışarı iter. b: oyuncu ya da araç gövdesi
  applyHoles(b, centerOff, dt) {
    for (const h of this.holes) {
      const white = h.k === 'w';
      const P = white ? WEAPONS.whitehole.wh : WEAPONS.blackhole.bh;
      const dx = h.pos.x - b.x, dy = h.pos.y - (b.y + centerOff), dz = h.pos.z - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > P.radius || d < 0.05) continue;
      const k = 1 - d / P.radius;
      if (white) {
        const acc = P.push * (0.4 + 0.6 * k);
        b.vx -= dx / d * acc * dt;
        b.vy -= dy / d * acc * dt * 0.6;
        b.vz -= dz / d * acc * dt;
        b.vy += 10 * k * dt;
      } else {
        const acc = P.pull * (0.35 + 0.65 * k);
        b.vx += dx / d * acc * dt;
        b.vy += dy / d * acc * dt + PLAYER.gravity * 0.85 * k * dt;
        b.vz += dz / d * acc * dt;
        const damp = Math.max(0, 1 - 1.8 * k * dt);
        b.vx *= damp; b.vy *= damp; b.vz *= damp;
      }
      if (b.vy > 0) b.onGround = false;
    }
  }

  flags() {
    const me = this.me;
    return (me.onGround ? 1 : 0) | (Math.hypot(me.vx, me.vz) > 0.5 ? 2 : 0) | (me.jetpack ? 4 : 0) | (me.jetting ? 8 : 0);
  }

  stopJetSound() {
    if (this.jetSnd) { this.jetSnd.stop(); this.jetSnd = null; }
  }

  // --------------------------------------------------------
  // Araçlar
  addVehicle(v) {
    if (this.vehicles.has(v.id)) return;
    const view = new VehicleView(this.scene, v.k, MOTO_COLORS[(v.id - 1) % MOTO_COLORS.length]);
    const rec = {
      id: v.id, kind: v.k, x: v.p[0], y: v.p[1], z: v.p[2], yaw: v.yaw, rider: v.r ?? null, view, snd: null,
      cx: v.p[0], cy: v.p[1], cz: v.p[2], cyaw: v.yaw, px: v.p[0], pz: v.p[2], pyaw: v.yaw, speed: 0, lean: 0,
    };
    view.setPose(rec.x, rec.y, rec.z, rec.yaw);
    this.vehicles.set(v.id, rec);
    if (rec.rider != null) {
      const p = this.players.get(rec.rider);
      if (p && p.avatar) p.avatar.setMount(rec.kind, rec.yaw);
    }
  }

  nearestVehicle() {
    const me = this.me;
    let best = null, bd = Infinity;
    for (const v of this.vehicles.values()) {
      if (v.rider != null) continue;
      const d = Math.hypot(v.cx - me.x, v.cz - me.z);
      if (d <= VEH[v.kind].reach && Math.abs(me.y - v.cy) < 3 && d < bd) { bd = d; best = v; }
    }
    return best;
  }

  toggleMount() {
    const me = this.me;
    if (!me.alive) return;
    if (me.veh) { this.dismount(); return; }
    const v = this.nearestVehicle();
    if (!v || now() - (this.mountReqAt || 0) < 0.5) return;
    this.mountReqAt = now();
    this.send({ t: 'mount', v: v.id });
  }

  // Araçtan in: yanına (sağ, sol, arka, ön) boş bir yere bırak
  dismount() {
    const me = this.me;
    const R = this.ride;
    const v = this.vehicles.get(me.veh);
    if (!R || !v) { this.ride = null; me.veh = null; return; }
    const D = VEH[R.kind];
    const rx = Math.cos(R.yaw), rz = -Math.sin(R.yaw);
    const fx = -Math.sin(R.yaw), fz = -Math.cos(R.yaw);
    const off = D.body.radius + PLAYER.radius + 0.25;
    let pos = null;
    for (const [dx, dz] of [[rx * off, rz * off], [-rx * off, -rz * off], [-fx * (off + 0.6), -fz * (off + 0.6)], [fx * (off + 0.6), fz * (off + 0.6)]]) {
      const x = R.x + dx, z = R.z + dz;
      const g = this.world.supportHeight(x, z, PLAYER.radius, R.y + 1.2);
      const y = g === -Infinity ? R.y : g;
      if (Math.abs(y - R.y) < 2.5 && !this.world.overlapsPlayer(x, y, z)) { pos = [x, y, z]; break; }
    }
    if (!pos) pos = [R.x, R.y + D.seatOff + 0.3, R.z];
    this.send({ t: 'dismount', v: v.id, p: [r2(R.x), r2(R.y), r2(R.z)], yaw: r3(R.yaw) });
    v.rider = null;
    v.x = R.x; v.y = R.y; v.z = R.z; v.yaw = R.yaw;
    me.x = pos[0]; me.y = pos[1]; me.z = pos[2];
    me.vx = R.vx * 0.4; me.vz = R.vz * 0.4; me.vy = 0;
    me.onGround = false;
    this.camY = me.y + PLAYER.eye;
    this.ride = null;
    me.veh = null;
  }

  // Araç modellerini konumla, canlandır, motor sesini güncelle
  updateVehicles(dt, t) {
    for (const v of this.vehicles.values()) {
      const D = VEH[v.kind];
      let x = v.x, y = v.y, z = v.z, yaw = v.yaw, onGround = true, steer = 0, lean = 0;
      if (v.rider === this.myId && this.ride) {
        const R = this.ride;
        x = R.x; y = R.y; z = R.z; yaw = R.yaw; onGround = R.onGround; steer = R.steer || 0; lean = R.lean || 0;
      } else if (v.rider != null) {
        const p = this.players.get(v.rider);
        const av = p && p.avatar;
        if (av && av.alive) {
          x = av.pos.x; y = av.pos.y - D.seatOff; z = av.pos.z; yaw = av.vyaw;
          onGround = (av.flags & 1) !== 0;
          const yr = wrap(yaw - v.pyaw) / Math.max(dt, 1e-4);
          v.lean += (Math.max(-0.45, Math.min(0.45, -yr * Math.abs(v.speed) * 0.02)) - v.lean) * Math.min(1, dt * 6);
          lean = v.lean;
          steer = Math.max(-1, Math.min(1, yr * 0.5));
        }
      }
      // İşaretli hız (geri giderken tekerlek ters döner)
      const fwd = (x - v.px) * -Math.sin(yaw) + (z - v.pz) * -Math.cos(yaw);
      const inst = v.kind === 'moto' ? fwd / Math.max(dt, 1e-4) : Math.hypot(x - v.px, z - v.pz) / Math.max(dt, 1e-4);
      v.speed += (Math.max(-40, Math.min(40, inst)) - v.speed) * Math.min(1, dt * 10);
      v.px = x; v.pz = z; v.pyaw = yaw;
      v.cx = x; v.cy = y; v.cz = z; v.cyaw = yaw;
      v.view.setPose(x, y, z, yaw);
      v.view.animate(dt, t, { speed: v.speed, onGround, steer, lean, ridden: v.rider != null });
      if (v.kind === 'moto') {
        if (v.rider != null && !v.snd) v.snd = this.sfx.loop('moto', _a.set(x, y, z));
        else if (v.rider == null && v.snd) { v.snd.stop(); v.snd = null; }
        if (v.snd) {
          v.snd.update(v.rider === this.myId ? null : _a.set(x, y, z), v.rider === this.myId ? 0.35 : 0.5);
          v.snd.setRate(1 + Math.abs(v.speed) / 11);
        }
        if (v.rider != null && Math.abs(v.speed) > 2) {
          this.fx.exhaust(_a.set(x + Math.sin(yaw) * 0.9, y + 0.35, z + Math.cos(yaw) * 0.9), Math.abs(v.speed));
        }
      }
    }
  }

  thirdPerson() {
    const me = this.me;
    return me.alive && (me.veh ? this.tpMounted : this.tpFoot);
  }

  updateCamera(dt, t) {
    const me = this.me;
    const cam = this.camera;
    const tp = this.thirdPerson();
    if (me.alive) {
      const target = me.y + PLAYER.eye;
      const diff = target - this.camY;
      if (diff > 0 && diff < 0.7 && !me.veh) this.camY += diff * Math.min(1, dt * 16);
      else this.camY = target;
      cam.rotation.set(me.pitch, me.yaw, 0);
      if (tp) {
        // Omuz üstü / araç arkası kamera; duvara girmesin
        const D = me.veh && this.ride ? VEH[this.ride.kind] : null;
        const dist = D ? D.tpDist : 3.4, up = D ? D.tpUp : 0.45, side = D ? 0 : 0.6;
        const fwd = this.aim(_a);
        const pivot = _b.set(me.x, this.camY, me.z);
        const want = _c.copy(pivot).addScaledVector(fwd, -dist);
        want.y += up;
        want.x += Math.cos(me.yaw) * side;
        want.z -= Math.sin(me.yaw) * side;
        const dir = _d.subVectors(want, pivot);
        let len = dir.length();
        dir.multiplyScalar(1 / len);
        const hit = this.world.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, len);
        if (hit) len = Math.max(0.3, hit.t - 0.3);
        cam.position.copy(pivot).addScaledVector(dir, len);
      } else {
        cam.position.set(me.x, this.camY, me.z);
      }
      let fovTarget = this.settings.fov + (me.sprinting ? 6 : 0);
      if (me.veh && this.ride && this.ride.kind === 'moto') fovTarget += Math.min(14, Math.abs(this.ride.speed) * 0.45);
      if (Math.abs(cam.fov - fovTarget) > 0.05) {
        cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 8);
        cam.updateProjectionMatrix();
      }
    } else {
      // Ölüm kamerası
      const k = Math.min(1, (t - me.deathAt) / 0.6);
      cam.position.set(me.x, me.y + PLAYER.eye - k * 1.2, me.z);
      cam.rotation.set(me.pitch * (1 - k) - k * 0.5, me.yaw, k * 0.45);
      this.hud.setDeathTimer(Math.max(0, me.respawnAt - t));
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.updateMatrixWorld();
    // Üçüncü şahısta kendi karakterimiz görünür
    const sa = this.selfAv;
    if (sa) {
      sa.root.visible = tp;
      if (tp) {
        sa.protUntil = me.protUntil;
        sa.setWeapon(me.cur || 'pistol');
        sa.syncLocal(me.x, me.y, me.z, me.yaw, me.pitch, this.flags(), me.veh && this.ride ? this.ride.kind : null,
          this.ride ? this.ride.yaw : 0, dt, t);
      }
    }
  }

  // Işınlanma hedefini önizle
  updateMarker(t) {
    const me = this.me;
    if (!me.alive || me.cur !== 'teleport') { this.marker.hide(); return; }
    const { o, d } = this.aimRay();
    const dest = this.teleportTarget(o, d, WEAPONS.teleport.range);
    if (dest) this.marker.show(dest, t); else this.marker.hide();
  }

  // Jetpack alevi parçacıkları
  jetParticles() {
    const list = [];
    for (const p of this.players.values()) {
      if (p.avatar && p.avatar.alive && (p.avatar.flags & 8)) list.push(p.avatar);
    }
    if (this.me.jetting && this.thirdPerson()) list.push(this.selfAv);
    for (const av of list) {
      av.jetNozzles(_a, _b);
      this.fx.jet(_a);
      this.fx.jet(_b);
    }
  }

  // --------------------------------------------------------
  // Silahlar
  setViewWeapon(w) {
    if (this.vm) this.vmHolder.remove(this.vm.group);
    this.vm = this.vmModels[w] ||= buildWeaponModel(w);
    this.vmHolder.add(this.vm.group);
  }

  switchWeapon(w) {
    const me = this.me;
    if (!w || !(w in me.inv) || w === me.cur || !me.alive) return;
    this.stopBeam();
    me.last = me.cur;
    me.cur = w;
    me.switchT = 0.25;
    me.spin = 0;
    me.fireCd = Math.max(me.fireCd, 0.2);
    this.setViewWeapon(w);
    this.sfx.play('switch', null, 0.6);
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((w) => w in this.me.inv);
    const i = owned.indexOf(this.me.cur);
    this.switchWeapon(owned[(i + (dir > 0 ? 1 : -1) + owned.length) % owned.length]);
  }

  dropWeapon(w) {
    const me = this.me;
    if (w === 'pistol') return;
    delete me.inv[w];
    this.send({ t: 'empty', w });
    if (me.cur === w) {
      const owned = WEAPON_ORDER.filter((x) => x in me.inv);
      const next = owned[owned.length - 1] || 'pistol';
      me.cur = '';
      this.switchWeapon(next);
    }
    this.sfx.play('empty');
  }

  eye(out) { return out.set(this.me.x, this.camY, this.me.z); }
  aim(out) { return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  // Atış ışını. Üçüncü şahısta nişangahın gösterdiği noktaya karakterin gözünden atılır.
  aimRay() {
    const fwd = this.aim(new THREE.Vector3());
    const o = this.eye(new THREE.Vector3());
    if (!this.thirdPerson()) return { o, d: fwd };
    const r = this.trace(this.camera.position, fwd, 300);
    const to = r.end.sub(o);
    const len = to.length();
    if (len < 1 || to.dot(fwd) < 0.5) return { o, d: fwd };
    return { o, d: to.multiplyScalar(1 / len) };
  }

  // Görünen silah ucunun dünya konumu
  muzzleWorld(out) {
    if (this.thirdPerson() && this.selfAv) return this.selfAv.muzzleWorld(out);
    this.vmHolder.updateMatrixWorld(true);
    this.vm.muzzle.getWorldPosition(out);
    const k = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(this.vmCamera.fov) / 2);
    out.x *= k; out.y *= k;
    return out.applyMatrix4(this.camera.matrixWorld);
  }

  spread(base, amount, out) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = Math.sqrt(Math.random()) * amount;
    return out.set(base.x + s * Math.cos(a) * r, base.y + u * r, base.z + s * Math.sin(a) * r).normalize();
  }

  // Işın: duvar + oyuncular
  trace(o, d, range, pierce = false) {
    const wall = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    const maxT = wall ? wall.t : range;
    const hits = [];
    for (const p of this.players.values()) {
      const av = p.avatar;
      if (!av || !av.alive) continue;
      let h = rayVsPlayer(o.x, o.y, o.z, d.x, d.y, d.z, maxT, av.pos.x, av.pos.y, av.pos.z);
      if (av.mountKind) {
        // Bindiği araca isabet de binicinin hasarıdır (daha az)
        const V = VEH[av.mountKind], H = V.hit, by = av.pos.y - V.seatOff;
        const tb = rayVsBox(o.x, o.y, o.z, d.x, d.y, d.z, h ? h.t : maxT,
          av.pos.x - H.hw, by + H.y0, av.pos.z - H.hw, av.pos.x + H.hw, by + H.y1, av.pos.z + H.hw);
        if (tb !== null && (!h || tb < h.t)) h = { t: tb, head: false, mt: true };
      }
      if (h) hits.push({ id: p.id, t: h.t, head: h.head, mt: !!h.mt });
    }
    hits.sort((a, b) => a.t - b.t);
    const used = pierce ? hits : hits.slice(0, 1);
    const endT = !pierce && used.length ? used[0].t : maxT;
    return {
      end: o.clone().addScaledVector(d, endT),
      hits: used,
      wall: wall && (pierce || !used.length) ? wall : null,
    };
  }

  updateWeapon(dt, t, trigger) {
    const me = this.me;
    const W = WEAPONS[me.cur];
    me.fireCd -= dt;
    if (me.switchT > 0) me.switchT -= dt;
    if (W.type === 'beam') {
      this.updateBeam(dt, t, W, trigger && me.switchT <= 0);
      return;
    }
    if (W.spin) {
      me.spin = trigger ? Math.min(1, me.spin + dt / W.spin) : Math.max(0, me.spin - dt * 1.5);
      if (trigger && me.spin >= 1 && me.fireCd <= 0) this.fire(W, t);
    } else if (trigger && me.fireCd <= 0 && me.switchT <= 0) this.fire(W, t);
  }

  fire(W, t) {
    const me = this.me;
    const w = me.cur;
    const { o, d: base } = this.aimRay();
    // Işınlanacak yer yoksa mermi harcanmaz
    if (W.type === 'teleport' && !this.fireTeleport(W, o, base)) { me.fireCd = 0.4; return; }
    me.fireCd = 1 / W.rate;
    const muzzle = this.muzzleWorld(_c.clone());
    this.recoil = Math.min(0.3, this.recoil + (W.recoil || 0.05));
    me.pitch = Math.min(1.55, me.pitch + (W.recoil || 0.05) * 0.12);
    this.sfx.play(W.sound);
    this.fx.muzzle(muzzle, W.color, W.type === 'projectile' || W.type === 'rail');

    if (W.type === 'hitscan') {
      const ends = [];
      const per = new Map();
      const sp = W.spread * (me.onGround ? 1 : 1.6);
      for (let i = 0; i < (W.pellets || 1); i++) {
        const d = this.spread(base, sp, _d);
        const r = this.trace(o, d, W.range);
        ends.push(v3(r.end));
        this.fx.tracer(muzzle, r.end, W.color, W.pellets ? 0.012 : 0.02);
        if (r.hits.length) {
          const h = r.hits[0];
          const a = per.get(h.id) || { n: 0, head: 0, mt: 0 };
          a.n++; if (h.head) a.head++; if (h.mt) a.mt++;
          per.set(h.id, a);
        } else if (r.wall) {
          this.fx.impact(r.end, _a.set(r.wall.nx, r.wall.ny, r.wall.nz), W.color);
        }
      }
      for (const [id, a] of per) {
        const m = { t: 'hit', tg: id, w, n: a.n, hs: a.head * 2 > a.n ? 1 : 0 };
        if (a.mt === a.n) m.mt = 1;
        this.send(m);
      }
      this.send({ t: 'fire', w, o: v3(muzzle), e: ends });
    } else if (W.type === 'rail') {
      const r = this.trace(o, base, W.range, true);
      this.fx.rail(muzzle, r.end, W.color);
      for (const h of r.hits) this.send(h.mt ? { t: 'hit', tg: h.id, w, mt: 1 } : { t: 'hit', tg: h.id, w, hs: h.head ? 1 : 0 });
      if (r.wall) this.fx.impact(r.end, _a.set(r.wall.nx, r.wall.ny, r.wall.nz), W.color);
      this.shake = Math.min(1, this.shake + 0.2);
      this.send({ t: 'fire', w, o: v3(muzzle), e: [v3(r.end)] });
    } else if (W.type === 'projectile' && W.path) {
      this.firePath(W, w, o, base);
    } else if (W.type === 'projectile') {
      const id = this.myId * 100000 + (++this.projSeq % 100000);
      // Başlangıç: göz hizasının biraz önü (duvarın içinden çıkmasın)
      let dist = 0.9;
      const hit = this.world.raycast(o.x, o.y, o.z, base.x, base.y, base.z, 1.2);
      if (hit) dist = Math.max(0.05, hit.t - 0.25);
      const start = o.clone().addScaledVector(base, dist);
      start.y -= 0.12;
      const vel = base.clone().multiplyScalar(W.speed);
      this.addProjectile({ id, w, local: true, pos: start, vel });
      this.send({ t: 'fire', w, o: v3(start), v: v3(vel), id });
    } else if (W.type === 'chain') {
      this.fireTesla(W, o, base, muzzle);
    }

    if (me.inv[w] !== Infinity) {
      me.inv[w] -= 1;
      if (me.inv[w] <= 0) this.dropWeapon(w);
    }
  }

  // Sarmal testere / zikzak: yolu belli mermiler (uzak oyuncular aynı yolu çizer)
  firePath(W, w, o, base) {
    let dist = 0.9;
    const hit = this.world.raycast(o.x, o.y, o.z, base.x, base.y, base.z, 1.2);
    if (hit) dist = Math.max(0.05, hit.t - 0.25);
    const start = o.clone().addScaledVector(base, dist);
    start.y -= 0.12;
    const d = new THREE.Vector3(r3(base.x), r3(base.y), r3(base.z)).normalize();
    const n = W.blades || 1;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = this.myId * 100000 + (++this.projSeq % 100000);
      ids.push(id);
      this.addProjectile({ id, w, local: true, pos: start.clone(), path: { o: start.clone(), d: d.clone(), ph: (i / n) * Math.PI * 2 } });
    }
    this.send({ t: 'fire', w, o: v3(start), d: [d.x, d.y, d.z].map(r3), ids });
  }

  // Nişangahın gösterdiği yerde oyuncunun sığacağı bir nokta bul
  teleportTarget(o, d, range) {
    const R = PLAYER.radius, lim = HALF - 1;
    const hit = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    let t = hit ? hit.t : range;
    // Arenanın dışına taşma
    for (const [oc, dc] of [[o.x, d.x], [o.z, d.z]]) {
      if (Math.abs(dc) > 1e-6) {
        const tl = ((dc > 0 ? lim : -lim) - oc) / dc;
        if (tl >= 0 && tl < t) t = tl;
      }
    }
    const onSurface = hit && t === hit.t;
    const c = o.clone().addScaledVector(d, t);
    if (onSurface && hit.ny > 0.6) {
      c.x -= d.x * 0.2; c.z -= d.z * 0.2; // yere: ayaklar yüzeyde
    } else if (onSurface && hit.ny < -0.6) {
      c.y -= PLAYER.height + 0.1; // tavana: altına
    } else if (onSurface) {
      c.x += hit.nx * (R + 0.15); c.z += hit.nz * (R + 0.15); c.y -= 0.9; // duvara: önüne
    } else {
      c.y -= 0.9; // havaya: gövde ortası nişan noktasında
    }
    // Yakında zemin varsa üstüne bas
    const g = this.world.supportHeight(c.x, c.z, R, c.y + 0.6);
    if (g !== -Infinity && g > c.y - 2.5) c.y = g;
    const hl = Math.hypot(d.x, d.z) || 1;
    const hx = d.x / hl, hz = d.z / hl;
    for (let back = 0; back <= 3; back += 0.5) {
      for (const up of [0, 0.5, 1.0]) {
        const x = c.x - hx * back, z = c.z - hz * back, y = c.y + up;
        if (Math.abs(x) > lim || Math.abs(z) > lim || y < -1) continue;
        if (!this.world.overlapsPlayer(x, y, z)) return new THREE.Vector3(x, y, z);
      }
    }
    return null;
  }

  fireTeleport(W, o, d) {
    const me = this.me;
    const dest = this.teleportTarget(o, d, W.range);
    if (!dest) {
      this.hud.center('Oraya ışınlanılamaz!', '#ff8080', 1);
      this.sfx.play('empty');
      return false;
    }
    if (me.veh) this.dismount();
    const from = new THREE.Vector3(me.x, me.y, me.z);
    me.x = dest.x; me.y = dest.y; me.z = dest.z;
    me.vx = me.vy = me.vz = 0;
    me.onGround = false;
    this.camY = me.y + PLAYER.eye;
    this.fx.teleport(from, dest, W.color);
    this.send({ t: 'tp', to: v3(dest) });
    return true;
  }

  fireTesla(W, o, base, muzzle) {
    const visible = (from, p) => {
      const c = p.avatar.center(_d.clone());
      const dir = c.clone().sub(from);
      const len = dir.length();
      dir.multiplyScalar(1 / len);
      const h = this.world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, len);
      return h ? null : { c, len, dir };
    };
    let first = null, bestScore = Infinity;
    for (const p of this.players.values()) {
      if (!p.avatar || !p.avatar.alive) continue;
      const v = visible(o, p);
      if (!v || v.len > W.range) continue;
      const ang = Math.acos(Math.min(1, v.dir.dot(base)));
      if (ang > W.cone) continue;
      const score = ang + v.len * 0.004;
      if (score < bestScore) { bestScore = score; first = { p, c: v.c }; }
    }
    const pts = [muzzle];
    const ids = [];
    if (first) {
      ids.push(first.p.id);
      pts.push(first.c);
      let cur = first;
      for (let k = 0; k < 2; k++) {
        let next = null, bd = W.chain;
        for (const p of this.players.values()) {
          if (!p.avatar || !p.avatar.alive || ids.includes(p.id)) continue;
          const v = visible(cur.c, p);
          if (v && v.len < bd) { bd = v.len; next = { p, c: v.c }; }
        }
        if (!next) break;
        ids.push(next.p.id);
        pts.push(next.c);
        cur = next;
      }
      for (const c of pts.slice(1)) this.fx.hitPlayer(c, W.color);
      this.send({ t: 'zap', tg: ids, e: null });
    } else {
      const r = this.trace(o, base, W.range);
      pts.push(r.end);
      this.send({ t: 'zap', tg: [], e: v3(r.end) });
    }
    this.fx.lightning(pts, W.color);
  }

  updateBeam(dt, t, W, trigger) {
    const me = this.me;
    if (trigger && me.inv[me.cur] > 0) {
      if (!me.beamOn) {
        me.beamOn = true;
        me.beamTick = 0;
        me.beamW = me.cur;
        this.send({ t: 'beam', on: 1, w: me.cur });
        this.myBeam ||= this.fx.makeBeam();
        this.myBeamSnd = this.sfx.loop(W.sound, null);
      }
      me.inv[me.cur] -= W.drain * dt;
      const ray = this.aimRay();
      const r = this.trace(ray.o, ray.d, W.range);
      this.myBeam.set(this.muzzleWorld(_c), r.end, W.color, t);
      me.beamTick -= dt;
      if (me.beamTick <= 0) {
        me.beamTick = W.tick;
        if (r.hits.length) {
          const m = { t: 'hit', tg: r.hits[0].id, w: me.cur };
          if (r.hits[0].mt) m.mt = 1;
          this.send(m);
          this.fx.hitPlayer(r.end, W.color);
        }
      }
      if (me.inv[me.cur] <= 0) {
        this.stopBeam();
        this.dropWeapon(me.cur);
      }
    } else if (me.beamOn) this.stopBeam();
  }

  stopBeam() {
    const me = this.me;
    if (!me.beamOn) return;
    me.beamOn = false;
    this.send({ t: 'beam', on: 0, w: me.beamW });
    if (this.myBeam) this.myBeam.hide();
    if (this.myBeamSnd) { this.myBeamSnd.stop(); this.myBeamSnd = null; }
  }

  // --------------------------------------------------------
  // Diğer oyuncuların atışları (görsel)
  remoteFire(msg) {
    const p = this.players.get(msg.by);
    const W = WEAPONS[msg.w];
    if (!p || !p.avatar || !W) return;
    const av = p.avatar;
    av.lastFire = now();
    const muzzle = av.alive ? av.muzzleWorld(_a.clone()) : (msg.o ? new THREE.Vector3().fromArray(msg.o) : av.eye(_a.clone()));
    this.sfx.play(W.sound, av.pos);
    this.fx.muzzle(muzzle, W.color, W.type !== 'hitscan');
    if (W.type === 'hitscan' && Array.isArray(msg.e)) {
      for (const e of msg.e.slice(0, 12)) {
        const end = _b.fromArray(e);
        this.fx.tracer(muzzle, end, W.color, W.pellets ? 0.012 : 0.02);
        this.fx.impact(end, _c.set(0, 1, 0), W.color);
      }
    } else if (W.type === 'rail' && Array.isArray(msg.e)) {
      this.fx.rail(muzzle, _b.fromArray(msg.e[0]), W.color);
    } else if (W.type === 'projectile' && W.path && Array.isArray(msg.d) && Array.isArray(msg.ids)) {
      const start = new THREE.Vector3().fromArray(msg.o);
      const d = new THREE.Vector3().fromArray(msg.d).normalize();
      const n = msg.ids.length;
      msg.ids.forEach((id, i) => {
        this.addProjectile({ id, w: msg.w, local: false, pos: start.clone(), path: { o: start.clone(), d: d.clone(), ph: (i / n) * Math.PI * 2 } });
      });
    } else if (W.type === 'projectile' && msg.v) {
      const start = new THREE.Vector3().fromArray(msg.o);
      this.addProjectile({ id: msg.id, w: msg.w, local: false, pos: start, vel: new THREE.Vector3().fromArray(msg.v) });
    }
  }

  remoteZap(msg) {
    const p = this.players.get(msg.by);
    if (!p || !p.avatar) return;
    const W = WEAPONS.tesla;
    p.avatar.lastFire = now();
    const pts = [p.avatar.muzzleWorld(new THREE.Vector3())];
    for (const id of msg.tg || []) {
      if (id === this.myId) pts.push(new THREE.Vector3(this.me.x, this.me.y + 1, this.me.z));
      else {
        const q = this.players.get(id);
        if (q && q.avatar) pts.push(q.avatar.center(new THREE.Vector3()));
      }
    }
    if (pts.length === 1 && msg.e) pts.push(new THREE.Vector3().fromArray(msg.e));
    if (pts.length > 1) this.fx.lightning(pts, W.color);
    this.sfx.play('tesla', p.avatar.pos);
  }

  startRemoteBeam(id, w) {
    this.stopRemoteBeam(id);
    const p = this.players.get(id);
    if (!p || !p.avatar || !WEAPONS[w]) return;
    this.beams.set(id, { fx: this.fx.makeBeam(), w, snd: this.sfx.loop(WEAPONS[w].sound, p.avatar.pos) });
  }

  stopRemoteBeam(id) {
    const b = this.beams.get(id);
    if (!b) return;
    b.fx.dispose();
    if (b.snd) b.snd.stop();
    this.beams.delete(id);
  }

  updateRemoteBeams(t) {
    for (const [id, b] of this.beams) {
      const p = this.players.get(id);
      if (!p || !p.avatar || !p.avatar.alive) { this.stopRemoteBeam(id); continue; }
      const av = p.avatar;
      av.lastFire = t;
      const W = WEAPONS[b.w];
      const o = av.eye(_a);
      const d = av.aimDir(_b);
      const wall = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, W.range);
      let endT = wall ? wall.t : W.range;
      if (this.me.alive) {
        const h = rayVsPlayer(o.x, o.y, o.z, d.x, d.y, d.z, endT, this.me.x, this.me.y, this.me.z);
        if (h) endT = h.t;
      }
      const end = _c.copy(o).addScaledVector(d, endT);
      b.fx.set(av.muzzleWorld(_d), end, W.color, t);
      if (b.snd) b.snd.update(av.pos);
    }
  }

  // --------------------------------------------------------
  // Mermiler (roket, bomba, kara delik küresi)
  addProjectile(p) {
    const W = WEAPONS[p.w];
    p.kind = W.proj;
    p.t = 0;
    p.fx = this.fx.makeProjectile(p.kind);
    p.fx.obj.position.copy(p.pos);
    p.stopped = false;
    if (p.path) {
      // Yolun dik eksenleri: u yatay (sağ), w onun dikeyi
      const P = p.path;
      P.u = new THREE.Vector3().crossVectors(P.d, UP);
      if (P.u.lengthSq() < 0.01) P.u.set(1, 0, 0);
      P.u.normalize();
      P.w = new THREE.Vector3().crossVectors(P.u, P.d).normalize();
      p.vel = P.d.clone().multiplyScalar(W.speed);
      p.hits = new Set();
    }
    this.projectiles.push(p);
  }

  // Nokta bir oyuncuya (ya da bindiği araca) değiyor mu
  pointHitsAvatar(av, x, y, z, extra) {
    const ap = av.pos;
    if (pointNearPlayer(x, y, z, ap.x, ap.y, ap.z, extra)) return true;
    if (!av.mountKind) return false;
    const V = VEH[av.mountKind], H = V.hit, by = ap.y - V.seatOff;
    const hw = H.hw + extra;
    return Math.abs(x - ap.x) < hw && Math.abs(z - ap.z) < hw && y > by + H.y0 - extra && y < by + H.y1 + extra;
  }

  // Sarmal testere / zikzak. true dönerse mermi silinir.
  updatePathProjectile(p, dt, t, W) {
    if (p.t > (W.life || 4)) {
      if (p.local && p.kind === 'zig') this.detonate(p, p.pos);
      return true;
    }
    if (p.stopped) return false;
    const next = pathPos(_b, p.path, p.t, W);
    const seg = _a.subVectors(next, p.pos);
    const len = seg.length();
    if (len < 1e-6) return false;
    seg.multiplyScalar(1 / len);
    const hit = this.world.raycast(p.pos.x, p.pos.y, p.pos.z, seg.x, seg.y, seg.z, len);
    const pathLen = hit ? hit.t : len;
    let zigAt = null;
    if (p.local) {
      const n = Math.max(1, Math.ceil(pathLen / 0.3));
      for (const q of this.players.values()) {
        const av = q.avatar;
        if (!av || !av.alive || p.hits.has(q.id)) continue;
        for (let k = 1; k <= n; k++) {
          const f = (k / n) * pathLen;
          const x = p.pos.x + seg.x * f, y = p.pos.y + seg.y * f, z = p.pos.z + seg.z * f;
          // Zikzak topunun yakınlık tapası var
          if (!this.pointHitsAvatar(av, x, y, z, p.kind === 'zig' ? W.fuse : 0.2)) continue;
          if (p.kind === 'saw') {
            // Testere içinden geçer: her oyuncuya bir kez
            p.hits.add(q.id);
            this.send({ t: 'phit', id: p.id, tg: q.id });
            this.fx.hitPlayer(_c.set(x, y, z), 0xffd27a);
            this.sfx.play('sawhit', av.pos, 0.8);
          } else if (!zigAt) zigAt = new THREE.Vector3(x, y, z);
          break;
        }
        if (zigAt) break;
      }
    }
    p.vel.copy(seg).multiplyScalar(len / Math.max(dt, 1e-4));
    if (zigAt) {
      this.detonate(p, zigAt);
      return true;
    }
    if (hit) {
      const hp = p.pos.clone().addScaledVector(seg, hit.t);
      if (p.kind === 'saw') {
        this.fx.impact(hp, _c.set(hit.nx, hit.ny, hit.nz), 0xffd27a);
        return true;
      }
      if (p.local) {
        this.detonate(p, hp.addScaledVector(_c.set(hit.nx, hit.ny, hit.nz), 0.3));
        return true;
      }
      // Uzak zikzak: patlama mesajını bekle
      p.stopped = true;
      p.fx.obj.visible = false;
      return false;
    }
    p.pos.copy(next);
    p.fx.obj.position.copy(p.pos);
    p.fx.obj.lookAt(_d.copy(p.pos).sub(p.vel));
    p.fx.trail(dt, t);
    return false;
  }

  removeProjectile(id) {
    const i = this.projectiles.findIndex((p) => p.id === id);
    if (i < 0) return;
    this.projectiles[i].fx.dispose();
    this.projectiles.splice(i, 1);
  }

  updateProjectiles(dt, t) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const W = WEAPONS[p.w];
      p.t += dt;
      if (p.path) {
        if (this.updatePathProjectile(p, dt, t, W)) {
          p.fx.dispose();
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      if (p.t > (p.local ? 8 : 10)) {
        if (p.local) this.detonate(p, p.pos);
        p.fx.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.stopped) continue;
      p.vel.y -= (W.grav || 0) * dt;
      const step = p.vel.length() * dt;
      const dir = _a.copy(p.vel).normalize();
      const hit = this.world.raycast(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, step + 0.1);
      let hitPlayer = false;
      const next = _b.copy(p.pos).addScaledVector(p.vel, dt);
      if (p.local) {
        // Yol boyunca 0.3 m aralıklarla kontrol (düşük FPS'te oyuncunun içinden geçmesin)
        const pathLen = hit ? Math.min(step, hit.t) : step;
        const n = Math.max(1, Math.ceil(pathLen / 0.3));
        for (const q of this.players.values()) {
          if (hitPlayer) break;
          if (!q.avatar || !q.avatar.alive) continue;
          for (let k = 1; k <= n; k++) {
            const f = (k / n) * pathLen;
            if (this.pointHitsAvatar(q.avatar, p.pos.x + dir.x * f, p.pos.y + dir.y * f, p.pos.z + dir.z * f, 0.15)) {
              hitPlayer = true;
              next.copy(p.pos).addScaledVector(dir, f);
              break;
            }
          }
        }
      }
      let explodeAt = null;
      if (p.kind === 'grenade') {
        if (hit) {
          const n = _c.set(hit.nx, hit.ny, hit.nz);
          p.pos.addScaledVector(dir, Math.max(0, hit.t - 0.05)).addScaledVector(n, 0.05);
          const vn = p.vel.dot(n);
          p.vel.addScaledVector(n, -2 * vn).multiplyScalar(0.55);
          if (p.vel.length() > 3) this.sfx.play('grenade', p.pos, 0.25);
        } else p.pos.copy(next);
        if (hitPlayer || (p.local && p.t >= W.fuse)) explodeAt = p.pos;
        if (!p.local && p.t >= W.fuse + 0.5) p.stopped = true;
      } else if (hit || hitPlayer) {
        if (hit && !hitPlayer) {
          p.pos.addScaledVector(dir, hit.t).addScaledVector(_c.set(hit.nx, hit.ny, hit.nz), 0.35);
        } else p.pos.copy(next);
        explodeAt = p.pos;
      } else p.pos.copy(next);

      p.fx.obj.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.01) p.fx.obj.lookAt(_d.copy(p.pos).sub(p.vel));
      p.fx.trail(dt, t);

      if (explodeAt) {
        if (p.local) {
          this.detonate(p, explodeAt);
          p.fx.dispose();
          this.projectiles.splice(i, 1);
        } else {
          // Uzak mermi: patlama mesajını bekle, görünmez yap
          p.stopped = true;
          p.fx.obj.visible = false;
        }
      }
    }
  }

  detonate(p, pos) {
    if (p.kind === 'orb' || p.kind === 'worb') {
      this.send({ t: 'bh', p: v3(pos), id: p.id });
    } else {
      const W = WEAPONS[p.w];
      this.explosionFx(pos, W.radius, W.color);
      this.send({ t: 'boom', p: v3(pos), id: p.id });
    }
  }

  explosionFx(pos, radius, color) {
    this.fx.explosion(pos, radius, color);
    this.sfx.play('explosion', pos);
    const d = Math.hypot(pos.x - this.me.x, pos.y - this.me.y, pos.z - this.me.z);
    this.shake = Math.min(1, this.shake + Math.max(0, 1 - d / 28) * 0.7);
  }

  // --------------------------------------------------------
  addHole(h) {
    const pos = new THREE.Vector3().fromArray(h.p);
    const white = h.k === 'w';
    const P = white ? WEAPONS.whitehole.wh : WEAPONS.blackhole.bh;
    const dur = Math.max(0.2, h.dur);
    this.holes.push({ id: h.id, k: white ? 'w' : 'b', pos, end: now() + dur });
    this.fx.blackhole(pos, dur, P.radius, white);
    this.sfx.play(white ? 'whloop' : 'bhloop', pos);
  }

  updateHoles(t) {
    for (let i = this.holes.length - 1; i >= 0; i--) {
      if (t >= this.holes[i].end) {
        this.sfx.play(this.holes[i].k === 'w' ? 'nova' : 'implode', this.holes[i].pos);
        const d = this.holes[i].pos.distanceTo(_a.set(this.me.x, this.me.y, this.me.z));
        this.shake = Math.min(1, this.shake + Math.max(0, 1 - d / 25) * 0.6);
        this.holes.splice(i, 1);
      }
    }
  }

  // --------------------------------------------------------
  // Paraşütlü kutular
  addCrate(c, t) {
    if (this.crates.has(c.id)) return;
    const g = new THREE.Group();
    const tex = c.k === 'h' ? this.crateTex.crateH : c.k === 'j' ? this.crateTex.crateJ : this.crateTex.crateW;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: tex }));
    box.position.y = 0.5;
    box.castShadow = true;
    g.add(box);
    const col = CRATE_COLORS[c.k] || CRATE_COLORS.w;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 14, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    pillar.position.y = 7;
    g.add(pillar);
    // Paraşüt
    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: c.k === 'h' ? 0xeeeeee : c.k === 'j' ? 0x3f7fff : 0xff7a2a, side: THREE.DoubleSide }),
    );
    canopy.scale.y = 0.6;
    canopy.position.y = 3.6;
    chute.add(canopy);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.65, 3.6, Math.sin(a) * 1.65), new THREE.Vector3(0, 1, 0));
    }
    chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
    g.add(chute);
    this.scene.add(g);
    this.crates.set(c.id, { ...c, group: g, box, chute, born: t - c.age, landed: false, pickSent: 0 });
  }

  updateCrates(dt, t) {
    const me = this.me;
    for (const c of this.crates.values()) {
      const h = Math.max(c.y, c.y + CRATE_FALL_H - CRATE_FALL_SPEED * (t - c.born));
      c.group.position.set(c.x, h, c.z);
      const landed = h <= c.y + 0.001;
      if (landed && !c.landed) {
        c.landed = true;
        c.chute.visible = false;
        if (t - c.born < CRATE_FALL_H / CRATE_FALL_SPEED + 1) {
          this.fx.dust(c.group.position);
          this.sfx.play('land', c.group.position, 0.6);
        }
      }
      if (!landed) c.chute.rotation.y += dt * 0.6;
      c.box.rotation.y += dt * (landed ? 0.8 : 0.2);
      c.box.position.y = 0.5 + (landed ? Math.sin(t * 2 + c.id) * 0.06 + 0.06 : 0);
      if (!me.alive) continue;
      // Araçtayken aracın tabanına göre (çinçillanın üstünden de alınır)
      const reachR = me.veh && this.ride ? (this.ride.kind === 'chin' ? 2.2 : 1.6) : 1.4;
      const footY = me.veh && this.ride ? this.ride.y : me.y;
      const dx = c.x - me.x, dz = c.z - me.z;
      if (dx * dx + dz * dz < reachR * reachR && Math.abs(footY + 0.9 - (h + 0.5)) < 1.6 && t - c.pickSent > 0.6) {
        if (c.k === 'h' && me.hp >= 100) {
          if (t - (c.fullMsg || 0) > 3) { c.fullMsg = t; this.hud.center('Canın zaten dolu', '#aaa', 1); }
          continue;
        }
        c.pickSent = t;
        this.send({ t: 'pick', c: c.id });
      }
    }
  }

  // --------------------------------------------------------
  updateRemotes(dt, t) {
    for (const p of this.players.values()) if (p.avatar) p.avatar.update(dt, t);
  }

  updateViewmodel(dt, t) {
    const me = this.me;
    if (!this.vm) return;
    const speed = me.veh ? 0 : Math.hypot(me.vx, me.vz);
    if (me.onGround) me.bob += dt * speed * 1.5;
    const k = Math.min(1, speed / PLAYER.speed) * (me.onGround ? 1 : 0.3);
    const bx = Math.sin(me.bob) * 0.014 * k;
    const by = -Math.abs(Math.cos(me.bob)) * 0.012 * k;
    this.recoil = Math.max(0, this.recoil - dt * (this.recoil * 10 + 0.05));
    const sw = me.switchT > 0 ? me.switchT / 0.25 : 0;
    const h = this.vmHolder;
    h.position.set(0.2 + bx + this.vmSway.x, -0.19 + by - sw * 0.25 + this.vmSway.y - this.recoil * 0.1, -0.4 + this.recoil * 0.35);
    h.rotation.set(this.recoil * 1.4 + sw * -0.6, this.vmSway.x * 2, 0);
    if (this.vm.spin) this.vm.spin.rotation.z += dt * (me.cur === 'minigun' ? 2 + me.spin * 40 : 3);
    for (const g of this.vm.glows) g.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
  }

  updateHud(dt, t) {
    const me = this.me;
    const hud = this.hud;
    hud.update(dt);
    hud.setHealth(me.alive ? me.hp : 0);
    hud.setWeapon(me.cur, me.inv);
    hud.setFrozen(t < me.slowUntil && me.alive);
    hud.setProtected(me.alive && t < me.protUntil);
    const crates = [...this.crates.values()];
    const blips = [];
    for (const p of this.players.values()) {
      if (p.avatar && p.avatar.alive && t - p.avatar.lastFire < 2) {
        blips.push({ x: p.avatar.pos.x, z: p.avatar.pos.z, color: hexColor(p.color) });
      }
    }
    const holes = this.holes.map((h) => ({ x: h.pos.x, z: h.pos.z, k: h.k }));
    const vehicles = [];
    for (const v of this.vehicles.values()) if (v.rider == null) vehicles.push({ x: v.cx, z: v.cz, k: v.kind });
    const view = { x: me.x, z: me.z, yaw: me.yaw };
    hud.drawMinimap(this.map.minimap, view, crates, blips, holes, vehicles);
    if (this.bigMap) hud.drawBigMap(this.map.minimap, view, crates, blips, holes, vehicles);
    hud.setJet(me.alive && me.jetpack && !me.veh ? me.fuel : -1, me.jetting);
    let prompt = '';
    if (me.alive && me.veh && this.ride) {
      prompt = '[E] İn · [V] Kamera';
      if (this.ride.kind === 'moto') prompt += ` · ${Math.round(Math.abs(this.ride.speed) * 3.6)} km/sa`;
      else prompt += ' · Boşluk: Zıpla';
    } else if (me.alive && this.nearVeh) prompt = `[E] ${VEH[this.nearVeh.kind].bin}`;
    hud.setPrompt(prompt);
    this.boardTimer -= dt;
    const showBoard = this.input.down('Tab') && this.controlsActive();
    if (showBoard !== this.boardShown || (showBoard && this.boardTimer <= 0)) {
      this.boardShown = showBoard;
      this.boardTimer = 0.5;
      hud.scoreboard(showBoard, this.players, this.myId);
    }
    if (!this.infoTimer || t > this.infoTimer) {
      this.infoTimer = t + 0.5;
      const ping = this.isHost ? 'Sunucu (admin)' : `Ping: ${this.myPing} ms`;
      hud.setInfo(`${ping} · Oyuncu: ${this.players.size} · FPS: ${Math.round(this.fps)}`);
    }
  }
}
