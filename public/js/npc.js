// Sunucu ile istemcinin paylaştığı ayarlar: kurulabilen taretler, Anomalocaris yaratıkları,
// deniz kabuğu mayınları, trambolin ve kedi tablosu.

// Taretler (kutudan çıkan eşya ile kurulur). Sahibini hedef almaz; sahibinin hasarından etkilenmez.
export const TURRET = {
  // Mantar: havan topu gibi kavisli, patlayan mermi atar (görüş hattı gerekmez)
  mush: {
    hp: 140, life: 90, minRange: 7, range: 48, every: 2.6, dmg: 65, radius: 5, kb: 13, grav: 20,
    hit: { hw: 0.75, y1: 1.75 }, muzzleY: 1.75, lead: 0.5,
  },
  // Tullimonstrum: tabanca kadar hasar veren hızlı atışlı taret (görüş hattı gerekir)
  tully: {
    hp: 110, life: 90, range: 36, every: 0.55, dmg: 18, hs: 2, spread: 0.04, turn: 5,
    hit: { hw: 0.6, y1: 1.8 }, muzzleY: 1.3, reach: 0.95,
  },
  perOwner: 2, // fazlası kurulunca en eskisi söner
  max: 14,
};

// Anomalocaris: uçan, yalnızca yakından ısıran yaratıklar
export const CREATURE = {
  hp: 70, speed: 8.5, bite: 10, biteCd: 1.3, reach: 1.9, aggro: 80, max: 6,
  first: 25, every: [30, 50], group: [2, 3], r: 0.9,
};

// Deniz kabuğu fosili mayını: üstüne basınca patlar
export const MINE = { max: 8, first: 6, every: [9, 16], radius: 4.5, dmg: 75, kb: 15, trigger: 0.75, arm: 2 };

// Clypeaster trambolini: zıplama yüksekliği eskisinin 2,5 katı (hız √2,5 katı)
export const TRAMPOLINE = { vy: 17 * Math.sqrt(2.5), maxVy: 33, keep: 0.9 };
