import * as THREE from 'three';
import { ball, box, cone, cyl, gableBody, gableRoof, ico, merge, place, rbox } from './geo';

/**
 * Prop geometries, each merged into a single vertex-coloured BufferGeometry.
 * Built once and shared (decorations are drawn with InstancedMesh).
 */

export const PALETTE = {
  grass: '#86cf5c',
  grassDark: '#6dbb4a',
  soil: '#9b6a43',
  soilDark: '#7d5234',
  yard: '#e2c08a',
  path: '#eccf98',
  wood: '#b07a4a',
  woodDark: '#86562f',
  barnRed: '#d9473a',
  barnRoof: '#7c4c38',
  white: '#fff8ee',
  cream: '#f6e5bd',
  roofBlue: '#4c8fd8',
  water: '#4cb8ec',
  leaf: '#5cb947',
  leafLight: '#7fd35a',
  trunk: '#8a5a35',
  rock: '#b9b3a8',
  yellow: '#ffcf33',
};

export function makeBarnGeometry() {
  const W = 4.2, WALL = 2.3, PEAK = 3.6, D = 3.6;
  const parts: THREE.BufferGeometry[] = [];
  // stone foundation
  parts.push(place(rbox(W + 0.3, 0.3, D + 0.3, 0.1, '#c9bfae'), 0, 0.15, 0));
  parts.push(place(gableBody(W, WALL, PEAK, D, PALETTE.barnRed), 0, 0.3, 0));
  parts.push(place(gableRoof(W, WALL, PEAK, D, PALETTE.barnRoof), 0, 0.3, 0));
  // white corner trims
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(place(rbox(0.22, WALL, 0.22, 0.06, PALETTE.white), sx * (W / 2 + 0.02), 0.3 + WALL / 2, sz * (D / 2 + 0.02)));
  }
  // big front door with white frame + X brace (front = +Z)
  const fz = D / 2 + 0.08;
  parts.push(place(rbox(2.0, 1.85, 0.12, 0.05, PALETTE.white), 0, 0.3 + 0.95, fz));
  parts.push(place(rbox(1.7, 1.6, 0.14, 0.04, '#b5352b'), 0, 0.3 + 0.88, fz + 0.02));
  for (const s of [-1, 1]) {
    parts.push(place(box(2.25, 0.14, 0.06, PALETTE.white), 0, 0.3 + 0.88, fz + 0.1, 0, 0, s * Math.atan2(1.6, 1.7)));
  }
  // hay loft window on the gable
  parts.push(place(rbox(0.9, 0.75, 0.1, 0.05, PALETTE.white), 0, 0.3 + WALL + 0.45, fz - 0.02));
  parts.push(place(rbox(0.66, 0.52, 0.12, 0.04, '#5a3a2a'), 0, 0.3 + WALL + 0.45, fz));
  // a little hay poking out of the loft
  parts.push(place(ball(0.3, PALETTE.yellow, 7, 5), 0, 0.3 + WALL + 0.25, fz + 0.12, 0, 0, 0, 1.1, 0.5, 0.6));
  return merge(parts);
}

