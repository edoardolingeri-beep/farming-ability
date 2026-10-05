import * as THREE from 'three';
import config from './data/config.json';
import map from './data/map.json';
import { World } from './scene/World';
import { CameraRig } from './scene/CameraRig';
import { Input } from './scene/Input';
import { buildTerrain } from './scene/Terrain';
import { CropInstancer, windUniform } from './entities/Crops';
import { Field } from './entities/Field';
import { vertexColorMaterial } from './entities/geo';
import { makeBarnGeometry, makeHouseGeometry } from './entities/props';
import { CROPS, fieldProgress, growMs, type CropId, type GameState, type ItemId } from './systems/State';
import { loadGame, saveGame } from './systems/Save';
import { updateTweens } from './systems/Tween';
import { Hud, toast } from './ui/Hud';
import { Bubble } from './ui/Bubble';
import { flyItems, floatText } from './ui/FlyFx';
import { iconImg, type IconId } from './ui/icons';

type Pick = { kind: 'field'; index: number } | { kind: 'barn' };

const MAX_FLYING = 8;

export class Game {
  private world: World;
  private rig: CameraRig;
  private fields: Field[] = [];
  private pickables: THREE.Object3D[] = [];
  private state: GameState;
  private hud: Hud;
  private bubble: Bubble;
  private ui: HTMLElement;
  private chip: HTMLElement | null = null;
  private plantingCrop: CropId | null = null;
  private harvesting = new Map<number, CropId>();
  private dirty = false;
  private saveTimer = 0;
  private last = performance.now();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private barnPos = new THREE.Vector3();

  constructor(gameEl: HTMLElement, uiEl: HTMLElement) {
    this.ui = uiEl;
    this.world = new World(gameEl, config.camera.fov);
    this.rig = new CameraRig(this.world.camera, config.camera);
    this.rig.target.set(-1, 0, -1);
    this.rig.apply();

    const scene = this.world.scene;
    buildTerrain(scene);

    // Fields share one instanced mesh for all their crops.
    const crops = new CropInstancer(map.fields.length, map.fieldSize);
    scene.add(crops.mesh);
    map.fields.forEach((f, i) => {
      const field = new Field(i, f.x, f.z, map.fieldSize, crops);
      scene.add(field.group);
      this.fields.push(field);
      this.pickables.push(field.soil);
    });

    const barn = new THREE.Mesh(makeBarnGeometry(), vertexColorMaterial);
    barn.position.set(map.barn.x, 0, map.barn.z);
    barn.rotation.y = THREE.MathUtils.degToRad(map.barn.rotDeg);
    barn.castShadow = barn.receiveShadow = true;
    barn.userData.pick = { kind: 'barn' };
    scene.add(barn);
    this.pickables.push(barn);
    this.barnPos.set(map.barn.x, 3.2, map.barn.z);

    const house = new THREE.Mesh(makeHouseGeometry(), vertexColorMaterial);
    house.position.set(map.house.x, 0, map.house.z);
    house.rotation.y = THREE.MathUtils.degToRad(map.house.rotDeg);
    house.castShadow = house.receiveShadow = true;
    scene.add(house);

    const { state, fresh } = loadGame();
    this.state = state;

    this.hud = new Hud(uiEl);
    this.hud.addCounter('coins', 'coin', state.coins);
    this.hud.addCounter('wheat', 'wheat', state.inventory.wheat ?? 0);
    this.bubble = new Bubble(uiEl, this.world.camera);
    const syncBubbleTop = () => { this.bubble.minTop = this.hud.root.getBoundingClientRect().bottom + 6; };
    syncBubbleTop();
    window.addEventListener('resize', syncBubbleTop);

    new Input(this.world.renderer.domElement, this.rig, (x, y) => this.onTap(x, y));

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.welcome(fresh);
    this.renderFields(Date.now());
    this.world.follow(this.rig.target, this.rig.distance);
    this.world.render();
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    this.last = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- loop

  private frame() {
    const t = performance.now();
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const now = Date.now();

    windUniform.value += dt;
    updateTweens(dt);
    this.rig.update(dt);
    this.world.follow(this.rig.target, this.rig.distance);
    this.renderFields(now);
    this.bubble.update();

    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > config.saveIntervalSeconds) this.save();

    this.world.render();
  }

