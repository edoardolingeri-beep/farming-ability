import * as THREE from 'three';
import { groundRect, paint, rng, vertexColorMaterial } from '../entities/geo';
import {
  PALETTE, makeBarrelGeometry, makeBushGeometry, makeCrateGeometry, makeCypressGeometry, makeFenceGeometry,
  makeFlowerGeometry, makeGrassTuftGeometry, makeHayGeometry, makeLilyGeometry, makeRockGeometry, makeSackGeometry,
  makeSunflowerGeometry, makeTreeGeometry,
} from '../entities/props';
import map from '../data/map.json';

interface Xform { x: number; z: number; y?: number; ry?: number; s?: number }

/** Static obstacles the player bumps into. */
export interface Colliders {
  boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  circles: { x: number; z: number; r: number }[];
}

/** One draw call for many copies of the same prop. */
export function instanced(geo: THREE.BufferGeometry, items: Xform[], castShadow = true) {
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

/** Ground, paths, pond, fence and all scattered decoration. Returns colliders. */
export function buildTerrain(scene: THREE.Scene, colliders: Colliders) {
  const rand = rng(map.decorSeed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const b = map.bounds;

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

  // Sandy paths, plus the road customers arrive on.
  const flat = [...map.paths, { x: (map.shop.gatePoint.x + 40) / 2, z: map.shop.gatePoint.z + 0.2, w: 40 - map.shop.gatePoint.x + 2, d: 2.6 }];
  flat.forEach((p, i) => {
    const m = new THREE.Mesh(groundRect(p.w, p.d, 0.7, i === flat.length - 1 ? '#c9c2b4' : PALETTE.path), vertexColorMaterial);
    m.position.set(p.x, 0.012 + i * 0.001, p.z);
    m.receiveShadow = true;
    scene.add(m);
  });

  // Pond with a sandy rim.
  const pond = map.pond;
  const rim = new THREE.Mesh(paint(new THREE.CircleGeometry(pond.r + 0.45, 28).rotateX(-Math.PI / 2), '#e9d3a2'), vertexColorMaterial);
  rim.position.set(pond.x, 0.011, pond.z);
  rim.scale.set(1.3, 1, 1);
  rim.receiveShadow = true;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pond.r, 28).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 90, specular: '#ffffff' }),
  );
  water.position.set(pond.x, 0.03, pond.z);
  water.scale.set(1.3, 1, 1);
  water.receiveShadow = true;
  scene.add(rim, water);
  colliders.circles.push({ x: pond.x - pond.r * 0.4, z: pond.z, r: pond.r }, { x: pond.x + pond.r * 0.4, z: pond.z, r: pond.r });
  const lilies: Xform[] = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2, r = rand() * pond.r * 0.7;
    lilies.push({ x: pond.x + Math.cos(a) * r * 1.3, z: pond.z + Math.sin(a) * r, y: 0.02, ry: rand() * 6, s: between(0.8, 1.2) });
  }
  scene.add(instanced(makeLilyGeometry(), lilies, false));
  const pondRocks: Xform[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
    pondRocks.push({ x: pond.x + Math.cos(a) * (pond.r + 0.35) * 1.3, z: pond.z + Math.sin(a) * (pond.r + 0.35), ry: rand() * 6, s: between(0.5, 0.9) });
  }

  // Fence around the farm with a gate where customers come in.
  const g = map.gate;
  const fences: Xform[] = [];
  for (let x = b.minX + 1; x < b.maxX; x += 2) {
    fences.push({ x, z: b.minZ });
    fences.push({ x, z: b.maxZ });
  }
  for (let z = b.minZ + 1; z < b.maxZ; z += 2) {
    fences.push({ x: b.minX, z, ry: Math.PI / 2 });
    if (z + 1 <= g.from || z - 1 >= g.to) fences.push({ x: b.maxX, z, ry: Math.PI / 2 });
  }
  scene.add(instanced(makeFenceGeometry(), fences));

  // Hand-placed props from the map file.
  const byKind = (k: string) => map.props.filter((p) => p.kind === k).map((p) => ({ x: p.x, z: p.z, ry: rand() * 6.28, s: between(0.9, 1.1) }));
  const radius: Record<string, number> = { hay: 0.6, crate: 0.45, barrel: 0.35, sack: 0.35, cypress: 0.45, round: 0.5, pine: 0.5, bush: 0.5 };
  for (const p of map.props) colliders.circles.push({ x: p.x, z: p.z, r: radius[p.kind] ?? 0.4 });

  // Keep-out zones for scattered props outside the fence.
  const outsideBlocked = (x: number, z: number, margin = 1) => {
    if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
    if (x > b.maxX - 1 && Math.abs(z - map.shop.gatePoint.z) < 3) return true; // customer road
    return false;
  };
  const scatter = (n: number, rMin: number, rMax: number, margin: number) => {
    const out: Xform[] = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 30) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(between(rMin * rMin, rMax * rMax));
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 1;
      if (!outsideBlocked(x, z, margin)) out.push({ x, z, ry: rand() * Math.PI * 2, s: between(0.85, 1.3) });
    }
    return out;
  };

  // A dense forest ring frames the farm like a valley.
  const trees = scatter(260, 15, 70, 1.6);
  scene.add(instanced(makeTreeGeometry('round'), [...trees.filter((_, i) => i % 3 !== 0), ...byKind('round')]));
  scene.add(instanced(makeTreeGeometry('pine'), [...trees.filter((_, i) => i % 3 === 0), ...byKind('pine')]));
  scene.add(instanced(makeCypressGeometry(), byKind('cypress')));
  scene.add(instanced(makeBushGeometry(), [...scatter(60, 14, 40, 1), ...byKind('bush')]));
  scene.add(instanced(makeRockGeometry(), [...scatter(25, 14, 45, 1), ...pondRocks]));
  scene.add(instanced(makeHayGeometry(), byKind('hay')));
  scene.add(instanced(makeCrateGeometry(), byKind('crate')));
  scene.add(instanced(makeBarrelGeometry(), byKind('barrel')));
  scene.add(instanced(makeSackGeometry(), byKind('sack')));

  // Small stuff: grass tufts and flowers everywhere except on paths, fields and buildings.
  const busy = (x: number, z: number) =>
    map.fields.some((f) => Math.abs(x - f.x) < (f.cols * map.plotSize) / 2 + 0.4 && Math.abs(z - f.z) < (f.rows * map.plotSize) / 2 + 0.4) ||
    Math.hypot(x - map.barn.x, z - map.barn.z) < 3.4 ||
    Math.hypot(x - map.house.x, z - map.house.z) < 3 ||
    (x > 2.6 && x < 12 && z > -3.6 && z < 4.8) ||
    Math.hypot((x - pond.x) / 1.3, z - pond.z) < pond.r + 0.6 ||
    flat.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.2 && Math.abs(z - p.z) < p.d / 2 + 0.2) ||
    map.props.some((p) => Math.hypot(x - p.x, z - p.z) < 0.7);
  const small = (n: number, range: number, sMin: number, sMax: number) => {
    const out: Xform[] = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      const x = between(-range, range), z = between(-range, range) - 1;
      if (!busy(x, z)) out.push({ x, z, ry: rand() * 6.28, s: between(sMin, sMax) });
    }
    return out;
  };
  scene.add(instanced(makeGrassTuftGeometry(), small(700, 40, 0.8, 1.5), false));
  scene.add(instanced(makeFlowerGeometry('#ffffff'), small(520, 40, 0.8, 1.3), false));
  scene.add(instanced(makeFlowerGeometry('#ffd23f'), small(160, 30, 0.8, 1.2), false));
  scene.add(instanced(makeFlowerGeometry('#ff8fb1'), small(120, 30, 0.8, 1.2), false));
  scene.add(instanced(makeFlowerGeometry('#e8453c'), small(80, 30, 0.9, 1.3), false));

  // Sunflowers along the house's garden.
  const sunflowers: Xform[] = [];
  for (let i = 0; i < 7; i++) {
    sunflowers.push({ x: map.house.x - 5.2 + i * 0.7 + between(-0.1, 0.1), z: map.house.z + 1.4 + between(-0.3, 0.3), ry: 0.6 + between(-0.2, 0.2), s: between(0.85, 1.15) });
  }
  scene.add(instanced(makeSunflowerGeometry(), sunflowers));
  colliders.boxes.push({ minX: map.house.x - 5.6, maxX: map.house.x - 0.8, minZ: map.house.z + 1.0, maxZ: map.house.z + 1.8 });
}
