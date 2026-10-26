import * as THREE from 'three';
import { DIP, MOTION, PHASE_COUNT, PUSH_FRACTION, PUSH_SECONDS, SPLASH_HOLD, SPLASH_IN, SPLASH_OUT, TRAVEL_SECONDS, TRUST } from '../config';
import { ease, Sequencer, step, until, wait, type Seq, tweens } from '../tween';
import { pop, snapShow } from '../fx';
import type { World, Hazard } from '../world/world';
import { CAR_GAP, makeCrate, type Train } from '../actors/train';
import { type Human, makeTicket, type Pose } from '../actors/human';
import type { Hud } from '../ui/hud';
import type { CameraRig } from '../cameraRig';
import { writeHash, type Controls } from '../ui/input';
import { frameAt, newFrame, RAIL_TOP } from '../world/track';
import { approach, clamp01 } from '../util3d';

interface Deps {
  scene: THREE.Scene;
  world: World;
  train: Train;
  human: Human;
  hud: Hud;
  rig: CameraRig;
  rim: THREE.DirectionalLight;
}

type EnterMode = 'splash' | 'initial' | 'dip';

interface Ev {
  h: Hazard;
  kind: 'fork' | 'derail' | 'crate';
  install?: boolean;
  /** Phase 5: the fix reinforces an existing guardrail. */
  strong?: boolean;
  index?: number;
}

const NO_POSE = { lat: 0, lift: 0, roll: 0, pitch: 0, yaw: 0 };

/** Move a look target along the camera's right so the subject sits in the left part of the frame. */
function frameLeft(camPos: THREE.Vector3, look: THREE.Vector3, k: number): THREE.Vector3 {
  const fwd = look.clone().sub(camPos).setY(0).normalize();
  const camRight = new THREE.Vector3(-fwd.z, 0, fwd.x);
  return look.clone().addScaledVector(camRight, k);
}

export class Director implements Controls {
  phase = 0;

  private readonly seq = new Sequencer();
  private inHold = false;
  private skip = false;
  /** The scene sits idle after the splash until the presenter starts the phase. */
  private idle = false;
  private started = false;

  private cruise = 0;
  private hold = true;
  private frozen = false;
  private reverse = false;
  private pushing = false;
  private stopAt: number | null = null;
  private takeSpur = false;
  private spurBumped = false;
  private time = 0;
  private sweatTimer = 0;

  private readonly ticket: THREE.Mesh;
  private readonly crates: THREE.Group[] = [];

  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();

  constructor(private readonly d: Deps) {
    d.train.spurCurve = d.world.spurCurve;
    d.train.spurLen = d.world.spurLen;
    d.rig.target = d.train.loco;
    this.ticket = makeTicket();
    this.ticket.visible = false;
    d.scene.add(this.ticket);
  }

  /* ---------------- Controls ---------------- */

  next(): void {
    if (this.inHold) {
      this.skip = true;
      return;
    }
    this.goTo(this.phase + 1);
  }

  prev(): void {
    this.goTo(this.phase - 1);
  }

  start(): void {
    if (this.inHold) {
      this.skip = true;
      return;
    }
    if (this.idle) {
      this.started = true;
      return;
    }
    if (this.phase === 0) this.next();
  }

  goTo(n: number, initial = false): void {
    n = Math.max(0, Math.min(PHASE_COUNT - 1, n));
    if (n === this.phase && !initial) return;
    this.seq.run(this.enter(n, initial ? 'initial' : 'splash'));
  }

  replay(): void {
    if (this.phase === 0) return;
    this.seq.run(this.enter(this.phase, 'dip'));
  }

  /* ---------------- Phase lifecycle ---------------- */

  private *enter(n: number, mode: EnterMode): Seq {
    const { hud } = this.d;
    this.phase = n;
    writeHash(n);
    hud.setFinished(false);
    hud.setIdle(false);
    this.inHold = false;
    this.skip = false;
    this.idle = false;
    this.started = false;

    if (mode === 'dip') {
      hud.dip(true);
      yield wait(DIP);
      this.reset(n);
      hud.dip(false);
      yield wait(DIP);
    } else {
      if (hud.splashShown) {
        // the panel already covers the scene: swap its text instead of sliding out and back in
        hud.splashSwap(n);
        yield wait(0.5);
      } else {
        hud.splashIn(n, mode === 'initial');
        yield wait(mode === 'initial' ? 0.05 : SPLASH_IN + 0.08);
      }
      this.reset(n);
      if (n === 0) return; // the title panel stays up
      this.inHold = true;
      const end = performance.now() + SPLASH_HOLD * 1000;
      yield until(() => this.skip || performance.now() >= end);
      this.inHold = false;
      this.skip = false;
      hud.splashOut();
      yield wait(SPLASH_OUT * 0.7);
      this.idle = true;
      hud.setIdle(true);
      yield until(() => this.started);
      this.idle = false;
      hud.setIdle(false);
    }

    yield* this.script(n);
    if (n >= 1) hud.setFinished(true);
  }

