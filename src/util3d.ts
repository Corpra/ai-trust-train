import * as THREE from 'three';

export const Z = new THREE.Vector3(0, 0, 1);
export const UP = new THREE.Vector3(0, 1, 0);

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Flat-shaded pastel material, cached per colour/options. */
export function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, color: number, seg = 12, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(r: number, color: number, seg = 12, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75))), mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cone(r: number, h: number, color: number, seg = 7): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function at<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

export function setShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
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
export const mod1 = (u: number): number => ((u % 1) + 1) % 1;
