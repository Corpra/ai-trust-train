import * as THREE from 'three';
import { ease } from './tween';

/**
 * Chase camera behind and above the train, offset to the right so the right flank shows and the
 * train sits in the left part of the frame. `fixed` mode glides to or holds a world-space target.
 */
export class CameraRig {
  mode: 'chase' | 'fixed' = 'chase';
  target: THREE.Object3D | null = null;
  /** 0 = crawling, 1 = full speed: lowers the camera and widens the view. */
  speedK = 0;
  baseFov = 36;
  /** >1 pulls the camera back from its look target (portrait screens). */
  distanceScale = 1;

  readonly curPos = new THREE.Vector3(0, 6, 12);
  readonly curLook = new THREE.Vector3(0, 1, 0);
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly toPos = new THREE.Vector3();
  private readonly toLook = new THREE.Vector3();
  private t = 1;
  private d = 1;
  private curScale = 1;
  private curSpeedK = 0;
  private curFov = 36;

  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly wantPos = new THREE.Vector3();
  private readonly wantLook = new THREE.Vector3();

  constructor(public readonly camera: THREE.PerspectiveCamera) {}

  /** Follow the train. With `snap` the camera jumps straight to the chase position. */
  chase(snap = false): void {
    this.mode = 'chase';
    if (snap && this.target) {
      this.desired();
      this.curPos.copy(this.wantPos);
      this.curLook.copy(this.wantLook);
      this.curSpeedK = this.speedK;
    }
  }

  /** Hold the current view (used when the train leaves the frame at the destination). */
  freeze(): void {
    this.mode = 'fixed';
    this.toPos.copy(this.curPos);
    this.toLook.copy(this.curLook);
    this.t = 1;
  }

  setFixed(pos: THREE.Vector3, look: THREE.Vector3, d = 1.5): void {
    this.mode = 'fixed';
    this.fromPos.copy(this.curPos);
    this.fromLook.copy(this.curLook);
    this.toPos.copy(pos);
    this.toLook.copy(look);
    this.d = Math.max(0.0001, d);
    this.t = d <= 0 ? 1 : 0;
    if (this.t >= 1) {
      this.curPos.copy(pos);
      this.curLook.copy(look);
    }
  }

  private desired(): void {
    const target = this.target!;
    this.dir.set(0, 0, 1).applyQuaternion(target.quaternion).setY(0).normalize();
    this.right.set(-this.dir.z, 0, this.dir.x);
    target.getWorldPosition(this.p);
    const k = this.curSpeedK;
    const back = 17 + 2.5 * k;
    const height = 8.6 - 1.4 * k;
    const side = 6.2;
    const ahead = 6 + 5 * k;
    this.wantLook.copy(this.p).addScaledVector(this.dir, ahead).addScaledVector(this.right, 2.4).setY(this.p.y + 0.8);
    this.wantPos.copy(this.p).addScaledVector(this.dir, -back).addScaledVector(this.right, side).setY(this.p.y + height);
  }

  update(dt: number): void {
    this.curSpeedK += (this.speedK - this.curSpeedK) * Math.min(1, dt * 2.5);
    if (this.mode === 'chase' && this.target) {
      this.desired();
      const kp = 1 - Math.exp(-dt * 4.5);
      const kl = 1 - Math.exp(-dt * 7);
      this.curPos.lerp(this.wantPos, kp);
      this.curLook.lerp(this.wantLook, kl);
      this.t = 1;
      this.toPos.copy(this.curPos);
      this.toLook.copy(this.curLook);
    } else if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.d);
      const k = ease.inOut(this.t);
      this.curPos.lerpVectors(this.fromPos, this.toPos, k);
      this.curLook.lerpVectors(this.fromLook, this.toLook, k);
    }
    this.curScale += (this.distanceScale - this.curScale) * Math.min(1, dt * 4);
    const sc = this.curScale;
    this.camera.position.set(
      this.curLook.x + (this.curPos.x - this.curLook.x) * sc,
      this.curLook.y + (this.curPos.y - this.curLook.y) * sc,
      this.curLook.z + (this.curPos.z - this.curLook.z) * sc,
    );
    this.camera.lookAt(this.curLook);
    const fov = this.baseFov + (this.mode === 'chase' ? 7 * this.curSpeedK : 0);
    if (Math.abs(fov - this.curFov) > 0.01) {
      this.curFov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
