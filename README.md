# Meta-Miner

Still a work in progress - need better pictures for characters, Final Boss needs work, and final "zone" could use a little more inspiration!

A vibe-coded spiritual successor to *Motherload* (XGen Studios, 2004) — the same
dig-sell-refuel-upgrade loop that made the classic great, rebuilt from scratch with
modernized, higher-fidelity graphics and many new systems of its own. All code,
artwork (procedurally drawn on canvas), and writing are original.

*Not affiliated with or endorsed by XGen Studios.*

## Play

No build step, no dependencies. Either:

- **Double-click `index.html`** — runs straight from disk in any modern browser, or
- Serve the folder (`python -m http.server`) and open `http://localhost:8000`.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Fly (up = thrust) and drill down / left / right |
| Mouse | Aim the dome flashlight |
| Hold click | Fire the Microwave Cannon (unlocked at -3,000 ft) |
| E / Enter | Interact with surface buildings |
| Esc | Pause / close menus |

Dig for minerals, return to the surface to sell them, buy fuel, upgrades, and
supplies — and dig deeper. Something is waiting at the bottom.

## Tech

Plain HTML5 Canvas + JavaScript. No frameworks — every sprite is drawn in code
with gradients, dynamic lighting, and particles, and all sound effects are
synthesized live with WebAudio.

## Music credit

- "Airglow" by [Stellardrone](https://stellardrone.bandcamp.com/) — from the album
  *Light Years*, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- "Chaos Theory" by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/album/white-bat-60) —
  from the album *White Bat 60*; plays during security-automaton fights.
