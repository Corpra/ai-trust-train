import * as THREE from 'three';
import { COLORS } from './config';
import { ease, tweens } from './tween';
import { canvasTexture, Z } from './util3d';

/** Scale an object in from nothing (also makes it visible). */
export function pop(obj: THREE.Object3D, d = 0.5, to = 1): void {
  obj.visible = true;
  obj.scale.setScalar(0.001);
  tweens.to(obj.scale, { x: to, y: to, z: to }, d, ease.outBack);
}

/** Scale an object out and hide it. */
export function unpop(obj: THREE.Object3D, d = 0.3): void {
  tweens.to(obj.scale, { x: 0.001, y: 0.001, z: 0.001 }, d, ease.in, () => {
    obj.visible = false;
  });
}

/** Snap visibility without animation. */
export function snapShow(obj: THREE.Object3D, on: boolean, to = 1): void {
  tweens.kill(obj.scale);
  obj.visible = on;
  obj.scale.setScalar(on ? to : 0.001);
}

interface Particle {
  m: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  base: number;
  gravity: number;
}

function makeVerdictTexture(ok: boolean): THREE.CanvasTexture {
  return canvasTexture(128, (g) => {
    g.fillStyle = 'rgba(10,10,12,0.85)';
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ok ? '#3fb66b' : '#e35b5b';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    if (ok) {
      g.moveTo(34, 66);
      g.lineTo(56, 88);
      g.lineTo(96, 44);
    } else {
      g.moveTo(42, 42);
      g.lineTo(86, 86);
      g.moveTo(86, 42);
      g.lineTo(42, 86);
    }
    g.stroke();
  });
}

interface Streak {
  m: THREE.Mesh;
  a: number;
  r: number;
  u: number;
}

const STREAKS = 18;

export class Fx {
  readonly group = new THREE.Group();
  private readonly dust: Particle[] = [];
  private readonly sweat: Particle[] = [];
  private readonly sparks: Particle[] = [];
  private readonly rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private readonly sprites: { s: THREE.Sprite; mat: THREE.SpriteMaterial; life: number }[] = [];
  private readonly streaks: Streak[] = [];
  private readonly streakMat: THREE.MeshBasicMaterial;

