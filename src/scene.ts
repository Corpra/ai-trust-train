import * as THREE from 'three';
import { COLORS } from './config';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CameraRig } from './cameraRig';

export interface SceneKit {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  /** Rim light that the director keeps behind-left of the train. */
  rim: THREE.DirectionalLight;
  isMobile: boolean;
  start(update: (dt: number) => void): void;
}

export function createScene(container: HTMLElement): SceneKit {
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 720;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setClearColor(COLORS.bg, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 400);
  const rig = new CameraRig(camera);

  const hemi = new THREE.HemisphereLight(0x8d97ad, 0x0a0a0c, 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(28, 46, 18);
  scene.add(key);

  // soft fill that always comes from the camera side, so the flank we look at never goes black
  const fill = new THREE.DirectionalLight(0xdfe6f5, 0.7);
  scene.add(fill, fill.target);

  const rim = new THREE.DirectionalLight(0xfff0e0, 1.2);
  rim.position.set(0, 8, 0);
  scene.add(rim, rim.target);

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = camera.aspect < 0.9;
    rig.baseFov = portrait ? 54 : camera.aspect < 1.3 ? 42 : 36;
    rig.distanceScale = portrait ? 1.7 : camera.aspect < 1.3 ? 1.2 : 1;
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
    rim,
    isMobile,
    start(update) {
      renderer.setAnimationLoop(() => {
        const dt = Math.min(0.05, clock.getDelta());
        update(dt);
        rig.update(dt);
        fill.position.copy(camera.position).add(new THREE.Vector3(0, 6, 0));
        fill.target.position.copy(rig.curLook);
        renderer.render(scene, camera);
      });
    },
  };
}
