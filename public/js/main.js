// Giriş ekranı, ayarlar, oyunu başlatma / bağlanma.
import { CONFIG } from './config.js';
import { hashAccessCode } from './sha256.js';
import { HostNet, ClientNet } from './net.js';
import { HostLogic } from './host.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { hexColor } from './weapons.js';

const $ = (id) => document.getElementById(id);

let game = null, host = null, hostNet = null, client = null, input = null, hud = null;
let leaving = false;

// ------------------------------------------------------------
// Ayarlar
const isTouchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || isTouchOnly;

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { /* özel pencere vb. */ }
  return null;
}

const settings = { sens: 1, vol: 0.6, fov: 80, quality: isMobile ? 'low' : 'high', invert: false };
try { Object.assign(settings, JSON.parse(store('atis_settings') || '{}')); } catch (e) { /* bozuk kayıt */ }
const saveSettings = () => store('atis_settings', JSON.stringify(settings));

const sfx = new Sfx();
sfx.setVolume(settings.vol);

function buildSettings(container) {
  container.innerHTML = '';
  const row = (label, el, val) => {
    const l = document.createElement('label');
    l.className = 'set-row';
    const s = document.createElement('span');
    s.textContent = label;
    l.append(s, el);
    if (val) l.append(val);
    container.appendChild(l);
  };
  const range = (key, min, max, step, fmt, onChange) => {
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = settings[key];
    const v = document.createElement('em');
    v.textContent = fmt(settings[key]);
    i.addEventListener('input', () => {
      settings[key] = parseFloat(i.value);
      v.textContent = fmt(settings[key]);
      saveSettings();
      onChange && onChange();
    });
    return [i, v];
  };
  row('Fare hassasiyeti', ...range('sens', 0.1, 4, 0.05, (x) => x.toFixed(2)));
  row('Ses', ...range('vol', 0, 1, 0.05, (x) => Math.round(x * 100) + '%', () => sfx.setVolume(settings.vol)));
  row('Görüş açısı (FOV)', ...range('fov', 60, 110, 1, (x) => x + '°', () => {
    if (game) { game.camera.fov = settings.fov; game.camera.updateProjectionMatrix(); }
  }));
  const inv = document.createElement('input');
  inv.type = 'checkbox';
  inv.checked = settings.invert;
  inv.addEventListener('change', () => { settings.invert = inv.checked; saveSettings(); });
  row('Fareyi ters çevir (Y)', inv);
  const sel = document.createElement('select');
  for (const [v, t] of [['high', 'Yüksek'], ['medium', 'Orta'], ['low', 'Düşük (telefon)']]) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (settings.quality === v) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { settings.quality = sel.value; saveSettings(); });
  const note = document.createElement('em');
  note.textContent = game ? '(yeniden girişte)' : '';
  row('Grafik kalitesi', sel, note);
}

// ------------------------------------------------------------
// Giriş ekranı
const codeEl = $('code'), nameEl = $('name'), btn = $('login-btn'), errEl = $('login-error'), hint = $('role-hint');
nameEl.value = store('atis_name') || '';
buildSettings($('login-settings'));
if (isTouchOnly) $('mobile-note').classList.remove('hidden');

const prevErr = (() => { try { return sessionStorage.getItem('atis_err'); } catch (e) { return null; } })();
if (prevErr) {
  errEl.textContent = prevErr;
  try { sessionStorage.removeItem('atis_err'); } catch (e) { /* yok say */ }
}

let savedName = nameEl.value;
codeEl.addEventListener('input', () => {
  const h = hashAccessCode(codeEl.value);
  if (h === CONFIG.ADMIN_CODE_HASH) {
    if (!nameEl.disabled) savedName = nameEl.value;
    nameEl.value = CONFIG.ADMIN_NAME;
    nameEl.disabled = true;
    hint.textContent = '👑 Admin kodu: sunucuyu sen başlatacaksın.';
    hint.className = 'admin';
    btn.textContent = 'SUNUCUYU BAŞLAT';
  } else {
    if (nameEl.disabled) { nameEl.disabled = false; nameEl.value = savedName; }
    hint.textContent = h === CONFIG.PLAYER_CODE_HASH ? '✔ Oyuncu kodu doğru.' : '';
    hint.className = 'ok';
    btn.textContent = 'OYUNA KATIL';
  }
});

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  errEl.textContent = '';
  sfx.unlock();
  const code = codeEl.value;
  const h = hashAccessCode(code);
  if (h === CONFIG.ADMIN_CODE_HASH) return startHost();
  if (h !== CONFIG.PLAYER_CODE_HASH) {
    errEl.textContent = 'Geçersiz erişim kodu!';
    return;
  }
  const name = nameEl.value.replace(/\s+/g, ' ').trim();
  if (!name) { errEl.textContent = 'Kullanıcı adı gir.'; nameEl.focus(); return; }
  if (name.length > 16) { errEl.textContent = 'Kullanıcı adı en fazla 16 karakter olabilir.'; return; }
  if (name.toLocaleUpperCase('tr') === CONFIG.ADMIN_NAME.toLocaleUpperCase('tr')) {
    errEl.textContent = `"${CONFIG.ADMIN_NAME}" ismi admin'e ayrılmıştır.`;
    return;
  }
  store('atis_name', name);
  startClient(code, name);
});

