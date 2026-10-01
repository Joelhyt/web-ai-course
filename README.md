Web ai project. Comparing different models, tools and workflows

## Running it

Every game is a static page with no build step. Serve the repository root and open the game picker:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

The pages share `shared/theme.css`, so serve the root rather than a single game's folder.

## Games

- [`snake/`](snake/): classic Snake with power-ups, Time attack and an Adventure dungeon mode.
- [`tetris/`](tetris/): modern guideline Tetris (SRS, 7-bag, hold, T-spins) with Marathon and Sprint 40L.

Each game is self-contained in its own folder (`index.html`, `styles.css`, `src/`, tests) and follows the same shape. Pure rules live in `game.js` with no DOM access, so `node --test` covers them. Rendering, input, storage and the loop sit around them.

## Layout

```
index.html, hub.css, hub.js   the game picker, showing each game's personal bests
shared/theme.css              colour tokens and base styles shared by every page
snake/                        Snake
tetris/                       Tetris
```

To add a game, give it its own folder and a card in `index.html`. If it stores personal bests, add their `localStorage` keys to the card with `data-best`.