export function makeHouseGeometry() {
  const W = 3.4, WALL = 2.1, PEAK = 3.3, D = 3.0;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(place(rbox(W + 0.3, 0.28, D + 0.3, 0.1, '#cdbfa8'), 0, 0.14, 0));
  parts.push(place(gableBody(W, WALL, PEAK, D, PALETTE.cream), 0, 0.28, 0));
  parts.push(place(gableRoof(W, WALL, PEAK, D, PALETTE.roofBlue, 0.22, 0.3), 0, 0.28, 0));
  // chimney
  parts.push(place(rbox(0.45, 1.0, 0.45, 0.06, '#c8674b'), 0.85, 0.28 + PEAK - 0.1, -0.6));
  const fz = D / 2 + 0.08;
  // door
  parts.push(place(rbox(0.8, 1.35, 0.12, 0.08, '#9a6338'), 0, 0.28 + 0.68, fz));
  parts.push(place(ball(0.06, PALETTE.yellow, 6, 4), 0.25, 0.28 + 0.7, fz + 0.08));
  // windows with shutters
  for (const sx of [-1, 1]) {
    parts.push(place(rbox(0.7, 0.62, 0.1, 0.05, '#ffffff'), sx * 1.05, 0.28 + 1.25, fz - 0.02));
    parts.push(place(rbox(0.52, 0.46, 0.12, 0.04, '#8fd0f5'), sx * 1.05, 0.28 + 1.25, fz));
    parts.push(place(rbox(0.18, 0.64, 0.08, 0.04, PALETTE.roofBlue), sx * 1.05 - 0.48, 0.28 + 1.25, fz));
    parts.push(place(rbox(0.18, 0.64, 0.08, 0.04, PALETTE.roofBlue), sx * 1.05 + 0.48, 0.28 + 1.25, fz));
  }
  // flower boxes
  for (const sx of [-1, 1]) {
    parts.push(place(rbox(0.75, 0.16, 0.2, 0.05, '#9a6338'), sx * 1.05, 0.28 + 0.88, fz + 0.12));
    for (let i = -1; i <= 1; i++) {
      parts.push(place(ball(0.09, i === 0 ? '#ff6f91' : '#ffd23f', 6, 4), sx * 1.05 + i * 0.22, 0.28 + 1.0, fz + 0.14));
    }
  }
  return merge(parts);
}

/** Two variants: round-crown tree and pine. */
export function makeTreeGeometry(variant: 'round' | 'pine') {
  if (variant === 'pine') {
    return merge([
      place(cyl(0.16, 0.22, 0.8, PALETTE.trunk, 6), 0, 0.4, 0),
      place(cone(1.1, 1.4, '#3e9a4a', 7), 0, 1.3, 0),
      place(cone(0.85, 1.2, '#4bab50', 7), 0, 2.0, 0),
      place(cone(0.55, 1.0, '#5cbc58', 7), 0, 2.6, 0),
    ]);
  }
  return merge([
    place(cyl(0.16, 0.24, 1.1, PALETTE.trunk, 6), 0, 0.55, 0),
    place(ico(0.95, PALETTE.leaf, 1), 0, 1.75, 0),
    place(ico(0.65, PALETTE.leafLight, 1), 0.45, 2.05, 0.3),
    place(ico(0.55, '#6ac64e', 1), -0.45, 1.6, 0.35),
  ]);
}

export function makeBushGeometry() {
  return merge([
    place(ico(0.5, PALETTE.leaf, 1), 0, 0.35, 0),
    place(ico(0.38, PALETTE.leafLight, 1), 0.4, 0.3, 0.1),
    place(ico(0.32, '#6ac64e', 1), -0.35, 0.25, 0.15),
    place(ball(0.07, '#ff6f91', 5, 4), 0.1, 0.78, 0.25),
    place(ball(0.07, '#ff6f91', 5, 4), -0.3, 0.55, 0.38),
    place(ball(0.07, '#ffffff', 5, 4), 0.45, 0.6, 0.3),
  ]);
}

export function makeRockGeometry() {
  return merge([
    place(ico(0.4, PALETTE.rock, 0), 0, 0.15, 0, 0.3, 0.4, 0, 1, 0.6, 1),
    place(ico(0.25, '#cfc9be', 0), 0.35, 0.1, 0.1, 0.1, 1, 0, 1, 0.7, 1),
  ]);
}

/** One fence section: 2 m long along X, posts at both ends. */
export function makeFenceGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-1, 1]) {
    parts.push(place(rbox(0.2, 0.9, 0.2, 0.05, PALETTE.wood), x, 0.45, 0));
    parts.push(place(cone(0.15, 0.15, PALETTE.wood, 4), x, 0.97, 0, 0, Math.PI / 4));
  }
  parts.push(place(rbox(2.0, 0.14, 0.08, 0.04, PALETTE.woodDark), 0, 0.68, 0));
  parts.push(place(rbox(2.0, 0.14, 0.08, 0.04, PALETTE.woodDark), 0, 0.36, 0));
  return merge(parts);
}

