import * as THREE from 'three';
import { COLORS } from '../config';
import { box, canvasTexture, cyl, mat, metal, sphere, torus, wood, Z } from '../util3d';
import { frameAt, newFrame, RAIL_TOP } from '../world/track';
import type { DerailPose } from '../world/world';
import { pop, snapShow } from '../fx';

export type Upgrade = 'code' | 'context';

/** Distance between the loco centre and the cargo cart centre. */
export const CAR_GAP = 3.0;

export interface Car {
  group: THREE.Group;
  /** Extra height while the cart drops onto the rails. */
  drop: number;
  crateSlots: THREE.Object3D[];
}

function makeMarkTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    const c = s / 2;
    const R = s * 0.44;
    g.strokeStyle = '#d97757';
    g.lineCap = 'round';
    g.lineWidth = s * 0.075;
    const lens = [1, 0.72, 0.9, 0.66, 1, 0.7, 0.88, 0.64, 1, 0.74, 0.9, 0.68];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2 ? 0.06 : -0.04);
      const r0 = R * 0.08;
      const r1 = R * lens[i];
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
  });
}

function makeGlyphTexture(kind: Upgrade): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.strokeStyle = '#ffffff';
    g.fillStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (kind === 'code') {
      g.lineWidth = s * 0.075;
      const y = s / 2;
      g.beginPath();
      g.moveTo(s * 0.33, s * 0.32);
      g.lineTo(s * 0.12, y);
      g.lineTo(s * 0.33, s * 0.68);
      g.moveTo(s * 0.67, s * 0.32);
      g.lineTo(s * 0.88, y);
      g.lineTo(s * 0.67, s * 0.68);
      g.moveTo(s * 0.57, s * 0.22);
      g.lineTo(s * 0.43, s * 0.78);
      g.stroke();
    } else {
      // page with three lines
      g.lineWidth = s * 0.06;
      const x = s * 0.27;
      const y = s * 0.14;
      const w = s * 0.46;
      const h = s * 0.72;
      const fold = s * 0.14;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w - fold, y);
      g.lineTo(x + w, y + fold);
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      g.stroke();
      for (let i = 0; i < 3; i++) {
        const ly = y + h * (0.4 + i * 0.18);
        g.beginPath();
        g.moveTo(x + w * 0.22, ly);
        g.lineTo(x + w * (i === 2 ? 0.6 : 0.78), ly);
        g.stroke();
      }
    }
  });
}

export function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.7, 0.7, 0.7, COLORS.crate, wood(COLORS.crate)));
  for (const y of [-0.22, 0.22]) {
    const band = box(0.74, 0.1, 0.74, COLORS.crateDark, wood(COLORS.crateDark));
    band.position.y = y;
    g.add(band);
  }
  const bandV = box(0.1, 0.74, 0.74, COLORS.crateDark, wood(COLORS.crateDark));
  g.add(bandV);
  return g;
}

export class Train {
  readonly group = new THREE.Group();
  readonly loco = new THREE.Group();
  readonly cars: Car[] = [];
  /** Where the human stands when driving (child of loco). */
  readonly cabSlot = new THREE.Object3D();
  /** Where the human stands when pushing: behind the loco, rear-left corner (child of loco). */
  readonly pushSlot = new THREE.Object3D();
  /** Where the ticket sits (child of loco). */
  readonly ticketSlot = new THREE.Object3D();
  /** The hovering Claude mark. */
  readonly mark: THREE.Sprite;
  /** Visible enhancements bolted onto the loco as it gains the codebase and the context. */
  readonly upgrades: Record<Upgrade, THREE.Group>;

  private readonly wheels: THREE.Mesh[] = [];
  private readonly f = newFrame();
  private t = 0;

  /** Distance along the main line (loco centre). */
  s = 0;
  speed = 0;
  /** Amount (0..1) of the current derail pose applied. */
  derailAmount = 0;
  derail: DerailPose = { lat: 0, lift: 0, roll: 0, pitch: 0, yaw: 0 };
  /** Shake amplitude (bumpy stretch). */
  shake = 0;
  /** Height of the wheels: rail top on rails, ground level on mud. */
  baseY = RAIL_TOP;
  /** Track lift at distance s (bumps), supplied by the world. */
  liftAt: (s: number) => number = () => 0;

  onSpur = false;
  spurS = 0;
  spurCurve: THREE.Curve<THREE.Vector3> | null = null;
  spurLen = 0;
  /** Main-line distance of the switch, used to place the cart while the loco is on the siding. */
  spurAnchorS = 0;

