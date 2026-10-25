# Keeping the AI on the rails

An animated 3D explainer of how trust in an AI colleague grows: from pushing a chatbot by hand to letting an autonomous agent deliver work you only inspect. A train is the AI, the railway is the context you give it, derailments are mistakes, guardrails are the rules you add after each one, and the human's distance from the train is the trust.

Built with Three.js, Vite and TypeScript. No framework, no external 3D assets, no analytics.

- English: `/en/` (also where `/` redirects)
- Swedish: `/sv/` (reached by direct link only)
- The phase is in the URL hash, e.g. `/en/#4`, so links and refreshes keep their place.

## The nine phases

| # | Title | What you see |
|---|---|---|
| 0 | Keeping the AI on the rails | Title. Bare world, idle train, human on the platform |
| 1 | Chatting | Loose, crooked track. The human pushes the train by hand, sweating. Follow camera |
| 2 | Give it your codebase | The railway snaps into place, the human climbs into the cab. Derails every lap |
| 3 | Give it your context | Ballast, signals, backlog and wiki buildings linked to the track. Derails every few laps |
| 4 | Fix the cause, not the crash | First derail pauses. Next fixes it and installs a guardrail. The rest fix themselves, one per lap |
| 5 | Turn up the speed | Faster. The curve and the bumpy stretch fail again at speed and get reinforced guardrails |
| 6 | Nothing goes wrong anymore | Fast, clean laps. The human steps out at the station |
| 7 | Set the destination | The human hands over a ticket, the train returns with cargo, the human checks it. One in four comes back wrong and goes out again |
| 8 | Trust is built, not given | Top-down view, every guardrail glowing |

## Controls

| Key | Action |
|---|---|
| → ␣ ⏎ PageDown | Next phase (in phase 4: also fixes the paused derail) |
| ← PageUp Backspace | Previous phase |
| 0–8, Home, End | Jump to a phase |
| D | Derail at the next hazard |
| + / − | Speed up / slow down the train |
| B | Hide or show the text card |
| R | Restart the current phase |
| C | Toggle a camera that follows the train |
| F | Fullscreen |

On phones, tap the right or left third of the scene to move between phases.

## Develop

```bash
npm install
npm run dev
```

Opens on <http://localhost:5173/en/>. Node 20 or newer is enough for development. Timings, trust values and colours live in `src/config.ts`; all text in `src/i18n.ts`.

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
src/world/          track (loop, spur, rails, fences), scenery, hazards and guardrails
src/actors/         the train (eyes, derail poses) and the human (poses, walking)
src/sim/director.ts phases, transitions, derail rules, the autonomous loop
src/ui/             HUD and input bindings
```

Font: [Nunito](https://fonts.google.com/specimen/Nunito) (Open Font License), loaded from Google Fonts.
