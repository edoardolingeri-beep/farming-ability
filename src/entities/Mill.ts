import * as THREE from 'three';
import { cyl, place, vertexColorMaterial } from './geo';
import { makeMillSailsGeometry, makeMillTowerGeometry } from './props';

/** Windmill building. Sails turn faster while it is grinding. */
export class Mill {
  readonly group = new THREE.Group();
  private sails: THREE.Mesh;
  private spin = 0.4;

  constructor(x: number, z: number) {
    const tower = new THREE.Mesh(makeMillTowerGeometry(), vertexColorMaterial);
    tower.castShadow = tower.receiveShadow = true;
    // Rotate so the door faces the farm (+X) and the sails face the camera.
    tower.rotation.y = Math.PI / 2;
    this.sails = new THREE.Mesh(makeMillSailsGeometry(), vertexColorMaterial);
    this.sails.castShadow = true;
    // Sails on the tower's camera-facing side (+X+Z).
    const hub = new THREE.Group();
    hub.position.set(0.82, 3.1, 0.82);
    hub.rotation.y = Math.PI / 4;
    const housing = new THREE.Mesh(place(cyl(0.22, 0.28, 0.55, '#8a5a35', 10), 0, 0, -0.2, Math.PI / 2), vertexColorMaterial);
    this.sails.position.z = 0.12;
    hub.add(housing, this.sails);
    this.group.add(tower, hub);
    this.group.position.set(x, 0, z);
  }

  update(dt: number, working: boolean) {
    const target = working ? 3.2 : 0.4;
    this.spin += (target - this.spin) * Math.min(1, dt * 2);
    this.sails.rotation.z -= this.spin * dt;
  }
}
