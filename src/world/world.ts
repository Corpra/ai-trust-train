import * as THREE from 'three';
import { COLORS } from '../config';
import { Fx, pop, snapShow } from '../fx';
import { box, canvasTexture, cyl, mat, metal, rng, sphere, Z } from '../util3d';
import { ease, tweens } from '../tween';
import {
  frameAt,
  makeMain,
  makeRibbon,
  makeSpurCurve,
  nearestU,
  newFrame,
  RailLine,
  RAIL_TOP,
  type Frame,
  type Zone,
} from './track';

export type HazardId = 'switch' | 'curve' | 'gap';

export interface DerailPose {
  lat: number;
  lift: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface Hazard {
  id: HazardId;
  /** Distance along the main line where the train derails (or where the switch sits). */
  s: number;
  pos: THREE.Vector3;
  frame: Frame;
  pose: DerailPose;
  /** How far past the hazard the loco is set after a fix. */
  clear: number;
  /** First guardrail, earned in phase 4. */
  guard: THREE.Group | null;
  /** Reinforcement earned in phase 5 (curve only). */
  guard2: THREE.Group | null;
  guardMat: THREE.MeshStandardMaterial | null;
  installed: boolean;
  reinforced: boolean;
  glow: number;
}

const GUARD_BASE = 0.55;

/** Soft brown blotches, feathered to nothing at the sides, tiling along the track. */
function makeMudTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(512, (g, s) => {
    const r = rng(5);
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = r() * s;
      const y = r() * s;
      const rad = 14 + r() * 70;
      const a = 0.05 + r() * 0.16;
      const shade = 150 + Math.floor(r() * 60);
      for (const dy of [-s, 0, s]) {
        const grad = g.createRadialGradient(x, y + dy, 0, x, y + dy, rad);
        grad.addColorStop(0, `rgba(${shade}, ${Math.floor(shade * 0.72)}, ${Math.floor(shade * 0.5)}, ${a})`);
        grad.addColorStop(1, `rgba(${shade}, ${Math.floor(shade * 0.72)}, ${Math.floor(shade * 0.5)}, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y + dy, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
    // feather the sides so the path has no hard edge
    const edge = g.createLinearGradient(0, 0, s, 0);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(0.2, 'rgba(0,0,0,1)');
    edge.addColorStop(0.8, 'rgba(0,0,0,1)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = edge;
    g.fillRect(0, 0, s, s);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class World {
  readonly group = new THREE.Group();
  readonly fx = new Fx();
  readonly main: THREE.CatmullRomCurve3;
  readonly mainLen: number;
  readonly rails: RailLine;
  readonly spurCurve: THREE.CatmullRomCurve3;
  readonly spurLen: number;
  readonly hazards: Hazard[] = [];
  readonly byId: Record<HazardId, Hazard>;
  /** Loco distance when stopped at B. */
  /** Main-line distance of the stop at B. */
  readonly stopS: number;
  /** Where the railway ends in every phase but 7, just past B (0..1 along the main line). */
  private readonly endU: number;
  readonly spots: {
    /** Where the human waits for the self-driving train (on the slab). */
    waitAtB: THREE.Vector3;
    /** Where the human stands beside the lever. */
    lever: THREE.Vector3;
    /** Three slab slots for accepted crates. */
    crates: THREE.Vector3[];
    slabTop: number;
  };
  /** Set by the director: brighter guardrails on the end screen. */

  private readonly spurRails: RailLine;
  private readonly spurGroup = new THREE.Group();
  private readonly lever: THREE.Group;
  private readonly f = newFrame();
  private lastReveal = -1;

  constructor(scene: THREE.Scene) {
    this.main = makeMain();
    this.mainLen = this.main.getLength();
    const L = this.mainLen;

    // Mud path (the "road" of phase 1): a faint, blotchy brown wash with soft, wobbly edges.
    const mudTex = makeMudTexture();
    const mudMat = new THREE.MeshStandardMaterial({
      color: 0x6a4d38,
      map: mudTex,
      roughness: 1,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      emissive: 0x0e0906,
    });
    const r = rng(11);
    const wobble = Array.from({ length: 64 }, () => 0.6 + r() * 0.8);
    const mudWidth = (t: number): number => {
      const k = t * (wobble.length - 1);
      const i = Math.floor(k);
      const a = wobble[i];
      const b = wobble[Math.min(wobble.length - 1, i + 1)];
      return 3.4 + (a + (b - a) * (k - i)) * 1.1;
    };
    this.group.add(makeRibbon(this.main, mudWidth, 0.012, mudMat, 600, 0, nearestU(this.main, 67, -50), 7));

    this.rails = new RailLine(this.main);
    this.group.add(this.rails.group);

    // Hazard positions
    const uSwitch = nearestU(this.main, 0, -40);
    const uCurve = nearestU(this.main, 5.6, -59.2);
    const gapCenterU = nearestU(this.main, 32.5, -64.6);
    const gapHalf = 1.1 / L;
    this.rails.gapZone = { u0: gapCenterU - gapHalf, u1: gapCenterU + gapHalf };

    // Siding
    this.spurCurve = makeSpurCurve(this.main, uSwitch);
    this.spurLen = this.spurCurve.getLength();
    this.spurRails = new RailLine(this.spurCurve);
    this.spurGroup.add(this.spurRails.group);
    this.spurGroup.add(makeRibbon(this.spurCurve, 3.0, 0.011, mudMat, 120, 0.08, 1, 7));
    const spurEnd = frameAt(this.spurCurve, 1, newFrame());
    this.spurGroup.add(this.makeBuffer(spurEnd));
    this.group.add(this.spurGroup);

    // Lever beside the switch, on the camera side
    const sw = frameAt(this.main, uSwitch, newFrame());
    this.lever = this.makeLever();
    this.lever.position.copy(sw.pos).addScaledVector(sw.right, 1.7);
    this.lever.quaternion.setFromUnitVectors(Z, sw.tan);
    this.spurGroup.add(this.lever);

    // Destination slab at B, alongside the last stretch on the right
    // the curve runs on past B, but only phase 7 shows that stretch (the train leaves and comes back on it)
    this.endU = nearestU(this.main, 67, -50);
    this.stopS = this.endU * L - 2.2;
    const end = frameAt(this.main, this.stopS / L, newFrame());
    const slabTop = 0.18;
    const slab = box(2.4, slabTop, 7.5, COLORS.slab, mat(COLORS.slab, { roughness: 0.95, emissive: 0x0d0e11 }));
    slab.position.copy(end.pos).addScaledVector(end.right, 2.3).addScaledVector(end.tan, -1.2);
    slab.position.y = slabTop / 2;
    slab.quaternion.setFromUnitVectors(Z, end.tan);
    this.group.add(slab);
    const edge = box(0.05, 0.02, 7.5, COLORS.slabEdge, mat(COLORS.slabEdge, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
    edge.position.copy(end.pos).addScaledVector(end.right, 1.14).addScaledVector(end.tan, -1.2);
    edge.position.y = slabTop + 0.015;
    edge.quaternion.copy(slab.quaternion);
    this.group.add(edge);

    this.spots = {
      waitAtB: end.pos.clone().addScaledVector(end.right, 2.2).addScaledVector(end.tan, -0.6).setY(slabTop),
      lever: sw.pos.clone().addScaledVector(sw.right, 1.1).addScaledVector(sw.tan, -0.5).setY(0),
      crates: [0, 1, 2].map((i) => end.pos.clone().addScaledVector(end.right, 2.75).addScaledVector(end.tan, -2.4 - i * 1.0).setY(slabTop + 0.36)),
      slabTop,
    };

    // Hazards and their guardrails
    const H = (id: HazardId, u: number, pose: DerailPose, clear: number): Hazard => {
      const frame = frameAt(this.main, u, newFrame());
      const h: Hazard = {
        id,
        s: u * L,
        pos: frame.pos.clone(),
        frame,
        pose,
        clear,
        guard: null,
        guard2: null,
        guardMat: null,
        installed: false,
        reinforced: false,
        glow: 0,
      };
      this.hazards.push(h);
      return h;
    };
    const sw2 = H('switch', uSwitch, { lat: 0, lift: 0.08, roll: 0.05, pitch: -0.18, yaw: 0 }, 0);
    const curve = H('curve', uCurve, { lat: -0.9, lift: -0.12, roll: -0.95, pitch: 0.02, yaw: -0.3 }, 1.4);
    const gap = H('gap', gapCenterU - gapHalf - 0.35 / L, { lat: 0, lift: -0.6, roll: 0.08, pitch: 0.55, yaw: 0 }, 3.4);
    this.hazards.sort((a, b) => a.s - b.s);
    this.byId = { switch: sw2, curve, gap };

    const guardMat = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: COLORS.guard, emissive: COLORS.guard, emissiveIntensity: GUARD_BASE, roughness: 0.5 });

    // Curve guardrail: a luminous line on the outside (left) of the bend, reinforced with a second, higher line at speed
    const curveZone: Zone = { u0: nearestU(this.main, 0.6, -50), u1: nearestU(this.main, 14.5, -63.6) };
    curve.guardMat = guardMat();
    curve.guard = this.makeGlowLine(curveZone, -1, 1.4, 0.55, 0.03, curve.guardMat);
    curve.guard2 = this.makeGlowLine(curveZone, -1, 1.55, 1.0, 0.045, curve.guardMat);
    // Gap guardrail: a bridge plate with rail stubs
    gap.guardMat = guardMat();
    gap.guard = this.makeBridge(gapCenterU, gapHalf * 2 * L, gap.guardMat);
    for (const h of this.hazards) {
      for (const g of [h.guard, h.guard2]) {
        if (!g) continue;
        g.visible = false;
        g.scale.setScalar(0.001);
        this.group.add(g);
      }
    }

    this.group.add(this.fx.group);
    scene.add(this.group);
  }

  private makeBuffer(f: Frame): THREE.Group {
    const g = new THREE.Group();
    const beam = box(1.5, 0.18, 0.12, COLORS.metalDark, metal(COLORS.metalDark));
    beam.position.y = 0.5;
    g.add(beam);
    for (const x of [-0.5, 0.5]) {
      const post = box(0.07, 0.6, 0.07, COLORS.metalDark, metal(COLORS.metalDark));
      post.position.set(x, 0.3, -0.15);
      g.add(post);
    }
    g.position.copy(f.pos).addScaledVector(f.tan, 0.3);
    g.quaternion.setFromUnitVectors(Z, f.tan);
    return g;
  }

  private makeLever(): THREE.Group {
    const g = new THREE.Group();
    const base = cyl(0.11, 0.13, 0.05, COLORS.metalDark, 16, metal(COLORS.metalDark));
    base.position.y = 0.025;
    g.add(base);
    const arm = new THREE.Group();
    arm.name = 'arm';
    const stick = cyl(0.022, 0.026, 1.0, COLORS.lever, 12, mat(COLORS.lever, { emissive: 0x777777 }));
    stick.position.y = 0.5;
    arm.add(stick);
    const knob = sphere(0.06, COLORS.lever, 16, mat(COLORS.lever, { emissive: 0x777777 }));
    knob.position.y = 1.0;
    arm.add(knob);
    arm.position.y = 0.12;
    arm.rotation.x = -0.45;
    g.add(arm);
    return g;
  }

  /** A thin luminous rail on slim posts alongside a stretch of track. */
  private makeGlowLine(zone: Zone, side: 1 | -1, dist: number, height: number, radius: number, m: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const f = this.f;
    const L = this.mainLen;
    const n = Math.max(8, Math.round(((zone.u1 - zone.u0) * L) / 0.5));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      frameAt(this.main, zone.u0 + ((zone.u1 - zone.u0) * i) / n, f);
      pts.push(f.pos.clone().addScaledVector(f.right, side * dist).setY(height));
    }
    const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, n * 2, radius, 10, false), m);
    g.add(tube);
    const postGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, height, 8);
    const every = Math.max(1, Math.round(2.4 / (((zone.u1 - zone.u0) * L) / n)));
    for (let i = 0; i <= n; i += every) {
      const post = new THREE.Mesh(postGeo, m);
      post.position.copy(pts[i]).setY(height / 2);
      g.add(post);
    }
    return g;
  }

  private makeBridge(uCenter: number, len: number, m: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const f = frameAt(this.main, uCenter, newFrame());
    const plate = box(1.5, 0.05, len + 1.4, COLORS.guard, m);
    plate.position.y = 0.08;
    g.add(plate);
    for (const side of [-0.5, 0.5]) {
      const stub = box(0.08, 0.1, len + 1.4, COLORS.guard, m);
      stub.position.set(side, 0.11 + 0.05, 0);
      g.add(stub);
    }
    g.position.copy(f.pos);
    g.quaternion.setFromUnitVectors(Z, f.tan);
    return g;
  }

  /** Hazards whose derail point lies in (s0, s1]. */
  crossed(s0: number, s1: number): Hazard[] {
    return this.hazards.filter((h) => h.s > s0 && h.s <= s1);
  }

  /** Reset the world for a phase (called while the splash covers the scene). */
  setPhase(n: number): void {
    tweens.kill(this.rails);
    this.rails.reveal = n >= 3 ? 1 : 0;
    this.rails.endU = n === 7 ? 1 : this.endU;
    this.spurGroup.visible = n >= 3;
    this.spurRails.reveal = 1;
    for (const h of this.hazards) {
      const on = h.id !== 'switch' && n >= 5;
      const strong = h.id === 'curve' && n >= 6;
      h.installed = on;
      h.reinforced = strong;
      h.glow = 0;
      if (h.guard) snapShow(h.guard, on);
      if (h.guard2) snapShow(h.guard2, strong);
      if (h.guardMat) h.guardMat.emissiveIntensity = GUARD_BASE;
    }
    this.rails.markDirty();
    this.spurRails.markDirty();
    this.setLever(false);
    this.fx.clear();
  }

  /** Grow the rails from A to B. */
  revealRails(d: number): void {
    this.rails.reveal = 0;
    this.rails.markDirty();
    this.spurGroup.visible = true;
    tweens.to(this.rails, { reveal: 1 }, d, ease.inOut);
  }

  setLever(flipped: boolean, animate = false): void {
    const arm = this.lever.getObjectByName('arm')!;
    tweens.kill(arm.rotation);
    const to = flipped ? 0.45 : -0.45;
    if (animate) tweens.to(arm.rotation, { x: to }, 0.5, ease.outBack);
    else arm.rotation.x = to;
  }

  /** Earn a guardrail; `strong` adds the reinforcement on top of an existing one. */
  installGuardrail(h: Hazard, strong = false): void {
    if (strong && h.guard2) {
      h.reinforced = true;
      pop(h.guard2, 0.55);
    } else {
      h.installed = true;
      if (h.guard) pop(h.guard, 0.55);
    }
    this.fx.flash(h.pos.clone().setY(RAIL_TOP), COLORS.flash);
    h.glow = 1.2;
  }

  /** The train went safely past an installed guardrail. */
  passFlash(h: Hazard): void {
    this.fx.flash(h.pos.clone().setY(RAIL_TOP), COLORS.guard);
    h.glow = 1;
  }

  update(dt: number): void {
    if (this.rails.reveal !== this.lastReveal) {
      this.lastReveal = this.rails.reveal;
      this.rails.markDirty();
    }
    this.rails.update();
    this.spurRails.update();
    for (const h of this.hazards) {
      if (!h.guardMat) continue;
      h.glow = Math.max(0, h.glow - dt * 1.6);
      h.guardMat.emissiveIntensity = GUARD_BASE + h.glow * 1.3;
    }
    this.fx.update(dt);
  }
}
