// Kodla üretilen sesler (WebAudio). Ses dosyası gerekmez.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) {
    const l = this.listener;
    l.x = x; l.y = y; l.z = z; l.yaw = yaw;
  }

  // Konuma göre ses düzeyi ve stereo
  spatial(pos, vol, maxD = 90) {
    if (!pos) return { gain: vol, pan: 0 };
    const l = this.listener;
    const dx = pos.x - l.x, dy = pos.y - l.y, dz = pos.z - l.z;
    const d = Math.hypot(dx, dy, dz);
    const k = Math.max(0, 1 - d / maxD);
    // Sağ vektör (yaw=0 iken -Z'ye bakılıyor)
    const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return { gain: vol * k * k, pan: pan * 0.8 };
  }

  out(pos, vol, maxD) {
    const { gain, pan } = this.spatial(pos, vol, maxD);
    if (gain < 0.005) return null;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.start(t, Math.random() * 0.5, dur + 0.05);
    return s;
  }

  env(param, t, a, peak, dec) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  burst(dest, t, type, f0, f1, dur, vol, q = 1) {
    const n = this.noiseSrc(t, dur);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g.gain, t, 0.002, vol, dur);
    n.connect(f).connect(g).connect(dest);
  }

  tone(dest, t, type, f0, f1, dur, vol, a = 0.004) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g.gain, t, a, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + dur + 0.05);
  }

  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const maxD = name === 'explosion' || name === 'implode' ? 160 : 100;
    const o = this.out(pos, vol, maxD);
    if (!o) return;
    switch (name) {
      case 'pistol':
        this.burst(o, t, 'bandpass', 2400, 600, 0.12, 0.9, 0.8);
        this.tone(o, t, 'sine', 180, 50, 0.08, 0.6);
        break;
      case 'shotgun':
        this.burst(o, t, 'lowpass', 3000, 300, 0.35, 1.2, 0.5);
        this.tone(o, t, 'sine', 120, 35, 0.18, 0.9);
        break;
      case 'minigun':
        this.burst(o, t, 'bandpass', 3000, 1200, 0.05, 0.6, 1);
        this.tone(o, t, 'square', 140, 60, 0.04, 0.12);
        break;
      case 'rocket':
        this.burst(o, t, 'bandpass', 300, 1500, 0.5, 0.8, 1.5);
        this.tone(o, t, 'sawtooth', 90, 40, 0.3, 0.25);
        break;
      case 'grenade':
        this.tone(o, t, 'sine', 260, 70, 0.12, 0.8);
        this.burst(o, t, 'lowpass', 1200, 200, 0.12, 0.4);
        break;
      case 'rail':
        this.tone(o, t, 'sawtooth', 2400, 120, 0.6, 0.35);
        this.tone(o, t, 'sine', 900, 60, 0.5, 0.5);
        this.burst(o, t, 'highpass', 4000, 1500, 0.2, 0.6);
        break;
      case 'tesla':
        for (let i = 0; i < 6; i++) this.burst(o, t + i * 0.035, 'bandpass', 3000 + Math.random() * 3000, 1500, 0.04, 0.6, 2);
        this.tone(o, t, 'sawtooth', 160, 80, 0.25, 0.25);
        break;
      case 'orb':
        this.tone(o, t, 'sine', 120, 600, 0.4, 0.6, 0.05);
        this.tone(o, t, 'triangle', 60, 300, 0.4, 0.4, 0.05);
        break;
      case 'explosion':
        this.burst(o, t, 'lowpass', 1600, 60, 1.3, 1.4, 0.7);
        this.tone(o, t, 'sine', 90, 25, 0.9, 1.2);
        break;
      case 'implode':
        this.tone(o, t, 'sine', 40, 400, 0.5, 0.8, 0.3);
        this.burst(o, t + 0.3, 'lowpass', 2000, 80, 0.9, 1.2);
        break;
      case 'bhloop':
        this.tone(o, t, 'sine', 45, 30, 3.8, 0.7, 0.3);
        this.burst(o, t, 'lowpass', 300, 120, 3.8, 0.5, 2);
        break;
      case 'hit':
        this.tone(o, t, 'square', 1500, 1400, 0.05, 0.25);
        break;
      case 'headshot':
        this.tone(o, t, 'square', 2100, 2000, 0.06, 0.25);
        this.tone(o, t + 0.05, 'square', 2600, 2500, 0.06, 0.2);
        break;
      case 'kill':
        this.tone(o, t, 'triangle', 700, 700, 0.1, 0.5);
        this.tone(o, t + 0.09, 'triangle', 1050, 1050, 0.18, 0.5);
        break;
      case 'hurt':
        this.tone(o, t, 'sine', 140, 60, 0.15, 0.8);
        this.burst(o, t, 'lowpass', 800, 200, 0.12, 0.4);
        break;
      case 'death':
        this.tone(o, t, 'sawtooth', 300, 40, 0.8, 0.4);
        break;
      case 'pickup':
        [660, 880, 1320].forEach((f, i) => this.tone(o, t + i * 0.06, 'triangle', f, f, 0.12, 0.45));
        break;
      case 'health':
        this.tone(o, t, 'sine', 500, 900, 0.3, 0.5);
        this.tone(o, t + 0.1, 'sine', 750, 1300, 0.3, 0.35);
        break;
      case 'land':
        this.tone(o, t, 'sine', 90, 40, 0.15, 0.6);
        this.burst(o, t, 'lowpass', 500, 100, 0.2, 0.6);
        break;
      case 'empty':
        this.tone(o, t, 'square', 300, 280, 0.03, 0.2);
        break;
      case 'spawn':
        this.tone(o, t, 'sine', 300, 900, 0.4, 0.4, 0.05);
        break;
      case 'switch':
        this.burst(o, t, 'highpass', 3000, 2000, 0.05, 0.3);
        break;
      case 'chat':
        this.tone(o, t, 'sine', 900, 900, 0.07, 0.25);
        break;
      case 'freezehit':
        this.burst(o, t, 'highpass', 6000, 3000, 0.15, 0.3);
        break;
      case 'worb':
        this.tone(o, t, 'sine', 900, 300, 0.4, 0.5, 0.03);
        this.tone(o, t, 'triangle', 1350, 450, 0.4, 0.3, 0.03);
        break;
      case 'whloop':
        for (let i = 0; i < 4; i++) this.tone(o, t + i * 0.7, 'sine', 1200 + i * 200, 1500 + i * 200, 0.7, 0.25, 0.2);
        this.burst(o, t, 'highpass', 3000, 6000, 2.8, 0.25, 1);
        break;
      case 'nova':
        this.tone(o, t, 'sine', 300, 1800, 0.25, 0.7, 0.01);
        this.burst(o, t + 0.1, 'bandpass', 4000, 300, 0.9, 1.1, 0.6);
        break;
      case 'tp':
        this.tone(o, t, 'sine', 300, 2400, 0.25, 0.5, 0.01);
        this.tone(o, t + 0.05, 'triangle', 2400, 600, 0.3, 0.3, 0.01);
        this.burst(o, t, 'highpass', 2000, 8000, 0.3, 0.3);
        break;
      case 'saw':
        this.tone(o, t, 'sawtooth', 700, 1400, 0.25, 0.25);
        this.burst(o, t, 'bandpass', 5000, 3000, 0.2, 0.4, 3);
        break;
      case 'sawhit':
        this.burst(o, t, 'bandpass', 3500, 2500, 0.12, 0.5, 4);
        this.tone(o, t, 'square', 1800, 900, 0.08, 0.15);
        break;
      case 'zig':
        for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.04, 'square', 1600 - i * 300, 900 - i * 200, 0.05, 0.18);
        this.burst(o, t, 'highpass', 3000, 2000, 0.12, 0.3);
        break;
      case 'mount':
        this.tone(o, t, 'triangle', 400, 600, 0.1, 0.4);
        this.tone(o, t + 0.08, 'triangle', 600, 900, 0.12, 0.35);
        break;
      case 'crash':
        this.burst(o, t, 'lowpass', 1800, 150, 0.4, 1.0, 0.8);
        this.tone(o, t, 'square', 120, 40, 0.2, 0.4);
        break;
      case 'squeak':
        this.tone(o, t, 'sine', 1800, 3200, 0.08, 0.35, 0.005);
        this.tone(o, t + 0.07, 'sine', 2600, 1900, 0.1, 0.3, 0.005);
        break;
      case 'stomp':
        this.tone(o, t, 'sine', 80, 30, 0.5, 1.2);
        this.burst(o, t, 'lowpass', 900, 80, 0.6, 1.0);
        break;
      case 'jetstart':
        this.burst(o, t, 'bandpass', 400, 1200, 0.3, 0.6, 1);
        break;
    }
  }

  // Sürekli ses (ışın silahları). Döndürülen nesne ile konum/durdurma.
  loop(kind, pos) {
    if (!this.ctx || this.ctx.state !== 'running') return null;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) g.connect(pan).connect(this.master); else g.connect(this.master);
    const nodes = [];
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'laser' ? 1800 : kind === 'moto' ? 900 : kind === 'jet' ? 1400 : 5000;
    f.connect(g);
    let pitched = []; // hızla perdesi değişen osilatörler (motor)
    if (kind === 'moto') {
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 82;
      const m = this.ctx.createGain(); m.gain.value = 0.3;
      o1.connect(m); o2.connect(m); m.connect(f);
      nodes.push(o1, o2);
      pitched = [[o1, 55], [o2, 82]];
    } else if (kind === 'jet') {
      const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
      const ng = this.ctx.createGain(); ng.gain.value = 0.9;
      n.connect(bp).connect(ng).connect(f);
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 70;
      const og = this.ctx.createGain(); og.gain.value = 0.12;
      o1.connect(og).connect(f);
      nodes.push(n, o1);
    } else if (kind === 'laser') {
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 220;
      const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 331;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 18;
      const lg = this.ctx.createGain(); lg.gain.value = 30;
      lfo.connect(lg).connect(o1.frequency);
      const m = this.ctx.createGain(); m.gain.value = 0.25;
      o1.connect(m); o2.connect(m); m.connect(f);
      nodes.push(o1, o2, lfo);
    } else {
      const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 1100;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 9;
      const lg = this.ctx.createGain(); lg.gain.value = 200;
      lfo.connect(lg).connect(o1.frequency);
      const m = this.ctx.createGain(); m.gain.value = 0.2;
      o1.connect(m).connect(f);
      const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
      const ng = this.ctx.createGain(); ng.gain.value = 0.25;
      n.connect(hp).connect(ng).connect(f);
      nodes.push(o1, lfo, n);
    }
    nodes.forEach((n) => n.start(t));
    const self = this;
    const h = {
      update(p, vol = 0.7) {
        const s = self.spatial(p, vol);
        g.gain.setTargetAtTime(s.gain, self.ctx.currentTime, 0.03);
        if (pan) pan.pan.setTargetAtTime(s.pan, self.ctx.currentTime, 0.03);
      },
      // Motor devri: 1 = rölanti
      setRate(r) {
        for (const [o, base] of pitched) o.frequency.setTargetAtTime(base * r, self.ctx.currentTime, 0.05);
      },
      stop() {
        const now = self.ctx.currentTime;
        g.gain.setTargetAtTime(0, now, 0.03);
        nodes.forEach((n) => { try { n.stop(now + 0.2); } catch (e) { /* zaten durdu */ } });
      },
    };
    h.update(pos);
    return h;
  }
}
