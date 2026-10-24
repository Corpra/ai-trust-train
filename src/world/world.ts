import * as THREE from 'three';
import { COLORS, MOTION } from '../config';
import { Fx, show, snapShow } from '../fx';
import { ease, tweens } from '../tween';
import { box, cyl, mat, rng, sphere, Z } from '../util3d';
import type { DerailPose } from '../actors/train';
import {
  GlowLine,
  makeBuilding,
  makeGrassPatches,
  makeGround,
  makeHouse,
  makeSignal,
  makeStation,
  makeTree,
  PLATFORM_TOP,
  treeSpots,
} from './scenery';
import {
  distanceToCurve,
  frameAt,
  makeFence,
  makeLoop,
  makeRibbon,
  makeSpurCurve,
  nearestU,
  newFrame,
  RailLine,
  type Zone,
} from './track';

export type HazardId = 'curve' | 'bump' | 'switch' | 'gap';

export interface Hazard {
  id: HazardId;
  index: number;
  /** Arc-length parameter and loop distance where a derail triggers. */
  u: number;
  s: number;
  zone: Zone;
  speedHazard: boolean;
  base: boolean;
  strong: boolean;
  baseGroup: THREE.Group;
  strongGroup: THREE.Group;
  derailPose: DerailPose;
  violentPose: DerailPose;
}

/** How many trees are visible per phase. */
const TREES = [12, 12, 18, 26, 32, 38, 44, 48, 48];

export class World {
  readonly group = new THREE.Group();
  readonly loop: THREE.CatmullRomCurve3;
  readonly loopLen: number;
  readonly rails: RailLine;
  readonly spurCurve: THREE.CatmullRomCurve3;
  readonly spurLen: number;
  readonly hazards: Hazard[] = [];
  readonly fx = new Fx();
  readonly guardMat: THREE.MeshStandardMaterial;

  readonly spots: {
    title: THREE.Vector3;
    watch: THREE.Vector3;
    platform: THREE.Vector3;
    inspect: THREE.Vector3;
    stack: THREE.Vector3;
    lever: THREE.Vector3;
  };

  private readonly spurGroup = new THREE.Group();
  private readonly office: THREE.Group;
  private readonly library: THREE.Group;
  private readonly glowGroup = new THREE.Group();
  private readonly glowLines: GlowLine[] = [];
  private readonly ballast: THREE.Mesh;
  private readonly ballastMat: THREE.MeshStandardMaterial;
  private readonly signals: THREE.Group[] = [];
  private readonly trees: THREE.Group[] = [];
  private readonly houses: THREE.Group[] = [];
  private readonly ditch: THREE.Mesh;
  private readonly lever: THREE.Group;
  private readonly leverArm: THREE.Mesh;
  private readonly trackState = { crooked: 1, bumpAmp: 1 };
  private applied = { crooked: -1, bumpAmp: -1 };
  private phase = 0;
  private t = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.loop = makeLoop();
    this.loopLen = this.loop.getLength();
    const L = this.loopLen;

    this.guardMat = new THREE.MeshStandardMaterial({ color: COLORS.guard, emissive: COLORS.guard, emissiveIntensity: 0, roughness: 0.8, flatShading: true });

    this.group.add(makeGround(), makeGrassPatches(7));

    // ---- main line
    this.rails = new RailLine(this.loop, true, 11);
    this.group.add(this.rails.group);
    this.ballast = makeRibbon(this.loop, 2.7, true, 0.012);
    this.ballastMat = this.ballast.material as THREE.MeshStandardMaterial;
    this.ballastMat.opacity = 0;
    this.ballast.visible = false;
    this.group.add(this.ballast);

    // ---- hazards: positions along the loop
    const uCurve = nearestU(this.loop, 19.6, -10.5);
    const uBump = nearestU(this.loop, 0, -13.6);
    const uSwitch = nearestU(this.loop, -8, -13.6);
    const uGap = nearestU(this.loop, -20.1, -1);
    const span = (units: number) => units / L;

    // ---- spur
    this.spurCurve = makeSpurCurve(this.loop, uSwitch);
    this.spurLen = this.spurCurve.getLength();
    const spurRails = new RailLine(this.spurCurve, false, 23);
    this.spurGroup.add(spurRails.group);
    const endF = frameAt(this.spurCurve, 1, newFrame(), false);
    const buffer = new THREE.Group();
    const beam = box(1.7, 0.45, 0.25, COLORS.bad);
    beam.position.y = 0.62;
    buffer.add(beam);
    for (const x of [-0.5, 0.5]) {
      const stripe = box(0.22, 0.47, 0.27, COLORS.paper);
      stripe.position.set(x, 0.62, 0);
      buffer.add(stripe);
      const post = box(0.16, 0.75, 0.16, COLORS.signalPost);
      post.position.set(x * 1.4, 0.37, -0.2);
      buffer.add(post);
    }
    buffer.position.copy(endF.pos);
    buffer.quaternion.setFromUnitVectors(Z, endF.tan);
    this.spurGroup.add(buffer);
    this.group.add(this.spurGroup);

