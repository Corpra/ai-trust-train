import * as THREE from 'three';
import {
  COLORS,
  LAP_SECONDS,
  MOTION,
  PHASE_COUNT,
  TRUST_FLOOR,
  TRUST_PER_CLEAN_LAP,
  TRUST_PER_DERAIL,
  TRUST_PER_OK_CARGO,
} from '../config';
import { ease, Sequencer, step, until, wait, type Seq, tweens } from '../tween';
import { pop, show, snapShow, unpop } from '../fx';
import type { World, Hazard } from '../world/world';
import type { Train } from '../actors/train';
import { type Human, makeTicket } from '../actors/human';
import type { Hud } from '../ui/hud';
import type { CameraRig } from '../cameraRig';
import { writeHash, type Controls } from '../ui/input';
import { box } from '../util3d';

interface Deps {
  scene: THREE.Scene;
  world: World;
  train: Train;
  human: Human;
  hud: Hud;
  rig: CameraRig;
}

type HumanMode = 'free' | 'push' | 'cab';

const WHOLE = { pos: [0, 27, 37] as const, look: [0, 0, 6] as const };
const CAM: { pos: readonly [number, number, number]; look: readonly [number, number, number] }[] = [
  { pos: [9, 7, 23], look: [-0.5, 1, 11] },
  WHOLE,
  WHOLE,
  WHOLE,
  WHOLE,
  WHOLE,
  WHOLE,
  { pos: [0, 25, 35], look: [0, 0, 7] },
  { pos: [0, 60, 13], look: [0, 0, 3] },
];

function makeCrate(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.72, 0.72, 0.72, COLORS.crate));
  for (const y of [-0.2, 0.2]) {
    const band = box(0.76, 0.1, 0.76, COLORS.crateDark);
    band.position.y = y;
    g.add(band);
  }
  return g;
}

export class Director implements Controls {
  phase = 0;

  private cruise = 0;
  private speedScale = 1;
  private trust = 0;
  private trustShown = 0;
  private cleanLaps = 0;
  private lapHadDerail = false;
  private lap = 0;
  private time = 0;

  private readonly seq = new Sequencer();
  private readonly loopSeq = new Sequencer();
  private awaitingFix: Hazard | null = null;
  private manualFixDone = false;
  private grace = false;
  private forced = false;
  private derailing = false;
  private frozen = false;
  private hold = false;
  private spurBumped = false;
  private stopAtStation = false;
  private atStation = false;
  private humanMode: HumanMode = 'free';
  private sweatTimer = 0;

  private readonly ticket: THREE.Mesh;
  private readonly stack: THREE.Group[] = [];
  private wagonCrate: THREE.Group | null = null;

  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();

  constructor(private readonly d: Deps) {
    d.train.spurCurve = d.world.spurCurve;
    d.train.spurLen = d.world.spurLen;
    d.rig.followTarget = d.train.loco;
    this.ticket = makeTicket();
    this.ticket.visible = false;
    d.scene.add(this.ticket);
  }

  /* ---------------- Controls ---------------- */

  next(): void {
    if (this.phase === 4 && this.phase4Next()) return;
    this.goTo(this.phase + 1);
  }

  prev(): void {
    this.goTo(this.phase - 1);
  }

  goTo(n: number, snap = false): void {
    n = Math.max(0, Math.min(PHASE_COUNT - 1, n));
    if (n === this.phase && !snap) return;
    const forward = !snap && n === this.phase + 1;
    this.enterPhase(n, forward);
  }

  forceDerail(): void {
    if (this.derailing || this.phase <= 1) return;
    this.forced = true;
  }

  nudgeSpeed(factor: number): void {
    this.speedScale = Math.max(0.4, Math.min(2.5, this.speedScale * factor));
    this.cruise = this.cruiseFor(this.phase);
  }

  resetPhase(): void {
    this.enterPhase(this.phase, false);
  }

  toggleFollow(): void {
    this.d.rig.follow = !this.d.rig.follow;
  }

  /** Phase 4: Next fixes the paused derail, or forces the first derail if it has not happened yet. */
  private phase4Next(): boolean {
    if (this.awaitingFix) {
      const h = this.awaitingFix;
      this.awaitingFix = null;
      this.manualFixDone = true;
      this.seq.run(this.fixSeq(h));
      return true;
    }
    if (!this.manualFixDone && !this.derailing) {
      if (this.forced) return false; // second press while waiting: let them move on
      this.forced = true;
      return true;
    }
    return false;
  }

