import * as THREE from 'three';
import { COLORS } from '../config';
import { mat, mod1, rng, Z } from '../util3d';

export const GAUGE = 1.0;
export const RAIL_H = 0.14;
/** Height of the rail top above ground: where wheels sit. */
export const RAIL_TOP = 0.06 + RAIL_H;

/**
 * The loop, counter-clockwise on screen when seen from the camera at +z.
 * Point 0 is the station, so arc-length parameter u = 0 is the station.
 * Travel leaves the station towards +x, climbs the right side, crosses the far straight leftwards,
 * comes down the left side and returns.
 */
const LOOP_PTS: [number, number][] = [
  [0, 11],
  [8, 11],
  [14, 10],
  [18, 7],
  [19.8, 2],
  [20, -5],
  [19.8, -10],
  [17.5, -13],
  [13, -13.6],
  [6, -13.6],
  [0, -13.6],
  [-6, -13.6],
  [-11, -13.4],
  [-15.5, -12],
  [-18.8, -8.5],
  [-20.2, -3.5],
  [-20, 2],
  [-18.5, 6.5],
  [-15.5, 9.6],
  [-11, 11],
  [-6, 11],
];

export function makeLoop(): THREE.CatmullRomCurve3 {
  const pts = LOOP_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  c.arcLengthDivisions = 2400;
  c.updateArcLengths();
  return c;
}

export interface Frame {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  /** Right of travel, which on this loop is the outside of the curve. */
  right: THREE.Vector3;
}

export const newFrame = (): Frame => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), right: new THREE.Vector3() });

export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number, out: Frame, closed = true): Frame {
  const uu = closed ? mod1(u) : Math.max(0, Math.min(1, u));
  curve.getPointAt(uu, out.pos);
  curve.getTangentAt(uu, out.tan);
  out.tan.y = 0;
  out.tan.normalize();
  out.right.set(-out.tan.z, 0, out.tan.x);
  return out;
}

export function nearestU(curve: THREE.Curve<THREE.Vector3>, x: number, z: number, samples = 2000): number {
  let best = 0;
  let bd = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
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

/** Distance from (x,z) to the curve, sampled. */
export function distanceToCurve(curve: THREE.Curve<THREE.Vector3>, x: number, z: number, samples = 400): number {
  let bd = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < samples; i++) {
    curve.getPointAt(i / samples, p);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) bd = d;
  }
  return bd;
}

/** A u-range on a curve. May wrap (u0 > u1) on a closed curve. */
export interface Zone {
  u0: number;
  u1: number;
}

export function inZone(u: number, z: Zone): boolean {
  const uu = mod1(u);
  return z.u0 <= z.u1 ? uu >= z.u0 && uu <= z.u1 : uu >= z.u0 || uu <= z.u1;
}

interface SegData {
  u: number;
  len: number;
  n1: number;
  n2: number;
  n3: number;
}

interface SleeperData {
  u: number;
  n1: number;
  n2: number;
}