    // switch lever, on the inside of the loop next to the switch
    const swF = frameAt(this.loop, uSwitch, newFrame());
    const leverPos = swF.pos.clone().addScaledVector(swF.right, -1.6);
    this.lever = new THREE.Group();
    const base = box(0.5, 0.16, 0.5, COLORS.signalPost);
    base.position.y = 0.08;
    this.lever.add(base);
    this.leverArm = cyl(0.05, 0.06, 0.8, COLORS.wheel, 8);
    this.leverArm.position.y = 0.4;
    const knob = sphere(0.12, COLORS.bad, 8);
    knob.position.y = 0.42;
    this.leverArm.add(knob);
    this.leverArm.rotation.z = 0.55;
    this.lever.add(this.leverArm);
    this.lever.position.copy(leverPos);
    this.lever.quaternion.setFromUnitVectors(Z, swF.tan);
    this.spurGroup.add(this.lever);

    // the gap: a ditch under the rails, no sleepers there
    const gapZone: Zone = { u0: uGap - span(1.4), u1: uGap + span(1.4) };
    this.rails.noSleeperZones = [gapZone];
    const gapF = frameAt(this.loop, uGap, newFrame());
    this.ditch = box(2.2, 0.05, 2.8, COLORS.ditch, { flatShading: false, roughness: 0.3 });
    this.ditch.position.copy(gapF.pos);
    this.ditch.position.y = 0.02;
    this.ditch.quaternion.setFromUnitVectors(Z, gapF.tan);
    this.ditch.rotateY(Math.PI / 2);
    this.ditch.receiveShadow = true;
    this.group.add(this.ditch);

    // the bumpy stretch
    const bumpZone: Zone = { u0: uBump - span(4), u1: uBump + span(4) };
    this.rails.bumpZone = bumpZone;

    // ---- hazard records with their guardrails
    const curveZone: Zone = { u0: uCurve - span(4), u1: uCurve + span(3.5) };
    const switchZone: Zone = { u0: uSwitch - span(1), u1: uSwitch + span(2) };
    const guard = this.guardMat;

    const curveBase = makeFence(this.loop, curveZone, 1, 1.4, 0.75, guard);
    const curveStrong = new THREE.Group();
    curveStrong.add(makeFence(this.loop, curveZone, -1, 1.15, 0.5, guard));
    curveStrong.add(this.chevrons(curveZone, 3));

    const bumpBase = makeFence(this.loop, bumpZone, 1, 1.4, 0.6, guard, true, 1.0);
    const bumpStrong = makeFence(this.loop, bumpZone, -1, 1.15, 0.6, guard, true, 1.0);

