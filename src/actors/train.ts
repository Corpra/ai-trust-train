import * as THREE from 'three';
import { COLORS } from '../config';
import { box, canvasTexture, cyl, mat, sphere, torus, Z } from '../util3d';
import { frameAt, newFrame, RAIL_TOP } from '../world/track';
import type { DerailPose } from '../world/world';
import { pop, snapShow } from '../fx';

export type Upgrade = 'code' | 'context';

/** Distance between the loco centre and the cargo wagon centre. */
export const CAR_GAP = 3.1;

export interface Car {
  group: THREE.Group;
  /** Extra height while the wagon drops onto the rails. */
  drop: number;
  crateSlots: THREE.Object3D[];
}

/* ---------- materials ---------- */

const gunmetal = (): THREE.MeshStandardMaterial => mat(COLORS.loco, { roughness: 0.42, metalness: 0.65 });
const darkSteel = (): THREE.MeshStandardMaterial => mat(COLORS.locoDark, { roughness: 0.5, metalness: 0.6 });
const steel = (): THREE.MeshStandardMaterial => mat(COLORS.metal, { roughness: 0.28, metalness: 0.9 });
const wheelMat = (): THREE.MeshStandardMaterial => mat(COLORS.wheel, { roughness: 0.55, metalness: 0.5 });
const glass = (): THREE.MeshStandardMaterial => mat(0x0a0d12, { roughness: 0.12, metalness: 0.7 });

/* ---------- textures ---------- */

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
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (kind === 'code') {
      g.lineWidth = s * 0.07;
      const y = s / 2;
      g.beginPath();
      g.moveTo(s * 0.34, s * 0.33);
      g.lineTo(s * 0.14, y);
      g.lineTo(s * 0.34, s * 0.67);
      g.moveTo(s * 0.66, s * 0.33);
      g.lineTo(s * 0.86, y);
      g.lineTo(s * 0.66, s * 0.67);
      g.moveTo(s * 0.56, s * 0.24);
      g.lineTo(s * 0.44, s * 0.76);
      g.stroke();
    } else {
      g.lineWidth = s * 0.055;
      const x = s * 0.28;
      const y = s * 0.15;
      const w = s * 0.44;
      const h = s * 0.7;
      const fold = s * 0.13;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w - fold, y);
      g.lineTo(x + w, y + fold);
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      g.stroke();
      for (let i = 0; i < 3; i++) {
        const ly = y + h * (0.42 + i * 0.17);
        g.beginPath();
        g.moveTo(x + w * 0.22, ly);
        g.lineTo(x + w * (i === 2 ? 0.58 : 0.78), ly);
        g.stroke();
      }
    }
  });
}

export function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.6, 0.6, 0.6, COLORS.crate, mat(COLORS.crate, { roughness: 0.9 }));
  body.name = 'body';
  g.add(body);
  for (const y of [-0.17, 0.17]) {
    const band = box(0.62, 0.05, 0.62, COLORS.crateDark, mat(COLORS.crateDark, { roughness: 0.8 }));
    band.position.y = y;
    g.add(band);
  }
  return g;
}

/** Tint a crate: `ok` paints it the approval green, otherwise the rejection red. */
export function paintCrate(crate: THREE.Group, ok: boolean): void {
  const body = crate.getObjectByName('body') as THREE.Mesh | undefined;
  if (!body) return;
  // materials from mat() are shared by colour, so give this crate its own before tinting it
  const m = (body.material as THREE.MeshStandardMaterial).clone();
  body.material = m;
  m.color.set(ok ? COLORS.ok : COLORS.bad);
  m.emissive.set(ok ? COLORS.ok : COLORS.bad);
  m.emissiveIntensity = 0.25;
}

