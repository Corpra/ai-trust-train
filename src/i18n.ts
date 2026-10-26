import type { Lang } from './config';

export interface PhaseText {
  /** Splash subtitle and overlay heading (title text for phases 0 and 8). */
  title: string;
  bullets: string[];
}

export interface Texts {
  phases: PhaseText[];
  /** "Phase" as in "Phase 3" on the splash. */
  phase: string;
  trust: string;
  prev: string;
  next: string;
  replay: string;
  hint: string;
  /** Shown while a phase waits in idle for the presenter. */
  startHint: string;
  footer: string;
}

export const TEXTS: Record<Lang, Texts> = {
  en: {
    phase: 'Phase',
    trust: 'Trust',
    prev: '‹ Prev',
    next: 'Next ›',
    replay: '↻ Replay',
    hint: '→ to begin',
    startHint: 'Space to start the train',
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'The trust ladder for AI',
        bullets: [],
      },
      {
        title: 'Chat bot',
        bullets: [
          'Copy and paste',
          'No access to your work files',
        ],
      },
      {
        title: 'Desktop app',
        bullets: [
          'Work files and codebase',
          'It still goes wrong often, you watch every step',
        ],
      },
      {
        title: 'ADO/Confluence/Jira',
        bullets: [
          'It knows what we build and why',
          'Fewer mistakes',
        ],
      },
      {
        title: 'Iterative guardrails',
        bullets: [
          'Fix and prevent mistakes as they happen',
        ],
      },
      {
        title: 'Increase speed',
        bullets: [
          'Bigger tasks',
          'New speed, new mistakes',
          'Keep fixing and preventing',
        ],
      },
      {
        title: 'Smooth ride',
        bullets: [
          'Task after task without major mistakes',
        ],
      },
      {
        title: 'Self-driving train',
        bullets: [
          'You describe the task and let it go',
          'You check the result',
        ],
      },
    ],
  },
  sv: {
    phase: 'Fas',
    trust: 'Tillit',
    prev: '‹ Föregående',
    next: 'Nästa ›',
    replay: '↻ Spela igen',
    hint: '→ för att börja',
    startHint: 'Mellanslag startar tåget',
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'Tillitsstegen för AI',
        bullets: [],
      },
      {
        title: 'Chat bot',
        bullets: [
          'Klippa/klistra',
          'Den saknar access till dina arbetsfiler',
        ],
      },
      {
        title: 'Desktop app',
        bullets: [
          'Arbetsfiler och kodbas',
          'Det går fortfarande ofta fel, du bevakar varje steg',
        ],
      },
      {
        title: 'ADO/Confluence/Jira',
        bullets: [
          'Den vet vad vi bygger och varför',
          'Färre fel',
        ],
      },
      {
        title: 'Iterativa skyddsräcken',
        bullets: [
          'Rätta och förebygg fel när de händer',
        ],
      },
      {
        title: 'Öka farten',
        bullets: [
          'Större uppgifter',
          'Ny fart, nya fel',
          'Fortsätt rätta och förebygg',
        ],
      },
      {
        title: 'Går som tåget',
        bullets: [
          'Uppgift efter uppgift utan större fel',
        ],
      },
      {
        title: 'Självkörande',
        bullets: [
          'Du beskriver uppgiften och släpper iväg den',
          'Du kontrollerar resultatet',
        ],
      },
    ],
  },
};