export function makeSunflowerGeometry() {
  const parts: THREE.BufferGeometry[] = [
    place(cyl(0.035, 0.05, 1.3, '#4f9e3a', 5), 0, 0.65, 0),
    place(ball(0.14, PALETTE.leaf, 5, 3), 0.12, 0.5, 0, 0, 0, 0.6, 1.2, 0.35, 0.7),
    place(ball(0.14, PALETTE.leaf, 5, 3), -0.12, 0.75, 0, 0, 0, -0.6, 1.2, 0.35, 0.7),
  ];
  // flower head faces +Z, tilted slightly up
  const head = merge([
    place(cyl(0.34, 0.34, 0.06, '#ffc928', 12), 0, 0, 0, Math.PI / 2),
    place(cyl(0.17, 0.17, 0.09, '#6b3f1f', 10), 0, 0, 0.02, Math.PI / 2),
  ]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(place(ball(0.12, '#ffb81c', 5, 3), Math.cos(a) * 0.36, 1.35 + Math.sin(a) * 0.36, 0.02, 0, 0, a, 1, 0.5, 0.3));
  }
  parts.push(place(head, 0, 1.35, 0));
  return merge(parts);
}

export function makeFlowerGeometry(color: string) {
  return merge([
    place(cyl(0.015, 0.015, 0.16, '#4f9e3a', 3), 0, 0.08, 0),
    place(ball(0.06, color, 5, 3), 0, 0.17, 0, 0, 0, 0, 1, 0.55, 1),
    place(ball(0.025, '#ffd23f', 4, 3), 0, 0.2, 0),
  ]);
}

export function makeGrassTuftGeometry() {
  return merge([
    place(cone(0.06, 0.32, PALETTE.grassDark, 3), 0, 0.16, 0, 0, 0, 0.2),
    place(cone(0.05, 0.26, '#79c552', 3), 0.07, 0.13, 0.03, 0, 0, -0.3),
    place(cone(0.05, 0.22, '#79c552', 3), -0.06, 0.11, 0.04, 0.3, 0, 0.1),
  ]);
}

export function makeLilyGeometry() {
  return merge([
    place(cyl(0.28, 0.28, 0.03, '#5cbf5a', 9), 0, 0.02, 0),
    place(ball(0.07, '#ff9cc2', 5, 3), 0.08, 0.08, 0.05),
  ]);
}

// ---------------------------------------------------------------- farm clutter

export function makeHayGeometry() {
  return merge([
    place(cyl(0.55, 0.55, 0.9, '#f2c94c', 14), 0, 0.55, 0, 0, 0, Math.PI / 2),
    place(cyl(0.42, 0.42, 0.92, '#e5b83a', 14), 0, 0.55, 0, 0, 0, Math.PI / 2),
    place(cyl(0.56, 0.56, 0.08, '#c98f2a', 14), 0.22, 0.55, 0, 0, 0, Math.PI / 2),
    place(cyl(0.56, 0.56, 0.08, '#c98f2a', 14), -0.22, 0.55, 0, 0, 0, Math.PI / 2),
  ]);
}

export function makeCrateGeometry() {
  return merge([
    rbox(0.8, 0.6, 0.6, 0.05, '#c58a52'),
    place(box(0.82, 0.08, 0.62, '#9c6a3a'), 0, 0.18, 0),
    place(box(0.82, 0.08, 0.62, '#9c6a3a'), 0, -0.18, 0),
  ].map((g) => place(g, 0, 0.3, 0)));
}

