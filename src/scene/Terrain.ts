import * as THREE from 'three';
import { groundRect, paint, rng, vertexColorMaterial } from '../entities/geo';
import {
  PALETTE, makeBushGeometry, makeFenceGeometry, makeFlowerGeometry, makeGrassTuftGeometry,
  makeLilyGeometry, makeRockGeometry, makeSunflowerGeometry, makeTreeGeometry,
} from '../entities/props';
import map from '../data/map.json';

interface Xform { x: number; z: number; y?: number; ry?: number; s?: number }

/** One draw call for many copies of the same prop. */
function instanced(geo: THREE.BufferGeometry, items: Xform[], castShadow = true) {
  const mesh = new THREE.InstancedMesh(geo, vertexColorMaterial, Math.max(1, items.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    q.setFromAxisAngle(up, it.ry ?? 0);
    m.compose(new THREE.Vector3(it.x, it.y ?? 0, it.z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = items.length;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Ground, yard, paths, pond, fence and all scattered decoration. */
export function buildTerrain(scene: THREE.Scene) {
  const rand = rng(map.decorSeed);
  const between = (a: number, b: number) => a + rand() * (b - a);

  // Grass with gentle colour variation baked into vertex colours.
  const groundGeo = paint(new THREE.PlaneGeometry(220, 220, 88, 88).rotateX(-Math.PI / 2), PALETTE.grass);
  const col = groundGeo.getAttribute('color') as THREE.BufferAttribute;
  const pos = groundGeo.getAttribute('position') as THREE.BufferAttribute;
  const c = new THREE.Color();
  const light = new THREE.Color('#9bdc68'), dark = new THREE.Color(PALETTE.grassDark);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = Math.sin(x * 0.23) * Math.cos(z * 0.19) + Math.sin((x + z) * 0.11) * 0.6;
    c.set(PALETTE.grass).lerp(n > 0 ? light : dark, Math.min(1, Math.abs(n) * 0.35));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  const ground = new THREE.Mesh(groundGeo, vertexColorMaterial);
  ground.receiveShadow = true;
  scene.add(ground);

  // Packed-dirt yard under the fields and sandy paths.
  const flat: THREE.Mesh[] = [];
  const yard = new THREE.Mesh(groundRect(map.yard.w, map.yard.d, 0.9, PALETTE.yard), vertexColorMaterial);
  yard.position.set(map.yard.x, 0.02, map.yard.z);
  flat.push(yard);
  for (const p of map.paths) {
    const m = new THREE.Mesh(groundRect(p.w, p.d, 0.7, PALETTE.path), vertexColorMaterial);
    m.position.set(p.x, 0.015, p.z);
    flat.push(m);
  }
  for (const m of flat) { m.receiveShadow = true; scene.add(m); }

  // Pond with a sandy rim.
  const pond = map.pond;
  const rim = new THREE.Mesh(paint(new THREE.CircleGeometry(pond.r + 0.45, 28).rotateX(-Math.PI / 2), '#e9d3a2'), vertexColorMaterial);
  rim.position.set(pond.x, 0.012, pond.z);
  rim.scale.set(1.25, 1, 1);
  rim.receiveShadow = true;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pond.r, 28).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 90, specular: '#ffffff' }),
  );
  water.position.set(pond.x, 0.03, pond.z);
  water.scale.set(1.25, 1, 1);
  water.receiveShadow = true;
  scene.add(rim, water);
  const lilies: Xform[] = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, r = rand() * pond.r * 0.7;
    lilies.push({ x: pond.x + Math.cos(a) * r * 1.25, z: pond.z + Math.sin(a) * r, y: 0.02, ry: rand() * 6, s: between(0.8, 1.2) });
  }
  scene.add(instanced(makeLilyGeometry(), lilies, false));
  const pondRocks: Xform[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
    pondRocks.push({ x: pond.x + Math.cos(a) * (pond.r + 0.35) * 1.25, z: pond.z + Math.sin(a) * (pond.r + 0.35), ry: rand() * 6, s: between(0.5, 0.9) });
  }

  // Fence around the farm with a gate gap at the front.
  const f = map.fence;
  const fences: Xform[] = [];
  for (let x = f.minX + 1; x < f.maxX; x += 2) {
    fences.push({ x, z: f.minZ });
    if (Math.abs(x - f.gateX) > 1.5) fences.push({ x, z: f.maxZ });
  }
  for (let z = f.minZ + 1; z < f.maxZ; z += 2) {
    fences.push({ x: f.minX, z, ry: Math.PI / 2 });
    fences.push({ x: f.maxX, z, ry: Math.PI / 2 });
  }
  scene.add(instanced(makeFenceGeometry(), fences));

  // Keep-out zones for scattered props.
  const blocked = (x: number, z: number, margin = 1) => {
    if (x > f.minX - margin && x < f.maxX + margin && z > f.minZ - margin && z < f.maxZ + margin) return true;
    if (Math.hypot((x - pond.x) / 1.25, z - pond.z) < pond.r + 1.2) return true;
    if (Math.abs(x - f.gateX) < 2 && z > f.maxZ && z < f.maxZ + 14) return true; // road out of the gate
    return false;
  };
  const scatter = (n: number, rMin: number, rMax: number, margin: number) => {
    const out: Xform[] = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 30) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(between(rMin * rMin, rMax * rMax));
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 3;
      if (!blocked(x, z, margin)) out.push({ x, z, ry: rand() * Math.PI * 2, s: between(0.85, 1.25) });
    }
    return out;
  };

  // Trees: dense ring outside the fence (frames the farm like a valley).
  const trees = scatter(150, 15, 70, 2.2);
  const inner = (kind: string) => map.trees.filter((t) => t.kind === kind).map((t) => ({ x: t.x, z: t.z, ry: rand() * 6.28, s: between(0.9, 1.1) }));
  scene.add(instanced(makeTreeGeometry('round'), [...trees.filter((_, i) => i % 3 !== 0), ...inner('round')]));
  scene.add(instanced(makeTreeGeometry('pine'), [...trees.filter((_, i) => i % 3 === 0), ...inner('pine')]));
  scene.add(instanced(makeBushGeometry(), scatter(40, 14, 40, 1.2)));
  scene.add(instanced(makeRockGeometry(), [...scatter(25, 14, 45, 1), ...pondRocks]));

  // Small stuff: grass tufts + daisies everywhere, also inside the fence.
  const smallBlocked = (x: number, z: number) =>
    Math.abs(x - map.yard.x) < map.yard.w / 2 + 0.4 && Math.abs(z - map.yard.z) < map.yard.d / 2 + 0.4 ||
    Math.hypot(x - map.barn.x, z - map.barn.z) < 3.4 ||
    Math.hypot(x - map.house.x, z - map.house.z) < 3 ||
    Math.hypot((x - pond.x) / 1.25, z - pond.z) < pond.r + 0.6 ||
    map.trees.some((t) => Math.hypot(x - t.x, z - t.z) < 0.6) ||
    map.paths.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.2 && Math.abs(z - p.z) < p.d / 2 + 0.2);
  const small = (n: number, range: number, sMin: number, sMax: number) => {
    const out: Xform[] = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      const x = between(-range, range), z = between(-range, range) - 3;
      if (!smallBlocked(x, z)) out.push({ x, z, ry: rand() * 6.28, s: between(sMin, sMax) });
    }
    return out;
  };
  scene.add(instanced(makeGrassTuftGeometry(), small(500, 40, 0.8, 1.5), false));
  scene.add(instanced(makeFlowerGeometry('#ffffff'), small(420, 40, 0.8, 1.3), false));
  scene.add(instanced(makeFlowerGeometry('#ffd23f'), small(120, 30, 0.8, 1.2), false));
  scene.add(instanced(makeFlowerGeometry('#ff8fb1'), small(80, 30, 0.8, 1.2), false));

  // Sunflowers along the house's garden.
  const sunflowers: Xform[] = [];
  for (let i = 0; i < 7; i++) {
    sunflowers.push({ x: map.house.x - 4.8 + i * 0.75 + between(-0.1, 0.1), z: map.house.z + 1.2 + between(-0.3, 0.3), ry: 0.6 + between(-0.2, 0.2), s: between(0.85, 1.15) });
  }
  scene.add(instanced(makeSunflowerGeometry(), sunflowers));
}
