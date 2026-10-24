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
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly list: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly dots: HTMLElement[] = [];
  private readonly arc: SVGPathElement;
  private readonly needle: SVGGElement;
  private readonly laps: HTMLElement;
  private readonly hint: HTMLElement;
  private bulletsHidden = false;

  onPrev?: () => void;
  onNext?: () => void;
  onGoTo?: (n: number) => void;

  constructor(private readonly t: Texts) {
    this.root = el('div');
    this.root.id = 'hud';

    this.card = el('div', 'card');
    this.title = el('h1');
    this.sub = el('p', 'sub');
    this.list = el('ul');
    this.footer = el('p', 'footer', t.footer);
    this.card.append(this.title, this.sub, this.list, this.footer);

    const nav = el('div', 'nav');
    this.prevBtn = el('button', undefined, t.prev);
    this.prevBtn.type = 'button';
    this.prevBtn.addEventListener('click', () => this.onPrev?.());
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
    nav.append(this.prevBtn, dots, this.nextBtn);

    const dial = el('div', 'dial');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 72');
    const bg = document.createElementNS(ns, 'path');
    bg.setAttribute('d', 'M10 62 A50 50 0 0 1 110 62');
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', '#e3e9ee');
    bg.setAttribute('stroke-width', '11');
    bg.setAttribute('stroke-linecap', 'round');
    this.arc = document.createElementNS(ns, 'path');
    this.arc.setAttribute('d', 'M10 62 A50 50 0 0 1 110 62');
    this.arc.setAttribute('fill', 'none');
    this.arc.setAttribute('stroke', '#e35b5b');
    this.arc.setAttribute('stroke-width', '11');
    this.arc.setAttribute('stroke-linecap', 'round');
    this.arc.setAttribute('stroke-dasharray', `${ARC_LEN} ${ARC_LEN}`);
    this.arc.setAttribute('stroke-dashoffset', `${ARC_LEN}`);
    this.needle = document.createElementNS(ns, 'g');
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', '60');
    line.setAttribute('y1', '62');
    line.setAttribute('x2', '20');
    line.setAttribute('y2', '62');
    line.setAttribute('stroke', '#2b3440');
    line.setAttribute('stroke-width', '3.5');
    line.setAttribute('stroke-linecap', 'round');
    this.needle.append(line);
    const hub = document.createElementNS(ns, 'circle');
    hub.setAttribute('cx', '60');
    hub.setAttribute('cy', '62');
    hub.setAttribute('r', '5');
    hub.setAttribute('fill', '#2b3440');
    svg.append(bg, this.arc, this.needle, hub);
    const label = el('div', 'label', t.trust);
    this.laps = el('div', 'laps');
    dial.append(svg, label, this.laps);

    this.hint = el('div', 'hint', t.hint);

    this.root.append(this.card, nav, dial, this.hint);
    document.body.append(this.root);
    this.setTrust(0);
  }

  setPhase(n: number): void {
    const p = this.t.phases[n];
    this.title.textContent = p.title;
    if (n === 0) {
      this.sub.textContent = p.bullets[0] ?? '';
      this.sub.style.display = '';
      this.list.style.display = 'none';
    } else {
      this.sub.style.display = 'none';
      this.list.style.display = '';
      this.list.replaceChildren(...p.bullets.map((b) => el('li', undefined, b)));
    }
    this.card.classList.toggle('with-footer', n === PHASE_COUNT - 1);
    this.dots.forEach((d, i) => {
      d.classList.toggle('on', i === n);
      d.classList.toggle('done', i < n);
    });
    this.prevBtn.disabled = n === 0;
    this.nextBtn.disabled = n === PHASE_COUNT - 1;
    this.hint.classList.toggle('hidden', n !== 0);
  }

  setTrust(v: number): void {
    const k = Math.max(0, Math.min(1, v));
    this.arc.setAttribute('stroke-dashoffset', `${ARC_LEN * (1 - k)}`);
    this.needle.setAttribute('transform', `rotate(${180 * k} 60 62)`);
    const color = k < 0.5 ? mixHex('#e35b5b', '#ffcc33', k / 0.5) : mixHex('#ffcc33', '#3fb66b', (k - 0.5) / 0.5);
    this.arc.setAttribute('stroke', color);
  }

  setLaps(n: number, visible: boolean): void {
    this.laps.textContent = `${this.t.cleanLaps}: ${n}`;
    this.laps.classList.toggle('on', visible);
  }

  toggleBullets(): void {
    this.bulletsHidden = !this.bulletsHidden;
    this.card.classList.toggle('hidden', this.bulletsHidden);
  }
}