export function makeBarrelGeometry() {
  return merge([
    place(cyl(0.34, 0.3, 0.8, '#b97a45', 12), 0, 0.4, 0),
    place(cyl(0.36, 0.36, 0.07, '#7a7f87', 12), 0, 0.15, 0),
    place(cyl(0.36, 0.36, 0.07, '#7a7f87', 12), 0, 0.65, 0),
    place(cyl(0.3, 0.3, 0.02, '#8f5a2e', 12), 0, 0.805, 0),
  ]);
}

export function makeSackGeometry() {
  return merge([
    place(ball(0.38, '#e8d3a8', 9, 7), 0, 0.32, 0, 0, 0, 0, 1, 0.9, 0.85),
    place(cyl(0.12, 0.2, 0.18, '#e8d3a8', 8), 0, 0.68, 0),
    place(cyl(0.13, 0.13, 0.05, '#d9483b', 8), 0, 0.64, 0),
  ]);
}

export function makeCypressGeometry() {
  return merge([
    place(cyl(0.12, 0.16, 0.5, PALETTE.trunk, 6), 0, 0.25, 0),
    place(ball(0.6, '#4aa84e', 8, 7), 0, 1.7, 0, 0, 0, 0, 1, 2.6, 1),
    place(ball(0.42, '#5ec05a', 7, 6), 0.12, 2.2, 0.2, 0, 0, 0, 1, 2.2, 1),
  ]);
}

// ---------------------------------------------------------------- items

/** A tied sheaf of wheat: the item the player carries. ~0.5 wide, 0.3 tall when lying down. */
export function makeWheatBundleGeometry() {
  const parts: THREE.BufferGeometry[] = [
    place(cyl(0.16, 0.16, 0.62, '#f4c63a', 9), 0, 0, 0, 0, 0, Math.PI / 2),
    place(cyl(0.165, 0.165, 0.09, '#d9483b', 9), 0, 0, 0, 0, 0, Math.PI / 2),
  ];
  // fluffy ears at one end
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(place(ball(0.09, '#ffd95a', 6, 4), 0.33, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0, 0, 0, 1.6, 0.8, 0.8));
  }
  parts.push(place(ball(0.1, '#ffe27a', 6, 4), 0.38, 0, 0, 0, 0, 0, 1.6, 0.9, 0.9));
  return merge(parts);
}

export function makeCoinGeometry() {
  return merge([
    cyl(0.2, 0.2, 0.07, '#e9a215', 16),
    place(cyl(0.15, 0.15, 0.075, '#ffd23a', 16), 0, 0.002, 0),
  ]);
}

// ---------------------------------------------------------------- shop

/** Open wooden rack, long side along Z, with crates the stock sits in. Front faces -X. */
export function makeShelfGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const L = 4.2;
  for (const z of [-L / 2, L / 2]) for (const x of [-0.45, 0.45]) {
    parts.push(place(rbox(0.14, 1.5, 0.14, 0.04, PALETTE.woodDark), x, 0.75, z));
  }
  for (const y of [0.35, 0.95]) {
    parts.push(place(rbox(1.05, 0.1, L + 0.2, 0.04, PALETTE.wood), 0, y, 0));
    for (let i = 0; i < 4; i++) {
      const z = -L / 2 + 0.55 + i * ((L - 1.1) / 3);
      parts.push(place(rbox(0.9, 0.22, 0.95, 0.04, '#d9a46a'), 0, y + 0.16, z));
    }
  }
  // sign board on top
  parts.push(place(rbox(0.12, 0.7, 2.6, 0.08, '#2f8a3a'), 0, 1.85, 0));
  parts.push(place(rbox(0.14, 0.52, 2.4, 0.06, '#fff2c6'), 0, 1.85, 0));
  return merge(parts);
}

