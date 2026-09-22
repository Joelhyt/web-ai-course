# Snake (Classic Browser Game)

Classic Snake implemented as a static web app using TypeScript and Canvas 2D.

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

## Controls

- Arrow keys or `W`, `A`, `S`, `D` to move
- `R` to restart after game over
- Restart button appears when the game ends
- Game mode selector (Classic / Time Attack) is available between rounds
- Wall mode selector (Solid / Wrap around) is available between rounds
- Power-up legend on board: `S` (Slow), `G` (Ghost), `M` (Magnet), `F` (Feast)

## Browser support

The app uses stable web APIs (Canvas 2D, keyboard events, CSS layout, and `localStorage`) and is intended to run in current versions of:

- Chrome
- Edge
- Firefox
- Safari

## Gameplay rules

### Shared

- **Solid** walls: hitting a wall ends the round
- **Wrap around** walls: crossing an edge moves the snake to the opposite side
- Best score is tracked separately per **game mode + wall mode**
- Board power-ups expire after 50 movement steps if not collected
- Power-up effects last 40 movement steps
- Power-up effects:
  - **Slow**: movement interval is multiplied by `1.5`
  - **Ghost**: snake can pass through its own body and is shown with a purple outline while active
  - **Magnet**: normal food and Feast gold foods each move one legal cell toward the snake head each movement step
  - **Feast**: spawns and maintains 3 temporary gold foods while active; gold foods are removed when Feast ends

### Classic mode

- Snake starts at standard speed and gets faster every 5 points
- Speed increases by reducing move interval by 10 ms per threshold, down to a 60 ms minimum
- Power-ups appear only after collecting food:
  - 25% spawn chance
  - one board power-up at a time
- Only one active power-up effect can exist at once; no new power-up spawns while an effect is active

### Time Attack mode

- Round lasts 60 seconds; when time hits 0, the round ends
- Collisions can still end the round early
- Snake speed is uncapped and follows an exponential curve: `120 * 0.93^floor(score / 5)` ms
- Power-up spawn chance is doubled to 50%
- Up to 4 board power-ups can exist simultaneously
- Multiple effect types can be active at the same time
- Collecting a power-up of a type that is already active extends that type by +40 steps
