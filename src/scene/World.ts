import * as THREE from 'three';

/** Renderer, scene, warm sunlight with soft shadows that follow the camera. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(-12, 26, 10);
  private readonly fog: THREE.Fog;
  // Light-space basis, used to snap the shadow frustum to whole shadow texels.
  private readonly lightDir = new THREE.Vector3();
  private readonly lightRight = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly snapped = new THREE.Vector3();
  private pixelRatio: number;
  private readonly maxPixelRatio: number;
  private frameTimes: number[] = [];

  constructor(container: HTMLElement, fov: number) {
    const dpr = window.devicePixelRatio || 1;
    // MSAA is costly on phones and barely visible at high pixel density.
    const renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(dpr, 2);
    this.pixelRatio = this.maxPixelRatio;
    renderer.setPixelRatio(this.pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Gentle highlight roll-off for a softer, toy-like look.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = new THREE.Color('#a6dcf2');
    this.fog = new THREE.Fog('#c4e6ee', 60, 140);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(fov, 1, 1, 400);

    const hemi = new THREE.HemisphereLight('#fff6e0', '#8cc070', 1.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff0d6', 2.0);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 5;
    sun.shadow.intensity = 0.62;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.lightDir.copy(this.sunOffset).normalize();
    this.lightRight.crossVectors(new THREE.Vector3(0, 1, 0), this.lightDir).normalize();
    this.lightUp.crossVectors(this.lightDir, this.lightRight).normalize();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Keeps the shadow frustum and fog centred on what the camera looks at.
   * The frustum moves in whole-texel steps in light space, so shadows stay
   * perfectly still while the camera glides (no shimmering or jumps).
   */
  follow(target: THREE.Vector3, distance: number) {
    const half = THREE.MathUtils.clamp(distance * 0.55, 14, 36);
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    const texel = (2 * half) / this.sun.shadow.mapSize.x;
    const r = Math.round(target.dot(this.lightRight) / texel) * texel;
    const u = Math.round(target.dot(this.lightUp) / texel) * texel;
    const f = target.dot(this.lightDir);
    this.snapped.copy(this.lightRight).multiplyScalar(r).addScaledVector(this.lightUp, u).addScaledVector(this.lightDir, f);
    this.sun.target.position.copy(this.snapped);
    this.sun.position.copy(this.snapped).add(this.sunOffset);
    this.fog.near = distance + 15;
    this.fog.far = distance + 110;
  }

  /**
   * Adaptive resolution: if frames keep taking too long (slow phone), render
   * at a lower pixel ratio so movement stays fluid.
   */
  adapt(frameMs: number) {
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.frameTimes.length = 0;
    if (median > 21 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
    } else if (median < 12 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
