import * as THREE from 'three';
import { vertexColorMaterial } from './geo';
import { makeCounterGeometry, makeShelfGeometry } from './props';
import type { Colliders } from '../scene/Terrain';
import map from '../data/map.json';

const SHELF_LEN = 4.2;

/** Market stall: a shelf under a striped awning, and a checkout counter. */
export class Shop {
  readonly group = new THREE.Group();
  /** World positions where shelf stock is displayed, in fill order. */
  readonly slots: THREE.Vector3[] = [];

  constructor(colliders: Colliders) {
    const s = map.shop;
    const mesh = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, vertexColorMaterial);
      m.castShadow = m.receiveShadow = true;
      return m;
    };

    const shelf = mesh(makeShelfGeometry());
    shelf.position.set(s.shelf.x, 0, s.shelf.z);
    const counter = mesh(makeCounterGeometry());
    counter.position.set(s.counter.x, 0, s.counter.z);
    this.group.add(shelf, counter, makeSign('BOTTEGA', s.shelf.x + 0.08, 1.85, s.shelf.z));

    // Two bundles per crate, 4 crates per tier, 2 tiers; lower tier first.
    for (const y of [0.68, 1.28]) {
      for (let i = 0; i < 4; i++) {
        const z = -SHELF_LEN / 2 + 0.55 + i * ((SHELF_LEN - 1.1) / 3);
        for (const dz of [-0.2, 0.2]) this.slots.push(new THREE.Vector3(s.shelf.x, y, s.shelf.z + z + dz));
      }
    }

    colliders.boxes.push(
      { minX: s.shelf.x - 0.6, maxX: s.shelf.x + 0.6, minZ: s.shelf.z - SHELF_LEN / 2 - 0.15, maxZ: s.shelf.z + SHELF_LEN / 2 + 0.15 },
      { minX: s.counter.x - 1.2, maxX: s.counter.x + 1.2, minZ: s.counter.z - 0.55, maxZ: s.counter.z + 0.55 },
    );
  }

  /** Where the n-th shelf item sits (wraps onto a slightly higher layer when crates are full). */
  slot(n: number) {
    const base = this.slots[n % this.slots.length];
    return base.clone().setY(base.y + Math.floor(n / this.slots.length) * 0.3);
  }
}

/** Painted shop sign on the shelf's top board, facing the camera side (+X). */
function makeSign(text: string, x: number, y: number, z: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const draw = () => {
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, 512, 112);
    c.font = "86px 'Lilita One', sans-serif";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 12;
    c.strokeStyle = '#7a3b10';
    c.strokeText(text, 256, 60);
    c.fillStyle = '#ff9a1f';
    c.fillText(text, 256, 60);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  draw();
  document.fonts?.ready.then(draw);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  plane.rotation.y = Math.PI / 2;
  plane.position.set(x, y, z);
  return plane;
}
