import * as THREE from 'three';
import config from './data/config.json';
import map from './data/map.json';
import { World } from './scene/World';
import { CameraRig } from './scene/CameraRig';
import { buildTerrain, type Colliders } from './scene/Terrain';
import { CropInstancer, windUniform } from './entities/Crops';
import { Field } from './entities/Field';
import { cone, merge, place, rbox, vertexColorMaterial } from './entities/geo';
import { makeBarnGeometry, makeCoinGeometry, makeFlourSackGeometry, makeHouseGeometry, makeWheatBundleGeometry } from './entities/props';
import { Character, randomLook } from './entities/Character';
import { Pad } from './entities/Pad';
import { Shop } from './entities/Shop';
import { Mill } from './entities/Mill';
import { Chickens } from './entities/Chickens';
import { BALANCE, advanceMill, levelInfo, plotProgress, type GameState, type ItemType } from './systems/State';
import { loadGame, saveGame } from './systems/Save';
import { Leaderboard } from './systems/Leaderboard';
import { ease, tween, updateTweens } from './systems/Tween';
import { Hud, toast } from './ui/Hud';
import { Joystick } from './ui/Joystick';
import { flyItems, floatText } from './ui/FlyFx';
import { iconImg } from './ui/icons';
import { InfoCard, openLeaderboard } from './ui/Panels';

type PadDef = (typeof BALANCE.pads)[number];
type Item = THREE.Mesh & { userData: { type: ItemType } };

interface Customer {
  char: Character;
  state: 'enter' | 'shopping' | 'toQueue' | 'queue' | 'leave' | 'exit';
  wantType: ItemType;
  want: number;
  items: Item[];
  /** Items still flying toward this customer. */
  incoming: number;
  spot: number;
  timer: number;
  patience: number;
  tag: HTMLElement;
  tagIcon: HTMLImageElement;
  tagText: HTMLElement;
}

const STACK_STEP = 0.26;
const PLAYER_RADIUS = 0.35;
const CUSTOMER_PATIENCE = 30;

export class Game {
  private world: World;
  private rig: CameraRig;
  private ui: HTMLElement;
  private hud: Hud;
  private joy: Joystick;
  private info: InfoCard;
  private state: GameState;
  private colliders: Colliders = { boxes: [], circles: [] };
  readonly leaderboard = new Leaderboard();

  private player: Character;
  private velocity = new THREE.Vector2();
  private stack: Item[] = [];
  private incoming = 0;
  private capacity = BALANCE.player.capacity;
  private maxTag: HTMLElement;
  private level = 1;

  private fields: Field[] = [];
  private shop: Shop;
  private shelfItems: Record<ItemType, Item[]> = { wheat: [], flour: [] };
  private shelfIncoming: Record<ItemType, number> = { wheat: 0, flour: 0 };
  private dropPad: Pad;
  private cashierPad: Pad;
  private moneyPad: Pad;
  private moneyMeshes: THREE.Mesh[] = [];
  private upgrades = new Map<string, { def: PadDef; pad: Pad }>();
  private cashierNpc: Character | null = null;

  private mill: Mill | null = null;
  private millIn: Pad | null = null;
  private millOut: Pad | null = null;
  private millInputMeshes: Item[] = [];
  private millOutputMeshes: Item[] = [];
  private chickens: Chickens;

  private customers: Customer[] = [];
  private queue: Customer[] = [];
  private spawnTimer = 1.5;
  private checkoutTimer = 0;

  private arrow: THREE.Group;
  private geos: Record<ItemType, THREE.BufferGeometry> = { wheat: makeWheatBundleGeometry(), flour: makeFlourSackGeometry() };
  private coinGeo = makeCoinGeometry();

  private timers = { harvest: 0, drop: 0, pay: 0, payFx: 0, mill: 0, board: 0 };
  private dirty = false;
  private saveTimer = 0;
  private last = performance.now();
  private tmp = new THREE.Vector3();

