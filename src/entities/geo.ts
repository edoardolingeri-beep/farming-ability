import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Low-poly "toy" geometry helpers. Every model is built from simple primitives,
 * painted with vertex colours and merged into one geometry so it can be drawn
 * with a single shared material (and instanced when repeated).
 */

/** One shared material for everything painted with vertex colours. */
export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const _color = new THREE.Color();

/** Strips a geometry down to position/normal and paints it a flat colour. */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  _color.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Applies position / rotation (radians, XYZ) / scale to a geometry in place. */
export function place(
  geo: THREE.BufferGeometry,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = sx, sz = sx,
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geo.applyMatrix4(m);
  return geo;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

// Painted primitive shortcuts ------------------------------------------------

export const rbox = (w: number, h: number, d: number, r: number, color: THREE.ColorRepresentation, seg = 3) =>
  paint(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), color);

export const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation) =>
  paint(new THREE.BoxGeometry(w, h, d), color);

export const cyl = (rt: number, rb: number, h: number, color: THREE.ColorRepresentation, seg = 12) =>
  paint(new THREE.CylinderGeometry(rt, rb, h, seg), color);

export const ball = (r: number, color: THREE.ColorRepresentation, w = 12, h = 9) =>
  paint(new THREE.SphereGeometry(r, w, h), color);

export const ico = (r: number, color: THREE.ColorRepresentation, detail = 1) =>
  paint(new THREE.IcosahedronGeometry(r, detail), color);

export const cone = (r: number, h: number, color: THREE.ColorRepresentation, seg = 6) =>
  paint(new THREE.ConeGeometry(r, h, seg), color);

/** A "house" profile (rectangle + gable) extruded along Z, centred on X/Z, base at y=0. */
export function gableBody(w: number, wallH: number, peakH: number, d: number, color: THREE.ColorRepresentation) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, wallH);
  s.lineTo(0, peakH);
  s.lineTo(-w / 2, wallH);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  g.translate(0, 0, -d / 2);
  return paint(g, color);
}

/** Two sloped roof slabs sitting on a gable body. */
export function gableRoof(
  w: number, wallH: number, peakH: number, d: number,
  color: THREE.ColorRepresentation, thickness = 0.22, overhang = 0.35,
) {
  const rise = peakH - wallH;
  const run = w / 2;
  const len = Math.hypot(rise, run) + overhang;
  const angle = Math.atan2(rise, run);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const slab = rbox(len, thickness, d + overhang * 2, 0.08, color);
    // Centre of the slab sits halfway along the slope, nudged outward by the overhang.
    const cx = side * (run / 2 + (overhang / 2) * Math.cos(angle));
    const cy = wallH + rise / 2 - (overhang / 2) * Math.sin(angle) + thickness / 2;
    place(slab, cx, cy, 0, 0, 0, -side * angle);
    parts.push(slab);
  }
  // Ridge cap
  parts.push(place(cyl(thickness * 0.7, thickness * 0.7, d + overhang * 2, color, 8), 0, peakH + thickness * 0.55, 0, Math.PI / 2));
  return merge(parts);
}

/** Flat rounded rectangle lying on the ground (y up), for paths and yards. */
export function groundRect(w: number, d: number, r: number, color: THREE.ColorRepresentation) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);
  return paint(g, color);
}

/** Small deterministic PRNG so decoration layouts are stable between sessions. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
