import * as THREE from 'three';

export const Z = new THREE.Vector3(0, 0, 1);
export const UP = new THREE.Vector3(0, 1, 0);

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Smooth-shaded material, cached per colour/options. */
export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
    matCache.set(key, m);
  }
  return m;
}

/** Brushed-metal look for loco fittings. */
export const metal = (color: number): THREE.MeshStandardMaterial => mat(color, { roughness: 0.35, metalness: 0.75 });
/** Wood for cab and carts. */
export const wood = (color: number): THREE.MeshStandardMaterial => mat(color, { roughness: 0.9, metalness: 0 });

export function box(w: number, h: number, d: number, color: number, m?: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m ?? mat(color));
}

export function cyl(rTop: number, rBot: number, h: number, color: number, seg = 24, m?: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m ?? mat(color));
}

export function sphere(r: number, color: number, seg = 24, m?: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.75))), m ?? mat(color));
}

/** Capsule of total length `len` along +y, centred. */
export function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  const mid = Math.max(0.001, len - 2 * r);
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, mid, 8, 20), m);
}

export function torus(r: number, tube: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, seg), m);
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));
export const approach = (v: number, target: number, maxDelta: number): number =>
  v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta);

/** Draws text or a glyph on a square canvas texture. */
export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
