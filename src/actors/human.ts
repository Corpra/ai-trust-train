import * as THREE from 'three';
import { COLORS } from '../config';
import { box, mat, sphere } from '../util3d';

export type Pose = 'stand' | 'push' | 'drive' | 'inspect' | 'point';

interface PoseDef {
  lean: number;
  armL: number;
  armR: number;
}

/** Torso lean (rad, + is forward) and arm swing about the shoulder (rad, negative is forward/up). */
const POSES: Record<Pose, PoseDef> = {
  stand: { lean: 0, armL: 0, armR: 0 },
  push: { lean: 0.62, armL: -1.45, armR: -1.45 },
  drive: { lean: 0.12, armL: -0.85, armR: -0.85 },
  inspect: { lean: 0.28, armL: -1.35, armR: -1.05 },
  point: { lean: 0.05, armL: 0, armR: -1.6 },
};

function makeBubbleSprite(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(43,52,64,0.18)';
  g.lineWidth = 6;
  const x = 20;
  const y = 40;
  const w = 216;
  const h = 140;
  const r = 44;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.lineTo(x + 86, y + h);
  g.lineTo(x + 52, y + h + 46);
  g.lineTo(x + 58, y + h);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#2f9ba8';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(x + 62 + i * 46, y + h / 2, 14, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.setScalar(1.5);
  return s;
}

function makeClipboard(): THREE.Group {
  const g = new THREE.Group();
  const board = box(0.44, 0.58, 0.04, COLORS.clipboard);
  g.add(board);
  const paper = box(0.36, 0.46, 0.02, COLORS.paper);
  paper.position.set(0, -0.03, 0.03);
  g.add(paper);
  const clip = box(0.18, 0.08, 0.07, COLORS.wheel);
  clip.position.set(0, 0.27, 0.02);
  g.add(clip);
  return g;
}

export function makeTicket(): THREE.Mesh {
  const t = box(0.5, 0.02, 0.3, COLORS.ticket);
  const stripe = box(0.5, 0.025, 0.06, COLORS.human);
  stripe.position.z = 0.09;
  t.add(stripe);
  return t;
}

export class Human {
  readonly group = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly bubble: THREE.Sprite;
  readonly clipboard: THREE.Group;
  private readonly torso = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();

  walking = false;
  pose: Pose = 'stand';
  private t = Math.random() * 10;
  private lean = 0;

  /** Height of the model in world units (after scale). */
  static readonly HEIGHT = 1.84;

  constructor() {
    const g = this.group;
    for (const [grp, x] of [
      [this.legL, -0.17],
      [this.legR, 0.17],
    ] as const) {
      grp.position.set(x, 0.8, 0);
      const leg = box(0.24, 0.8, 0.26, COLORS.humanDark);
      leg.position.y = -0.4;
      grp.add(leg);
      const shoe = box(0.26, 0.14, 0.38, COLORS.wheel);
      shoe.position.set(0, -0.78, 0.06);
      grp.add(shoe);
      g.add(grp);
    }
    this.torso.position.y = 0.8;
    g.add(this.torso);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.45, 4, 10), mat(COLORS.human));
    body.position.y = 0.5;
    body.castShadow = true;
    this.torso.add(body);

    this.head = sphere(0.3, COLORS.skin, 14);
    this.head.position.y = 1.2;
    this.torso.add(this.head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), mat(COLORS.wagonDark));
    hair.position.y = 1.25;
    hair.castShadow = true;
    this.torso.add(hair);

    for (const [grp, x] of [
      [this.armL, -0.42],
      [this.armR, 0.42],
    ] as const) {
      grp.position.set(x, 0.82, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), mat(COLORS.human));
      arm.position.y = -0.32;
      arm.castShadow = true;
      grp.add(arm);
      const hand = sphere(0.11, COLORS.skin, 8);
      hand.position.y = -0.64;
      grp.add(hand);
      this.torso.add(grp);
    }

    this.bubble = makeBubbleSprite();
    this.bubble.position.set(0.6, 2.7, 0);
    this.bubble.visible = false;
    this.bubble.scale.setScalar(0.001);
    g.add(this.bubble);

    this.clipboard = makeClipboard();
    this.clipboard.position.set(0.1, -0.66, 0.16);
    this.clipboard.rotation.x = -0.75;
    this.clipboard.visible = false;
    this.armL.add(this.clipboard);

    g.scale.setScalar(0.8);
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

  update(dt: number): void {
    this.t += dt;
    const w = this.walking ? 1 : 0;
    const sw = Math.sin(this.t * 11);
    this.legL.rotation.x = sw * 0.7 * w;
    this.legR.rotation.x = -sw * 0.7 * w;

    const target = POSES[this.pose];
    const k = Math.min(1, dt * 7);
    this.lean += (target.lean - this.lean) * k;
    const effort = this.pose === 'push' ? Math.sin(this.t * 6) * 0.06 : 0;
    this.torso.rotation.x = this.lean + effort;
    this.torso.rotation.z = this.pose === 'stand' ? Math.sin(this.t * 1.3) * 0.02 : 0;
    this.torso.position.y = 0.8 + Math.abs(sw) * 0.05 * w;

    const aL = target.armL + (w ? -sw * 0.5 : 0) + (this.pose === 'push' ? Math.sin(this.t * 6) * 0.12 : 0);
    const aR = target.armR + (w ? sw * 0.5 : 0) + (this.pose === 'push' ? Math.sin(this.t * 6 + 0.4) * 0.12 : 0);
    this.armL.rotation.x += (aL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (aR - this.armR.rotation.x) * k;

    if (this.bubble.visible) this.bubble.position.y = 2.7 + Math.sin(this.t * 2.2) * 0.08;
  }
}
