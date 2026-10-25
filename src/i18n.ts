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
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'Keeping the AI on the rails',
        bullets: [],
      },
      {
        title: 'Chat bot',
        bullets: [
          'You type, it answers, you copy the result over by hand',
          'Nothing moves unless you push',
          'It knows the internet, not your work',
        ],
      },
      {
        title: 'Adding the codebase',
        bullets: [
          'The desktop app can read and change your project itself',
          "You're the driver now, not the engine",
          'It still goes wrong often, so you watch every move',
        ],
      },
      {
        title: 'Adding ADO/Confluence/Jira',
        bullets: [
          'Connect your backlog, wiki and requirements',
          "It knows what you're building and why",
          'Fewer surprises, smoother ride',
        ],
      },
      {
        title: 'Iterative guardrails',
        bullets: [
          'Every derailment becomes a rule: a line in CLAUDE.md, a lint rule, a test',
          'The same mistake never happens twice',
          'The track gets safer every week',
        ],
      },
      {
        title: 'Increase speed',
        bullets: [
          'Fewer crashes means bigger tasks and less checking',
          'New speed, new ways to fail',
          'Same recipe: fix the cause, add a guardrail',
        ],
      },
      {
        title: 'Smooth ride',
        bullets: [
          'Trip after trip without a derailment',
          "You watch, but don't touch",
          'Time to step out of the cab',
        ],
      },
      {
        title: 'Self-driving train',
        bullets: [
          'You describe the task and let it go',
          'It arrives with the work done',
          'You check the cargo before it ships',
        ],
      },
      {
        title: 'Trust is built, not given',
        bullets: [
          'Chat → tools → context → guardrails → speed → autonomy',
          'Each step is earned by the one before',
          'Start where you are, lay one rail',
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
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'Håll AI:n på spåret',
        bullets: [],
      },
      {
        title: 'Chat bot',
        bullets: [
          'Du skriver, den svarar, du kopierar över resultatet för hand',
          'Inget rör sig om du inte knuffar',
          'Den kan internet, inte ditt jobb',
        ],
      },
      {
        title: 'Lägg till kodbasen',
        bullets: [
          'Skrivbordsappen kan läsa och ändra i projektet själv',
          'Nu är du föraren, inte motorn',
          'Det går fortfarande ofta fel, så du bevakar varje steg',
        ],
      },
      {
        title: 'Lägg till ADO/Confluence/Jira',
        bullets: [
          'Koppla på backlog, wiki och krav',
          'Den vet vad ni bygger och varför',
          'Färre överraskningar, jämnare resa',
        ],
      },
      {
        title: 'Iterativa skyddsräcken',
        bullets: [
          'Varje urspårning blir en regel: en rad i CLAUDE.md, en lintregel, ett test',
          'Samma misstag händer aldrig två gånger',
          'Spåret blir säkrare för varje vecka',
        ],
      },
      {
        title: 'Öka farten',
        bullets: [
          'Färre krascher betyder större uppgifter och mindre kontroll',
          'Ny fart, nya sätt att misslyckas',
          'Samma recept: åtgärda orsaken, sätt upp ett räcke',
        ],
      },
      {
        title: 'Går som tåget',
        bullets: [
          'Resa efter resa utan urspårning',
          'Du tittar, men rör inget',
          'Dags att kliva ur hytten',
        ],
      },
      {
        title: 'Självkörande',
        bullets: [
          'Du beskriver uppgiften och släpper iväg den',
          'Den kommer fram med jobbet gjort',
          'Du kontrollerar lasten innan den skickas vidare',
        ],
      },
      {
        title: 'Tillit byggs, den ges inte',
        bullets: [
          'Chatt → verktyg → kontext → räcken → fart → autonomi',
          'Varje steg förtjänas av det före',
          'Börja där du är, lägg en räls',
        ],
      },
    ],
  },
};
