# Letter Murmuration

**English** · [Русский](README.ru.md)

Every letter on a web page becomes a creature with a body and mass — and flies off in a flock, like starlings.

![Letters flying as a flock around the pictures on the demo page](media/flock-avoids-images.png)

**▶ [Live demo](https://2d0x.github.io/letter-murmuration/dist/v6/)** · **🔖 [Install the bookmarklet](https://2d0x.github.io/letter-murmuration/dist/bm/)** · [All versions](https://2d0x.github.io/letter-murmuration/)

The demo and the bookmarklet speak English; a Russian version is available too: [demo](https://2d0x.github.io/letter-murmuration/dist/v6/ru/) · [bookmarklet](https://2d0x.github.io/letter-murmuration/dist/bm/ru/).

Three modes:

- **Murmuration** — letters fly as a flock, like starlings.
- **Horde** — letters run towards the cursor, like a crowd of zombies.
- **Rest** — letters stay in place. Sweep the cursor over them and they take off, then settle back.

The starting question: can the flocking behaviour from starling research replace the "straight-line" mobs of games like Vampire Survivors while keeping thousands of creatures on screen? Answer: yes — tens of thousands, in a single JS thread.

- 7.7k letters: flock ≈ 10 ms per step.
- 26k letters (4× the text): flock 30 ms, horde 34 ms per step.

Measured in headless Chromium (software WebGL, 1440×900). A normal computer with a GPU gets more frames.

## Try it in 10 seconds

1. **Bookmarklet.** Open the [install page](https://2d0x.github.io/letter-murmuration/dist/bm/) and drag the “Murmuration” button to your bookmarks bar. Click it on any site. The whole script lives inside the bookmark (about 61 KB). Click again or press `Esc` to turn it off.
2. **Demo page.** Open the [demo](https://2d0x.github.io/letter-murmuration/dist/v6/): twelve Shakespeare sonnets with pictures, lists, a table and a type-size scale.
3. **Console.** Copy [`dist/v6/letters-swarm-console-v6.js`](dist/v6/letters-swarm-console-v6.js) and paste it into the DevTools console on any page (Russian panel: [`dist/v6/ru/letters-swarm-console-v6.js`](dist/v6/ru/letters-swarm-console-v6.js)).

## Keys and settings

| Key | Action |
|---|---|
| `1` | Rest |
| `2` | Murmuration |
| `3` | Horde |
| `V` | Solid bodies or "ghosts" |
| `H` | Hunting falcon |
| `F` | Dot gun |
| `Esc` | Turn off (bookmarklet and console versions) |

The **dynamics settings** panel has sliders for: horde base speed, zombie view range, bird speed, fear of the cursor, number of neighbours K, take-off wave speed, zombie reaction, bird clearance from pictures, rate of fire, bullet speed.

## How it works

- **Perception.** Each letter sees its K = 7 nearest neighbours — the topological rule observed in real starling flocks ([Ballerini et al., PNAS 2008](https://doi.org/10.1073/pnas.0711437105)). Neighbours are found with a uniform grid and counting sort. Perception is refreshed every other step, in turns; panicking birds refresh it every step.
- **Flock rules.** Separation, alignment and cohesion after [Reynolds (1987)](https://doi.org/10.1145/37402.37406). On top of that, birds avoid collisions in advance, based on time-to-collision ([Karamouzas, Skinner, Guy, PRL 2014](https://doi.org/10.1103/PhysRevLett.113.238701)).
- **Bodies.** Letters are circles with mass proportional to the glyph's area; bold letters are heavier. Collisions are resolved positionally with Gauss–Seidel iterations, as in position-based dynamics for crowds ([Weiss et al. 2017](https://doi.org/10.1145/3136457.3136462)).
- **Flight.** Nearly constant speed, limited turning (banking). The flock hovers above a "roost" near the top of the screen — the idea behind the StarDisplay model by Hemelrijk and Hildenbrandt ([Hildenbrandt, Carere, Hemelrijk 2010](https://doi.org/10.1093/beheco/arq149)). Turns are started by a few initiators and run through the flock as a wave ([Attanasi et al. 2014](https://doi.org/10.1038/nphys3035)).
- **Predators.**
  - The hunting falcon attacks on its own; the kind of escape the flock performs depends on the attack speed ([Storms et al. 2019](https://doi.org/10.1007/s00265-018-2609-0)).
  - The cursor is a second falcon. Each bird extrapolates the cursor's path 12 steps ahead and dodges sideways. Alarm spreads to neighbours as a wave.
- **Horde.**
  - Everyone follows the neighbour ahead: never faster than them, keeping a safe gap — like traffic-flow models.
  - When blocked, a zombie goes around on the side it picks itself, using a density map of the crowd around the hero.
  - Each zombie has its own reaction time and sees the hero with a delay.
  - Big letters see further but move slower.
- **Pictures are obstacles.** Birds steer around them by casting a ray ahead (Reynolds 1999, *Steering Behaviors for Autonomous Characters*); the horde flows around them.
- **Rendering.** All letters are drawn in one WebGL2 call (instanced quads + glyph atlas), with a Canvas2D fallback. The original text becomes transparent but stays in the DOM for accessibility and search.

## Version history

Each version is its own folder `vN/` with a build in `dist/vN/`. v1–v5 are kept as originally built, with a Russian interface; v6 has English and Russian.

| Version | What's new | Measurements |
|---|---|---|
| [v1](https://2d0x.github.io/letter-murmuration/dist/v1/) | Letters → boids; Rest / Murmuration / Horde; 4 neighbour-search algorithms to compare; WebGL2 renderer | Canvas2D ≈ 100 ms per frame → WebGL2 |
| [v2](https://2d0x.github.io/letter-murmuration/dist/v2/) | Bodies with volume and mass; true K nearest (instead of "first found"); fear of collision | "Standing waves" — dense black clumps — are gone |
| [v3](https://2d0x.github.io/letter-murmuration/dist/v3/) | Horde follows the one ahead and goes around on the side (no more crescent "dunes"); hunting falcon; roost; dot gun | — |
| [v4](https://2d0x.github.io/letter-murmuration/dist/v4/) | Take-off wave from the cursor; settings panel; zombie view range; birds predict the cursor's path; test page with links, lists, a table, pictures | Birds within 25 px of a fast cursor: 24.2 → 1.9 |
| [v5](https://2d0x.github.io/letter-murmuration/dist/v5/) | Horde without the "line" and synchronous shaking (shared detour axis removed); personal reaction time; birds fly around pictures; giant letters at 2× and 4× the heading | Synchronous ring shift at speed 8: 66.8 → 1.8 (the 2.5 Hz mode is gone); birds at picture edges: 125 → 1.6 |
| [v6](https://2d0x.github.io/letter-murmuration/dist/v6/) | Bookmarklet covers the whole page (pinned headers stay text); new letters wake up as you scroll; landing along an arc; rate-of-fire and bullet-speed settings | Shot down in 10 s: 101 → 1683 at 240 shots per second |

## Before and after

**Horde, v4 → v5.** In v4 zombies lined up in a "line" and shook in sync; v5 removed the shared detour axis.

| v4 | v5 |
|---|---|
| ![v4: the horde forms a line](media/horde-v4-line.png) | ![v5: the horde without the line](media/horde-v5-fixed.png) |

**Landing, v5 → v6.** Letter trajectories when settling back: straight in v5, along an arc in v6.

![Landing trajectories in v5 and v6](media/landing-v5-vs-v6.png)

## Build and tests

```bash
python3 build.py v6                  # → dist/v6/ (English) and dist/v6/ru/ (Russian): demo page and console script
npm install && npm run bookmarklet   # → dist/bm/ and dist/bm/ru/: install page and bookmarklet.txt
```

Source layout: `vN/engine.js` — the engine, `vN/page.html` — demo page template, `vN/patch.py` — how the version was derived from the previous one. `bm/install.html` — bookmarklet install page template. Russian templates sit next to them as `v6/page.ru.html` and `bm/install.ru.html`; the panel language is set with the `lang` option of `LetterSwarm.start` (`'en'` by default, or `'ru'`).

Tests use Python + Playwright and run from the repo root:

```bash
pip install playwright && playwright install chromium
python3 tests/test_bm.py
```

`tests/mock_wiki.html` is a Wikipedia-like mock page with original text.

## Limitations

- The bookmarklet may not work on sites with a strict Content Security Policy (Google, YouTube, GitHub).
- Bookmarklets are awkward on phones; the demo page works on a phone, but slower.
- The horde doesn't plan routes around large obstacles, it only flows around them locally (that would need a flow field).

## Credits and references

- Ballerini M. et al. (2008). Interaction ruling animal collective behavior depends on topological rather than metric distance: Evidence from a field study. *PNAS*. [doi:10.1073/pnas.0711437105](https://doi.org/10.1073/pnas.0711437105)
- Reynolds C. W. (1987). Flocks, herds and schools: A distributed behavioral model. *ACM SIGGRAPH Computer Graphics*. [doi:10.1145/37402.37406](https://doi.org/10.1145/37402.37406)
- Reynolds C. W. (1999). Steering Behaviors for Autonomous Characters. Game Developers Conference.
- Karamouzas I., Skinner B., Guy S. J. (2014). Universal Power Law Governing Pedestrian Interactions. *Physical Review Letters*. [doi:10.1103/PhysRevLett.113.238701](https://doi.org/10.1103/PhysRevLett.113.238701)
- Weiss T. et al. (2017). Position-based multi-agent dynamics for real-time crowd simulation. *Motion in Games (MIG '17)*. [doi:10.1145/3136457.3136462](https://doi.org/10.1145/3136457.3136462)
- Hildenbrandt H., Carere C., Hemelrijk C. K. (2010). Self-organized aerial displays of thousands of starlings: a model. *Behavioral Ecology*. [doi:10.1093/beheco/arq149](https://doi.org/10.1093/beheco/arq149)
- Attanasi A. et al. (2014). Information transfer and behavioural inertia in starling flocks. *Nature Physics*. [doi:10.1038/nphys3035](https://doi.org/10.1038/nphys3035)
- Storms R. F. et al. (2019). Complex patterns of collective escape in starling flocks under predation. *Behavioral Ecology and Sociobiology*. [doi:10.1007/s00265-018-2609-0](https://doi.org/10.1007/s00265-018-2609-0)

Fonts on the demo pages: Cormorant SC, EB Garamond, IBM Plex (Google Fonts). The demo text — Shakespeare's sonnets — is in the public domain.

## License

[MIT](LICENSE) © 2026 Mikhail Yazev
