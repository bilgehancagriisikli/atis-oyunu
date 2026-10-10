// Basit fizik: eksen hizalı kutular + rampalar, karakter hareketi ve ışın testleri.

export const PLAYER = {
  radius: 0.38,
  height: 1.8,
  eye: 1.62,
  step: 0.55,
  gravity: 24,
  jump: 8.4,
  speed: 7.2,
  sprint: 10.2,
};

export class World {
  constructor() {
    this.colliders = [];
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const c = { type: 'box', minX, minY, minZ, maxX, maxY, maxZ };
    this.colliders.push(c);
    return c;
  }

  // axis: 'x' | 'z', asc: +1 => eksenin + yönüne doğru yükselir
  addRamp(minX, minY, minZ, maxX, maxY, maxZ, axis, asc) {
    const c = { type: 'ramp', minX, minY, minZ, maxX, maxY, maxZ, axis, asc };
    // Işın testi için dışa bakan düzlemler (n·p <= d içeride)
    const H = maxY - minY;
    const planes = [
      [0, -1, 0, -minY],
      [1, 0, 0, maxX],
      [-1, 0, 0, -minX],
      [0, 0, 1, maxZ],
      [0, 0, -1, -minZ],
    ];
    // Eğik yüzey
    if (axis === 'x') {
      const L = maxX - minX;
      if (asc > 0) planes.push(norm([-H / L, 1, 0], [minX, minY, 0]));
      else planes.push(norm([H / L, 1, 0], [maxX, minY, 0]));
    } else {
      const L = maxZ - minZ;
      if (asc > 0) planes.push(norm([0, 1, -H / L], [0, minY, minZ]));
      else planes.push(norm([0, 1, H / L], [0, minY, maxZ]));
    }
    c.planes = planes;
    this.colliders.push(c);
    return c;
  }

  // Rampanın (x,z) noktasındaki yüzey yüksekliği
  rampTop(c, x, z) {
    const u = c.axis === 'x' ? x : z;
    const lo = c.axis === 'x' ? c.minX : c.minZ;
    const hi = c.axis === 'x' ? c.maxX : c.maxZ;
    let t = (u - lo) / (hi - lo);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (c.asc < 0) t = 1 - t;
    return c.minY + t * (c.maxY - c.minY);
  }

  // Ayak izinin kapladığı alandaki en yüksek rampa noktası (engelleme için)
  rampTopFoot(c, x, z, r) {
    if (c.axis === 'x') {
      const px = c.asc > 0 ? Math.min(c.maxX, x + r) : Math.max(c.minX, x - r);
      return this.rampTop(c, px, z);
    }
    const pz = c.asc > 0 ? Math.min(c.maxZ, z + r) : Math.max(c.minZ, z - r);
    return this.rampTop(c, x, pz);
  }

  // maxY'nin altındaki en yüksek zemin
  supportHeight(x, z, r, maxY) {
    let best = -Infinity;
    for (const c of this.colliders) {
      if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
      let top;
      if (c.type === 'box') top = c.maxY;
      else {
        const cx = Math.min(c.maxX, Math.max(c.minX, x));
        const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
        top = this.rampTop(c, cx, cz);
      }
      if (top <= maxY && top > best) best = top;
    }
    return best;
  }

  // Bir noktanın altındaki zemin (kutular için)
  groundAt(x, z, fromY = 100) {
    const h = this.supportHeight(x, z, 0.01, fromY);
    return h === -Infinity ? 0 : h;
  }

  // Oyuncu kutusu bu konumda bir şeyle çakışıyor mu?
  overlapsPlayer(x, y, z, r = PLAYER.radius) {
    for (const c of this.colliders) {
      if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
      const top = c.type === 'box' ? c.maxY : this.rampTopFoot(c, x, z, r);
      if (top > y + 0.05 && c.minY < y + PLAYER.height) return true;
    }
    return false;
  }

