import * as THREE from 'three';
import { COLORS } from '../config';
import { box, capsule, mat, sphere, wood } from '../util3d';

export type Pose = 'stand' | 'push' | 'drive' | 'crouch' | 'heave' | 'point' | 'offer' | 'inspect' | 'exhausted';

/**
 * Joint targets in radians. sh = arm raised forward from hanging (world-relative, lean is added), el = elbow bend, out = arm spread sideways,
 * hip = thigh forward, knee = bend, lean = torso forward, head = nod.
 */
interface PoseDef {
  lean: number;
  head: number;
  shL: number;
  shR: number;
  elL: number;
  elR: number;
  outL: number;
  outR: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
}

const P = (p: Partial<PoseDef>): PoseDef => ({
  lean: 0,
  head: 0,
  shL: 0.05,
  shR: 0.05,
  elL: 0.12,
  elR: 0.12,
  outL: 0.06,
  outR: 0.06,
  hipL: 0,
  hipR: 0,
  kneeL: 0,
  kneeR: 0,
  ...p,
});

const POSES: Record<Pose, PoseDef> = {
  stand: P({}),
  push: P({ lean: 0.8, head: 0.3, shL: 1.3, shR: 1.3, elL: 0.25, elR: 0.25, hipL: 0.55, hipR: -0.35, kneeL: 0.65, kneeR: 0.25 }),
  drive: P({ lean: 0.12, shL: 0.85, shR: 0.85, elL: 1.15, elR: 1.15, outL: 0.12, outR: 0.12 }),
  crouch: P({ lean: 0.6, head: 0.25, shL: 0.55, shR: 0.55, elL: 0.15, elR: 0.15, hipL: 1.15, hipR: 1.15, kneeL: 1.95, kneeR: 1.95 }),
  heave: P({ lean: 0.22, head: -0.15, shL: 1.1, shR: 1.1, elL: 1.25, elR: 1.25, hipL: 0.35, hipR: 0.35, kneeL: 0.6, kneeR: 0.6 }),
  point: P({ lean: 0.05, shR: 1.5, elR: 0.05, outR: 0.05, shL: 0.1, elL: 0.15 }),
  offer: P({ lean: 0.15, shR: 1.05, elR: 0.35, shL: 0.1 }),
  inspect: P({ lean: 0.35, head: 0.45, shL: 1.0, shR: 0.95, elL: 1.35, elR: 0.45 }),
  exhausted: P({ lean: 1.25, head: 0.3, shL: 0.45, shR: 0.45, elL: 0.15, elR: 0.15, hipL: 0.5, hipR: 0.5, kneeL: 0.65, kneeR: 0.65 }),
};

const UL = 0.4; // upper leg
const LL = 0.4; // lower leg
const UA = 0.32; // upper arm
const LA = 0.3; // lower arm
const HIPS_Y = UL + LL;
const TORSO = 0.76;
const HEAD_R = 0.27;
const SCALE = 0.7;

function makeClipboard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.44, 0.58, 0.04, COLORS.clipboard, wood(COLORS.clipboard)));
  const paper = box(0.36, 0.46, 0.02, COLORS.paper, mat(COLORS.paper, { emissive: 0x333333 }));
  paper.position.set(0, -0.03, 0.03);
  g.add(paper);
  const clip = box(0.18, 0.08, 0.07, COLORS.wheel, mat(COLORS.wheel, { metalness: 0.5, roughness: 0.4 }));
  clip.position.set(0, 0.27, 0.02);
  g.add(clip);
  return g;
}

export function makeTicket(): THREE.Mesh {
  const t = box(0.5, 0.02, 0.3, COLORS.ticket, mat(COLORS.ticket, { emissive: 0x4a4330 }));
  const stripe = box(0.5, 0.025, 0.06, COLORS.claude, mat(COLORS.claude, { emissive: COLORS.claude, emissiveIntensity: 0.4 }));
  stripe.position.z = 0.09;
  t.add(stripe);
  return t;
}

/** Smooth, faceless white figure with elbows and knees. */
export class Human {
  readonly group = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly clipboard: THREE.Group;
  /** Anchors at the end of each forearm (for props). */
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();

  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly shL = new THREE.Group();
  private readonly shR = new THREE.Group();
  private readonly elL = new THREE.Group();
  private readonly elR = new THREE.Group();
  private readonly hipL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();

  walking = false;
  pose: Pose = 'stand';
  /** Driven by the director while pushing so the shoves match the train's lurches. */
  pushPhase = 0;
  private t = Math.random() * 10;
  private readonly cur: PoseDef = P({});

  /** Height of the model in world units (after scale). */
  static readonly HEIGHT = (HIPS_Y + TORSO + HEAD_R * 1.6) * SCALE;

