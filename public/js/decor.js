// Süsler ve küçük modeller: kedi tablosu, duvarda uyuyan Ankara kedisi, deniz kabuğu fosili mayını.
import * as THREE from 'three';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ------------------------------------------------------------
// Tablo: verilen fotoğraf olduğu gibi (ışıktan etkilenmeden), ahşap çerçeve içinde.
// w/h: resmin kendi boyutu (metre). Tablo +z yönüne bakar.
export function buildPainting(url, w, h) {
  const g = new THREE.Group();
  const frame = lam(0x6b4423);
  const gold = lam(0xc9a24a);
  const F = 0.12, D = 0.06;
  mesh(g, new THREE.BoxGeometry(w + 2 * F, h + 2 * F, 0.03), lam(0x3a2414), 0, 0, 0.015);
  for (const [x, y, sw, sh] of [[0, h / 2 + F / 2, w + 2 * F, F], [0, -h / 2 - F / 2, w + 2 * F, F], [-w / 2 - F / 2, 0, F, h], [w / 2 + F / 2, 0, F, h]]) {
    mesh(g, new THREE.BoxGeometry(sw, sh, D), frame, x, y, D / 2);
  }
  // İnce yaldızlı iç kenar
  for (const [x, y, sw, sh] of [[0, h / 2 + 0.012, w + 0.05, 0.024], [0, -h / 2 - 0.012, w + 0.05, 0.024], [-w / 2 - 0.012, 0, 0.024, h], [w / 2 + 0.012, 0, 0.024, h]]) {
    mesh(g, new THREE.BoxGeometry(sw, sh, 0.02), gold, x, y, D + 0.005);
  }
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pic = mesh(g, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 0, 0.035);
  // İsabet anında kısa kırmızı parıltı
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = mesh(g, new THREE.PlaneGeometry(w + 0.2, h + 0.2), glowMat, 0, 0, 0.04);
  glow.renderOrder = 3;
  return { group: g, pic, glow };
}

// ------------------------------------------------------------
// Uyuyan beyaz Ankara kedisi: uzun ipeksi beyaz tüy, pembe burun, kulak içi ve pati yastıkları,
// kabarık tüy gibi kuyruk. Kıvrılmış yatar; nefes alırken göğsü kalkıp iner. Model +z yönüne bakar.
function furTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f4f0'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const px = Math.random() * S, py = Math.random() * S, l = 4 + Math.random() * 10;
    const v = 225 + Math.random() * 30;
    x.strokeStyle = `rgba(${v},${v},${v - 6},0.55)`;
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 3, py + l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildSleepingCat() {
  const root = new THREE.Group();
  const fur = lam(0xffffff, { map: furTexture() });
  const pink = lam(0xf4a7b9), pinkDeep = lam(0xe58aa0), dark = lam(0x3a2a2a);
  const sphere = new THREE.SphereGeometry(1, 18, 12);
  const body = new THREE.Group();
  root.add(body);
  // Kıvrık gövde: arka kalça + sırt + göğüs
  const torso = mesh(body, sphere, fur, 0, 0.3, 0);
  torso.scale.set(0.5, 0.3, 0.62);
  const haunch = mesh(body, sphere, fur, 0.18, 0.3, -0.34);
  haunch.scale.set(0.36, 0.3, 0.34);
  const chest = mesh(body, sphere, fur, -0.12, 0.26, 0.38);
  chest.scale.set(0.34, 0.25, 0.3);
  // Göğüste hafif pembe ten (seyrek tüylü karın)
  const belly = mesh(body, sphere, lam(0xfde3ea), -0.28, 0.2, 0.15);
  belly.scale.set(0.12, 0.14, 0.32);
  // Ön patiler önde uzanır, pembe yastıkları görünür
  const paws = new THREE.Group();
  root.add(paws);
  for (const s of [-1, 1]) {
    const leg = mesh(paws, sphere, fur, s * 0.12, 0.09, 0.62);
    leg.scale.set(0.09, 0.08, 0.2);
    const pad = mesh(paws, sphere, pink, s * 0.12, 0.06, 0.8);
    pad.scale.set(0.055, 0.035, 0.03);
    for (const k of [-1, 0, 1]) {
      const toe = mesh(paws, sphere, pinkDeep, s * 0.12 + k * 0.035, 0.075, 0.815);
      toe.scale.setScalar(0.014);
    }
  }
  // Baş: patilerin üstüne yaslanmış, hafif yana dönük
  const head = new THREE.Group();
  head.position.set(0.02, 0.27, 0.66);
  head.rotation.set(0.15, -0.35, 0.12);
  root.add(head);
  const skull = mesh(head, sphere, fur, 0, 0, 0);
  skull.scale.set(0.24, 0.2, 0.22);
  const muzzle = mesh(head, sphere, fur, 0, -0.05, 0.16);
  muzzle.scale.set(0.12, 0.08, 0.09);
  // Yanaklardaki uzun tüy püskülleri
  for (const s of [-1, 1]) {
    const ruff = mesh(head, sphere, fur, s * 0.17, -0.06, 0.02);
    ruff.scale.set(0.09, 0.12, 0.12);
  }
  mesh(head, sphere, pink, 0, -0.025, 0.245).scale.set(0.03, 0.022, 0.018); // burun
  // Kapalı gözler: aşağı kıvrık ince çizgiler
  for (const s of [-1, 1]) {
    const lid = mesh(head, new THREE.TorusGeometry(0.04, 0.007, 4, 10, Math.PI), dark, s * 0.085, 0.04, 0.19);
    lid.rotation.set(0, s * 0.3, Math.PI);
  }
  // Bıyıklar
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const w = mesh(head, new THREE.CylinderGeometry(0.0025, 0.0025, 0.24, 3), lam(0xeeeeee), s * 0.15, -0.06 + k * 0.018, 0.17);
      w.rotation.set(0, 0, Math.PI / 2 + s * (k - 1) * 0.12);
    }
  }
  // Sivri kulaklar (içi pembe, ucunda tüy püskülü)
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.13, 0.15, -0.02);
    ear.rotation.set(-0.15, 0, -s * 0.28);
    head.add(ear);
    mesh(ear, new THREE.ConeGeometry(0.09, 0.2, 4), fur, 0, 0.08, 0);
    const inner = mesh(ear, new THREE.ConeGeometry(0.055, 0.14, 4), pink, 0, 0.07, 0.03);
    inner.scale.z = 0.4;
    mesh(ear, new THREE.ConeGeometry(0.012, 0.07, 3), fur, 0, 0.2, 0);
    ears.push(ear);
  }
  // Kabarık kuyruk: gövdenin çevresinden öne doğru kıvrılır
  const tail = new THREE.Group();
  root.add(tail);
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = -1.3 + (i / 10) * 2.9;
    pts.push([Math.sin(a) * 0.62 + 0.05, 0.12 + Math.sin((i / 10) * Math.PI) * 0.05, -Math.cos(a) * 0.62 + 0.08]);
  }
  pts.forEach(([x, y, z], i) => {
    const r = 0.1 + Math.sin((i / 10) * Math.PI) * 0.05 + (i > 7 ? 0.02 : 0);
    mesh(tail, sphere, fur, x, y, z).scale.setScalar(r);
  });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, head, ears, tail };
}