  /* ---------------- Phases ---------------- */

  private cruiseFor(n: number): number {
    return n === 0 ? 0 : (this.d.train.loopLen / LAP_SECONDS[n]) * this.speedScale;
  }

  private enterPhase(n: number, forward: boolean): void {
    const { train, human, world, hud, rig } = this.d;
    const prev = this.phase;
    this.phase = n;
    writeHash(n);
    hud.setPhase(n);

    this.seq.cancel();
    this.loopSeq.cancel();
    this.awaitingFix = null;
    this.derailing = false;
    this.frozen = false;
    this.hold = false;
    this.forced = false;
    this.grace = false;
    this.spurBumped = false;
    this.stopAtStation = false;
    this.atStation = false;
    this.lapHadDerail = false;
    if (n !== 4 || !forward) this.manualFixDone = false;

    train.resetDerail();
    tweens.kill(train);
    train.eyes = n >= 6 ? 'happy' : n >= 2 ? 'focused' : 'calm';
    tweens.to(train, { wobble: n <= 1 ? 1 : 0 }, forward ? 1.4 * MOTION : 0);
    if (!(forward && prev === 1 && n === 2)) {
      if (forward) show(train.wagon, n >= 2, 0.6);
      else snapShow(train.wagon, n >= 2);
    }

    world.setPhase(n, forward);

    rig.setTarget(new THREE.Vector3(...CAM[n].pos), new THREE.Vector3(...CAM[n].look), forward ? 1.8 * MOTION : 0);
    rig.follow = n === 1;
    rig.drift = n === 0 ? 0.4 : 1;

    const floor = TRUST_FLOOR[n];
    this.trust = forward ? Math.max(this.trust, floor) : floor;
    if (!forward) this.trustShown = floor;
    if (!forward || n <= 3) this.cleanLaps = 0;
    hud.setLaps(this.cleanLaps, n >= 4);
    this.cruise = this.cruiseFor(n);

    // cargo props
    this.ticket.visible = false;
    if (this.ticket.parent !== this.d.scene) this.d.scene.attach(this.ticket);
    if (n < 7 || (!forward && n === 7)) this.clearStack();
    if (n !== 8 && this.wagonCrate) {
      train.wagon.remove(this.wagonCrate);
      this.wagonCrate = null;
    }

    if (forward) {
      this.seq.run(this.transition(prev, n));
    } else {
      this.snapHuman(n);
    }
    if (n === 7 && !forward) this.loopSeq.run(this.autonomousLoop());
    if (n === 7 && forward && prev !== 6) this.loopSeq.run(this.autonomousLoop());
    if (n === 0) {
      train.s = 0;
      train.speed = 0;
    }
    show(human.bubble, n === 1, 0.5, 1.5);
    if (!forward) snapShow(human.bubble, n === 1, 1.5);
  }

  private snapHuman(n: number): void {
    const { train, human, world } = this.d;
    const S = world.spots;
    human.walking = false;
    snapShow(human.clipboard, n >= 7);
    switch (n) {
      case 0:
        this.placeHuman(S.title, 0, 11, 'stand');
        break;
      case 1:
        this.attachHuman(train.pushSlot, 'push', 'push');
        break;
      case 2:
      case 3:
      case 4:
      case 5:
        this.attachHuman(train.cabSlot, 'drive', 'cab');
        break;
      case 6:
        this.placeHuman(S.watch, 0, 11, 'stand');
        break;
      default:
        this.placeHuman(S.platform, S.platform.x, 11, 'stand');
    }
  }