/* ---------- the train ---------- */

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
  /** Visible enhancements on the loco: stickers on the rear bulkhead, plus an antenna for the context. */
  readonly upgrades: Record<Upgrade, THREE.Group>;

  private readonly wheels: THREE.Mesh[] = [];
  private readonly drivers: THREE.Group[] = [];
  private readonly rods: { m: THREE.Mesh; side: number; phase: number }[] = [];
  private readonly f = newFrame();
  private t = 0;
  private wheelAngle = 0;

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
  /** Main-line distance of the switch, used to place the wagon while the loco is on the siding. */
  spurAnchorS = 0;

  constructor(
    private readonly main: THREE.Curve<THREE.Vector3>,
    readonly mainLen: number,
  ) {
    this.buildLoco();
    this.upgrades = { code: this.buildSticker('code', 0.32), context: this.buildContextUpgrade() };
    for (const u of Object.values(this.upgrades)) {
      u.visible = false;
      u.scale.setScalar(0.001);
      this.loco.add(u);
    }
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeMarkTexture(), transparent: true, depthWrite: false }));
    this.mark.scale.setScalar(0.78);
    this.mark.position.set(0, 2.75, 0.35);
    this.loco.add(this.mark);
    this.group.add(this.loco);
  }

  /** A spoked driving wheel with a steel tyre. */
  private driver(x: number, z: number, r: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, r, z);
    const tyre = torus(r - 0.04, 0.045, steel(), 32);
    tyre.rotation.y = Math.PI / 2;
    g.add(tyre);
    const rim = cyl(r - 0.06, r - 0.06, 0.06, COLORS.wheel, 32, wheelMat());
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    const hub = cyl(0.08, 0.08, 0.12, COLORS.metal, 14, steel());
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    for (let i = 0; i < 8; i++) {
      const spoke = box(0.035, (r - 0.08) * 2, 0.03, COLORS.metal, steel());
      spoke.rotation.x = (i * Math.PI) / 8;
      g.add(spoke);
    }
    this.drivers.push(g);
    return g;
  }

  private buildLoco(): void {
    const L = this.loco;
    const body = gunmetal();
    const dark = darkSteel();
    const st = steel();

    // frame, buffer beams, buffers
    const frame = box(1.3, 0.22, 3.7, COLORS.locoDark, dark);
    frame.position.y = 0.55;
    L.add(frame);
    for (const z of [1.86, -1.86]) {
      const beam = box(1.44, 0.32, 0.1, COLORS.locoDark, dark);
      beam.position.set(0, 0.52, z);
      L.add(beam);
      for (const x of [-0.44, 0.44]) {
        const buffer = cyl(0.085, 0.085, 0.18, COLORS.metal, 14, st);
        buffer.rotation.x = Math.PI / 2;
        buffer.position.set(x, 0.52, z + Math.sign(z) * 0.12);
        L.add(buffer);
      }
    }
    for (const x of [-0.76, 0.76]) {
      const board = box(0.22, 0.05, 3.3, COLORS.locoDark, dark);
      board.position.set(x, 0.68, 0);
      L.add(board);
    }

    // driving wheels and connecting rods
    for (const side of [-1, 1]) {
      for (const z of [-1.0, 0.05, 1.1]) L.add(this.driver(side * 0.6, z, 0.36));
      const rod = box(0.05, 0.07, 2.35, COLORS.metal, st);
      L.add(rod);
      this.rods.push({ m: rod, side, phase: side > 0 ? 0 : Math.PI / 2 });
      // steam cylinder at the front
      const cylinder = box(0.3, 0.32, 0.62, COLORS.locoDark, dark);
      cylinder.position.set(side * 0.62, 0.6, 1.35);
      L.add(cylinder);
    }

    // boiler, bands, smokebox, door
    const boiler = cyl(0.5, 0.5, 2.2, COLORS.loco, 36, body);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.15, 0.45);
    L.add(boiler);
    for (const z of [1.15, 0.45, -0.25]) {
      const band = cyl(0.515, 0.515, 0.06, COLORS.metal, 36, st);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 1.15, z);
      L.add(band);
    }
    const smokebox = cyl(0.52, 0.52, 0.42, COLORS.locoDark, 36, dark);
    smokebox.rotation.x = Math.PI / 2;
    smokebox.position.set(0, 1.15, 1.76);
    L.add(smokebox);
    const door = cyl(0.44, 0.47, 0.06, COLORS.locoDark, 36, dark);
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 1.15, 1.99);
    L.add(door);
    const doorRing = torus(0.42, 0.015, st, 36);
    doorRing.position.set(0, 1.15, 2.02);
    L.add(doorRing);
    const doorHub = cyl(0.07, 0.07, 0.05, COLORS.metal, 14, st);
    doorHub.rotation.x = Math.PI / 2;
    doorHub.position.set(0, 1.15, 2.03);
    L.add(doorHub);
    const handle = box(0.42, 0.025, 0.025, COLORS.metal, st);
    handle.position.set(0, 1.15, 2.05);
    handle.rotation.z = 0.5;
    L.add(handle);

    // chimney, domes, valves, handrails
    const chimney = cyl(0.13, 0.18, 0.55, COLORS.locoDark, 20, dark);
    chimney.position.set(0, 1.92, 1.76);
    L.add(chimney);
    const cap = torus(0.17, 0.035, st, 24);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 2.18, 1.76);
    L.add(cap);
    const dome = sphere(0.22, COLORS.loco, 24, body);
    dome.scale.y = 0.85;
    dome.position.set(0, 1.62, 0.7);
    L.add(dome);
    const domeBase = cyl(0.23, 0.26, 0.08, COLORS.metal, 24, st);
    domeBase.position.set(0, 1.5, 0.7);
    L.add(domeBase);
    const sandDome = sphere(0.17, COLORS.loco, 20, body);
    sandDome.scale.y = 0.8;
    sandDome.position.set(0, 1.6, 0.0);
    L.add(sandDome);
    for (const x of [-0.07, 0.07]) {
      const valve = cyl(0.03, 0.03, 0.16, COLORS.metal, 10, st);
      valve.position.set(x, 1.72, -0.42);
      L.add(valve);
    }
    for (const x of [-0.54, 0.54]) {
      const rail = cyl(0.014, 0.014, 2.1, COLORS.metal, 8, st);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(x, 1.42, 0.55);
      L.add(rail);
      for (const z of [1.4, 0.55, -0.3]) {
        const bracket = cyl(0.012, 0.012, 0.1, COLORS.metal, 6, st);
        bracket.rotation.z = Math.PI / 2;
        bracket.position.set(x * 0.95, 1.4, z);
        L.add(bracket);
      }
    }

    // headlamp
    const lamp = cyl(0.1, 0.1, 0.18, COLORS.metal, 16, st);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 1.8, 1.9);
    L.add(lamp);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 16),
      new THREE.MeshStandardMaterial({ color: COLORS.headlight, emissive: COLORS.headlight, emissiveIntensity: 2.2 }),
    );
    lens.position.set(0, 1.8, 1.995);
    L.add(lens);
    const spot = new THREE.SpotLight(COLORS.headlight, 60, 40, 0.46, 0.55, 1.4);
    spot.position.set(0, 1.8, 1.95);
    spot.target.position.set(0, -0.6, 16);
    L.add(spot, spot.target);

    // cab: steel, windows, roof, open to the rear above a low bulkhead
    const floor = box(1.3, 0.06, 1.2, COLORS.locoDark, dark);
    floor.position.set(0, 0.69, -1.2);
    L.add(floor);
    const gl = glass();
    for (const x of [-0.65, 0.65]) {
      const wall = box(0.06, 1.5, 1.2, COLORS.loco, body);
      wall.position.set(x, 1.47, -1.2);
      L.add(wall);
      const win = box(0.02, 0.5, 0.55, 0x000000, gl);
      win.position.set(x * 1.03, 1.68, -1.12);
      L.add(win);
      const sill = box(0.03, 0.02, 0.6, COLORS.metal, st);
      sill.position.set(x * 1.04, 1.42, -1.12);
      L.add(sill);
    }
    const frontWall = box(1.36, 1.56, 0.06, COLORS.loco, body);
    frontWall.position.set(0, 1.5, -0.62);
    L.add(frontWall);
    for (const x of [-0.36, 0.36]) {
      const win = box(0.36, 0.4, 0.02, 0x000000, gl);
      win.position.set(x, 1.78, -0.585);
      L.add(win);
    }
    const bulkhead = box(1.36, 0.6, 0.06, COLORS.loco, body);
    bulkhead.position.set(0, 0.99, -1.78);
    L.add(bulkhead);
    const bulkRail = cyl(0.015, 0.015, 1.3, COLORS.metal, 8, st);
    bulkRail.rotation.z = Math.PI / 2;
    bulkRail.position.set(0, 1.31, -1.78);
    L.add(bulkRail);
    const roof = box(1.56, 0.05, 1.42, COLORS.locoDark, dark);
    roof.position.set(0, 2.25, -1.2);
    L.add(roof);
    const roofTop = box(1.2, 0.05, 1.2, COLORS.locoDark, dark);
    roofTop.position.set(0, 2.3, -1.2);
    L.add(roofTop);
    const coupling = box(0.08, 0.1, 0.4, COLORS.metal, st);
    coupling.position.set(0, 0.5, -2.0);
    L.add(coupling);

    this.cabSlot.position.set(0, 0.72, -1.2);
    this.pushSlot.position.set(0.5, -RAIL_TOP, -2.6);
    this.ticketSlot.position.set(0.45, 1.34, -1.72);
    L.add(this.cabSlot, this.pushSlot, this.ticketSlot);
  }

  /** A sticker on the rear bulkhead, facing the camera. */
  private buildSticker(kind: Upgrade, x: number): THREE.Group {
    const g = new THREE.Group();
    const frame = box(0.42, 0.42, 0.02, 0xffffff, mat(0xf4f4f6, { emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 }));
    frame.position.set(x, 0.99, -1.82);
    g.add(frame);
    const inner = box(0.36, 0.36, 0.02, COLORS.locoDark, mat(COLORS.locoDark, { roughness: 0.85 }));
    inner.position.set(x, 0.99, -1.825);
    g.add(inner);
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ map: makeGlyphTexture(kind), transparent: true, depthWrite: false }));
    glyph.rotation.y = Math.PI;
    glyph.position.set(x, 0.99, -1.84);
    g.add(glyph);
    return g;
  }

  /** Phase 3: the context sticker plus an antenna on the cab roof. */
  private buildContextUpgrade(): THREE.Group {
    const g = this.buildSticker('context', -0.32);
    const st = steel();
    const mast = cyl(0.014, 0.018, 0.55, COLORS.metal, 10, st);
    mast.position.set(0.48, 2.3 + 0.275, -1.6);
    g.add(mast);
    const glow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 });
    const ring = torus(0.1, 0.014, glow, 24);
    ring.position.set(0.48, 2.3 + 0.58, -1.6);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    return g;
  }

  setUpgrade(kind: Upgrade, on: boolean, animate = false): void {
    const u = this.upgrades[kind];
    if (animate && on) pop(u, 0.55);
    else snapShow(u, on);
  }

  /** A low-sided steel wagon for the crates. */
  private buildWagon(): Car {
    const W = new THREE.Group();
    const dark = darkSteel();
    const body = gunmetal();
    const st = steel();
    const frame = box(1.2, 0.2, 2.5, COLORS.locoDark, dark);
    frame.position.y = 0.46;
    W.add(frame);
    const floor = box(1.24, 0.06, 2.4, COLORS.loco, body);
    floor.position.y = 0.59;
    W.add(floor);
    for (const x of [-0.62, 0.62]) {
      const side = box(0.05, 0.3, 2.4, COLORS.loco, body);
      side.position.set(x, 0.75, 0);
      W.add(side);
      const lip = box(0.07, 0.02, 2.42, COLORS.metal, st);
      lip.position.set(x, 0.9, 0);
      W.add(lip);
    }
    for (const z of [-1.2, 1.2]) {
      const end = box(1.24, 0.3, 0.05, COLORS.loco, body);
      end.position.set(0, 0.75, z);
      W.add(end);
    }
    for (const z of [-0.85, 0.85]) {
      for (const x of [-0.62, 0.62]) {
        const w = cyl(0.26, 0.26, 0.08, COLORS.wheel, 28, wheelMat());
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.26, z);
        W.add(w);
        this.wheels.push(w);
        const tyre = torus(0.24, 0.028, st, 28);
        tyre.rotation.y = Math.PI / 2;
        tyre.position.set(x + Math.sign(x) * 0.045, 0.26, z);
        W.add(tyre);
      }
    }
    const coupling = box(0.08, 0.1, 0.5, COLORS.metal, st);
    coupling.position.set(0, 0.5, 1.45);
    W.add(coupling);

    const crateSlots: THREE.Object3D[] = [];
    for (const z of [-0.72, 0, 0.72]) {
      const slot = new THREE.Object3D();
      slot.position.set(0, 0.62 + 0.3, z);
      W.add(slot);
      crateSlots.push(slot);
    }
    return { group: W, drop: 0, crateSlots };
  }

  /** Couple the cargo wagon onto the back of the loco. */
  addCart(): Car {
    const car = this.buildWagon();
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
    const spin = (this.speed * dt) / 0.36;
    this.wheelAngle += spin;
    for (const d of this.drivers) d.rotation.x = this.wheelAngle;
    for (const w of this.wheels) w.rotation.x += spin;
    for (const r of this.rods) {
      const a = this.wheelAngle + r.phase;
      r.m.position.set(r.side * 0.69, 0.36 + Math.sin(a) * 0.17, 0.05 + Math.cos(a) * 0.17);
    }
    const moving = Math.abs(this.speed) > 0.05;
    this.mark.position.y = 2.75 + (moving ? Math.sin(this.t * 3.1) * 0.06 : 0);
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
