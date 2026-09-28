# Browser Arcade: Snake + Tetris

This project is a two-game browser arcade with a launcher and hosted game views.

- **Snake**: complete and playable with Classic + Time Attack modes.
- **Tetris**: playable modern core with hold, next-piece preview, pause, and local best score.
- Arcade flow: the home view shows game cards. Selecting a card starts a fresh run. Returning home ends the active run.

## Requirements

- Node.js 20+
- npm 10+

## Scripts

- `npm install` — install dependencies
- `npm run dev` — start local development server
- `npm run lint` — run TypeScript checks
- `npm run test:unit` — run game-domain and storage unit tests
- `npm run test:e2e` — run browser-style interaction tests (jsdom)
- `npm run test` — run all tests
- `npm run build` — create production bundle in `dist/`
- `npm run preview` — preview production build locally

## Browser support

The app uses stable web APIs (Canvas 2D, keyboard events, CSS layout, and `localStorage`) and is intended to run in current versions of:

- Chrome
- Edge
- Firefox
- Safari

## Snake

### Controls

- Arrow keys or `W`, `A`, `S`, `D` to move
- `R` to restart after game over
- Mode and wall selectors are available between rounds
- Power-up legend on board: `S` (Slow), `G` (Ghost), `M` (Magnet), `F` (Feast)

### Rules (current behavior)

- **Solid** walls: wall collision ends the round
- **Wrap around** walls: crossing an edge wraps to the opposite side
- Best score is tracked per **game mode + wall mode**
- Board power-ups expire after 50 movement steps if not collected
- Power-up effects last 40 movement steps
- **Slow**: movement interval × `1.5`
- **Ghost**: self-collision is ignored; snake gets a purple outline
- **Magnet**: normal food and Feast gold foods each move one legal cell toward the snake head per movement step
- **Feast**: keeps 3 temporary gold foods active; they are removed when Feast ends

#### Classic mode

- Speed increases every 5 points
- Tick interval decreases by 10 ms per threshold (minimum 60 ms)
- Power-ups spawn only after food collection (25% chance)
- Only one board power-up at a time
- Only one active power-up effect at a time

#### Time Attack mode

- 60-second round; reaching 0 ends the round
- Collisions can still end the round early
- Uncapped speed curve: `120 * 0.93^floor(score / 5)` ms
- Power-up spawn chance is 50%
- Up to 4 board power-ups can exist at once
- Multiple effect types can be active at once
- Re-collecting an active type extends that type by +40 steps

### Snake persistence scope

- Best score is saved locally per **game mode + wall mode**.
- Snake storage is separate from Tetris storage.

## Tetris (modern core)

### Controls

- `Left` / `Right`: move
- `Down`: soft drop
- `Up` or `X`: rotate clockwise
- `Space`: hard drop
- `C`: hold
- `P`: pause/resume
- `R`: restart after game over

### Rules and scoring (implemented)

- Board size: **10×20**
- Piece generator: **7-bag randomizer**
- Rotation system: **clockwise SRS kicks**
- **Next-piece preview** is shown
- **Hold** is allowed once per active piece drop
- Line clear scoring: single/double/triple/tetris = `100/300/500/800 × level`
- Level increases every 10 cleared lines
- Gravity increases with level and bottoms out at a fixed minimum interval
- Pause/resume state is available in active rounds

### Tetris persistence scope

- Tetris best score is saved locally under its own key.
- Tetris storage is independent from Snake best-score entries.
