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

Wall behaviour is switchable below the board in Classic and Time attack: **solid** ends the round on contact, **wrap** carries the snake through to the opposite side. Changing it starts a fresh round.

## Modes

| Mode | |
|---|---|
| **Classic** | Open-ended. The round lasts until you crash or clear the board. |
| **Time attack** | 60 seconds to score as high as you can. A drain bar across the top of the board shows what is left, the HUD clock switches to tenths and turns red over the final ten seconds, and the round ends on `TIME'S UP` rather than on a crash — though crashing still ends it early. |

| **Adventure** | A descent through a generated dungeon. See below. |

The modes keep **separate high scores**: a 60 second sprint and an open-ended round are not comparable numbers. Switching mode starts a fresh round. The clock is wall-clock time and stops with the game, so pausing or backgrounding the tab does not eat into it.

The snake speeds up as it grows, and the best score is kept in `localStorage`.

## Adventure

Adventure keeps the snake and throws out the objective. There is no endless field of food: each floor is a **procedurally generated dungeon** of rooms and wide corridors, holding a handful of **shards** and one **portal**. Take every shard on the floor and the portal unlocks; slip through it and you descend to a fresh floor, one deeper. There is no win condition — the run ends when you crash, and the score is how far down you got.

**The floor is much bigger than the screen.** The world is 60x45 tiles and the window onto it is 24x24, so the board scrolls: the camera keeps the snake centred and only drifts off-centre at the edges of the world, where chasing the head further would just scroll rock into view. Because a floor no longer fits on screen, three things navigate for you — a corner **map** of the whole floor with the current window outlined on it, **chevrons** pinned to the edge of the view pointing at off-screen shards and the portal, and a rule that collectibles only ever spawn within sight of the snake. An eight second power-up two screens away is a rumour, not an opportunity.

- **Most passages are two tiles wide.** A one-wide corridor is a commitment the snake cannot turn around in, and a floor made of them is punishing rather than tense — but a few are the tense stretch of a floor, and a bad place to meet a worm. Corridors are carved with a 2x2 brush, a quarter of them as single-tile cracks instead, which works out at around 7% of the open floor. Two tests hold that line: no open tile anywhere may have fewer than two open neighbours (no dead ends, ever), and the share of single-tile passage has to stay under a fifth of the floor.
- **The floors are generated, not authored.** `src/dungeon.js` places non-overlapping rooms, then joins each to the previous one with an L-shaped corridor, so a floor is connected *by construction* rather than generated-and-retried. The corridor's corner order is random — always turning the same way makes every floor read like the same floor.
- **The snake starts in the widest room**, heading right with at least two tiles of runway. A floor that opens with the head one square from a wall is not a fair start.
- **Shards are worth a point and two segments each**, paid out over the following moves rather than all at once. They are scattered at a distance that scales with the world, with the portal in the room furthest from you, so clearing a floor always means crossing it.
- **Descending resets the snake, not the pace.** You squeeze through the portal at three segments again, but the speed carries over and deeper floors have more rooms and more shards. Pace comes from the *depth*, not the score: a floor pays out in lumps, and a score-driven snake would lurch faster every time you picked a shard up.
- **Arriving on a floor is slowed down.** You cannot see what is around you the moment you land, and at depth 12 the normal pace means dying to a wall you never had a chance to read. The snake arrives at a crawl under a `DEPTH n` banner and winds back up to full speed over 2.2 seconds — the interval multiplier decays to 1 rather than switching off, so there is no jolt at the end of it. Nothing surfaces during the grace either; the floor gets to be quiet while you work out where you are.

- **Rock is rock.** Ghost makes the snake insubstantial to itself, not to the dungeon — a wall-phasing snake would make every floor's layout irrelevant. Magnet drags shards, but the pull is blocked by rock, so it gathers a room up without hauling the objective to you through the corridors. The wall-mode control steps aside in Adventure; the dungeon decides.
- **The visuals invert the usual board.** The floor is painted light and the rock dark, with a lit face on every wall that has a room above it, so space reads as carved out of the mass. Seams are drawn on open tiles only — running the grid across the rock as well made the first attempt look like graph paper with blobs on it. Shards are spinning diamonds; the portal is three grey rings with a keyhole bar until the last shard drops, then it turns green and starts pulling its rings inward.

### Enemies

From **depth 3** the floors are inhabited. There are two, and they are deliberately different kinds of problem:

| | |
|---|---|
| **Sleeper** | Coiled on the floor when you arrive, dim and visibly asleep. It wakes only if you come within six tiles, then hunts for eleven seconds and fades. It is part of the level: you can see one from across a room and decide to go around it. |
| **Crawler** | Surfaces somewhere on the floor mid-run and comes for you. It spends a motionless moment surfacing first, hunts for sixteen seconds, then fades out. At most one at depth 3, two at 6, three from 9. |

Three guarantees make them fair rather than frustrating, and each is enforced by a test:

1. **Nothing ever moves faster than the snake.** Their pace is a multiple (1.55x) of the snake's *current* interval — not a fixed speed — so it holds whether you are racing at depth 20 or crawling under a Slow. Tying it to the current interval also means Slow can never turn into a trap by making a worm relatively faster.
2. **Nothing appears next to you, and nothing attacks the moment it appears.** Crawlers surface at least 14 tiles away and are harmless while they do it — dashing past a surfacing worm is meant to work. Sleepers are on the map before you enter the room, and are never placed within waking distance of the portal you are forced to walk onto.
3. **Nothing is permanent.** Every hunt is on a timer and spends its last 2.5 seconds visibly fading out.

