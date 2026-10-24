import * as THREE from 'three';
import { COLORS } from './config';
import { CameraRig } from './cameraRig';

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  isMobile: boolean;
  start(update: (dt: number) => void): void;
}

export function createScene(container: HTMLElement): SceneKit {
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.sky, 75, 140);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 320);
  const rig = new CameraRig(camera);

  const hemi = new THREE.HemisphereLight(0xffffff, COLORS.ground, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
  sun.position.set(26, 42, 20);
  sun.castShadow = !isMobile;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 5;
  sc.far = 130;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xd4e8ff, 0.55);
  fill.position.set(-24, 16, -12);
  scene.add(fill);

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.9;
    camera.fov = portrait ? 50 : 36;
    rig.distanceScale = portrait ? 1.9 : camera.aspect < 1.3 ? 1.25 : 1;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  return {
    renderer,
    scene,
    camera,
    rig,
    isMobile,
    start(update) {
      renderer.setAnimationLoop(() => {
        const dt = Math.min(0.05, clock.getDelta());
        update(dt);
        rig.update(dt);
        renderer.render(scene, camera);
      });
    },
  };
}