  private *transition(prev: number, n: number): Seq {
    const { train, human, world } = this.d;
    const S = world.spots;
    if (prev === 0 && n === 1) {
      this.hold = true;
      const slot = train.loco.localToWorld(train.pushSlot.position.clone());
      yield* this.walkTo(slot.x, S.title.y, 12.5, 2.6);
      yield* this.hop(new THREE.Vector3(slot.x, 0, slot.z));
      this.attachHuman(train.pushSlot, 'push', 'push');
      yield wait(0.3);
      this.hold = false;
    } else if (prev === 1 && n === 2) {
      this.hold = true;
      human.pose = 'stand';
      yield until(() => train.speed < 0.05);
      this.detachHuman();
      const p = train.worldPos(this.v1).clone();
      const r = train.right(this.v2).clone();
      const f = train.forward(this.v3).clone();
      const aside = p.clone().addScaledVector(r, 2.3).addScaledVector(f, -2.2);
      aside.y = 0;
      yield* this.walkTo(aside.x, 0, aside.z, 2.5);
      human.faceTowards(p.x, p.z);
      yield wait(0.5);
      show(train.wagon, true, 0.7);
      yield wait(0.9);
      yield* this.climbIn();
      this.hold = false;
    } else if (prev === 4 && n === 5) {
      for (const h of world.hazards) {
        if (!h.base) {
          world.installGuardrail(h, false);
          yield wait(0.25);
        }
      }
      human.pose = 'point';
      yield wait(0.8);
      human.pose = 'drive';
    } else if (prev === 5 && n === 6) {
      for (const h of world.hazards) {
        if (h.speedHazard && !h.strong) {
          world.installGuardrail(h, true);
          yield wait(0.25);
        }
      }
      yield* this.awaitStation();
      yield wait(0.3);
      this.detachHuman();
      yield* this.hop(new THREE.Vector3(S.watch.x - 1.6, S.watch.y, S.watch.z - 0.4));
      yield* this.walkTo(S.watch.x, S.watch.y, S.watch.z, 2.4);
      human.faceTowards(0, 11);
      human.pose = 'stand';
      yield wait(0.5);
      this.stopAtStation = false;
      this.atStation = false;
    } else if (prev === 6 && n === 7) {
      yield* this.walkTo(S.platform.x, S.platform.y, S.platform.z, 2.4);
      human.faceTowards(S.platform.x, 11);
      show(human.clipboard, true, 0.4);
      this.loopSeq.run(this.autonomousLoop());
    } else if (n === 1) {
      this.snapHuman(1);
    } else if (n >= 2 && n <= 5 && this.humanMode !== 'cab') {
      this.snapHuman(n);
    }
  }

  /* ---------------- Human helpers ---------------- */

  private placeHuman(p: THREE.Vector3, faceX: number, faceZ: number, pose: Human['pose']): void {
    const { human, scene } = this.d;
    if (human.group.parent !== scene) scene.add(human.group);
    human.group.position.copy(p);
    human.group.rotation.set(0, 0, 0);
    human.faceTowards(faceX, faceZ);
    human.pose = pose;
    human.walking = false;
    this.humanMode = 'free';
  }

  private attachHuman(slot: THREE.Object3D, pose: Human['pose'], mode: HumanMode): void {
    const { human, train } = this.d;
    train.loco.add(human.group);
    human.group.position.copy(slot.position);
    human.group.rotation.set(0, 0, 0);
    human.pose = pose;
    human.walking = false;
    this.humanMode = mode;
  }

  private detachHuman(): void {
    const { human, scene } = this.d;
    scene.attach(human.group);
    human.group.rotation.x = 0;
    human.group.rotation.z = 0;
    this.humanMode = 'free';
  }

  private *walkTo(x: number, y: number, z: number, speed = 3): Seq {
    const { human } = this.d;
    const from = human.group.position.clone();
    const to = new THREE.Vector3(x, y, z);
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    human.faceTowards(x, z);
    human.pose = 'stand';
    human.walking = true;
    yield step(
      dist / speed,
      (t) => human.group.position.lerpVectors(from, to, t),
      () => {
        human.walking = false;
      },
    );
  }

  private *hop(to: THREE.Vector3): Seq {
    const { human } = this.d;
    const from = human.group.position.clone();
    human.walking = false;
    yield step(0.5 * MOTION + 0.01, (t) => {
      human.group.position.lerpVectors(from, to, t);
      human.group.position.y += Math.sin(Math.PI * t) * 0.9;
    });
  }

  private *climbIn(): Seq {
    const { train } = this.d;
    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    const beside = p.clone().addScaledVector(r, 1.6).addScaledVector(f, -1.0);
    beside.y = 0;
    yield* this.walkTo(beside.x, 0, beside.z, 3);
    const cab = train.loco.localToWorld(train.cabSlot.position.clone());
    yield* this.hop(cab);
    this.attachHuman(train.cabSlot, 'drive', 'cab');
  }

  /* ---------------- Derails ---------------- */

