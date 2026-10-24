export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} as const;

type Props = Record<string, number>;

interface Tw {
  obj: any;
  from: Props;
  to: Props;
  d: number;
  el: number;
  e: Ease;
  onDone?: () => void;
}

/** Minimal property tweener. Works on any object with numeric fields (Vector3, scale, plain objects). */
export class Tweens {
  private list: Tw[] = [];

  to(obj: any, to: Props, d: number, e: Ease = ease.inOut, onDone?: () => void): void {
    this.list = this.list.filter((tw) => !(tw.obj === obj && Object.keys(to).some((k) => k in tw.to)));
    if (d <= 0) {
      Object.assign(obj, to);
      onDone?.();
      return;
    }
    const from: Props = {};
    for (const k in to) from[k] = obj[k];
    this.list.push({ obj, from, to, d, el: 0, e, onDone });
  }

  kill(obj: any): void {
    this.list = this.list.filter((tw) => tw.obj !== obj);
  }

  update(dt: number): void {
    const done: Tw[] = [];
    for (const tw of this.list) {
      tw.el += dt;
      const t = Math.min(1, tw.el / tw.d);
      const k = tw.e(t);
      for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((tw) => !done.includes(tw));
      for (const tw of done) tw.onDone?.();
    }
  }
}

export const tweens = new Tweens();

/* ---------- Sequencer: generator-based choreography ---------- */

export interface Step {
  d: number;
  update?: (t: number) => void;
  until?: () => boolean;
  done?: () => void;
}

export type Seq = Generator<Step, void, unknown>;

export const wait = (d: number): Step => ({ d });
export const step = (d: number, update: (t: number) => void, done?: () => void): Step => ({ d, update, done });
export const until = (pred: () => boolean): Step => ({ d: Infinity, until: pred });
export const call = (fn: () => void): Step => ({ d: 0, done: fn });

export class Sequencer {
  private gen: Seq | null = null;
  private cur: Step | null = null;
  private el = 0;

  get running(): boolean {
    return this.gen !== null;
  }

  run(g: Seq): void {
    this.cancel();
    this.gen = g;
    this.advance();
  }

  cancel(): void {
    this.gen = null;
    this.cur = null;
  }

  private advance(): void {
    for (let guard = 0; guard < 1000; guard++) {
      if (!this.gen) return;
      const r = this.gen.next();
      if (r.done) {
        this.gen = null;
        this.cur = null;
        return;
      }
      const s = r.value;
      this.cur = s;
      this.el = 0;
      if (s.until) {
        if (s.until()) {
          s.done?.();
          if (this.cur !== s) return;
          continue;
        }
        return;
      }
      if (s.d <= 0) {
        s.update?.(1);
        s.done?.();
        if (this.cur !== s) return;
        continue;
      }
      return;
    }
  }

  update(dt: number): void {
    if (!this.gen || !this.cur) return;
    const s = this.cur;
    if (s.until) {
      if (s.until()) {
        s.done?.();
        if (this.cur === s) this.advance();
      }
      return;
    }
    this.el += dt;
    const t = Math.min(1, this.el / s.d);
    s.update?.(t);
    if (t >= 1) {
      s.done?.();
      if (this.cur === s) this.advance();
    }
  }
}
