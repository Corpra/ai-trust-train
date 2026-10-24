import * as THREE from 'three';
import { COLORS } from './config';
import { ease, tweens } from './tween';

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

/** Show or hide with a pop, idempotent. */
export function show(obj: THREE.Object3D, on: boolean, d = 0.5, to = 1): void {
  if (on) {
    if (!obj.visible || obj.scale.x < to * 0.98) pop(obj, d, to);
  } else if (obj.visible) {
    unpop(obj, d * 0.6);
  }
}

/** Snap visibility without animation (used when jumping between phases). */
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
}

function makeVerdictTexture(ok: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = ok ? '#3fb66b' : '#e35b5b';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 14;
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Fx {
  readonly group = new THREE.Group();
  private readonly dust: Particle[] = [];
  private readonly sweat: Particle[] = [];
  private readonly rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private readonly sprites: { s: THREE.Sprite; mat: THREE.SpriteMaterial; life: number }[] = [];

  private readonly dustGeo = new THREE.SphereGeometry(0.22, 6, 5);
  private readonly sweatGeo = new THREE.SphereGeometry(0.09, 6, 5);
  private readonly ringGeo = new THREE.RingGeometry(0.5, 0.78, 32);
  private readonly dustMat = new THREE.MeshStandardMaterial({ color: COLORS.dust, roughness: 1 });
  private readonly sweatMat = new THREE.MeshStandardMaterial({ color: COLORS.sweat, roughness: 0.35 });
  private readonly okTex = makeVerdictTexture(true);
  private readonly badTex = makeVerdictTexture(false);

  burstDust(pos: THREE.Vector3, n = 10, strength = 1): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.5, (Math.random() - 0.5) * 1.4));
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3.2 * strength, 1 + Math.random() * 2.2 * strength, (Math.random() - 0.5) * 3.2 * strength);
      const base = 0.5 + Math.random() * 0.7;
      m.scale.setScalar(base);
      this.group.add(m);
      this.dust.push({ m, vel, life: 0, max: 0.8 + Math.random() * 0.5, base });
    }
  }

  emitSweat(pos: THREE.Vector3): void {
    const m = new THREE.Mesh(this.sweatGeo, this.sweatMat);
    m.position.copy(pos);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.6 + Math.random(), (Math.random() - 0.5) * 2.2);
    this.group.add(m);
    this.sweat.push({ m, vel, life: 0, max: 1.1, base: 1 });
  }

  flash(pos: THREE.Vector3, color: number = COLORS.flash): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
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

  update(dt: number): void {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.life += dt;
      p.vel.y -= 2.5 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      const s = p.base * (1 + k * 1.3) * Math.max(0, 1 - k * k);
      p.m.scale.setScalar(Math.max(0.001, s));
      if (p.life >= p.max) {
        this.group.remove(p.m);
        this.dust.splice(i, 1);
      }
    }
    for (let i = this.sweat.length - 1; i >= 0; i--) {
      const p = this.sweat[i];
      p.life += dt;
      p.vel.y -= 9 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      if (p.life >= p.max || p.m.position.y < 0.05) {
        this.group.remove(p.m);
        this.sweat.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const s = 1 + r.life * 6;
      r.m.scale.set(s, s, s);
      r.mat.opacity = Math.max(0, 0.9 * (1 - r.life / 0.65));
      if (r.life >= 0.65) {
        this.group.remove(r.m);
        r.mat.dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const v = this.sprites[i];
      v.life += dt;
      v.s.position.y += dt * 0.6;
      const k = Math.min(1, v.life / 0.3);
      v.s.scale.setScalar(Math.max(0.001, 1.7 * ease.outBack(k)));
      v.mat.opacity = v.life < 1.1 ? 1 : Math.max(0, 1 - (v.life - 1.1) / 0.4);
      if (v.life >= 1.5) {
        this.group.remove(v.s);
        v.mat.dispose();
        this.sprites.splice(i, 1);
      }
    }
  }
}