  private rule(h: Hazard): boolean {
    const { train } = this.d;
    switch (this.phase) {
      case 2:
        return !this.lapHadDerail && h.index === this.lap % 4;
      case 3:
        return !this.lapHadDerail && this.lap % 3 === 1 && h.index === Math.floor(this.lap / 3) % 4;
      case 4:
        return !h.base && !this.grace;
      case 5:
        return h.speedHazard && !h.strong && !this.grace && train.speed > this.cruise * 0.8;
      default:
        return false;
    }
  }

  /** Returns true when the train stops advancing on the main line at this hazard. */
  private onHazard(h: Hazard): boolean {
    if (this.derailing) return false;
    if (!this.forced && !this.rule(h)) return false;
    this.forced = false;
    this.startDerail(h);
    return true;
  }

  private startDerail(h: Hazard): void {
    const { train, hud } = this.d;
    this.derailing = true;
    this.lapHadDerail = true;
    this.cleanLaps = 0;
    hud.setLaps(0, this.phase >= 4);
    this.bumpTrust(-TRUST_PER_DERAIL);
    train.eyes = 'wide';
    const violent = this.phase >= 5;
    if (h.id === 'switch') {
      this.spurBumped = false;
      train.onSpur = true;
      train.spurS = 0;
      train.spurAnchorS = h.s;
      train.derail = violent ? h.violentPose : h.derailPose;
      this.seq.run(this.spurSeq(h));
    } else {
      this.frozen = true;
      train.speed = 0;
      train.derail = violent ? h.violentPose : h.derailPose;
      this.seq.run(this.derailSeq(h, violent));
    }
  }

  private *derailSeq(h: Hazard, violent: boolean): Seq {
    const { train, world } = this.d;
    world.fx.burstDust(train.worldPos(this.v1), violent ? 18 : 10, violent ? 1.7 : 1);
    yield step(0.45 * MOTION + 0.01, (t) => {
      train.derailAmount = ease.out(t);
    });
    train.eyes = 'dizzy';
    if (this.phase === 4 && !this.manualFixDone) {
      this.awaitingFix = h;
      return;
    }
    yield wait(1.0);
    yield* this.fixSeq(h);
  }

  private *spurSeq(h: Hazard): Seq {
    yield until(() => this.spurBumped);
    this.d.train.eyes = 'dizzy';
    if (this.phase === 4 && !this.manualFixDone) {
      this.awaitingFix = h;
      return;
    }
    yield wait(1.0);
    yield* this.fixSeq(h);
  }

  private onSpurBump(): void {
    const { train, world } = this.d;
    this.spurBumped = true;
    this.frozen = true;
    train.speed = 0;
    tweens.to(train, { derailAmount: 1 }, 0.3, ease.out);
    world.fx.burstDust(train.worldPos(this.v1), 8, 0.8);
  }

  private *fixSeq(h: Hazard): Seq {
    const { train, human, world } = this.d;
    const wasMounted = this.humanMode !== 'free';
    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    const side = train.derail.lat >= 0 ? 1 : -1;

    if (wasMounted) {
      this.detachHuman();
      const down = p.clone().addScaledVector(r, side * 1.7).addScaledVector(f, -1.2);
      down.y = 0;
      yield* this.hop(down);
    }

    const standAt = h.id === 'switch' ? world.spots.lever.clone() : p.clone().addScaledVector(r, side * 2.0).setY(0);
    const far = human.group.position.distanceTo(standAt) > 12;
    yield* this.walkTo(standAt.x, 0, standAt.z, far ? 8 : 4);
    human.faceTowards(p.x, p.z);
    human.pose = h.id === 'switch' ? 'point' : 'push';
    yield wait(0.35);

    if (train.onSpur) {
      const len = train.spurS;
      yield step(1.3 * MOTION + 0.01, (t) => {
        const k = ease.inOut(t);
        train.spurS = len * (1 - k);
        train.derailAmount = 1 - k;
      });
      train.onSpur = false;
      train.spurS = 0;
      train.s = h.s;
    } else {
      yield step(0.7 * MOTION + 0.01, (t) => {
        train.derailAmount = 1 - ease.inOut(t);
      });
    }
    train.derailAmount = 0;
    train.eyes = 'calm';
    human.pose = 'stand';

    if (this.phase >= 4) {
      world.installGuardrail(h, this.phase >= 5 && h.speedHazard && h.base);
      yield wait(0.7);
    } else {
      yield wait(0.2);
    }

    if (this.phase <= 5) {
      yield* this.climbIn();
    } else {
      const spot = this.phase === 6 ? world.spots.watch : world.spots.platform;
      yield* this.walkTo(spot.x, spot.y, spot.z, 8);
      human.faceTowards(spot.x, 11);
    }
    train.eyes = this.phase >= 6 ? 'happy' : 'focused';
    this.frozen = false;
    this.derailing = false;
    if (this.phase === 4 || this.phase === 5) this.grace = true;
  }

