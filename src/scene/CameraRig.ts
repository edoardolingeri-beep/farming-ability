import * as THREE from 'three';

export interface CameraConfig {
  yawDeg: number;
  pitchDeg: number;
  startDistance: number;
  minDistance: number;
  maxDistance: number;
}

/** Fixed-angle isometric-style camera that smoothly follows a target and zooms. */
export class CameraRig {
  readonly target = new THREE.Vector3();
  distance: number;
  private readonly offsetDir = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  /** Unit vectors of the screen's right / down directions projected on the ground. */
  readonly screenRight = new THREE.Vector3();
  readonly screenDown = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, readonly cfg: CameraConfig) {
    const yaw = THREE.MathUtils.degToRad(cfg.yawDeg);
    const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
    this.offsetDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.screenDown.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.screenRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.distance = cfg.startDistance;
    this.apply();
  }

  apply() {
    this.distance = THREE.MathUtils.clamp(this.distance, this.cfg.minDistance, this.cfg.maxDistance);
    this.camera.position.copy(this.target).addScaledVector(this.offsetDir, this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Eases toward a point (the player). */
  follow(x: number, z: number, dt: number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 12);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.apply();
  }

  /** Point on the ground under a screen pixel. */
  groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out) !== null;
  }
}