  constructor(gameEl: HTMLElement, uiEl: HTMLElement) {
    this.ui = uiEl;
    this.world = new World(gameEl, config.camera.fov);
    this.rig = new CameraRig(this.world.camera, config.camera);
    const scene = this.world.scene;
    buildTerrain(scene, this.colliders);

    const { state, fresh } = loadGame();
    this.state = state;
    this.level = levelInfo(state.earned).level;

    // Buildings.
    const decor = (geo: THREE.BufferGeometry, p: { x: number; z: number; rotDeg: number }, hw: number, hd: number) => {
      const m = new THREE.Mesh(geo, vertexColorMaterial);
      m.position.set(p.x, 0, p.z);
      m.rotation.y = THREE.MathUtils.degToRad(p.rotDeg);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      this.colliders.boxes.push({ minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd });
    };
    decor(makeBarnGeometry(), map.barn, 2.3, 2.0);
    decor(makeHouseGeometry(), map.house, 1.9, 1.7);
    this.chickens = new Chickens(map.chickens.x, map.chickens.z, map.chickens.count, map.chickens.radius);
    scene.add(this.chickens.group);

    // Fields: all plots share one instanced mesh.
    const totalPlots = map.fields.reduce((n, f) => n + f.cols * f.rows, 0);
    const crops = new CropInstancer(totalPlots, map.plotSize);
    scene.add(crops.mesh);
    let slot = 0;
    for (const def of map.fields) {
      const field = new Field(def, map.plotSize, slot, crops);
      slot += field.size;
      this.fields.push(field);
      if (this.fieldOpen(field)) scene.add(field.group);
      else field.hide();
    }

    // Shop and its pads.
    this.shop = new Shop(this.colliders);
    scene.add(this.shop.group);
    const s = map.shop;
    this.dropPad = new Pad('drop', s.dropPad.x, s.dropPad.z, 1.7, 1.7, 'Vendi');
    this.cashierPad = new Pad('cashier', s.cashierPad.x, s.cashierPad.z, 1.5, 1.5, 'Cassa');
    this.moneyPad = new Pad('money', s.moneyPad.x, s.moneyPad.z, 1.5, 1.5);
    scene.add(this.dropPad.mesh, this.cashierPad.mesh, this.moneyPad.mesh);

    for (const def of BALANCE.pads) {
      if (this.state.unlocked.includes(def.id)) continue;
      const pad = new Pad('upgrade', def.x, def.z, def.w, def.d, def.label);
      pad.lockText = `LIVELLO ${def.level}`;
      scene.add(pad.mesh);
      this.upgrades.set(def.id, { def, pad });
      this.drawPad(def.id);
    }
    if (this.state.unlocked.includes('backpack')) this.capacity = BALANCE.player.capacityUpgraded;
    if (this.state.unlocked.includes('cashier')) this.hireCashier(false);
    if (this.state.unlocked.includes('mill')) this.buildMill(false);

    // Player.
    this.player = new Character({ skin: '#ffd2b0', hair: '#7a3b1c', shirt: '#e8453c', pants: '#3f6fb8', hat: true });
    this.player.position.set(map.playerStart.x, 0, map.playerStart.z);
    scene.add(this.player.root);
    this.rig.follow(this.player.position.x, this.player.position.z, 0, true);

    // Restore stock that was saved (milling caught up while the game was closed).
    advanceMill(this.state, Date.now());
    for (const t of this.state.carry) this.addToStack(this.makeItem(t));
    for (const t of ['wheat', 'flour'] as ItemType[]) {
      for (let i = 0; i < this.state.shelf[t]; i++) this.placeOnShelf(this.makeItem(t));
    }
    this.rebuildMoneyPile();
    this.rebuildMillPiles();

    // Guide arrow.
    this.arrow = new THREE.Group();
    const arrowMesh = new THREE.Mesh(
      merge([place(cone(0.42, 0.6, '#38b6ff', 16), 0, 0.3, 0, Math.PI), place(rbox(0.32, 0.6, 0.32, 0.1, '#38b6ff'), 0, 0.85, 0)]),
      vertexColorMaterial,
    );
    arrowMesh.castShadow = true;
    this.arrow.add(arrowMesh);
    scene.add(this.arrow);

    // UI.
    this.hud = new Hud(uiEl);
    this.hud.addLevel();
    this.hud.addCounter('coins', 'coin', this.state.coins);
    this.refreshLevel(false);
    this.hud.addCornerButton('🏆', 'Classifica', () => openLeaderboard(this.ui, this.leaderboard));
    this.info = new InfoCard(uiEl);
    this.maxTag = document.createElement('div');
    this.maxTag.className = 'max-tag';
    this.maxTag.textContent = 'MAX';
    uiEl.appendChild(this.maxTag);
    this.joy = new Joystick(this.world.renderer.domElement, uiEl, (f) => {
      this.rig.distance *= f;
      this.rig.apply();
    });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.leaderboard.init().then(() => this.submitScore());
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

  get needsProfile() {
    return !this.state.profile;
  }

  setProfile(name: string, nation: string) {
    this.state.profile = { name, nation };
    this.save();
    this.submitScore();
    toast(this.ui, `Ciao ${name}! Trascina il dito per camminare e passa sul grano dorato.`);
  }

  // =================================================================== loop

  private frame() {
    const t = performance.now();
    const frameMs = t - this.last;
    const dt = Math.min(0.05, frameMs / 1000);
    this.last = t;
    const now = Date.now();
    this.world.adapt(frameMs);

    windUniform.value += dt;
    updateTweens(dt);
    this.movePlayer(dt);
    this.harvest(dt, now);
    this.dropAtShelf(dt);
    this.updateMill(dt, now);
    this.updateCustomers(dt);
    this.checkout(dt);
    this.collectMoney();
    this.payUpgrades(dt);
    this.renderFields(now);
    this.updateArrow(dt, now);
    this.updateStackSway(dt);
    this.updateInfo();
    this.chickens.update(dt, this.player.position);

    const px = this.player.position.x, pz = this.player.position.z;
    for (const p of [this.dropPad, this.cashierPad, this.moneyPad, this.millIn, this.millOut]) p?.update(dt, p.contains(px, pz));
    for (const { pad } of this.upgrades.values()) pad.update(dt, pad.contains(px, pz));

    this.rig.follow(px, pz, dt);
    this.world.follow(this.rig.target, this.rig.distance);
    this.placeTags();

    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > config.saveIntervalSeconds) this.save();
    this.timers.board -= dt;
    if (this.timers.board <= 0) {
      this.timers.board = 15;
      this.submitScore();
    }
    this.world.render();
  }