  /* ---------------- Laps, trust ---------------- */

  private onLap(): void {
    this.lap++;
    if (!this.lapHadDerail && this.phase >= 2) {
      this.cleanLaps++;
      this.bumpTrust(TRUST_PER_CLEAN_LAP);
    }
    this.lapHadDerail = false;
    this.grace = false;
    this.d.hud.setLaps(this.cleanLaps, this.phase >= 4);
  }

  private bumpTrust(delta: number): void {
    const floor = TRUST_FLOOR[this.phase];
    const ceil = this.phase >= PHASE_COUNT - 1 ? 1 : TRUST_FLOOR[this.phase + 1] - 0.015;
    this.trust = Math.max(floor, Math.min(ceil, this.trust + delta));
  }

  /* ---------------- Phase 7: autonomous loop ---------------- */

  private stackSlot(i: number): THREE.Vector3 {
    const s = this.d.world.spots.stack;
    return new THREE.Vector3(s.x - (i % 2) * 0.82, s.y + Math.floor(i / 2) * 0.74, s.z);
  }

  private clearStack(): void {
    for (const c of this.stack) c.removeFromParent();
    this.stack.length = 0;
  }

  /** Brake and wait at the station; resolves at once when the train already stands there. */
  private *awaitStation(): Seq {
    const { train } = this.d;
    this.stopAtStation = true;
    if (train.s < 0.1 && train.speed < 0.01) {
      this.atStation = true;
      return;
    }
    this.atStation = false;
    yield until(() => this.atStation);
  }

  private *autonomousLoop(): Seq {
    const { train, human, scene } = this.d;
    let returns = 0;
    while (true) {
      // wait for the train at the station
      yield* this.awaitStation();
      yield wait(0.3);

      // hand over the ticket
      human.pose = 'point';
      human.faceTowards(0, 11);
      const from = human.group.position.clone().add(new THREE.Vector3(0, 1.3, -0.6));
      const to = train.loco.localToWorld(train.ticketSlot.position.clone());
      this.ticket.visible = true;
      this.ticket.scale.setScalar(1);
      yield step(0.7 * MOTION + 0.01, (t) => {
        this.ticket.position.lerpVectors(from, to, t);
        this.ticket.position.y += Math.sin(Math.PI * t) * 0.7;
      });
      train.loco.attach(this.ticket);
      human.pose = 'inspect';
      yield wait(0.4);

      // off it goes
      train.eyes = 'focused';
      this.stopAtStation = false;
      this.atStation = false;
      yield until(() => train.s > train.loopLen * 0.45 && train.s < train.loopLen * 0.9);

      // work done: cargo appears
      const crate = makeCrate();
      train.wagon.add(crate);
      crate.position.copy(train.crateSlot.position);
      crate.position.y += 0.36;
      pop(crate, 0.5);
      this.wagonCrate = crate;
      train.eyes = 'happy';

      yield* this.awaitStation();
      yield wait(0.3);

      returns++;
      const ok = returns % 4 !== 3;
      yield* this.unloadAndJudge(crate, ok);
      if (!ok) {
        // back on the wagon, one more lap, then it passes
        const target = train.wagon.localToWorld(train.crateSlot.position.clone()).add(new THREE.Vector3(0, 0.36, 0));
        const a = crate.position.clone();
        yield step(0.6 * MOTION + 0.01, (t) => {
          crate.position.lerpVectors(a, target, t);
          crate.position.y += Math.sin(Math.PI * t) * 0.6;
        });
        train.wagon.attach(crate);
        this.wagonCrate = crate;
        train.eyes = 'focused';
        human.pose = 'stand';
        this.stopAtStation = false;
        this.atStation = false;
        yield until(() => train.s > train.loopLen * 0.3);
        yield* this.awaitStation();
        yield wait(0.3);
        train.eyes = 'happy';
        yield* this.unloadAndJudge(crate, true);
      }
      // ticket is spent
      unpop(this.ticket, 0.3);
      yield wait(0.4);
      scene.attach(this.ticket);
      this.ticket.visible = false;
      human.pose = 'stand';
      yield wait(0.5);
    }
  }

