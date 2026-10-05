import * as THREE from 'three';
import { merge, place, rbox, vertexColorMaterial } from './geo';
import { PALETTE } from './props';
import type { CropInstancer } from './Crops';
import { ease, tween } from '../systems/Tween';

let soilGeo: THREE.BufferGeometry | null = null;

/** Raised soil bed with furrows; shared by every field. */
function getSoilGeometry(size: number) {
  if (soilGeo) return soilGeo;
  const parts = [place(rbox(size, 0.28, size, 0.12, PALETTE.soil), 0, 0.14, 0)];
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const z = ((i + 0.5) / rows - 0.5) * size * 0.78;
    parts.push(place(rbox(size * 0.84, 0.12, size * 0.11, 0.05, PALETTE.soilDark), 0, 0.29, z));
  }
  soilGeo = merge(parts);
  return soilGeo;
}

export interface CropColors { sprout: string; growing: string; ripe: string }

/** Visual side of a field: the soil bed plus its block of crop instances. */
export class Field {
  readonly group = new THREE.Group();
  readonly soil: THREE.Mesh;
  /** Multiplier animated by plant/harvest tweens. */
  private popScale = 1;
  private lastKey = '';
  private readonly origin = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly cs = new THREE.Color();
  private readonly cg = new THREE.Color();
  private readonly cr = new THREE.Color();

  constructor(readonly index: number, x: number, z: number, size: number, private crops: CropInstancer) {
    this.soil = new THREE.Mesh(getSoilGeometry(size), vertexColorMaterial);
    this.soil.castShadow = true;
    this.soil.receiveShadow = true;
    this.soil.userData.pick = { kind: 'field', index };
    this.group.add(this.soil);
    this.group.position.set(x, 0, z);
    this.origin.set(x, 0.3, z);
  }

  /** World point at the top of the field, for UI anchoring. */
  get top() {
    return new THREE.Vector3(this.group.position.x, 0.9, this.group.position.z);
  }

  /**
   * Redraws the crops. progress: 0..1 growth, or null when empty.
   * Cheap to call every frame: it skips work when nothing visible changed.
   */
  render(progress: number | null, colors: CropColors | null) {
    const p = progress === null ? -1 : Math.round(progress * 200) / 200;
    const key = `${p}|${this.popScale.toFixed(3)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (progress === null || !colors) {
      this.crops.write(this.index, this.origin, 0, this.color.set('#ffffff'));
      return;
    }
    this.cs.set(colors.sprout); this.cg.set(colors.growing); this.cr.set(colors.ripe);
    if (progress < 1) {
      this.color.copy(this.cs).lerp(this.cg, ease.outCubic(progress));
    } else {
      this.color.copy(this.cr);
    }
    const growth = progress >= 1 ? 1 : 0.22 + 0.58 * ease.outCubic(progress);
    this.crops.write(this.index, this.origin, growth * this.popScale, this.color);
  }

  /** Crops spring up when planted. */
  animatePlant() {
    this.popScale = 0;
    tween(0.55, (k) => { this.popScale = ease.outBack(k); });
    this.squash();
  }

  /** Crops shrink away, then `done` clears the field. */
  animateHarvest(done: () => void) {
    tween(0.22, (k) => { this.popScale = 1 - ease.inCubic(k); }, () => {
      this.popScale = 1;
      done();
    });
    this.squash();
  }

  /** Little jelly bounce of the soil bed for tap feedback. */
  squash() {
    const g = this.group;
    tween(0.4, (k) => {
      const w = Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.12;
      g.scale.set(1 + w, 1 - w * 1.5, 1 + w);
    }, () => g.scale.set(1, 1, 1));
  }
}