/**
 * Rails and sleepers as instanced boxes along a curve. `crooked` (0..1) turns a proper railway into
 * loose, jittered, gappy track; `bumpAmp` adds a permanent wobble inside `bumpZone`.
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

  crooked = 0;
  bumpZone: Zone | null = null;
  bumpAmp = 0;
  noSleeperZones: Zone[] = [];

  constructor(
    readonly curve: THREE.Curve<THREE.Vector3>,
    readonly closed: boolean,
    seed = 1,
    segLen = 0.5,
    sleeperEvery = 0.7,
  ) {
    this.length = curve.getLength();
    const r = rng(seed);
    const nSeg = Math.max(2, Math.round(this.length / segLen));
    const len = this.length / nSeg;
    for (let i = 0; i < nSeg; i++) this.segs.push({ u: (i + 0.5) / nSeg, len, n1: r() * 2 - 1, n2: r() * 2 - 1, n3: r() });
    const nSl = Math.max(1, Math.round(this.length / sleeperEvery));
    for (let i = 0; i < nSl; i++) this.slp.push({ u: (i + 0.5) / nSl, n1: r() * 2 - 1, n2: r() * 2 - 1 });

    this.rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, RAIL_H, 1), mat(COLORS.rail, { flatShading: false, roughness: 0.6 }), nSeg * 2);
    this.sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.1, 0.3), mat(COLORS.sleeper), nSl);
    for (const m of [this.rails, this.sleepers]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
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
    const c = this.crooked;
    let i = 0;
    for (const s of this.segs) {
      frameAt(this.curve, s.u, f, this.closed);
      const bump = this.bumpZone && this.bumpAmp > 0 && inZone(s.u, this.bumpZone) ? this.bumpAmp : 0;
      const lat = c * s.n1 * 0.45;
      const lift = c * Math.abs(s.n2) * 0.12 + bump * Math.abs(s.n2) * 0.1;
      const yaw = c * s.n1 * 0.28;
      const roll = c * s.n2 * 0.22 + bump * s.n1 * 0.22;
      const gapF = s.n3 > 0.84 ? Math.max(0, 1 - c * 2.4) : 1;
      for (let side = -1; side <= 1; side += 2) {
        const sideLat = (side * GAUGE) / 2 + lat + (side > 0 ? c * s.n2 * 0.12 : 0);
        dummy.position.copy(f.pos).addScaledVector(f.right, sideLat);
        dummy.position.y = 0.06 + RAIL_H / 2 + lift;
        dummy.quaternion.setFromUnitVectors(Z, f.tan);
        dummy.rotateY(yaw);
        dummy.rotateZ(roll);
        dummy.scale.set(1, 1, Math.max(0.001, s.len * 1.04 * gapF));
        dummy.updateMatrix();
        this.rails.setMatrixAt(i++, dummy.matrix);
      }
    }
    this.rails.instanceMatrix.needsUpdate = true;

    let j = 0;
    for (const s of this.slp) {
      frameAt(this.curve, s.u, f, this.closed);
      const hidden = this.noSleeperZones.some((z) => inZone(s.u, z));
      const k = hidden ? 0.001 : Math.max(0.001, 1 - c * 1.7);
      const bump = this.bumpZone && this.bumpAmp > 0 && inZone(s.u, this.bumpZone) ? this.bumpAmp : 0;
      dummy.position.copy(f.pos);
      dummy.position.y = 0.03 + bump * Math.abs(s.n2) * 0.06;
      dummy.quaternion.setFromUnitVectors(Z, f.tan);
      if (bump > 0) dummy.rotateY(bump * s.n1 * 0.3);
      dummy.scale.set(k, k, k);
      dummy.updateMatrix();
      this.sleepers.setMatrixAt(j++, dummy.matrix);
    }
    this.sleepers.instanceMatrix.needsUpdate = true;
  }
}

/** A flat ribbon following a curve (ballast bed, platform edge). */
export function makeRibbon(
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  closed: boolean,
  y = 0.015,
  color: number = COLORS.ballast,
  n = 320,
): THREE.Mesh {
  const f = newFrame();
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    frameAt(curve, i / n, f, closed);
    const lx = f.pos.x - f.right.x * (width / 2);
    const lz = f.pos.z - f.right.z * (width / 2);
    const rx = f.pos.x + f.right.x * (width / 2);
    const rz = f.pos.z + f.right.z * (width / 2);
    pos.push(lx, y, lz, rx, y, rz);
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
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 1 }));
  m.receiveShadow = true;
  return m;
}

/** The dead-end spur that leaves the loop at the switch and curves into the infield. */
export function makeSpurCurve(loop: THREE.Curve<THREE.Vector3>, uSwitch: number): THREE.CatmullRomCurve3 {
  const f = frameAt(loop, uSwitch, newFrame());
  const inward = f.right.clone().negate();
  const P = (a: number, b: number) => f.pos.clone().addScaledVector(f.tan, a).addScaledVector(inward, b);
  const c = new THREE.CatmullRomCurve3([P(0, 0), P(2.4, 0.04), P(4.8, 0.8), P(7.2, 2.5), P(8.8, 4.9)], false, 'centripetal');
  c.arcLengthDivisions = 600;
  c.updateArcLengths();
  return c;
}

/** A fence of posts and rails alongside a stretch of track. side: +1 outside, -1 inside. */
export function makeFence(
  curve: THREE.Curve<THREE.Vector3>,
  zone: Zone,
  side: 1 | -1,
  dist: number,
  height: number,
  m: THREE.Material,
  closed = true,
  spacing = 0.8,
): THREE.Group {
  const g = new THREE.Group();
  const f = newFrame();
  const L = curve.getLength();
  const u0 = zone.u0;
  let u1 = zone.u1;
  if (closed && u1 < u0) u1 += 1;
  const n = Math.max(1, Math.round(((u1 - u0) * L) / spacing));
  const postGeo = new THREE.BoxGeometry(0.13, height, 0.13);
  const railGeo = new THREE.BoxGeometry(0.09, 0.11, 1);
  const prev = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    frameAt(curve, u, f, closed);
    p.copy(f.pos).addScaledVector(f.right, side * dist);
    const post = new THREE.Mesh(postGeo, m);
    post.position.set(p.x, height / 2, p.z);
    post.castShadow = true;
    g.add(post);
    if (i > 0) {
      const d = p.clone().sub(prev);
      const len = d.length();
      for (const hy of [height * 0.88, height * 0.5]) {
        const rail = new THREE.Mesh(railGeo, m);
        rail.position.set((prev.x + p.x) / 2, hy, (prev.z + p.z) / 2);
        rail.quaternion.setFromUnitVectors(Z, d.clone().normalize());
        rail.scale.z = len * 1.06;
        rail.castShadow = true;
        g.add(rail);
      }
    }
    prev.copy(p);
  }
  return g;
}
