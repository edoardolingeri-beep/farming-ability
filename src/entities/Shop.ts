import * as THREE from 'three';
import { vertexColorMaterial } from './geo';
import { makeCounterGeometry, makeShelfGeometry } from './props';
import type { Colliders } from '../scene/Terrain';
import map from '../data/map.json';
import type { ItemType } from '../systems/State';

const SHELF_LEN = 4.2;

/** Market stall: a shelf with a sign, and a checkout counter. */
export class Shop {
  readonly group = new THREE.Group();
  /** World positions where shelf stock is displayed, per product, in fill order. */
  readonly slots: Record<ItemType, THREE.Vector3[]> = { wheat: [], flour: [] };

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

    // Lower tier: wheat, three bundles per crate. Upper tier: flour, two sacks per crate.
    for (let i = 0; i < 4; i++) {
      const z = s.shelf.z - SHELF_LEN / 2 + 0.55 + i * ((SHELF_LEN - 1.1) / 3);
      for (const dz of [-0.28, 0, 0.28]) this.slots.wheat.push(new THREE.Vector3(s.shelf.x, 0.68, z + dz));
      for (const dz of [-0.2, 0.2]) this.slots.flour.push(new THREE.Vector3(s.shelf.x, 1.3, z + dz));
    }

    colliders.boxes.push(
      { minX: s.shelf.x - 0.6, maxX: s.shelf.x + 0.6, minZ: s.shelf.z - SHELF_LEN / 2 - 0.15, maxZ: s.shelf.z + SHELF_LEN / 2 + 0.15 },
      { minX: s.counter.x - 1.2, maxX: s.counter.x + 1.2, minZ: s.counter.z - 0.55, maxZ: s.counter.z + 0.55 },
    );
  }

  /** Where the n-th shelf item of a product sits. */
  slot(type: ItemType, n: number) {
    const list = this.slots[type];
    return list[Math.min(n, list.length - 1)].clone();
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
