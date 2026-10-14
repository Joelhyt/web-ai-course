Web ai project. Comparing different models, tools and workflows

The same brief, a set of classic browser games, built twice with different AI tools. A landing page lets you pick which version to play.

| | Claude version | Copilot version |
|---|---|---|
| Folder | [`claude/`](claude/) | [`copilot/`](copilot/) |
| Built with | Claude Code (Claude Opus 5, Sonnet 5, Opus 5.5) | GitHub Copilot |
| Author | Joel Hyttinen | Teemu Keskinen ([TeemuKeskinen/tekoaly](https://github.com/TeemuKeskinen/tekoaly)) |
| Stack | Vanilla JavaScript and canvas, no build step | TypeScript, Vite, Vitest |
| Games | Snake, Tetris, Pac-Man, Lunar Lander | Snake, Tetris, Pac-Man |

## Layout

```
index.html, landing.css       the landing page: choose a version
claude/                       the Claude version (see claude/README.md)
copilot/                      the Copilot version (see copilot/README.md)
scripts/build-site.sh         builds everything into _site/
.github/workflows/pages.yml   tests, builds and deploys to GitHub Pages
```

`copilot/` was added with `git subtree`, so it keeps the original commits. To pull in later changes from the Copilot repo:

```bash
git subtree pull --prefix=copilot https://github.com/TeemuKeskinen/tekoaly main
```

## Building and previewing

The Copilot version needs a build step, so preview the combined site from `_site/`:

```bash
scripts/build-site.sh                  # needs Node.js 20+ and rsync
python3 -m http.server 8000 -d _site   # then open http://localhost:8000
```

Each version can also be run on its own: see `claude/README.md` and `copilot/README.md`.

## Deployment

Every push to `main` runs `.github/workflows/pages.yml`:

1. The Claude version's tests (`node --test` for each game). A failure stops the deploy.
2. `scripts/build-site.sh`.
3. The Copilot version's tests. These are reported but don't block the deploy, because the upstream project currently has four failing tests of its own.
4. Publishes `_site/` to GitHub Pages.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
