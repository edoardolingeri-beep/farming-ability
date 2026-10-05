import * as THREE from 'three';
import { merge, place, rbox, vertexColorMaterial } from './geo';
import { PALETTE } from './props';
import type { CropInstancer } from './Crops';
import { ease } from '../systems/Tween';

export interface FieldDef { id: string; x: number; z: number; cols: number; rows: number; locked?: boolean }

const SPROUT = new THREE.Color('#5dbb46');
const GROWING = new THREE.Color('#a9cf45');
const RIPE = new THREE.Color('#f4c232');

/**
 * A soil bed split into plots. Each plot grows wheat on its own timer; walking
 * over a ripe plot cuts it (see Game). The crops themselves are drawn by the
 * shared CropInstancer, one block of instances per plot.
 */
export class Field {
  readonly group = new THREE.Group();
  readonly plots: { x: number; z: number; slot: number }[] = [];
  /** Per-plot pop multiplier for the cut/regrow animation. */
  private pop: number[] = [];
  private keys: number[] = [];
  private color = new THREE.Color();
  private v = new THREE.Vector3();

  constructor(readonly def: FieldDef, plotSize: number, firstSlot: number, private crops: CropInstancer) {
    const w = def.cols * plotSize, d = def.rows * plotSize;
    const parts = [place(rbox(w + 0.3, 0.26, d + 0.3, 0.14, PALETTE.soil), 0, 0.13, 0)];
    for (let c = 0; c < def.cols; c++) for (let r = 0; r < def.rows; r++) {
      const x = (c + 0.5) * plotSize - w / 2, z = (r + 0.5) * plotSize - d / 2;
      parts.push(place(rbox(plotSize * 0.86, 0.1, plotSize * 0.86, 0.12, PALETTE.soilDark), x, 0.25, z));
      this.plots.push({ x: def.x + x, z: def.z + z, slot: firstSlot + this.plots.length });
      this.pop.push(1);
      this.keys.push(-1);
    }
    const bed = new THREE.Mesh(merge(parts), vertexColorMaterial);
    bed.receiveShadow = true;
    bed.castShadow = true;
    this.group.add(bed);
    this.group.position.set(def.x, 0, def.z);
  }

  get size() {
    return this.plots.length;
  }

  /** Draws plot i at growth progress 0..1 (1 = ripe). */
  render(i: number, progress: number) {
    const p = this.plots[i];
    const pop = this.pop[i];
    const key = Math.round(progress * 100) * 1000 + Math.round(pop * 100);
    if (key === this.keys[i]) return;
    this.keys[i] = key;
    if (progress >= 1) this.color.copy(RIPE);
    else this.color.copy(SPROUT).lerp(GROWING, progress);
    const growth = progress >= 1 ? 1 : 0.15 + 0.6 * ease.outCubic(progress);
    this.v.set(p.x, 0.28, p.z);
    this.crops.write(p.slot, this.v, growth * pop, this.color);
  }

  setPop(i: number, v: number) {
    this.pop[i] = v;
  }

  /** Hides every plot (locked field). */
  hide() {
    for (const p of this.plots) this.crops.write(p.slot, this.v.set(p.x, 0.28, p.z), 0, this.color);
    this.keys.fill(-1);
  }
}