  constructor() {
    const skin = mat(COLORS.human, { roughness: 0.85, metalness: 0, emissive: 0x161617 });
    const g = this.group;
    this.hips.position.y = HIPS_Y;
    g.add(this.hips);

    // legs
    for (const [hip, knee, x] of [
      [this.hipL, this.kneeL, 0.12],
      [this.hipR, this.kneeR, -0.12],
    ] as const) {
      hip.position.set(x, 0, 0);
      const upper = capsule(0.085, UL + 0.1, skin);
      upper.position.y = -UL / 2;
      hip.add(upper);
      knee.position.y = -UL;
      const lower = capsule(0.075, LL + 0.08, skin);
      lower.position.y = -LL / 2;
      knee.add(lower);
      hip.add(knee);
      this.hips.add(hip);
    }

    // torso and head
    this.hips.add(this.torso);
    const body = capsule(0.19, TORSO, skin);
    body.position.y = TORSO / 2 - 0.05;
    this.torso.add(body);
    this.headPivot.position.y = TORSO - 0.08;
    this.head = sphere(HEAD_R, COLORS.human, 36, skin);
    this.head.position.y = HEAD_R - 0.02;
    this.headPivot.add(this.head);
    this.torso.add(this.headPivot);

    // arms
    for (const [sh, el, hand, x] of [
      [this.shL, this.elL, this.handL, 0.21],
      [this.shR, this.elR, this.handR, -0.21],
    ] as const) {
      sh.position.set(x, TORSO - 0.14, 0);
      const upper = capsule(0.066, UA + 0.08, skin);
      upper.position.y = -UA / 2;
      sh.add(upper);
      el.position.y = -UA;
      const lower = capsule(0.06, LA + 0.08, skin);
      lower.position.y = -LA / 2;
      el.add(lower);
      hand.position.y = -LA;
      el.add(hand);
      sh.add(el);
      this.torso.add(sh);
    }

    this.clipboard = makeClipboard();
    this.clipboard.position.set(0.02, -0.02, 0.2);
    this.clipboard.rotation.x = -0.9;
    this.clipboard.visible = false;
    this.handL.add(this.clipboard);

    g.scale.setScalar(SCALE);
  }

  /** World position of the head (for sweat drops). */
  headPos(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out);
  }

  faceTowards(x: number, z: number): void {
    const p = this.group.position;
    const dx = x - p.x;
    const dz = z - p.z;
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  /** Face the same way as a direction vector. */
  faceAlong(dir: THREE.Vector3): void {
    this.group.rotation.y = Math.atan2(dir.x, dir.z);
  }

  update(dt: number): void {
    this.t += dt;
    const target = POSES[this.pose];
    const k = Math.min(1, dt * 8);
    const c = this.cur;
    for (const key of Object.keys(c) as (keyof PoseDef)[]) c[key] += (target[key] - c[key]) * k;

    let lean = c.lean;
    let shL = c.shL;
    let shR = c.shR;
    let elL = c.elL;
    let elR = c.elR;
    let hipL = c.hipL;
    let hipR = c.hipR;
    let kneeL = c.kneeL;
    let kneeR = c.kneeR;

    if (this.walking) {
      const ph = this.t * 9;
      const sw = Math.sin(ph);
      hipL += sw * 0.55;
      hipR -= sw * 0.55;
      kneeL += Math.max(0, Math.sin(ph + 0.4)) * 0.95;
      kneeR += Math.max(0, Math.sin(ph + Math.PI + 0.4)) * 0.95;
      shL -= sw * 0.35;
      shR += sw * 0.35;
      elL += 0.3;
      elR += 0.3;
    }
    if (this.pose === 'push') {
      const e = Math.sin(this.pushPhase);
      lean += e * 0.07;
      kneeL += (0.5 + 0.5 * e) * 0.25;
      kneeR += (0.5 + 0.5 * e) * 0.2;
      elL += (0.5 - 0.5 * e) * 0.3;
      elR += (0.5 - 0.5 * e) * 0.3;
    }
    if (this.pose === 'stand' && !this.walking) {
      lean += Math.sin(this.t * 1.1) * 0.012;
    }
    if (this.pose === 'exhausted') {
      lean += Math.sin(this.t * 2.6) * 0.03;
    }

    this.torso.rotation.x = lean;
    this.headPivot.rotation.x = c.head;
    this.shL.rotation.x = -(shL + lean);
    this.shR.rotation.x = -(shR + lean);
    this.shL.rotation.z = c.outL;
    this.shR.rotation.z = -c.outR;
    this.elL.rotation.x = -elL;
    this.elR.rotation.x = -elR;
    this.hipL.rotation.x = -hipL;
    this.hipR.rotation.x = -hipR;
    this.kneeL.rotation.x = kneeL;
    this.kneeR.rotation.x = kneeR;

    // keep the lower foot on the ground
    const yL = UL * Math.cos(hipL) + LL * Math.cos(hipL - kneeL);
    const yR = UL * Math.cos(hipR) + LL * Math.cos(hipR - kneeR);
    const y = this.walking ? Math.max(yL, yR) - 0.02 : Math.max(yL, yR);
    this.hips.position.y += (y - this.hips.position.y) * Math.min(1, dt * 12);
  }
}
