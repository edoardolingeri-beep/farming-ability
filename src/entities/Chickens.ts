import * as THREE from 'three';
import { vertexColorMaterial } from './geo';
import { makeChickenGeometry } from './props';

interface Hen { mesh: THREE.Mesh; target: THREE.Vector3; wait: number; peck: number; heading: number }

/** A few hens wandering and pecking around a spot. Pure decoration. */
export class Chickens {
  readonly group = new THREE.Group();
  private hens: Hen[] = [];

  constructor(private cx: number, private cz: number, count: number, private radius: number) {
    const geo = makeChickenGeometry();
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, vertexColorMaterial);
      mesh.castShadow = true;
      mesh.scale.setScalar(0.85 + Math.random() * 0.3);
      mesh.position.copy(this.randomPoint());
      this.group.add(mesh);
      this.hens.push({ mesh, target: this.randomPoint(), wait: Math.random() * 2, peck: 0, heading: Math.random() * 6 });
    }
  }

  private randomPoint() {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius;
    return new THREE.Vector3(this.cx + Math.cos(a) * r, 0, this.cz + Math.sin(a) * r);
  }

  /** `avoid`: the player position; hens scurry away when it gets close. */
  update(dt: number, avoid: THREE.Vector3) {
    for (const h of this.hens) {
      const p = h.mesh.position;
      const away = Math.hypot(p.x - avoid.x, p.z - avoid.z);
      if (away < 1.3) {
        h.target.set(p.x + (p.x - avoid.x) * 2, 0, p.z + (p.z - avoid.z) * 2);
        h.wait = 0;
      }
      const dx = h.target.x - p.x, dz = h.target.z - p.z, d = Math.hypot(dx, dz);
      if (h.wait > 0) {
        h.wait -= dt;
        // peck: dip forward now and then
        h.peck += dt * 9;
        h.mesh.rotation.x = Math.max(0, Math.sin(h.peck)) * 0.5;
        if (h.wait <= 0) h.target.copy(this.randomPoint());
      } else if (d < 0.1) {
        h.wait = 1 + Math.random() * 3;
      } else {
        const speed = away < 2 ? 2.6 : 1.1;
        const step = Math.min(d, speed * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        const want = Math.atan2(dx, dz);
        h.heading += Math.atan2(Math.sin(want - h.heading), Math.cos(want - h.heading)) * Math.min(1, dt * 10);
        h.mesh.rotation.set(0, h.heading, 0);
        p.y = Math.abs(Math.sin(performance.now() / 70 + p.x)) * 0.05;
      }
    }
  }
}