  /** Put the scene in the starting state of phase n (called while the splash covers it). */
  private reset(n: number): void {
    const { train, human, world, hud, rig, scene } = this.d;
    tweens.kill(train);
    for (const c of train.cars) tweens.kill(c);
    this.hold = true;
    this.frozen = false;
    this.reverse = false;
    this.pushing = false;
    this.cruise = 0;
    this.stopAt = null;
    this.takeSpur = false;
    this.spurBumped = false;
    this.sweatTimer = 0;

    train.reset();
    train.derail = { ...NO_POSE };
    train.baseY = n <= 1 ? 0.03 : RAIL_TOP;
    world.setPhase(n);
    this.clearCrates();
    this.ticket.visible = false;
    if (this.ticket.parent !== scene) scene.attach(this.ticket);
    hud.setPhase(n);
    hud.setTrust(TRUST[n]);
    snapShow(human.clipboard, n >= 7);

    train.setUpgrade('code', n >= 2);
    train.setUpgrade('context', n >= 3);
    if (n >= 7) train.addCart();
    // start far enough along the track that the wagon sits behind the loco, not on top of it
    if (n === 7) train.s = CAR_GAP + 0.8;
    train.update(0);

    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    switch (n) {
      case 0:
      case 1:
        this.attachHuman(train.pushSlot, 'push');
        break;
      case 7: {
        // the ticket is already handed over: it sits in the loco, the human points down the track
        train.loco.add(this.ticket);
        this.ticket.position.copy(train.ticketSlot.position);
        this.ticket.rotation.set(0, 0, 0);
        this.ticket.scale.setScalar(1);
        this.ticket.visible = true;
        const beside = p.clone().addScaledVector(r, 2.5).addScaledVector(f, 0.9).setY(0);
        this.placeHuman(beside, p.x, p.z, 'stand');
        human.faceAlong(f);
        human.pose = 'point';
        break;
      }
      default:
        this.attachHuman(train.cabSlot, 'drive');
    }
    human.update(0);

    rig.chase(true);
  }

  private *script(n: number): Seq {
    switch (n) {
      case 1:
        yield* this.p1();
        break;
      case 2:
        yield* this.p2();
        break;
      case 3:
        yield* this.p3();
        break;
      case 4:
        yield* this.p4();
        break;
      case 5:
        yield* this.p5();
        break;
      case 6:
        yield* this.p6();
        break;
      case 7:
        yield* this.p7();
        break;
      default:
        break;
    }
  }

  /* ---------------- Phase scripts ---------------- */

  private cruiseFor(n: number): number {
    return TRAVEL_SECONDS[n] > 0 ? this.d.world.mainLen / TRAVEL_SECONDS[n] : 0;
  }

  private go(): void {
    this.hold = false;
    this.cruise = this.cruiseFor(this.phase);
  }

  private stopped(): boolean {
    const { train } = this.d;
    return this.stopAt !== null && train.s >= this.stopAt - 0.001 && train.speed === 0;
  }

  private *p1(): Seq {
    const { world, human } = this.d;
    yield wait(0.3);
    const dist = world.mainLen * PUSH_FRACTION;
    this.stopAt = dist;
    this.hold = false;
    this.pushing = true;
    this.cruise = dist / (PUSH_SECONDS * 0.76);
    yield until(() => this.stopped());
    this.pushing = false;
    yield wait(0.25);
    human.pose = 'exhausted';
  }

  private *p2(): Seq {
    // rails, code plate and driver are all in place during idle: the press only starts the train
    const H = this.d.world.byId;
    yield wait(0.4);
    yield* this.run([
      { h: H.switch, kind: 'fork' },
      { h: H.curve, kind: 'derail' },
      { h: H.gap, kind: 'derail' },
    ]);
  }

