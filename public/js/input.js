// Klavye + fare. Fare kilidi (pointer lock) desteklenmezse serbest fare moduna geçer.
export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.mouse = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.free = false; // kilitsiz mod (kilit desteklenmiyorsa)
    this.enabled = true;
    this.onKey = null; // (code, event) => bool (true = işlendi)
    this.onLockChange = null;
    this.onLockError = null;
    this.lockFails = 0;
    this.lockSupported = 'requestPointerLock' in target;

    this.h = {
      keydown: (e) => {
        if (!this.enabled) return;
        if (this.onKey && this.onKey(e.code, e)) { e.preventDefault(); return; }
        if (isTyping(e)) return;
        this.keys.add(e.code);
        if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      },
      keyup: (e) => { this.keys.delete(e.code); },
      mousemove: (e) => {
        if (!this.active()) return;
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      },
      mousedown: (e) => {
        if (!this.active()) return;
        if (e.button < 3) this.mouse[e.button] = true;
      },
      mouseup: (e) => { if (e.button < 3) this.mouse[e.button] = false; },
      wheel: (e) => {
        if (!this.active()) return;
        this.wheel += Math.sign(e.deltaY);
      },
      blur: () => { this.keys.clear(); this.mouse = [false, false, false]; },
      lockchange: () => {
        this.locked = document.pointerLockElement === this.target;
        if (this.locked) this.lockFails = 0;
        if (!this.locked) { this.mouse = [false, false, false]; this.keys.clear(); }
        this.onLockChange && this.onLockChange(this.locked);
      },
      lockerror: () => {
        // Esc sonrası çok hızlı tekrar denemek de hata verir; art arda hatalarda serbest moda geç
        this.lockFails++;
        if (this.lockFails >= 3) {
          this.free = true;
          this.onLockChange && this.onLockChange(true);
        } else if (this.onLockError) this.onLockError();
      },
      context: (e) => e.preventDefault(),
    };
    window.addEventListener('keydown', this.h.keydown);
    window.addEventListener('keyup', this.h.keyup);
    window.addEventListener('mousemove', this.h.mousemove);
    window.addEventListener('mousedown', this.h.mousedown);
    window.addEventListener('mouseup', this.h.mouseup);
    window.addEventListener('wheel', this.h.wheel, { passive: true });
    window.addEventListener('blur', this.h.blur);
    document.addEventListener('pointerlockchange', this.h.lockchange);
    document.addEventListener('pointerlockerror', this.h.lockerror);
    target.addEventListener('contextmenu', this.h.context);
  }

  active() { return this.locked || this.free; }

  lock() {
    if (!this.lockSupported) {
      this.free = true;
      this.onLockChange && this.onLockChange(true);
      return;
    }
    try {
      const r = this.target.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) {
        r.catch(() => {
          // unadjustedMovement desteklenmiyorsa normal kilidi dene
          const r2 = this.target.requestPointerLock();
          if (r2 && r2.catch) r2.catch(() => this.h.lockerror());
        });
      }
    } catch (e) {
      this.h.lockerror();
    }
  }

  unlock() {
    this.free = false;
    if (document.pointerLockElement) document.exitPointerLock();
    else this.onLockChange && this.onLockChange(false);
  }

  consumeMouse() {
    const r = { dx: this.dx, dy: this.dy, wheel: this.wheel };
    this.dx = this.dy = this.wheel = 0;
    return r;
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  destroy() {
    window.removeEventListener('keydown', this.h.keydown);
    window.removeEventListener('keyup', this.h.keyup);
    window.removeEventListener('mousemove', this.h.mousemove);
    window.removeEventListener('mousedown', this.h.mousedown);
    window.removeEventListener('mouseup', this.h.mouseup);
    window.removeEventListener('wheel', this.h.wheel);
    window.removeEventListener('blur', this.h.blur);
    document.removeEventListener('pointerlockchange', this.h.lockchange);
    document.removeEventListener('pointerlockerror', this.h.lockerror);
    this.target.removeEventListener('contextmenu', this.h.context);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
