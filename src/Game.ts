import * as THREE from 'three';
import config from './data/config.json';
import map from './data/map.json';
import { World } from './scene/World';
import { CameraRig } from './scene/CameraRig';
import { buildTerrain, type Colliders } from './scene/Terrain';
import { CropInstancer, windUniform } from './entities/Crops';
import { Field } from './entities/Field';
import { cone, merge, place, rbox, vertexColorMaterial } from './entities/geo';
import { makeBarnGeometry, makeCoinGeometry, makeHouseGeometry, makeWheatBundleGeometry } from './entities/props';
import { Character, randomLook } from './entities/Character';
import { Pad } from './entities/Pad';
import { Shop } from './entities/Shop';
import { BALANCE, plotProgress, type GameState } from './systems/State';
import { loadGame, saveGame } from './systems/Save';
import { ease, tween, updateTweens } from './systems/Tween';
import { Hud, toast } from './ui/Hud';
import { Joystick } from './ui/Joystick';
import { flyItems, floatText } from './ui/FlyFx';
import { iconImg } from './ui/icons';

type PadDef = (typeof BALANCE.pads)[number];

interface Customer {
  char: Character;
  state: 'enter' | 'shopping' | 'toQueue' | 'queue' | 'leave' | 'exit';
  want: number;
  items: THREE.Mesh[];
  /** Items still flying toward this customer. */
  incoming: number;
  spot: number;
  timer: number;
  tag: HTMLElement;
  tagText: HTMLElement;
}

const STACK_STEP = 0.24;
const PLAYER_RADIUS = 0.35;

export class Game {
  private world: World;
  private rig: CameraRig;
  private ui: HTMLElement;
  private hud: Hud;
  private joy: Joystick;
  private state: GameState;
  private colliders: Colliders = { boxes: [], circles: [] };

  private player: Character;
  private stack: THREE.Mesh[] = [];
  private incoming = 0;
  private capacity = BALANCE.player.capacity;
  private maxTag: HTMLElement;

  private fields: Field[] = [];
  private shop: Shop;
  private shelfItems: THREE.Mesh[] = [];
  private shelfIncoming = 0;
  private dropPad: Pad;
  private cashierPad: Pad;
  private moneyPad: Pad;
  private moneyMeshes: THREE.Mesh[] = [];
  private upgrades = new Map<string, { def: PadDef; pad: Pad }>();
  private cashierNpc: Character | null = null;

  private customers: Customer[] = [];
  private queue: Customer[] = [];
  private spawnTimer = 1.5;
  private checkoutTimer = 0;

  private arrow: THREE.Group;
  private wheatGeo = makeWheatBundleGeometry();
  private coinGeo = makeCoinGeometry();

  private timers = { harvest: 0, drop: 0, pay: 0, payFx: 0 };
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

    // Buildings (decor for now).
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
    this.dropPad = new Pad('drop', s.dropPad.x, s.dropPad.z, 1.7, 1.7, 'Grano');
    this.cashierPad = new Pad('cashier', s.cashierPad.x, s.cashierPad.z, 1.5, 1.5, 'Cassa');
    this.moneyPad = new Pad('money', s.moneyPad.x, s.moneyPad.z, 1.5, 1.5);
    scene.add(this.dropPad.mesh, this.cashierPad.mesh, this.moneyPad.mesh);

    for (const def of BALANCE.pads) {
      if (this.state.unlocked.includes(def.id)) continue;
      const pad = new Pad(def.soon ? 'soon' : 'upgrade', def.x, def.z, def.w, def.d, def.label);
      scene.add(pad.mesh);
      this.upgrades.set(def.id, { def, pad });
      this.drawPad(def.id);
    }
    if (this.state.unlocked.includes('backpack')) this.capacity = BALANCE.player.capacityUpgraded;
    if (this.state.unlocked.includes('cashier')) this.hireCashier(false);

    // Player.
    this.player = new Character({ skin: '#ffd2b0', hair: '#7a3b1c', shirt: '#e8453c', pants: '#3f6fb8', hat: true });
    this.player.position.set(map.playerStart.x, 0, map.playerStart.z);
    scene.add(this.player.root);
    this.rig.follow(this.player.position.x, this.player.position.z, 0, true);