// "Zzz" harfleri için doku
export function zTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 52px system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(40,60,110,0.8)';
  x.strokeText('Z', 32, 34);
  x.fillStyle = '#e8f1ff';
  x.fillText('Z', 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------
// Deniz kabuğu fosili (tarak kabuğu): menteşeden yelpaze gibi açılan ışınsal kaburgalar, kireçtaşı rengi.
// Yarısı toprağa gömülü durur.
let shellGeo = null, shellMat = null;
export function buildShellMine() {
  if (!shellGeo) {
    const R = 0.58, ribs = 13, A = 1.95; // yelpaze açısı
    const pos = [], col = [], idx = [];
    const NA = 52, NR = 9;
    const base = new THREE.Color(0xc9b996), groove = new THREE.Color(0x8d7d5f);
    const c = new THREE.Color();
    for (let i = 0; i <= NR; i++) {
      const r = (i / NR) * R;
      for (let j = 0; j <= NA; j++) {
        const a = -A / 2 + (j / NA) * A;
        const ribK = Math.abs(Math.cos((j / NA) * ribs * Math.PI));
        const h = 0.13 * Math.pow(1 - (r / R) * (r / R), 0.7) * (0.75 + 0.25 * ribK) + 0.01 * Math.sin(r * 40) * (r / R);
        pos.push(Math.sin(a) * r, h, -Math.cos(a) * r + R * 0.45);
        c.copy(groove).lerp(base, 0.35 + 0.65 * ribK);
        c.offsetHSL(0, 0, (Math.sin(r * 23) * 0.5) * 0.03);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NA; j++) {
        const a = i * (NA + 1) + j, b = a + NA + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    shellGeo = g;
    shellMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }
  const root = new THREE.Group();
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.receiveShadow = true;
  root.add(shell);
  // Menteşedeki iki "kulakçık"
  const ear = new THREE.BoxGeometry(0.14, 0.04, 0.09);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(ear, shellMat);
    e.position.set(s * 0.08, 0.02, 0.27);
    root.add(e);
  }
  return root;
}
