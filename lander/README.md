# Lunar Lander

Arcade-style Lunar Lander in the browser, after Atari's 1979 game. Vanilla JavaScript and HTML5 Canvas, **zero dependencies and no build step**.

## Running it

ES modules are blocked over `file://`, so the page needs a static server. Serve the **repository root**, since the page shares `../shared/theme.css` with the other games:

```bash
python3 -m http.server 8000   # from the repo root, then open http://localhost:8000/lander/
```

## Controls

| Key | Action |
|---|---|
| `←` `→` / `A` `D` | Rotate (hold) |
| `↑` / `W` / `Space` | Thrust (hold). `Space` also starts the game |
| `Enter` | Start, or play again after game over |
| `P` / `Esc` | Pause |
| `R` | Restart |

The best score is kept in `localStorage` (`lander.best`), and the game picker on the site's front page shows it.

## Rules

- **Flight.** The Moon's gravity (1.62 m/s²) pulls the lander down. The main engine gives 4.5 m/s² along the lander's axis. It turns at 120°/s, at most 90° either side of upright. The world is 400 × 300 m, its sides wrap around, and the top is a ceiling.
- **Fuel is your lives.** You start with 1000, and thrust burns 10 a second. A crash costs another 250 and a good landing gives 50 back. If the tank runs dry in flight the engine stops but the round plays out. The game ends when a round finishes with no fuel left.
- **Touchdown** is judged the moment any point of the lander meets the ground:

  | Outcome | Needs |
  |---|---|
  | **Good landing** | both feet on one pad, ≤ 2 m/s down, ≤ 1.5 m/s across, ≤ 8° tilt |
  | **Hard landing** | both feet on one pad, ≤ 4 m/s down, ≤ 2.5 m/s across, ≤ 12° tilt |
  | **Crash** | anything else: off a pad, a foot over the edge, the body touching, or too fast |

- **Rounds.** Every round has new terrain. The lander starts high up near one side, drifting toward the other at 8–12 m/s. Pads narrow by 6% a round, down to a minimum width.
- **Terrain.** Each round has 3 or 4 flat pads: a wide 2×, one or two 3×, and a narrow 5×.

The readouts in the top-left corner show altitude, horizontal and vertical speed, and tilt. Each one turns green once it is inside the good-landing limit.

### Scoring

| Outcome | Points | Fuel |
|---|---|---|
| Good landing | 50 × pad, plus 1 per 10 fuel left | +50 |
| Hard landing | 15 × pad | — |
| Crash | 5 | −250 |

## Tests

The rules are pure modules with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd lander && node --test
```

## Layout

```
index.html        canvas, HUD, key reference
styles.css        layout (colour tokens and base styles are in ../shared/theme.css)
src/
  config.js       gravity, thrust, fuel, landing limits, scoring, terrain settings, the lander's outline
  terrain.js      seeded terrain generator; groundHeight, padAt, pathTouchesGround
  physics.js      one step of flight, the lander's outline in the world, contact and the landing verdict
  game.js         pure rules: createGame, start, setControls, togglePause, advanceClock
  renderer.js     stars, terrain and pads, the lander and its flame, crash debris, readouts, overlays
  input.js        held keys → controls, plus one-shot keys
  random.js       seeded random numbers
  storage.js      the best score, tolerant of blocked localStorage
  main.js         wiring and the animation loop
  testing.js      flat terrain and other helpers for the tests
  *.test.js       node --test coverage of terrain.js, physics.js and game.js
```

## Implementation notes

- **Fixed 60 Hz ticks.** `advanceClock(state, dt)` runs flight in 1/60 s steps with semi-implicit Euler, so a landing doesn't depend on the display's refresh rate. Tests pass explicit deltas instead of faking time.
- **The terrain is a height map.** Midpoint displacement gives 128 segments, and heights that overshoot a limit fold back instead of being cut flat (flat stretches would look like pads). Both ends share one height, so the wrap is seamless.
- **Contact without tunnelling.** Since the ground is a function of x, a contact check is just "is any point of the lander below `groundHeight(x)`". The path each point takes during a step is also checked against every height-map vertex it passes over, so a fast lander can't slip through the tip of a narrow peak. The check runs on the unwrapped path, so crossing the world's edge isn't mistaken for a sweep across the map.
- **Pads are always landable.** The ground within 8 m of a pad's ends is lowered to 2 m below the pad if it was higher. A lander on the pad never has its body in a hillside, and the pad's edges stay visible. In a sweep over 60 seeds and rounds 1, 6 and 30, a simple descend-and-brake autopilot made a good landing on every one of the 636 pads.
- **The outcome screen and debris run on the wall clock**, not game time, as Tetris's popups do.
- **Storage never throws.** Every `localStorage` access has an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5.5 (Claude Code) |
| Approach | Plan agreed first (arcade rules, Classic mode with fuel as lives, fixed camera, wrapping world, shrinking pads, no sound), then implemented |
| Dependencies | None |
| Tests | 32, via `node --test` |
