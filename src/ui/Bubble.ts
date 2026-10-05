import * as THREE from 'three';

/** A single popup card that floats above a point in the 3D world. */
export class Bubble {
  private el: HTMLElement | null = null;
  private anchor = new THREE.Vector3();
  private v = new THREE.Vector3();
  /** Identifies what the bubble is attached to, e.g. "field:3". */
  owner: string | null = null;
  /** Cards are kept below this screen Y (the HUD) and inside the screen edges. */
  minTop = 80;
  private refresh: (() => void) | null = null;

  constructor(private parent: HTMLElement, private camera: THREE.Camera) {}

  show(owner: string, anchor: THREE.Vector3, content: HTMLElement, refresh?: () => void) {
    this.hide();
    this.owner = owner;
    this.anchor.copy(anchor);
    const el = document.createElement('div');
    el.className = 'bubble';
    const card = document.createElement('div');
    card.className = 'bubble-card interactive';
    card.appendChild(content);
    el.appendChild(card);
    // Taps inside the card must not reach the 3D scene.
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.parent.appendChild(el);
    this.el = el;
    this.refresh = refresh ?? null;
    this.update();
  }

  hide() {
    this.el?.remove();
    this.el = null;
    this.owner = null;
    this.refresh = null;
  }

  get visible() {
    return this.el !== null;
  }

  /** Re-projects the anchor each frame and lets the content update itself (timers). */
  update() {
    if (!this.el) return;
    this.v.copy(this.anchor).project(this.camera);
    let x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    // The card sits centred above (x, y): keep it fully on screen.
    const card = this.el.firstElementChild as HTMLElement;
    const w = card.offsetWidth, h = card.offsetHeight;
    const margin = 8;
    x = Math.min(Math.max(x, w / 2 + margin), window.innerWidth - w / 2 - margin);
    y = Math.min(Math.max(y, this.minTop + h + 18), window.innerHeight - margin);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.refresh?.();
  }
}