  constructor(
    private readonly main: THREE.Curve<THREE.Vector3>,
    readonly mainLen: number,
  ) {
    this.buildLoco();
    this.upgrades = { code: this.buildCodeUpgrade(), context: this.buildContextUpgrade() };
    for (const u of Object.values(this.upgrades)) {
      u.visible = false;
      u.scale.setScalar(0.001);
      this.loco.add(u);
    }
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeMarkTexture(), transparent: true, depthWrite: false }));
    this.mark.scale.setScalar(0.78);
    this.mark.position.set(0, 2.85, -0.9);
    this.loco.add(this.mark);
    this.group.add(this.loco);
  }

  private buildLoco(): void {
    const L = this.loco;
    const dark = mat(COLORS.locoDark, { roughness: 0.75, metalness: 0.2 });
    const body = mat(COLORS.loco, { roughness: 0.6, metalness: 0.3 });
    const mtl = metal(COLORS.metal);
    const mtlDark = metal(COLORS.metalDark);
    const wd = wood(COLORS.wood);
    const wdDark = wood(COLORS.woodDark);

    const chassis = box(1.3, 0.3, 3.3, COLORS.locoDark, dark);
    chassis.position.y = 0.45;
    L.add(chassis);
    for (const z of [1.65, -1.65]) {
      const beam = box(1.42, 0.24, 0.12, COLORS.metalDark, mtlDark);
      beam.position.set(0, 0.45, z);
      L.add(beam);
      for (const x of [-0.45, 0.45]) {
        const buffer = cyl(0.09, 0.09, 0.14, COLORS.metal, 12, mtl);
        buffer.rotation.x = Math.PI / 2;
        buffer.position.set(x, 0.45, z + Math.sign(z) * 0.1);
        L.add(buffer);
      }
    }
    for (const x of [-0.74, 0.74]) {
      const board = box(0.2, 0.06, 3.1, COLORS.wood, wd);
      board.position.set(x, 0.62, 0);
      L.add(board);
    }

    const boiler = cyl(0.55, 0.55, 2.0, COLORS.loco, 28, body);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.08, 0.45);
    L.add(boiler);
    for (const z of [1.05, 0.35, -0.3]) {
      const band = cyl(0.57, 0.57, 0.07, COLORS.metal, 28, mtl);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 1.08, z);
      L.add(band);
    }
    const smokebox = cyl(0.57, 0.57, 0.36, COLORS.metalDark, 28, mtlDark);
    smokebox.rotation.x = Math.PI / 2;
    smokebox.position.set(0, 1.08, 1.6);
    L.add(smokebox);
    const front = cyl(0.42, 0.42, 0.1, COLORS.metal, 28, mtl);
    front.rotation.x = Math.PI / 2;
    front.position.set(0, 1.08, 1.8);
    L.add(front);
    const chimney = cyl(0.15, 0.2, 0.6, COLORS.metalDark, 16, mtlDark);
    chimney.position.set(0, 1.9, 1.3);
    L.add(chimney);
    const cap = torus(0.19, 0.045, mtl, 20);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 2.18, 1.3);
    L.add(cap);
    const dome = sphere(0.23, COLORS.metal, 20, mtl);
    dome.scale.y = 0.8;
    dome.position.set(0, 1.62, 0.3);
    L.add(dome);
    const lamp = cyl(0.11, 0.11, 0.16, COLORS.metal, 14, mtl);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.62, 1.7);
    L.add(lamp);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      new THREE.MeshStandardMaterial({ color: COLORS.headlight, emissive: COLORS.headlight, emissiveIntensity: 2.2 }),
    );
    lens.position.set(0, 1.62, 1.785);
    L.add(lens);

    const spot = new THREE.SpotLight(COLORS.headlight, 60, 40, 0.46, 0.55, 1.4);
    spot.position.set(0, 1.62, 1.75);
    spot.target.position.set(0, -0.6, 16);
    L.add(spot, spot.target);

    // Open cab: low back wall, side walls, wooden panels, roof on posts
    const back = box(1.3, 0.75, 0.08, COLORS.wood, wd);
    back.position.set(0, 0.97, -1.55);
    L.add(back);
    for (const x of [-0.62, 0.62]) {
      const side = box(0.08, 0.85, 1.05, COLORS.wood, wd);
      side.position.set(x, 1.02, -1.0);
      L.add(side);
      for (const z of [-1.5, -0.55]) {
        const post = cyl(0.035, 0.035, 1.3, COLORS.metalDark, 10, mtlDark);
        post.position.set(x, 1.95, z);
        L.add(post);
      }
    }
    const frontWall = box(1.3, 1.3, 0.1, COLORS.loco, body);
    frontWall.position.set(0, 1.25, -0.5);
    L.add(frontWall);
    const roof = box(1.55, 0.07, 1.25, COLORS.woodDark, wdDark);
    roof.position.set(0, 2.14, -1.03);
    L.add(roof);
    const railTop = box(1.4, 0.06, 0.1, COLORS.metal, mtl);
    railTop.position.set(0, 1.37, -1.55);
    L.add(railTop);

    for (const z of [-1.0, 0, 1.0]) {
      for (const x of [-0.66, 0.66]) {
        const w = cyl(0.3, 0.3, 0.12, COLORS.wheel, 24, mat(COLORS.wheel, { roughness: 0.6, metalness: 0.4 }));
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.3, z);
        L.add(w);
        this.wheels.push(w);
        const rim = torus(0.27, 0.035, mtl, 24);
        rim.rotation.y = Math.PI / 2;
        rim.position.set(x + Math.sign(x) * 0.065, 0.3, z);
        L.add(rim);
        const hub = cyl(0.08, 0.08, 0.16, COLORS.metal, 10, mtl);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, 0.3, z);
        L.add(hub);
      }
    }
    const coupling = box(0.1, 0.1, 0.4, COLORS.metalDark, mtlDark);
    coupling.position.set(0, 0.45, -1.85);
    L.add(coupling);

    this.cabSlot.position.set(0, 0.45, -1.05);
    this.pushSlot.position.set(0.5, -RAIL_TOP, -2.45);
    this.ticketSlot.position.set(0.3, 1.45, -1.62);
    L.add(this.cabSlot, this.pushSlot, this.ticketSlot);
  }

  /** A glyph plate bolted onto both flanks of the cab. */
  private plate(kind: Upgrade, z: number): THREE.Group {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3 });
    const tex = makeGlyphTexture(kind);
    for (const side of [-1, 1]) {
      const frame = box(0.05, 0.5, 0.5, 0xffffff, frameMat);
      frame.position.set(side * 0.68, 1.05, z);
      g.add(frame);
      const inner = box(0.06, 0.42, 0.42, COLORS.locoDark, mat(COLORS.locoDark, { roughness: 0.8 }));
      inner.position.set(side * 0.69, 1.05, z);
      g.add(inner);
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      glyph.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      glyph.position.set(side * 0.725, 1.05, z);
      g.add(glyph);
    }
    return g;
  }

  /** Phase 2: the codebase, a code plate on the cab and a pair of extra lamps. */
  private buildCodeUpgrade(): THREE.Group {
    const g = this.plate('code', -1.22);
    const mtl = metal(COLORS.metal);
    for (const x of [-0.42, 0.42]) {
      const lamp = cyl(0.08, 0.08, 0.14, COLORS.metal, 12, mtl);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(x, 0.72, 1.7);
      g.add(lamp);
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.065, 14),
        new THREE.MeshStandardMaterial({ color: COLORS.headlight, emissive: COLORS.headlight, emissiveIntensity: 2 }),
      );
      lens.position.set(x, 0.72, 1.775);
      g.add(lens);
    }
    return g;
  }

  /** Phase 3: the context, a page plate and an antenna with a ring on the cab roof. */
  private buildContextUpgrade(): THREE.Group {
    const g = this.plate('context', -0.72);
    const mtl = metal(COLORS.metal);
    const mast = cyl(0.03, 0.035, 0.75, COLORS.metal, 10, mtl);
    mast.position.set(0.42, 2.14 + 0.375, -1.35);
    g.add(mast);
    const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 });
    const ring = torus(0.16, 0.025, glow, 24);
    ring.position.set(0.42, 2.14 + 0.78, -1.35);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const tip = sphere(0.045, 0xffffff, 10, glow);
    tip.position.set(0.42, 2.14 + 0.78, -1.35);
    g.add(tip);
    return g;
  }

  setUpgrade(kind: Upgrade, on: boolean, animate = false): void {
    const u = this.upgrades[kind];
    if (animate && on) pop(u, 0.55);
    else snapShow(u, on);
  }

  private buildCart(): Car {
    const W = new THREE.Group();
    const dark = mat(COLORS.locoDark, { roughness: 0.75, metalness: 0.2 });
    const mtl = metal(COLORS.metal);
    const wd = wood(COLORS.wood);
    const wdDark = wood(COLORS.woodDark);

    const chassis = box(1.2, 0.22, 2.5, COLORS.locoDark, dark);
    chassis.position.y = 0.42;
    W.add(chassis);
    const floor = box(1.24, 0.08, 2.4, COLORS.wood, wd);
    floor.position.y = 0.57;
    W.add(floor);
    const plankY = [0.7, 0.87, 1.04];
    for (const x of [-0.6, 0.6]) {
      for (const y of plankY) {
        const plank = box(0.07, 0.13, 2.4, COLORS.wood, wd);
        plank.position.set(x, y, 0);
        W.add(plank);
      }
      for (const z of [-1.17, 0, 1.17]) {
        const post = box(0.1, 0.6, 0.1, COLORS.woodDark, wdDark);
        post.position.set(x, 0.85, z);
        W.add(post);
      }
    }
    for (const z of [-1.2, 1.2]) {
      for (const y of plankY) {
        const plank = box(1.2, 0.13, 0.07, COLORS.wood, wd);
        plank.position.set(0, y, z);
        W.add(plank);
      }
    }
    for (const z of [-0.85, 0.85]) {
      for (const x of [-0.64, 0.64]) {
        const w = cyl(0.27, 0.27, 0.1, COLORS.wheel, 24, mat(COLORS.wheel, { roughness: 0.6, metalness: 0.4 }));
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.27, z);
        W.add(w);
        this.wheels.push(w);
        const rim = torus(0.24, 0.03, mtl, 24);
        rim.rotation.y = Math.PI / 2;
        rim.position.set(x + Math.sign(x) * 0.055, 0.27, z);
        W.add(rim);
      }
    }
    const coupling = box(0.1, 0.1, 0.5, COLORS.metalDark, metal(COLORS.metalDark));
    coupling.position.set(0, 0.42, 1.45);
    W.add(coupling);

    const crateSlots: THREE.Object3D[] = [];
    for (const z of [-0.74, 0, 0.74]) {
      const slot = new THREE.Object3D();
      slot.position.set(0, 0.61 + 0.35, z);
      W.add(slot);
      crateSlots.push(slot);
    }
    return { group: W, drop: 0, crateSlots };
  }

  /** Couple the cargo cart onto the back of the loco. */
  addCart(): Car {
    const car = this.buildCart();
    this.cars.push(car);
    this.group.add(car.group);
    this.placeAll();
    return car;
  }

  removeCars(): void {
    for (const c of this.cars) {
      this.group.remove(c.group);
      for (const w of [...this.wheels]) if (c.group.getObjectById(w.id)) this.wheels.splice(this.wheels.indexOf(w), 1);
    }
    this.cars.length = 0;
  }

  reset(): void {
    this.s = 0;
    this.speed = 0;
    this.derailAmount = 0;
    this.shake = 0;
    this.onSpur = false;
    this.spurS = 0;
    this.removeCars();
    this.placeAll();
  }

  worldPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.loco.position);
  }

  /** Forward direction of the loco in world space. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(this.loco.quaternion).setY(0).normalize();
  }

  /** Right of travel (camera side) in world space. */
  right(out: THREE.Vector3): THREE.Vector3 {
    this.forward(out);
    return out.set(-out.z, 0, out.x);
  }

  /** Frame for a point `d` behind the loco centre, straddling the siding when needed. */
  frameBehind(d: number, f = this.f): { f: typeof f; lift: number } {
    if (this.onSpur && this.spurCurve) {
      const ss = this.spurS - d;
      if (ss >= 0) {
        frameAt(this.spurCurve, ss / this.spurLen, f);
        return { f, lift: 0 };
      }
      const ms = this.spurAnchorS + ss;
      frameAt(this.main, ms / this.mainLen, f);
      return { f, lift: this.liftAt(ms) };
    }
    const ms = this.s - d;
    frameAt(this.main, ms / this.mainLen, f);
    return { f, lift: this.liftAt(ms) };
  }

  private placeAll(): void {
    const loco = this.frameBehind(0);
    this.place(this.loco, loco.f, loco.lift, this.derailAmount, 0);
    this.cars.forEach((c, i) => {
      const r = this.frameBehind(CAR_GAP * (i + 1));
      this.place(c.group, r.f, r.lift + c.drop, 0, 1.3 + i);
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.pushSlot.position.y = -this.baseY;
    this.placeAll();
    const spin = (this.speed * dt) / 0.3;
    for (const w of this.wheels) w.rotation.x += spin;
    const moving = Math.abs(this.speed) > 0.05;
    this.mark.position.y = 2.85 + (moving ? Math.sin(this.t * 3.1) * 0.06 : 0);
  }

  private place(obj: THREE.Object3D, f: { pos: THREE.Vector3; tan: THREE.Vector3; right: THREE.Vector3 }, lift: number, amt: number, ph: number): void {
    obj.position.copy(f.pos);
    obj.position.y = this.baseY + lift;
    obj.quaternion.setFromUnitVectors(Z, f.tan);
    const sh = this.shake;
    if (sh > 0.001) {
      obj.position.y += Math.abs(Math.sin(this.t * 23 + ph * 2)) * 0.05 * sh;
      obj.rotateZ(Math.sin(this.t * 19 + ph) * 0.06 * sh);
      obj.rotateX(Math.sin(this.t * 27 + ph) * 0.025 * sh);
    }
    if (amt > 0.001) {
      const d = this.derail;
      obj.position.addScaledVector(f.right, d.lat * amt);
      obj.position.y += d.lift * amt;
      obj.rotateY(d.yaw * amt);
      obj.rotateX(d.pitch * amt);
      obj.rotateZ(d.roll * amt);
    }
  }
}
