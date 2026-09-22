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
- Wall mode selector (Solid / Wrap around) is available between rounds

## Browser support

The app uses stable web APIs (Canvas 2D, keyboard events, CSS layout, and `localStorage`) and is intended to run in current versions of:

- Chrome
- Edge
- Firefox
- Safari

## Gameplay rules

- Snake starts at standard speed and gets faster every 5 points
- Speed increases by reducing move interval by 10 ms per threshold, down to a 60 ms minimum
- **Solid** mode: hitting a wall ends the round
- **Wrap around** mode: crossing an edge moves the snake to the opposite side
- Best score is tracked separately for each wall mode