    const switchBase = new THREE.Group();
    const barF = frameAt(this.spurCurve, 1.6 / this.spurLen, newFrame(), false);
    const bar = new THREE.Group();
    const barBeam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.14), guard);
    barBeam.position.y = 0.7;
    barBeam.castShadow = true;
    bar.add(barBeam);
    for (const x of [-0.9, 0.9]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), guard);
      p.position.set(x, 0.4, 0);
      p.castShadow = true;
      bar.add(p);
    }
    bar.position.copy(barF.pos);
    bar.quaternion.setFromUnitVectors(Z, barF.tan);
    switchBase.add(bar);
    const lock = new THREE.Group();
    const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.16), guard);
    lock.add(lockBody);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12, Math.PI), mat(COLORS.signalPost));
    shackle.position.y = 0.16;
    lock.add(shackle);
    lock.position.copy(leverPos).add(new THREE.Vector3(0, 0.35, 0));
    switchBase.add(lock);
    const switchStrong = new THREE.Group();

    const gapBase = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 3.2), guard);
    plate.position.copy(gapF.pos);
    plate.position.y = 0.05;
    plate.quaternion.setFromUnitVectors(Z, gapF.tan);
    plate.castShadow = true;
    plate.receiveShadow = true;
    gapBase.add(plate);
    gapBase.add(makeFence(this.loop, gapZone, 1, 1.4, 0.6, guard, true, 0.9));
    const gapStrong = new THREE.Group();

    const defs: [HazardId, number, Zone, boolean, THREE.Group, THREE.Group, DerailPose, DerailPose][] = [
      [
        'curve',
        uCurve,
        curveZone,
        true,
        curveBase,
        curveStrong,
        { lat: 1.0, lift: -0.05, roll: -0.6, pitch: 0, yaw: 0.25 },
        { lat: 1.7, lift: 0.1, roll: -1.15, pitch: 0.05, yaw: 0.5 },
      ],
      [
        'bump',
        uBump,
        bumpZone,
        true,
        bumpBase,
        bumpStrong,
        { lat: -0.55, lift: 0.05, roll: 0.5, pitch: 0.1, yaw: -0.2 },
        { lat: -1.1, lift: 0.12, roll: 0.95, pitch: 0.15, yaw: -0.45 },
      ],
      [
        'switch',
        uSwitch,
        switchZone,
        false,
        switchBase,
        switchStrong,
        { lat: 0, lift: 0.06, roll: 0.08, pitch: 0.14, yaw: 0.05 },
        { lat: 0, lift: 0.1, roll: 0.15, pitch: 0.25, yaw: 0.1 },
      ],
      [
        'gap',
        uGap,
        gapZone,
        false,
        gapBase,
        gapStrong,
        { lat: 0.15, lift: -0.42, roll: 0.22, pitch: 0.35, yaw: 0 },
        { lat: 0.4, lift: -0.5, roll: 0.5, pitch: 0.5, yaw: 0.1 },
      ],
    ];
    defs.forEach(([id, u, zone, speedHazard, baseGroup, strongGroup, derailPose, violentPose], index) => {
      snapShow(baseGroup, false);
      snapShow(strongGroup, false);
      this.group.add(baseGroup, strongGroup);
      this.hazards.push({ id, index, u, s: u * L, zone, speedHazard, base: false, strong: false, baseGroup, strongGroup, derailPose, violentPose });
    });

    // ---- station, buildings, signals
    this.group.add(makeStation());
    this.office = makeBuilding('office');
    this.office.position.set(7.6, 0, 17.6);
    this.library = makeBuilding('library');
    this.library.position.set(13.2, 0, 17.6);
    this.group.add(this.office, this.library);

    const trackPt = (x: number, z: number) => this.loop.getPointAt(nearestU(this.loop, x, z)).setY(0.3);
    this.glowLines.push(new GlowLine(new THREE.Vector3(6.6, 1.2, 15.8), trackPt(4, 11.2).add(new THREE.Vector3(0, 0, 0.9))));
    this.glowLines.push(new GlowLine(new THREE.Vector3(12.6, 1.0, 15.8), trackPt(10, 10.8).add(new THREE.Vector3(0.6, 0, 0.7))));
    for (const gl of this.glowLines) this.glowGroup.add(gl.group);
    this.group.add(this.glowGroup);

    const sf = newFrame();
    for (const u of [0.08, 0.3, 0.46, 0.62, 0.78, 0.92]) {
      frameAt(this.loop, u, sf);
      const sig = makeSignal();
      sig.position.copy(sf.pos).addScaledVector(sf.right, 1.7);
      sig.quaternion.setFromUnitVectors(Z, sf.tan.clone().negate());
      this.signals.push(sig);
      this.group.add(sig);
    }

    // ---- trees and houses
    const housePositions: [number, number, number][] = [
      [-27, 0, 7],
      [-28, 0, -7],
      [27, 0, -3],
      [16, 0, -22],
    ];
    const hr = rng(5);
    for (const [x, y, z] of housePositions) {
      const h = makeHouse(hr);
      h.position.set(x, y, z);
      h.rotation.y = hr() * Math.PI * 2;
      this.houses.push(h);
      this.group.add(h);
    }
    const avoid = (x: number, z: number): boolean => {
      if (x > -9 && x < 18 && z > 11.5 && z < 22) return true; // station and buildings
      if (distanceToCurve(this.spurCurve, x, z, 60) < 3) return true;
      return housePositions.some(([hx, , hz]) => Math.hypot(hx - x, hz - z) < 4.5);
    };
    const tr = rng(3);
    for (const p of treeSpots(this.loop, TREES[TREES.length - 1], 42, avoid)) {
      const t = makeTree(tr);
      t.position.copy(p);
      this.trees.push(t);
      this.group.add(t);
    }

    this.group.add(this.fx.group);

    const leverGround = leverPos.clone().addScaledVector(swF.right, -1.0);
    leverGround.y = 0;
    this.spots = {
      title: new THREE.Vector3(1.6, PLATFORM_TOP, 13.0),
      watch: new THREE.Vector3(2.9, PLATFORM_TOP, 13.1),
      platform: new THREE.Vector3(-1.5, PLATFORM_TOP, 13.3),
      inspect: new THREE.Vector3(-3.3, PLATFORM_TOP + 0.36, 13.1),
      stack: new THREE.Vector3(-4.7, PLATFORM_TOP + 0.36, 13.6),
      lever: leverGround,
    };

    this.setPhase(0, false);
  }

  private chevrons(zone: Zone, n: number): THREE.Group {
    const g = new THREE.Group();
    const f = newFrame();
    const white = mat(COLORS.paper);
    const red = mat(COLORS.bad);
    for (let i = 0; i < n; i++) {
      const u = zone.u0 + ((zone.u1 - zone.u0) * (i + 0.5)) / n;
      frameAt(this.loop, u, f);
      const board = new THREE.Group();
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.06), white);
      back.castShadow = true;
      board.add(back);
      for (const s of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.07), red);
        stripe.position.set(s * 0.2, 0, 0.005);
        stripe.rotation.z = s * 0.7;
        board.add(stripe);
      }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), mat(COLORS.signalPost));
      post.position.y = -0.6;
      board.add(post);
      board.position.copy(f.pos).addScaledVector(f.right, 2.0);
      board.position.y = 1.0;
      board.quaternion.setFromUnitVectors(Z, f.right.clone().negate());
      g.add(board);
    }
    return g;
  }

  /** World-space frame on the loop at distance s. */
  frameAtS(s: number, out = newFrame()) {
    return frameAt(this.loop, s / this.loopLen, out);
  }

  /** Apply the static look of a phase. With animate=false everything snaps. */
  setPhase(n: number, animate: boolean): void {
    this.phase = n;
    const d = animate ? MOTION : 0;
    const vis = (obj: THREE.Object3D, on: boolean, delay = 0): void => {
      if (!animate) {
        snapShow(obj, on);
        return;
      }
      if (delay > 0) setTimeout(() => show(obj, on, 0.7), delay * 1000);
      else show(obj, on, 0.7);
    };

    tweens.to(this.trackState, { crooked: n <= 1 ? 1 : 0 }, 1.6 * d, ease.inOut);
    vis(this.spurGroup, n >= 2, 0.9);
    vis(this.ditch, n >= 2, 0.9);
    vis(this.office, n >= 2, 1.2);
    vis(this.library, n >= 3, 0.3);
    vis(this.glowGroup, n >= 3, 0.9);
    this.signals.forEach((s, i) => vis(s, n >= 3, 0.2 + i * 0.12));
    this.houses.forEach((h, i) => vis(h, n >= 3, 0.4 + i * 0.15));
    this.trees.forEach((t, i) => vis(t, i < TREES[n], (i % 7) * 0.1));

    const ballastOn = n >= 3;
    if (ballastOn) this.ballast.visible = true;
    tweens.to(this.ballastMat, { opacity: ballastOn ? 1 : 0 }, 1.0 * d, ease.inOut, () => {
      this.ballast.visible = ballastOn;
    });

    for (const h of this.hazards) this.setGuardrail(h, n >= 5, n >= 6, animate);
  }

  private setGuardrail(h: Hazard, base: boolean, strong: boolean, animate: boolean): void {
    h.base = base;
    h.strong = strong;
    if (animate) {
      show(h.baseGroup, base, 0.6);
      show(h.strongGroup, strong, 0.6);
    } else {
      snapShow(h.baseGroup, base);
      snapShow(h.strongGroup, strong);
    }
    const d = animate ? MOTION : 0;
    if (h.id === 'bump') tweens.to(this.trackState, { bumpAmp: strong ? 0 : base ? 0.3 : 1 }, 0.9 * d, ease.inOut);
    if (h.id === 'switch') tweens.to(this.leverArm.rotation, { z: base ? -0.55 : 0.55 }, 0.5 * d, ease.inOut);
  }

  /** Install a guardrail with a flash. strong=true installs the reinforced version. */
  installGuardrail(h: Hazard, strong: boolean): void {
    this.setGuardrail(h, true, strong || h.strong, true);
    const f = this.frameAtS(h.s);
    this.fx.flash(f.pos.clone().addScaledVector(f.right, h.id === 'switch' ? -1.6 : 1.4), COLORS.guard);
    this.fx.flash(f.pos.clone(), COLORS.flash);
  }

  /** Hazards whose trigger point lies in (s0, s1]. */
  crossed(s0: number, s1: number): Hazard[] {
    return this.hazards.filter((h) => h.s > s0 && h.s <= s1);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.trackState.crooked !== this.applied.crooked || this.trackState.bumpAmp !== this.applied.bumpAmp) {
      this.rails.crooked = this.trackState.crooked;
      this.rails.bumpAmp = this.trackState.bumpAmp;
      this.rails.markDirty();
      this.applied = { ...this.trackState };
    }
    this.rails.update();
    for (const gl of this.glowLines) gl.update(dt);
    this.fx.update(dt);
    const glow = this.phase === 8 ? 0.45 + Math.sin(this.t * 2.5) * 0.35 : 0;
    this.guardMat.emissiveIntensity += (glow - this.guardMat.emissiveIntensity) * Math.min(1, dt * 3);
  }

  get crooked(): number {
    return this.trackState.crooked;
  }
}
