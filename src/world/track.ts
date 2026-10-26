import * as THREE from 'three';
import { COLORS } from '../config';
import { mat, Z } from '../util3d';

export const GAUGE = 1.0;
export const RAIL_H = 0.1;
/** Height of the rail top above ground: where wheels sit. */
export const RAIL_TOP = 0.06 + RAIL_H;

/**
 * The line from A (origin, heading -z) to B. In order: a long straight, the switch,
 * the sharp right-hand curve, a straight with the gap, a gentle bend, the destination.
 */
const MAIN_PTS: [number, number][] = [
  [0, 0],
  [0, -10],
  [0, -20],
  [0, -30],
  [0, -40],
  [0, -47],
  [2.6, -55],
  [8.5, -61],
  [16.5, -64],
  [27, -64.6],
  [38, -64.6],
  [48, -64],
  [56, -61],
  [62, -56],
  [67, -50],
  // past B: room for the phase 7 train to leave the picture and come back
  [73, -43],
  [80, -35],
  [88, -26],
];

export function makeMain(): THREE.CatmullRomCurve3 {
  const pts = MAIN_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  c.arcLengthDivisions = 3000;
  c.updateArcLengths();
  return c;
}

export interface Frame {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  /** Right of travel (the camera side). */
  right: THREE.Vector3;
}

export const newFrame = (): Frame => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3() });

export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number, out: Frame): Frame {
  const uu = Math.max(0, Math.min(1, u));
  curve.getPointAt(uu, out.pos);
  curve.getTangentAt(uu, out.tan);
  out.tan.y = 0;
  out.tan.normalize();
  out.right.set(-out.tan.z, 0, out.tan.x);
  return out;
}

