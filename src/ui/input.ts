import { PHASE_COUNT } from '../config';
import type { Hud } from './hud';

export interface Controls {
  next(): void;
  prev(): void;
  goTo(n: number): void;
  replay(): void;
  /** Start the current phase from its idle state (space). */
  start(): void;
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
      case ' ':
        e.preventDefault();
        c.start();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
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
      case 'b':
      case 'B':
        hud.toggleOverlay();
        break;
      case 'r':
      case 'R':
        c.replay();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      default:
        if (/^[0-7]$/.test(e.key)) c.goTo(Number(e.key));
    }
  });

  hud.onNext = () => c.next();
  hud.onPrev = () => c.prev();
  hud.onGoTo = (n) => c.goTo(n);
  hud.onReplay = () => c.replay();
  hud.onSplashClick = () => c.start();

  // Phones: tap the right or left third of the scene to navigate, the middle to start the phase.
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const x = e.clientX / innerWidth;
    if (x > 0.66) c.next();
    else if (x < 0.34) c.prev();
    else c.start();
  });

  addEventListener('hashchange', () => {
    const n = parseHash();
    if (n !== null) c.goTo(n);
  });
}
