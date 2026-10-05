import * as THREE from 'three';
import type { CameraRig } from './CameraRig';

const TAP_SLOP_PX = 10;
const TAP_MAX_MS = 600;

/**
 * Touch / mouse controls: one finger pans (the ground point under the finger
 * stays under it), two fingers pinch-zoom, a short still press is a tap.
 */
export class Input {
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: 'none' | 'press' | 'pan' | 'pinch' = 'none';
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private anchor = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private pinchDist = 0;
  private samples: { t: number; x: number; z: number }[] = [];

  constructor(
    private el: HTMLElement,
    private rig: CameraRig,
    private onTap: (x: number, y: number) => void,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    // iOS Safari page-zoom gestures
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.rig.stop();
    if (this.pointers.size === 1) {
      this.mode = 'press';
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downTime = performance.now();
      this.startPan(e.clientX, e.clientY);
    } else if (this.pointers.size === 2) {
      this.mode = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.startPan((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  };

  private startPan(x: number, y: number) {
    this.rig.groundAt(x, y, this.anchor);
    this.samples.length = 0;
  }

  /** Moves the camera so the anchored ground point sits under (x, y). */
  private dragTo(x: number, y: number) {
    if (!this.rig.groundAt(x, y, this.tmp)) return;
    this.rig.target.add(this.anchor.clone().sub(this.tmp));
    this.rig.apply();
    const t = performance.now();
    this.samples.push({ t, x: this.rig.target.x, z: this.rig.target.z });
    while (this.samples.length > 2 && t - this.samples[0].t > 120) this.samples.shift();
  }

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.mode === 'press' && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > TAP_SLOP_PX) {
      this.mode = 'pan';
    }
    if (this.mode === 'pan') {
      this.dragTo(e.clientX, e.clientY);
    } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.rig.distance *= this.pinchDist / dist;
      this.pinchDist = dist;
      this.rig.apply();
      this.dragTo(mx, my);
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'press' && e.type === 'pointerup' && performance.now() - this.downTime < TAP_MAX_MS) {
      this.onTap(e.clientX, e.clientY);
    }
    if (this.pointers.size === 1) {
      // Lifted one finger of a pinch: keep panning with the other.
      const [p] = [...this.pointers.values()];
      this.mode = 'pan';
      this.startPan(p.x, p.y);
    } else if (this.pointers.size === 0) {
      if (this.mode === 'pan' && this.samples.length >= 2) {
        const a = this.samples[0], b = this.samples[this.samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0.01 && performance.now() - b.t < 80) {
          this.rig.velocity.set((b.x - a.x) / dt, 0, (b.z - a.z) / dt);
          if (this.rig.velocity.length() > 60) this.rig.velocity.setLength(60);
        }
      }
      this.mode = 'none';
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.rig.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
  };
}