  private renderFields(now: number) {
    this.fields.forEach((field, i) => {
      const f = this.state.fields[i];
      const harvested = this.harvesting.get(i);
      if (harvested) {
        field.render(1, CROPS[harvested].colors);
      } else if (f.crop) {
        field.render(fieldProgress(f, now), CROPS[f.crop].colors);
      } else {
        field.render(null, null);
      }
    });
  }

  private save() {
    saveGame(this.state);
    this.dirty = false;
    this.saveTimer = 0;
  }

  private markDirty() {
    this.dirty = true;
  }

  // ---------------------------------------------------------------- input

  private onTap(x: number, y: number) {
    const hit = this.pick(x, y);
    if (!hit) {
      this.bubble.hide();
      this.stopPlanting();
      return;
    }
    if (hit.kind === 'field') this.tapField(hit.index);
    else this.openBarn();
  }

  private pick(x: number, y: number): Pick | null {
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.world.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    if (hits.length) return hits[0].object.userData.pick as Pick;
    // Forgiving touch: a tap on the ground just beside a field still counts.
    const g = new THREE.Vector3();
    if (this.rig.groundAt(x, y, g)) {
      const half = map.fieldSize / 2 + 0.25;
      const i = map.fields.findIndex((f) => Math.abs(g.x - f.x) < half && Math.abs(g.z - f.z) < half);
      if (i >= 0) return { kind: 'field', index: i };
    }
    return null;
  }

  // ---------------------------------------------------------------- fields

  private tapField(i: number) {
    const f = this.state.fields[i];
    if (this.harvesting.has(i)) return;
    const now = Date.now();
    if (!f.crop) {
      if (this.plantingCrop) this.plant(i, this.plantingCrop);
      else this.openSeedMenu(i);
      return;
    }
    if ((fieldProgress(f, now) ?? 0) >= 1) {
      this.harvest(i);
    } else {
      this.stopPlanting();
      this.fields[i].squash();
      this.openGrowInfo(i);
    }
  }

