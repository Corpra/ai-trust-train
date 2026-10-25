export type Lang = 'en' | 'sv';

export const LANG: Lang = document.documentElement.lang === 'sv' ? 'sv' : 'en';

export const PHASE_COUNT = 9; // 0 = title, 1..7 = journey, 8 = end

/** Seconds the train needs from A to B at each phase's cruising speed (0 = no driving). */
export const TRAVEL_SECONDS = [0, 0, 12, 12, 12, 9, 8, 8, 0];
/** Phase 1: how long the human pushes, and how far along the track they get. */
export const PUSH_SECONDS = 25;
export const PUSH_FRACTION = 0.25;

/** Trust dial value per phase, set while the splash covers the scene. */
export const TRUST = [0, 0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1];

/** Splash panel timing (seconds). */
export const SPLASH_IN = 0.38;
export const SPLASH_HOLD = 2.5;
export const SPLASH_OUT = 0.3;
export const DIP = 0.14;

export const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Transition duration scale: reduced motion shortens, never removes. */
export const MOTION = REDUCED_MOTION ? 0.5 : 1;

export const COLORS = {
  bg: 0x0a0a0c,
  rail: 0xb9bcc3,
  sleeper: 0x2c2d31,
  mud: 0x3b2a1d,
  loco: 0x4a5059,
  locoDark: 0x2c3036,
  metal: 0xb4bac3,
  metalDark: 0x6f757d,
  wood: 0x7b5736,
  woodDark: 0x563c27,
  wheel: 0x1b1d21,
  human: 0xffffff,
  guard: 0xffcc33,
  claude: 0xd97757,
  crate: 0xd3d5da,
  crateDark: 0x6b6f76,
  ok: 0x3fb66b,
  bad: 0xe35b5b,
  ticket: 0xfff6d6,
  clipboard: 0x8d6d4c,
  paper: 0xffffff,
  slab: 0x2a2c31,
  slabEdge: 0xffffff,
  lever: 0xffffff,
  buffer: 0x4a4e55,
  dust: 0x6e6a66,
  sweat: 0xcfe6ff,
  flash: 0xfff2b0,
  spark: 0xffb347,
  streak: 0xffffff,
  headlight: 0xfff1d0,
} as const;
