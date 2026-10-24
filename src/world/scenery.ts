import * as THREE from 'three';
import { COLORS } from '../config';
import { box, cone, cyl, mat, rng, sphere } from '../util3d';
import { distanceToCurve } from './track';

export function makeGround(): THREE.Mesh {
  const g = new THREE.Mesh(new THREE.CircleGeometry(95, 72), mat(COLORS.ground, { flatShading: false, roughness: 1 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  return g;
}

/** A few lighter grass patches so the ground is not one flat colour. */
export function makeGrassPatches(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const m = mat(COLORS.groundLight, { flatShading: false, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const rad = 6 + r() * 36;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(2 + r() * 5, 9), m);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(Math.cos(a) * rad, 0.006, -1 + Math.sin(a) * rad * 0.8);
    patch.receiveShadow = true;
    g.add(patch);
  }
  return g;
}

export function makeTree(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const trunk = cyl(0.13, 0.18, 0.7, COLORS.trunk, 7);
  trunk.position.y = 0.35;
  g.add(trunk);
  const dark = r() > 0.5;
  const c1 = cone(0.95, 1.7, dark ? COLORS.treeDark : COLORS.tree, 7);
  c1.position.y = 1.4;
  g.add(c1);
  const c2 = cone(0.7, 1.4, dark ? COLORS.tree : COLORS.treeDark, 7);
  c2.position.y = 2.3;
  g.add(c2);
  g.scale.setScalar(0.75 + r() * 0.7);
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

export function treeSpots(
  loop: THREE.Curve<THREE.Vector3>,
  count: number,
  seed: number,
  avoid: (x: number, z: number) => boolean,
): THREE.Vector3[] {
  const r = rng(seed);
  const out: THREE.Vector3[] = [];
  let tries = 0;
  while (out.length < count && tries++ < 6000) {
    const a = r() * Math.PI * 2;
    const rad = 4 + Math.sqrt(r()) * 36;
    const x = Math.cos(a) * rad;
    const z = -1 + Math.sin(a) * rad * 0.82;
    if (avoid(x, z)) continue;
    if (distanceToCurve(loop, x, z) < 3.6) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 2.8)) continue;
    out.push(new THREE.Vector3(x, 0, z));
  }
  return out;
}

export function makeHouse(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const w = 2.8 + r();
  const d = 2.4 + r() * 0.8;
  const h = 2 + r() * 0.6;
  const body = box(w, h, d, COLORS.house);
  body.position.y = h / 2;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 1.4, 4), mat(COLORS.roof));
  roof.position.y = h + 0.7;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  const door = box(0.5, 0.9, 0.08, COLORS.wagonDark);
  door.position.set(0, 0.45, d / 2 + 0.04);
  g.add(door);
  const chimney = box(0.3, 0.7, 0.3, COLORS.officeDark);
  chimney.position.set(w * 0.28, h + 0.75, -d * 0.22);
  g.add(chimney);
  return g;
}

export const PLATFORM_TOP = 0.5;

