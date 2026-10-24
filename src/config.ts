export type Lang = 'en' | 'sv';

export const LANG: Lang = document.documentElement.lang === 'sv' ? 'sv' : 'en';

export const PHASE_COUNT = 9; // 0 = title, 1..7 = journey, 8 = end

/** Seconds per lap at each phase's cruising speed (phase 0 is idle). Tune freely. */
export const LAP_SECONDS = [0, 30, 14, 12, 12, 7, 6.5, 6.5, 6.5];

/** Trust dial: floor per phase, and how much a clean lap / a derail moves the needle. */
export const TRUST_FLOOR = [0, 0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1];
export const TRUST_PER_CLEAN_LAP = 0.02;
export const TRUST_PER_DERAIL = 0.06;
export const TRUST_PER_OK_CARGO = 0.01;

export const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Transition duration scale: reduced motion shortens, never removes. */
export const MOTION = REDUCED_MOTION ? 0.5 : 1;

export const COLORS = {
  sky: 0xdff0fb,
  ground: 0x9fc49a,
  groundLight: 0xaed0a6,
  rail: 0x8c8479,
  railCrooked: 0x9a8f80,
  sleeper: 0x7d5c3c,
  ballast: 0xd2cdc4,
  ditch: 0x5b8fb5,
  loco: 0x2f9ba8,
  locoDark: 0x237885,
  face: 0xfff3dc,
  emblem: 0xffd166,
  eye: 0xffffff,
  pupil: 0x222a33,
  wagon: 0xb98b5a,
  wagonDark: 0x8e6a42,
  wheel: 0x3b3f45,
  human: 0xf26b5b,
  humanDark: 0xd9574a,
  skin: 0xffe8cf,
  guard: 0xffcc33,
  guardDark: 0xe0a800,
  tree: 0x5f9f6a,
  treeDark: 0x4b8a57,
  trunk: 0x8b6a4b,
  house: 0xf7e8d8,
  roof: 0xd96b5a,
  platform: 0xe4d8c4,
  platformEdge: 0xf4ecdc,
  office: 0xe9eef5,
  officeDark: 0xc9d4e2,
  library: 0xf6e7c9,
  libraryDark: 0xe0cfa8,
  crate: 0xc89a63,
  crateDark: 0xa87c48,
  ok: 0x3fb66b,
  bad: 0xe35b5b,
  signalGreen: 0x44cc66,
  signalPost: 0x55606b,
  bubble: 0xffffff,
  ticket: 0xfffbe6,
  clipboard: 0x9c7a56,
  paper: 0xffffff,
  glow: 0x4fd1e0,
  dust: 0xd9d2c5,
  sweat: 0x7cc4ff,
  flash: 0xfff2b0,
} as const;
