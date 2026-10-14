# Claude version

The games built with Claude Code. See the [repository README](../README.md) for the combined site.

## Running it

Every game is a static page with no build step. Serve this folder and open the game picker:

```bash
cd claude && python3 -m http.server 8000   # then open http://localhost:8000
```

The pages share `shared/theme.css`, so serve this folder rather than a single game's folder.

## Games

- [`snake/`](snake/): classic Snake with power-ups, Time attack and an Adventure dungeon mode.
- [`tetris/`](tetris/): modern guideline Tetris (SRS, 7-bag, hold, T-spins) with Marathon and Sprint 40L.
- [`pacman/`](pacman/): arcade-accurate Pac-Man: the original maze, ghost AI, speeds, timers and fruit.
- [`lander/`](lander/): arcade-style Lunar Lander: generated terrain, multiplier pads, fuel as lives.

Each game is self-contained in its own folder (`index.html`, `styles.css`, `src/`, tests) and follows the same shape. Pure rules live in `game.js` with no DOM access, so `node --test` covers them. Rendering, input, storage and the loop sit around them.

## Layout

```
index.html, hub.css, hub.js   the game picker, showing each game's personal bests
shared/theme.css              colour tokens and base styles shared by every page
snake/                        Snake
tetris/                       Tetris
pacman/                       Pac-Man
lander/                       Lunar Lander
```

To add a game, give it its own folder and a card in `index.html`. If it stores personal bests, add their `localStorage` keys to the card with `data-best`.
