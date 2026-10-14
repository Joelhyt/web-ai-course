# Tetris

Modern guideline Tetris in the browser. Vanilla JavaScript and HTML5 Canvas, **zero dependencies and no build step**.

## Running it

ES modules are blocked over `file://`, so the page needs a static server. Serve the **repository root** — the page shares `../shared/theme.css` with the other games:

```bash
python3 -m http.server 8000   # from the repo root, then open http://localhost:8000/tetris/
```

## Controls

| Key | Action |
|---|---|
| `←` `→` | Move (hold to auto-repeat) |
| `↓` | Soft drop |
| `Space` | Hard drop (also starts the round) |
| `↑` / `X` | Rotate clockwise |
| `Z` | Rotate counter-clockwise |
| `C` / `Shift` | Hold |
| `P` / `Esc` | Pause |
| `R` | Instant retry |
| `Enter` | Start, or play again after a round |

Keys are matched on `event.code`, the physical key, so `Z` and `X` sit side by side on any keyboard layout.

## Modes

| Mode | |
|---|---|
| **Marathon** | 150 lines. Gravity follows the guideline curve and speeds up every ten lines, from one row a second at level 1 to more than two rows a frame at level 15. Best is the highest score. |
| **Sprint** | 40 lines as fast as possible. Gravity stays at level 1; the clock is the pressure. Best is the lowest time, to the hundredth, and a round that tops out sets no time. |

Personal bests live in `localStorage` (`tetris.best.marathon`, `tetris.best.sprint`), and the game picker on the site's front page shows them.

## Rules

What "modern" means here, following the Tetris guideline:

- **Super Rotation System** with the full wall-kick tables, separate for I and for J/L/S/T/Z. Five tests per turn, first fit wins.
- **7-bag randomiser.** Each run of seven pieces is one of each, shuffled.
- **Hold**, once per piece.
- **Ghost piece** and a **five-piece next queue**.
- **Extended placement lock down**: 500 ms lock delay, restarted by any move or rotation on the ground, at most 15 times. Reaching a new lowest row gives the resets back.
- **Soft drop** at 20× gravity, **hard drop** locks at once.
- A **40-row playfield**, of which 20 are visible. Pieces spawn in the buffer above the board and drop straight into view. The two buffer rows nearest the board are drawn above the well, so a stack that grows past the top stays visible.
- **Block out** (a spawn overlaps the stack) and **lock out** (a piece locks entirely above the board) both end the round.

### Scoring

Everything except drop points is multiplied by the current level.

| Clear | Points |
|---|---|
| Single / Double / Triple / Tetris | 100 / 300 / 500 / 800 |
| T-spin mini: no lines / single / double | 100 / 200 / 400 |
| T-spin: no lines / single / double / triple | 400 / 800 / 1200 / 1600 |
| Back-to-back (a Tetris or line-clearing T-spin straight after another) | × 1.5 |
| Combo (each consecutive clearing lock after the first) | 50 × combo |
| Perfect clear: single / double / triple / tetris / back-to-back tetris | +800 / 1200 / 1800 / 2000 / 3200 |
| Soft drop / hard drop | 1 / 2 per row |

T-spins use the **three-corner rule**. The T's last move must be a rotation, and at least three of the four corners around its centre must be blocked (walls and floor count). It is a full T-spin if both corners beside the T's point are blocked, and a mini otherwise. The exception: a rotation that needed the fifth kick test (the one TST and fin setups rely on) always counts in full. A T-spin with no lines neither builds nor breaks back-to-back.

Not included: 180° rotation (not in the guideline, though TETR.IO and Jstris have it), garbage, and configurable DAS/ARR.

## Tests

The rules are a pure state machine with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd tetris && node --test
```

## Layout

```
index.html        canvas, HUD, mode picker, key reference
styles.css        layout (colour tokens and base styles are in ../shared/theme.css)
src/
  config.js       board size, timings, scoring table, colours, mode presets
  pieces.js       the seven tetrominoes and the SRS kick tables
  game.js         pure rules: createGame, start, shift, rotate, hardDrop, holdPiece, advanceClock
  renderer.js     draws a state onto a canvas context
  input.js        keyboard → intents, with DAS/ARR auto-repeat
  storage.js      per-mode personal bests, tolerant of blocked localStorage
  main.js         wiring and the animation loop
  *.test.js       node --test coverage of pieces.js and game.js
```

## Implementation notes

- **The kick tables are transcribed exactly as published** (y pointing up) and flipped into board coordinates once, in code. That keeps them checkable line by line against the SRS reference instead of against a hand-converted copy.
- **Rotations are generated, not typed.** Each piece's spawn shape is rotated about the centre of its bounding box, which gives exactly SRS's four states, including I's off-centre ones.
- **DAS and ARR run on the game's own timers.** OS key repeat is ignored entirely, since it is slow, varies by machine and cannot be tuned. The most recently pressed direction wins while both are held. Auto-repeat keeps charging through the countdown, so a direction held through READY is already charged at GO. Keys are released on window blur, or a key let go in another window would leave the piece sliding.
- **Gravity steps row by row.** At level 15 several rows fall in one frame, and the loop takes each row separately, so a fast piece lands on the first thing below it instead of skipping past it.
- **The lock timer only runs on the ground, and is never cleared by leaving it.** Otherwise, once its resets were spent, a piece could be kicked up and dropped back forever.
- **One clock, passed in.** `advanceClock(state, dt)` drives the countdown, gravity, lock delay and the Sprint timer. Tests pass explicit deltas instead of faking time, and pausing is just not calling it.
- **Popups and line flashes run on wall time, not game time**, so the clear that finishes a round still fades out after the game clock has stopped.
- **Paused hides the stack**, so a pause is not free thinking time in Sprint.
- **Storage never throws.** Every `localStorage` access has an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5.5 (Claude Code) |
| Approach | Plan agreed first (multi-game site, separate pages, modern rules, Marathon + Sprint), then implemented |
| Dependencies | None |
| Tests | 40, via `node --test` |
