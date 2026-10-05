import * as THREE from 'three';

/** Renderer, scene, warm sunlight with soft shadows that follow the camera. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(-12, 26, 10);
  private readonly fog: THREE.Fog;

  constructor(container: HTMLElement, fov: number) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const sky = new THREE.Color('#9ad8f2');
    this.scene.background = sky;
    this.fog = new THREE.Fog('#b9e4ef', 60, 140);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(fov, 1, 1, 400);

    const hemi = new THREE.HemisphereLight('#fff3d6', '#7cb85a', 1.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#ffe6bf', 2.35);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24;
    sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Keeps the shadow frustum and fog centred on what the camera is looking at. */
  follow(target: THREE.Vector3, distance: number) {
    // Snap to whole units to avoid shadow shimmering while panning.
    const tx = Math.round(target.x), tz = Math.round(target.z);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunOffset.x, this.sunOffset.y, tz + this.sunOffset.z);
    const half = THREE.MathUtils.clamp(distance * 0.5, 16, 40);
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.updateProjectionMatrix();
    }
    this.fog.near = distance + 15;
    this.fog.far = distance + 110;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