  private *p3(): Seq {
    const H = this.d.world.byId;
    yield wait(0.4);
    yield* this.run([
      { h: H.curve, kind: 'derail' },
      { h: H.gap, kind: 'derail' },
    ]);
  }

  private *p4(): Seq {
    const H = this.d.world.byId;
    yield wait(0.4);
    yield* this.run([
      { h: H.curve, kind: 'derail', install: true },
      { h: H.gap, kind: 'derail', install: true },
    ]);
  }

  private *p5(): Seq {
    const H = this.d.world.byId;
    yield wait(0.4);
    // at speed the curve guardrail is not enough: tip over it, fix, reinforce
    yield* this.run([{ h: H.curve, kind: 'derail', install: true, strong: true }]);
  }

  private *p6(): Seq {
    yield wait(0.4);
    yield* this.run([]);
  }

  private *p7(): Seq {
    const { world, train, human, scene, rig } = this.d;
    const H = world.byId;
    yield wait(0.4);
    this.go();
    yield wait(1.2);
    human.pose = 'stand';
    yield until(() => train.s > 22);

    // the human is already waiting at B when the train gets there
    const w = world.spots.waitAtB;
    const stopFrame = world.main.getPointAt(world.stopS / world.mainLen);
    this.placeHuman(w, stopFrame.x, stopFrame.z, 'stand');
    pop(human.clipboard, 0.01);

    yield* this.run([
      { h: H.switch, kind: 'crate', index: 0 },
      { h: H.curve, kind: 'crate', index: 1 },
      { h: H.gap, kind: 'crate', index: 2 },
    ]);
    // a side shot of the whole train at the slab, so the inspection stays in view
    const sf = frameAt(world.main, world.stopS / world.mainLen, newFrame());
    const mid = sf.pos.clone().addScaledVector(sf.tan, -2.2).setY(0.6);
    const camPos = mid.clone().addScaledVector(sf.right, 19).addScaledVector(sf.tan, -9).setY(12);
    rig.setFixed(camPos, frameLeft(camPos, mid, 5), 1.4 * MOTION);
    yield wait(0.6);

    // inspection: two good crates, one rejected
    const cargo = train.cars[0];
    const r = train.right(this.v2).clone();
    for (let i = 0; i < 3; i++) {
      const crate = this.crates[i];
      const slot = cargo.crateSlots[i].getWorldPosition(new THREE.Vector3());
      const standAt = slot.clone().addScaledVector(r, 1.75).setY(world.spots.slabTop);
      yield* this.walkTo(standAt, 2.6);
      human.faceTowards(slot.x, slot.z);
      human.pose = 'inspect';
      yield wait(0.9);
      const ok = i < 2;
      world.fx.verdict(slot.clone().add(new THREE.Vector3(0, 1.0, 0)), ok);
      yield wait(0.55);
      if (ok) {
        scene.attach(crate);
        const a = crate.position.clone();
        const b = world.spots.crates[i];
        yield step(0.65 * MOTION + 0.01, (t) => {
          crate.position.lerpVectors(a, b, t);
          crate.position.y += Math.sin(Math.PI * t) * 0.8;
        });
      }
      human.pose = 'stand';
      yield wait(0.2);
    }
    // the train stays at B with the rejected crate still on board
    human.faceTowards(stopFrame.x, stopFrame.z);
    yield wait(0.6);
  }

  /* ---------------- Building blocks ---------------- */

  /** Drive from the current spot to B, playing the scripted events on the way. */
  private *run(events: Ev[]): Seq {
    const { train, world } = this.d;
    this.go();
    for (const ev of events) {
      if (ev.kind === 'fork') {
        this.takeSpur = true;
        yield until(() => this.spurBumped);
        yield* this.fixFork(ev.h);
        continue;
      }
      yield until(() => train.s >= ev.h.s);
      if (ev.kind === 'derail') yield* this.derailAndFix(ev.h, !!ev.install, !!ev.strong);
      else if (ev.kind === 'crate') this.dropCrate(ev.index ?? 0);
    }
    this.stopAt = world.stopS;
    yield until(() => this.stopped());
  }

  private dropCrate(i: number): void {
    const { train } = this.d;
    const car = train.cars[0];
    if (!car) return;
    const crate = makeCrate();
    car.group.add(crate);
    crate.position.copy(car.crateSlots[i].position);
    const y = crate.position.y;
    crate.position.y += 4;
    tweens.to(crate.position, { y }, 0.6 * MOTION, ease.outBounce);
    this.crates.push(crate);
  }

