// P2P ağ katmanı (PeerJS / WebRTC). Admin sunucu olur, oyuncular ona bağlanır.
import { CONFIG } from './config.js';

function peerOptions() {
  const o = { debug: 1 };
  if (CONFIG.PEER_SERVER) Object.assign(o, CONFIG.PEER_SERVER);
  if (CONFIG.ICE_SERVERS) o.config = { iceServers: CONFIG.ICE_SERVERS };
  return o;
}

function peerErrorText(err) {
  switch (err && err.type) {
    case 'peer-unavailable':
      return 'Admin oyunu henüz başlatmadı! Sunucu kapalı olduğu için giriş yapılamıyor.';
    case 'unavailable-id':
      return 'Sunucu zaten açık (başka bir admin oturumu çalışıyor).';
    case 'browser-incompatible':
      return 'Tarayıcın WebRTC desteklemiyor. Güncel Chrome, Edge veya Firefox kullan.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Sinyal sunucusuna bağlanılamadı. İnternet bağlantını kontrol et.';
    default:
      return 'Bağlantı hatası: ' + ((err && (err.type || err.message)) || 'bilinmiyor');
  }
}

// ------------------------------------------------------------
// Admin tarafı: gelen bağlantıları kabul eder
// ------------------------------------------------------------
export class HostNet {
  constructor() {
    this.peer = null;
    this.onConnection = null; // (conn) => void
    this.closed = false;
  }

  start(onStatus) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryOpen = () => {
        attempts++;
        const peer = new Peer(CONFIG.ROOM_ID, peerOptions());
        this.peer = peer;
        let opened = false;
        peer.on('open', () => {
          opened = true;
          resolve();
        });
        peer.on('connection', (conn) => this.onConnection && this.onConnection(conn));
        peer.on('disconnected', () => {
          // Sinyal sunucusu bağlantısı koptu; mevcut oyuncular etkilenmez, yenileri için yeniden bağlan
          if (!this.closed && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
        });
        peer.on('error', (err) => {
          if (opened) {
            console.warn('Peer hatası', err);
            return;
          }
          peer.destroy();
          // Sayfa yenilendiyse eski kimlik birkaç saniye meşgul kalabilir
          if (err.type === 'unavailable-id' && attempts < 4) {
            onStatus && onStatus('Önceki oturum kapanıyor, tekrar deneniyor... (' + attempts + '/3)');
            setTimeout(tryOpen, 3500);
            return;
          }
          reject(new Error(peerErrorText(err)));
        });
      };
      tryOpen();
    });
  }

  close() {
    this.closed = true;
    if (this.peer) this.peer.destroy();
  }
}

// ------------------------------------------------------------
// Oyuncu tarafı
// ------------------------------------------------------------
export class ClientNet {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMessage = null;
    this.onClose = null;
    this.welcomed = false;
    this.buffer = [];
  }

  // Karşılama sonrası gelen mesajlar işleyici atanana kadar bekletilir
  setHandler(fn) {
    this.onMessage = fn;
    const b = this.buffer;
    this.buffer = [];
    b.forEach(fn);
  }

  connect(code, name) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (msg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.close();
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('Bağlantı zaman aşımına uğradı. Admin oyunu başlattı mı?'), 20000);

      const peer = new Peer(peerOptions());
      this.peer = peer;
      peer.on('error', (err) => {
        if (!done) fail(peerErrorText(err));
        else console.warn('Peer hatası', err);
      });
      peer.on('open', () => {
        const conn = peer.connect(CONFIG.ROOM_ID, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => {
          conn.send({ t: 'hello', code, name, v: CONFIG.VERSION });
        });
        conn.on('data', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (!this.welcomed) {
            if (msg.t === 'welcome') {
              this.welcomed = true;
              done = true;
              clearTimeout(timer);
              resolve(msg);
            } else if (msg.t === 'err') {
              fail(msg.msg);
            }
            return;
          }
          if (this.onMessage) this.onMessage(msg); else this.buffer.push(msg);
        });
        conn.on('close', () => {
          if (!done) fail('Sunucu bağlantıyı reddetti.');
          else if (this.onClose) this.onClose('Sunucu ile bağlantı koptu (admin oyundan çıkmış olabilir).');
        });
        conn.on('error', (e) => console.warn('Bağlantı hatası', e));
      });
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    try { if (this.conn) this.conn.close(); } catch (e) { /* yok say */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* yok say */ }
  }
}