  private readonly dustGeo = new THREE.SphereGeometry(0.13, 10, 8);
  private readonly sweatGeo = new THREE.SphereGeometry(0.055, 10, 8);
  private readonly sparkGeo = new THREE.SphereGeometry(0.04, 6, 5);
  private readonly ringGeo = new THREE.RingGeometry(0.5, 0.78, 40);
  private readonly dustMat = new THREE.MeshStandardMaterial({ color: COLORS.dust, roughness: 1, emissive: 0x15130f, transparent: true, opacity: 0.7 });
  private readonly sweatMat = new THREE.MeshStandardMaterial({ color: COLORS.sweat, roughness: 0.3, emissive: 0x3a5570 });
  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: COLORS.spark });
  private readonly okTex = makeVerdictTexture(true);
  private readonly badTex = makeVerdictTexture(false);

  constructor() {
    this.streakMat = new THREE.MeshBasicMaterial({ color: COLORS.streak, transparent: true, opacity: 0, depthWrite: false });
    const geo = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < STREAKS; i++) {
      const m = new THREE.Mesh(geo, this.streakMat);
      m.visible = false;
      this.group.add(m);
      this.streaks.push({ m, a: Math.random() * 40 - 8, r: 0, u: 0 });
      this.respawnStreak(this.streaks[i], false);
    }
  }

  private respawnStreak(s: Streak, ahead: boolean): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    s.r = side * (1.8 + Math.random() * 6);
    s.u = 0.3 + Math.random() * 4.5;
    if (ahead) s.a = 26 + Math.random() * 14;
  }

  burstDust(pos: THREE.Vector3, n = 10, strength = 1): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.5, (Math.random() - 0.5) * 1.4));
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3.2 * strength, 1 + Math.random() * 2.2 * strength, (Math.random() - 0.5) * 3.2 * strength);
      const base = 0.5 + Math.random() * 0.7;
      m.scale.setScalar(base);
      this.group.add(m);
      this.dust.push({ m, vel, life: 0, max: 0.8 + Math.random() * 0.5, base, gravity: 2.5 });
    }
  }

  emitSweat(pos: THREE.Vector3): void {
    const m = new THREE.Mesh(this.sweatGeo, this.sweatMat);
    m.position.copy(pos);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.6 + Math.random(), (Math.random() - 0.5) * 2.2);
    this.group.add(m);
    this.sweat.push({ m, vel, life: 0, max: 1.1, base: 1, gravity: 9 });
  }

  /** Sparks flying off wheels that scrape a guardrail. */
  emitSparks(pos: THREE.Vector3, back: THREE.Vector3, n = 6): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.2, (Math.random() - 0.5) * 0.4));
      const vel = back
        .clone()
        .multiplyScalar(3 + Math.random() * 5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 3));
      this.group.add(m);
      this.sparks.push({ m, vel, life: 0, max: 0.35 + Math.random() * 0.3, base: 1, gravity: 12 });
    }
  }

  flash(pos: THREE.Vector3, color: number = COLORS.flash): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.position.y += 0.12;
    this.group.add(m);
    this.rings.push({ m, mat, life: 0 });
  }

  verdict(pos: THREE.Vector3, ok: boolean): void {
    const mat = new THREE.SpriteMaterial({ map: ok ? this.okTex : this.badTex, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(0.001);
    this.group.add(s);
    this.sprites.push({ s, mat, life: 0 });
  }

  /** Remove every live particle (phase reset). */
  clear(): void {
    for (const list of [this.dust, this.sweat, this.sparks]) {
      for (const p of list) this.group.remove(p.m);
      list.length = 0;
    }
    for (const r of this.rings) this.group.remove(r.m);
    this.rings.length = 0;
    for (const v of this.sprites) this.group.remove(v.s);
    this.sprites.length = 0;
    this.streakMat.opacity = 0;
    for (const s of this.streaks) s.m.visible = false;
  }

  /** Thin white lines that rush past the train at speed. */
  updateStreaks(dt: number, pos: THREE.Vector3, tan: THREE.Vector3, right: THREE.Vector3, speedK: number): void {
    const vis = Math.max(0, Math.min(1, (speedK - 0.5) * 2.5));
    this.streakMat.opacity += (vis * 0.38 - this.streakMat.opacity) * Math.min(1, dt * 4);
    const on = this.streakMat.opacity > 0.01;
    for (const s of this.streaks) {
      s.m.visible = on;
      if (!on) continue;
      s.a -= speedK * 34 * dt;
      if (s.a < -10) this.respawnStreak(s, true);
      s.m.position.copy(pos).addScaledVector(tan, s.a).addScaledVector(right, s.r);
      s.m.position.y = pos.y + s.u;
      s.m.quaternion.setFromUnitVectors(Z, tan);
      s.m.scale.z = 1.2 + speedK * 2.4;
    }
  }

  update(dt: number): void {
    for (const list of [this.dust, this.sweat, this.sparks]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        p.vel.y -= p.gravity * dt;
        p.m.position.addScaledVector(p.vel, dt);
        if (list === this.dust) {
          const k = p.life / p.max;
          const s = p.base * (1 + k * 1.3) * Math.max(0, 1 - k * k);
          p.m.scale.setScalar(Math.max(0.001, s));
        }
        if (p.life >= p.max || (list !== this.dust && p.m.position.y < 0.02)) {
          this.group.remove(p.m);
          list.splice(i, 1);
        }
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const s = 1 + r.life * 3.5;
      r.m.scale.set(s, s, s);
      r.mat.opacity = Math.max(0, 0.5 * (1 - r.life / 0.65));
      if (r.life >= 0.65) {
        this.group.remove(r.m);
        r.mat.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const v = this.sprites[i];
      v.life += dt;
      v.s.position.y += dt * 0.5;
      const k = Math.min(1, v.life / 0.3);
      v.s.scale.setScalar(Math.max(0.001, 1.15 * ease.outBack(k)));
      v.mat.opacity = v.life < 1.6 ? 1 : Math.max(0, 1 - (v.life - 1.6) / 0.4);
      if (v.life >= 2.0) {
        this.group.remove(v.s);
        v.mat.dispose();
        this.sprites.splice(i, 1);
      }
    }
  }
}
