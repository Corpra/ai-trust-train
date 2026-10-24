import { PHASE_COUNT } from '../config';
import type { Hud } from './hud';

export interface Controls {
  next(): void;
  prev(): void;
  goTo(n: number): void;
  forceDerail(): void;
  nudgeSpeed(factor: number): void;
  resetPhase(): void;
  toggleFollow(): void;
}

export function parseHash(): number | null {
  const m = /^#(\d)$/.exec(location.hash);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n < PHASE_COUNT ? n : null;
}

export function writeHash(n: number): void {
  const h = `#${n}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

export function bindInput(c: Controls, hud: Hud, canvas: HTMLCanvasElement): void {
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'Enter':
      case 'PageDown':
        e.preventDefault();
        c.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault();
        c.prev();
        break;
      case 'Home':
        c.goTo(0);
        break;
      case 'End':
        c.goTo(PHASE_COUNT - 1);
        break;
      case 'd':
      case 'D':
        c.forceDerail();
        break;
      case '+':
      case '=':
        c.nudgeSpeed(1.25);
        break;
      case '-':
      case '_':
        c.nudgeSpeed(0.8);
        break;
      case 'b':
      case 'B':
        hud.toggleBullets();
        break;
      case 'r':
      case 'R':
        c.resetPhase();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'c':
      case 'C':
        c.toggleFollow();
        break;
      default:
        if (/^[0-8]$/.test(e.key)) c.goTo(Number(e.key));
    }
  });

  hud.onNext = () => c.next();
  hud.onPrev = () => c.prev();
  hud.onGoTo = (n) => c.goTo(n);

  // Phones: tap the right or left third of the scene to navigate.
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const x = e.clientX / innerWidth;
    if (x > 0.66) c.next();
    else if (x < 0.34) c.prev();
  });

  addEventListener('hashchange', () => {
    const n = parseHash();
    if (n !== null) c.goTo(n);
  });
}