  private clearCrates(): void {
    for (const c of this.crates) {
      tweens.kill(c.position);
      c.removeFromParent();
    }
    this.crates.length = 0;
  }

  private *derailAndFix(h: Hazard, install: boolean, strong = false): Seq {
    const { train, human, world } = this.d;
    this.frozen = true;
    train.speed = 0;
    train.s = h.s;
    train.derail = { ...h.pose };
    world.fx.burstDust(train.worldPos(this.v1), h.id === 'gap' ? 9 : 8, 1.0);
    yield step(0.3 * MOTION + 0.01, (t) => {
      train.derailAmount = ease.out(t);
    });
    yield wait(0.3);

    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    this.detachHuman();
    yield* this.hop(p.clone().addScaledVector(r, 1.8).addScaledVector(f, -1.0).setY(0));
    const standAt = p
      .clone()
      .addScaledVector(r, 1.55)
      .addScaledVector(f, h.id === 'gap' ? 1.2 : 0.2)
      .setY(0);
    yield* this.walkTo(standAt, 5.5);
    human.faceTowards(p.x, p.z);
    human.pose = 'crouch';
    yield wait(0.3);
    human.pose = 'heave';
    const s0 = train.s;
    yield step(0.4 * MOTION + 0.01, (t) => {
      const k = ease.inOut(t);
      train.derailAmount = 1 - k;
      train.s = s0 + h.clear * k;
    });
    train.derailAmount = 0;
    world.fx.burstDust(train.worldPos(this.v1), 4, 0.5);
    human.pose = 'stand';
    yield wait(0.15);
    if (install) {
      world.installGuardrail(h, strong);
      human.faceTowards(h.pos.x, h.pos.z);
      human.pose = 'point';
      yield wait(0.55);
      human.pose = 'stand';
    }
    yield* this.climbIn();
    this.frozen = false;
  }

  private onSpurBump(): void {
    const { train, world } = this.d;
    this.spurBumped = true;
    this.frozen = true;
    train.speed = 0;
    train.derail = { ...world.byId.switch.pose };
    tweens.to(train, { derailAmount: 1 }, 0.3, ease.out);
    world.fx.burstDust(train.worldPos(this.v1), 5, 0.7);
  }

  private *fixFork(h: Hazard): Seq {
    const { train, human, world, rig } = this.d;
    yield wait(0.3);
    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    const lever = h.pos.clone().addScaledVector(h.frame.right, 1.7);
    // a side shot that keeps both the stranded loco and the lever in view
    const mid = p.clone().add(lever).multiplyScalar(0.5).setY(0.8);
    const camPos = mid.clone().addScaledVector(h.frame.right, 20).addScaledVector(h.frame.tan, -4).setY(11);
    rig.setFixed(camPos, frameLeft(camPos, mid, 4.5), 0.8 * MOTION);
    this.detachHuman();
    yield* this.hop(p.clone().addScaledVector(r, 1.8).addScaledVector(f, -1.0).setY(0));
    yield* this.walkTo(world.spots.lever, 8);
    human.faceTowards(lever.x, lever.z);
    human.pose = 'offer';
    yield wait(0.2);
    world.setLever(true, true);
    yield wait(0.35);
    human.pose = 'stand';
    yield* this.climbIn();
    rig.chase();
    const len = train.spurS;
    yield step(Math.max(0.4, len / 14) * MOTION, (t) => {
      const k = ease.inOut(t);
      train.spurS = len * (1 - k);
      train.derailAmount = 1 - k;
    });
    train.onSpur = false;
    train.spurS = 0;
    train.s = h.s;
    train.derailAmount = 0;
    this.takeSpur = false;
    this.spurBumped = false;
    this.frozen = false;
  }

  /* ---------------- Human helpers ---------------- */

  private placeHuman(p: THREE.Vector3, faceX: number, faceZ: number, pose: Pose): void {
    const { human, scene } = this.d;
    if (human.group.parent !== scene) scene.add(human.group);
    human.group.position.copy(p);
    human.group.rotation.set(0, 0, 0);
    human.faceTowards(faceX, faceZ);
    human.pose = pose;
    human.walking = false;
  }

  private attachHuman(slot: THREE.Object3D, pose: Pose): void {
    const { human, train } = this.d;
    train.loco.add(human.group);
    human.group.position.copy(slot.position);
    human.group.rotation.set(0, 0, 0);
    human.pose = pose;
    human.walking = false;
  }

