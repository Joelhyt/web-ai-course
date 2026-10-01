# Pac-Man

Arcade-accurate Pac-Man in the browser. Vanilla JavaScript and HTML5 Canvas, **zero dependencies and no build step**.

## Running it

ES modules are blocked over `file://`, so the page needs a static server. Serve the **repository root**, since the page shares `../shared/theme.css` with the other games:

```bash
python3 -m http.server 8000   # from the repo root, then open http://localhost:8000/pacman/
```

## Controls

| Key | Action |
|---|---|
| `↑` `←` `↓` `→` / `WASD` | Steer. A turn pressed early is kept and taken at the next opening |
| `Enter` | Start, or play again after game over |
| `Space` | Start |
| `P` / `Esc` | Pause |
| `R` | Restart |

The high score is kept in `localStorage` (`pacman.best`), and the game picker on the site's front page shows it.

## Rules

The rules follow the 1980 arcade game, mostly as documented in Jamey Pittman's *The Pac-Man Dossier*:

- **The original maze**: 28×31 tiles, 240 dots, 4 energizers, and the side tunnel.
- **Four ghosts with their own targets.** Blinky aims at Pac-Man. Pinky aims four tiles ahead of him. Inky aims at twice the vector from Blinky to the tile two ahead of Pac-Man. Clyde chases until he is within eight tiles, then runs for his corner. Facing up, "ahead" is also that many tiles to the left. This is the arcade's overflow bug, and it is kept.
- **How ghosts steer.** They pick a direction at each tile and never turn back on their own. They take the exit nearest their target in a straight line, with ties going up, left, down, right. They cannot turn up from the two tiles above the house or the two above Pac-Man's start, except when frightened.
- **Scatter and chase** alternate on the arcade's timer: 7/20/7/20/5/20/5 s, then chase for good on level 1, with shorter scatters later. Every switch turns the ghosts around. The timer stops while they are frightened.
- **Frightened ghosts** turn at random and flash before they recover. Fright gets shorter level by level and is gone from level 19, after which energizers only turn the ghosts around.
- **Eaten ghosts** go back to the house as eyes, are revived inside, and come straight back out.
- **Leaving the house** is driven by dot counters. Pinky leaves at once, and on level 1 Inky waits for 30 dots and Clyde for 60 more. After a lost life a shared counter takes over (7 and 17 dots), and a ghost also leaves whenever Pac-Man goes 4 s (3 s from level 5) without eating.
- **Cruise Elroy.** With 20 dots left on level 1 (more on later levels) Blinky speeds up, and speeds up again at half that. He also chases even in scatter. After a lost life this waits until Clyde is out.
- **Speeds** use the arcade's per-level percentages for Pac-Man, frightened Pac-Man, ghosts, frightened ghosts and the tunnel. Eating stops Pac-Man for one frame per dot and three per energizer.
- **Cornering.** Pac-Man may turn up to 0.4 tiles before or after a tile's centre, then moves diagonally back onto the lane, so he gains a little on the ghosts at every corner.
- **Lives.** 3 lives, and one extra at 10,000 points.

### Scoring

| | Points |
|---|---|
| Dot | 10 |
| Energizer | 50 |
| Ghosts on one energizer | 200, 400, 800, 1600 |
| Fruit (appears after 70 and 170 dots, for about 9.5 s) | cherries 100 · strawberry 300 · orange 500 · apple 700 · melon 1000 · galaxian 2000 · bell 3000 · key 5000 |

Not included: the level-256 kill screen (the level-21 settings simply repeat), the intermission cutscenes, sound, and touch controls.

## Tests

The rules are a pure state machine with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd pacman && node --test
```

## Layout

```
index.html        canvas, HUD, key reference
styles.css        layout (colour tokens and base styles are in ../shared/theme.css)
src/
  config.js       timings, scoring, fruit and the per-level table (speeds, fright, Elroy, scatter/chase)
  maze.js         the maze as ASCII, tiles, the tunnel, wall outlines, tile-centre movement
  ghosts.js       targeting, turning, house release, eyes going home
  game.js         pure rules: createGame, start, steer, togglePause, advanceClock
  renderer.js     draws a state onto a canvas: maze, characters, fruit, overlays
  input.js        keyboard → intents
  storage.js      the high score, tolerant of blocked localStorage
  main.js         wiring and the animation loop
  *.test.js       node --test coverage of maze.js, ghosts.js and game.js
```

## Implementation notes

- **Fixed 60 Hz ticks.** `advanceClock(state, dt)` runs play in 1/60 s steps, as the arcade did, so speeds, eating pauses and timers behave the same at any refresh rate. Tests pass explicit deltas instead of faking time, and pausing is just not calling it.
- **Nobody skips a tile centre.** Movement goes centre to centre (`stepToCentre`), and every decision is made at a centre: a ghost's turn, Pac-Man's stop at a wall, a waiting turn. Collisions are tile-based and checked after Pac-Man moves and again after the ghosts do, like the original.
- **Walls are traced, not stored.** The maze is a plain ASCII map. Wall segments join neighbouring wall tiles that face floor on the same side. Stroked wide, then narrower in the background colour, they give the arcade's double outline. A flood fill from Pac-Man's start tells floor from the dead space outside the walls.
- **The tunnel is drawn twice.** Actors are drawn at their position and a maze-width to either side, clipped to the maze, so whatever slides out of one side is already sliding in at the other.
- **The house is scripted.** Bobbing, walking out through the door and the eyes' walk back in ignore tiles, as they do in the arcade. Only the maze outside the house is tile-steered.
- **Storage never throws.** Every `localStorage` access has an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5.5 (Claude Code) |
| Approach | Plan agreed first (arcade-accurate rules, Classic mode only, no kill screen, keyboard only), then implemented |
| Dependencies | None |
| Tests | 43, via `node --test` |