function showScreen(id) {
  for (const s of ['login', 'connecting', 'game-root']) $(s).classList.toggle('hidden', s !== id);
}

function setConnecting(text) {
  $('connecting-text').textContent = text;
}

function backToLogin(msg) {
  try { if (msg) sessionStorage.setItem('atis_err', msg); } catch (e) { /* yok say */ }
  leaving = true;
  location.reload();
}

$('cancel-connect').addEventListener('click', () => backToLogin(''));

// ------------------------------------------------------------

async function startHost() {
  showScreen('connecting');
  setConnecting('Sunucu başlatılıyor...');
  hostNet = new HostNet();
  try {
    await hostNet.start(setConnecting);
  } catch (err) {
    showScreen('login');
    errEl.textContent = err.message;
    return;
  }
  createGame(true, (msg) => host.receive(0, msg));
  host = new HostLogic(game.map);
  hostNet.onConnection = (conn) => host.handleConnection(conn);
  host.start(CONFIG.ADMIN_NAME, (msg) => game.push(msg));
  game.init(host.welcomeData(0));
  enterGame();
}

async function startClient(code, name) {
  showScreen('connecting');
  setConnecting('Admin sunucusuna bağlanılıyor...');
  client = new ClientNet();
  let welcome;
  try {
    welcome = await client.connect(code, name);
  } catch (err) {
    showScreen('login');
    errEl.textContent = err.message;
    return;
  }
  createGame(false, (msg) => client.send(msg));
  // Ping doğrudan yanıtlanır: sekme arka plandayken de sunucu bizi düşürmesin
  client.setHandler((msg) => {
    if (msg.t === 'hping') client.send({ t: 'hpong', ts: msg.ts });
    else if (msg.t === 'kick') client.kickReason = msg.msg;
    else game.push(msg);
  });
  client.onClose = (reason) => {
    if (!leaving) backToLogin(client.kickReason || reason);
  };
  game.init(welcome);
  enterGame();
}

function createGame(isHost, send) {
  showScreen('game-root');
  hud = new Hud();
  input = new Input($('game-root'));
  game = new Game({ container: $('game-root'), settings, sfx, hud, input, send, isHost });
}

// ------------------------------------------------------------
// Oyun içi: duraklatma menüsü, admin paneli
function enterGame() {
  hud.show(true);
  buildSettings($('pause-settings'));
  $('admin-panel').classList.toggle('hidden', !game.isHost);
  showPause(true);
  input.onLockChange = (locked) => {
    if (locked) { game.started = true; sfx.unlock(); }
    showPause(!locked);
  };
  input.onLockError = () => { $('pause-hint').textContent = 'Fare kilitlenemedi, tekrar tıkla.'; };
  if (game.isHost) {
    window.addEventListener('beforeunload', (e) => {
      if (leaving) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }
}

function showPause(v) {
  $('pause').classList.toggle('hidden', !v);
  $('pause-hint').textContent = '';
  if (v) {
    if (game && game.chatOpen) game.setChat(false);
    $('pause-title').textContent = game && game.started ? 'DURAKLATILDI' : 'OYNAMAK İÇİN TIKLA';
    refreshAdmin();
  }
}

// Menünün boş alanına tıklamak da oyuna döndürür
$('pause').addEventListener('click', (e) => {
  if (e.target === $('pause')) { sfx.unlock(); input.lock(); }
});
$('resume-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.unlock();
  input.lock();
});
$('fullscreen-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const d = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (req) {
      const p = req.call(d);
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    }
  }
});
$('leave-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const msg = game && game.isHost ? 'Sunucuyu kapatırsan tüm oyuncular oyundan düşer. Emin misin?' : 'Oyundan çıkmak istiyor musun?';
  if (!confirm(msg)) return;
  backToLogin('');
});

// Admin paneli
$('reset-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  host && host.receive(0, { t: 'admin', a: 'reset' });
});
$('crates-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  host && host.receive(0, { t: 'admin', a: 'crates' });
});

function refreshAdmin() {
  if (!host) return;
  const list = $('admin-players');
  list.innerHTML = '';
  for (const p of host.players.values()) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const n = document.createElement('span');
    n.textContent = (p.id === 0 ? '👑 ' : '') + p.name;
    n.style.color = hexColor(p.color);
    const s = document.createElement('em');
    s.textContent = `${p.kills} / ${p.deaths}` + (p.id ? ` · ${p.ping} ms` : '');
    row.append(n, s);
    if (p.id !== 0) {
      const b = document.createElement('button');
      b.textContent = 'At';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`${p.name} oyundan atılsın mı?`)) {
          host.receive(0, { t: 'admin', a: 'kick', tg: p.id });
          setTimeout(refreshAdmin, 600);
        }
      });
      row.appendChild(b);
    }
    list.appendChild(row);
  }
}
setInterval(() => { if (!$('pause').classList.contains('hidden')) refreshAdmin(); }, 1500);
