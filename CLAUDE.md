# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris. HTML5 Canvas + CSS. Zero dependencies, no `package.json`, no build/lint/test tooling. Three files: `index.html`, `style.css`, `game.js`.

## Run

Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

No build step. Edit `game.js` and reload the browser.

## Architecture (`game.js`, single IIFE-free global scope, `'use strict'`)

- **Board model**: `board` is a `ROWS × COLS` matrix (20×10). Each cell holds `0` (empty) or a color index `1–7`. Index maps into both `COLORS` and `PIECES` — they are 1-indexed with a leading `null` so piece type doubles as color.
- **Pieces**: square matrices in `PIECES`. Rotation = transpose + row-reverse (`rotateCW`), pure function returning a new matrix.
- **Rendering**: `draw()` runs every `requestAnimationFrame` tick, redrawing grid + locked board + ghost + current piece. Second canvas (`nextCanvas`) shows preview via `drawNext()`. `drawBlock` is shared by both canvases (takes a context + cell size arg).
- **Game loop** (`loop`): time-accumulator pattern — `dropAccum += dt`, drops one row when `dropAccum >= dropInterval`. Pause cancels the rAF and restarts it on resume.
- **Lifecycle**: `init()` (also the restart handler) resets all state globals and starts the loop. `spawn()` promotes `next` to `current`; if the fresh piece collides on spawn, `endGame()`.

## Key invariants / gotchas

- `COLS`, `ROWS`, `BLOCK` in `game.js` must match `<canvas id="board">` `width`/`height` in `index.html` (`width = COLS×BLOCK`, `height = ROWS×BLOCK`). Change both.
- Scoring: `LINE_SCORES` `[0,100,300,500,800]` × level; hard drop +2/cell, soft drop +1/row.
- Level rises every 10 lines; speed = `max(100, 1000 − (level−1)×90)` ms.
- Wall kicks (`tryRotate`): tries offsets `[0,-1,1,-2,2]` before rejecting a rotation.
- UI strings are Spanish ("PAUSA", "Puntuación", "Reiniciar"); keep locale consistent when editing.
