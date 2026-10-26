# The trust ladder for AI

An animated 3D explainer of how trust in an AI colleague grows: from pushing a chatbot by hand to letting an autonomous agent deliver work you only inspect. A train is the AI, the railway is the context you give it, derailments are mistakes, guardrails are the rules you add after each one, and the human's distance from the train is the trust.

Built with Three.js, Vite and TypeScript. No framework, no external 3D assets, no analytics.

- English: `/en/` (also where `/` redirects)
- Swedish: `/sv/` (reached by direct link only)
- A refresh always starts over from the title panel.

## The eight phases

Every phase runs on the same track from A to B and plays once; a splash panel ("Phase 3 · ADO/Confluence/Jira") introduces it, and a Replay button appears when it has finished. Guardrails earned in one phase stay for the next.

| # | Panel | What you see |
|---|---|---|
| 0 | The trust ladder for AI | Title panel |
| 1 | Chat bot | A muddy path, no rails. The human pushes the loco by hand, knees and elbows working, and gets a quarter of the way |
| 2 | Desktop app | Rails sweep in, the loco gains a code plate, the human climbs into the cab. Wrong fork at the switch, derails at the curve and the gap, each fixed by hand |
| 3 | ADO/Confluence/Jira | The loco gains a context plate and an antenna. The switch is taken correctly; the curve and the gap still derail |
| 4 | Iterative guardrails | Each derail is fixed and gets a guardrail: a fence on the curve, a bridge plate over the gap |
| 5 | Increase speed | Faster. The curve guardrail is not enough at this speed: the train tips over it, is fixed, and the guardrail is reinforced. The bridge holds |
| 6 | Smooth ride | Full speed, every guardrail flashes as the train passes |
| 7 | Self-driving train | The human hands over a ticket at A and waits at B. Crates land on the cart along the way; at B two pass and one is rejected. The train takes it away, out of the picture, and is soon back with it fixed and green |

## Controls

| Key | Action |
|---|---|
| ␣, click on the splash | Start the train (during a splash: dismiss it now; after the phase has played: replay it) |
| → ⏎ PageDown, click | Next phase (during a splash: dismiss it now) |
| ← PageUp Backspace | Previous phase |
| 0–7, Home, End | Jump to a phase |
| R | Replay the current phase |
| B | Hide or show the text column |
| F | Fullscreen |

Every phase opens idle after its splash and waits for ␣. On phones, tap the right or left third of the scene to move between phases and the middle third to start the train.

## Develop

```bash
npm install
npm run dev
```

Opens on <http://localhost:5173/en/>. Node 20 or newer is enough for development. Timings, trust values and colours live in `src/config.ts`; all text (including the splash subtitles) in `src/i18n.ts`.

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

## Deploy

The site is a static Cloudflare Worker (assets only) served at <https://ai-trust-train.jernbergconsulting.com>. `wrangler.jsonc` holds the custom domain, so a deploy attaches it.

Manual deploy from a laptop that is logged in with `wrangler login` (wrangler needs Node 22 or newer, so `nvm use 22` first if your default is older):

```bash
npm run deploy
```

Every push to `main` is built and deployed automatically by Cloudflare Workers Builds, and pull requests get preview URLs. The connection lives on the Worker itself: Cloudflare dashboard → **Workers & Pages** → `ai-trust-train` → **Settings** → **Builds**. To reconnect after a change of repository or account, press **Connect** there and pick `Corpra/ai-trust-train`, branch `main`, build command `npm run build`, deploy command `npx wrangler deploy`. The build uses the Node version in `.nvmrc`.

## Project layout

```
en/, sv/            one HTML entry per language
public/_redirects   / → /en/
src/main.ts         wires everything together
src/config.ts       timings, trust, colours
src/i18n.ts         all text
src/scene.ts        renderer, lights, resize
src/cameraRig.ts    camera glides, drift, follow mode
src/world/          track (A→B line, siding, rails, fences), hazards and guardrails
src/actors/         the train (upgrades, derail poses) and the human (jointed poses, walking)
src/sim/director.ts the splash flow and the scripted phases
src/ui/             HUD (text column, splash panel, dial) and input bindings
```

Font: [Nunito](https://fonts.google.com/specimen/Nunito) (Open Font License), loaded from Google Fonts.
