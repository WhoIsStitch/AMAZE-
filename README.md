# GLYDE

**Roll. Paint. Conquer.** An infinite, fully 3D slide-and-paint maze game that installs on your iPhone and
works completely offline. No ads, no accounts, no tracking, no network calls after the first load.

Swipe to send the ball sliding until it hits something. Every tile it touches gets painted. Paint every tile to win.

## What's in the game

| | |
|---|---|
| **Infinite levels** | Every level is generated from its number, so level 9,999 is as real as level 1 (and identical on every device). |
| **Always solvable** | Each level is built by *playing it* with a virtual ball, so a solution exists by construction. A test suite re-verifies this (`node tools/test-levels.mjs`). |
| **Real difficulty curve** | Boards grow from 5x7 up to 14x21, fill ratio rises, solutions get longer, and the generator prefers layouts a greedy player gets wrong. |
| **New mechanics as you climb** | **Portals** (L8), **Arrow pads** (L15), **Sticky pads** (L22), **Seal tiles** that wall off behind you (L30). Each debuts with a short explainer and a guaranteed example. |
| **3 modes** | **Classic**, **Limited Moves** (a move budget that tightens with level), **Time Rush** (a clock that tightens with level). Each mode has its own level progress. |
| **3D + juice** | Three.js scene with shadows, reflective materials, squash & stretch, particle trails, camera shake, drop-in level intros, confetti, procedural sound + music, haptics. |
| **26 ball skins** | Common / Rare / Epic / Legendary, all procedural (Moon, Galaxy, Diamond, Inferno, Event Horizon...). Buy with coins you collect by rolling over them. |
| **6 board themes** | Wood, Bricks (studs!), Neon, Plastic, Golf, Volcanic. Unlock by reaching levels. |
| **Progression** | Stars per level, a chest every 5 levels, 74 achievements, 7-day daily rewards. |
| **Hints, undo, restart** | Hints are computed from your *current* position by a search solver and light up the exact swipe. |

Everything (textures, sounds, balls, music) is generated in code at runtime. The only third-party pieces are
[three.js](https://threejs.org) (MIT, vendored in `vendor/`) and the Lilita One font (SIL OFL, in `fonts/`).

## Put it on your iPhone (offline)

1. **Host it** with GitHub Pages: repo **Settings -> Pages -> Source: GitHub Actions**. The included workflow
   (`.github/workflows/pages.yml`) deploys on every push to `main`.
   *GitHub Pages from a **private** repository needs a paid GitHub plan (Pro / Team / Enterprise).
   On a Free plan, either make the repo public, or host the same files on Cloudflare Pages or Netlify (both can
   deploy straight from a private repo for free: build command none, output directory `/`).*
2. Open the site URL in **Safari** on your iPhone.
3. Tap **Share -> Add to Home Screen**.
4. Launch it once while online. After that it runs fullscreen with no connection at all (service worker caches everything).

Progress is saved on the device (localStorage). Deleting the Home Screen icon deletes the save.

## Controls

Swipe anywhere on the board. On desktop: arrow keys / WASD, `Z` undo, `R` restart, `H` hint.

## Development

```bash
python3 -m http.server 8000        # or any static server, then open http://localhost:8000
node tools/test-levels.mjs 200     # generator + solver sanity (solvable, deterministic, timings, ascii with --ascii 12,40)
node tools/make-icons.mjs          # regenerate the app icons (needs playwright)
node tools/shoot.mjs <dir>         # headless screenshot harness (needs playwright)
```

```
index.html, css/style.css          shell + chunky UI
js/engine.js                       the rules (pure, shared by game, generator, solver)
js/generator.js, js/rng.js         infinite deterministic level generator
js/solver.js                       hint solver (DFS + transposition table + reachability pruning)
js/render.js, js/textures.js       Three.js scene, procedural materials, particles
js/ui.js, js/main.js, js/store.js  screens, game controller, save data
js/audio.js, js/haptics.js         synthesized sound & music, haptic feedback
sw.js, manifest.webmanifest        offline + installability
```

### Adding content
- New ball: add an entry to `BALLS` in `js/data.js` (and a texture `kind` in `js/textures.js` if it needs one).
- New theme: add to `THEMES` in `js/data.js` and a branch in `themeTextures`.
- Tune difficulty: `levelParams`, `UNLOCK`, and the scoring in `js/generator.js`; re-run `tools/test-levels.mjs`.
