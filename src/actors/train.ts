import * as THREE from 'three';
import { COLORS } from '../config';
import { box, cyl, mat, sphere, Z } from '../util3d';
import { frameAt, newFrame, RAIL_TOP } from '../world/track';

export type EyeState = 'calm' | 'focused' | 'wide' | 'happy' | 'dizzy';

/** Distance between loco centre and wagon centre along the track. */
export const WAGON_GAP = 3.1;

export interface DerailPose {
  lat: number;
  lift: number;
  roll: number;
  pitch: number;
  yaw: number;
}

interface EyeDef {
  pupil: number;
  eye: number;
  top: number;
  bottom: number;
  offY: number;
}

const EYES: Record<EyeState, EyeDef> = {
  calm: { pupil: 1, eye: 1, top: 0.12, bottom: 0, offY: 0 },
  focused: { pupil: 0.9, eye: 1, top: 0.42, bottom: 0, offY: -0.03 },
  wide: { pupil: 0.55, eye: 1.4, top: 0, bottom: 0, offY: 0.02 },
  happy: { pupil: 1, eye: 1, top: 0.08, bottom: 0.62, offY: 0.02 },
  dizzy: { pupil: 0.5, eye: 1.2, top: 0.3, bottom: 0.3, offY: 0 },
};

function starShape(outer: number, inner: number, points = 4): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

class Eye {
  readonly group = new THREE.Group();
  private readonly ball: THREE.Mesh;
  private readonly pupil: THREE.Mesh;
  private readonly topPivot = new THREE.Group();
  private readonly bottomPivot = new THREE.Group();

  constructor() {
    this.ball = sphere(0.17, COLORS.eye, 14, { flatShading: false, roughness: 0.35 });
    this.group.add(this.ball);
    this.pupil = sphere(0.085, COLORS.pupil, 10, { flatShading: false, roughness: 0.3 });
    this.pupil.position.z = 0.115;
    this.group.add(this.pupil);
    const lidMat = mat(COLORS.face, { flatShading: false });
    const topLid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.12), lidMat);
    topLid.position.y = -0.19;
    this.topPivot.position.set(0, 0.19, 0.14);
    this.topPivot.scale.y = 0.001;
    this.topPivot.add(topLid);
    this.group.add(this.topPivot);
    const bottomLid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.12), lidMat);
    bottomLid.position.y = 0.19;
    this.bottomPivot.position.set(0, -0.19, 0.14);
    this.bottomPivot.scale.y = 0.001;
    this.bottomPivot.add(bottomLid);
    this.group.add(this.bottomPivot);
  }

  apply(d: EyeDef, blink: number, k: number): void {
    const eyeS = this.ball.scale.x + (d.eye - this.ball.scale.x) * k;
    this.ball.scale.setScalar(eyeS);
    const ps = this.pupil.scale.x + (d.pupil - this.pupil.scale.x) * k;
    this.pupil.scale.setScalar(ps);
    this.pupil.position.y += (d.offY - this.pupil.position.y) * k;
    const top = Math.max(d.top, blink);
    this.topPivot.scale.y += (Math.max(0.001, top) - this.topPivot.scale.y) * (blink > 0 ? 1 : k);
    this.bottomPivot.scale.y += (Math.max(0.001, d.bottom) - this.bottomPivot.scale.y) * k;
  }
}

export class Train {
  readonly group = new THREE.Group();
  readonly loco = new THREE.Group();
  readonly wagon = new THREE.Group();
  /** Where the human stands when driving (child of loco). */
  readonly cabSlot = new THREE.Object3D();
  /** Where the human stands when pushing (child of loco, at ground level). */
  readonly pushSlot = new THREE.Object3D();
  /** Where a ticket sits (child of loco). */
  readonly ticketSlot = new THREE.Object3D();
  /** Where cargo sits (child of wagon). */
  readonly crateSlot = new THREE.Object3D();

  private readonly wheels: THREE.Mesh[] = [];
  private readonly eyeL = new Eye();
  private readonly eyeR = new Eye();
  private readonly emblemMat: THREE.MeshStandardMaterial;
  private readonly headlightMat: THREE.MeshStandardMaterial;
  private readonly f = newFrame();
  private t = 0;
  private blinkTimer = 2.5;
  private blink = 0;

  /** Distance along the loop (loco centre). */
  s = 0;
  speed = 0;
  /** Amount (0..1) of the current derail pose applied. */
  derailAmount = 0;
  derail: DerailPose = { lat: 0, lift: 0, roll: 0, pitch: 0, yaw: 0 };
  /** Crooked-track wobble amplitude (phase 1). */
  wobble = 0;
  eyes: EyeState = 'calm';

