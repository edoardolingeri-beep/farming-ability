import * as THREE from 'three';
import { vertexColorMaterial } from './geo';
import { makeCharacterParts, type Look } from './props';

/**
 * A chibi character with swinging limbs. Moves on the ground plane and turns
 * smoothly toward where it walks. Carried items hang off `hands`.
 */
export class Character {
  readonly root = new THREE.Group();
  /** Point in front of the chest where a carried stack starts. */
  readonly hands = new THREE.Group();
  private body = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private phase = Math.random() * 10;
  private heading = 0;
  /** 0..1, how fast it is moving relative to full speed (drives the walk cycle). */
  moving = 0;
  carrying = false;

  constructor(look: Look, scale = 1) {
    const p = makeCharacterParts(look);
    const mesh = (g: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(g, vertexColorMaterial);
      m.castShadow = true;
      return m;
    };
    const torso = mesh(p.torso);
    torso.position.y = 0.44;
    const head = mesh(p.head);
    head.position.y = 0.82;
    this.armL = mesh(p.arm);
    this.armR = mesh(p.arm);
    this.armL.position.set(-0.32, 0.8, 0);
    this.armR.position.set(0.32, 0.8, 0);
    this.legL = mesh(p.leg);
    this.legR = mesh(p.leg);
    this.legL.position.set(-0.13, 0.36, 0);
    this.legR.position.set(0.13, 0.36, 0);
    this.hands.position.set(0, 0.62, 0.5);
    this.body.add(torso, head, this.armL, this.armR, this.legL, this.legR, this.hands);
    this.root.add(this.body);
    this.root.scale.setScalar(scale);
  }

  get position() {
    return this.root.position;
  }

  /** Turns toward a direction on the XZ plane. */
  face(dx: number, dz: number, dt: number) {
    if (dx * dx + dz * dz < 1e-6) return;
    const target = Math.atan2(dx, dz);
    let diff = target - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, dt * 14);
    this.root.rotation.y = this.heading;
  }

  /** Walks toward `target`; returns true once there. */
  walkTo(target: { x: number; z: number }, speed: number, dt: number): boolean {
    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.moving = 0;
      return true;
    }
    const step = Math.min(dist, speed * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.face(dx, dz, dt);
    this.moving = 1;
    return dist - step < 0.05;
  }

  animate(dt: number) {
    const m = this.moving;
    this.phase += dt * (6 + 6 * m);
    const swing = Math.sin(this.phase * 1.4) * 0.75 * m;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.carrying) {
      // arms forward, holding the stack
      this.armL.rotation.x = this.armR.rotation.x = -1.25 + Math.sin(this.phase * 1.4) * 0.05 * m;
      this.armL.rotation.z = 0.25;
      this.armR.rotation.z = -0.25;
    } else {
      this.armL.rotation.x = -swing * 0.9;
      this.armR.rotation.x = swing * 0.9;
      this.armL.rotation.z = 0.08;
      this.armR.rotation.z = -0.08;
    }
    // bounce while walking, breathe while idle
    this.body.position.y = m > 0 ? Math.abs(Math.sin(this.phase * 1.4)) * 0.08 : Math.sin(this.phase * 0.5) * 0.01;
  }
}

const SKINS = ['#ffd2b0', '#f1b98f', '#c98d63', '#8d5a3b', '#ffe0c7'];
const HAIRS = ['#3b2416', '#7a4a25', '#e2b04a', '#1f1a17', '#b0b0b0', '#c4502e'];
const SHIRTS = ['#e8573f', '#4c8fd8', '#7cc95a', '#f2b632', '#a86bd1', '#ff8fb1', '#41b8a8'];
const PANTS = ['#355c9a', '#4a4a5a', '#7a5233', '#2f6d4a', '#5b6fb5'];

export function randomLook(): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS), bun: Math.random() < 0.4 };
}