/** Checkout counter, long side along X. */
export function makeCounterGeometry() {
  return merge([
    place(rbox(2.2, 0.9, 0.9, 0.08, '#9a4b2f'), 0, 0.45, 0),
    place(rbox(2.35, 0.1, 1.0, 0.04, '#6e3420'), 0, 0.93, 0),
    // cash register
    place(rbox(0.55, 0.32, 0.45, 0.06, '#3a9ad9'), -0.45, 1.13, 0),
    place(rbox(0.5, 0.18, 0.06, 0.03, '#2b6fa3'), -0.45, 1.34, -0.15, -0.5),
    place(rbox(0.16, 0.08, 0.2, 0.02, '#ffd23a'), -0.45, 1.32, 0.12),
    // a basket
    place(rbox(0.5, 0.3, 0.4, 0.06, '#e3b062'), 0.5, 1.12, 0),
  ]);
}

// ---------------------------------------------------------------- characters

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hat?: boolean;
  bun?: boolean;
}

/** Chibi body parts; each limb is its own mesh so it can swing. Origins sit at the joints. */
export function makeCharacterParts(look: Look) {
  const torso = merge([
    place(rbox(0.5, 0.42, 0.32, 0.12, look.shirt), 0, 0.21, 0),
    place(rbox(0.52, 0.26, 0.34, 0.1, look.pants), 0, 0.02, 0),
    // overall straps
    place(box(0.06, 0.4, 0.34, look.pants), -0.14, 0.2, 0),
    place(box(0.06, 0.4, 0.34, look.pants), 0.14, 0.2, 0),
  ]);
  const headParts: THREE.BufferGeometry[] = [
    place(ball(0.3, look.skin, 12, 10), 0, 0.3, 0),
    place(ball(0.045, '#2a1a12', 6, 4), -0.1, 0.33, 0.27),
    place(ball(0.045, '#2a1a12', 6, 4), 0.1, 0.33, 0.27),
    place(ball(0.05, '#ff9b8a', 6, 4), -0.17, 0.24, 0.24, 0, 0, 0, 1, 0.6, 0.4),
    place(ball(0.05, '#ff9b8a', 6, 4), 0.17, 0.24, 0.24, 0, 0, 0, 1, 0.6, 0.4),
    // hair cap (back + top)
    place(ball(0.32, look.hair, 12, 8), 0, 0.36, -0.05, 0, 0, 0, 1, 0.95, 0.95),
    place(ball(0.2, look.hair, 8, 6), 0, 0.5, 0.12, 0, 0, 0, 1.4, 0.45, 0.8),
  ];
  if (look.bun) headParts.push(place(ball(0.14, look.hair, 8, 6), 0, 0.55, -0.26));
  if (look.hat) {
    headParts.push(place(cyl(0.4, 0.4, 0.05, '#f0cf6c', 16), 0, 0.55, -0.03, -0.18));
    headParts.push(place(cyl(0.22, 0.27, 0.2, '#f0cf6c', 12), 0, 0.66, -0.05, -0.18));
    headParts.push(place(cyl(0.275, 0.275, 0.06, '#d9483b', 12), 0, 0.6, -0.04, -0.18));
  }
  const head = merge(headParts);
  const arm = merge([
    place(rbox(0.13, 0.36, 0.13, 0.06, look.shirt), 0, -0.16, 0),
    place(ball(0.075, look.skin, 6, 5), 0, -0.36, 0),
  ]);
  const leg = merge([
    place(rbox(0.15, 0.3, 0.16, 0.06, look.pants), 0, -0.15, 0),
    place(rbox(0.17, 0.09, 0.24, 0.04, '#5a3a24'), 0, -0.31, 0.04),
  ]);
  return { torso, head, arm, leg };
}

// ---------------------------------------------------------------- mill & flour

export function makeFlourSackGeometry() {
  return merge([
    place(ball(0.26, '#fbf6ea', 12, 9), 0, 0, 0, 0, 0, 0, 1.15, 0.62, 0.85),
    place(cyl(0.07, 0.12, 0.12, '#fbf6ea', 8), 0.3, 0, 0, 0, 0, Math.PI / 2),
    place(cyl(0.075, 0.075, 0.04, '#d9483b', 8), 0.27, 0, 0, 0, 0, Math.PI / 2),
    place(ball(0.09, '#f2c94c', 8, 6), -0.05, 0.13, 0.12, 0, 0, 0, 1, 0.4, 1),
  ]);
}