export function nearestU(curve: THREE.Curve<THREE.Vector3>, x: number, z: number, samples = 3000): number {
  let best = 0;
  let bd = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** A u-range on an open curve. */
export interface Zone {
  u0: number;
  u1: number;
}

export const inZone = (u: number, z: Zone): boolean => u >= z.u0 && u <= z.u1;

interface SegData {
  u: number;
  len: number;
}

interface SleeperData {
  u: number;
}

/**
 * Rails and sleepers as instanced boxes along a curve. `reveal` (0..1) grows the line from its
 * start, `endU` cuts it short, and `gapZone` leaves rails and sleepers out.
 */
export class RailLine {
  readonly group = new THREE.Group();
  readonly length: number;
  private readonly rails: THREE.InstancedMesh;
  private readonly sleepers: THREE.InstancedMesh;
  private readonly segs: SegData[] = [];
  private readonly slp: SleeperData[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly f = newFrame();
  private dirty = true;

  reveal = 1;
  /** The line stops here (0..1 along the curve). */
  endU = 1;
  gapZone: Zone | null = null;

  constructor(
    readonly curve: THREE.Curve<THREE.Vector3>,
    segLen = 0.5,
    sleeperEvery = 0.9,
  ) {
    this.length = curve.getLength();
    const nSeg = Math.max(2, Math.round(this.length / segLen));
    const len = this.length / nSeg;
    for (let i = 0; i < nSeg; i++) this.segs.push({ u: (i + 0.5) / nSeg, len });
    const nSl = Math.max(1, Math.round(this.length / sleeperEvery));
    for (let i = 0; i < nSl; i++) this.slp.push({ u: (i + 0.5) / nSl });

    const railMat = mat(COLORS.rail, { roughness: 0.45, metalness: 0.4, emissive: 0x202227 });
    const sleeperMat = mat(COLORS.sleeper, { roughness: 0.95, emissive: 0x08080a });
    this.rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, RAIL_H, 1), railMat, nSeg * 2);
    this.sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.06, 0.2), sleeperMat, nSl);
    this.group.add(this.sleepers, this.rails);
    this.apply();
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(): void {
    if (this.dirty) this.apply();
  }

  apply(): void {
    this.dirty = false;
    const { dummy, f } = this;
    const nShow = Math.ceil(Math.max(0, Math.min(1, this.reveal)) * this.segs.length);
    let i = 0;
    for (let si = 0; si < this.segs.length; si++) {
      const s = this.segs[si];
      frameAt(this.curve, s.u, f);
      const gone = (this.gapZone && inZone(s.u, this.gapZone)) || si >= nShow || s.u > this.endU;
      for (let side = -1; side <= 1; side += 2) {
        dummy.position.copy(f.pos).addScaledVector(f.right, (side * GAUGE) / 2);
        dummy.position.y = 0.06 + RAIL_H / 2;
        dummy.quaternion.setFromUnitVectors(Z, f.tan);
        if (gone) dummy.scale.setScalar(0.001);
        else dummy.scale.set(1, 1, s.len * 1.04);
        dummy.updateMatrix();
        this.rails.setMatrixAt(i++, dummy.matrix);
      }
    }
    this.rails.instanceMatrix.needsUpdate = true;

    const nSl = Math.ceil(Math.max(0, Math.min(1, this.reveal)) * this.slp.length);
    let j = 0;
    for (let si = 0; si < this.slp.length; si++) {
      const s = this.slp[si];
      frameAt(this.curve, s.u, f);
      const gone = (this.gapZone && inZone(s.u, this.gapZone)) || si >= nSl || s.u > this.endU;
      dummy.position.copy(f.pos);
      dummy.position.y = 0.03;
      dummy.quaternion.setFromUnitVectors(Z, f.tan);
      const k = gone ? 0.001 : 1;
      dummy.scale.set(k, k, k);
      dummy.updateMatrix();
      this.sleepers.setMatrixAt(j++, dummy.matrix);
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A flat ribbon following a stretch of a curve. `width` may vary along the curve; uvs run 0..1
 * across and along the length in units of `tile` (world units per texture repeat).
 */
export function makeRibbon(
  curve: THREE.Curve<THREE.Vector3>,
  width: number | ((t: number) => number),
  y: number,
  material: THREE.Material,
  n = 400,
  u0 = 0,
  u1 = 1,
  tile = 0,
): THREE.Mesh {
  const f = newFrame();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const L = curve.getLength() * (u1 - u0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    frameAt(curve, u0 + (u1 - u0) * t, f);
    const w = typeof width === 'number' ? width : width(t);
    const lx = f.pos.x - f.right.x * (w / 2);
    const lz = f.pos.z - f.right.z * (w / 2);
    const rx = f.pos.x + f.right.x * (w / 2);
    const rz = f.pos.z + f.right.z * (w / 2);
    pos.push(lx, y, lz, rx, y, rz);
    const v = tile > 0 ? (t * L) / tile : t;
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** The dead-end siding that leaves the main line at the switch and bends to the left. */
export function makeSpurCurve(main: THREE.Curve<THREE.Vector3>, uSwitch: number): THREE.CatmullRomCurve3 {
  const f = frameAt(main, uSwitch, newFrame());
  const left = f.right.clone().negate();
  const P = (a: number, b: number) => f.pos.clone().addScaledVector(f.tan, a).addScaledVector(left, b);
  const c = new THREE.CatmullRomCurve3([P(0, 0), P(2.2, 0.03), P(4.4, 0.6), P(6.4, 1.7), P(8.0, 3.1)], false, 'centripetal');
  c.arcLengthDivisions = 600;
  c.updateArcLengths();
  return c;
}

/** A fence of posts and rails alongside a stretch of track. side: +1 right of travel, -1 left. */
export function makeFence(
  curve: THREE.Curve<THREE.Vector3>,
  zone: Zone,
  side: 1 | -1,
  dist: number,
  height: number,
  m: THREE.Material,
  spacing = 0.8,
): THREE.Group {
  const g = new THREE.Group();
  const f = newFrame();
  const L = curve.getLength();
  const n = Math.max(1, Math.round(((zone.u1 - zone.u0) * L) / spacing));
  const postGeo = new THREE.BoxGeometry(0.13, height, 0.13);
  const railGeo = new THREE.BoxGeometry(0.09, 0.11, 1);
  const prev = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = zone.u0 + ((zone.u1 - zone.u0) * i) / n;
    frameAt(curve, u, f);
    p.copy(f.pos).addScaledVector(f.right, side * dist);
    const post = new THREE.Mesh(postGeo, m);
    post.position.set(p.x, height / 2, p.z);
    g.add(post);
    if (i > 0) {
      const d = p.clone().sub(prev);
      const len = d.length();
      for (const hy of [height * 0.88, height * 0.5]) {
        const rail = new THREE.Mesh(railGeo, m);
        rail.position.set((prev.x + p.x) / 2, hy, (prev.z + p.z) / 2);
        rail.quaternion.setFromUnitVectors(Z, d.clone().normalize());
        rail.scale.z = len * 1.06;
        g.add(rail);
      }
    }
    prev.copy(p);
  }
  return g;
}