    // Restore stock that was saved.
    for (let i = 0; i < this.state.carry; i++) this.addToStack(this.makeItem());
    for (let i = 0; i < this.state.shelf; i++) this.placeOnShelf(this.makeItem(), i);
    this.rebuildMoneyPile();

    // Guide arrow.
    this.arrow = new THREE.Group();
    const arrowMesh = new THREE.Mesh(
      merge([place(cone(0.42, 0.6, '#38b6ff', 12), 0, 0.3, 0, Math.PI), place(rbox(0.32, 0.6, 0.32, 0.08, '#38b6ff'), 0, 0.85, 0)]),
      vertexColorMaterial,
    );
    arrowMesh.castShadow = true;
    this.arrow.add(arrowMesh);
    scene.add(this.arrow);

    // UI.
    this.hud = new Hud(uiEl);
    this.hud.addCounter('coins', 'coin', this.state.coins);
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

  // =================================================================== loop

  private frame() {
    const t = performance.now();
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const now = Date.now();

    windUniform.value += dt;
    updateTweens(dt);
    this.movePlayer(dt);
    this.harvest(dt, now);
    this.dropAtShelf(dt);
    this.updateCustomers(dt);
    this.checkout(dt);
    this.collectMoney();
    this.payUpgrades(dt);
    this.renderFields(now);
    this.updateArrow(dt, now);
    this.updateStackSway(dt);

    for (const p of [this.dropPad, this.cashierPad, this.moneyPad]) p.update(dt, p.contains(this.player.position.x, this.player.position.z));
    for (const { pad } of this.upgrades.values()) pad.update(dt, pad.contains(this.player.position.x, this.player.position.z));

    this.rig.follow(this.player.position.x, this.player.position.z, dt);
    this.world.follow(this.rig.target, this.rig.distance);
    this.placeTags();

    this.saveTimer += dt;
    if (this.dirty && this.saveTimer > config.saveIntervalSeconds) this.save();
    this.world.render();
  }

  private save() {
    this.state.carry = this.stack.length;
    this.state.shelf = this.shelfItems.length;
    saveGame(this.state);
    this.dirty = false;
    this.saveTimer = 0;
  }

  // =================================================================== player