  private save() {
    this.state.carry = this.stack.map((i) => i.userData.type);
    this.state.shelf = { wheat: this.shelfItems.wheat.length, flour: this.shelfItems.flour.length };
    saveGame(this.state);
    this.dirty = false;
    this.saveTimer = 0;
  }

  private submitScore() {
    const p = this.state.profile;
    if (p) this.leaderboard.submit(p.name, p.nation, this.state.earned, this.level);
  }

  // =================================================================== player

  private movePlayer(dt: number) {
    this.joy.update();
    const d = this.joy.dir;
    const wantX = this.rig.screenRight.x * d.x + this.rig.screenDown.x * d.y;
    const wantZ = this.rig.screenRight.z * d.x + this.rig.screenDown.z * d.y;
    const speed = BALANCE.player.speed;
    // Ease velocity toward the stick direction: quick but never a hard start/stop.
    const k = 1 - Math.exp(-dt * 16);
    this.velocity.x += (wantX * speed - this.velocity.x) * k;
    this.velocity.y += (wantZ * speed - this.velocity.y) * k;
    const v = this.velocity.length();
    const p = this.player.position;
    if (v > 0.05) {
      p.x += this.velocity.x * dt;
      p.z += this.velocity.y * dt;
      this.player.face(this.velocity.x, this.velocity.y, dt);
      this.collide(p);
    }
    this.player.moving = Math.min(1, v / speed);
    this.player.carrying = this.carried > 0;
    this.player.animate(dt);
  }