  private detachHuman(): void {
    const { human, scene } = this.d;
    scene.attach(human.group);
    human.group.rotation.x = 0;
    human.group.rotation.z = 0;
  }

  private *walkTo(to: THREE.Vector3, speed = 3): Seq {
    const { human } = this.d;
    const from = human.group.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 0.05) return;
    human.faceTowards(to.x, to.z);
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
    yield step(0.35 * MOTION + 0.01, (t) => {
      human.group.position.lerpVectors(from, to, t);
      human.group.position.y += Math.sin(Math.PI * t) * 0.9;
    });
  }

  private *climbIn(): Seq {
    const { train } = this.d;
    const p = train.worldPos(this.v1).clone();
    const r = train.right(this.v2).clone();
    const f = train.forward(this.v3).clone();
    const beside = p.clone().addScaledVector(r, 1.7).addScaledVector(f, -1.05).setY(0);
    yield* this.walkTo(beside, 7);
    const cab = train.loco.localToWorld(train.cabSlot.position.clone());
    yield* this.hop(cab);
    this.attachHuman(train.cabSlot, 'drive');
  }

  /* ---------------- Per frame ---------------- */

  update(dt: number): void {
    const { train, human, world, rig, rim } = this.d;
    this.time += dt;
    tweens.update(dt);
    this.seq.update(dt);

    // target speed
    let target = this.frozen || this.hold ? 0 : this.cruise;
    if (!this.frozen && !this.hold && !this.reverse && this.stopAt !== null && !train.onSpur) {
      const dist = this.stopAt - train.s;
      target = Math.min(target, Math.max(1.0, (Math.abs(this.cruise) * dist) / 6));
    }
    if (this.frozen) {
      train.speed = 0;
    } else {
      const acc = this.reverse ? 6 : this.phase <= 1 ? 2.2 : this.phase === 5 ? 4.5 : this.phase >= 6 ? 4 : 5.5;
      const speeding = Math.abs(target) > Math.abs(train.speed);
      train.speed = approach(train.speed, target, (speeding ? acc : 12) * dt);
    }

    let v = train.speed;
    if (this.pushing) {
      const ph = this.time * 2.3;
      v *= 0.35 + 0.65 * Math.abs(Math.sin(ph));
      human.pushPhase = ph * 2 - Math.PI / 2;
      human.stride += ((v * dt) / 1.0) * Math.PI * 2;
    }

    if (!this.frozen && v !== 0) {
      if (train.onSpur) {
        train.spurS += v * dt;
        if (train.spurS >= train.spurLen - 0.7) {
          train.spurS = train.spurLen - 0.7;
          this.onSpurBump();
        }
      } else {
        const s0 = train.s;
        let s1 = s0 + v * dt;
        const sw = world.byId.switch.s;
        if (this.takeSpur && s0 < sw && s1 >= sw) {
          train.onSpur = true;
          train.spurAnchorS = sw;
          train.spurS = s1 - sw;
          train.s = sw;
        } else {
          if (this.stopAt !== null && !this.reverse && s1 >= this.stopAt) {
            s1 = this.stopAt;
            train.speed = 0;
          }
          s1 = Math.max(0, Math.min(world.mainLen - 0.01, s1));
          if (v > 0) for (const h of world.crossed(s0, s1)) if (h.installed) world.passFlash(h);
          train.s = s1;
        }
      }
    }

    // camera speed feel and streaks
    const fast = this.cruiseFor(6);
    const slow = this.cruiseFor(2) * 0.9;
    const speedK = clamp01((Math.abs(train.speed) - slow) / (fast - slow));
    rig.speedK = speedK;

    train.update(dt);
    human.update(dt);
    world.update(dt);

    const p = train.worldPos(this.v1);
    const f = train.forward(this.v2);
    const r = train.right(this.v3);
    world.fx.updateStreaks(dt, p, f, r, speedK);
    rim.position.copy(p).addScaledVector(f, 2).addScaledVector(r, -7).add(new THREE.Vector3(0, 9, 0));
    rim.target.position.copy(p);

    if (this.pushing) {
      this.sweatTimer -= dt;
      if (this.sweatTimer <= 0) {
        this.sweatTimer = 0.3;
        const hp = human.headPos(this.v1);
        hp.y += 0.1;
        world.fx.emitSweat(hp);
      }
    }
  }
}