They hunt with a breadth-first search through the floor rather than a greedy step toward you: a greedy chaser wedges itself against the first wall between you and it, which reads as a broken enemy rather than a beatable one. The search is capped so a hunt across a large floor stays cheap, and an enemy that cannot reach you simply stops.

**Ghost phases you through worms** as well as through yourself — never through rock. Being hunted is exactly when the power-up should be worth finding. Hunting enemies also get an edge chevron and a dot on the minimap, so a worm closing in from off screen is something you are told about rather than something that happens to you.

Generation is covered by `dungeon.test.js`, which flood-fills 250 seeded floors per property to prove that every shard and the portal is actually reachable, that nothing starts inside rock, that no passage is one tile wide, and that the border never has a hole in it. Seeded rng means a failing floor is reproducible from the seed in the assertion message.

## Power-ups

Four collectibles take turns appearing on a random free square. One is on the board at a time, it lasts eight seconds before fading (blinking for the last two), and there is a four second cooldown before the next one rolls — including at the start of a round, so nothing lands in the snake's lap. The spawn roll is scaled by elapsed time rather than taken per move, so collectibles appear at the same rate no matter how fast the snake is going. Drive the head over one to pick it up; an active effect is shown as a chip under the board with a draining timer, and as a coloured frame around the board itself.

| | Power-up | Effect |
|---|---|---|
| Cyan hourglass | **Slow** | The tick interval is multiplied by `slowFactor` (1.9x) for 6 seconds. It scales the score-derived speed rather than replacing it, so it is worth the same relief late in a round as it is early. |
| Violet ghost | **Ghost** | Self-collision is switched off for 5 seconds and the snake is drawn translucent with a dashed outline — the transparency *is* the rule. Walls still apply. |
| Amber magnet | **Magnet** | For 6 seconds every food item is dragged one square toward the head, on every other *move*, along its longer axis. A dotted tether shows the pull. |
| Rose cluster | **Feast** | For 6.5 seconds the board carries `feastMultiplier` (4) food items instead of one. The three extras are on loan: they are drawn smaller inside a dashed ring, blink over the effect's last ticks, and **any that are not eaten vanish when it ends**. |

Every duration is **wall-clock milliseconds, spent by `advanceClock` and never by `tick`**. A power-up collected by a long, fast snake therefore lasts exactly as long as one collected in the opening seconds — counting durations in ticks instead makes every effect quietly shorter as the round speeds up, which is precisely when the player needs it most. Magnet's *cadence* is the one thing still measured in moves, because half the snake's speed is what it means for food to be catchable. Nothing ages while the game is paused or on the ready screen. Two restrictions keep Magnet from being degenerate: the food never steps onto the snake, and it holds still once it is adjacent to the head — otherwise it would flee ahead of a snake travelling away from it and could never be caught. Re-collecting a running effect refreshes it instead of stacking, so the HUD countdown always means what it says.

Feast's crumbs score and grow the snake exactly like ordinary food — including the speed-up per point — so the power-up trades difficulty for score rather than handing one out. They never spawn on the snake, the food or the collectible, and they bow out entirely when the board is down to its last few squares rather than crowding the room the player needs to manoeuvre in. Only the *ordinary* food counts toward the win: a cleared board still means the real food has nowhere left to go.

Shape, not just colour, distinguishes them on the board — colour alone is unreadable for the roughly 8% of players with a colour vision deficiency.

## Tests

The game rules are a pure state machine with no DOM references, so Node's built-in test runner covers them with nothing installed:

```bash
cd snake && node --test
```

## Layout

```
index.html      canvas, HUD, power-up legend, mode and wall controls
styles.css      layout and theme
src/
  config.js     grid size, timing, colours, power-up table and mode presets
  game.js       pure rules: createGame, tick, advanceClock, queueDirection, spawns
  dungeon.js    Adventure's floor generator: rooms, corridors, shards, portal
  dungeon.test.js  node --test coverage of the generated floors
  enemies.js    Adventure's sleepers and crawlers: pathing, timers, fairness rules
  enemies.test.js  node --test coverage of the enemies
  game.test.js  node --test coverage of the rules
  renderer.js   draws a state onto a canvas context
  input.js      keyboard → intents
  storage.js    per-mode high scores, tolerant of blocked localStorage
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
- **The camera is smoothed on the real frame delta** (`1 - exp(-dt / 70)`), not on a fixed fraction per frame, so the scroll feels identical at 60Hz and 144Hz. It draws on whole pixels: a camera parked on a fraction of a tile blurs every wall edge and makes the floor seams shimmer as it moves.
- **Two clocks, deliberately.** `tick(state)` advances the snake; `advanceClock(state, dt)` advances everything measured in real time — effect timers, the collectible's lifetime and spawn roll, the time attack countdown. Keeping them separate is what makes power-up duration independent of snake speed, and it keeps both testable from plain Node by passing an explicit delta rather than faking a clock. The loop re-reads `effectiveInterval(state)` inside the catch-up loop, since Slow can start or end on any tick.
- **A collectible in the last free square cannot fake a win.** Food avoids the power-up and Feast's crumbs when there is room to, and relaxes those constraints one at a time otherwise, so "no free squares" still means exactly that.
- **Feast's food is on loan.** The extras live in `state.bonusFood` and are cleared the tick the effect hits zero, so an uneaten crumb can never outlive the power-up that put it there.
- **Storage never throws** — `localStorage` is unavailable in Safari private mode and under some privacy settings, so every access is guarded with an in-memory fallback.

## Comparison notes

| | |
|---|---|
| Model | Claude Opus 5 (Claude Code) |
| Approach | Plan mode: requirements clarified up front, then implemented from an approved plan |
| Dependencies | None |
| Tests | 80, via `node --test` |
