import * as THREE from 'three';

export interface CameraConfig {
  yawDeg: number;
  pitchDeg: number;
  startDistance: number;
  minDistance: number;
  maxDistance: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Fixed-angle isometric-style camera that pans over the ground plane and zooms. */
export class CameraRig {
  readonly target = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  distance: number;
  private readonly offsetDir = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();

  constructor(readonly camera: THREE.PerspectiveCamera, readonly cfg: CameraConfig) {
    const yaw = THREE.MathUtils.degToRad(cfg.yawDeg);
    const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.distance = cfg.startDistance;
    this.apply();
  }

  apply() {
    const b = this.cfg.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.minX, b.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.minZ, b.maxZ);
    this.distance = THREE.MathUtils.clamp(this.distance, this.cfg.minDistance, this.cfg.maxDistance);
    this.camera.position.copy(this.target).addScaledVector(this.offsetDir, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Inertia after a fling. */
  update(dt: number) {
    if (this.velocity.lengthSq() < 1e-4) return;
    this.target.addScaledVector(this.velocity, dt);
    this.velocity.multiplyScalar(Math.exp(-dt * 5));
    this.apply();
  }

  stop() {
    this.velocity.set(0, 0, 0);
  }

  /** Point on the ground (y=0) under a screen pixel. Returns false if the ray misses. */
  groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, out) !== null;
  }

  /** Zoom by a factor while keeping the ground point under (x, y) fixed on screen. */
  zoomAt(factor: number, clientX: number, clientY: number) {
    const before = new THREE.Vector3();
    const after = new THREE.Vector3();
    const hit = this.groundAt(clientX, clientY, before);
    this.distance *= factor;
    this.apply();
    if (hit && this.groundAt(clientX, clientY, after)) {
      this.target.add(before.sub(after));
      this.apply();
    }
  }
}