/** Stone windmill tower; the sails are a separate geometry so they can turn. Door faces +Z. */
export function makeMillTowerGeometry() {
  const parts: THREE.BufferGeometry[] = [
    place(cyl(1.15, 1.35, 3.0, '#efe3c8', 16), 0, 1.5, 0),
    place(cyl(1.38, 1.42, 0.35, '#b9ae98', 16), 0, 0.17, 0),
    place(cyl(1.2, 1.2, 0.12, '#c8674b', 16), 0, 3.02, 0),
    place(cone(1.45, 1.5, '#d9483b', 16), 0, 3.8, 0),
    place(ball(0.14, '#ffd23a', 8, 6), 0, 4.6, 0),
    // door + windows
    place(rbox(0.75, 1.15, 0.2, 0.1, '#9a6338'), 0, 0.72, 1.28),
    place(rbox(0.42, 0.42, 0.12, 0.08, '#8fd0f5'), 0, 2.15, 1.18),
    place(rbox(0.42, 0.42, 0.12, 0.08, '#8fd0f5'), 1.18, 1.9, 0, 0, Math.PI / 2),
  ];
  return merge(parts);
}

export function makeMillSailsGeometry() {
  const parts: THREE.BufferGeometry[] = [place(cyl(0.2, 0.2, 0.2, '#6b4a2f', 10), 0, 0, 0, Math.PI / 2)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = merge([
      place(rbox(0.12, 2.2, 0.08, 0.03, '#7a5233'), 0, 1.2, 0),
      place(rbox(0.6, 1.7, 0.04, 0.03, '#fff8ee'), 0.32, 1.4, 0.02),
      place(box(0.62, 0.05, 0.06, '#a8865f'), 0.32, 0.95, 0.04),
      place(box(0.62, 0.05, 0.06, '#a8865f'), 0.32, 1.45, 0.04),
      place(box(0.62, 0.05, 0.06, '#a8865f'), 0.32, 1.95, 0.04),
    ]);
    parts.push(place(blade, 0, 0, 0.08, 0, 0, a));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- chicken

export function makeChickenGeometry() {
  return merge([
    place(ball(0.26, '#ffffff', 10, 8), 0, 0.32, 0, 0, 0, 0, 1, 0.9, 1.25),
    place(ball(0.16, '#ffffff', 10, 8), 0, 0.58, 0.2),
    place(cone(0.06, 0.12, '#ffb020', 6), 0, 0.57, 0.38, Math.PI / 2),
    place(ball(0.06, '#e8453c', 6, 4), 0, 0.74, 0.2, 0, 0, 0, 0.7, 1, 1.4),
    place(ball(0.04, '#e8453c', 6, 4), 0, 0.5, 0.33),
    place(ball(0.025, '#222222', 5, 4), -0.09, 0.62, 0.32),
    place(ball(0.025, '#222222', 5, 4), 0.09, 0.62, 0.32),
    place(ball(0.12, '#f2f2f2', 8, 6), 0, 0.42, -0.3, 0.6, 0, 0, 0.8, 1, 0.6),
    place(ball(0.1, '#f5f5f5', 8, 6), -0.24, 0.34, -0.02, 0, 0, 0.3, 0.4, 0.8, 1.1),
    place(ball(0.1, '#f5f5f5', 8, 6), 0.24, 0.34, -0.02, 0, 0, -0.3, 0.4, 0.8, 1.1),
    place(cyl(0.02, 0.02, 0.14, '#ffb020', 4), -0.08, 0.07, 0),
    place(cyl(0.02, 0.02, 0.14, '#ffb020', 4), 0.08, 0.07, 0),
  ]);
}
