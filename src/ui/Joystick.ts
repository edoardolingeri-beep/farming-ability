/**
 * Floating virtual joystick: it appears wherever the first finger lands and
 * reports a direction vector (screen space, length 0..1). Two fingers pinch-zoom.
 * Arrow keys / WASD also work for desktop testing.
 */
export class Joystick {
  /** Screen-space direction, x right / y down, length 0..1. */
  readonly dir = { x: 0, y: 0 };
  private base: HTMLElement;
  private knob: HTMLElement;
  private pointers = new Map<number, { x: number; y: number }>();
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private pinchDist = 0;
  private keys = new Set<string>();
  private readonly radius = 56;

  constructor(target: HTMLElement, ui: HTMLElement, private onZoom: (factor: number) => void) {
    this.base = document.createElement('div');
    this.base.className = 'joy';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    ui.appendChild(this.base);

    target.style.touchAction = 'none';
    target.addEventListener('pointerdown', this.down);
    target.addEventListener('pointermove', this.move);
    target.addEventListener('pointerup', this.up);
    target.addEventListener('pointercancel', this.up);
    target.addEventListener('wheel', (e) => { e.preventDefault(); this.onZoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get active() {
    return this.stickId !== null || this.keys.size > 0;
  }

  /** Call once per frame (merges keyboard input). */
  update() {
    if (this.stickId !== null) return;
    let x = 0, y = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
    const l = Math.hypot(x, y) || 1;
    this.dir.x = x / l;
    this.dir.y = y / l;
  }

  private down = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.stickId = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.base.classList.add('on');
    } else if (this.pointers.size === 2) {
      // second finger: switch to pinch zoom
      this.release();
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      this.onZoom(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      // drag the base along so the stick never feels stuck
      this.ox += (dx / len) * (len - this.radius);
      this.oy += (dy / len) * (len - this.radius);
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
      this.base.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / this.radius);
    const dead = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    this.dir.x = len > 0 ? (dx / Math.hypot(dx, dy)) * dead : 0;
    this.dir.y = len > 0 ? (dy / Math.hypot(dx, dy)) * dead : 0;
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.stickId) this.release();
  };

  private release() {
    this.stickId = null;
    this.dir.x = this.dir.y = 0;
    this.base.classList.remove('on');
  }
}
