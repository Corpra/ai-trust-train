import { PHASE_COUNT } from '../config';
import type { Texts } from '../i18n';

const ARC_LEN = Math.PI * 50;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly list: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly dots: HTMLElement[] = [];
  private readonly arc: SVGPathElement;
  private readonly needle: SVGGElement;
  private readonly splash: HTMLElement;
  private readonly splashNum: HTMLElement;
  private readonly splashSub: HTMLElement;
  private readonly splashHint: HTMLElement;
  private readonly dipEl: HTMLElement;
  private readonly startHint: HTMLElement;
  private overlayHidden = false;

  /** True while the panel covers the scene (or is sliding in). */
  splashShown = false;

  onPrev?: () => void;
  onNext?: () => void;
  onGoTo?: (n: number) => void;
  onReplay?: () => void;
  onSplashClick?: () => void;

  constructor(private readonly t: Texts) {
    this.root = el('div');
    this.root.id = 'hud';

    this.overlay = el('div', 'overlay');
    this.heading = el('h2');
    this.list = el('ul');
    this.overlay.append(this.heading, this.list);

    this.nav = el('div', 'nav');
    this.prevBtn = el('button', undefined, t.prev);
    this.prevBtn.type = 'button';
    this.prevBtn.addEventListener('click', () => this.onPrev?.());
    const replayBtn = el('button', 'replay', t.replay);
    replayBtn.type = 'button';
    replayBtn.addEventListener('click', () => this.onReplay?.());
    this.nextBtn = el('button', undefined, t.next);
    this.nextBtn.type = 'button';
    this.nextBtn.addEventListener('click', () => this.onNext?.());
    const dots = el('div', 'dots');
    for (let i = 0; i < PHASE_COUNT; i++) {
      const d = el('i');
      d.title = t.phases[i].title;
      d.addEventListener('click', () => this.onGoTo?.(i));
      this.dots.push(d);
      dots.append(d);
    }
    this.nav.append(this.prevBtn, dots, replayBtn, this.nextBtn);

    const dial = el('div', 'dial');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 72');
    const bg = document.createElementNS(ns, 'path');
    bg.setAttribute('d', 'M10 62 A50 50 0 0 1 110 62');
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.1)');
    bg.setAttribute('stroke-width', '6');
    bg.setAttribute('stroke-linecap', 'round');
    this.arc = document.createElementNS(ns, 'path');
    this.arc.setAttribute('class', 'arc');
    this.arc.setAttribute('d', 'M10 62 A50 50 0 0 1 110 62');
    this.arc.setAttribute('fill', 'none');
    this.arc.setAttribute('stroke', '#e35b5b');
    this.arc.setAttribute('stroke-width', '6');
    this.arc.setAttribute('stroke-linecap', 'round');
    this.arc.setAttribute('stroke-dasharray', `${ARC_LEN} ${ARC_LEN}`);
    this.arc.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
    this.needle = document.createElementNS(ns, 'g');
    this.needle.setAttribute('class', 'needle');
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '60');
    line.setAttribute('y1', '62');
    line.setAttribute('x2', '20');
    line.setAttribute('y2', '62');
    line.setAttribute('stroke', '#f4f4f6');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');
    this.needle.append(line);
    const hub = document.createElementNS(ns, 'circle');
    hub.setAttribute('cx', '60');
    hub.setAttribute('cy', '62');
    hub.setAttribute('r', '3');
    hub.setAttribute('fill', '#f4f4f6');
    svg.append(bg, this.arc, this.needle, hub);
    const label = el('div', 'label', t.trust);
    dial.append(svg, label);

    this.splash = el('div', 'splash');
    this.splashNum = el('div', 'num');
    this.splashSub = el('div', 'sub');
    this.splashHint = el('div', 'hint hidden', t.hint);
    this.splash.append(this.splashNum, this.splashSub, this.splashHint);
    this.splash.addEventListener('click', () => this.onSplashClick?.());

    this.dipEl = el('div', 'dip');
    this.startHint = el('div', 'start-hint', t.startHint);

    this.root.append(this.overlay, this.nav, dial, this.startHint, this.dipEl, this.splash);
    document.body.append(this.root);
    this.setTrust(0);
  }

  setPhase(n: number): void {
    const p = this.t.phases[n];
    this.heading.textContent = p.title;
    this.list.replaceChildren(...p.bullets.map((b) => el('li', undefined, b)));
    this.overlay.classList.toggle('hidden', this.overlayHidden || n === 0);
    this.dots.forEach((d, i) => {
      d.classList.toggle('on', i === n);
      d.classList.toggle('done', i < n);
    });
    this.prevBtn.disabled = n === 0;
    this.nextBtn.disabled = n === PHASE_COUNT - 1;
  }

  setTrust(v: number): void {
    const k = Math.max(0, Math.min(1, v));
    this.arc.setAttribute('stroke-dashoffset', `${ARC_LEN * (1 - k)}`);
    this.needle.style.transform = `rotate(${180 * k}deg)`;
    const color = k < 0.5 ? mixHex('#e35b5b', '#ffcc33', k / 0.5) : mixHex('#ffcc33', '#3fb66b', (k - 0.5) / 0.5);
    this.arc.setAttribute('stroke', color);
  }

  /** Shows the replay button once a phase has played through. */
  setFinished(on: boolean): void {
    this.nav.classList.toggle('done', on);
  }

  /** Shows the "space to start" hint while the scene waits in idle. */
  setIdle(on: boolean): void {
    this.startHint.classList.toggle('on', on);
  }

  toggleOverlay(): void {
    this.overlayHidden = !this.overlayHidden;
    this.overlay.classList.toggle('hidden', this.overlayHidden);
  }

  private setSplashText(n: number): void {
    const p = this.t.phases[n];
    const numbered = n > 0;
    this.splashNum.textContent = numbered ? `${this.t.phase} ${n}` : '';
    this.splashNum.classList.toggle('hidden', !numbered);
    this.splashSub.textContent = p.title;
    this.splashHint.classList.toggle('hidden', n !== 0);
  }

  /** The panel is already up: pop its text out and the next phase's text in. */
  splashSwap(n: number): void {
    const s = this.splash;
    s.classList.remove('out');
    s.classList.add('in', 'swap');
    this.splashShown = true;
    setTimeout(() => {
      this.setSplashText(n);
      s.classList.remove('swap');
    }, 190);
  }

  /** Slide the panel in from the left. `still` places it without animation (first paint). */
  splashIn(n: number, still = false): void {
    this.setSplashText(n);
    const s = this.splash;
    s.classList.remove('swap');
    s.classList.remove('out');
    if (!s.classList.contains('in')) {
      // restart from the left edge without a transition
      s.classList.add('still');
      s.classList.remove('in');
      void s.offsetWidth;
      if (!still) s.classList.remove('still');
      s.classList.add('in');
      if (still) {
        void s.offsetWidth;
        s.classList.remove('still');
      }
    }
    this.splashShown = true;
  }

  /** Slide the panel out to the right. */
  splashOut(): void {
    const s = this.splash;
    if (!s.classList.contains('in')) return;
    s.classList.remove('in', 'still');
    s.classList.add('out');
    this.splashShown = false;
  }

  dip(on: boolean): void {
    this.dipEl.classList.toggle('on', on);
  }
}