export function makeStation(): THREE.Group {
  const g = new THREE.Group();
  const top = PLATFORM_TOP;
  const plat = box(10.5, top, 2.0, COLORS.platform);
  plat.position.set(-0.75, top / 2, 13.3);
  g.add(plat);
  const edge = box(10.5, 0.06, 0.26, COLORS.platformEdge);
  edge.position.set(-0.75, top + 0.03, 12.43);
  g.add(edge);

  const bench = box(1.3, 0.08, 0.42, COLORS.wagonDark);
  bench.position.set(3.2, top + 0.42, 13.9);
  g.add(bench);
  for (const dx of [-0.5, 0.5]) {
    const leg = box(0.08, 0.4, 0.36, COLORS.wheel);
    leg.position.set(3.2 + dx, top + 0.2, 13.9);
    g.add(leg);
  }

  const post = cyl(0.06, 0.06, 2.3, COLORS.signalPost, 8);
  post.position.set(-5.3, top + 1.15, 13.95);
  g.add(post);
  const face = cyl(0.42, 0.42, 0.1, COLORS.paper, 20, { flatShading: false });
  face.rotation.x = Math.PI / 2;
  face.position.set(-5.3, top + 2.4, 13.95);
  g.add(face);
  const rim = cyl(0.47, 0.47, 0.08, COLORS.signalPost, 20, { flatShading: false });
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-5.3, top + 2.4, 13.94);
  g.add(rim);
  const hourHand = box(0.05, 0.24, 0.03, COLORS.pupil);
  hourHand.position.set(-5.3, top + 2.5, 14.02);
  g.add(hourHand);
  const minHand = box(0.04, 0.34, 0.03, COLORS.pupil);
  minHand.rotation.z = -Math.PI / 2.5;
  minHand.position.set(-5.16, top + 2.47, 14.02);
  g.add(minHand);

  const lamp = cyl(0.05, 0.05, 2.0, COLORS.signalPost, 8);
  lamp.position.set(4.4, top + 1.0, 14.0);
  g.add(lamp);
  const bulb = sphere(0.16, COLORS.emblem, 10, { emissive: COLORS.emblem, emissiveIntensity: 0.5 });
  bulb.position.set(4.4, top + 2.05, 14.0);
  g.add(bulb);
  return g;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function makeSignTexture(kind: 'code' | 'doc'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  roundRect(g, 6, 6, 244, 148, 22);
  g.fill();
  if (kind === 'code') {
    g.fillStyle = '#2f9ba8';
    g.font = 'bold 104px ui-monospace, Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('</>', 128, 84);
  } else {
    g.fillStyle = '#dfe6ee';
    roundRect(g, 84, 26, 96, 116, 8);
    g.fill();
    g.fillStyle = '#f7f9fb';
    roundRect(g, 74, 16, 96, 116, 8);
    g.fill();
    g.strokeStyle = '#b8c4d0';
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#8a98a8';
    g.lineWidth = 8;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(92, 46 + i * 24);
      g.lineTo(i === 3 ? 124 : 152, 46 + i * 24);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeBuilding(kind: 'office' | 'library'): THREE.Group {
  const g = new THREE.Group();
  const office = kind === 'office';
  const w = 4.2;
  const h = office ? 3.9 : 3.1;
  const d = 3.4;
  const body = box(w, h, d, office ? COLORS.office : COLORS.library);
  body.position.y = h / 2;
  g.add(body);
  const roof = box(w + 0.3, 0.25, d + 0.3, office ? COLORS.officeDark : COLORS.libraryDark);
  roof.position.y = h + 0.12;
  g.add(roof);
  if (office) {
    const win = mat(0x7fa3c4, { flatShading: false, roughness: 0.3 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.06), win);
        wm.position.set(-1.2 + col * 1.2, 1.0 + row * 1.15, -d / 2 - 0.02);
        g.add(wm);
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.62), win);
        side.position.set((col === 1 ? -1 : 1) * (w / 2 + 0.02), 1.0 + row * 1.15, -1 + (col === 2 ? 1.6 : 0));
        if (col !== 1) g.add(side);
      }
    }
  } else {
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      const col = cyl(0.14, 0.16, h - 0.3, COLORS.paper, 8);
      col.position.set(x, (h - 0.3) / 2, d / 2 + 0.25);
      g.add(col);
    }
    const steps = box(w + 0.4, 0.3, 1.0, COLORS.libraryDark);
    steps.position.set(0, 0.15, d / 2 + 0.55);
    g.add(steps);
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 0.9, 3), mat(COLORS.libraryDark));
    pediment.rotation.y = Math.PI / 2;
    pediment.position.set(0, h + 0.65, d / 2 - 0.3);
    pediment.scale.set(1, 1, 0.55);
    pediment.castShadow = true;
    g.add(pediment);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.375),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(office ? 'code' : 'doc'), transparent: true }),
  );
  sign.position.set(0, h * 0.6, d / 2 + (office ? 0.06 : 0.5));
  g.add(sign);
  return g;
}

export function makeSignal(): THREE.Group {
  const g = new THREE.Group();
  const post = cyl(0.06, 0.07, 1.6, COLORS.signalPost, 8);
  post.position.y = 0.8;
  g.add(post);
  const head = box(0.34, 0.6, 0.22, COLORS.wheel);
  head.position.y = 1.7;
  g.add(head);
  const light = sphere(0.11, COLORS.signalGreen, 10, { emissive: COLORS.signalGreen, emissiveIntensity: 1.0, flatShading: false });
  light.position.set(0, 1.8, 0.13);
  g.add(light);
  const off = sphere(0.09, 0x5a3a3a, 8);
  off.position.set(0, 1.56, 0.13);
  g.add(off);
  return g;
}

/** A glowing arc between a building and the track, with little packets flowing along it. */
export class GlowLine {
  readonly group = new THREE.Group();
  private readonly curve: THREE.QuadraticBezierCurve3;
  private readonly packets: THREE.Mesh[] = [];
  private readonly mat: THREE.MeshStandardMaterial;
  private t = 0;

  constructor(from: THREE.Vector3, to: THREE.Vector3) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y += 2.4;
    this.curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    this.mat = new THREE.MeshStandardMaterial({
      color: COLORS.glow,
      emissive: COLORS.glow,
      emissiveIntensity: 1.1,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 28, 0.06, 6, false), this.mat);
    this.group.add(tube);
    for (let i = 0; i < 3; i++) {
      const p = sphere(0.14, 0xffffff, 8, { emissive: COLORS.glow, emissiveIntensity: 1.5, flatShading: false });
      p.castShadow = false;
      this.packets.push(p);
      this.group.add(p);
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.packets.forEach((p, i) => {
      const u = ((this.t * 0.35 + i / this.packets.length) % 1 + 1) % 1;
      this.curve.getPointAt(u, p.position);
    });
  }
}
