# Snake

A browser clone of classic Snake. Vanilla JavaScript and HTML5 Canvas, **zero dependencies and no build step**.

## Running it

ES modules are blocked over `file://` by browser CORS rules, so the page needs a static server:

```bash
cd snake
python3 -m http.server 8000   # then open http://localhost:8000
```

`npx serve` works just as well if you prefer Node.

## Controls

| Key | Action |
|---|---|
| Arrow keys or `W` `A` `S` `D` | Steer |
| `Space` / `P` | Pause and resume (`Space` also starts the game) |
| `Enter` / `R` | Restart |

Wall behaviour is switchable below the board: **solid** ends the round on contact, **wrap** carries the snake through to the opposite side. Changing it starts a fresh round.

The snake speeds up as it grows, and the best score is kept in `localStorage`.

## Tests

The game rules are a pure state machine with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd snake && node --test
```

## Layout

```
index.html      canvas, HUD, wall-mode control
styles.css      layout and theme
src/
  config.js     grid size, timing and colours — every tunable in one place
  game.js       pure rules: createGame, tick, queueDirection, spawnFood
  game.test.js  node --test coverage of the rules
  renderer.js   draws a state onto a canvas context
  input.js      keyboard → intents
  storage.js    high score, tolerant of blocked localStorage
  main.js       wiring and the fixed-timestep loop
```

`game.js` never touches the DOM, the canvas or storage. That separation is what keeps the rules testable in plain Node and easy to read side by side with another implementation.

## Implementation notes

The details that separate this from a naive Snake, and the ones worth comparing across models:

- **Fixed timestep.** The game logic steps on a time accumulator rather than once per `requestAnimationFrame`, so the snake moves at the same speed on 60Hz, 120Hz and 144Hz displays. Per-frame delta is clamped so a stalled tab cannot trigger a burst of catch-up ticks.
- **Direction queue validated against the pending turn.** Inputs are buffered (max 2) and each is checked against the direction that will be in effect when it lands, not the current one. Checking the current direction is the classic bug that lets a fast Up-then-Left reverse the snake into its own neck.
- **The vacating tail square is legal.** When the snake is not growing, its tail leaves a square on the same tick, so moving into it is a valid turn rather than a collision.
- **Uniform food spawns.** Food is drawn uniformly from the list of free squares instead of re-rolling until one is free, which would get arbitrarily slow as the board fills. It also gives the win condition for free: no free squares means the board is cleared.
- **`devicePixelRatio` scaling** so the grid stays crisp on HiDPI monitors.
- **Auto-pause on tab blur**, so you do not come back to a dead snake.
- **Storage never throws** — `localStorage` is unavailable in Safari private mode and under some privacy settings, so every access is guarded with an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5 (Claude Code) |
| Approach | Plan mode: requirements clarified up front, then implemented from an approved plan |
| Dependencies | None |
| Tests | 11, via `node --test` |
