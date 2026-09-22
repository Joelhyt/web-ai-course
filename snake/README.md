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

## Power-ups

Four collectibles take turns appearing on a random free square. One is on the board at a time, it lasts about eight seconds before fading (blinking for the last stretch), and there is a cooldown before the next one rolls — including at the start of a round, so nothing lands in the snake's lap. Drive the head over one to pick it up; an active effect is shown as a chip under the board with a draining timer, and as a coloured frame around the board itself.

| | Power-up | Effect |
|---|---|---|
| Cyan hourglass | **Slow** | The tick interval is multiplied by `slowFactor` (1.9x) for ~55 ticks. It scales the score-derived speed rather than replacing it, so it is worth the same relief late in a round as it is early. |
| Violet ghost | **Ghost** | Self-collision is switched off for ~45 ticks and the snake is drawn translucent with a dashed outline — the transparency *is* the rule. Walls still apply. |
| Amber magnet | **Magnet** | For ~55 ticks every food item is dragged one square toward the head, on every other tick, along its longer axis. A dotted tether shows the pull. |
| Rose cluster | **Feast** | For ~50 ticks the board carries `feastMultiplier` (4) food items instead of one. The three extras are on loan: they are drawn smaller inside a dashed ring, blink over the effect's last ticks, and **any that are not eaten vanish when it ends**. |

Every duration is counted in **ticks rather than milliseconds**, so a slowed snake gets the same number of *moves* out of an effect as a fast one. Two restrictions keep Magnet from being degenerate: the food never steps onto the snake, and it holds still once it is adjacent to the head — otherwise it would flee ahead of a snake travelling away from it and could never be caught. Re-collecting a running effect refreshes it instead of stacking, so the HUD countdown always means what it says.

Feast's crumbs score and grow the snake exactly like ordinary food — including the speed-up per point — so the power-up trades difficulty for score rather than handing one out. They never spawn on the snake, the food or the collectible, and they bow out entirely when the board is down to its last few squares rather than crowding the room the player needs to manoeuvre in. Only the *ordinary* food counts toward the win: a cleared board still means the real food has nowhere left to go.

Shape, not just colour, distinguishes them on the board — colour alone is unreadable for the roughly 8% of players with a colour vision deficiency.

## Tests

The game rules are a pure state machine with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd snake && node --test
```

## Layout

```
index.html      canvas, HUD, power-up legend, wall-mode control
styles.css      layout and theme
src/
  config.js     grid size, timing, colours and power-up table — every tunable in one place
  game.js       pure rules: createGame, tick, queueDirection, spawnFood, spawnPowerUp
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
- **Power-ups live in the rules, not the loop.** Effects and collectible lifetimes are tick counts on the state, so all three are covered by plain Node tests with no fake clock. The only thing the loop does differently is re-read `effectiveInterval(state)` inside the catch-up loop, since Slow can start or end on any tick.
- **A collectible in the last free square cannot fake a win.** Food avoids the power-up and Feast's crumbs when there is room to, and relaxes those constraints one at a time otherwise, so "no free squares" still means exactly that.
- **Feast's food is on loan.** The extras live in `state.bonusFood` and are cleared the tick the effect hits zero, so an uneaten crumb can never outlive the power-up that put it there.
- **Storage never throws** — `localStorage` is unavailable in Safari private mode and under some privacy settings, so every access is guarded with an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5 (Claude Code) |
| Approach | Plan mode: requirements clarified up front, then implemented from an approved plan |
| Dependencies | None |
| Tests | 30, via `node --test` |
