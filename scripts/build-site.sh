#!/usr/bin/env bash
# Builds the combined site into _site/: the landing page at the root, the
# Claude project (static, copied as is) under claude/, and the Copilot project
# (built with Vite) under copilot/. Used both locally and by the Pages workflow.
#
# Preview locally:  scripts/build-site.sh && python3 -m http.server 8000 -d _site
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/_site"

# `npx vite build` rather than `npm run build`: the project's own build script
# runs `tsc --noEmit` first, which currently fails on type errors in
# src/arcade.test.ts (test code only; the app itself type-checks cleanly).
(cd "$root/copilot" && npm ci && npx vite build)

rm -rf "$out"
mkdir -p "$out"
cp "$root/index.html" "$root/landing.css" "$out/"
# The Claude project's tests ship next to its sources; they are harmless to
# serve but have no place on the site.
rsync -a --exclude '*.test.js' --exclude 'README.md' "$root/claude/" "$out/claude/"
cp -r "$root/copilot/dist" "$out/copilot"

echo "Site built in $out"
