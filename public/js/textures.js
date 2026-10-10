// Kod ile üretilen dokular (dışarıdan resim dosyası gerekmez).
import * as THREE from 'three';

function cnv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function noise(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function concrete() {
  const S = 256, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#a3a198'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${60 + Math.random() * 40},${60 + Math.random() * 30},50,${Math.random() * 0.08})`;
    x.beginPath();
    x.arc(Math.random() * S, Math.random() * S, 8 + Math.random() * 40, 0, Math.PI * 2);
    x.fill();
  }
  noise(x, S, S, 26);
  x.strokeStyle = 'rgba(40,40,35,0.32)'; x.lineWidth = 2;
  x.strokeRect(0, 0, S, S);
  x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.stroke();
  return toTex(c);
}

function asphalt() {
  const S = 256, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#3d3e42'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 30);
  x.fillStyle = '#e8c547';
  for (let i = 0; i < 2; i++) x.fillRect(S / 2 - 4, i * S / 2 + 20, 8, S / 2 - 40);
  return toTex(c);
}

function brick() {
  const S = 256, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#6d625a'; x.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows, bw = S / 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k < 5; k++) {
      const v = 120 + Math.random() * 50;
      x.fillStyle = `rgb(${v + 30},${v * 0.55},${v * 0.42})`;
      x.fillRect(k * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
    }
  }
  noise(x, S, S, 22);
  return toTex(c);
}

function corrugated() {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  for (let i = 0; i < S; i++) {
    const v = 175 + Math.sin(i / S * Math.PI * 16) * 55;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(i, 0, 1, S);
  }
  noise(x, S, S, 18);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 0, S, 4); x.fillRect(0, S - 4, S, 4);
  return toTex(c);
}

function wood() {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#a0723f'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) {
    const v = 140 + Math.random() * 40;
    x.fillStyle = `rgb(${v},${v * 0.68},${v * 0.38})`;
    x.fillRect(0, i * 32 + 2, S, 28);
  }
  x.strokeStyle = 'rgba(60,35,15,0.35)';
  for (let i = 0; i < 30; i++) {
    const y = Math.random() * S;
    x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(40, y + 3, 80, y - 3, S, y + 1); x.stroke();
  }
  x.strokeStyle = '#4a2f14'; x.lineWidth = 8; x.strokeRect(4, 4, S - 8, S - 8);
  x.beginPath(); x.moveTo(8, 8); x.lineTo(S - 8, S - 8); x.stroke();
  noise(x, S, S, 16);
  return toTex(c);
}

function metal() {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#8c949c'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 20);
  x.strokeStyle = 'rgba(30,35,40,0.6)'; x.lineWidth = 2;
  x.strokeRect(1, 1, S - 2, S - 2);
  x.fillStyle = 'rgba(30,35,40,0.7)';
  for (const [a, b] of [[8, 8], [S - 8, 8], [8, S - 8], [S - 8, S - 8]]) {
    x.beginPath(); x.arc(a, b, 3, 0, Math.PI * 2); x.fill();
  }
  return toTex(c);
}

function hazard() {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, S, S);
  x.fillStyle = '#1d1d1d';
  for (let i = -2; i < 4; i++) {
    x.beginPath();
    x.moveTo(i * 64, 0); x.lineTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32 + S, S); x.lineTo(i * 64 + S, S);
    x.fill();
  }
  noise(x, S, S, 14);
  return toTex(c);
}

function roof() {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#55585c'; x.fillRect(0, 0, S, S);
  noise(x, S, S, 34);
  return toTex(c);
}

function grass() {
  const S = 256, c = cnv(S), x = c.getContext('2d');
  x.fillStyle = '#5d7a3a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) {
    const g = 90 + Math.random() * 70;
    x.fillStyle = `rgba(${g * 0.6},${g},${g * 0.35},0.5)`;
    x.fillRect(Math.random() * S, Math.random() * S, 2, 4);
  }
  noise(x, S, S, 18);
  return toTex(c);
}

// Lego tuğla yan yüzü: parlak plastik renk + beyaz sembol
export const LEGO_COLORS = { w: '#f5a300', h: '#1fa64a', j: '#1e6fe0' };
function legoFace(kind) {
  const S = 128, c = cnv(S), x = c.getContext('2d');
  const col = LEGO_COLORS[kind];
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, col); g.addColorStop(1, shade(col, -0.18));
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 0, S, 6);
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, S - 6, S, 6);
  x.fillStyle = '#ffffff';
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4;
  if (kind === 'h') {
    x.fillRect(S / 2 - 12, 30, 24, 68); x.fillRect(30, S / 2 - 12, 68, 24);
  } else if (kind === 'j') {
    for (const cx of [46, 82]) { x.beginPath(); x.roundRect ? x.roundRect(cx - 12, 30, 24, 50, 10) : x.rect(cx - 12, 30, 24, 50); x.fill(); }
    x.fillStyle = '#ffcc4d';
    for (const cx of [46, 82]) { x.beginPath(); x.moveTo(cx - 9, 82); x.lineTo(cx + 9, 82); x.lineTo(cx, 104); x.fill(); }
  } else {
    x.font = 'bold 82px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeText('?', S / 2, S / 2 + 6); x.fillText('?', S / 2, S / 2 + 6);
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Clypeaster fosili (üstten görünüş): krem taş, beş yapraklı desen, ince çizgiler
function fossil() {
  const S = 256, c = cnv(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#e6d8b4'); g.addColorStop(0.8, '#cdb88c'); g.addColorStop(1, '#a8916a');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  noise(x, S, S, 22);
  x.translate(S / 2, S / 2);
  // Beş yaprak (petaloid)
  for (let i = 0; i < 5; i++) {
    x.save();
    x.rotate((i / 5) * Math.PI * 2 - Math.PI / 2);
    x.beginPath();
    x.ellipse(0, -52, 17, 46, 0, 0, Math.PI * 2);
    x.fillStyle = 'rgba(120,96,60,0.35)'; x.fill();
    x.strokeStyle = 'rgba(80,60,35,0.75)'; x.lineWidth = 3; x.stroke();
    // Yaprak içindeki gözenek sıraları
    x.fillStyle = 'rgba(70,52,30,0.7)';
    for (let k = 0; k < 9; k++) {
      const yy = -16 - k * 8.5, w = Math.sin(((k + 1) / 10) * Math.PI) * 12;
      x.beginPath(); x.arc(-w, yy, 1.6, 0, Math.PI * 2); x.arc(w, yy, 1.6, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
  // Merkez ve ışınsal ince çizgiler
  x.fillStyle = 'rgba(80,60,35,0.8)'; x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(90,70,40,0.25)'; x.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    x.beginPath(); x.moveTo(Math.cos(a) * 100, Math.sin(a) * 100); x.lineTo(Math.cos(a) * 126, Math.sin(a) * 126); x.stroke();
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Parlama sprite'ı (efektler için)
export function glowTexture() {
  const S = 64, c = cnv(S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export function makeTextures() {
  return {
    concrete: concrete(),
    asphalt: asphalt(),
    brick: brick(),
    corrugated: corrugated(),
    wood: wood(),
    metal: metal(),
    hazard: hazard(),
    roof: roof(),
    grass: grass(),
    legoW: legoFace('w'),
    legoH: legoFace('h'),
    legoJ: legoFace('j'),
    fossil: fossil(),
  };
}