  private collide(p: THREE.Vector3) {
    const b = map.bounds, r = PLAYER_RADIUS;
    p.x = THREE.MathUtils.clamp(p.x, b.minX + 0.6, b.maxX - 0.6);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ + 0.6, b.maxZ - 0.6);
    for (const c of this.colliders.circles) {
      const dx = p.x - c.x, dz = p.z - c.z, dist = Math.hypot(dx, dz), min = c.r + r;
      if (dist < min && dist > 1e-4) {
        p.x = c.x + (dx / dist) * min;
        p.z = c.z + (dz / dist) * min;
      }
    }
    for (const bx of this.colliders.boxes) {
      const cx = THREE.MathUtils.clamp(p.x, bx.minX, bx.maxX), cz = THREE.MathUtils.clamp(p.z, bx.minZ, bx.maxZ);
      const dx = p.x - cx, dz = p.z - cz, dist = Math.hypot(dx, dz);
      if (dist < r) {
        if (dist > 1e-4) {
          p.x = cx + (dx / dist) * r;
          p.z = cz + (dz / dist) * r;
        } else {
          // centre inside the box: push out along the shallowest side
          const pushes = [p.x - bx.minX + r, bx.maxX - p.x + r, p.z - bx.minZ + r, bx.maxZ - p.z + r];
          const i = pushes.indexOf(Math.min(...pushes));
          if (i === 0) p.x = bx.minX - r; else if (i === 1) p.x = bx.maxX + r; else if (i === 2) p.z = bx.minZ - r; else p.z = bx.maxZ + r;
        }
      }
    }
  }

  private get carried() {
    return this.stack.length + this.incoming;
  }

  private onPad(pad: Pad | null, margin = 0.1) {
    return !!pad && pad.contains(this.player.position.x, this.player.position.z, margin);
  }

  // =================================================================== items

  private makeItem(type: ItemType): Item {
    const m = new THREE.Mesh(this.geos[type], vertexColorMaterial) as unknown as Item;
    m.userData.type = type;
    m.castShadow = true;
    return m;
  }

  private addToStack(item: Item) {
    this.player.hands.add(item);
    item.position.set(0, this.stack.length * STACK_STEP, 0);
    item.rotation.set(0, 0, 0);
    item.scale.setScalar(1);
    this.stack.push(item);
  }

  /** Takes the top-most carried item matching `ok`, re-closing the gap in the stack. */
  private takeFromStack(ok: (t: ItemType) => boolean): Item | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!ok(this.stack[i].userData.type)) continue;
      const [item] = this.stack.splice(i, 1);
      return item;
    }
    return null;
  }

  private stackSlot(n: number) {
    return new THREE.Vector3(0, n * STACK_STEP, 0);
  }

  /** Stack leans opposite to movement like a wobbly tower; items settle into place. */
  private updateStackSway(dt: number) {
    const lean = this.player.moving * 0.035;
    const k = Math.min(1, dt * 12);
    this.stack.forEach((it, i) => {
      it.position.z += (-lean * i - it.position.z) * k;
      it.position.y += (i * STACK_STEP - it.position.y) * k;
    });
  }

  /** Arcs a mesh between two world points (tracking a moving end), then calls done(). */
  private arc(mesh: THREE.Object3D, from: THREE.Vector3, to: () => THREE.Vector3, dur: number, done: () => void, height = 1.4) {
    const scene = this.world.scene;
    scene.add(mesh);
    mesh.position.copy(from);
    const start = from.clone();
    const spin = (Math.random() - 0.5) * 2;
    tween(dur, (k) => {
      const end = to();
      const e = ease.outCubic(k);
      mesh.position.lerpVectors(start, end, e);
      mesh.position.y += Math.sin(Math.PI * k) * height;
      mesh.rotation.y = spin * k * 3;
    }, () => {
      scene.remove(mesh);
      done();
    });
  }

  private worldOf(obj: THREE.Object3D, local: THREE.Vector3) {
    obj.updateWorldMatrix(true, false);
    return obj.localToWorld(local.clone());
  }

  // =================================================================== farming

  private fieldOpen(f: Field) {
    return !f.def.locked || this.state.unlocked.includes(f.def.id);
  }

  private renderFields(now: number) {
    for (const f of this.fields) {
      if (!this.fieldOpen(f)) continue;
      const cuts = this.state.plots[f.def.id];
      for (let i = 0; i < f.size; i++) f.render(i, plotProgress(cuts[i], now));
    }
  }

  private harvest(dt: number, now: number) {
    this.timers.harvest -= dt;
    if (this.timers.harvest > 0 || this.carried >= this.capacity) return;
    const p = this.player.position;
    const r = BALANCE.player.harvestRadius;
    for (const f of this.fields) {
      if (!this.fieldOpen(f)) continue;
      const cuts = this.state.plots[f.def.id];
      for (let i = 0; i < f.size; i++) {
        const pl = f.plots[i];
        if (Math.abs(pl.x - p.x) > r || Math.abs(pl.z - p.z) > r) continue;
        if (plotProgress(cuts[i], now) < 1) continue;
        cuts[i] = now;
        this.dirty = true;
        this.timers.harvest = 0.06;
        f.setPop(i, 0);
        tween(0.35, (k) => f.setPop(i, ease.outBack(k)));
        const item = this.makeItem('wheat');
        const n = this.carried;
        this.incoming++;
        this.arc(item, new THREE.Vector3(pl.x, 0.5, pl.z), () => this.worldOf(this.player.hands, this.stackSlot(n)), 0.32, () => {
          this.incoming--;
          this.addToStack(item);
        }, 1.2);
        return;
      }
    }
  }

  // =================================================================== mill

  private buildMill(animate: boolean) {
    const m = map.mill;
    this.mill = new Mill(m.x, m.z);
    this.world.scene.add(this.mill.group);
    this.colliders.circles.push({ x: m.x, z: m.z, r: 1.45 });
    this.millIn = new Pad('drop', m.inputPad.x, m.inputPad.z, 1.6, 1.6, 'Grano');
    this.millOut = new Pad('drop', m.outputPad.x, m.outputPad.z, 1.6, 1.6, 'Farina');
    this.world.scene.add(this.millIn.mesh, this.millOut.mesh);
    if (animate) tween(0.7, (k) => this.mill!.group.scale.set(1, ease.outBack(k), 1));
  }

  /** Where the n-th item of the mill's input (wheat) or output (flour) pile sits. */
  private millSpot(kind: 'in' | 'out', n: number) {
    const pad = kind === 'in' ? map.mill.inputPad : map.mill.outputPad;
    const col = n % 4, layer = Math.floor(n / 4);
    return new THREE.Vector3(pad.x - 0.95 - layer * 0.02, 0.18 + layer * 0.28, pad.z + (col - 1.5) * 0.36);
  }

  private rebuildMillPiles() {
    const sync = (list: Item[], count: number, type: ItemType, kind: 'in' | 'out') => {
      while (list.length < count) {
        const it = this.makeItem(type);
        it.position.copy(this.millSpot(kind, list.length));
        this.world.scene.add(it);
        list.push(it);
      }
      while (list.length > count) this.world.scene.remove(list.pop()!);
    };
    sync(this.millInputMeshes, this.state.mill.input, 'wheat', 'in');
    sync(this.millOutputMeshes, this.state.mill.output, 'flour', 'out');
  }

  private updateMill(dt: number, now: number) {
    if (!this.mill) return;
    const m = this.state.mill;
    if (advanceMill(this.state, now) > 0) {
      this.rebuildMillPiles();
      this.dirty = true;
    }
    this.mill.update(dt, m.input > 0 && m.output < BALANCE.mill.outputCapacity);

    this.timers.mill -= dt;
    if (this.timers.mill > 0) return;
    // Feed wheat in.
    if (this.onPad(this.millIn) && m.input < BALANCE.mill.inputCapacity) {
      const item = this.takeFromStack((t) => t === 'wheat');
      if (item) {
        this.timers.mill = 0.08;
        const from = item.getWorldPosition(new THREE.Vector3());
        item.parent?.remove(item);
        if (m.input === 0) m.updatedAt = now;
        m.input++;
        const n = m.input - 1;
        this.arc(item, from, () => this.millSpot('in', n), 0.3, () => this.rebuildMillPiles(), 0.9);
        this.dirty = true;
        return;
      }
    }
    // Collect flour.
    if (this.onPad(this.millOut) && m.output > 0 && this.carried < this.capacity) {
      this.timers.mill = 0.08;
      m.output--;
      const from = this.millOutputMeshes.pop()!;
      this.world.scene.remove(from);
      const item = this.makeItem('flour');
      const n = this.carried;
      this.incoming++;
      this.arc(item, from.position.clone(), () => this.worldOf(this.player.hands, this.stackSlot(n)), 0.3, () => {
        this.incoming--;
        this.addToStack(item);
      }, 1.0);
      this.dirty = true;
    }
  }

  // =================================================================== shop

  private placeOnShelf(item: Item) {
    const t = item.userData.type;
    this.world.scene.add(item);
    item.position.copy(this.shop.slot(t, this.shelfItems[t].length));
    item.rotation.set(0, 0, 0);
    this.shelfItems[t].push(item);
  }

  private shelfRoom(t: ItemType) {
    return this.shelfItems[t].length + this.shelfIncoming[t] < BALANCE.shop.shelfCapacity[t];
  }

  private dropAtShelf(dt: number) {
    this.timers.drop -= dt;
    if (this.timers.drop > 0 || this.stack.length === 0 || !this.onPad(this.dropPad)) return;
    const item = this.takeFromStack((t) => this.shelfRoom(t));
    if (!item) return;
    this.timers.drop = 0.08;
    const t = item.userData.type;
    const from = item.getWorldPosition(new THREE.Vector3());
    this.player.hands.remove(item);
    const n = this.shelfItems[t].length + this.shelfIncoming[t];
    this.shelfIncoming[t]++;
    this.arc(item, from, () => this.shop.slot(t, n), 0.3, () => {
      this.shelfIncoming[t]--;
      this.placeOnShelf(item);
    }, 0.9);
    this.dirty = true;
  }

  private updateCustomers(dt: number) {
    const s = map.shop;
    this.spawnTimer -= dt;
    const takenSpots = new Set(this.customers.filter((c) => c.state === 'enter' || c.state === 'shopping').map((c) => c.spot));
    const free = s.pickSpots.findIndex((_, i) => !takenSpots.has(i));
    if (this.spawnTimer <= 0 && free >= 0 && this.customers.length < BALANCE.shop.maxCustomers) {
      const [a, b] = BALANCE.shop.customerEverySeconds;
      this.spawnTimer = a + Math.random() * (b - a);
      this.spawnCustomer(free);
    }

    const speed = BALANCE.shop.customerSpeed;
    for (const c of [...this.customers]) {
      c.char.carrying = c.items.length + c.incoming > 0;
      switch (c.state) {
        case 'enter': {
          const gp = s.gatePoint;
          if (c.char.position.x > gp.x + 0.1) c.char.walkTo(gp, speed, dt);
          else if (c.char.walkTo(s.pickSpots[c.spot], speed, dt)) {
            c.state = 'shopping';
            c.char.face(-1, 0, 1);
          }
          break;
        }
        case 'shopping': {
          c.char.moving = 0;
          c.timer -= dt;
          c.patience -= dt;
          const shelf = this.shelfItems[c.wantType];
          if (c.timer <= 0 && c.items.length + c.incoming < c.want && shelf.length > 0) {
            c.timer = 0.3;
            c.patience = CUSTOMER_PATIENCE;
            const item = shelf.pop()!;
            const from = item.position.clone();
            c.incoming++;
            const n = c.items.length + c.incoming - 1;
            this.arc(item, from, () => this.worldOf(c.char.hands, this.stackSlot(n).multiplyScalar(0.8)), 0.3, () => {
              c.incoming--;
              c.char.hands.add(item);
              item.position.copy(this.stackSlot(c.items.length).multiplyScalar(0.8));
              item.rotation.set(0, 0, 0);
              c.items.push(item);
            }, 0.8);
            this.dirty = true;
          }
          const done = c.items.length >= c.want && c.incoming === 0;
          // Out of patience: pay for what they have, or walk away.
          const givesUp = c.patience <= 0 && c.incoming === 0;
          if (done || (givesUp && c.items.length > 0)) {
            c.state = 'toQueue';
            this.queue.push(c);
          } else if (givesUp) {
            c.state = 'leave';
          }
          break;
        }
        case 'toQueue':
        case 'queue': {
          const idx = this.queue.indexOf(c);
          const target = { x: s.queueStart.x + s.queueStep.x * idx, z: s.queueStart.z + s.queueStep.z * idx };
          const arrived = c.char.walkTo(target, speed, dt);
          c.state = arrived ? 'queue' : 'toQueue';
          if (arrived) c.char.face(0, -1, dt);
          break;
        }
        case 'leave':
          if (c.char.walkTo(s.gatePoint, speed, dt)) c.state = 'exit';
          break;
        case 'exit':
          if (c.char.walkTo(s.spawn, speed, dt)) this.removeCustomer(c);
          break;
      }
      c.char.animate(dt);
      this.updateCustomerTag(c);
    }
  }

  private spawnCustomer(spot: number) {
    const s = map.shop;
    const char = new Character(randomLook(), 0.95);
    char.position.set(s.spawn.x, 0, s.spawn.z + (Math.random() - 0.5));
    this.world.scene.add(char.root);
    const wantType: ItemType = this.mill && Math.random() < BALANCE.shop.wantFlourChance ? 'flour' : 'wheat';
    const tag = document.createElement('div');
    tag.className = 'want-tag';
    const tagIcon = iconImg(wantType);
    const text = document.createElement('span');
    tag.append(tagIcon, text);
    this.ui.appendChild(tag);
    const { wantMin, wantMax } = BALANCE.shop;
    this.customers.push({
      char, state: 'enter', wantType, want: wantMin + Math.floor(Math.random() * (wantMax - wantMin + 1)),
      items: [], incoming: 0, spot, timer: 0, patience: CUSTOMER_PATIENCE, tag, tagIcon, tagText: text,
    });
  }

  private removeCustomer(c: Customer) {
    this.world.scene.remove(c.char.root);
    c.tag.remove();
    this.customers.splice(this.customers.indexOf(c), 1);
  }

  private updateCustomerTag(c: Customer) {
    let show = false;
    if (c.state === 'shopping') {
      show = true;
      c.tag.classList.remove('pay');
      c.tagText.textContent = `${c.items.length}/${c.want}`;
    } else if (c.state === 'queue' && this.queue[0] === c && !this.cashierNpc && !this.onPad(this.cashierPad)) {
      show = true;
      c.tag.classList.add('pay');
      c.tagText.textContent = '';
    }
    c.tag.style.display = show ? '' : 'none';
    if (show) this.placeAbove(c.tag, c.char.position, 2.1);
  }

  private checkout(dt: number) {
    const front = this.queue[0];
    if (!front || front.state !== 'queue') {
      this.checkoutTimer = 0;
      return;
    }
    if (!this.cashierNpc && !this.onPad(this.cashierPad)) return;
    this.checkoutTimer += dt;
    if (this.checkoutTimer < BALANCE.shop.checkoutSeconds) return;
    this.checkoutTimer = 0;

    const value = front.items.reduce((sum, it) => sum + BALANCE.items[it.userData.type].price, 0);
    this.queue.shift();
    front.state = 'leave';
    const from = front.char.position.clone().setY(1.2);
    const hops = Math.min(5, front.items.length + 1);
    for (let i = 0; i < hops; i++) {
      const coin = new THREE.Mesh(this.coinGeo, vertexColorMaterial);
      setTimeout(() => {
        this.arc(coin, from, () => this.moneySpot(this.moneyMeshes.length), 0.35, () => {
          if (i === hops - 1) {
            this.state.moneyPile += value;
            this.rebuildMoneyPile();
          }
        }, 1.0);
      }, i * 60);
    }
    this.dirty = true;
  }

  private moneySpot(n: number) {
    const s = map.shop.moneyPad;
    const col = n % 9, layer = Math.floor(n / 9);
    return new THREE.Vector3(s.x + ((col % 3) - 1) * 0.42, 0.06 + layer * 0.075, s.z + (Math.floor(col / 3) - 1) * 0.42);
  }

  private rebuildMoneyPile() {
    const visible = Math.min(54, Math.ceil(this.state.moneyPile / 3));
    while (this.moneyMeshes.length < visible) {
      const coin = new THREE.Mesh(this.coinGeo, vertexColorMaterial);
      coin.castShadow = true;
      coin.position.copy(this.moneySpot(this.moneyMeshes.length));
      coin.rotation.y = Math.random();
      this.world.scene.add(coin);
      this.moneyMeshes.push(coin);
    }
    while (this.moneyMeshes.length > visible) this.world.scene.remove(this.moneyMeshes.pop()!);
  }

  private collectMoney() {
    if (this.state.moneyPile <= 0 || !this.onPad(this.moneyPad, 0.2)) return;
    const value = this.state.moneyPile;
    this.state.moneyPile = 0;
    this.state.coins += value;
    this.state.earned += value;
    this.dirty = true;
    const meshes = this.moneyMeshes.splice(0);
    meshes.forEach((m, i) => {
      const from = m.position.clone();
      this.world.scene.remove(m);
      setTimeout(() => this.arc(m, from, () => this.player.position.clone().setY(1.0), 0.25, () => {}, 0.8), i * 15);
    });
    const at = this.toScreen(this.player.position.clone().setY(1.4));
    floatText(this.ui, at, `+${value}`);
    this.flyCoinsToHud(at, value);
    this.refreshLevel(true);
  }

  private flyCoinsToHud(from: { x: number; y: number }, amount: number) {
    const count = Math.min(amount, 8);
    flyItems(this.ui, 'coin', from, () => this.hud.target('coins'), count, (n) => {
      const real = this.state.coins;
      if (n === count - 1) this.hud.set('coins', real);
      else this.hud.set('coins', Math.min(this.hud.shown('coins') + Math.floor(amount / count), real));
      this.hud.bump('coins');
    });
  }

  // =================================================================== levels & upgrades

  private refreshLevel(celebrate: boolean) {
    const info = levelInfo(this.state.earned);
    const up = info.level > this.level;
    this.level = info.level;
    this.hud.setLevel(info.level, info.progress, up);
    for (const id of this.upgrades.keys()) this.drawPad(id);
    if (up && celebrate) {
      const at = this.toScreen(this.player.position.clone().setY(2.4));
      floatText(this.ui, at, `Livello ${info.level}!`);
      const opened = BALANCE.pads.filter((p) => p.level === info.level && !this.state.unlocked.includes(p.id)).map((p) => p.label);
      toast(this.ui, opened.length ? `Livello ${info.level}! Ora puoi comprare: ${opened.join(', ')}.` : `Livello ${info.level}!`);
      this.submitScore();
      this.save();
    }
  }

  private drawPad(id: string) {
    const u = this.upgrades.get(id)!;
    const locked = this.level < u.def.level;
    u.pad.setKind(locked ? 'soon' : 'upgrade');
    const paid = this.state.padPaid[id] ?? 0;
    u.pad.draw(u.def.cost - paid, paid / u.def.cost);
  }

  private payUpgrades(dt: number) {
    this.timers.pay -= dt;
    this.timers.payFx -= dt;
    if (this.timers.pay > 0) return;
    const p = this.player.position;
    for (const [id, u] of this.upgrades) {
      if (this.level < u.def.level || !u.pad.contains(p.x, p.z)) continue;
      if (this.state.coins <= 0) {
        if (this.timers.payFx <= 0) {
          this.hud.shake('coins');
          this.timers.payFx = 1.2;
        }
        return;
      }
      this.timers.pay = 0.04;
      const paid = this.state.padPaid[id] ?? 0;
      const step = Math.min(Math.max(1, Math.ceil(u.def.cost / 35)), u.def.cost - paid, this.state.coins);
      this.state.coins -= step;
      this.state.padPaid[id] = paid + step;
      this.hud.set('coins', this.state.coins);
      this.drawPad(id);
      this.dirty = true;
      if (this.timers.payFx <= 0) {
        this.timers.payFx = 0.09;
        const coin = new THREE.Mesh(this.coinGeo, vertexColorMaterial);
        this.arc(coin, p.clone().setY(1.2), () => new THREE.Vector3(u.def.x, 0.1, u.def.z), 0.3, () => {}, 0.8);
      }
      if (paid + step >= u.def.cost) this.unlock(id);
      return;
    }
  }

  private unlock(id: string) {
    const u = this.upgrades.get(id)!;
    this.upgrades.delete(id);
    this.state.unlocked.push(id);
    delete this.state.padPaid[id];
    this.dirty = true;
    this.info.hide();
    const padMesh = u.pad.mesh;
    tween(0.3, (k) => padMesh.scale.setScalar(1 + k * 0.4), () => this.world.scene.remove(padMesh));

    if (id === 'field2') {
      const f = this.fields.find((x) => x.def.id === 'field2')!;
      this.world.scene.add(f.group);
      tween(0.6, (k) => f.group.scale.set(1, ease.outBack(k), 1));
      this.state.plots.field2.fill(0);
      toast(this.ui, 'Nuovo campo di grano!');
    } else if (id === 'backpack') {
      this.capacity = BALANCE.player.capacityUpgraded;
      toast(this.ui, `Ora porti fino a ${this.capacity} prodotti!`);
    } else if (id === 'cashier') {
      this.hireCashier(true);
      toast(this.ui, 'Il cassiere serve i clienti al posto tuo!');
    } else if (id === 'mill') {
      this.buildMill(true);
      toast(this.ui, 'Mulino costruito! Porta il grano su GRANO e ritira la farina su FARINA.');
    }
    this.save();
  }

  private hireCashier(animate: boolean) {
    const npc = new Character({ skin: '#f1b98f', hair: '#2a1a12', shirt: '#41b8a8', pants: '#4a4a5a', bun: true });
    const c = map.shop.cashierPad;
    npc.position.set(c.x, 0, c.z);
    npc.face(0, 1, 1);
    this.world.scene.add(npc.root);
    this.cashierNpc = npc;
    if (animate) tween(0.5, (k) => npc.root.scale.setScalar(ease.outBack(k)));
    this.colliders.circles.push({ x: c.x, z: c.z, r: 0.4 });
  }

  /** Explains the upgrade pad the player is standing on. */
  private updateInfo() {
    const p = this.player.position;
    for (const [id, u] of this.upgrades) {
      if (!u.pad.contains(p.x, p.z, 0.2)) continue;
      const locked = this.level < u.def.level;
      const left = u.def.cost - (this.state.padPaid[id] ?? 0);
      const footer = locked
        ? `Si sblocca al livello ${u.def.level}: ora sei al livello ${this.level}. Vendi prodotti per fare esperienza!`
        : this.state.coins > 0
          ? `Resta qui: le monete entrano da sole (mancano ${left}).`
          : `Ti servono ${left} monete: vendi grano alla bottega.`;
      this.info.show(`${id}|${locked}|${this.state.coins > 0}`, u.def.label, u.def.info, footer, locked);
      return;
    }
    this.info.hide();
  }

  // =================================================================== guidance

  /** Picks what the player should do next and floats an arrow over it. */
  private updateArrow(dt: number, now: number) {
    const p = this.player.position;
    let target: { x: number; z: number } | null = null;
    const ripe = this.fields.some((f) => this.fieldOpen(f) && this.state.plots[f.def.id].some((c) => plotProgress(c, now) >= 1));
    const waiting = this.queue[0]?.state === 'queue' && !this.cashierNpc;
    const nextPad = [...this.upgrades.values()].find((u) => this.level >= u.def.level && this.state.coins >= Math.min(10, u.def.cost - (this.state.padPaid[u.def.id] ?? 0)));
    const full = this.carried >= this.capacity;
    const hasWheat = this.stack.some((i) => i.userData.type === 'wheat');
    const flourWanted = this.customers.some((c) => c.state === 'shopping' && c.wantType === 'flour') && this.shelfItems.flour.length === 0;

    if (waiting && !this.onPad(this.cashierPad)) target = map.shop.cashierPad;
    else if (this.mill && flourWanted && this.state.mill.output > 0 && !full) target = map.mill.outputPad;
    else if (this.stack.length > 0 && (full || !ripe) && this.stack.some((i) => this.shelfRoom(i.userData.type))) target = map.shop.dropPad;
    else if (this.mill && hasWheat && full && this.state.mill.input < BALANCE.mill.inputCapacity) target = map.mill.inputPad;
    else if (this.state.moneyPile > 0) target = map.shop.moneyPad;
    else if (nextPad && this.stack.length === 0) target = nextPad.def;
    else if (!full && ripe) {
      let best = Infinity;
      for (const f of this.fields) {
        if (!this.fieldOpen(f)) continue;
        const d = Math.hypot(f.def.x - p.x, f.def.z - p.z);
        if (d < best) { best = d; target = f.def; }
      }
    } else if (this.stack.length > 0) target = map.shop.dropPad;

    const near = target && Math.hypot(target.x - p.x, target.z - p.z) < 1.6;
    const inField = target && this.fields.some((f) => f.def === target && Math.abs(p.x - f.def.x) < (f.def.cols * map.plotSize) / 2 && Math.abs(p.z - f.def.z) < (f.def.rows * map.plotSize) / 2);
    this.arrow.visible = !!target && !near && !inField;
    if (target && this.arrow.visible) {
      const bob = Math.sin(performance.now() / 180) * 0.25;
      const k = Math.min(1, dt * 8);
      this.arrow.position.x += (target.x - this.arrow.position.x) * k;
      this.arrow.position.z += (target.z - this.arrow.position.z) * k;
      this.arrow.position.y = 2.2 + bob;
      this.arrow.rotation.y += dt * 2;
    }
  }

  // =================================================================== screen helpers

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.world.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private placeAbove(el: HTMLElement, at: THREE.Vector3, height: number) {
    const s = this.toScreen(this.tmp.copy(at).setY(height));
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
  }

  private placeTags() {
    const full = this.carried >= this.capacity;
    this.maxTag.style.display = full ? '' : 'none';
    if (full) this.placeAbove(this.maxTag, this.player.position, 1.75 + this.stack.length * STACK_STEP * 0.5);
  }

  /** Hooks for automated tests (exposed with ?debug). */
  debugScreen(x: number, z: number) {
    return this.toScreen(new THREE.Vector3(x, 0, z));
  }

  debugState() {
    const p = this.player.position;
    return {
      x: p.x, z: p.z, coins: this.state.coins, earned: this.state.earned, level: this.level, carry: this.stack.map((i) => i.userData.type).join(','),
      shelf: { wheat: this.shelfItems.wheat.length, flour: this.shelfItems.flour.length }, pile: this.state.moneyPile,
      customers: this.customers.length, queue: this.queue.length, unlocked: this.state.unlocked, mill: this.state.mill,
    };
  }

  /** Test helper: grants coins/earnings (only exposed with ?debug). */
  debugGrant(coins: number) {
    this.state.coins += coins;
    this.state.earned += coins;
    this.hud.set('coins', this.state.coins);
    this.refreshLevel(true);
  }

  private welcome(fresh: boolean) {
    if (fresh) return; // the profile card greets new players
    if (Date.now() - this.state.savedAt > 60_000) setTimeout(() => toast(this.ui, 'Bentornato! Il grano è ricresciuto.'), 700);
  }
}