  private *unloadAndJudge(crate: THREE.Group, ok: boolean): Seq {
    const { human, world, scene } = this.d;
    scene.attach(crate);
    this.wagonCrate = null;
    const a = crate.position.clone();
    const b = world.spots.inspect.clone();
    yield step(0.8 * MOTION + 0.01, (t) => {
      crate.position.lerpVectors(a, b, t);
      crate.position.y += Math.sin(Math.PI * t) * 0.9;
    });
    human.pose = 'inspect';
    human.faceTowards(b.x, b.z);
    yield wait(0.9);
    world.fx.verdict(b.clone().add(new THREE.Vector3(0, 1.1, 0)), ok);
    yield wait(0.6);
    if (ok) {
      this.bumpTrust(TRUST_PER_OK_CARGO);
      const slot = this.stackSlot(this.stack.length % 6);
      if (this.stack.length >= 6) {
        const old = this.stack.shift()!;
        unpop(old, 0.3);
        setTimeout(() => old.removeFromParent(), 400);
        // shift remaining crates down a slot
        this.stack.forEach((c, i) => tweens.to(c.position, { x: this.stackSlot(i).x, y: this.stackSlot(i).y }, 0.4));
      }
      const c0 = crate.position.clone();
      const finalSlot = this.stack.length >= 6 ? this.stackSlot(5) : slot;
      yield step(0.6 * MOTION + 0.01, (t) => {
        crate.position.lerpVectors(c0, finalSlot, t);
        crate.position.y += Math.sin(Math.PI * t) * 0.5;
      });
      this.stack.push(crate);
      human.pose = 'stand';
    }
  }

  /* ---------------- Per frame ---------------- */

  update(dt: number): void {
    const { train, human, world, hud } = this.d;
    this.time += dt;
    tweens.update(dt);
    this.seq.update(dt);
    this.loopSeq.update(dt);

    // target speed
    const L = train.loopLen;
    let target = this.frozen || this.hold ? 0 : this.cruise;
    if (!this.frozen && !this.hold && this.stopAtStation && !train.onSpur) {
      if (this.atStation) {
        target = 0;
      } else {
        const dist = L - train.s;
        if (dist < 8) target = Math.max(0.9, (this.cruise * dist) / 8);
      }
    }
    if (this.frozen) {
      train.speed = 0;
    } else if (train.speed < target) {
      const acc = this.phase === 5 ? 2.4 : this.phase === 1 ? 3 : 7;
      train.speed = Math.min(target, train.speed + acc * dt);
    } else {
      train.speed = Math.max(target, train.speed - 14 * dt);
    }

    let v = train.speed;
    if (this.phase === 1 && !this.hold) v *= 0.5 + 0.5 * Math.abs(Math.sin(this.time * 2.4));

    if (!this.frozen && v > 0) {
      if (train.onSpur) {
        train.spurS += v * dt;
        if (train.spurS >= train.spurLen - 0.5) {
          train.spurS = train.spurLen - 0.5;
          this.onSpurBump();
        }
      } else {
        const s0 = train.s;
        let s1 = s0 + v * dt;
        if (this.stopAtStation && !this.atStation && s1 >= L - 0.02) {
          s1 = L;
          train.speed = 0;
          this.atStation = true;
        }
        for (const h of world.crossed(s0, s1)) {
          if (this.onHazard(h)) {
            s1 = h.s;
            break;
          }
        }
        if (s1 >= L) {
          s1 -= L;
          this.onLap();
        }
        train.s = s1;
      }
    }

    train.update(dt);
    human.update(dt);
    world.update(dt);

    if (this.phase === 1 && this.humanMode === 'push' && !this.hold) {
      this.sweatTimer -= dt;
      if (this.sweatTimer <= 0) {
        this.sweatTimer = 0.28;
        const hp = human.headPos(this.v1);
        hp.y += 0.1;
        world.fx.emitSweat(hp);
      }
    }

    // Watchdog: in phases 1-5 the human must be on the train whenever no choreography is running.
    if (this.phase >= 1 && this.phase <= 5 && this.humanMode === 'free' && !this.seq.running && !this.derailing && !this.hold) {
      this.snapHuman(this.phase);
    }

    this.trustShown += (this.trust - this.trustShown) * Math.min(1, dt * 3);
    hud.setTrust(this.trustShown);
  }
}
