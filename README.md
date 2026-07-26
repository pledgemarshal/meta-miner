# Motherload Remake

A faithful fan remake of the classic 2004 mining game — same controls, same gameplay
loop, same progression and boss — rebuilt from scratch with modernized, higher-fidelity
graphics. All code, artwork (procedurally drawn on canvas), and text are original.

## Play

No build step, no dependencies. Either:

- **Double-click `index.html`** — runs straight from disk in any modern browser, or
- Serve the folder (`python -m http.server`) and open `http://localhost:8000`.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Fly (up = thrust) and drill down / left / right |
| E / Enter | Interact with surface buildings |
| Esc | Pause / close menus |

Dig for minerals, return to the surface to sell them, buy fuel, upgrades, and
supplies — and dig deeper. Something is waiting at the bottom.

## Tech

Plain HTML5 Canvas + JavaScript. No frameworks, no assets — every sprite is drawn
in code with gradients, dynamic lighting, and particles.