  private openSeedMenu(i: number) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h3>Cosa semini?</h3>`;
    const row = document.createElement('div');
    row.className = 'row';
    for (const id of Object.keys(CROPS) as CropId[]) {
      const crop = CROPS[id];
      const btn = document.createElement('button');
      btn.className = 'seed-btn';
      btn.appendChild(iconImg(`${id}Seed` as IconId));
      const cost = document.createElement('div');
      cost.className = 'cost';
      cost.append(iconImg('coin'), String(crop.seedCost));
      btn.appendChild(cost);
      btn.addEventListener('click', () => {
        this.bubble.hide();
        if (this.plant(i, id)) this.startPlanting(id);
      });
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    this.fields[i].squash();
    this.bubble.show(`field:${i}`, this.fields[i].top, wrap);
  }

  private openGrowInfo(i: number) {
    const f = this.state.fields[i];
    if (!f.crop) return;
    const crop = CROPS[f.crop];
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h3>${crop.name}</h3><div class="progress"><i></i><span></span></div>`;
    const bar = wrap.querySelector('i') as HTMLElement;
    const label = wrap.querySelector('span') as HTMLElement;
    this.bubble.show(`field:${i}`, this.fields[i].top, wrap, () => {
      const p = fieldProgress(f, Date.now());
      if (p === null || p >= 1) {
        this.bubble.hide();
        return;
      }
      bar.style.width = `${(p * 100).toFixed(1)}%`;
      const left = Math.ceil((growMs(f.crop!) * (1 - p)) / 1000);
      label.textContent = formatTime(left);
    });
  }

  private plant(i: number, id: CropId): boolean {
    const crop = CROPS[id];
    if (this.state.coins < crop.seedCost) {
      this.hud.shake('coins');
      toast(this.ui, 'Monete insufficienti! Vendi il grano al fienile.');
      this.stopPlanting();
      return false;
    }
    this.state.coins -= crop.seedCost;
    this.hud.set('coins', this.state.coins);
    this.state.fields[i] = { crop: id, plantedAt: Date.now() };
    this.fields[i].animatePlant();
    this.markDirty();
    return true;
  }

  private harvest(i: number) {
    const f = this.state.fields[i];
    if (!f.crop) return;
    const id = f.crop;
    const crop = CROPS[id];
    this.state.fields[i] = { crop: null, plantedAt: 0 };
    this.state.inventory[id] = (this.state.inventory[id] ?? 0) + crop.yield;
    this.markDirty();

    this.harvesting.set(i, id);
    this.fields[i].animateHarvest(() => this.harvesting.delete(i));
    if (this.bubble.owner === `field:${i}`) this.bubble.hide();

    const from = this.toScreen(this.fields[i].top);
    floatText(this.ui, { x: from.x, y: from.y - 20 }, `+${crop.yield}`);
    this.flyInto(id, id, from, crop.yield);
  }

  private startPlanting(id: CropId) {
    this.plantingCrop = id;
    this.chip?.remove();
    const chip = document.createElement('div');
    chip.className = 'chip interactive';
    chip.append(iconImg(`${id}Seed` as IconId), 'Tocca i campi vuoti per seminare');
    const done = document.createElement('button');
    done.className = 'btn';
    done.textContent = 'Fine';
    done.addEventListener('click', () => this.stopPlanting());
    chip.appendChild(done);
    chip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ui.appendChild(chip);
    this.chip = chip;
  }

  private stopPlanting() {
    this.plantingCrop = null;
    this.chip?.remove();
    this.chip = null;
  }

  // ---------------------------------------------------------------- barn

  private openBarn() {
    this.stopPlanting();
    const wrap = document.createElement('div');
    let shownWheat = -1;
    // Rebuilt whenever the stock changes while the card is open.
    const draw = () => {
      const wheat = this.state.inventory.wheat ?? 0;
      if (wheat === shownWheat) return;
      shownWheat = wheat;
      wrap.replaceChildren();
      const title = document.createElement('h3');
      title.textContent = 'Fienile';
      const stock = document.createElement('div');
      stock.className = 'stock';
      stock.append(iconImg('wheat'), `× ${wheat}`);
      const btn = document.createElement('button');
      btn.className = 'btn orange';
      if (wheat > 0) {
        btn.append(`Vendi tutto  +${wheat * CROPS.wheat.sellPrice}`, iconImg('coin'));
        btn.addEventListener('click', () => this.sellAll());
      } else {
        btn.textContent = 'Vuoto';
        btn.disabled = true;
      }
      wrap.append(title, stock, btn);
    };
    draw();
    this.bubble.show('barn', this.barnPos, wrap, draw);
  }

  private sellAll() {
    const wheat = this.state.inventory.wheat ?? 0;
    if (wheat <= 0) return;
    const value = wheat * CROPS.wheat.sellPrice;
    this.state.inventory.wheat = 0;
    this.state.coins += value;
    this.markDirty();
    this.hud.set('wheat', 0);
    this.hud.bump('wheat');
    this.bubble.hide();
    const from = this.toScreen(this.barnPos);
    floatText(this.ui, { x: from.x, y: from.y - 20 }, `+${value}`);
    this.flyInto('coins', 'coin', from, value);
  }

  // ---------------------------------------------------------------- helpers

  /** Sends icons flying into a HUD counter; the counter catches up as they land. */
  private flyInto(key: 'coins' | ItemId, icon: IconId, from: { x: number; y: number }, amount: number) {
    const real = () => (key === 'coins' ? this.state.coins : this.state.inventory[key] ?? 0);
    const count = Math.min(amount, MAX_FLYING);
    const per = Math.floor(amount / count);
    flyItems(this.ui, icon, from, () => this.hud.target(key), count, (n) => {
      if (n === count - 1) {
        this.hud.set(key, real());
        this.hud.bump(key);
      } else {
        // Never show more than we really have (e.g. spent while items were in flight).
        this.hud.set(key, Math.min(this.hud.shown(key) + per, real()));
        this.hud.bump(key);
      }
    });
  }

  /** Screen position of a field (used by automated tests via ?debug). */
  fieldScreen(i: number) {
    return this.toScreen(this.fields[i].top);
  }

  barnScreen() {
    return this.toScreen(this.barnPos);
  }

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.world.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private welcome(fresh: boolean) {
    if (fresh) {
      setTimeout(() => toast(this.ui, 'Tocca un campo per seminare il grano!'), 700);
      return;
    }
    const away = Date.now() - this.state.savedAt;
    const ripened = this.state.fields.filter(
      (f) => f.crop && f.plantedAt + growMs(f.crop) > this.state.savedAt && f.plantedAt + growMs(f.crop) <= Date.now(),
    ).length;
    if (ripened > 0) {
      setTimeout(() => toast(this.ui, `Bentornato! ${ripened === 1 ? 'Un campo è pronto' : `${ripened} campi sono pronti`} da raccogliere.`), 700);
    } else if (away > 60_000) {
      setTimeout(() => toast(this.ui, 'Bentornato in fattoria!'), 700);
    }
  }
}

function formatTime(sec: number) {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
