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
