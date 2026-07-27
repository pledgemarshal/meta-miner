// Game orchestration: loop, states, input, camera, rendering, saving.

const Game = {
  canvas: null,
  ctx: null,
  state: 'title',        // title | play | dialog | dead | victory
  prevState: null,
  cam: { x: 0, y: 0 },
  score: 0,
  time: 0,
  shakeT: 0,
  shakeMag: 0,
  hurtFlash: 0,
  fuelWarnT: 0,          // "FUEL LOW!" banner timer
  _prevFuelFrac: 1,
  rockWarnT: 0,          // "ROCK DENSE!" banner timer
  _maxBand: 0,           // deepest soil band announced this run
  ghost: null,           // at most one spectral visitor at a time
  ghostStage: 0,         // 0: none yet, 1: met at -500 ft, 2: met at -1,000 ft (random after)
  // Depth gimmicks
  alertMsg: '', alertT: 0, alertColor: '#e8b06a',   // generic event banner
  magnetActive: false,   // pod inside a magnetite field → controls inverted
  _magnetIntro: false,
  armedNukes: [],        // ticking warheads: { x, y, t, beepT }
  nukeFlash: 0,
  worm: null,            // the burrowing horror below -5,000 ft
  wormIntroSeen: false,
  popups: [],            // floating "+$" texts
  input: { up: false, down: false, left: false, right: false },
  stars: [],
  deathCause: null,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    UI.init();
    this.mouse = { x: C.VIEW_W * 0.5, y: C.VIEW_H * 0.4 };
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
    });
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resize(), 150);
    });
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.4 + 0.4, tw: Math.random() * 6 });
    }
    this.bindInput();
    this.newWorld((Math.random() * 1e9) | 0);
    Player.reset();
    Boss.reset();
    this.state = 'title';

    let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  newWorld(seed) { World.init(seed); },

  // Fill the whole window; scale tiles with screen height and re-render textures crisp
  resize() {
    const w = Math.max(640, window.innerWidth);
    const h = Math.max(480, window.innerHeight);
    C.VIEW_W = w;
    C.VIEW_H = h;
    C.TILE = Math.max(36, Math.round(h / 10.6));   // ~25% closer zoom
    C.TEX = Math.min(256, C.TILE * 2);
    this.canvas.width = w;
    this.canvas.height = h;
    this._caveA = this._caveB = this._lightC = this._steamA = null;   // offscreen layers must match the viewport
    Sprites.init();
  },

  // --- Input ---
  bindInput() {
    const keymap = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
    };
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      Audio.resume();

      if (this.state === 'title') {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') this.startFromTitle();
        return;
      }
      if (this.state === 'dead') {
        if (e.code === 'Enter' || e.code === 'KeyE') this.respawn();
        return;
      }
      if (this.state === 'victory') {
        if (e.code === 'Enter' || e.code === 'KeyE') this.finishVictory();
        return;
      }
      if (this.state === 'dialog') {
        if (['Enter', 'KeyE', 'Escape', 'Space'].includes(e.code)) UI.close();
        return;
      }

      if (keymap[e.code]) { this.input[keymap[e.code]] = true; e.preventDefault(); return; }

      switch (e.code) {
        case 'KeyE': case 'Enter': {
          if (UI.isOpen()) { UI.close(); break; }
          const b = Shops.current();
          if (b) Shops.open(b);
          break;
        }
        case 'Escape':
          if (UI.isOpen()) UI.close();
          break;
        case 'KeyF': Player.useItem('fuelTank'); break;
        case 'KeyR': Player.useItem('nanobots'); break;
        case 'KeyX': Player.useItem('dynamite'); break;
        case 'KeyC': Player.useItem('plastic'); break;
        case 'KeyQ': Player.useItem('teleporter'); break;
        case 'KeyM': Player.useItem('transmitter'); break;
        case 'KeyN': UI.toast(Audio.toggleMute() ? 'Sound muted' : 'Sound on'); break;
      }
    });
    window.addEventListener('keyup', e => {
      const keymap = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
      };
      if (keymap[e.code]) this.input[keymap[e.code]] = false;
    });
    window.addEventListener('blur', () => {
      this.input.up = this.input.down = this.input.left = this.input.right = false;
    });
  },

  startFromTitle() {
    const save = this.loadSaveData();
    if (save) {
      this.applySave(save);
      UI.toast('Save loaded');
    } else {
      Player.reset();
      Story.seen = {};
      Boss.reset();
      this.score = 0;
      this.ghost = null;
      this.ghostStage = 0;
      this.popups.length = 0;
      this.resetGimmicks();
    }
    this.state = 'play';
  },

  // --- State helpers ---
  pauseForDialog() { this.prevState = this.state; this.state = 'dialog'; },
  resumeFromDialog() { this.state = 'play'; },
  inHell() { return Player.y > C.GROUND_BOTTOM_ROW; },
  bossActive() { return Boss.bossActiveNearPlayer(); },
  overBuildingPad() { return false; },

  flashHurt() { this.hurtFlash = 0.25; },
  shake(mag) { this.shakeT = Math.max(this.shakeT, 0.35); this.shakeMag = Math.max(this.shakeMag, mag); },
  toast(msg) { UI.toast(msg); },

  popup(x, y, text, color) {
    this.popups.push({ x, y, text, color: color || '#7dffb0', age: 0, life: 1.3 });
  },

  // --- Ghosts: rarer up top, common down deep; one at a time ---
  updateGhost(dt) {
    const depth = Player.depthFeet();
    if (!this.ghost) {
      if (Player.dead || this.bossActive() || this.inHell()) return;
      // Scripted introductions: the first ghost appears at -500 ft, the second
      // at -1,000 ft. Only after both does the depth-scaled haunting begin.
      if (this.ghostStage === 0) {
        if (depth >= 500) { this.spawnGhost(); this.ghostStage = 1; }
        return;
      }
      if (this.ghostStage === 1) {
        if (depth >= 1000) { this.spawnGhost(); this.ghostStage = 2; }
        return;
      }
      // Spawn chance per second grows with depth
      const p = Math.pow(Math.min(1, depth / 7300), 1.2) * 0.035;
      if (Math.random() < p * dt) this.spawnGhost();
      return;
    }
    const g = this.ghost;
    g.age += dt;

    if (g.fading > 0) {
      g.fading -= dt;
      if (g.fading <= 0) this.ghost = null;
      return;
    }

    // Slow pursuit with a spectral wobble (ghosts ignore walls).
    // The tomb guardian is twice as fast and hungrier.
    const spd = g.cursed ? 2.6 : 1.3;
    const dx = Player.x - g.x, dy = Player.y - g.y;
    const dist = Math.hypot(dx, dy) || 1;
    g.x += (dx / dist) * spd * dt + Math.sin(g.age * 2.1 + g.seed) * 0.4 * dt;
    g.y += (dy / dist) * spd * dt + Math.cos(g.age * 1.7 + g.seed) * 0.35 * dt;

    // Contact: siphons 20% of the pod's fuel (30% for the guardian)
    if (dist < 0.85 && !Player.dead && Player.teleporting <= 0) {
      const lost = Player.fuel * (g.cursed ? 0.3 : 0.2);
      Player.fuel -= lost;
      this.flashHurt();
      Audio.play('ghostHit');
      this.popup(Player.x, Player.y - 0.8, '-' + lost.toFixed(1) + ' L', '#a0c8ff');
      this.toast(g.cursed ? 'The tomb guardian drains your fuel!' : 'A ghost siphoned your fuel!');
      g.fading = 0.5;
      return;
    }

    // Flashlight burns the ghost: 3 cumulative seconds of light destroys it
    const px = (Player.x - this.cam.x) * C.TILE;
    const py = (Player.y - this.cam.y) * C.TILE - C.TILE * 0.4;
    const gx = (g.x - this.cam.x) * C.TILE;
    const gy = (g.y - this.cam.y) * C.TILE;
    const ang = Math.atan2(gy - py, gx - px);
    let diff = Math.abs(ang - (this._aim || 0));
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const distPx = Math.hypot(gx - px, gy - py);
    g.lit = diff < 0.3 && distPx < C.TILE * 7 && !Player.dead;
    if (g.lit) {
      g.exposure += dt;
      // Embers rising off the burning spectre
      if (Math.random() < dt * (14 + 30 * Math.min(1, g.exposure / 3))) {
        Particles.spawn({
          x: g.x + (Math.random() - 0.5) * 0.55,
          y: g.y + (Math.random() - 0.5) * 0.55,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -1.5 - Math.random() * 1.8,
          life: 0.5, size: 0.09,
          color: Math.random() < 0.5 ? '#ff9a3c' : '#ffd97a',
          glow: true,
        });
      }
      if (Math.random() < dt * 6) Audio.play('crackle');
      if (g.exposure >= 3) {
        Audio.play('shriek');
        const bonus = Player.fuelCap() * 0.1;
        Player.fuel = Math.min(Player.fuelCap(), Player.fuel + bonus);
        this.popup(g.x, g.y - 0.5, '+' + bonus.toFixed(1) + ' L', '#7de0ff');
        this.toast('Ghost burned away by your flashlight!');
        Particles.burst(g.x, g.y, 22, { color: '#ff9a3c', speed: 6, life: 0.6, size: 0.12, glow: true });
        Particles.burst(g.x, g.y, 12, { color: '#cfe8ff', speed: 4, life: 0.8, size: 0.09, glow: true });
        g.fading = 0.5;
      }
    }
  },

  spawnGhost(opts) {
    const cursed = !!(opts && opts.cursed);
    const a = Math.random() * Math.PI * 2;
    const r = cursed ? 7 : 12 + Math.random() * 3;    // the guardian rises close by
    this.ghost = {
      x: Math.max(1.5, Math.min(C.WORLD_W - 1.5, Player.x + Math.cos(a) * r)),
      y: Math.max(1, Math.min(C.GROUND_BOTTOM_ROW - 2, Player.y + Math.sin(a) * r)),
      age: 0,
      seed: Math.random() * 10,
      exposure: 0,
      fading: 0,
      cursed,
    };
    if (!cursed) Audio.play('moan');
  },

  // Event banner in the style of FUEL LOW / ROCK DENSE
  warn(msg, color) {
    this.alertMsg = msg;
    this.alertColor = color || '#e8b06a';
    this.alertT = 3.5;
  },

  resetGimmicks() {
    this.magnetActive = false;
    this._magnetIntro = false;
    this.armedNukes = [];
    this.nukeFlash = 0;
    this.worm = null;
    this.wormIntroSeen = false;
    this.alertT = 0;
  },

  // --- Magnetite: standing inside a lodestone's field inverts the controls ---
  updateMagnet(dt) {
    const R = C.MAGNETITE.radius;
    let near = false;
    const x0 = Math.floor(Player.x - R), x1 = Math.floor(Player.x + R);
    const y0 = Math.max(0, Math.floor(Player.y - R)), y1 = Math.floor(Player.y + R);
    outer:
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (World.get(x, y) !== World.kindIndex.magnetite) continue;
        if (Math.hypot(x + 0.5 - Player.x, y + 0.5 - Player.y) <= R) { near = true; break outer; }
      }
    }
    near = near && !Player.dead;
    if (near && !this.magnetActive) {
      Audio.play('magnet');
      if (!this._magnetIntro) {
        this._magnetIntro = true;
        this.warn('MAGNETIC ANOMALY! CONTROLS INVERTED!', '#c99cff');
      } else {
        this.toast('Magnetic field — controls inverted!');
      }
    }
    this.magnetActive = near;
    Audio.setMagnet(near ? 1 : 0);
  },

  // --- Nuclear warheads ---
  armNukesAround(tx, ty) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (World.get(tx + dx, ty + dy) === World.kindIndex.nuke) this.armNuke(tx + dx, ty + dy);
      }
    }
  },

  armNuke(x, y, fuse, quiet) {
    if (this.armedNukes.some(n => n.x === x && n.y === y)) return;
    this.armedNukes.push({ x, y, t: fuse || C.NUKE.fuse, beepT: 0 });
    Audio.play('nukeArm');
    this.shake(0.4);
    if (!quiet) this.warn('☢ WARHEAD ARMED — GET CLEAR OR DEFUSE IT!', '#ff5540');
  },

  // Returns the seconds that were left on the fuse, or null if it wasn't ticking
  disarmNuke(x, y) {
    const i = this.armedNukes.findIndex(n => n.x === x && n.y === y);
    if (i < 0) return null;
    const t = this.armedNukes[i].t;
    this.armedNukes.splice(i, 1);
    return t;
  },

  updateNukes(dt) {
    if (this.nukeFlash > 0) this.nukeFlash -= dt;
    for (let i = this.armedNukes.length - 1; i >= 0; i--) {
      const n = this.armedNukes[i];
      n.t -= dt;
      n.beepT -= dt;
      if (n.beepT <= 0) {
        const urgency = 1 - Math.max(0, n.t) / C.NUKE.fuse;
        Audio.beep(900 + urgency * 900, 0.13 + 0.08 * urgency);
        n.beepT = Math.max(0.09, 0.5 * (Math.max(0, n.t) / C.NUKE.fuse));
      }
      if (n.t <= 0) {
        this.armedNukes.splice(i, 1);
        this.detonateNuke(n);
      }
    }
  },

  detonateNuke(n) {
    World.clear(n.x, n.y);
    // Other warheads caught in the blast chain-arm on a short fuse
    World.blast(n.x, n.y, C.NUKE.blastRadius)
      .forEach(c => this.armNuke(c.x, c.y, C.NUKE.chainFuse, true));
    Audio.play('nukeBlast');
    this.shake(3);
    this.nukeFlash = 0.7;
    Particles.explosion(n.x + 0.5, n.y + 0.5, 3);
    // Mushroom column of fire and ash boiling upward
    for (let i = 0; i < 46; i++) {
      Particles.spawn({
        x: n.x + 0.5 + (Math.random() - 0.5) * 3.5,
        y: n.y + 0.5 + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 4,
        vy: -3.5 - Math.random() * 7,
        life: 1 + Math.random() * 1.2,
        size: 0.18 + Math.random() * 0.26,
        color: Math.random() < 0.55 ? (Math.random() < 0.5 ? '#ff9a3c' : '#ffd97a') : '#6b6b66',
        glow: Math.random() < 0.5,
      });
    }
    const dist = Math.hypot(Player.x - (n.x + 0.5), Player.y - (n.y + 0.5));
    if (!Player.dead && Player.teleporting <= 0 && dist < C.NUKE.dmgRadius) {
      const dmg = Math.round(C.NUKE.maxDmg * (1 - dist / (C.NUKE.dmgRadius + 0.5)));
      if (dmg > 0) Player.damage(dmg, 'nuke');
    }
    if (this.worm && Math.hypot(this.worm.x - n.x, this.worm.y - n.y) < C.NUKE.blastRadius + 2) this.killWorm();
    this.toast('Nuclear detonation!');
  },

  // Player explosives near the worm hurt it (warhead arming is handled in blast)
  onExplosion(cx, cy, r) {
    const w = this.worm;
    if (!w) return;
    const hit = [{ x: w.x, y: w.y }, ...(w.segPos || [])]
      .some(p => Math.hypot(p.x - (cx + 0.5), p.y - (cy + 0.5)) <= r + 1.6);
    if (hit) this.killWorm();
  },

  // --- The worm: 2 tiles wide, chews toward the pod at half stock-drill speed ---
  updateWorm(dt) {
    const depth = Player.depthFeet();
    if (!this.worm) {
      Audio.setRumble(0);
      if (Player.dead || this.bossActive() || this.inHell() || depth < C.WORM.min) return;
      // First crossing is scripted; after that it hunts at random
      if (!this.wormIntroSeen) { this.wormIntroSeen = true; this.spawnWorm(); return; }
      if (Math.random() < 0.015 * dt) this.spawnWorm();
      return;
    }
    const w = this.worm;
    w.age += dt;
    w.biteCd -= dt;

    if (w.leaving) {
      w.fade -= dt / 1.5;
      w.y += 1.5 * dt;                        // dives back into the deep
      this.wormTrail(w, dt);
      Audio.setRumble(0.25 * Math.max(0, w.fade));
      if (w.fade <= 0) { this.worm = null; Audio.setRumble(0); }
      return;
    }

    // Steer toward the pod with a slow sinuous weave
    const dx = Player.x - w.x, dy = Player.y - w.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(w.age * 1.6) * 0.55 * Math.min(1, dist / 4);   // straighten for the lunge
    let mx = dx / dist - (dy / dist) * wob;
    let my = dy / dist + (dx / dist) * wob;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;

    // Fixed pace: solid rock at half the stock drill, a bit quicker in open tunnels
    const ahead = World.isSolid(Math.floor(w.x + mx * 1.3), Math.floor(w.y + my * 1.3));
    const speed = ahead ? C.WORM.speedSolid : C.WORM.speedOpen;
    w.x += mx * speed * dt;
    w.y += my * speed * dt;
    w.x = Math.max(2, Math.min(C.WORLD_W - 3, w.x));
    // Never hunts above -500 ft — the shallows are safe ground
    w.y = Math.max(C.feetToRow(C.WORM.ceilingFt), Math.min(C.GROUND_BOTTOM_ROW - 2, w.y));
    w.heading = Math.atan2(my, mx);

    // Chewing: fast jaw churn while eating rock, idle gnashing in the open
    w.chew += dt * (ahead ? 10 : 4);
    this.wormCarve(w.x, w.y);
    if (ahead && Math.random() < dt * 26) {
      Particles.dust(w.x + (Math.random() - 0.5) * 1.8, w.y + (Math.random() - 0.5) * 1.8, '#6a4a30');
    }
    this.wormTrail(w, dt);

    // The ground itself groans louder the closer it gets
    Audio.setRumble(Math.max(0.15, Math.min(1, 1.25 - dist / 18)));

    // Bite
    if (dist < 1.5 && w.biteCd <= 0 && !Player.dead && Player.teleporting <= 0) {
      w.biteCd = C.WORM.biteCd;
      Audio.play('chomp');
      this.shake(0.7);
      Player.vx = (dx / dist) * -8;
      Player.vy = (dy / dist) * -6 - 1.5;
      this.toast('The worm bites into your hull!');
      Player.damage(C.WORM.biteDmg, 'worm');
    }

    // Gives up eventually, or the moment the pod puts 500 ft between them
    if (w.age > C.WORM.lifetime || dist * C.FEET_PER_TILE > C.WORM.leashFt) {
      w.leaving = true;
      Audio.play('wormRoar');
      this.toast(dist * C.FEET_PER_TILE > C.WORM.leashFt
        ? 'You outran the worm — it loses your trail…'
        : 'The worm loses interest and burrows away…');
    }
  },

  // Maintain the path history and derive evenly-spaced body segment positions
  wormTrail(w, dt) {
    const lastP = w.path[w.path.length - 1];
    if (Math.hypot(w.x - lastP.x, w.y - lastP.y) > 0.22) {
      w.path.push({ x: w.x, y: w.y });
      if (w.path.length > 70) w.path.shift();
    }
    const SEGS = 9, SPACING = 0.85;
    w.segPos = [];
    let target = SPACING, acc = 0;
    let prev = { x: w.x, y: w.y };
    for (let i = w.path.length - 1; i >= 0 && w.segPos.length < SEGS; i--) {
      const p = w.path[i];
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      while (acc >= target && w.segPos.length < SEGS) {
        w.segPos.push({ x: p.x, y: p.y });
        target += SPACING;
      }
    }
    while (w.segPos.length < SEGS) {
      const tail = w.segPos[w.segPos.length - 1] || { x: w.x, y: w.y };
      w.segPos.push({ x: tail.x, y: tail.y });
    }
  },

  // The worm's maw clears a 2-tile-wide bore. Boulders are no obstacle;
  // biting a warhead wakes it instead of destroying it.
  wormCarve(cx, cy) {
    const r = 1.02;
    for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++) {
        if (x <= 0 || x >= C.WORLD_W - 1) continue;
        if (y <= 1 || y >= C.GROUND_BOTTOM_ROW - 1) continue;
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        const id = World.get(x, y);
        if (id === 0) continue;
        if (id === World.kindIndex.nuke) { this.armNuke(x, y); continue; }
        World.clear(x, y);
      }
    }
  },

  spawnWorm() {
    const a = Math.random() * Math.PI * 2;
    const r = 16 + Math.random() * 5;
    const x = Math.max(2.5, Math.min(C.WORLD_W - 3.5, Player.x + Math.cos(a) * r));
    const y = Math.max(C.feetToRow(C.WORM.ceilingFt), Math.min(C.GROUND_BOTTOM_ROW - 3, Player.y + Math.sin(a) * r));
    this.worm = {
      x, y, age: 0, biteCd: 0, chew: 0,
      leaving: false, fade: 1, heading: 0,
      path: [{ x, y }], segPos: [],
    };
    Audio.play('wormRoar');
    this.shake(0.8);
    this.warn('SOMETHING HUGE IS BURROWING TOWARD YOU!', '#9dff5a');
  },

  killWorm() {
    const w = this.worm;
    if (!w) return;
    this.worm = null;
    Audio.setRumble(0);
    Audio.play('wormRoar');
    Particles.explosion(w.x, w.y, 2);
    for (const p of w.segPos) {
      Particles.burst(p.x, p.y, 10, { color: '#9dff5a', speed: 5, life: 0.7, size: 0.12, glow: true });
    }
    Player.money += C.WORM.bounty;
    this.popup(w.x, w.y - 1, '+$' + C.WORM.bounty.toLocaleString(), '#9dff5a');
    this.toast(`Worm destroyed! Bounty +$${C.WORM.bounty.toLocaleString()}`);
    this.shake(1.2);
  },

  // --- Pyramids: an eerie fanfare when the pod digs near one ---
  checkPyramids() {
    if (!World.pyramids) return;
    for (const p of World.pyramids) {
      if (p.seen) continue;
      if (Math.hypot(Player.x - p.x, Player.y - (p.y - 2.5)) < 8) {
        p.seen = true;
        Audio.play('discover');
        this.warn('ANCIENT STRUCTURE DETECTED IN THE ROCK…', '#ffd76e');
      }
    }
  },

  // Taking the Pharaoh's Bounty wakes the tomb's guardian — a faster, hungrier ghost
  triggerCurse(x, y) {
    Audio.play('curse');
    this.warn("THE TOMB'S GUARDIAN AWAKENS!", '#c99cff');
    this.shake(1);
    this.spawnGhost({ cursed: true });
  },

  rollMarsquake() {
    if (Math.random() < C.MARSQUAKE_CHANCE && Player.depthFeet() < 10) {
      World.quake();
      Audio.play('quake');
      this.shake(1.5);
      UI.toast('MARSQUAKE! Your tunnels have collapsed!');
    }
  },

  // --- Save / load (mirrors the original save machine: gear + cash, not tunnels) ---
  save() {
    const data = {
      player: Player.serialize(),
      story: Story.serialize(),
      boss: Boss.serialize(),
      seed: World.seed,
    };
    try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(data)); } catch (e) {}
    this.score = 0;      // saving resets score, as in the original
  },

  loadSaveData() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  applySave(data) {
    this.newWorld(data.seed != null ? data.seed : (Math.random() * 1e9) | 0);
    Player.restore(data.player);
    Story.restore(data.story);
    Boss.restore(data.boss);
    this.score = 0;
    this.ghost = null;
    this.ghostStage = 0;
    this.popups.length = 0;
    this._maxBand = 0;
    this.rockWarnT = 0;
    this.resetGimmicks();
  },

  onPlayerDeath(cause) {
    this.deathCause = cause;
    setTimeout(() => { if (Player.dead) this.state = 'dead'; }, 1400);
  },

  respawn() {
    const save = this.loadSaveData();
    if (save) this.applySave(save);
    else {
      this.newWorld((Math.random() * 1e9) | 0);
      Player.reset();
      Story.seen = {};
      Boss.reset();
      this.score = 0;
      this.ghost = null;
      this.ghostStage = 0;
      this.resetGimmicks();
    }
    Particles.clear();
    this.state = 'play';
  },

  victory() {
    Player.money += C.BOSS.victoryCash;
    this.state = 'victory';
  },

  finishVictory() {
    this.save();
    this.state = 'title';
  },

  // --- Update ---
  update(dt) {
    this.time += dt;
    if (this.shakeT > 0) this.shakeT -= dt; else this.shakeMag = 0;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    if (this.state !== 'play') { Particles.update(dt); Audio.setWind(0); Audio.setTreads(0); Audio.setGeyser(0); Audio.setRumble(0); Audio.setMagnet(0); Audio.thrustOff(); return; }
    // Shop menus pause the world (and the fuel drain), as in the original
    if (UI.isOpen()) { Particles.update(dt); Audio.setWind(0); Audio.setTreads(0); Audio.setGeyser(0); Audio.setRumble(0); Audio.setMagnet(0); Audio.thrustOff(); return; }

    // Magnetite fields flip the controls before the pod ever sees them
    this.updateMagnet(dt);
    const inp = this.magnetActive
      ? { up: this.input.down, down: this.input.up, left: this.input.right, right: this.input.left }
      : this.input;
    this._effInput = inp;

    Player.update(dt, inp);
    Boss.update(dt);
    Particles.update(dt);
    Story.check();

    if (this.alertT > 0) this.alertT -= dt;
    this.updateNukes(dt);
    this.updateWorm(dt);
    this.checkPyramids();

    // Fuel-low banner: fires each time fuel crosses down through 25%
    if (this.fuelWarnT > 0) this.fuelWarnT -= dt;
    const fuelFrac = Player.fuel / Player.fuelCap();
    if (fuelFrac <= 0.25 && this._prevFuelFrac > 0.25 && !Player.dead) {
      this.fuelWarnT = 3.5;
      Audio.play('denied');
    }
    this._prevFuelFrac = fuelFrac;

    // Denser strata announcement: fires once per newly-entered darker soil band
    if (this.rockWarnT > 0) this.rockWarnT -= dt;
    const soilBand = Sprites.bandForRow(Math.max(0, Math.floor(Player.y)));
    if (soilBand > this._maxBand && !Player.dead) {
      this._maxBand = soilBand;
      this.rockWarnT = 3.5;
      Audio.play('clank');
    }

    this.updateGhost(dt);

    // Floating popups age out
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].age += dt;
      if (this.popups[i].age >= this.popups[i].life) this.popups.splice(i, 1);
    }

    // Entering Hell triggers the boss
    if (this.inHell() && !Boss.active && !Boss.defeated && !Player.dead) Boss.start();

    // Score: passive digging depth
    if (Player.drilling && !this._scoredTile) { this.score += 5; this._scoredTile = true; }
    if (!Player.drilling) this._scoredTile = false;

    // Camera follows with smoothing
    const targetX = Player.x - C.VIEW_W / C.TILE / 2;
    const targetY = Player.y - C.VIEW_H / C.TILE / 2;
    const maxX = C.WORLD_W - C.VIEW_W / C.TILE;
    const maxY = C.WORLD_H - C.VIEW_H / C.TILE;
    this.cam.x = Math.max(0, Math.min(maxX, this.cam.x + (targetX - this.cam.x) * Math.min(1, dt * 8)));
    this.cam.y = Math.max(-C.SURFACE_ROWS, Math.min(maxY, this.cam.y + (targetY - this.cam.y) * Math.min(1, dt * 8)));
  },

  // --- Render ---
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);

    // Screen shake
    if (this.shakeT > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.shakeMag * 10,
        (Math.random() - 0.5) * this.shakeMag * 10
      );
    }

    this.drawSky(ctx);
    this.drawTiles(ctx);
    this.drawBuildings(ctx);
    Boss.draw(ctx, this.cam);
    Particles.draw(ctx, this.cam);
    if (!Player.dead) {
      const podX = (Player.x - this.cam.x) * C.TILE;
      const podY = (Player.y - this.cam.y) * C.TILE;
      // Flashlight aim: from the dome lamp toward the cursor (screen space)
      this._aim = Math.atan2(this.mouse.y - (podY - C.TILE * 0.4), this.mouse.x - podX);
      Sprites.drawPod(ctx, podX, podY, {
        facing: Player.facing,
        drilling: Player.drilling ? Player.drilling.dir : null,
        thrust: (this._effInput || this.input).up && this.state === 'play',
        time: this.time,
        teleporting: Player.teleporting,
        treadPhase: Player.treadPhase || 0,
        aim: this._aim,
      });
    }
    this.drawLighting(ctx);
    this.drawGimmickFx(ctx);
    this.drawGhost(ctx);
    this.drawPopups(ctx);

    // Hurt vignette
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,20,${this.hurtFlash * 0.9})`;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    // Nuclear detonation whiteout
    if (this.nukeFlash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${Math.min(1, this.nukeFlash * 1.6)})`;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    if (this.state === 'play' || this.state === 'dialog') UI.drawHUD(ctx);
    if (this.state === 'title') this.drawTitle(ctx);
    if (this.state === 'dead') this.drawDead(ctx);
    if (this.state === 'victory') this.drawVictory(ctx);
  },

  drawSky(ctx) {
    const depthPx = this.cam.y * C.TILE;
    // Sky only matters near the surface
    if (this.cam.y > 8) {
      ctx.fillStyle = '#08060a';
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      return;
    }
    const g = ctx.createLinearGradient(0, -depthPx - C.SURFACE_ROWS * C.TILE, 0, -depthPx + C.TILE * 2);
    g.addColorStop(0, '#1a0f2e');
    g.addColorStop(0.45, '#7a2f3e');
    g.addColorStop(0.8, '#d97b4a');
    g.addColorStop(1, '#e8a06a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

    // Stars
    for (const s of this.stars) {
      const sy = s.y * C.VIEW_H * 0.5 - depthPx * 0.3 - C.SURFACE_ROWS * C.TILE * 0.3;
      if (sy < -10 || sy > C.VIEW_H) continue;
      const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + s.tw);
      ctx.fillStyle = `rgba(255,240,220,${0.5 * tw})`;
      ctx.beginPath();
      ctx.arc(s.x * C.VIEW_W, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sun (pale, distant)
    const sunY = -depthPx - C.TILE * 4.6;
    if (sunY > -60 && sunY < C.VIEW_H + 60) {
      const sg = ctx.createRadialGradient(C.VIEW_W * 0.78, sunY, 4, C.VIEW_W * 0.78, sunY, 70);
      sg.addColorStop(0, 'rgba(255,240,215,0.95)');
      sg.addColorStop(0.3, 'rgba(255,205,150,0.55)');
      sg.addColorStop(1, 'rgba(255,180,120,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(C.VIEW_W * 0.78 - 80, sunY - 80, 160, 160);
    }
    // Distant mesas (parallax)
    ctx.fillStyle = 'rgba(90,40,45,0.5)';
    const horizon = -depthPx;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= C.VIEW_W; x += 60) {
      const h = 30 + 40 * Math.abs(Math.sin(x * 0.013 + 2));
      ctx.lineTo(x, horizon - h);
      ctx.lineTo(x + 40, horizon - h);
    }
    ctx.lineTo(C.VIEW_W, horizon);
    ctx.fill();
  },

  drawTiles(ctx) {
    const T = C.TILE;
    const x0 = Math.floor(this.cam.x), x1 = Math.ceil(this.cam.x + C.VIEW_W / T);
    const y0 = Math.max(0, Math.floor(this.cam.y)), y1 = Math.min(C.WORLD_H - 1, Math.ceil(this.cam.y + C.VIEW_H / T));
    this._caveTiles = [];
    this._steamTiles = [];
    this._magnetVis = [];

    for (let y = y0; y <= y1; y++) {
      const band = Sprites.bandForRow(y);
      for (let x = Math.max(0, x0); x <= Math.min(C.WORLD_W - 1, x1); x++) {
        const id = World.get(x, y);
        const sx = (x - this.cam.x) * T;
        const sy = (y - this.cam.y) * T;
        if (id === 0) {
          if (y <= C.GROUND_BOTTOM_ROW) {
            // Draw solid dirt here too — the passage is carved out of it later
            // by the organic blob mask in drawCavePass().
            const v = World.variant[y * C.WORLD_W + x] % Sprites.VARIANTS;
            ctx.drawImage(Sprites.dirt[band][v], sx, sy, T + 0.5, T + 0.5);
            this._caveTiles.push({ x, y });
          } else {
            // Hell atmosphere
            ctx.fillStyle = '#1a0505';
            ctx.fillRect(sx, sy, T + 1, T + 1);
          }
          continue;
        }
        const v = World.variant[y * C.WORLD_W + x];
        if (id === 5) {
          // Water pools: dirt behind, round blobs drawn in drawSteamPass()
          ctx.drawImage(Sprites.dirt[band][v % Sprites.VARIANTS], sx, sy, T + 0.5, T + 0.5);
          this._steamTiles.push({ x, y });
          continue;
        }
        let tex;
        if (id === 1) tex = Sprites.dirt[band][v];
        else if (id === 2) tex = Sprites.stone[band];
        else if (id === 3) tex = Sprites.lavaBase;
        else if (id === 4) tex = Sprites.dirt[band][v];        // gas is indistinguishable from dirt
        else if (id === 6) { tex = Sprites.magnetiteTex[band]; this._magnetVis.push({ x, y }); }
        else if (id === 7) tex = Sprites.sandTex[band];
        else if (id === 8) tex = Sprites.nukeTex[band];
        else {
          const kind = World.tileKinds[id];
          tex = kind.mineral ? Sprites.minerals[kind.key][band] : Sprites.artifacts[kind.key][band];
        }
        ctx.drawImage(tex, sx, sy, T + 0.5, T + 0.5);
        // Lava animated shimmer
        if (id === 3) {
          const pulse = 0.25 + 0.2 * Math.sin(this.time * 3 + x * 1.7 + y * 2.3);
          ctx.fillStyle = `rgba(255,160,40,${pulse})`;
          ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
        }
      }
    }

    this.drawSoilClouds(ctx, x0, x1, y0, y1);
    this.drawCavePass(ctx);
    this.drawSteamPass(ctx);

    // Surface grass line
    if (this.cam.y < 2) {
      const gy = (0 - this.cam.y) * T;
      const gg = ctx.createLinearGradient(0, gy - 5, 0, gy + 8);
      gg.addColorStop(0, '#8fae4a');
      gg.addColorStop(1, 'rgba(110,140,60,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, gy - 4, C.VIEW_W, 12);
    }

    // Drilling crack overlay
    if (Player.drilling) {
      const d = Player.drilling;
      const sx = (d.x - this.cam.x) * T, sy = (d.y - this.cam.y) * T;
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.progress * 1.2);
      ctx.strokeStyle = 'rgba(20,10,5,0.8)';
      ctx.lineWidth = 2;
      const cx = sx + T / 2, cy = sy + T / 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + d.progress * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * T * 0.5 * d.progress, cy + Math.sin(a) * T * 0.5 * d.progress);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  // Water pools render as a union of overlapping circles through an offscreen
  // mask, so a pool reads as one rounded body of water instead of square tiles.
  drawSteamPass(ctx) {
    const tiles = this._steamTiles;
    if (!tiles || !tiles.length) return;
    const T = C.TILE;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this._steamA || this._steamA.width !== W || this._steamA.height !== H) {
      this._steamA = document.createElement('canvas');
      this._steamA.width = W;
      this._steamA.height = H;
    }
    const a = this._steamA.getContext('2d');
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, W, H);
    a.fillStyle = '#000';
    for (const t of tiles) {
      const sx = (t.x + 0.5 - this.cam.x) * T;
      const sy = (t.y + 0.5 - this.cam.y) * T;
      a.beginPath();
      a.ellipse(sx, sy, T * 0.72, T * 0.72, 0, 0, Math.PI * 2);
      a.fill();
    }
    // Water texture, world-anchored with a slow vertical slosh
    const pat = a.createPattern(Sprites.steamBase, 'repeat');
    if (pat && pat.setTransform) {
      const s = T / C.TEX;
      pat.setTransform(new DOMMatrix([s, 0, 0, s, -this.cam.x * T, -this.cam.y * T + Math.sin(this.time * 1.8) * T * 0.05]));
    }
    a.globalCompositeOperation = 'source-in';
    a.fillStyle = pat || '#2e88a0';
    a.fillRect(0, 0, W, H);

    ctx.drawImage(this._steamA, 0, 0);
    // Gentle churning sheen
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 + 0.06 * Math.sin(this.time * 4);
    ctx.drawImage(this._steamA, 0, 0);
    ctx.restore();
  },

  // Large soft tonal clouds anchored to world coordinates. They span several
  // tiles and ignore the grid entirely, which kills any repeating patchwork
  // and gives the soil the uneven look of real ground.
  drawSoilClouds(ctx, x0, x1, y0, y1) {
    const T = C.TILE, CELL = 3;
    const c0 = Math.floor(x0 / CELL) - 1, c1 = Math.ceil(x1 / CELL) + 1;
    const d0 = Math.max(0, Math.floor(y0 / CELL) - 1), d1 = Math.ceil(y1 / CELL) + 1;
    for (let cy = d0; cy <= d1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const h = ((cx * 2654435761) ^ (cy * 40503)) >>> 0;
        const r01 = i => ((h >>> ((i * 7) % 26)) & 31) / 31;
        // World-space center & radius (in tiles), independent of tile edges
        const wx = (cx + 0.2 + r01(0) * 0.6) * CELL;
        const wy = (cy + 0.2 + r01(1) * 0.6) * CELL;
        const wr = CELL * (0.8 + r01(2) * 1.2);
        const sx = (wx - this.cam.x) * T;
        const sy = (wy - this.cam.y) * T;
        const sr = wr * T;
        const dark = r01(3) < 0.55;
        const a = dark ? 0.05 + r01(4) * 0.05 : 0.025 + r01(4) * 0.03;
        const g = ctx.createRadialGradient(sx, sy, sr * 0.15, sx, sy, sr);
        g.addColorStop(0, dark ? `rgba(25,8,4,${a})` : `rgba(255,220,180,${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
    }
  },

  // Carve the passages out of the soil as one organic shape: every open tile
  // contributes jittered, rotated ellipse blobs to an offscreen mask, plus
  // connector blobs toward open neighbors so passages stay continuous. The
  // union of all blobs is textured and composited over the dirt with a blurred
  // dark fringe — walls become winding contours with no per-tile repetition.
  drawCavePass(ctx) {
    const tiles = this._caveTiles;
    if (!tiles || !tiles.length) return;
    const T = C.TILE;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this._caveA || this._caveA.width !== W || this._caveA.height !== H) {
      this._caveA = document.createElement('canvas');
      this._caveB = document.createElement('canvas');
      this._caveA.width = this._caveB.width = W;
      this._caveA.height = this._caveB.height = H;
    }
    const a = this._caveA.getContext('2d');
    const b = this._caveB.getContext('2d');
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, W, H);
    b.clearRect(0, 0, W, H);
    a.fillStyle = '#000';
    b.fillStyle = '#000';

    const blob = (wx, wy, rx, ry, rot, grow) => {
      const sx = (wx - this.cam.x) * T, sy = (wy - this.cam.y) * T;
      a.beginPath();
      a.ellipse(sx, sy, rx * T, ry * T, rot, 0, Math.PI * 2);
      a.fill();
      b.beginPath();
      b.ellipse(sx, sy, (rx + grow) * T, (ry + grow) * T, rot, 0, Math.PI * 2);
      b.fill();
    };

    for (const t of tiles) {
      const { x, y } = t;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const r01 = i => ((h >>> ((i * 5) % 27)) & 31) / 31;
      // Two jittered, rotated ellipses per open tile
      for (let i = 0; i < 2; i++) {
        blob(
          x + 0.5 + (r01(i * 4) - 0.5) * 0.3,
          y + 0.5 + (r01(i * 4 + 1) - 0.5) * 0.3,
          0.5 + r01(i * 4 + 2) * 0.2,
          0.42 + r01(i * 4 + 3) * 0.2,
          r01(i * 4 + 2) * Math.PI,
          0.16
        );
      }
      // Connectors keep passages continuously open between neighboring dug tiles
      if (!World.isSolid(x + 1, y)) blob(x + 1, y + 0.5 + (r01(9) - 0.5) * 0.2, 0.5, 0.4 + r01(10) * 0.12, 0, 0.14);
      if (!World.isSolid(x, y + 1) && y + 1 <= C.GROUND_BOTTOM_ROW) blob(x + 0.5 + (r01(11) - 0.5) * 0.2, y + 1, 0.4 + r01(12) * 0.12, 0.5, 0, 0.14);
      // Opening to the sky: keep the shaft mouth full width
      if (y === 0) blob(x + 0.5, 0.12, 0.5, 0.35, 0, 0.1);
    }

    // Texture the cave interior (world-anchored pattern so it doesn't swim)
    const band = Sprites.bandForRow(Math.max(0, Math.floor(this.cam.y + H / T / 2)));
    const cavePat = a.createPattern(Sprites.cave[band], 'repeat');
    if (cavePat && cavePat.setTransform) {
      const s = T / C.TEX;
      cavePat.setTransform(new DOMMatrix([s, 0, 0, s, -this.cam.x * T, -this.cam.y * T]));
    }
    a.globalCompositeOperation = 'source-in';
    a.fillStyle = cavePat || '#241009';
    a.fillRect(0, 0, W, H);

    // Blurred dark fringe first (crumbling shadowed rim), then the textured cave
    ctx.save();
    ctx.globalAlpha = 0.6;
    try { ctx.filter = `blur(${Math.max(2, T * 0.14)}px)`; } catch (e) {}
    ctx.drawImage(this._caveB, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.drawImage(this._caveA, 0, 0);
    ctx.restore();
  },

  drawBuildings(ctx) {
    if (this.cam.y > 4) return;
    const T = C.TILE;
    const groundY = (0 - this.cam.y) * T;
    for (const key of Object.keys(C.BUILDINGS)) {
      const b = C.BUILDINGS[key];
      const sx = (b.x - this.cam.x) * T;
      Sprites.drawBuilding(ctx, key, sx, groundY, this.time);
    }
    // Interaction prompt
    const cur = Shops.current();
    if (cur && this.state === 'play' && !UI.isOpen()) {
      const b = C.BUILDINGS[cur];
      const px = (b.x + b.w / 2 - this.cam.x) * T;
      ctx.font = 'bold 13px Verdana';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,10,16,0.8)';
      Sprites.rr(ctx, px - 70, groundY - T * 3.6, 140, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(`E — ${b.name.split(' ')[0]} ${b.name.split(' ')[1] || ''}`, px, groundY - T * 3.6 + 12);
    }
  },

  drawLighting(ctx) {
    const depth = Player.depthFeet();
    // Darkness ramps from 0 at surface to heavy at depth; Hell has its own red gloom
    let darkness;
    if (this.inHell()) darkness = 0.62;
    else darkness = Math.min(0.88, Math.max(0, (depth - 150) / 2600));
    if (darkness <= 0.02) return;

    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!this._lightC || this._lightC.width !== W || this._lightC.height !== H) {
      this._lightC = document.createElement('canvas');
      this._lightC.width = W;
      this._lightC.height = H;
    }
    const lc = this._lightC.getContext('2d');
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);

    const px = (Player.x - this.cam.x) * C.TILE;
    const py = (Player.y - this.cam.y) * C.TILE;
    const radius = C.TILE * (this.inHell() ? 7 : 5.2);

    // Radial pool of light around the pod inside the dark overlay
    const tint = this.inHell() ? '40,8,4' : '6,5,8';
    const g = lc.createRadialGradient(px, py, C.TILE * 0.8, px, py, radius);
    g.addColorStop(0, `rgba(${tint},0)`);
    g.addColorStop(0.55, `rgba(${tint},${darkness * 0.45})`);
    g.addColorStop(1, `rgba(${tint},${darkness})`);
    lc.fillStyle = g;
    lc.fillRect(0, 0, W, H);

    // The dome flashlight carves a cone of visibility toward the cursor
    if (!Player.dead && this._aim != null) {
      const beamLen = C.TILE * 7;
      const bg = lc.createRadialGradient(px, py - C.TILE * 0.4, C.TILE * 0.4, px, py - C.TILE * 0.4, beamLen);
      bg.addColorStop(0, 'rgba(0,0,0,0.85)');
      bg.addColorStop(0.65, 'rgba(0,0,0,0.55)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      lc.globalCompositeOperation = 'destination-out';
      lc.fillStyle = bg;
      lc.beginPath();
      lc.moveTo(px, py - C.TILE * 0.4);
      lc.arc(px, py - C.TILE * 0.4, beamLen, this._aim - 0.26, this._aim + 0.26);
      lc.closePath();
      lc.fill();
      lc.globalCompositeOperation = 'source-over';
    }

    ctx.drawImage(this._lightC, 0, 0);

    // Headlamp glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hl = ctx.createRadialGradient(px, py, 2, px, py, C.TILE * 2.2);
    hl.addColorStop(0, 'rgba(255,220,150,0.14)');
    hl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(px - C.TILE * 3, py - C.TILE * 3, C.TILE * 6, C.TILE * 6);
    ctx.restore();
  },

  // Gimmick effects render above the lighting layer — they all emit light:
  // magnetite fields, armed warheads, the worm, and the inversion shimmer
  drawGimmickFx(ctx) {
    const T = C.TILE;

    // Magnetite fields: pulsing violet halo + slowly orbiting spark ring
    if (this._magnetVis && this._magnetVis.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this._magnetVis) {
        const sx = (m.x + 0.5 - this.cam.x) * T;
        const sy = (m.y + 0.5 - this.cam.y) * T;
        const R = C.MAGNETITE.radius * T;
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.4 + m.x * 1.3 + m.y);
        const g = ctx.createRadialGradient(sx, sy, T * 0.2, sx, sy, R);
        g.addColorStop(0, `rgba(181,108,255,${0.16 * pulse})`);
        g.addColorStop(0.65, `rgba(140,80,255,${0.07 * pulse})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
        // Field boundary: faint dashed ring so the player can read the radius
        ctx.strokeStyle = `rgba(200,150,255,${0.22 + 0.15 * pulse})`;
        ctx.lineWidth = Math.max(1, T * 0.035);
        ctx.setLineDash([T * 0.25, T * 0.35]);
        ctx.lineDashOffset = -this.time * T * 0.6;
        ctx.beginPath();
        ctx.arc(sx, sy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Orbiting sparks
        for (let i = 0; i < 3; i++) {
          const a = this.time * (1.1 + i * 0.3) + (i / 3) * Math.PI * 2 + m.x;
          const rr = R * (0.5 + 0.16 * i);
          ctx.fillStyle = `rgba(225,190,255,${0.5 * pulse})`;
          ctx.beginPath();
          ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.9, T * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Armed warheads: hot red pulse and an expanding alarm ring, faster as
    // the fuse shortens
    if (this.armedNukes.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const n of this.armedNukes) {
        const sx = (n.x + 0.5 - this.cam.x) * T;
        const sy = (n.y + 0.5 - this.cam.y) * T;
        if (sx < -T * 8 || sx > C.VIEW_W + T * 8 || sy < -T * 8 || sy > C.VIEW_H + T * 8) continue;
        const urgency = 1 - Math.max(0, n.t) / C.NUKE.fuse;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * (6 + urgency * 14));
        const g = ctx.createRadialGradient(sx, sy, T * 0.1, sx, sy, T * 2.2);
        g.addColorStop(0, `rgba(255,60,30,${0.4 * pulse + 0.2 * urgency})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - T * 2.2, sy - T * 2.2, T * 4.4, T * 4.4);
        const ringT = (this.time * (0.8 + urgency * 1.6)) % 1;
        ctx.strokeStyle = `rgba(255,90,60,${(1 - ringT) * 0.6})`;
        ctx.lineWidth = Math.max(1.5, T * 0.05);
        ctx.beginPath();
        ctx.arc(sx, sy, T * (0.4 + ringT * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    this.drawWorm(ctx);

    // Control-inversion shimmer: rippling violet vignette while magnetized
    if (this.magnetActive) {
      const p = 0.6 + 0.4 * Math.sin(this.time * 9);
      ctx.save();
      const vg = ctx.createRadialGradient(
        C.VIEW_W / 2, C.VIEW_H / 2, Math.min(C.VIEW_W, C.VIEW_H) * 0.3,
        C.VIEW_W / 2, C.VIEW_H / 2, Math.max(C.VIEW_W, C.VIEW_H) * 0.72);
      vg.addColorStop(0, 'rgba(140,60,255,0)');
      vg.addColorStop(1, `rgba(150,70,255,${0.16 + 0.1 * p})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      ctx.restore();
    }
  },

  // The worm: a chain of glowing segments ending in a chewing maw
  drawWorm(ctx) {
    const w = this.worm;
    if (!w || !w.segPos.length) return;
    const T = C.TILE;
    const hx = (w.x - this.cam.x) * T, hy = (w.y - this.cam.y) * T;
    if (hx < -T * 14 || hx > C.VIEW_W + T * 14 || hy < -T * 14 || hy > C.VIEW_H + T * 14) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, w.fade);

    const pts = [{ x: w.x, y: w.y }, ...w.segPos];

    // Toxic glow bleeding through the dark
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length; i++) {
      const sx = (pts[i].x - this.cam.x) * T, sy = (pts[i].y - this.cam.y) * T;
      const g = ctx.createRadialGradient(sx, sy, T * 0.2, sx, sy, T * 1.7);
      g.addColorStop(0, `rgba(120,255,80,${i === 0 ? 0.16 : 0.09})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - T * 1.7, sy - T * 1.7, T * 3.4, T * 3.4);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Body, tail to head, so the head overlaps
    for (let i = pts.length - 1; i >= 1; i--) {
      const sx = (pts[i].x - this.cam.x) * T, sy = (pts[i].y - this.cam.y) * T;
      const r = T * (0.95 - (i / pts.length) * 0.42);
      const undul = Math.sin(this.time * 6 - i * 0.9) * r * 0.06;
      const bg = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3 + undul, r * 0.15, sx, sy + undul, r);
      bg.addColorStop(0, '#3d5c28');
      bg.addColorStop(0.6, '#243d16');
      bg.addColorStop(1, '#101f0a');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(sx, sy + undul, r, 0, Math.PI * 2);
      ctx.fill();
      // Glowing band between segments
      ctx.strokeStyle = `rgba(140,255,90,${0.35 + 0.2 * Math.sin(this.time * 5 + i)})`;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath();
      ctx.arc(sx, sy + undul, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // Bristles
      ctx.strokeStyle = 'rgba(20,35,10,0.7)';
      ctx.lineWidth = Math.max(1, r * 0.08);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx + s * r * 0.7, sy + undul + r * 0.55);
        ctx.lineTo(sx + s * r * 0.95, sy + undul + r * 0.95);
        ctx.stroke();
      }
    }

    // Head: 2 tiles wide, mandibles chewing
    const hr = T * 0.98;
    const ang = w.heading || 0;
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    const hg = ctx.createRadialGradient(-hr * 0.3, -hr * 0.3, hr * 0.15, 0, 0, hr);
    hg.addColorStop(0, '#4a6e30');
    hg.addColorStop(0.6, '#2c4a1a');
    hg.addColorStop(1, '#14260c');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, hr, hr * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    // Armored head plates
    ctx.strokeStyle = 'rgba(15,30,8,0.8)';
    ctx.lineWidth = Math.max(1.5, hr * 0.07);
    for (const off of [-0.35, 0.05]) {
      ctx.beginPath();
      ctx.arc(hr * off, 0, hr * 0.8, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
    }
    // Chewing mandibles: two serrated jaws scissoring open and shut
    const jaw = Math.abs(Math.sin(w.chew)) * 0.55 + 0.12;
    ctx.fillStyle = '#1a2c10';
    ctx.strokeStyle = 'rgba(140,255,90,0.4)';
    ctx.lineWidth = Math.max(1, hr * 0.05);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * jaw);
      ctx.beginPath();
      ctx.moveTo(hr * 0.45, s * hr * 0.1);
      ctx.quadraticCurveTo(hr * 1.35, s * hr * 0.28, hr * 1.5, s * hr * 0.02);
      // Serrated inner edge
      ctx.lineTo(hr * 1.28, s * hr * 0.14);
      ctx.lineTo(hr * 1.08, s * hr * 0.1);
      ctx.lineTo(hr * 0.88, s * hr * 0.2);
      ctx.lineTo(hr * 0.6, s * hr * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Cluster of glowing eyes
    ctx.fillStyle = '#ffb028';
    ctx.shadowColor = '#ff8a20';
    ctx.shadowBlur = hr * 0.3;
    for (const [ex, ey, er] of [[0.28, -0.42, 0.11], [0.45, -0.22, 0.085], [0.28, 0.42, 0.11], [0.45, 0.22, 0.085]]) {
      ctx.beginPath();
      ctx.arc(hr * ex, hr * ey, hr * er, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  // Ghost renders above the lighting layer — spectres glow in the dark
  drawGhost(ctx) {
    const g = this.ghost;
    if (!g) return;
    const T = C.TILE;
    const burn = Math.min(1, (g.exposure || 0) / 3);
    const scared = !!g.lit && g.fading <= 0;
    // Panicked trembling while caught in the beam
    const trX = scared ? (Math.random() - 0.5) * T * 0.07 : 0;
    const trY = scared ? (Math.random() - 0.5) * T * 0.07 : 0;
    const gx = (g.x - this.cam.x) * T + trX;
    const gy = (g.y - this.cam.y) * T + Math.sin(g.age * 3) * T * 0.08 + trY;
    if (gx < -T * 2 || gx > C.VIEW_W + T * 2 || gy < -T * 2 || gy > C.VIEW_H + T * 2) return;
    let alpha = 0.78;
    if (g.fading > 0) alpha *= g.fading / 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Aura: cold spectral blue — violet for the tomb guardian — shifting to
    // firelight as it burns
    ctx.globalCompositeOperation = 'lighter';
    let gg = ctx.createRadialGradient(gx, gy, T * 0.1, gx, gy, T * 1.15);
    gg.addColorStop(0, g.cursed
      ? `rgba(${Math.round(200 + 55 * burn)},${Math.round(120 - 30 * burn)},${Math.round(255 - 195 * burn)},${0.36 + 0.2 * burn})`
      : `rgba(${Math.round(160 + 95 * burn)},${Math.round(215 - 90 * burn)},${Math.round(255 - 195 * burn)},${0.32 + 0.2 * burn})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(gx - T * 1.25, gy - T * 1.25, T * 2.5, T * 2.5);
    ctx.globalCompositeOperation = 'source-over';

    // Shroud: leans hungrily toward the pod, chars as it burns
    const lean = Math.atan2(Player.y - g.y, Player.x - g.x);
    const lx = Math.cos(lean) * T * 0.05;
    const baseR = g.cursed ? 220 : 225, baseG = g.cursed ? 175 : 243;
    const topR = Math.round(baseR - 140 * burn), topG = Math.round(baseG - 165 * burn), topB = Math.round(255 - 190 * burn);
    gg = ctx.createLinearGradient(gx, gy - T * 0.5, gx, gy + T * 0.55);
    gg.addColorStop(0, `rgba(${topR},${topG},${topB},0.92)`);
    gg.addColorStop(1, `rgba(${Math.round(140 - 80 * burn)},${Math.round(180 - 110 * burn)},${Math.round(225 - 160 * burn)},0.1)`);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(gx + lx, gy - T * 0.14, T * 0.31, Math.PI, 0);
    // Tattered skirt: sharp, restless triangular rags
    const bot = gy + T * 0.46;
    ctx.lineTo(gx + lx + T * 0.31, bot - T * 0.18);
    const rags = 5;
    for (let i = rags; i >= 0; i--) {
      const rxp = gx + lx - T * 0.31 + (i / rags) * T * 0.62;
      const drop = bot + Math.sin(g.age * 7 + i * 2.4) * T * 0.05 + (i % 2 ? -T * 0.14 : T * 0.03);
      ctx.lineTo(rxp + T * 0.05, drop);
      ctx.lineTo(rxp - T * 0.02, drop - T * 0.1);
    }
    ctx.closePath();
    ctx.fill();

    // Clawed wisp arms: reaching for the pod — or thrown up in panic
    ctx.strokeStyle = `rgba(${topR},${topG},${topB},0.7)`;
    ctx.lineWidth = Math.max(1.5, T * 0.055);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      const ax0 = gx + s * T * 0.26, ay0 = gy + T * 0.02;
      let ax1, ay1;
      if (scared) {
        ax1 = gx + s * T * 0.4;
        ay1 = gy - T * 0.42 + Math.sin(g.age * 22 + s) * T * 0.04;   // hands up, shaking
      } else {
        ax1 = gx + Math.cos(lean) * T * 0.5 + s * T * 0.14;
        ay1 = gy + Math.sin(lean) * T * 0.4 + T * 0.06;              // grasping toward the pod
      }
      ctx.moveTo(ax0, ay0);
      ctx.quadraticCurveTo((ax0 + ax1) / 2 + s * T * 0.06, (ay0 + ay1) / 2 + T * 0.08, ax1, ay1);
      ctx.stroke();
      // Claw fingers
      ctx.lineWidth = Math.max(1, T * 0.028);
      for (const fa of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        const fAng = (scared ? -Math.PI / 2 : lean) + fa;
        ctx.lineTo(ax1 + Math.cos(fAng) * T * 0.11, ay1 + Math.sin(fAng) * T * 0.11);
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(1.5, T * 0.055);
    }

    // Trailing wisps
    ctx.fillStyle = `rgba(${topR},${topG},${topB},0.22)`;
    for (let i = 0; i < 3; i++) {
      const wxp = gx - T * (0.42 + i * 0.17) * Math.cos(g.age * 1.5);
      const wyp = gy + T * 0.24 + Math.sin(g.age * 4 + i * 1.8) * T * 0.13;
      ctx.beginPath();
      ctx.arc(wxp, wyp, T * (0.07 - i * 0.015), 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Face ---
    const eyeY = gy - T * 0.18;
    if (!scared) {
      // Sunken black sockets with pinprick pupils that track the pod
      ctx.fillStyle = 'rgba(4,8,20,0.95)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(gx + s * T * 0.11, eyeY, T * 0.065, T * 0.09, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(190,240,255,0.95)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.11 + Math.cos(lean) * T * 0.025, eyeY + Math.sin(lean) * T * 0.025, T * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
      // Wide jagged grin
      ctx.fillStyle = 'rgba(4,8,20,0.92)';
      ctx.beginPath();
      ctx.moveTo(gx - T * 0.16, gy + T * 0.02);
      for (let i = 0; i <= 6; i++) {
        const mx = gx - T * 0.16 + (i / 6) * T * 0.32;
        ctx.lineTo(mx, gy + T * 0.06 + (i % 2 ? T * 0.045 : 0));
      }
      ctx.lineTo(gx + T * 0.16, gy + T * 0.1);
      for (let i = 6; i >= 0; i--) {
        const mx = gx - T * 0.16 + (i / 6) * T * 0.32;
        ctx.lineTo(mx, gy + T * 0.12 + (i % 2 ? 0 : T * 0.04));
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Terror: huge white eyes, pinpoint pupils, raised brows, screaming mouth
      for (const s of [-1, 1]) {
        ctx.fillStyle = 'rgba(245,250,255,0.95)';
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.11, eyeY, T * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(4,8,20,0.95)';
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.11, eyeY + T * 0.01, T * 0.02, 0, Math.PI * 2);
        ctx.fill();
        // Raised brow
        ctx.strokeStyle = 'rgba(4,8,20,0.8)';
        ctx.lineWidth = Math.max(1, T * 0.025);
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.11, eyeY - T * 0.02, T * 0.1, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      // Screaming "O" mouth
      ctx.fillStyle = 'rgba(4,8,20,0.95)';
      ctx.beginPath();
      ctx.ellipse(gx, gy + T * 0.09, T * 0.06, T * 0.1 + Math.sin(g.age * 25) * T * 0.012, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Flames while the beam is on it ---
    if (scared || burn > 0.02) {
      const intensity = Math.max(burn, scared ? 0.35 : 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const fa = -Math.PI * 0.9 + (i / 4) * Math.PI * 0.8;
        const fx = gx + Math.cos(fa) * T * 0.27;
        const fy = gy - T * 0.1 + Math.sin(fa) * T * 0.26;
        const flick = 0.7 + 0.3 * Math.sin(this.time * 13 + i * 2.4);
        const fh = T * (0.14 + 0.3 * intensity) * flick;
        const fw = T * 0.07 * (0.8 + 0.4 * intensity);
        const fgrad = ctx.createLinearGradient(fx, fy, fx, fy - fh);
        fgrad.addColorStop(0, `rgba(255,120,30,${0.75 * intensity + 0.2})`);
        fgrad.addColorStop(0.5, `rgba(255,190,60,${0.6 * intensity + 0.15})`);
        fgrad.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = fgrad;
        ctx.beginPath();
        ctx.moveTo(fx - fw, fy);
        ctx.quadraticCurveTo(fx - fw * 0.5, fy - fh * 0.55, fx + Math.sin(this.time * 17 + i) * fw * 0.6, fy - fh);
        ctx.quadraticCurveTo(fx + fw * 0.5, fy - fh * 0.5, fx + fw, fy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  },

  drawPopups(ctx) {
    if (!this.popups.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      const t = p.age / p.life;
      const sx = (p.x - this.cam.x) * C.TILE;
      const sy = (p.y - this.cam.y) * C.TILE - t * C.TILE * 0.95;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `bold ${Math.round(C.TILE * (0.3 + 0.06 * (1 - t)))}px Verdana`;
      ctx.lineWidth = Math.max(2, C.TILE * 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(p.text, sx, sy);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, sx, sy);
    }
    ctx.restore();
  },

  // --- Screens ---
  screenBase(ctx, alpha) {
    ctx.fillStyle = `rgba(6,6,10,${alpha})`;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
  },

  drawTitle(ctx) {
    this.screenBase(ctx, 0.55);
    ctx.save();
    ctx.textAlign = 'center';
    // Big title with warm glow
    ctx.font = 'bold 64px Verdana';
    ctx.shadowColor = '#ff8a30';
    ctx.shadowBlur = 30;
    const g = ctx.createLinearGradient(0, C.VIEW_H * 0.3 - 40, 0, C.VIEW_H * 0.3 + 20);
    g.addColorStop(0, '#ffd9a0');
    g.addColorStop(1, '#e07b28');
    ctx.fillStyle = g;
    ctx.fillText('MOTHERLOAD', C.VIEW_W / 2, C.VIEW_H * 0.3);
    ctx.shadowBlur = 0;
    ctx.font = '15px Verdana';
    ctx.fillStyle = '#b8b2a6';
    ctx.fillText('A fan remake of the 2004 classic — modernized graphics, faithful gameplay', C.VIEW_W / 2, C.VIEW_H * 0.3 + 36);

    const hasSave = !!this.loadSaveData();
    ctx.font = 'bold 20px Verdana';
    ctx.fillStyle = '#7dffb0';
    const blink = 0.6 + 0.4 * Math.sin(this.time * 3);
    ctx.globalAlpha = blink;
    ctx.fillText(hasSave ? 'Press ENTER to continue your save' : 'Press ENTER to start digging', C.VIEW_W / 2, C.VIEW_H * 0.55);
    ctx.globalAlpha = 1;

    ctx.font = '13px Verdana';
    ctx.fillStyle = '#9a958a';
    const lines = [
      'Arrows / WASD — fly & drill      E — enter buildings      N — mute',
      'Items: F fuel · R repair · X dynamite · C plastic · Q teleport · M transmitter',
      'Sell minerals at the processor. Refuel often. Watch your hull. Dig deep…',
    ];
    lines.forEach((l, i) => ctx.fillText(l, C.VIEW_W / 2, C.VIEW_H * 0.68 + i * 22));
    ctx.restore();
  },

  drawDead(ctx) {
    this.screenBase(ctx, 0.6);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Verdana';
    ctx.fillStyle = '#ff5540';
    ctx.shadowColor = '#801510';
    ctx.shadowBlur = 22;
    ctx.fillText('POD DESTROYED', C.VIEW_W / 2, C.VIEW_H * 0.36);
    ctx.shadowBlur = 0;
    ctx.font = '15px Verdana';
    ctx.fillStyle = '#c8c2b6';
    const causes = {
      fuel: 'The reactor ran dry — and mining pods do not glide.',
      fall: 'The ground arrived faster than the brakes did.',
      lava: 'Molten rock: excellent for minerals, terrible for hulls.',
      gas: 'An invisible gas pocket found its spark.',
      explosive: 'Standing next to your own blast radius is not recommended.',
      nuke: 'Fifty-megaton problems require more than a mining hull.',
      worm: 'It was hungry. You were there. The math was simple.',
      boss: 'Your contract has been terminated.',
      laser: 'Your contract has been terminated.',
      cane: 'Your contract has been terminated.',
      claw: 'Your contract has been terminated.',
      fireball: 'Your contract has been terminated.',
    };
    ctx.fillText(causes[this.deathCause] || 'The Martian soil claims another digger.', C.VIEW_W / 2, C.VIEW_H * 0.44);
    ctx.font = 'bold 17px Verdana';
    ctx.fillStyle = '#7dffb0';
    ctx.fillText(this.loadSaveData() ? 'ENTER — reload last save' : 'ENTER — start over', C.VIEW_W / 2, C.VIEW_H * 0.58);
    ctx.restore();
  },

  drawVictory(ctx) {
    this.screenBase(ctx, 0.72);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px Verdana';
    ctx.shadowColor = '#ffd23e';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffd97a';
    ctx.fillText('THE DEVIL IS DEFEATED', C.VIEW_W / 2, C.VIEW_H * 0.26);
    ctx.shadowBlur = 0;
    ctx.font = '15px Verdana';
    ctx.fillStyle = '#d8d3c8';
    const lines = [
      'The thing wearing Mr. Natas\' face collapses into cooling slag.',
      'The missing miners are avenged, and Mars is free of its buried tyrant.',
      '',
      'Spoils of victory:',
      'Company shares, infernal relics & hazard pay — $' + C.BOSS.victoryCash.toLocaleString(),
      '',
      'Final wealth: $' + Player.money.toLocaleString() + '        Score: ' + this.score.toLocaleString(),
    ];
    lines.forEach((l, i) => ctx.fillText(l, C.VIEW_W / 2, C.VIEW_H * 0.38 + i * 24));
    ctx.font = 'bold 17px Verdana';
    ctx.fillStyle = '#7dffb0';
    ctx.fillText('ENTER — save & return to title', C.VIEW_W / 2, C.VIEW_H * 0.82);
    ctx.restore();
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
