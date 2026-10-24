import type { Lang } from './config';

export interface PhaseText {
  title: string;
  /** Phase 0 uses a single italic subtitle instead of bullets. */
  bullets: string[];
}

export interface Texts {
  phases: PhaseText[];
  trust: string;
  cleanLaps: string;
  prev: string;
  next: string;
  hint: string;
  footer: string;
}

export const TEXTS: Record<Lang, Texts> = {
  en: {
    trust: 'Trust',
    cleanLaps: 'clean laps',
    prev: '‹ Prev',
    next: 'Next ›',
    hint: '→ to begin',
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'Keeping the AI on the rails',
        bullets: ['How trust in an AI colleague grows, one lap at a time'],
      },
      {
        title: 'Chatting',
        bullets: [
          'You type, it answers, you copy the result over by hand',
          'Nothing moves unless you push',
          'It knows the internet, not your work',
        ],
      },
      {
        title: 'Give it your codebase',
        bullets: [
          'The desktop app can read and change your project itself',
          "You're the driver now, not the engine",
          'It still goes wrong often, so you watch every move',
        ],
      },
      {
        title: 'Give it your context',
        bullets: [
          'Connect your backlog, wiki and requirements',
          "It knows what you're building and why",
          'Fewer surprises, smoother ride',
        ],
      },
      {
        title: 'Fix the cause, not the crash',
        bullets: [
          'Every derailment becomes a rule: a line in CLAUDE.md, a lint rule, a test',
          'The same mistake never happens twice',
          'The track gets safer every week',
        ],
      },
      {
        title: 'Turn up the speed',
        bullets: [
          'Fewer crashes means bigger tasks and less checking',
          'New speed, new ways to fail',
          'Same recipe: fix the cause, add a guardrail',
        ],
      },
      {
        title: 'Nothing goes wrong anymore',
        bullets: [
          'Lap after lap without a derailment',
          "You watch, but don't touch",
          'Time to step out of the cab',
        ],
      },
      {
        title: 'Set the destination',
        bullets: [
          'You describe the task and let it go',
          'It comes back with the work done',
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
    trust: 'Tillit',
    cleanLaps: 'felfria varv',
    prev: '‹ Föregående',
    next: 'Nästa ›',
    hint: '→ för att börja',
    footer: 'Mathias Jernberg',
    phases: [
      {
        title: 'Håll AI:n på spåret',
        bullets: ['Hur tilliten till en AI-kollega växer, ett varv i taget'],
      },
      {
        title: 'Chatta',
        bullets: [
          'Du skriver, den svarar, du kopierar över resultatet för hand',
          'Inget rör sig om du inte knuffar',
          'Den kan internet, inte ditt jobb',
        ],
      },
      {
        title: 'Ge den din kodbas',
        bullets: [
          'Skrivbordsappen kan läsa och ändra i projektet själv',
          'Nu är du föraren, inte motorn',
          'Det går fortfarande ofta fel, så du bevakar varje steg',
        ],
      },
      {
        title: 'Ge den din kontext',
        bullets: [
          'Koppla på backlog, wiki och krav',
          'Den vet vad ni bygger och varför',
          'Färre överraskningar, jämnare resa',
        ],
      },
      {
        title: 'Åtgärda orsaken, inte kraschen',
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
        title: 'Inget går fel längre',
        bullets: [
          'Varv efter varv utan urspårning',
          'Du tittar, men rör inget',
          'Dags att kliva ur hytten',
        ],
      },
      {
        title: 'Ange destinationen',
        bullets: [
          'Du beskriver uppgiften och släpper iväg den',
          'Den kommer tillbaka med jobbet gjort',
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
