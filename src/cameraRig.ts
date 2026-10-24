import * as THREE from 'three';
import { ease } from './tween';

/**
 * Camera that glides between named targets, drifts very slowly so the scene never feels frozen,
 * and can optionally follow the train (presenter hotkey C).
 */
export class CameraRig {
  readonly curPos = new THREE.Vector3(0, 30, 42);
  readonly curLook = new THREE.Vector3(0, 0, 0);
  private readonly fromPos = this.curPos.clone();
  private readonly fromLook = this.curLook.clone();
  private readonly toPos = this.curPos.clone();
  private readonly toLook = this.curLook.clone();
  private t = 1;
  private d = 1;
  private time = 0;

  follow = false;
  followTarget: THREE.Object3D | null = null;
  drift = 1;
  /** >1 pulls the camera back from its look target (portrait screens). */
  distanceScale = 1;
  private curScale = 1;

  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();

  constructor(public readonly camera: THREE.PerspectiveCamera) {}

  setTarget(pos: THREE.Vector3, look: THREE.Vector3, d = 1.5): void {
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

  update(dt: number): void {
    this.time += dt;
    if (this.follow && this.followTarget) {
      const target = this.followTarget;
      this.tmpDir.set(0, 0, 1).applyQuaternion(target.quaternion).setY(0).normalize();
      target.getWorldPosition(this.tmpPos);
      const rx = -this.tmpDir.z;
      const rz = this.tmpDir.x;
      this.tmpLook.copy(this.tmpPos).addScaledVector(this.tmpDir, 5).add(new THREE.Vector3(0, 0.8, 0));
      this.tmpPos.addScaledVector(this.tmpDir, -10).add(new THREE.Vector3(rx * 4, 6.5, rz * 4));
      const k = 1 - Math.exp(-dt * 3.5);
      this.curPos.lerp(this.tmpPos, k);
      this.curLook.lerp(this.tmpLook, k);
      this.t = 1;
      this.toPos.copy(this.curPos);
      this.toLook.copy(this.curLook);
    } else if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.d);
      const k = ease.inOut(this.t);
      this.curPos.lerpVectors(this.fromPos, this.toPos, k);
      this.curLook.lerpVectors(this.fromLook, this.toLook, k);
    }
    const dr = this.follow ? 0 : this.drift;
    const dx = Math.sin(this.time * 0.11) * 0.8 * dr;
    const dy = Math.sin(this.time * 0.07) * 0.35 * dr;
    const dz = Math.cos(this.time * 0.08) * 0.6 * dr;
    this.curScale += (this.distanceScale - this.curScale) * Math.min(1, dt * 4);
    const sc = this.follow ? 1 : this.curScale;
    this.camera.position.set(
      this.curLook.x + (this.curPos.x - this.curLook.x) * sc + dx,
      this.curLook.y + (this.curPos.y - this.curLook.y) * sc + dy,
      this.curLook.z + (this.curPos.z - this.curLook.z) * sc + dz,
    );
    this.camera.lookAt(this.curLook);
  }
}
