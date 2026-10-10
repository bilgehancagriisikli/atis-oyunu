// Ekran arayüzü: can, cephane, öldürme akışı, mini harita, skor tablosu, sohbet.
import { WEAPONS, WEAPON_ORDER, hexColor } from './weapons.js';
import { MINIMAP_RANGE } from './map.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      hpFill: $('hp-fill'), hpText: $('hp-text'),
      wName: $('weapon-name'), wAmmo: $('weapon-ammo'), slots: $('weapon-slots'),
      feed: $('killfeed'), center: $('center-msg'), hit: $('hitmarker'),
      vignette: $('vignette'), frost: $('frost'),
      death: $('death'), deathText: $('death-text'), deathTimer: $('death-timer'),
      board: $('scoreboard'), boardBody: $('score-body'),
      mini: $('minimap'), big: $('bigmap'), bigCanvas: $('bigmap-canvas'),
      chatLog: $('chat-log'), chatBox: $('chat-input-wrap'), chatInput: $('chat-input'),
      info: $('net-info'), prot: $('prot'), dmgDir: $('dmg-dir'), crosshair: $('crosshair'),
    };
    this.miniCtx = this.el.mini.getContext('2d');
    this.bigCtx = this.el.bigCanvas.getContext('2d');
    this.centerTimer = 0;
    this.hitTimer = 0;
    this.vigTimer = 0;
    this.slotKey = '';
    this.buildSlots();
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  buildSlots() {
    this.el.slots.innerHTML = '';
    this.slotEls = {};
    WEAPON_ORDER.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.style.setProperty('--c', hexColor(WEAPONS[w].color));
      const k = document.createElement('b');
      k.textContent = String((i + 1) % 10);
      const n = document.createElement('span');
      n.textContent = WEAPONS[w].name;
      d.append(k, n);
      this.el.slots.appendChild(d);
      this.slotEls[w] = d;
    });
  }

  setHealth(hp) {
    const v = Math.max(0, Math.round(hp));
    if (v === this.lastHp) return;
    this.lastHp = v;
    this.el.hpFill.style.width = v + '%';
    this.el.hpFill.style.background = v > 50 ? '#3ee070' : v > 25 ? '#f0c030' : '#ff4040';
    this.el.hpText.textContent = v;
    this.el.vignette.classList.toggle('low', v <= 30 && v > 0);
  }

  setWeapon(cur, inv) {
    const W = WEAPONS[cur];
    if (!W) return;
    const ammoKey = cur + ':' + Math.ceil(inv[cur]);
    if (ammoKey === this.ammoKey && this.slotKey === cur + '|' + Object.keys(inv).join(',')) return;
    this.ammoKey = ammoKey;
    this.el.wName.textContent = W.name;
    this.el.wName.style.color = hexColor(W.color);
    const a = inv[cur];
    if (a === Infinity) this.el.wAmmo.textContent = '∞';
    else if (W.type === 'beam') this.el.wAmmo.textContent = Math.max(0, Math.ceil(a)) + '%';
    else this.el.wAmmo.textContent = Math.max(0, a);
    const key = cur + '|' + Object.keys(inv).join(',');
    if (key !== this.slotKey) {
      this.slotKey = key;
      for (const w of WEAPON_ORDER) {
        this.slotEls[w].classList.toggle('owned', w in inv);
        this.slotEls[w].classList.toggle('active', w === cur);
      }
    }
  }

  center(text, color = '#fff', time = 2) {
    this.el.center.textContent = text;
    this.el.center.style.color = color;
    this.el.center.classList.add('show');
    this.centerTimer = time;
  }

  hitmarker(kind) {
    const h = this.el.hit;
    h.className = 'show ' + kind;
    this.hitTimer = kind === 'kill' ? 0.4 : 0.15;
  }

  hurt(angle) {
    this.el.vignette.classList.add('hurt');
    this.vigTimer = 0.25;
    if (angle !== null && angle !== undefined) {
      this.el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
      this.el.dmgDir.classList.add('show');
      this.dmgTimer = 1;
    }
  }

  setFrozen(v) {
    if (v !== this.frozen) { this.frozen = v; this.el.frost.classList.toggle('show', v); }
  }
  setProtected(v) {
    if (v !== this.prot) { this.prot = v; this.el.prot.classList.toggle('hidden', !v); }
  }

  feed(a, v, wName, mine) {
    const row = document.createElement('div');
    row.className = 'feed-row' + (mine ? ' mine' : '');
    if (a && a !== v) {
      const s = document.createElement('span');
      s.textContent = a.name;
      s.style.color = hexColor(a.color);
      row.appendChild(s);
    }
    const w = document.createElement('em');
    w.textContent = ` [${wName}] `;
    row.appendChild(w);
    const t = document.createElement('span');
    t.textContent = v.name;
    t.style.color = hexColor(v.color);
    row.appendChild(t);
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 6000);
    setTimeout(() => row.remove(), 7000);
  }

  showDeath(text) {
    this.el.death.classList.remove('hidden');
    this.el.deathText.textContent = text;
  }
  setDeathTimer(s) { this.el.deathTimer.textContent = s > 0 ? `Yeniden doğuluyor: ${s.toFixed(1)} sn` : 'Doğuluyor...'; }
  hideDeath() { this.el.death.classList.add('hidden'); }

  scoreboard(show, players, myId) {
    this.el.board.classList.toggle('hidden', !show);
    if (!show) return;
    const rows = [...players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.el.boardBody.innerHTML = '';
    for (const p of rows) {
      const tr = document.createElement('tr');
      if (p.id === myId) tr.className = 'me';
      const name = document.createElement('td');
      name.textContent = (p.id === 0 ? '👑 ' : '') + p.name;
      name.style.color = hexColor(p.color);
      tr.appendChild(name);
      for (const v of [p.kills, p.deaths, p.id === 0 ? 'sunucu' : (p.ping || 0) + ' ms']) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      this.el.boardBody.appendChild(tr);
    }
  }

  setInfo(text) { this.el.info.textContent = text; }

  // --------------------------------------------------------
  // Mini harita (oyuncu merkezli, dönen)
  drawMinimap(mapCanvas, me, crates, blips, holes) {
    const ctx = this.miniCtx;
    const S = this.el.mini.width;
    const zm = 2.2; // piksel / metre
    const k0 = mapCanvas.width / (MINIMAP_RANGE * 2);
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#26301f';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(me.yaw);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(mapCanvas, -(me.x + MINIMAP_RANGE) * zm, -(me.z + MINIMAP_RANGE) * zm,
      mapCanvas.width * zm / k0, mapCanvas.height * zm / k0);
    ctx.globalAlpha = 1;
    this.drawMarkers(ctx, (x) => (x - me.x) * zm, (z) => (z - me.z) * zm, crates, blips, holes, 1);
    ctx.restore();
    // Oyuncu oku
    ctx.save();
    ctx.translate(S / 2, S / 2);
    arrow(ctx, '#fff', 7);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    // Kuzey işareti
    const na = me.yaw - Math.PI / 2;
    ctx.fillStyle = '#ff6060';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', S / 2 + Math.cos(na) * (S / 2 - 12), S / 2 + Math.sin(na) * (S / 2 - 12));
  }

  drawMarkers(ctx, tx, tz, crates, blips, holes, scale) {
    for (const c of crates) {
      ctx.fillStyle = c.k === 'h' ? '#30e060' : '#ffb627';
      ctx.fillRect(tx(c.x) - 4 * scale, tz(c.z) - 4 * scale, 8 * scale, 8 * scale);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx(c.x) - 4 * scale, tz(c.z) - 4 * scale, 8 * scale, 8 * scale);
    }
    for (const h of holes) {
      ctx.fillStyle = 'rgba(176,64,255,0.6)';
      ctx.beginPath(); ctx.arc(tx(h.x), tz(h.z), 7 * scale, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of blips) {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(tx(b.x), tz(b.z), 4 * scale, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Büyük harita (M)
  showBigMap(show) { this.el.big.classList.toggle('hidden', !show); }

  drawBigMap(mapCanvas, me, crates, blips, holes, mePlayers) {
    const c = this.el.bigCanvas;
    const ctx = this.bigCtx;
    const S = c.width;
    const k = S / (MINIMAP_RANGE * 2);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(mapCanvas, 0, 0, S, S);
    const tx = (x) => (x + MINIMAP_RANGE) * k, tz = (z) => (z + MINIMAP_RANGE) * k;
    this.drawMarkers(ctx, tx, tz, crates, blips, holes, 1.5);
    ctx.save();
    ctx.translate(tx(me.x), tz(me.z));
    ctx.rotate(-me.yaw);
    arrow(ctx, '#fff', 11);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('K', S / 2, 16);
  }

  // --------------------------------------------------------
  chat(name, color, text, sys = false) {
    const row = document.createElement('div');
    row.className = 'chat-row' + (sys ? ' sys' : '');
    if (name) {
      const n = document.createElement('b');
      n.textContent = name + ': ';
      n.style.color = hexColor(color);
      row.appendChild(n);
    }
    const t = document.createElement('span');
    t.textContent = text;
    row.appendChild(t);
    this.el.chatLog.appendChild(row);
    while (this.el.chatLog.children.length > 30) this.el.chatLog.firstChild.remove();
    this.el.chatLog.scrollTop = this.el.chatLog.scrollHeight;
    setTimeout(() => row.classList.add('old'), 9000);
  }

  openChat(v) {
    this.el.chatBox.classList.toggle('hidden', !v);
    this.el.chatLog.classList.toggle('open', v);
    if (v) { this.el.chatInput.value = ''; this.el.chatInput.focus(); } else this.el.chatInput.blur();
  }

  update(dt) {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.el.center.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hit.className = '';
    }
    if (this.vigTimer > 0) {
      this.vigTimer -= dt;
      if (this.vigTimer <= 0) this.el.vignette.classList.remove('hurt');
    }
    if (this.dmgTimer > 0) {
      this.dmgTimer -= dt;
      if (this.dmgTimer <= 0) this.el.dmgDir.classList.remove('show');
    }
  }
}

function arrow(ctx, color, s) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.7, s * 0.8);
  ctx.lineTo(0, s * 0.35);
  ctx.lineTo(-s * 0.7, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