  onSpur = false;
  spurS = 0;
  spurCurve: THREE.Curve<THREE.Vector3> | null = null;
  spurLen = 0;
  /** Loop distance of the switch, used to place the wagon while the loco is on the spur. */
  spurAnchorS = 0;

  constructor(
    private readonly loop: THREE.Curve<THREE.Vector3>,
    readonly loopLen: number,
  ) {
    this.emblemMat = new THREE.MeshStandardMaterial({ color: COLORS.emblem, emissive: COLORS.emblem, emissiveIntensity: 0.7, roughness: 0.5 });
    this.headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9, roughness: 0.4 });
    this.buildLoco();
    this.buildWagon();
    this.group.add(this.loco, this.wagon);
  }

  private buildLoco(): void {
    const L = this.loco;
    const chassis = box(1.3, 0.3, 3.0, COLORS.locoDark);
    chassis.position.y = 0.45;
    L.add(chassis);
    for (const z of [1.5, -1.5]) {
      const beam = box(1.4, 0.22, 0.12, COLORS.wheel);
      beam.position.set(0, 0.45, z);
      L.add(beam);
    }
    const boiler = cyl(0.58, 0.58, 1.9, COLORS.loco, 18, { flatShading: false });
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.05, 0.35);
    L.add(boiler);
    const band = cyl(0.61, 0.61, 0.14, COLORS.locoDark, 18, { flatShading: false });
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 1.05, -0.2);
    L.add(band);
    const face = sphere(0.6, COLORS.face, 20, { flatShading: false });
    face.scale.z = 0.55;
    face.position.set(0, 1.05, 1.3);
    L.add(face);
    const faceRim = cyl(0.62, 0.62, 0.12, COLORS.locoDark, 20, { flatShading: false });
    faceRim.rotation.x = Math.PI / 2;
    faceRim.position.set(0, 1.05, 1.26);
    L.add(faceRim);

    this.eyeL.group.position.set(-0.24, 1.17, 1.5);
    this.eyeR.group.position.set(0.24, 1.17, 1.5);
    L.add(this.eyeL.group, this.eyeR.group);

    const cheekMat = mat(0xf7b7a3, { flatShading: false });
    for (const x of [-0.42, 0.42]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cheekMat);
      cheek.position.set(x, 0.98, 1.52);
      L.add(cheek);
    }
    const mouth = box(0.26, 0.04, 0.04, COLORS.pupil);
    mouth.position.set(0, 0.82, 1.6);
    L.add(mouth);

    const chimney = cyl(0.17, 0.23, 0.5, COLORS.locoDark, 10);
    chimney.position.set(0, 1.8, 0.95);
    L.add(chimney);
    const dome = sphere(0.26, COLORS.locoDark, 10);
    dome.position.set(0, 1.6, 0.2);
    L.add(dome);
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.headlightMat);
    headlight.position.set(0, 1.58, 1.52);
    L.add(headlight);

    // open cab: back and side walls, front wall against the boiler, no roof
    const back = box(1.3, 0.9, 0.1, COLORS.loco);
    back.position.set(0, 1.05, -1.45);
    L.add(back);
    for (const x of [-0.6, 0.6]) {
      const side = box(0.1, 0.9, 1.0, COLORS.loco);
      side.position.set(x, 1.05, -0.95);
      L.add(side);
    }
    const front = box(1.3, 1.25, 0.1, COLORS.loco);
    front.position.set(0, 1.22, -0.5);
    L.add(front);
    const railTop = box(1.4, 0.08, 0.12, COLORS.locoDark);
    railTop.position.set(0, 1.52, -1.45);
    L.add(railTop);

    // emblem: four-point sparkle on both flanks
    const starGeo = new THREE.ExtrudeGeometry(starShape(0.26, 0.09), { depth: 0.06, bevelEnabled: false });
    for (const side of [-1, 1]) {
      const star = new THREE.Mesh(starGeo, this.emblemMat);
      star.rotation.y = (side * Math.PI) / 2;
      star.position.set(side * 0.56, 1.12, 0.45);
      star.castShadow = false;
      L.add(star);
      const dot = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.1, 0.035), { depth: 0.06, bevelEnabled: false }), this.emblemMat);
      dot.rotation.y = (side * Math.PI) / 2;
      dot.position.set(side * 0.56, 1.42, 0.78);
      L.add(dot);
    }

    for (const z of [-0.95, 0, 0.95]) {
      for (const x of [-0.66, 0.66]) {
        const w = cyl(0.3, 0.3, 0.12, COLORS.wheel, 14);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.3, z);
        L.add(w);
        this.wheels.push(w);
        const hub = cyl(0.12, 0.12, 0.14, COLORS.emblem, 8);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, 0.3, z);
        L.add(hub);
      }
    }
    const coupling = box(0.1, 0.1, 0.4, COLORS.wheel);
    coupling.position.set(0, 0.45, -1.7);
    L.add(coupling);

    this.cabSlot.position.set(0, 0.6, -0.98);
    this.pushSlot.position.set(0, -RAIL_TOP, -2.25);
    this.ticketSlot.position.set(0, 1.9, -0.5);
    L.add(this.cabSlot, this.pushSlot, this.ticketSlot);
  }

  private buildWagon(): void {
    const W = this.wagon;
    const chassis = box(1.3, 0.25, 2.3, COLORS.wagonDark);
    chassis.position.y = 0.42;
    W.add(chassis);
    const floor = box(1.3, 0.1, 2.3, COLORS.wagon);
    floor.position.y = 0.6;
    W.add(floor);
    for (const x of [-0.62, 0.62]) {
      const side = box(0.08, 0.55, 2.3, COLORS.wagon);
      side.position.set(x, 0.9, 0);
      W.add(side);
    }
    for (const z of [-1.12, 1.12]) {
      const end = box(1.3, 0.55, 0.08, COLORS.wagon);
      end.position.set(0, 0.9, z);
      W.add(end);
    }
    for (const z of [-0.8, 0.8]) {
      for (const x of [-0.66, 0.66]) {
        const w = cyl(0.3, 0.3, 0.12, COLORS.wheel, 14);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.3, z);
        W.add(w);
        this.wheels.push(w);
      }
    }
    const coupling = box(0.1, 0.1, 0.5, COLORS.wheel);
    coupling.position.set(0, 0.45, 1.3);
    W.add(coupling);
    this.crateSlot.position.set(0, 0.65, 0);
    W.add(this.crateSlot);
  }

  resetDerail(): void {
    this.derailAmount = 0;
    this.onSpur = false;
    this.spurS = 0;
  }

  worldPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.loco.position);
  }

  /** Forward direction of the loco in world space. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, 1).applyQuaternion(this.loco.quaternion).setY(0).normalize();
  }

  /** Right (outside of the loop) direction in world space. */
  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.loco.quaternion).setY(0).normalize();
  }

  update(dt: number): void {
    this.t += dt;
    const f = this.f;
    if (this.onSpur && this.spurCurve) {
      frameAt(this.spurCurve, this.spurS / this.spurLen, f, false);
    } else {
      frameAt(this.loop, this.s / this.loopLen, f, true);
    }
    this.place(this.loco, f, this.derailAmount, 0);

    if (this.wagon.visible) {
      if (this.onSpur && this.spurCurve) {
        const ws = this.spurS - WAGON_GAP;
        if (ws >= 0) frameAt(this.spurCurve, ws / this.spurLen, f, false);
        else frameAt(this.loop, (this.spurAnchorS + ws) / this.loopLen, f, true);
      } else {
        frameAt(this.loop, (this.s - WAGON_GAP) / this.loopLen, f, true);
      }
      this.place(this.wagon, f, this.derailAmount * 0.5, 1.3);
    }

    const spin = (this.speed * dt) / 0.3;
    for (const w of this.wheels) w.rotation.x += spin;

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.2 + Math.random() * 3;
    }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 9);
    const def = EYES[this.eyes];
    const k = Math.min(1, dt * 9);
    this.eyeL.apply(def, this.blink, k);
    this.eyeR.apply(def, this.blink, k);
    if (this.eyes === 'dizzy') {
      this.eyeL.group.rotation.z = Math.sin(this.t * 6) * 0.25;
      this.eyeR.group.rotation.z = -Math.sin(this.t * 6) * 0.25;
    } else {
      this.eyeL.group.rotation.z *= 0.9;
      this.eyeR.group.rotation.z *= 0.9;
    }

    this.emblemMat.emissiveIntensity = 0.65 + Math.sin(this.t * 3) * 0.3;
  }

  private place(obj: THREE.Object3D, f: { pos: THREE.Vector3; tan: THREE.Vector3; right: THREE.Vector3 }, amt: number, ph: number): void {
    obj.position.copy(f.pos);
    obj.position.y = RAIL_TOP;
    obj.quaternion.setFromUnitVectors(Z, f.tan);
    const w = this.wobble;
    if (w > 0.001) {
      obj.position.addScaledVector(f.right, Math.sin(this.t * 7 + ph) * 0.09 * w);
      obj.position.y += Math.abs(Math.sin(this.t * 9 + ph)) * 0.035 * w;
      obj.rotateZ(Math.sin(this.t * 5 + ph) * 0.07 * w);
      obj.rotateX(Math.sin(this.t * 6.5 + ph) * 0.03 * w);
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