  private movePlayer(dt: number) {
    this.joy.update();
    const d = this.joy.dir;
    const mx = this.rig.screenRight.x * d.x + this.rig.screenDown.x * d.y;
    const mz = this.rig.screenRight.z * d.x + this.rig.screenDown.z * d.y;
    const mag = Math.hypot(mx, mz);
    const p = this.player.position;
    if (mag > 0.01) {
      const speed = BALANCE.player.speed * Math.min(1, mag);
      p.x += (mx / mag) * speed * dt;
      p.z += (mz / mag) * speed * dt;
      this.player.face(mx, mz, dt);
      this.collide(p);
    }
    this.player.moving = Math.min(1, mag);
    this.player.carrying = this.stack.length + this.incoming > 0;
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

  // =================================================================== items

  private makeItem() {
    const m = new THREE.Mesh(this.wheatGeo, vertexColorMaterial);
    m.castShadow = true;
    return m;
  }

  private addToStack(item: THREE.Mesh) {
    this.player.hands.add(item);
    item.position.set(0, this.stack.length * STACK_STEP, 0);
    item.rotation.set(0, 0, 0);
    item.scale.setScalar(1);
    this.stack.push(item);
  }

  /** Local position (in the player's hands) of stack slot n. */
  private stackSlot(n: number) {
    return new THREE.Vector3(0, n * STACK_STEP, 0);
  }

  /** Stack leans opposite to movement like a wobbly tower. */
  private updateStackSway(dt: number) {
    const lean = this.player.moving * 0.035;
    this.stack.forEach((it, i) => {
      const target = -lean * i;
      it.position.z += (target - it.position.z) * Math.min(1, dt * 10);
      it.position.y = i * STACK_STEP;
    });
  }

  /**
   * Moves a mesh along an arc between two world points (re-evaluating the end
   * point each frame so moving targets are tracked), then calls done().
   */
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
    if (this.timers.harvest > 0) return;
    if (this.carried >= this.capacity) return;
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
        // the cut wheat springs up then the plot resets to a sprout
        f.setPop(i, 0);
        tween(0.35, (k) => f.setPop(i, ease.outBack(k)));
        const item = this.makeItem();
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

  // =================================================================== shop

  private placeOnShelf(item: THREE.Mesh, n: number) {
    this.world.scene.add(item);
    item.position.copy(this.shop.slot(n));
    item.rotation.set(0, 0, 0);
    this.shelfItems.push(item);
  }

  private dropAtShelf(dt: number) {
    this.timers.drop -= dt;
    if (this.timers.drop > 0 || this.stack.length === 0) return;
    if (!this.dropPad.contains(this.player.position.x, this.player.position.z, 0.1)) return;
    if (this.shelfItems.length + this.shelfIncoming >= BALANCE.shop.shelfCapacity) return;
    this.timers.drop = 0.08;
    const item = this.stack.pop()!;
    const from = item.getWorldPosition(new THREE.Vector3());
    this.player.hands.remove(item);
    const n = this.shelfItems.length + this.shelfIncoming;
    this.shelfIncoming++;
    this.arc(item, from, () => this.shop.slot(n), 0.3, () => {
      this.shelfIncoming--;
      this.placeOnShelf(item, this.shelfItems.length);
    }, 0.9);
    this.dirty = true;
  }

  private updateCustomers(dt: number) {
    const s = map.shop;
    // Spawn when a shelf spot is free.
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
          const pastGate = c.char.position.x < gp.x + 0.1;
          if (!pastGate) c.char.walkTo(gp, speed, dt);
          else if (c.char.walkTo(s.pickSpots[c.spot], speed, dt)) {
            c.state = 'shopping';
            c.char.face(-1, 0, 1);
          }
          break;
        }
        case 'shopping': {
          c.char.moving = 0;
          c.timer -= dt;
          if (c.timer <= 0 && c.items.length + c.incoming < c.want && this.shelfItems.length > 0) {
            c.timer = 0.3;
            const item = this.shelfItems.pop()!;
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
          if (c.items.length >= c.want && c.incoming === 0) {
            c.state = 'toQueue';
            this.queue.push(c);
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
    const tag = document.createElement('div');
    tag.className = 'want-tag';
    const text = document.createElement('span');
    tag.append(iconImg('wheat'), text);
    this.ui.appendChild(tag);
    const { wantMin, wantMax } = BALANCE.shop;
    this.customers.push({
      char, state: 'enter', want: wantMin + Math.floor(Math.random() * (wantMax - wantMin + 1)),
      items: [], incoming: 0, spot, timer: 0, tag, tagText: text,
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
    } else if (c.state === 'queue' && this.queue[0] === c && !this.cashierNpc && !this.onCashier()) {
      show = true;
      c.tag.classList.add('pay');
      c.tagText.textContent = '';
    }
    c.tag.style.display = show ? '' : 'none';
    if (show) this.placeAbove(c.tag, c.char.position, 2.1);
  }

  private onCashier() {
    return this.cashierPad.contains(this.player.position.x, this.player.position.z, 0.1);
  }

  private checkout(dt: number) {
    const front = this.queue[0];
    if (!front || front.state !== 'queue') {
      this.checkoutTimer = 0;
      return;
    }
    if (!this.cashierNpc && !this.onCashier()) return;
    this.checkoutTimer += dt;
    if (this.checkoutTimer < BALANCE.shop.checkoutSeconds) return;
    this.checkoutTimer = 0;

    const value = front.items.length * BALANCE.wheat.price;
    this.queue.shift();
    front.state = 'leave';
    // Coins hop from the customer onto the pile next to the till.
    const from = front.char.position.clone().setY(1.2);
    const hops = Math.min(5, value);
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

  /** World position of the n-th coin in the pile on the money pad. */
  private moneySpot(n: number) {
    const s = map.shop.moneyPad;
    const col = n % 9, layer = Math.floor(n / 9);
    return new THREE.Vector3(s.x + ((col % 3) - 1) * 0.42, 0.06 + layer * 0.075, s.z + (Math.floor(col / 3) - 1) * 0.42);
  }

  private rebuildMoneyPile() {
    const visible = Math.min(54, Math.ceil(this.state.moneyPile / BALANCE.wheat.price));
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
    if (this.state.moneyPile <= 0) return;
    if (!this.moneyPad.contains(this.player.position.x, this.player.position.z, 0.2)) return;
    const value = this.state.moneyPile;
    this.state.moneyPile = 0;
    this.state.coins += value;
    this.dirty = true;
    // Coins jump to the player, then into the counter.
    const meshes = this.moneyMeshes.splice(0);
    meshes.forEach((m, i) => {
      const from = m.position.clone();
      this.world.scene.remove(m);
      setTimeout(() => this.arc(m, from, () => this.player.position.clone().setY(1.0), 0.25, () => {}, 0.8), i * 15);
    });
    const at = this.toScreen(this.player.position.clone().setY(1.4));
    floatText(this.ui, at, `+${value}`);
    this.flyCoinsToHud(at, value);
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

  // =================================================================== upgrades

  private drawPad(id: string) {
    const u = this.upgrades.get(id)!;
    const paid = this.state.padPaid[id] ?? 0;
    u.pad.draw(u.def.cost - paid, paid / u.def.cost);
  }

  private payUpgrades(dt: number) {
    this.timers.pay -= dt;
    this.timers.payFx -= dt;
    if (this.timers.pay > 0) return;
    const p = this.player.position;
    for (const [id, u] of this.upgrades) {
      if (u.def.soon || !u.pad.contains(p.x, p.z)) continue;
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
      toast(this.ui, `Ora porti fino a ${this.capacity} covoni!`);
    } else if (id === 'cashier') {
      this.hireCashier(true);
      toast(this.ui, 'Il cassiere serve i clienti al posto tuo!');
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

  // =================================================================== guidance

  /** Picks what the player should do next and floats an arrow over it. */
  private updateArrow(dt: number, now: number) {
    const p = this.player.position;
    let target: { x: number; z: number } | null = null;
    const ripe = this.fields.some((f) => this.fieldOpen(f) && this.state.plots[f.def.id].some((c) => plotProgress(c, now) >= 1));
    const waiting = this.queue[0]?.state === 'queue' && !this.cashierNpc;
    const nextPad = [...this.upgrades.values()].find((u) => !u.def.soon && this.state.coins >= Math.min(10, u.def.cost - (this.state.padPaid[u.def.id] ?? 0)));

    if (waiting && !this.onCashier()) target = map.shop.cashierPad;
    else if (this.stack.length > 0 && (this.carried >= this.capacity || !ripe) && this.shelfItems.length < BALANCE.shop.shelfCapacity) target = map.shop.dropPad;
    else if (this.state.moneyPile > 0) target = map.shop.moneyPad;
    else if (nextPad && this.stack.length === 0) target = nextPad.def;
    else if (this.carried < this.capacity && ripe) {
      // nearest open field
      let best = Infinity;
      for (const f of this.fields) {
        if (!this.fieldOpen(f)) continue;
        const d = Math.hypot(f.def.x - p.x, f.def.z - p.z);
        if (d < best) { best = d; target = f.def; }
      }
    } else if (this.stack.length > 0) target = map.shop.dropPad;

    const near = target && Math.hypot(target.x - p.x, target.z - p.z) < 1.6;
    // Fields are big: hide the arrow once the player is standing in one.
    const inField = target && this.fields.some((f) => f.def === target && Math.abs(p.x - f.def.x) < (f.def.cols * map.plotSize) / 2 && Math.abs(p.z - f.def.z) < (f.def.rows * map.plotSize) / 2);
    this.arrow.visible = !!target && !near && !inField;
    if (target && this.arrow.visible) {
      const bob = Math.sin(performance.now() / 180) * 0.25;
      this.arrow.position.x += (target.x - this.arrow.position.x) * Math.min(1, dt * 8);
      this.arrow.position.z += (target.z - this.arrow.position.z) * Math.min(1, dt * 8);
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
      x: p.x, z: p.z, coins: this.state.coins, carry: this.stack.length, shelf: this.shelfItems.length,
      pile: this.state.moneyPile, customers: this.customers.length, queue: this.queue.length, unlocked: this.state.unlocked,
    };
  }

  private welcome(fresh: boolean) {
    if (fresh) {
      setTimeout(() => toast(this.ui, 'Trascina il dito per camminare. Passa sul grano per raccoglierlo!'), 700);
      return;
    }
    if (Date.now() - this.state.savedAt > 60_000) setTimeout(() => toast(this.ui, 'Bentornato! Il grano è ricresciuto.'), 700);
  }
}
