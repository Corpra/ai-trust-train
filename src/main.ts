import './style.css';
import { createScene } from './scene';
import { World } from './world/world';
import { Train } from './actors/train';
import { Human } from './actors/human';
import { Director } from './sim/director';
import { Hud } from './ui/hud';
import { bindInput, parseHash } from './ui/input';
import { LANG } from './config';
import { TEXTS } from './i18n';

const app = document.getElementById('app')!;
const kit = createScene(app);
const world = new World(kit.scene);
const train = new Train(world.main, world.mainLen);
const human = new Human();
kit.scene.add(train.group, human.group);

const hud = new Hud(TEXTS[LANG]);
const director = new Director({ scene: kit.scene, world, train, human, hud, rig: kit.rig, rim: kit.rim });
bindInput(director, hud, kit.renderer.domElement);

if (import.meta.env.DEV) (window as any).__d = { director, train, human, world };

director.goTo(parseHash() ?? 0, true);
kit.start((dt) => director.update(dt));
