import * as THREE from 'three';
import { ball, cyl, merge, place, rng } from './geo';

/** Shared uniform so every crop sways in the same breeze. */
export const windUniform = { value: 0 };

/** A tuft of three wheat stalks with ears. White-ish so instance colour tints it. */
function makeWheatTuft() {
  const parts: THREE.BufferGeometry[] = [];
  const stalks: [number, number, number, number][] = [
    [0, 0, 1.0, 0],
    [0.07, 0.05, 0.85, 0.12],
    [-0.06, 0.06, 0.92, -0.1],
  ];
  for (const [x, z, h, lean] of stalks) {
    parts.push(place(cyl(0.018, 0.026, 0.62 * h, '#c9d9a0', 4), x, 0.31 * h, z, lean, 0, -lean));
    parts.push(place(ball(0.06, '#ffffff', 5, 4), x - lean * 0.6 * h, 0.66 * h, z + lean * 0.6 * h, lean, 0, -lean, 1, 2.6, 1));
    // little leaf
    parts.push(place(ball(0.05, '#b8d48a', 4, 3), x + 0.05, 0.22 * h, z, 0, 0, 0.9, 0.5, 2.2, 0.35));
  }
  return merge(parts);
}

const TUFTS_PER_SIDE = 2;
export const TUFTS_PER_FIELD = TUFTS_PER_SIDE * TUFTS_PER_SIDE;

interface Slot { ox: number; oz: number; ry: number; s: number; tint: number }

/**
 * All crops of all plots live in a single InstancedMesh. Each plot owns a
 * contiguous block of TUFTS_PER_FIELD instances that it scales and tints.
 */
export class CropInstancer {
  readonly mesh: THREE.InstancedMesh;
  private slots: Slot[][] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sv = new THREE.Vector3();
  private c = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(fieldCount: number, fieldSize: number) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 iPos = instanceMatrix[3].xyz;
            float sway = sin(uWind * 1.7 + iPos.x * 0.9 + iPos.z * 0.6) * 0.07
                       + sin(uWind * 3.1 + iPos.x * 2.3) * 0.025;
            transformed.x += sway * position.y * position.y * 1.6;
            transformed.z += sway * 0.6 * position.y * position.y;
          #endif`,
        );
    };
    const total = fieldCount * TUFTS_PER_FIELD;
    this.mesh = new THREE.InstancedMesh(makeWheatTuft(), material, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // instances span the whole farm
    for (let i = 0; i < total; i++) this.mesh.setColorAt(i, this.c.set('#ffffff'));

    const rand = rng(4242);
    const inner = fieldSize * 0.62;
    for (let f = 0; f < fieldCount; f++) {
      const list: Slot[] = [];
      for (let ix = 0; ix < TUFTS_PER_SIDE; ix++) for (let iz = 0; iz < TUFTS_PER_SIDE; iz++) {
        list.push({
          ox: ((ix + 0.5) / TUFTS_PER_SIDE - 0.5) * inner + (rand() - 0.5) * 0.14,
          oz: ((iz + 0.5) / TUFTS_PER_SIDE - 0.5) * inner + (rand() - 0.5) * 0.14,
          ry: rand() * Math.PI * 2,
          s: 1.05 + rand() * 0.3,
          tint: (rand() - 0.5) * 0.08,
        });
      }
      this.slots.push(list);
      this.write(f, new THREE.Vector3(), 0, new THREE.Color('#ffffff'));
    }
  }

  /** Positions one field's tufts. scale 0 hides them. */
  write(field: number, origin: THREE.Vector3, scale: number, color: THREE.Color) {
    const base = field * TUFTS_PER_FIELD;
    const slots = this.slots[field];
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      const s = Math.max(0.0001, scale * sl.s);
      this.q.setFromAxisAngle(this.up, sl.ry);
      this.v.set(origin.x + sl.ox, origin.y, origin.z + sl.oz);
      this.sv.set(s, s, s);
      this.m.compose(this.v, this.q, this.sv);
      this.mesh.setMatrixAt(base + i, this.m);
      this.c.copy(color).offsetHSL(0, 0, sl.tint);
      this.mesh.setColorAt(base + i, this.c);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