  // Işın testi: {t, nx, ny, nz} ya da null
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let bestT = maxT, bn = null;
    for (const c of this.colliders) {
      if (c.ghost) continue;
      const hit = slab(c, ox, oy, oz, dx, dy, dz, bestT);
      if (!hit) continue;
      if (c.type === 'box') {
        bestT = hit.t; bn = hit.n;
      } else {
        const h2 = convex(c.planes, ox, oy, oz, dx, dy, dz, bestT);
        if (h2) { bestT = h2.t; bn = h2.n; }
      }
    }
    return bn ? { t: bestT, nx: bn[0], ny: bn[1], nz: bn[2] } : null;
  }
}

function norm(n, p) {
  const l = Math.hypot(n[0], n[1], n[2]);
  const nx = n[0] / l, ny = n[1] / l, nz = n[2] / l;
  return [nx, ny, nz, nx * p[0] + ny * p[1] + nz * p[2]];
}

const NORMALS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

function slab(c, ox, oy, oz, dx, dy, dz, maxT) {
  let tmin = 0, tmax = maxT, axis = -1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [c.minX, c.minY, c.minZ], mx = [c.maxX, c.maxY, c.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (mn[i] - o[i]) * inv, t2 = (mx[i] - o[i]) * inv;
    let face = i * 2;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; face = i * 2 + 1; }
    if (t1 > tmin) { tmin = t1; axis = face; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null; // başlangıç kutunun içinde
  return { t: tmin, n: NORMALS[axis] };
}

function convex(planes, ox, oy, oz, dx, dy, dz, maxT) {
  let tEnter = -Infinity, tExit = maxT, n = null;
  for (const p of planes) {
    const denom = p[0] * dx + p[1] * dy + p[2] * dz;
    const num = p[3] - (p[0] * ox + p[1] * oy + p[2] * oz);
    if (Math.abs(denom) < 1e-9) {
      if (num < 0) return null;
      continue;
    }
    const t = num / denom;
    if (denom < 0) {
      if (t > tEnter) { tEnter = t; n = p; }
    } else if (t < tExit) tExit = t;
    if (tEnter > tExit) return null;
  }
  if (!n || tEnter < 0 || tEnter > maxT) return null;
  return { t: tEnter, n: [n[0], n[1], n[2]] };
}

// ------------------------------------------------------------
// Karakter hareketi. p: {x,y,z,vx,vy,vz,onGround}; y = ayak yüksekliği
// wish: {x, z (birim yön), speed, jump}
// ------------------------------------------------------------
export function stepCharacter(world, p, wish, dt) {
  const r = PLAYER.radius;
  const wl = Math.hypot(wish.x, wish.z);
  const wx = wl > 0 ? wish.x / wl : 0, wz = wl > 0 ? wish.z / wl : 0;

  if (p.onGround) {
    // Yerde: hedef hıza hızlı yaklaş
    const tx = wx * wish.speed, tz = wz * wish.speed;
    const ddx = tx - p.vx, ddz = tz - p.vz;
    const dl = Math.hypot(ddx, ddz);
    const maxD = 70 * dt;
    if (dl <= maxD) { p.vx = tx; p.vz = tz; }
    else { p.vx += ddx / dl * maxD; p.vz += ddz / dl * maxD; }
    if (wish.jump) { p.vy = PLAYER.jump; p.onGround = false; }
  } else if (wl > 0) {
    // Havada: sınırlı kontrol, savrulma momentumu korunur
    const before = Math.hypot(p.vx, p.vz);
    p.vx += wx * 18 * dt;
    p.vz += wz * 18 * dt;
    const after = Math.hypot(p.vx, p.vz);
    const cap = Math.max(before, wish.speed);
    if (after > cap) { p.vx *= cap / after; p.vz *= cap / after; }
  }

  const step = p.onGround ? PLAYER.step : 0.3;
  moveAxis(world, p, 0, p.vx * dt, r, step);
  moveAxis(world, p, 1, p.vz * dt, r, step);

  // Dikey
  p.vy -= PLAYER.gravity * dt;
  if (p.vy < -45) p.vy = -45;
  let ny = p.y + p.vy * dt;
  if (p.vy > 0) {
    const head = p.y + PLAYER.height;
    for (const c of world.colliders) {
      if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
      if (c.minY >= head - 0.05 && ny + PLAYER.height > c.minY) {
        ny = c.minY - PLAYER.height;
        p.vy = 0;
      }
    }
  }
  const ground = world.supportHeight(p.x, p.z, r, p.y + step);
  const wasGround = p.onGround;
  if (ny <= ground) {
    ny = ground;
    if (p.vy < 0) p.vy = 0;
    p.onGround = true;
  } else if (wasGround && p.vy <= 0 && p.y - ground < 0.65) {
    // Rampadan / basamaktan inerken zemine yapış
    ny = ground;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }
  p.y = ny;
}

function moveAxis(world, p, axis, delta, r, step) {
  if (delta === 0) return;
  const feet = p.y, head = p.y + PLAYER.height;
  let nx = axis === 0 ? p.x + delta : p.x;
  let nz = axis === 1 ? p.z + delta : p.z;
  for (const c of world.colliders) {
    if (nx + r <= c.minX || nx - r >= c.maxX || nz + r <= c.minZ || nz - r >= c.maxZ) continue;
    if (c.minY >= head - 0.01) continue;
    const top = c.type === 'box' ? c.maxY : world.rampTopFoot(c, nx, nz, r);
    if (top <= feet + step) continue;
    if (c.type === 'box') {
      if (axis === 0) nx = delta > 0 ? Math.min(nx, c.minX - r - 1e-4) : Math.max(nx, c.maxX + r + 1e-4);
      else nz = delta > 0 ? Math.min(nz, c.minZ - r - 1e-4) : Math.max(nz, c.maxZ + r + 1e-4);
    } else {
      nx = p.x; nz = p.z;
    }
    if (axis === 0) p.vx = 0; else p.vz = 0;
  }
  // Kenetlenme sonucu geri gitme sapmalarını sınırla
  if (axis === 0) {
    if ((delta > 0 && nx < p.x - 0.5) || (delta < 0 && nx > p.x + 0.5)) nx = p.x;
    p.x = nx;
  } else {
    if ((delta > 0 && nz < p.z - 0.5) || (delta < 0 && nz > p.z + 0.5)) nz = p.z;
    p.z = nz;
  }
}

// ------------------------------------------------------------
// Oyuncu vuruş kutuları (ayak konumuna göre)
// ------------------------------------------------------------
export const HITBOX = { headY: 1.58, headR: 0.27, bodyR: 0.4, bodyTop: 1.36 };

// Işın - oyuncu: {t, head} ya da null
export function rayVsPlayer(ox, oy, oz, dx, dy, dz, maxT, px, py, pz) {
  let best = null;
  // Kafa küresi
  const cx = px - ox, cy = py + HITBOX.headY - oy, cz = pz - oz;
  const b = cx * dx + cy * dy + cz * dz;
  const c = cx * cx + cy * cy + cz * cz - HITBOX.headR * HITBOX.headR;
  const disc = b * b - c;
  if (disc >= 0) {
    const t = b - Math.sqrt(disc);
    if (t > 0 && t < maxT) best = { t, head: true };
  }
  // Gövde kutusu
  const box = {
    minX: px - HITBOX.bodyR, maxX: px + HITBOX.bodyR,
    minY: py, maxY: py + HITBOX.bodyTop,
    minZ: pz - HITBOX.bodyR, maxZ: pz + HITBOX.bodyR,
  };
  const h = slab(box, ox, oy, oz, dx, dy, dz, best ? best.t : maxT);
  if (h) best = { t: h.t, head: false };
  return best;
}

// Nokta oyuncunun gövdesine yakın mı (mermi çarpışması)
export function pointNearPlayer(x, y, z, px, py, pz, extra) {
  const dy = y < py + 0.3 ? py + 0.3 - y : y > py + 1.55 ? y - (py + 1.55) : 0;
  const dx = x - px, dz = z - pz;
  const rr = 0.45 + extra;
  return dx * dx + dz * dz + dy * dy < rr * rr;
}
