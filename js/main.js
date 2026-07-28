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
  shockwaves: [],        // expanding detonation rings: { x, y, age }
  nukeClouds: [],        // mushroom clouds (visual only, flyable): { x, y, age, seed }
  fallout: [],           // radioactive sites that tick the Geiger counter: { x, y, age }
  worm: null,            // the burrowing horror below -5,000 ft
  wormIntroSeen: false,
  crumbling: [],         // triggered ceiling tiles counting down: { x, y, t }
  debris: [],            // falling rocks: { x, y, vy, hit }
  _caveinIntro: false,
  meat: [],              // cooked worm meat drops: { x, y, vy }
  podGlowT: 0,           // level-up aura timer after eating meat
  robots: [],            // security automatons on the hunt
  roboLasers: [],        // slow dodgeable laser bolts: { x, y, vx, vy, life }
  roboHeads: [],         // dropped automaton heads: { x, y, vy }
  openingDoors: [],      // vault doors mid-slide: { x, y, t, room }
  empHolding: false,     // Q held down
  empCharge: 0,          // 0..1; fires at 1 on release
  empDoors: 0,           // bay door open fraction (visual)
  empWaves: [],          // expanding pulse rings: { x, y, age }
  empFlash: 0,
  _serverIntro: false,
  popups: [],            // floating "+$" texts
  input: { up: false, down: false, left: false, right: false },
  stars: [],
  deathCause: null,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    UI.init();
    Audio.loadVolumes();
    Audio.initMusic();
    this.mouse = { x: C.VIEW_W * 0.5, y: C.VIEW_H * 0.4 };
    this.canvas.addEventListener('mousemove', e => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
    });
    // Microwave Cannon: hold the left button to fire at the cursor
    this.mouseDown = false;
    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseDown = true; Audio.resume(); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    this.canvas.addEventListener('mouseleave', () => { this.mouseDown = false; });
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
          else UI.pauseMenu();      // world & fuel pause while any panel is open
          break;
        case 'KeyF': Player.useItem('fuelTank'); break;
        case 'KeyR': Player.useItem('nanobots'); break;
        case 'KeyX': Player.useItem('dynamite'); break;
        case 'KeyC': Player.useItem('plastic'); break;
        case 'KeyT': Player.useItem('teleporter'); break;
        case 'KeyQ':
          // Hold to charge the EMP burst (the teleporter moved to T for this)
          if (Player.hasEmpHead) this.empHolding = true;
          break;
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
      if (e.code === 'KeyQ') this.releaseEmp();
    });
    window.addEventListener('blur', () => {
      this.input.up = this.input.down = this.input.left = this.input.right = false;
      this.empHolding = false;
      this.empCharge = 0;
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
      const p = Math.pow(Math.min(1, depth / C.DEPTH_MAX), 1.2) * 0.035;
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
    // The tomb guardian is twice as fast and hungrier. Both cower in the
    // flashlight beam: 25% slower while lit.
    let spd = g.cursed ? 2.6 : 1.3;
    if (g.lit) spd *= 0.75;
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
      this.toast(g.cursed ? "The pharaoh's spirit drains your fuel!" : 'A ghost siphoned your fuel!');
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
    if (g.zapT > 0) g.zapT -= dt;
    // Flashlight burns it; the microwave beam (g.zapT, exposure added in
    // updateMicrowave) cooks it just as well — and the two stack
    if (g.lit || g.zapT > 0) {
      if (g.lit) g.exposure += dt;
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
        this.toast(g.cursed ? "The pharaoh's spirit burns back into the dust!" : 'Ghost burned away by your flashlight!');
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
    this.shockwaves = [];
    this.nukeClouds = [];
    this.fallout = [];
    this.worm = null;
    this.wormIntroSeen = false;
    this.alertT = 0;
    this.mwBeam = null;
    this._mwHeats = {};
    this.crumbling = [];
    this.debris = [];
    this._caveinIntro = false;
    this.meat = [];
    this.podGlowT = 0;
    this._iceIntro = false;
    this._prevFrost = 0;
    this.robots = [];
    this.roboLasers = [];
    this.roboHeads = [];
    this.openingDoors = [];
    this.empHolding = false;
    this.empCharge = 0;
    this.empDoors = 0;
    this.empWaves = [];
    this.empFlash = 0;
    this._serverIntro = false;
  },

  // --- Cooked worm meat: dropped by slain worms, eaten by driving over it.
  // Each piece permanently boosts the Microwave Cannon (max 2).
  updateMeat(dt) {
    if (this.podGlowT > 0) this.podGlowT -= dt;
    for (let i = this.meat.length - 1; i >= 0; i--) {
      const m = this.meat[i];
      // Settle onto the ground
      if (!World.isSolid(Math.floor(m.x), Math.floor(m.y + 0.4))) {
        m.vy = Math.min(m.vy + 18 * dt, 14);
        m.y += m.vy * dt;
      } else {
        m.vy = 0;
      }
      // Appetizing steam
      if (Math.random() < dt * 4) {
        Particles.spawn({
          x: m.x + (Math.random() - 0.5) * 0.3, y: m.y - 0.2,
          vx: (Math.random() - 0.5) * 0.5, vy: -0.8 - Math.random() * 0.6,
          life: 0.7, size: 0.07, color: '#bff5a0', glow: true, gravity: -0.5,
        });
      }
      // Nom
      if (!Player.dead && Player.teleporting <= 0
          && Math.hypot(Player.x - m.x, Player.y - m.y) < 0.85) {
        this.meat.splice(i, 1);
        Player.mwLevel = Math.min(2, (Player.mwLevel || 0) + 1);
        this.podGlowT = 1.8;
        Audio.play('powerup');
        Particles.burst(Player.x, Player.y, 26, { color: '#9dff5a', speed: 5, life: 0.9, size: 0.11, glow: true });
        Particles.burst(Player.x, Player.y, 12, { color: '#fff7c0', speed: 3, life: 1.1, size: 0.08, glow: true });
        this.warn(Player.mwLevel >= 2
          ? 'MICROWAVE BEAM COOKING AND MAXED OUT!'
          : 'MICROWAVE GUN POWERED UP 25%!', '#9dff5a');
      }
    }
  },

  // --- Cave-ins: cracked ceiling tiles crumble ~1 s after the pod passes
  // beneath them, dropping a rock. Drill (or microwave) them to clear safely.
  startCrumble(x, y) {
    if (this.crumbling.some(c => c.x === x && c.y === y)) return;
    this.crumbling.push({ x, y, t: C.CAVEIN.fuse });
    Audio.play('creak');
    if (!this._caveinIntro) {
      this._caveinIntro = true;
      this.warn('CAVE-IN! GET OUT FROM UNDER THE CRACKED ROCK!', '#e8b06a');
    }
  },

  updateCaveins(dt) {
    // Trigger: a cracked tile with open air below it, the pod underneath in
    // its column with nothing solid in between
    if (!Player.dead && Player.teleporting <= 0) {
      const py = Math.floor(Player.y);
      const px = Math.floor(Player.x);
      for (let x = px - 1; x <= px + 1; x++) {
        if (Math.abs(Player.x - (x + 0.5)) > 0.7) continue;
        for (let y = Math.max(2, py - 8); y < py; y++) {
          if (World.get(x, y) !== World.kindIndex.cracked) continue;
          if (World.get(x, y + 1) !== 0) continue;
          let clearPath = true;
          for (let yy = y + 1; yy < py; yy++) {
            if (World.isSolid(x, yy)) { clearPath = false; break; }
          }
          if (clearPath) this.startCrumble(x, y);
        }
      }
    }

    // Count down the telegraphs, then let go
    for (let i = this.crumbling.length - 1; i >= 0; i--) {
      const c = this.crumbling[i];
      c.t -= dt;
      // Dust trickling down while it groans
      if (Math.random() < dt * 14) {
        Particles.spawn({
          x: c.x + 0.2 + Math.random() * 0.6, y: c.y + 0.95,
          vx: (Math.random() - 0.5) * 0.4, vy: 1 + Math.random() * 1.5,
          life: 0.5, size: 0.06, color: '#8a6a4a', gravity: 8,
        });
      }
      if (c.t > 0) continue;
      this.crumbling.splice(i, 1);
      // Only falls if it wasn't already drilled/blasted away mid-telegraph
      if (World.get(c.x, c.y) !== World.kindIndex.cracked) continue;
      World.clear(c.x, c.y);
      this.debris.push({ x: c.x + 0.5, y: c.y + 0.5, vy: 2, hit: false });
      Audio.play('clank');
    }

    // Falling rocks
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy = Math.min(d.vy + 22 * dt, 20);
      d.y += d.vy * dt;
      // Clip the pod
      if (!d.hit && !Player.dead && Player.teleporting <= 0
          && Math.abs(d.x - Player.x) < 0.55 && Math.abs(d.y - Player.y) < 0.6) {
        d.hit = true;
        Audio.play('thud');
        this.shake(0.5);
        this.toast('Falling rock hit the pod!');
        Player.damage(C.CAVEIN.dmg, 'cavein');
        this.debris.splice(i, 1);
        Particles.dust(d.x, d.y, '#8a6a4a');
        Particles.burst(d.x, d.y, 8, { color: '#6a4a30', speed: 3, life: 0.5, size: 0.09 });
        continue;
      }
      // Shatter on the ground
      if (World.isSolid(Math.floor(d.x), Math.floor(d.y + 0.45)) || d.y > C.WORLD_H) {
        Audio.play('thud');
        Particles.dust(d.x, d.y + 0.3, '#8a6a4a');
        Particles.burst(d.x, d.y + 0.2, 10, { color: '#6a4a30', speed: 3.5, life: 0.5, size: 0.1, gravity: 6 });
        this.debris.splice(i, 1);
      }
    }
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

  // --- Microwave Cannon: hold click to cook one tile under the cursor ---
  updateMicrowave(dt) {
    const firing = Player.hasMicrowave && this.mouseDown && !Player.dead
      && Player.teleporting <= 0 && this.state === 'play' && !UI.isOpen();
    this.mwBeam = null;
    if (!firing) { Audio.setMicrowave(0); this._mwHeats = {}; this._mwAimX = null; return; }
    Audio.setMicrowave(1);

    // Worm-meat power-ups: each level heats 25% faster; level 2 widens the
    // focus to a 3x3 tile area
    const lvl = Player.mwLevel || 0;
    const rate = 1 + 0.25 * lvl;

    // The focused tile, anywhere on screen
    const T = C.TILE;
    const tx = Math.floor(this.cam.x + this.mouse.x / T);
    const ty = Math.floor(this.cam.y + this.mouse.y / T);
    const cx = tx + 0.5, cy = ty + 0.5;

    // Aim at YOURSELF to melt frost off the hull — a full bar takes
    // C.ICE.meltSecs, faster with worm-meat power levels
    if ((Player.frost || 0) > 0 && Math.hypot(cx - Player.x, cy - Player.y) < 1.1) {
      Player.frost = Math.max(0, Player.frost - (100 / C.ICE.meltSecs) * rate * dt);
      if (Math.random() < dt * 22) {
        Particles.spawn({
          x: Player.x + (Math.random() - 0.5) * 0.8, y: Player.y - 0.2 - Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 1.2, vy: -1.5 - Math.random() * 1.5,
          life: 0.6, size: 0.09, color: '#e8f8ff', glow: true, gravity: -1,
        });
      }
      this.mwBeam = { tx, ty, heat: 100 - Player.frost, needed: 100, kind: 'self' };
      return;
    }

    // The boss takes the beam too — steady searing damage in the arena
    if (Boss.active && !Boss.betweenForms
        && Math.hypot(cx - Boss.x, cy - (Boss.y - 1.8)) < 2.2 + (lvl >= 2 ? 0.8 : 0)) {
      Boss.microwave(dt, rate);
      if (Math.random() < dt * 24) {
        Particles.spawn({
          x: Boss.x + (Math.random() - 0.5) * 1.6, y: Boss.y - 1 - Math.random() * 2,
          vx: (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 2,
          life: 0.5, size: 0.11,
          color: Math.random() < 0.5 ? '#ffb04a' : '#e8f8ff', glow: true,
        });
      }
      this.mwBeam = { tx, ty, heat: 0, needed: 0, kind: 'boss' };
      return;
    }

    // The worm's bulk takes priority over whatever tile is behind it
    const w = this.worm;
    const wormR = 1.35 + (lvl >= 2 ? 0.8 : 0);
    if (w && !w.leaving && [{ x: w.x, y: w.y }, ...(w.segPos || [])]
        .some(p => Math.hypot(p.x - cx, p.y - cy) < wormR)) {
      w.cooked = (w.cooked || 0) + dt * rate;   // cumulative — its only weakness
      w.zapT = 0.15;
      // Steam and sparks boiling off the whole body, heavier as it cooks
      const boilRate = (26 + 30 * (w.cooked / C.MICROWAVE.heatWorm)) * rate;
      if (Math.random() < dt * boilRate) {
        const segs = [{ x: w.x, y: w.y }, ...(w.segPos || [])];
        const p = segs[Math.floor(Math.random() * segs.length)];
        Particles.spawn({
          x: p.x + (Math.random() - 0.5) * 1.4, y: p.y + (Math.random() - 0.5) * 1.4,
          vx: (Math.random() - 0.5) * 2, vy: -2.5 - Math.random() * 2.5,
          life: 0.6 + Math.random() * 0.4, size: 0.11,
          color: Math.random() < 0.55 ? '#e8f8ff' : (Math.random() < 0.5 ? '#ffb04a' : '#ff7a2f'),
          glow: true, gravity: -1,
        });
      }
      this.mwBeam = { tx, ty, heat: w.cooked, needed: C.MICROWAVE.heatWorm, kind: 'worm' };
      // Death handled in updateWorm so the bounty/burst logic stays in one place
      return;
    }

    // Security automatons: the beam arcs violently off the chassis — sparks
    // fly, the metal heats toward slag, and ~10 beam-seconds ends it
    const robotR = 1.0 + (lvl >= 2 ? 0.8 : 0);
    for (const r of this.robots) {
      if (Math.hypot(r.x - cx, (r.y - 0.1) - cy) >= robotR) continue;
      r.cooked += dt * rate;
      r.zapT = 0.15;
      if (r.dormant) r.dormant = false;   // cooking a sleeper wakes it VERY fast
      const hf = r.cooked / C.ROBOT.cookTime;
      // VIOLENT arc-flash: showers of sparks ricocheting off the chassis
      if (Math.random() < dt * (90 + 90 * hf)) {
        const burst = 2 + Math.floor(Math.random() * 3);
        for (let s = 0; s < burst; s++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 9;
          Particles.spawn({
            x: r.x + (Math.random() - 0.5) * 0.5, y: r.y - 0.15 + (Math.random() - 0.5) * 0.6,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
            life: 0.3 + Math.random() * 0.25, size: 0.055 + Math.random() * 0.05,
            color: Math.random() < 0.45 ? '#cfe8ff' : (Math.random() < 0.6 ? '#fff7c0' : '#ffd06a'),
            glow: true, gravity: 14,
          });
        }
      }
      // Occasional big white arc-pop
      if (Math.random() < dt * 7) {
        Particles.burst(r.x + (Math.random() - 0.5) * 0.5, r.y - 0.15 + (Math.random() - 0.5) * 0.5, 8,
          { color: '#ffffff', speed: 7, life: 0.22, size: 0.07, glow: true });
      }
      // Molten metal shedding once it's half gone
      if (hf > 0.4 && Math.random() < dt * 20 * hf) {
        Particles.spawn({
          x: r.x + (Math.random() - 0.5) * 0.5, y: r.y + 0.3,
          vx: (Math.random() - 0.5) * 0.8, vy: 1 + Math.random() * 1.5,
          life: 0.6, size: 0.09,
          color: Math.random() < 0.5 ? '#ffb04a' : '#ff7a2f', glow: true, gravity: 8,
        });
      }
      if (Math.random() < dt * 9) Audio.play('crackle');
      this.mwBeam = { tx, ty, heat: r.cooked, needed: C.ROBOT.cookTime, kind: 'robot' };
      return;
    }

    // Ghosts sizzle under the beam — stacks with the flashlight burn
    const g = this.ghost;
    if (g && g.fading <= 0 && Math.hypot(g.x - cx, g.y - cy) < 0.95 + (lvl >= 2 ? 0.7 : 0)) {
      g.exposure += dt * rate;
      g.zapT = 0.15;
      this.mwBeam = { tx, ty, heat: g.exposure, needed: 3, kind: 'ghost' };
      return;
    }

    // Tile targets: one at the cursor — or the whole 3x3 around it at max
    // level. Heat is tracked per tile and drops if the beam moves away.
    const offsets = lvl >= 2
      ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[0, 0]];
    const kindOf = id2 => {
      if (id2 === World.kindIndex.nuke) return ['nuke', C.MICROWAVE.heatNuke];
      if (id2 === World.kindIndex.magnetite) return ['magnet', C.MICROWAVE.heatMagnet];
      if (id2 === World.kindIndex.steam) return ['steam', C.MICROWAVE.heatSteam];
      if (id2 === World.kindIndex.gas) return ['gas', C.MICROWAVE.heatGas];
      if (id2 === World.kindIndex.cracked) return ['crack', C.MICROWAVE.heatCrack];
      if (id2 === World.kindIndex.ice) return ['ice', C.MICROWAVE.heatIce];
      return [null, 0];
    };
    const carried = {};
    let center = { tx, ty, heat: 0, needed: 0, kind: null };
    for (const [ox, oy] of offsets) {
      const x = tx + ox, y = ty + oy;
      const [kind2, needed2] = kindOf(World.get(x, y));
      if (!kind2) continue;
      const key2 = kind2 + ':' + x + ',' + y;
      const heat2 = ((this._mwHeats && this._mwHeats[key2]) || 0) + dt * rate;
      if (ox === 0 && oy === 0) center = { tx, ty, heat: heat2, needed: needed2, kind: kind2 };
      // Boiling bubbles while a target cooks
      if (Math.random() < dt * (8 + 24 * (heat2 / needed2))) {
        Particles.spawn({
          x: x + 0.2 + Math.random() * 0.6, y: y + 0.2 + Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 1.2, vy: -1 - Math.random() * 1.5,
          life: 0.45, size: 0.07,
          color: kind2 === 'magnet' ? '#c99cff' : kind2 === 'steam' ? '#9fd8e8' : '#ffd97a',
          glow: true,
        });
      }
      if (heat2 < needed2) { carried[key2] = heat2; continue; }
      this.mwResolve(kind2, x, y);
    }
    this._mwHeats = carried;
    this.mwBeam = center;
  },

  // A tile target finished cooking — apply its effect
  mwResolve(kind, tx, ty) {
    const cx = tx + 0.5, cy = ty + 0.5;
    const boom = Player.mwLevel >= 2 ? 1.5 : 1;   // maxed cannon hits harder
    if (kind === 'nuke') {
      this.armNuke(tx, ty);        // "safe disposal", as promised
    } else if (kind === 'crack') {
      // Knock the loose rock down from a safe distance
      this.startCrumble(tx, ty);
    } else if (kind === 'ice') {
      // Melted in place — no frost, no shards, just steam
      World.clear(tx, ty);
      Audio.play('steam');
      Particles.burst(cx, cy, Math.round(10 * boom), { color: '#e8f8ff', speed: 2.5, life: 0.7, size: 0.11, gravity: -2 });
    } else if (kind === 'gas') {
      // The vapor flashes over the moment the beam touches it — remote
      // detonation is the whole point, but standing close still hurts
      World.blast(tx, ty, 1).forEach(nn => this.armNuke(nn.x, nn.y));
      Particles.explosion(cx, cy, 1.2 * boom);
      Particles.burst(cx, cy, Math.round(20 * boom), { color: '#9fe870', speed: 7, life: 0.5, size: 0.12, glow: true });
      Audio.play('gas');
      this.shake(0.7 * boom);
      const pd = Math.hypot(Player.x - cx, Player.y - cy);
      if (pd < 2.4 && !Player.dead) {
        const feet = C.rowToFeet(ty);
        const raw = Math.round(((feet - 3000) / 15) * (1 - Player.heatResist()) * (1 - pd / 3));
        const dmg = Math.max(1, Math.min(raw, Math.floor(Player.hullCap() * C.GAS_DMG_CAP)));
        Player.damage(dmg, 'gas');
      }
      this.toast('Gas pocket ignited from range!');
    } else if (kind === 'magnet') {
      // Superheated lodestone bursts, taking its own tile with it
      World.clear(tx, ty);
      Audio.play('mwPop');
      this.shake(0.35 * boom);
      Particles.burst(cx, cy, Math.round(18 * boom), { color: '#b56cff', speed: 5, life: 0.6, size: 0.1, glow: true });
      Particles.burst(cx, cy, Math.round(8 * boom), { color: '#e8d9ff', speed: 3, life: 0.8, size: 0.08, glow: true });
      this.toast('Lodestone boiled away!');
    } else if (kind === 'steam') {
      // The whole connected spring flashes to steam and bursts one tile out
      const seenT = new Set([tx + ',' + ty]);
      const stack = [[tx, ty]];
      World.clear(tx, ty);
      while (stack.length) {
        const [gx2, gy2] = stack.pop();
        for (const [nx, ny] of [[gx2 + 1, gy2], [gx2 - 1, gy2], [gx2, gy2 + 1], [gx2, gy2 - 1]]) {
          const k2 = nx + ',' + ny;
          if (seenT.has(k2)) continue;
          if (World.get(nx, ny) === World.kindIndex.steam) {
            seenT.add(k2);
            stack.push([nx, ny]);
            World.clear(nx, ny);
            Particles.burst(nx + 0.5, ny + 0.5, 7, { color: '#9fd8e8', speed: 4, life: 0.5, size: 0.1 });
          }
        }
      }
      World.blast(tx, ty, 1).forEach(n => this.armNuke(n.x, n.y));
      Audio.play('steam');
      Audio.play('mwPop');
      this.shake(0.5 * boom);
      Particles.burst(cx, cy, Math.round(20 * boom), { color: '#e8f8ff', speed: 6, life: 0.7, size: 0.13, gravity: -2 });
      this.toast('Spring boiled off — pressure vented!');
    }
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

    // Age the visual aftermath
    for (const s of this.shockwaves) s.age += dt;
    this.shockwaves = this.shockwaves.filter(s => s.age < 1.2);
    for (const m of this.nukeClouds) m.age += dt;
    this.nukeClouds = this.nukeClouds.filter(m => m.age < C.NUKE.cloudLife);

    // Fallout: inside a blast site's damage radius the Geiger counter ticks,
    // faster near the center, tapering as the site cools over two minutes
    let rad = 0;
    for (const f of this.fallout) {
      f.age += dt;
      const d = Math.hypot(Player.x - (f.x + 0.5), Player.y - (f.y + 0.5));
      if (d < C.NUKE.dmgRadius) {
        rad = Math.max(rad, (1 - d / C.NUKE.dmgRadius) * (1 - f.age / C.NUKE.falloutLife));
      }
    }
    this.fallout = this.fallout.filter(f => f.age < C.NUKE.falloutLife);
    if (rad > 0.02 && !Player.dead && Math.random() < dt * (4 + 32 * rad)) Audio.play('geiger');

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
    this.shockwaves.push({ x: n.x + 0.5, y: n.y + 0.5, age: 0 });
    this.nukeClouds.push({ x: n.x + 0.5, y: n.y + 0.5, age: 0, seed: (n.x * 31 + n.y * 7) % 100 });
    this.fallout.push({ x: n.x, y: n.y, age: 0 });
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
    this.onExplosion(n.x, n.y, C.NUKE.blastRadius);   // even a nuke only annoys the worm
    this.toast('Nuclear detonation!');
  },

  // Explosives don't hurt the worm — its hide shrugs them off. Only the
  // Microwave Cannon cooks it. This just gives the player feedback.
  onExplosion(cx, cy, r) {
    const w = this.worm;
    if (!w || w.leaving) return;
    const hit = [{ x: w.x, y: w.y }, ...(w.segPos || [])]
      .some(p => Math.hypot(p.x - (cx + 0.5), p.y - (cy + 0.5)) <= r + 1.6);
    if (hit && (!this._wormShrugT || this.time - this._wormShrugT > 3)) {
      this._wormShrugT = this.time;
      Audio.play('wormRoar');
      this.toast(Player.hasMicrowave
        ? 'The blast just angers it — use the MICROWAVE CANNON!'
        : 'The blast just angers it — its hide is too thick!');
    }
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
    if (w.zapT > 0) w.zapT -= dt;

    // Cooked through — the Microwave Cannon is the only thing that kills it
    if ((w.cooked || 0) >= C.MICROWAVE.heatWorm) {
      this.killWorm();
      return;
    }

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
    // A perfectly cooked, glowing morsel — the cannon's next power-up
    if ((Player.mwLevel || 0) < 2) {
      this.meat.push({ x: w.x, y: w.y, vy: 0 });
    }
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
    this.warn("THE PHARAOH'S SPIRIT AWAKENS!", '#ffd76e');
    this.shake(1);
    this.spawnGhost({ cursed: true });
  },

  // --- AI server rooms: vaults in the deep permafrost. Any casing tile lost
  // (drill, blast, worm, EMP) trips the alarm — the door opens and a security
  // automaton marches out after the pod. ---
  updateServers(dt) {
    const pf = Player.depthFeet();
    if (!this._serverIntro && pf >= C.SERVER.minFt && !Player.dead) {
      this._serverIntro = true;
      this.warn('DEEP PERMAFROST… SOMETHING IS HUMMING IN THE ICE', '#8fd8ff');
    }
    for (const room of World.serverRooms || []) {
      if (room.alarmed) continue;
      for (const t of room.tiles) {
        if (World.get(t.x, t.y) === 0) { this.triggerAlarm(room); break; }
      }
    }

    // Doors mid-slide: grind, rattle, then release the automaton
    for (let i = this.openingDoors.length - 1; i >= 0; i--) {
      const d = this.openingDoors[i];
      d.t += dt;
      if (Math.random() < dt * 6) Audio.play('servo');
      if (Math.random() < dt * 20) {
        Particles.spawn({
          x: d.x + 0.5 + (Math.random() - 0.5) * 0.6, y: d.y + 0.15 + Math.random() * 0.7,
          vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.8,
          life: 0.4, size: 0.06, color: '#aeb8c6', gravity: 4,
        });
      }
      if (d.t < C.ROBOT.doorSecs) continue;
      this.openingDoors.splice(i, 1);
      World.clear(d.x, d.y);
      Audio.play('clank');
      this.shake(0.3);
      Particles.burst(d.x + 0.5, d.y + 0.5, 14, { color: '#8fd8ff', speed: 4, life: 0.6, size: 0.1, glow: true });
      this.robots.push({
        x: d.x + 0.5, y: d.y + 0.5, vx: 0, vy: 0,
        facing: 1, walkPhase: 0, flying: false, dormant: false, aim: 0,
        cooked: 0, zapT: 0, laserCd: 1.6, punchCd: 0.8, age: 0,
        emergeT: C.ROBOT.emergeSecs, room: d.room,
      });
    }
  },

  // The drill only has to TOUCH the casing for the AI to notice
  onServerBreach(x, y) {
    for (const room of World.serverRooms || []) {
      if (room.alarmed) continue;
      if (x >= room.x0 && x < room.x0 + room.w && y >= room.y0 && y < room.y0 + room.h) {
        this.triggerAlarm(room);
      }
    }
  },

  triggerAlarm(room) {
    room.alarmed = true;
    Audio.play('alarm');
    this.warn('⚠ AI ALARM — SECURITY DOOR OPENING!', '#ff5540');
    this.shake(0.5);
    // The door grinds open first; the automaton steps out when it's done
    this.openingDoors.push({ x: room.doorX, y: room.doorY, t: 0, room });
    Audio.play('servo');
  },

  // A room keeps its built-hall look while at least half its casing stands
  // (checked once per frame, cached)
  roomIntact(room) {
    if (this._roomIntactFrame !== this.time) {
      this._roomIntactFrame = this.time;
      this._roomIntactCache = new Map();
    }
    let ok = this._roomIntactCache.get(room);
    if (ok === undefined) {
      let standing = 0;
      for (const t of room.tiles) if (World.get(t.x, t.y) !== 0) standing++;
      ok = standing >= room.tiles.length * 0.5;
      this._roomIntactCache.set(room, ok);
    }
    return ok;
  },

  // Door slide progress (0..1) for a tile, or 0 if it isn't animating
  doorAnimAt(x, y) {
    for (const d of this.openingDoors) {
      if (d.x === x && d.y === y) return Math.min(1, d.t / C.ROBOT.doorSecs);
    }
    return 0;
  },

  // Straight-line visibility check for the automaton's fire control
  hasLineOfSight(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / 0.25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (World.isSolid(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
    }
    return true;
  },

  // Axis-separated tile collision for an automaton (narrower than the pod)
  moveRobot(r, dt) {
    const hw = 0.3, hh = 0.45;
    let nx = r.x + r.vx * dt;
    const dirX = Math.sign(r.vx);
    if (dirX !== 0) {
      const tx = Math.floor(nx + dirX * hw);
      for (let ty = Math.floor(r.y - hh + 0.02); ty <= Math.floor(r.y + hh - 0.02); ty++) {
        if (World.isSolid(tx, ty)) { nx = dirX > 0 ? tx - hw - 0.001 : tx + 1 + hw + 0.001; r.vx = 0; break; }
      }
    }
    r.x = nx;
    let ny = r.y + r.vy * dt;
    const dirY = Math.sign(r.vy);
    if (dirY !== 0) {
      const ty = Math.floor(ny + dirY * hh);
      for (let tx = Math.floor(r.x - hw + 0.02); tx <= Math.floor(r.x + hw - 0.02); tx++) {
        if (World.isSolid(tx, ty)) { ny = dirY > 0 ? ty - hh - 0.001 : ty + 1 + hh + 0.001; r.vy = 0; break; }
      }
    }
    r.y = ny;
  },

  // --- The security automatons: relentless half-speed pursuit, walking the
  // floors and rocketing up shafts. Only the Microwave Cannon melts them. ---
  updateRobots(dt) {
    const R = C.ROBOT;
    for (let i = this.robots.length - 1; i >= 0; i--) {
      const r = this.robots[i];
      r.age += dt;
      if (r.zapT > 0) r.zapT -= dt;
      r.punchCd = Math.max(0, r.punchCd - dt);

      // Melted through — it detonates
      if (r.cooked >= R.cookTime) { this.killRobot(i); continue; }

      const dx = Player.x - r.x, dy = Player.y - r.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Booting up in the doorway: eyes flickering on, systems spinning up
      if (r.emergeT > 0) {
        r.emergeT -= dt;
        r.facing = dx < 0 ? -1 : 1;
        r.aim = Math.atan2(dy, dx);
        if (Math.random() < dt * 8) Audio.play('servo');
        continue;
      }

      // Power management: it never gives up, it just waits
      if (r.dormant) {
        if (dist < R.wakeDist && !Player.dead && Player.teleporting <= 0) {
          r.dormant = false;
          Audio.play('servo');
          this.toast('Red eyes flare in the dark — the automaton reboots!');
        } else {
          // Settle onto the ground and idle
          r.flying = false;
          r.vx = 0;
          r.vy = World.isSolid(Math.floor(r.x), Math.floor(r.y + 0.5)) ? 0 : Math.min(r.vy + C.GRAVITY * dt, 12);
          this.moveRobot(r, dt);
          continue;
        }
      }
      if (dist * 1 > R.leash || Player.dead) { r.dormant = true; continue; }

      r.facing = dx < 0 ? -1 : 1;
      r.aim = Math.atan2(dy - 0.1, dx);

      // No progress for a while? Nothing stops it: it lasers the material
      // away tile by tile, cutting straight toward the pod
      if (!r._lastPos || Math.hypot(r.x - r._lastPos.x, r.y - r._lastPos.y) > 0.2) {
        r._lastPos = { x: r.x, y: r.y };
        r._stuckT = 0;
        r.mining = null;
      } else {
        r._stuckT = (r._stuckT || 0) + dt;
      }
      if (r._stuckT > 0.8 && dist > 1.1) {
        if (!r.mining) {
          // Prefer the axis with the most ground to cover
          const cxr = Math.floor(r.x), cyr = Math.floor(r.y);
          const cands = Math.abs(dx) >= Math.abs(dy)
            ? [[cxr + Math.sign(dx), cyr], [cxr, cyr + Math.sign(dy) || 1]]
            : [[cxr, cyr + Math.sign(dy)], [cxr + (Math.sign(dx) || 1), cyr]];
          for (const [tx, ty] of cands) {
            if (tx <= 0 || tx >= C.WORLD_W - 1 || ty <= 1 || ty >= C.GROUND_BOTTOM_ROW - 1) continue;
            const id = World.get(tx, ty);
            if (id === 0 || id === World.kindIndex.serverDoor) continue;
            r.mining = { x: tx, y: ty, t: R.mineSecs };
            break;
          }
        }
        if (r.mining) {
          const m = r.mining;
          // Clamp in place and burn through
          r.vx = 0; r.vy = 0; r.flying = false;
          r.aim = Math.atan2(m.y + 0.5 - (r.y - 0.12), m.x + 0.5 - r.x);
          r.facing = m.x + 0.5 < r.x ? -1 : 1;
          m.t -= dt;
          if (Math.random() < dt * 24) {
            Particles.spawn({
              x: m.x + 0.2 + Math.random() * 0.6, y: m.y + 0.2 + Math.random() * 0.6,
              vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2,
              life: 0.4, size: 0.08,
              color: Math.random() < 0.6 ? '#ff6a4a' : '#ffd97a', glow: true, gravity: 6,
            });
          }
          if (Math.random() < dt * 5) Audio.play('crackle');
          if (m.t <= 0) {
            if (World.get(m.x, m.y) === World.kindIndex.nuke) this.armNuke(m.x, m.y);
            else World.clear(m.x, m.y);
            Audio.play('mwPop');
            Particles.burst(m.x + 0.5, m.y + 0.5, 10, { color: '#ff6a4a', speed: 3.5, life: 0.5, size: 0.09, glow: true });
            r.mining = null;
            r._stuckT = 0;
            r._lastPos = null;
          }
          continue;   // fully occupied with cutting
        }
      }

      // Movement: walk at half pace; kick in the rocket when the pod is above
      // or a wall/rack wants climbing over
      const grounded = World.isSolid(Math.floor(r.x), Math.floor(r.y + 0.55)) && r.vy >= 0;
      const aheadX = Math.floor(r.x + Math.sign(dx) * 0.45);
      const rowY = Math.floor(r.y);
      const blockedAhead = World.isSolid(aheadX, rowY);
      // It can start a climb if there's air above it OR above the obstacle
      const canClimb = !World.isSolid(Math.floor(r.x), rowY - 1) || !World.isSolid(aheadX, rowY - 1);
      r.flying = dy < -0.8 || (blockedAhead && canClimb && dy < 0.5);
      if (r.flying) {
        // A wall in the way at this level? Boost UP first, then over
        const wallAtLevel = World.isSolid(Math.floor(r.x + Math.sign(dx) * 0.6), rowY);
        if (wallAtLevel && dy > -3) {
          r.vx = Math.sign(dx) * R.flySpeed * 0.35;
          r.vy = -R.flySpeed;
        } else {
          r.vx = (dx / dist) * R.flySpeed;
          r.vy = (dy / dist) * R.flySpeed;
        }
        // Rocket wash
        if (Math.random() < dt * 30) {
          Particles.spawn({
            x: r.x + (Math.random() - 0.5) * 0.2, y: r.y + 0.45,
            vx: (Math.random() - 0.5) * 1.5, vy: 2.5 + Math.random() * 2,
            life: 0.35, size: 0.09,
            color: Math.random() < 0.5 ? '#ffb347' : '#8fd8ff', glow: true,
          });
        }
      } else {
        r.vy = Math.min(r.vy + C.GRAVITY * dt, 14);
        if (grounded) r.vx = Math.abs(dx) > 0.35 ? Math.sign(dx) * R.walkSpeed : 0;
      }
      this.moveRobot(r, dt);
      if (!r.flying && Math.abs(r.vx) > 0.1) r.walkPhase += dt * 9;

      // Servo whine when close — dread you can hear
      if (dist < 8 && Math.random() < dt * 1.2) Audio.play('servo');

      // Close quarters: a piston-driven hammer blow
      if (dist < 0.95 && r.punchCd <= 0 && !Player.dead && Player.teleporting <= 0) {
        r.punchCd = R.punchCd;
        Audio.play('clank');
        this.shake(0.5);
        Player.vx = (dx / dist) * 7;
        Player.vy = -2.5;
        this.toast('The automaton hammers your hull!');
        Player.damage(R.punchDmg, 'robot');
      }

      // Laser fire: slow, glowing, dodgeable — and it HURTS
      r.laserCd -= dt;
      if (r.laserCd <= 0 && dist < R.laserRange && !Player.dead && Player.teleporting <= 0
          && this.hasLineOfSight(r.x, r.y - 0.15, Player.x, Player.y)) {
        r.laserCd = R.laserCd * (0.8 + Math.random() * 0.5);
        this.roboLasers.push({
          x: r.x + (dx / dist) * 0.4, y: r.y - 0.12 + (dy / dist) * 0.4,
          vx: (dx / dist) * R.laserSpeed, vy: (dy / dist) * R.laserSpeed, life: 4,
        });
        Audio.play('laser');
      }
    }

    // Laser bolts in flight
    for (let i = this.roboLasers.length - 1; i >= 0; i--) {
      const b = this.roboLasers[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (Math.random() < dt * 24) {
        Particles.spawn({
          x: b.x, y: b.y, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
          life: 0.25, size: 0.06, color: '#ff6a4a', glow: true,
        });
      }
      if (!Player.dead && Player.teleporting <= 0
          && Math.abs(b.x - Player.x) < 0.45 && Math.abs(b.y - Player.y) < 0.5) {
        Audio.play('fireball');
        this.shake(0.7);
        Particles.burst(b.x, b.y, 14, { color: '#ff4a30', speed: 5, life: 0.5, size: 0.1, glow: true });
        this.toast('Laser bolt sears the hull!');
        Player.damage(C.ROBOT.laserDmg, 'robot');
        this.roboLasers.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || World.isSolid(Math.floor(b.x), Math.floor(b.y))) {
        Particles.burst(b.x, b.y, 6, { color: '#ff4a30', speed: 3, life: 0.4, size: 0.08, glow: true });
        this.roboLasers.splice(i, 1);
      }
    }

    // Dropped heads: settle, smoulder, get collected
    for (let i = this.roboHeads.length - 1; i >= 0; i--) {
      const h = this.roboHeads[i];
      if (!World.isSolid(Math.floor(h.x), Math.floor(h.y + 0.4))) {
        h.vy = Math.min(h.vy + 18 * dt, 14);
        h.y += h.vy * dt;
      } else {
        h.vy = 0;
      }
      if (Math.random() < dt * 3) {
        Particles.spawn({
          x: h.x + (Math.random() - 0.5) * 0.2, y: h.y - 0.15,
          vx: (Math.random() - 0.5) * 0.3, vy: -0.6 - Math.random() * 0.5,
          life: 0.8, size: 0.07, color: '#6b6b66', gravity: -0.5,
        });
      }
      if (!Player.dead && Player.teleporting <= 0
          && Math.hypot(Player.x - h.x, Player.y - h.y) < 0.85) {
        this.roboHeads.splice(i, 1);
        this.deliverHeadDialogue();
      }
    }
  },

  killRobot(i) {
    const r = this.robots[i];
    this.robots.splice(i, 1);
    if (r.room) r.room.robotDown = true;
    Audio.play('roboBoom');
    this.shake(1.1);
    Particles.explosion(r.x, r.y, 1.6);
    // White-hot slag and dark shrapnel
    Particles.burst(r.x, r.y, 18, { color: '#ffd97a', speed: 6, life: 0.6, size: 0.11, glow: true, gravity: 6 });
    Particles.burst(r.x, r.y, 12, { color: '#3c434f', speed: 4.5, life: 0.8, size: 0.1, gravity: 9 });
    if (!Player.hasEmpHead) {
      this.roboHeads.push({ x: r.x, y: r.y - 0.2, vy: 0 });
      this.toast('The automaton detonates — its head survives the blast…');
    } else {
      Player.money += C.SERVER.salvage;
      this.popup(r.x, r.y - 1, '+$' + C.SERVER.salvage.toLocaleString(), '#8fd8ff');
      this.toast(`Automaton scrapped: +$${C.SERVER.salvage.toLocaleString()}`);
    }
  },

  // Picking up the head: Mr. Natas slips, then covers — and you gain the EMP
  deliverHeadDialogue() {
    Audio.play('radio');
    this.pauseForDialog();
    UI.transmission({
      from: 'Mr. Natas — Natas Mining Corp.',
      portrait: 'natas',
      text: 'Why are you destroying my... ugh...I mean...ugh...wow! Why are there servers down here? Are you okay? Looks like that machine is doing something? Try holding [Q].',
    }, () => {
      Player.hasEmpHead = true;
      UI.toast('AUTOMATON HEAD installed — hold Q to charge the EMP');
      Audio.play('powerup');
      this.resumeFromDialog();
    });
  },

  // --- EMP burst: hold Q to open the bay and charge; release at full to fire ---
  updateEmp(dt) {
    this.empFlash = Math.max(0, this.empFlash - dt);
    for (const wv of this.empWaves) wv.age += dt;
    this.empWaves = this.empWaves.filter(wv => wv.age < 0.9);

    const charging = this.empHolding && Player.hasEmpHead && !Player.dead && Player.teleporting <= 0;
    const doorTarget = charging ? 1 : 0;
    this.empDoors += (doorTarget - this.empDoors) * Math.min(1, dt * 9);
    if (!charging) return;

    const prev = this.empCharge;
    this.empCharge = Math.min(1, this.empCharge + dt / C.EMP.chargeSecs);
    if (this.empCharge >= 1) {
      if (prev < 1) Audio.play('empReady');
      // Holding at max: arcs crawling over the hull
      if (Math.random() < dt * 6) Audio.play('crackle');
      if (Math.random() < dt * 24) {
        Particles.spawn({
          x: Player.x + (Math.random() - 0.5) * 0.9, y: Player.y + (Math.random() - 0.5) * 0.9,
          vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
          life: 0.3, size: 0.07, color: Math.random() < 0.6 ? '#8fd8ff' : '#e8f8ff', glow: true,
        });
      }
    } else {
      // Rising charge whine
      this._empToneT = (this._empToneT || 0) - dt;
      if (this._empToneT <= 0) {
        Audio.beep(240 + 920 * this.empCharge, 0.06);
        this._empToneT = 0.12;
      }
    }
  },

  releaseEmp() {
    if (!this.empHolding) return;
    this.empHolding = false;
    if (this.empCharge >= 1 && this.state === 'play' && Player.hasEmpHead && !Player.dead) this.fireEmp();
    this.empCharge = 0;
  },

  fireEmp() {
    const rate = 1 + 0.25 * (Player.mwLevel || 0);
    const cx = Player.x, cy = Player.y;
    // Everything mineral is vaporized outright (no cargo — the pulse leaves nothing)
    World.empBlast(cx, cy, C.EMP.radius).forEach(n => this.armNuke(n.x, n.y));
    // …and everything alive takes ten beam-seconds at once
    const w = this.worm;
    if (w && !w.leaving && [{ x: w.x, y: w.y }, ...(w.segPos || [])]
        .some(p => Math.hypot(p.x - cx, p.y - cy) <= C.EMP.radius)) {
      w.cooked = (w.cooked || 0) + C.EMP.heatSecs * rate;
      w.zapT = 0.3;
    }
    const g = this.ghost;
    if (g && g.fading <= 0 && Math.hypot(g.x - cx, g.y - cy) <= C.EMP.radius) {
      g.exposure += C.EMP.heatSecs * rate;
      g.zapT = 0.3;
    }
    for (const r of this.robots) {
      if (Math.hypot(r.x - cx, r.y - cy) <= C.EMP.radius) { r.cooked += C.EMP.heatSecs * rate; r.zapT = 0.3; }
    }
    if (Boss.active && !Boss.betweenForms
        && Math.hypot(Boss.x - cx, (Boss.y - 1.8) - cy) <= C.EMP.radius) {
      Boss.microwave(C.EMP.heatSecs, rate);
    }
    Audio.play('empBlast');
    this.shake(2.2);
    this.empFlash = 0.5;
    this.empWaves.push({ x: cx, y: cy, age: 0 });
    this.warn('EMP DISCHARGE!', '#8fd8ff');
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 2.5;
      Particles.spawn({
        x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr,
        vx: Math.cos(a) * (6 + Math.random() * 9), vy: Math.sin(a) * (6 + Math.random() * 9),
        life: 0.45 + Math.random() * 0.4, size: 0.12,
        color: Math.random() < 0.6 ? '#8fd8ff' : '#e8f8ff', glow: true,
      });
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

    // Music sits forward on the title screen, tucks behind the mining underground
    Audio.setMusicLevel(this.state === 'title' ? 0.5 : 0.18);

    if (this.state !== 'play') { Particles.update(dt); Audio.setWind(0); Audio.setTreads(0); Audio.setGeyser(0); Audio.setRumble(0); Audio.setMagnet(0); Audio.setMicrowave(0); Audio.thrustOff(); return; }
    // Shop menus pause the world (and the fuel drain), as in the original
    if (UI.isOpen()) { Particles.update(dt); Audio.setWind(0); Audio.setTreads(0); Audio.setGeyser(0); Audio.setRumble(0); Audio.setMagnet(0); Audio.setMicrowave(0); Audio.thrustOff(); return; }

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
    this.updateMicrowave(dt);
    this.updateNukes(dt);
    this.updateWorm(dt);
    this.updateCaveins(dt);
    this.updateMeat(dt);
    this.updateServers(dt);
    this.updateRobots(dt);
    this.updateEmp(dt);
    this.checkPyramids();

    // Fuel-low banner: fires each time fuel crosses down through the warn line
    if (this.fuelWarnT > 0) this.fuelWarnT -= dt;
    const fuelFrac = Player.fuel / Player.fuelCap();
    if (fuelFrac <= C.FUEL_WARN_FRAC && this._prevFuelFrac > C.FUEL_WARN_FRAC && !Player.dead) {
      this.fuelWarnT = 3.5;
      Audio.play('denied');
    }
    this._prevFuelFrac = fuelFrac;

    // Frost warnings: entering the permafrost band, and nearing a total freeze
    const pf = Player.depthFeet();
    if (!this._iceIntro && pf >= C.ICE.minFt && pf <= C.ICE.maxFt && !Player.dead) {
      this._iceIntro = true;
      this.warn('PERMAFROST! DRILLING ICE FROSTS THE POD!', '#8fd8ff');
      Audio.play('iceBreak');
    }
    if ((Player.frost || 0) >= 75 && (this._prevFrost || 0) < 75 && !Player.dead) {
      this.warn('FREEZING! MICROWAVE YOURSELF TO MELT THE ICE!', '#8fd8ff');
      Audio.play('denied');
    }
    if ((Player.frost || 0) >= 100 && (this._prevFrost || 0) < 100 && !Player.dead) {
      this.warn('FROZEN SOLID! MICROWAVE YOURSELF FREE!', '#8fd8ff');
      Audio.play('shatter');
      this.shake(0.6);
      Particles.burst(Player.x, Player.y, 24, { color: '#cfeefc', speed: 5, life: 0.8, size: 0.11, glow: true });
    }
    this._prevFrost = Player.frost || 0;

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
        microwave: Player.hasMicrowave,
        mwFiring: !!this.mwBeam,
        hasHead: Player.hasEmpHead,
        empDoors: this.empDoors || 0,
        empCharge: this.empCharge || 0,
      });
      // Frost claiming the hull stage by stage as the ICE bar fills: every
      // 10% another patch crystallizes, then a full icy sheet builds, then
      // icicles multiply and lengthen toward the total freeze
      if ((Player.frost || 0) > 0) {
        const fr = Player.frost / 100;
        const T2 = C.TILE;
        ctx.save();
        // Stage 1 — frost patches, one per 10%, each blooming in as it lands
        const patches = [
          [-0.34, 0.26, 0.14], [0.36, 0.28, 0.12], [-0.42, -0.02, 0.13], [0.42, 0.06, 0.14],
          [-0.18, -0.34, 0.12], [0.22, -0.3, 0.13], [0.02, 0.38, 0.15], [-0.3, 0.12, 0.16],
          [0.3, -0.12, 0.15], [0.0, -0.1, 0.2],
        ];
        const lit = fr * patches.length;
        for (let i = 0; i < Math.ceil(lit) && i < patches.length; i++) {
          const grow = Math.min(1, lit - i);                 // newest patch fades in
          const [pxf, pyf, prf] = patches[i];
          const cx2 = podX + pxf * T2, cy2 = podY + pyf * T2;
          const pr = prf * T2 * (0.6 + 0.4 * grow);
          const pg = ctx.createRadialGradient(cx2, cy2, pr * 0.15, cx2, cy2, pr);
          pg.addColorStop(0, `rgba(235,248,255,${0.7 * grow})`);
          pg.addColorStop(0.7, `rgba(190,228,252,${0.45 * grow})`);
          pg.addColorStop(1, 'rgba(170,215,248,0)');
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(cx2, cy2, pr, 0, Math.PI * 2); ctx.fill();
        }
        // Stage 2 — past 35% a continuous icy sheet builds over everything
        if (fr > 0.35) {
          ctx.globalAlpha = ((fr - 0.35) / 0.65) * 0.85;
          const ig = ctx.createLinearGradient(podX, podY - T2 * 0.45, podX, podY + T2 * 0.45);
          ig.addColorStop(0, 'rgba(210,240,255,0.75)');
          ig.addColorStop(0.55, 'rgba(150,210,245,0.4)');
          ig.addColorStop(1, 'rgba(120,180,230,0.65)');
          ctx.fillStyle = ig;
          Sprites.rr(ctx, podX - T2 * 0.44, podY - T2 * 0.46, T2 * 0.88, T2 * 0.92, T2 * 0.16);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // Stage 3 — icicles from 20%: more of them, and longer, as it worsens
        if (fr > 0.2) {
          const count = 1 + Math.floor(((fr - 0.2) / 0.8) * 6);
          ctx.fillStyle = `rgba(200,235,255,${0.5 + 0.4 * fr})`;
          for (let i = 0; i < count; i++) {
            const ix = podX - T2 * 0.36 + (i + 0.5) * (T2 * 0.72 / count);
            const il = T2 * (0.05 + 0.28 * fr) * (i % 2 ? 0.65 : 1);
            ctx.beginPath();
            ctx.moveTo(ix - T2 * 0.035, podY + T2 * 0.44);
            ctx.lineTo(ix, podY + T2 * 0.44 + il);
            ctx.lineTo(ix + T2 * 0.035, podY + T2 * 0.44);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
    this.drawLighting(ctx);
    this.drawServerGlow(ctx);
    this.drawGimmickFx(ctx);
    this.drawRobotFx(ctx);
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
    // EMP discharge: a cold blue-white snap
    if (this.empFlash > 0) {
      ctx.fillStyle = `rgba(200,235,255,${Math.min(1, this.empFlash * 1.5)})`;
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
    this._gasVis = [];
    this._rackVis = [];
    this._doorVis = [];

    for (let y = y0; y <= y1; y++) {
      const band = Sprites.bandForRow(y);
      // Permafrost band: everything gets a cold blue cast, strongest mid-band.
      // Below it the deep permafrost keeps a steady frozen-dirt chill down to
      // deepMaxFt, with frost flecks in the soil itself.
      const rowFeet = C.rowToFeet(y);
      let icyA = 0;
      if (rowFeet >= C.ICE.minFt && rowFeet <= C.ICE.maxFt) {
        const mid = (C.ICE.minFt + C.ICE.maxFt) / 2, half = (C.ICE.maxFt - C.ICE.minFt) / 2;
        icyA = 0.05 + 0.09 * (1 - Math.abs(rowFeet - mid) / half);
      } else if (rowFeet > C.ICE.maxFt && rowFeet <= C.ICE.deepMaxFt) {
        icyA = 0.11;
      }
      // The soil itself freezes across the whole permafrost stretch, fading
      // in over the first ~300 ft and thawing back out past the bottom edge
      const frozenT = Math.max(0, Math.min(1,
        Math.min((rowFeet - C.ICE.minFt) / 300, (C.ICE.deepMaxFt - rowFeet) / 300)));
      const drawSoil = (sx, sy, v) => {
        if (frozenT < 1) ctx.drawImage(Sprites.dirt[band][v], sx, sy, T + 0.5, T + 0.5);
        if (frozenT > 0) {
          if (frozenT < 1) ctx.globalAlpha = frozenT;
          ctx.drawImage(Sprites.frozenDirt[band][v], sx, sy, T + 0.5, T + 0.5);
          if (frozenT < 1) ctx.globalAlpha = 1;
        }
      };
      for (let x = Math.max(0, x0); x <= Math.min(C.WORLD_W - 1, x1); x++) {
        const id = World.get(x, y);
        const sx = (x - this.cam.x) * T;
        const sy = (y - this.cam.y) * T;
        if (id === 0) {
          if (y <= C.GROUND_BOTTOM_ROW) {
            // Vault interiors are a built metal hall, not a dug cave — as long
            // as the room is still mostly standing
            const room = World.inServerRoom(x, y);
            if (room && this.roomIntact(room)) {
              ctx.fillStyle = '#252b34';
              ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
              ctx.fillStyle = 'rgba(255,255,255,0.04)';
              ctx.fillRect(sx, sy + T * 0.93, T + 0.5, T * 0.07);   // floor lip
              ctx.fillRect(sx + T * 0.48, sy, T * 0.035, T + 0.5);  // panel seam
              ctx.fillStyle = 'rgba(0,0,0,0.22)';
              ctx.fillRect(sx, sy, T + 0.5, T * 0.06);              // ceiling shadow
              continue;
            }
            // Draw solid dirt here too — the passage is carved out of it later
            // by the organic blob mask in drawCavePass().
            drawSoil(sx, sy, World.variant[y * C.WORLD_W + x] % Sprites.VARIANTS);
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
          drawSoil(sx, sy, v % Sprites.VARIANTS);
          this._steamTiles.push({ x, y });
          continue;
        }
        let tex = null, ftex = null;   // ftex: frozen-soil variant for the permafrost band
        if (id === 1) { drawSoil(sx, sy, v); }
        else if (id === 2) { tex = Sprites.stone[band]; ftex = Sprites.frozenStone[band]; }
        else if (id === 3) tex = Sprites.lavaBase;
        else if (id === 4) { tex = Sprites.gasTex[band]; ftex = Sprites.frozenGasTex[band]; this._gasVis.push({ x, y }); }   // gas is visible now — fairness over stealth
        else if (id === 6) { tex = Sprites.magnetiteTex[band]; ftex = Sprites.frozenMagnetiteTex[band]; this._magnetVis.push({ x, y }); }
        else if (id === 7) tex = Sprites.sandTex[band];
        else if (id === 8) { tex = Sprites.nukeTex[band]; ftex = Sprites.frozenNukeTex[band]; }
        else if (id === 9) { tex = Sprites.crackedTex[band]; ftex = Sprites.frozenCrackedTex[band]; }
        else if (id === 10) tex = Sprites.iceTex;
        else if (id === 11) tex = Sprites.serverWallTex;
        else if (id === 12) tex = Sprites.serverRackTex;
        else if (id === 13) tex = Sprites.serverDoorTex;
        else {
          const kind = World.tileKinds[id];
          tex = kind.mineral ? Sprites.minerals[kind.key][band] : Sprites.artifacts[kind.key][band];
          ftex = kind.mineral ? Sprites.frozenMinerals[kind.key][band] : Sprites.frozenArtifacts[kind.key][band];
        }
        if (tex) {
          const useFrozen = ftex && frozenT > 0;
          if (!useFrozen || frozenT < 1) ctx.drawImage(tex, sx, sy, T + 0.5, T + 0.5);
          if (useFrozen) {
            if (frozenT < 1) ctx.globalAlpha = frozenT;
            ctx.drawImage(ftex, sx, sy, T + 0.5, T + 0.5);
            if (frozenT < 1) ctx.globalAlpha = 1;
          }
        }
        // Cold cast over the permafrost band — only for tiles that don't
        // already carry frozen artwork (dirt, ice and the frozen variants do)
        if (icyA > 0 && id !== 10 && id !== 1 && !(ftex && frozenT > 0)) {
          ctx.fillStyle = `rgba(150,205,255,${icyA})`;
          ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
        }
        // Lava animated shimmer
        if (id === 3) {
          const pulse = 0.25 + 0.2 * Math.sin(this.time * 3 + x * 1.7 + y * 2.3);
          ctx.fillStyle = `rgba(255,160,40,${pulse})`;
          ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
        }
        // Gas breathes a slow toxic-green pulse
        if (id === 4) {
          const pulse = 0.08 + 0.07 * Math.sin(this.time * 1.8 + x * 2.1 + y * 1.6);
          ctx.fillStyle = `rgba(120,230,90,${pulse})`;
          ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
        }
        // Server racks & doors light themselves AFTER the darkness pass (they
        // glow) — collect them here, drawServerGlow does the shining
        if (id === 12) this._rackVis.push({ x, y });
        if (id === 13) {
          this._doorVis.push({ x, y });
          // Mid-slide: redraw the door as two halves retracting into the frame
          const anim = this.doorAnimAt(x, y);
          if (anim > 0) {
            ctx.fillStyle = '#14161c';
            ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
            const S2 = Sprites.serverDoorTex.width;
            ctx.save();
            ctx.beginPath(); ctx.rect(sx, sy, T + 0.5, T + 0.5); ctx.clip();
            const off = anim * T * 0.52;
            ctx.drawImage(Sprites.serverDoorTex, 0, 0, S2, S2 / 2, sx, sy - off, T + 0.5, T / 2);
            ctx.drawImage(Sprites.serverDoorTex, 0, S2 / 2, S2, S2 / 2, sx, sy + T / 2 + off, T + 0.5, T / 2);
            ctx.restore();
          }
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
    // Interaction prompt: big keycap + name, pulsing so it can't be missed
    const cur = Shops.current();
    if (cur && this.state === 'play' && !UI.isOpen()) {
      const b = C.BUILDINGS[cur];
      const px = (b.x + b.w / 2 - this.cam.x) * T;
      const label = `${b.name.split(' ')[0]} ${b.name.split(' ')[1] || ''}`.trim();
      const fs = Math.max(17, Math.round(T * 0.3));
      const keyS = fs * 1.45;
      ctx.font = `bold ${fs}px Verdana`;
      ctx.textAlign = 'center';
      const textW = ctx.measureText(label).width;
      const boxW = keyS + textW + fs * 1.7;
      const boxH = keyS + fs * 0.55;
      const boxY = groundY - T * 4.35;
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 4);
      // Backdrop
      ctx.fillStyle = 'rgba(10,10,16,0.85)';
      Sprites.rr(ctx, px - boxW / 2, boxY, boxW, boxH, fs * 0.4);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,178,71,${0.5 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(1.5, fs * 0.09);
      Sprites.rr(ctx, px - boxW / 2, boxY, boxW, boxH, fs * 0.4);
      ctx.stroke();
      // Keycap: a chunky "E" key, glyph dead-centered in the cap
      const kx = px - boxW / 2 + fs * 0.55, ky = boxY + (boxH - keyS) / 2;
      ctx.fillStyle = `rgba(255,217,160,${0.85 + 0.15 * pulse})`;
      Sprites.rr(ctx, kx, ky, keyS, keyS, fs * 0.25);
      ctx.fill();
      ctx.fillStyle = '#1a1408';
      ctx.font = `bold ${Math.round(fs * 1.05)}px Verdana`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('E', kx + keyS / 2, ky + keyS / 2 + fs * 0.06);   // slight optical drop
      // Building name
      ctx.font = `bold ${fs}px Verdana`;
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(label, kx + keyS + fs * 0.5 + textW / 2, boxY + boxH / 2);
      ctx.textBaseline = 'alphabetic';
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

    // The server vaults light themselves: every rack casts a pool of cold
    // machine-light, and the sealed door's lamp glows red in the dark
    if ((this._rackVis && this._rackVis.length) || (this._doorVis && this._doorVis.length)) {
      lc.globalCompositeOperation = 'destination-out';
      for (const t of this._rackVis || []) {
        const rx = (t.x + 0.5 - this.cam.x) * C.TILE, ry = (t.y + 0.5 - this.cam.y) * C.TILE;
        const rg = lc.createRadialGradient(rx, ry, C.TILE * 0.3, rx, ry, C.TILE * 2.8);
        rg.addColorStop(0, 'rgba(0,0,0,0.85)');
        rg.addColorStop(0.6, 'rgba(0,0,0,0.45)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = rg;
        lc.fillRect(rx - C.TILE * 2.8, ry - C.TILE * 2.8, C.TILE * 5.6, C.TILE * 5.6);
      }
      for (const t of this._doorVis || []) {
        const rx = (t.x + 0.5 - this.cam.x) * C.TILE, ry = (t.y + 0.2 - this.cam.y) * C.TILE;
        const rg = lc.createRadialGradient(rx, ry, C.TILE * 0.1, rx, ry, C.TILE * 1.6);
        rg.addColorStop(0, 'rgba(0,0,0,0.7)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = rg;
        lc.fillRect(rx - C.TILE * 1.6, ry - C.TILE * 1.6, C.TILE * 3.2, C.TILE * 3.2);
      }
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

    // Embers seep up from the Hell gap — the one way through the floor is
    // marked so it can actually be found
    if (!this.inHell()) {
      const gapSx = (C.HELL_GAP_X + 0.5 - this.cam.x) * T;
      const gapSy = (C.GROUND_BOTTOM_ROW - 1 - this.cam.y) * T;
      if (gapSx > -T * 3 && gapSx < C.VIEW_W + T * 3 && gapSy > -T * 2 && gapSy < C.VIEW_H + T * 6) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gpulse = 0.6 + 0.4 * Math.sin(this.time * 2.2);
        const gg2 = ctx.createRadialGradient(gapSx, gapSy, T * 0.1, gapSx, gapSy, T * 2.4);
        gg2.addColorStop(0, `rgba(255,110,45,${0.4 * gpulse})`);
        gg2.addColorStop(0.6, `rgba(220,50,25,${0.18 * gpulse})`);
        gg2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg2;
        ctx.fillRect(gapSx - T * 2.4, gapSy - T * 2.4, T * 4.8, T * 4.8);
        // Rising embers
        for (let i = 0; i < 4; i++) {
          const cyc = (this.time * (0.35 + i * 0.07) + i * 0.31) % 1;
          const ex = gapSx + Math.sin(this.time * 1.8 + i * 2.4 + cyc * 4) * T * 0.35;
          const ey = gapSy - cyc * T * 2.6;
          ctx.fillStyle = `rgba(255,${120 + i * 25},50,${Math.sin(cyc * Math.PI) * 0.7})`;
          ctx.beginPath();
          ctx.arc(ex, ey, T * (0.05 - cyc * 0.02), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Gas pockets exhale slow curling wisps of vapor
    if (this._gasVis && this._gasVis.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const gt of this._gasVis) {
        const h = ((gt.x * 92821) ^ (gt.y * 68917)) >>> 0;
        const seed = (h % 1000) / 1000;
        for (let i = 0; i < 2; i++) {
          // Each wisp loops: born at the tile, drifting up ~1.3 tiles, swelling
          // and thinning out as it goes
          const cyc = (this.time * (0.28 + seed * 0.12) + seed * 7 + i * 0.5) % 1;
          const wx = (gt.x + 0.5 - this.cam.x) * T + Math.sin(this.time * 1.6 + seed * 9 + i * 3 + cyc * 5) * T * 0.22;
          const wy = (gt.y + 0.55 - this.cam.y) * T - cyc * T * 1.3;
          const r = T * (0.1 + cyc * 0.22);
          const a = Math.sin(cyc * Math.PI) * 0.16;
          ctx.fillStyle = `rgba(140,235,100,${a})`;
          ctx.beginPath();
          ctx.arc(wx, wy, r, 0, Math.PI * 2);
          ctx.fill();
          // A dimmer trailing puff for a curling look
          ctx.fillStyle = `rgba(120,215,90,${a * 0.6})`;
          ctx.beginPath();
          ctx.arc(wx - Math.sin(this.time * 1.6 + seed * 9 + i * 3 + cyc * 5) * T * 0.12, wy + T * 0.14, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Crumbling ceilings: violent jitter + darkening as they let go
    for (const c of this.crumbling) {
      const sx = (c.x - this.cam.x) * T, sy = (c.y - this.cam.y) * T;
      const panic = 1 - c.t / C.CAVEIN.fuse;
      const jx = (Math.random() - 0.5) * T * 0.08 * (0.5 + panic);
      const jy = (Math.random() - 0.5) * T * 0.06 * (0.5 + panic);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * panic;
      ctx.drawImage(Sprites.crackedTex[Sprites.bandForRow(c.y)], sx + jx, sy + jy, T + 0.5, T + 0.5);
      ctx.fillStyle = `rgba(20,8,4,${0.2 + 0.25 * panic})`;
      ctx.fillRect(sx + jx, sy + jy, T + 0.5, T + 0.5);
      ctx.restore();
    }

    // Falling rocks
    for (const d of this.debris) {
      const sx = (d.x - this.cam.x) * T, sy = (d.y - this.cam.y) * T;
      if (sy < -T * 2 || sy > C.VIEW_H + T * 2) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(d.y * 2.2);
      const rr2 = T * 0.34;
      ctx.fillStyle = '#5c4632';
      ctx.beginPath();
      ctx.moveTo(-rr2, -rr2 * 0.4);
      ctx.lineTo(-rr2 * 0.25, -rr2);
      ctx.lineTo(rr2 * 0.8, -rr2 * 0.55);
      ctx.lineTo(rr2, rr2 * 0.35);
      ctx.lineTo(rr2 * 0.1, rr2);
      ctx.lineTo(-rr2 * 0.75, rr2 * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(1, T * 0.03);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,225,190,0.15)';
      ctx.beginPath();
      ctx.ellipse(-rr2 * 0.3, -rr2 * 0.4, rr2 * 0.35, rr2 * 0.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Cooked worm meat: a glowing green morsel steaming on the ground
    for (const m of this.meat) {
      const sx = (m.x - this.cam.x) * T, sy = (m.y - this.cam.y) * T + Math.sin(this.time * 3) * T * 0.04;
      if (sx < -T * 2 || sx > C.VIEW_W + T * 2 || sy < -T * 2 || sy > C.VIEW_H + T * 2) continue;
      ctx.save();
      // Beacon glow so it's findable in the dark
      ctx.globalCompositeOperation = 'lighter';
      const pulse2 = 0.6 + 0.4 * Math.sin(this.time * 4);
      const mg = ctx.createRadialGradient(sx, sy, T * 0.05, sx, sy, T * 1.1);
      mg.addColorStop(0, `rgba(150,255,110,${0.35 * pulse2})`);
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(sx - T * 1.1, sy - T * 1.1, T * 2.2, T * 2.2);
      ctx.globalCompositeOperation = 'source-over';
      // The morsel: seared glaze over glowing green meat, bone stub poking out
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.ellipse(sx - T * 0.2, sy - T * 0.12, T * 0.06, T * 0.045, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx - T * 0.22, sy - T * 0.12, T * 0.1, T * 0.05);
      const meatG = ctx.createRadialGradient(sx + T * 0.02, sy - T * 0.04, T * 0.02, sx + T * 0.05, sy, T * 0.24);
      meatG.addColorStop(0, '#c8ff8a');
      meatG.addColorStop(0.55, '#6fae3a');
      meatG.addColorStop(1, '#3e6a1e');
      ctx.fillStyle = meatG;
      ctx.beginPath();
      ctx.ellipse(sx + T * 0.05, sy, T * 0.22, T * 0.16, 0.25, 0, Math.PI * 2);
      ctx.fill();
      // Char grill lines
      ctx.strokeStyle = 'rgba(40,25,10,0.6)';
      ctx.lineWidth = Math.max(1, T * 0.022);
      for (const off of [-0.06, 0.02, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(sx - T * 0.1 + off * T, sy - T * 0.12);
        ctx.lineTo(sx + T * 0.02 + off * T, sy + T * 0.13);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Level-up aura: the pod shines after eating worm meat
    if (this.podGlowT > 0 && !Player.dead) {
      const px2 = (Player.x - this.cam.x) * T, py2 = (Player.y - this.cam.y) * T;
      const t2 = this.podGlowT / 1.8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(px2, py2, T * 0.2, px2, py2, T * (1.6 + (1 - t2) * 0.8));
      ag.addColorStop(0, `rgba(190,255,150,${0.4 * t2})`);
      ag.addColorStop(0.6, `rgba(255,245,170,${0.22 * t2})`);
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(px2 - T * 2.5, py2 - T * 2.5, T * 5, T * 5);
      // Rising motes of power
      for (let i = 0; i < 6; i++) {
        const a2 = this.time * 2.4 + i * 1.05;
        const rr3 = T * (0.7 + 0.25 * Math.sin(this.time * 3 + i));
        ctx.fillStyle = `rgba(220,255,180,${0.6 * t2})`;
        ctx.beginPath();
        ctx.arc(px2 + Math.cos(a2) * rr3, py2 + Math.sin(a2) * rr3 * 0.8 - (1 - t2) * T * 0.5, T * 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    this.drawNukeAftermath(ctx);
    this.drawWorm(ctx);
    this.drawMicrowaveBeam(ctx);

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

  // Microwave beam: rippling energy from the roof dish to the focused tile,
  // with a heat shimmer and progress ring on the target
  drawMicrowaveBeam(ctx) {
    const b = this.mwBeam;
    if (!b) return;
    const T = C.TILE;
    // Origin = the dish mount on the roof (drawPod places it at local
    // (-0.18, -0.46), and the pod sprite mirrors with facing)
    const px = (Player.x - this.cam.x) * T + (Player.facing < 0 ? T * 0.18 : -T * 0.18);
    const py = (Player.y - this.cam.y) * T - T * 0.46;
    // The beam visually tracks a smoothed aim point that glides with the
    // cursor — gameplay still targets whole tiles, but no block-to-block snap
    const aimWX = this.cam.x + this.mouse.x / T;
    const aimWY = this.cam.y + this.mouse.y / T;
    if (this._mwAimX == null) { this._mwAimX = aimWX; this._mwAimY = aimWY; }
    this._mwAimX += (aimWX - this._mwAimX) * 0.3;
    this._mwAimY += (aimWY - this._mwAimY) * 0.3;
    const tx2 = (this._mwAimX - this.cam.x) * T;
    const ty2 = (this._mwAimY - this.cam.y) * T;
    const ang = Math.atan2(ty2 - py, tx2 - px);
    const len = Math.hypot(tx2 - px, ty2 - py);
    // Worm-meat upgrades tint the beam green; maxed makes it thicker and
    // washes heat over the whole 3x3 focus area
    const lvl = Player.mwLevel || 0;
    const wmul = lvl >= 2 ? 1.45 : 1;
    const cCore = lvl ? '160,255,150' : '255,220,150';
    const cRip = lvl ? '110,240,110' : '255,180,90';
    const cGlow = lvl ? '200,255,180' : '255,235,180';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Beam core + sinusoidal ripples traveling outward (microwaves, literally)
    ctx.strokeStyle = `rgba(${cCore},0.35)`;
    ctx.lineWidth = Math.max(2, T * 0.06 * wmul);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, T * 0.035 * wmul);
    for (const phase of [0, Math.PI]) {
      ctx.strokeStyle = `rgba(${cRip},0.5)`;
      ctx.beginPath();
      const steps = Math.max(8, Math.floor(len / 9));
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const wob = Math.sin(f * len * 0.09 - this.time * 22 + phase) * T * 0.12 * wmul * Math.sin(f * Math.PI);
        const wx = px + Math.cos(ang) * len * f - Math.sin(ang) * wob;
        const wy = py + Math.sin(ang) * len * f + Math.cos(ang) * wob;
        i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
    // Emitter glow at the dish
    let g = ctx.createRadialGradient(px, py, 1, px, py, T * 0.35 * wmul);
    g.addColorStop(0, `rgba(${cGlow},0.8)`);
    g.addColorStop(1, `rgba(${cRip},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - T * 0.5, py - T * 0.5, T, T);

    // Target: flickering heat wash — one tile, or the whole 3x3 when maxed
    const flick = 0.55 + 0.45 * Math.sin(this.time * 27);
    const washR = lvl >= 2 ? T * 1.55 : T * 0.75;
    g = ctx.createRadialGradient(tx2, ty2, T * 0.06, tx2, ty2, washR);
    g.addColorStop(0, `rgba(${lvl ? '210,255,170' : '255,225,160'},${0.4 * flick})`);
    g.addColorStop(0.6, `rgba(${cRip},${0.22 * flick})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tx2 - washR, ty2 - washR, washR * 2, washR * 2);
    if (lvl >= 2) {
      // Wide-focus ring: a breathing, slowly rotating dashed circle
      const breathe = 1 + 0.05 * Math.sin(this.time * 2.6);
      const ringR = T * 1.55 * breathe;
      ctx.strokeStyle = `rgba(150,255,140,${0.3 + 0.18 * flick})`;
      ctx.lineWidth = Math.max(1.5, T * 0.045);
      ctx.setLineDash([T * 0.35, T * 0.22]);
      ctx.lineDashOffset = -this.time * T * 0.9;
      ctx.beginPath();
      ctx.arc(tx2, ty2, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // Counter-rotating inner ring for that "focusing lens" feel
      ctx.strokeStyle = `rgba(200,255,180,${0.16 + 0.12 * flick})`;
      ctx.lineWidth = Math.max(1, T * 0.028);
      ctx.setLineDash([T * 0.18, T * 0.3]);
      ctx.lineDashOffset = this.time * T * 0.7;
      ctx.beginPath();
      ctx.arc(tx2, ty2, ringR * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Progress ring while something is actually cooking
    if (b.needed > 0) {
      const frac = Math.min(1, b.heat / b.needed);
      ctx.strokeStyle = 'rgba(30,20,10,0.55)';
      ctx.lineWidth = Math.max(2.5, T * 0.07);
      ctx.beginPath();
      ctx.arc(tx2, ty2, T * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = frac >= 1 ? '#ffef9a' : '#ffb04a';
      ctx.beginPath();
      ctx.arc(tx2, ty2, T * 0.62, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  // Nuclear aftermath: mushroom cloud (8 s, purely visual — the pod flies
  // straight through it) and an expanding shockwave ring that travels well
  // past the damage radius
  drawNukeAftermath(ctx) {
    const T = C.TILE;

    // Mushroom clouds first so the shockwave rings draw over them
    for (const m of this.nukeClouds) {
      const cx = (m.x - this.cam.x) * T;
      const baseY = (m.y - this.cam.y) * T;
      if (cx < -T * 12 || cx > C.VIEW_W + T * 12 || baseY < -T * 16 || baseY > C.VIEW_H + T * 16) continue;
      const t = m.age / C.NUKE.cloudLife;                       // 0..1 lifetime
      const heat = Math.max(0, 1 - m.age / 2.4);                // orange fire fading to smoke
      const fade = t > 0.68 ? (1 - t) / 0.32 : 1;               // dissipate over the last ~2.5 s
      const rise = 1 - Math.pow(1 - Math.min(1, m.age / 3), 2); // fast climb, easing to a hang
      const capY = baseY - rise * T * 5.6;
      const capW = T * (1.9 + t * 1.4 + rise * 0.5);            // cap keeps spreading
      // Deterministic per-puff variation + slow roiling animation
      const h01 = i => (Math.sin(m.seed * 12.9898 + i * 78.233) * 43758.5453) % 1 * 0.5 + 0.5;
      const billow = i => 0.82 + 0.3 * Math.sin(this.time * 1.5 + m.seed + i * 2.1) + h01(i) * 0.12;
      // One shaded smoke puff: lit from the fireball early, from above later,
      // with a heavy dark underside so the cloud reads as a volume
      const puff = (px, py, r, shade, hotness) => {
        const hl = 0.32 * r;
        const g = ctx.createRadialGradient(px - hl * 0.4, py - hl, r * 0.12, px, py, r);
        const base = 72 * shade;
        const rr = Math.round(base + 18 + (185 - base) * hotness);
        const gg2 = Math.round(base + 12 + (92 - base) * hotness);
        const bb = Math.round(base + 6 - 12 * hotness);
        g.addColorStop(0, `rgba(${rr + 38},${gg2 + 32},${bb + 30},0.58)`);
        g.addColorStop(0.55, `rgba(${rr},${gg2},${bb},0.5)`);
        g.addColorStop(0.85, `rgba(${Math.round(rr * 0.35)},${Math.round(gg2 * 0.35)},${Math.round(bb * 0.4)},0.45)`);
        g.addColorStop(1, 'rgba(12,9,8,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      };

      ctx.save();
      ctx.globalAlpha = fade * 0.92;

      // Dark mass behind the whole cloud so the puffs read against a silhouette
      const sil = ctx.createRadialGradient(cx, capY + T * 0.6, T * 0.4, cx, capY + T * 0.8, T * 3.6);
      sil.addColorStop(0, 'rgba(24,18,15,0.62)');
      sil.addColorStop(0.7, 'rgba(20,15,13,0.4)');
      sil.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sil;
      ctx.fillRect(cx - T * 3.6, capY - T * 3, T * 7.2, T * 7.6);
      const sil2 = ctx.createRadialGradient(cx, (baseY + capY) / 2, T * 0.2, cx, (baseY + capY) / 2, T * 2.2);
      sil2.addColorStop(0, 'rgba(24,18,15,0.55)');
      sil2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sil2;
      ctx.fillRect(cx - T * 2.2, baseY - T * 6.5, T * 4.4, Math.abs(baseY - capY) + T * 3);

      // Ground surge: a low, wide dust roll hugging the crater
      const surgeW = T * (2.6 + Math.min(1, m.age / 1.5) * 2.2);
      for (let i = -3; i <= 3; i++) {
        const px = cx + (i / 3) * surgeW * 0.8;
        const r = T * (0.75 - Math.abs(i) * 0.1) * billow(i + 30);
        puff(px, baseY + T * 0.15 - r * 0.2, r, 0.75, heat * 0.25);
      }

      // Stem: tapered turbulent column — wider at the base, necking up to the cap
      for (let i = 0; i < 9; i++) {
        const f = i / 8;
        const py = baseY - T * 0.3 + (capY - baseY) * f;
        const taper = 1.05 - f * 0.42;
        const sway = Math.sin(this.time * 1.1 + m.seed + f * 3.2) * T * 0.22 * f;
        // paired side puffs give the column a churning edge
        for (const s of [-1, 0, 1]) {
          const r = T * taper * (s === 0 ? 0.62 : 0.42) * billow(i * 3 + s);
          puff(cx + sway + s * T * taper * 0.38, py, r, 0.85 - f * 0.15, heat * (0.25 + f * 0.5));
        }
      }

      // Condensation skirt: the flat ring partway up the stem — the signature
      const skirtY = baseY + (capY - baseY) * 0.55;
      ctx.globalAlpha = fade * 0.5;
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(this.time * 1.1 + m.seed + 1.7) * T * 0.1, skirtY,
        T * (1.5 + t * 0.5) * (0.9 + 0.08 * Math.sin(this.time * 2 + m.seed)), T * 0.34, 0, 0, Math.PI * 2);
      const sg = ctx.createRadialGradient(cx, skirtY - T * 0.2, T * 0.2, cx, skirtY, T * 1.9);
      sg.addColorStop(0, 'rgba(190,182,170,0.5)');
      sg.addColorStop(0.8, 'rgba(120,112,104,0.24)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fill();
      ctx.globalAlpha = fade * 0.92;

      // Cap: dome of big rolling puffs...
      for (let i = -4; i <= 4; i++) {
        const f = i / 4;
        const px = cx + f * capW * 0.82;
        const lift = -Math.cos(f * Math.PI * 0.5) * T * 1.05;
        const r = T * (1.3 - Math.abs(f) * 0.42) * billow(i + 10);
        puff(px, capY + lift, r, 1, heat * (0.55 + 0.35 * (1 - Math.abs(f))));
      }
      // ...with a darker under-curl rolling back beneath the rim
      for (let i = -3; i <= 3; i++) {
        const f = i / 3;
        const px = cx + f * capW * 0.68;
        const r = T * (0.62 - Math.abs(f) * 0.14) * billow(i + 20);
        puff(px, capY + T * 0.55 - Math.abs(f) * T * 0.12, r, 0.55, heat * 0.3);
      }
      // Crown puffs boiling out of the top
      for (let i = -1; i <= 1; i++) {
        const px = cx + i * capW * 0.3 + Math.sin(this.time * 1.4 + m.seed + i * 2) * T * 0.12;
        const r = T * (0.78 - Math.abs(i) * 0.14) * billow(i + 40);
        puff(px, capY - T * (1.1 - Math.abs(i) * 0.3), r, 1.05, heat * 0.7);
      }

      // Fireball glow inside the young cap, bleeding through the smoke
      if (heat > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, capY + T * 0.2, T * 0.15, cx, capY + T * 0.2, T * 2.6);
        g.addColorStop(0, `rgba(255,215,120,${0.55 * heat})`);
        g.addColorStop(0.4, `rgba(255,130,45,${0.32 * heat})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - T * 2.6, capY - T * 2.4, T * 5.2, T * 5.2);
        // Embers flickering up the stem
        const eg = ctx.createRadialGradient(cx, baseY - T * 1.2, T * 0.1, cx, baseY - T * 1.2, T * 1.5);
        eg.addColorStop(0, `rgba(255,150,50,${0.3 * heat})`);
        eg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.fillRect(cx - T * 1.5, baseY - T * 2.7, T * 3, T * 3);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    // Shockwaves: a bright compression ring racing outward past the damage zone
    for (const s of this.shockwaves) {
      const sx = (s.x - this.cam.x) * T;
      const sy = (s.y - this.cam.y) * T;
      const t = s.age / 1.2;                                    // 0..1
      const R = (0.6 + t * C.NUKE.shockRadius) * T;
      const a = (1 - t) * 0.85;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,245,225,${a})`;
      ctx.lineWidth = Math.max(2, T * 0.22 * (1 - t * 0.6));
      ctx.beginPath();
      ctx.arc(sx, sy, R, 0, Math.PI * 2);
      ctx.stroke();
      // Trailing haze band just inside the front
      ctx.strokeStyle = `rgba(255,180,110,${a * 0.45})`;
      ctx.lineWidth = Math.max(2, T * 0.5 * (1 - t * 0.5));
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.9, 0, Math.PI * 2);
      ctx.stroke();
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

    // Toxic glow bleeding through the dark — shifting to seared orange as the
    // microwave beam cooks it
    const cookFrac = Math.min(1, (w.cooked || 0) / C.MICROWAVE.heatWorm);
    const zapped = w.zapT > 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length; i++) {
      const sx = (pts[i].x - this.cam.x) * T, sy = (pts[i].y - this.cam.y) * T;
      const g = ctx.createRadialGradient(sx, sy, T * 0.2, sx, sy, T * 1.7);
      const rr = Math.round(120 + 135 * cookFrac), gg2 = Math.round(255 - 120 * cookFrac), bb = Math.round(80 - 40 * cookFrac);
      g.addColorStop(0, `rgba(${rr},${gg2},${bb},${(i === 0 ? 0.16 : 0.09) + (zapped ? 0.1 : 0) + cookFrac * 0.08})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - T * 1.7, sy - T * 1.7, T * 3.4, T * 3.4);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Body, tail to head, so the head overlaps. Cooking sears the hide from
    // toxic green to blistered red-orange, with a white-hot rim while the
    // beam is actually on it.
    const mix2 = (a, b2, t2) => Math.round(a + (b2 - a) * t2);
    for (let i = pts.length - 1; i >= 1; i--) {
      const sx = (pts[i].x - this.cam.x) * T, sy = (pts[i].y - this.cam.y) * T;
      const r = T * (0.95 - (i / pts.length) * 0.42);
      const undul = Math.sin(this.time * 6 - i * 0.9) * r * 0.06;
      const bg = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3 + undul, r * 0.15, sx, sy + undul, r);
      bg.addColorStop(0, `rgb(${mix2(61, 200, cookFrac)},${mix2(92, 70, cookFrac)},${mix2(40, 28, cookFrac)})`);
      bg.addColorStop(0.6, `rgb(${mix2(36, 140, cookFrac)},${mix2(61, 42, cookFrac)},${mix2(22, 16, cookFrac)})`);
      bg.addColorStop(1, `rgb(${mix2(16, 70, cookFrac)},${mix2(31, 20, cookFrac)},${mix2(10, 8, cookFrac)})`);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(sx, sy + undul, r, 0, Math.PI * 2);
      ctx.fill();
      // Glowing band between segments: green venom → molten ember as it cooks
      ctx.strokeStyle = `rgba(${mix2(140, 255, cookFrac)},${mix2(255, 140, cookFrac)},${mix2(90, 40, cookFrac)},${0.35 + 0.2 * Math.sin(this.time * 5 + i)})`;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath();
      ctx.arc(sx, sy + undul, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // Sizzling white-hot rim + blister spots while the beam is on it
      if (zapped) {
        const flick = 0.5 + 0.5 * Math.sin(this.time * 31 + i * 2.7);
        ctx.strokeStyle = `rgba(255,240,200,${0.35 + 0.4 * flick})`;
        ctx.lineWidth = Math.max(1.5, r * 0.09);
        ctx.beginPath();
        ctx.arc(sx, sy + undul, r * 0.98, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,${180 + Math.round(60 * flick)},80,${0.5 * flick})`;
        for (let bnum = 0; bnum < 2; bnum++) {
          const ba = this.time * 3 + i * 2.1 + bnum * 3;
          ctx.beginPath();
          ctx.arc(sx + Math.cos(ba) * r * 0.5, sy + undul + Math.sin(ba) * r * 0.5, r * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

    // Head: 2 tiles wide, mandibles chewing — sears with the body as it cooks
    const hr = T * 0.98;
    const ang = w.heading || 0;
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    const hg = ctx.createRadialGradient(-hr * 0.3, -hr * 0.3, hr * 0.15, 0, 0, hr);
    hg.addColorStop(0, `rgb(${mix2(74, 210, cookFrac)},${mix2(110, 80, cookFrac)},${mix2(48, 30, cookFrac)})`);
    hg.addColorStop(0.6, `rgb(${mix2(44, 150, cookFrac)},${mix2(74, 48, cookFrac)},${mix2(26, 18, cookFrac)})`);
    hg.addColorStop(1, `rgb(${mix2(20, 76, cookFrac)},${mix2(38, 22, cookFrac)},${mix2(12, 9, cookFrac)})`);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, hr, hr * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    // White-hot sizzle rim on the head while the beam is on it
    if (zapped) {
      const flick2 = 0.5 + 0.5 * Math.sin(this.time * 29);
      ctx.strokeStyle = `rgba(255,240,200,${0.35 + 0.4 * flick2})`;
      ctx.lineWidth = Math.max(1.5, hr * 0.08);
      ctx.beginPath();
      ctx.ellipse(0, 0, hr * 0.99, hr * 0.91, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
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

    // Cook meter: once it has taken any heat, show exactly how done it is
    if ((w.cooked || 0) > 0.15 && !w.leaving) {
      const mw2 = T * 2.3, mh = T * 0.22;
      const mx = hx - mw2 / 2, my = hy - T * 1.75;
      ctx.save();
      ctx.globalAlpha = Math.max(0, w.fade) * (zapped ? 1 : 0.75);
      ctx.fillStyle = 'rgba(10,10,14,0.8)';
      Sprites.rr(ctx, mx, my, mw2, mh, mh * 0.4);
      ctx.fill();
      const grad = ctx.createLinearGradient(mx, 0, mx + mw2, 0);
      grad.addColorStop(0, '#ffb04a');
      grad.addColorStop(1, '#ff5520');
      ctx.fillStyle = grad;
      Sprites.rr(ctx, mx + 2, my + 2, Math.max(mh * 0.5, (mw2 - 4) * cookFrac), mh - 4, (mh - 4) * 0.4);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,180,110,${zapped ? 0.5 + 0.4 * Math.sin(this.time * 20) : 0.45})`;
      ctx.lineWidth = Math.max(1, T * 0.02);
      Sprites.rr(ctx, mx, my, mw2, mh, mh * 0.4);
      ctx.stroke();
      ctx.font = `bold ${Math.max(11, Math.round(T * 0.19))}px Verdana`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(`COOKING ${Math.round(cookFrac * 100)}%`, hx, my - T * 0.12);
      ctx.restore();
    }
  },

  // Ghost renders above the lighting layer — spectres glow in the dark
  drawGhost(ctx) {
    const g = this.ghost;
    if (!g) return;
    if (g.cursed) return this.drawPharaoh(ctx, g);
    const T = C.TILE;
    const burn = Math.min(1, (g.exposure || 0) / 3);
    const scared = (!!g.lit || g.zapT > 0) && g.fading <= 0;
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

    // Aura: cold spectral blue, shifting to firelight as it burns
    ctx.globalCompositeOperation = 'lighter';
    let gg = ctx.createRadialGradient(gx, gy, T * 0.1, gx, gy, T * 1.15);
    gg.addColorStop(0, `rgba(${Math.round(160 + 95 * burn)},${Math.round(215 - 90 * burn)},${Math.round(255 - 195 * burn)},${0.32 + 0.2 * burn})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(gx - T * 1.25, gy - T * 1.25, T * 2.5, T * 2.5);
    ctx.globalCompositeOperation = 'source-over';

    // Shroud: leans hungrily toward the pod, chars as it burns
    const lean = Math.atan2(Player.y - g.y, Player.x - g.x);
    const lx = Math.cos(lean) * T * 0.05;
    const topR = Math.round(225 - 140 * burn), topG = Math.round(243 - 165 * burn), topB = Math.round(255 - 190 * burn);
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

  // The tomb's guardian: an undead pharaoh spirit. Same haunting rules as a
  // ghost (chases, siphons fuel, burns under the flashlight) — royal regalia.
  drawPharaoh(ctx, g) {
    const T = C.TILE;
    const burn = Math.min(1, (g.exposure || 0) / 3);
    const scared = (!!g.lit || g.zapT > 0) && g.fading <= 0;
    const trX = scared ? (Math.random() - 0.5) * T * 0.07 : 0;
    const trY = scared ? (Math.random() - 0.5) * T * 0.07 : 0;
    const gx = (g.x - this.cam.x) * T + trX;
    const gy = (g.y - this.cam.y) * T + Math.sin(g.age * 3) * T * 0.08 + trY;
    if (gx < -T * 2 || gx > C.VIEW_W + T * 2 || gy < -T * 2 || gy > C.VIEW_H + T * 2) return;
    let alpha = 0.82;
    if (g.fading > 0) alpha *= g.fading / 0.5;
    const lean = Math.atan2(Player.y - g.y, Player.x - g.x);
    // Regalia palette, charring as the flashlight burns it
    const gold = `rgba(${Math.round(240 - 150 * burn)},${Math.round(195 - 140 * burn)},${Math.round(80 - 55 * burn)},0.95)`;
    const goldDim = `rgba(${Math.round(200 - 130 * burn)},${Math.round(158 - 115 * burn)},${Math.round(58 - 40 * burn)},0.9)`;
    const linen = `rgba(${Math.round(228 - 140 * burn)},${Math.round(216 - 145 * burn)},${Math.round(188 - 140 * burn)},0.88)`;
    const lapis = `rgba(${Math.round(46 + 60 * burn)},${Math.round(82 - 40 * burn)},${Math.round(180 - 120 * burn)},0.92)`;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Golden funerary aura
    ctx.globalCompositeOperation = 'lighter';
    let gg = ctx.createRadialGradient(gx, gy, T * 0.1, gx, gy, T * 1.2);
    gg.addColorStop(0, `rgba(${Math.round(255 - 30 * burn)},${Math.round(205 - 80 * burn)},${Math.round(90 - 40 * burn)},${0.34 + 0.2 * burn})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(gx - T * 1.3, gy - T * 1.3, T * 2.6, T * 2.6);
    ctx.globalCompositeOperation = 'source-over';

    // Mummy body: a dark spectral core glimpsed between stacked bandage
    // wraps, ending not in a hem but in strips unwinding into thin air
    const lx = Math.cos(lean) * T * 0.05;
    const bodyTop = gy - T * 0.02, bodyBot = gy + T * 0.4;
    const halfAt = f => T * (0.3 - f * 0.09);                  // torso tapers downward
    // Void core, fading out below — the wraps are all that holds it together
    const vg = ctx.createLinearGradient(gx, bodyTop, gx, bodyBot + T * 0.18);
    vg.addColorStop(0, `rgba(${18 + 50 * burn},12,8,0.85)`);
    vg.addColorStop(0.75, `rgba(${14 + 40 * burn},9,6,0.5)`);
    vg.addColorStop(1, 'rgba(8,5,4,0)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.moveTo(gx + lx - halfAt(0), bodyTop);
    ctx.quadraticCurveTo(gx + lx - halfAt(0.5) - T * 0.03, gy + T * 0.2, gx + lx - halfAt(1), bodyBot);
    ctx.lineTo(gx + lx + halfAt(1), bodyBot);
    ctx.quadraticCurveTo(gx + lx + halfAt(0.5) + T * 0.03, gy + T * 0.2, gx + lx + halfAt(0), bodyTop);
    ctx.closePath();
    ctx.fill();
    // Grave-light leaking through the gaps in the wrappings
    ctx.globalCompositeOperation = 'lighter';
    const leak = ctx.createRadialGradient(gx + lx, gy + T * 0.18, T * 0.02, gx + lx, gy + T * 0.18, T * 0.3);
    leak.addColorStop(0, `rgba(255,205,95,${0.3 * (1 - burn * 0.7)})`);
    leak.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = leak;
    ctx.fillRect(gx + lx - T * 0.3, gy - T * 0.12, T * 0.6, T * 0.6);
    ctx.globalCompositeOperation = 'source-over';
    // Stacked bandage bands — sagging strips with dark gaps between them,
    // frayed ends poking out on alternating sides
    const BANDS = 5;
    for (let i = 0; i < BANDS; i++) {
      const f = (i + 0.5) / BANDS;
      const wy = bodyTop + (bodyBot - bodyTop) * f + Math.sin(g.age * 3 + i * 1.9) * T * 0.012;
      const hw = halfAt(f) + T * 0.015;
      const bh = T * 0.062;
      const sag = (i % 2 ? 1 : -1) * T * 0.025;
      ctx.fillStyle = linen;
      ctx.beginPath();
      ctx.moveTo(gx + lx - hw, wy - bh / 2 + sag);
      ctx.quadraticCurveTo(gx + lx, wy - bh / 2 - sag, gx + lx + hw, wy - bh / 2 + sag * 0.6);
      ctx.lineTo(gx + lx + hw, wy + bh / 2 + sag * 0.6);
      ctx.quadraticCurveTo(gx + lx, wy + bh / 2 - sag, gx + lx - hw, wy + bh / 2 + sag);
      ctx.closePath();
      ctx.fill();
      // Shadowed lower edge so each wrap reads as its own strip
      ctx.strokeStyle = `rgba(${Math.round(150 - 90 * burn)},${Math.round(135 - 80 * burn)},${Math.round(105 - 65 * burn)},0.55)`;
      ctx.lineWidth = Math.max(1, T * 0.014);
      ctx.beginPath();
      ctx.moveTo(gx + lx - hw, wy + bh / 2 + sag);
      ctx.quadraticCurveTo(gx + lx, wy + bh / 2 - sag, gx + lx + hw, wy + bh / 2 + sag * 0.6);
      ctx.stroke();
      // Frayed tab sticking out
      const s = i % 2 ? 1 : -1;
      ctx.fillStyle = linen;
      ctx.beginPath();
      ctx.moveTo(gx + lx + s * hw, wy - bh / 2);
      ctx.lineTo(gx + lx + s * (hw + T * 0.05), wy + Math.sin(g.age * 5 + i) * T * 0.02);
      ctx.lineTo(gx + lx + s * hw, wy + bh / 2);
      ctx.closePath();
      ctx.fill();
    }
    // One diagonal cross-wrap over the chest
    ctx.strokeStyle = linen;
    ctx.lineWidth = Math.max(1.5, T * 0.05);
    ctx.beginPath();
    ctx.moveTo(gx + lx - halfAt(0.1), bodyTop + T * 0.05);
    ctx.lineTo(gx + lx + halfAt(0.7), gy + T * 0.3);
    ctx.stroke();
    // Unwinding strips where legs should be: broad bandage ribbons drifting
    // apart, each tapering into a wisp
    ctx.lineCap = 'round';
    for (const [sx0, len, ph] of [[-0.7, 0.42, 0], [0.05, 0.55, 2.1], [0.75, 0.36, 4.2]]) {
      const startX = gx + lx + sx0 * halfAt(1) * 0.9;
      const wave = Math.sin(g.age * 2.6 + ph);
      ctx.strokeStyle = `rgba(${Math.round(228 - 140 * burn)},${Math.round(216 - 145 * burn)},${Math.round(188 - 140 * burn)},${0.8 - Math.abs(sx0) * 0.25})`;
      ctx.lineWidth = Math.max(2, T * 0.065);
      ctx.beginPath();
      ctx.moveTo(startX, bodyBot - T * 0.04);
      ctx.quadraticCurveTo(
        startX + wave * T * 0.16 + sx0 * T * 0.1, bodyBot + T * len * 0.55,
        startX - wave * T * 0.18 + sx0 * T * 0.2 - lx * 2, bodyBot + T * len + Math.sin(g.age * 3.4 + ph) * T * 0.05);
      ctx.stroke();
      // Tapering tip
      ctx.lineWidth = Math.max(1, T * 0.028);
      ctx.beginPath();
      ctx.moveTo(startX - wave * T * 0.18 + sx0 * T * 0.2 - lx * 2, bodyBot + T * len + Math.sin(g.age * 3.4 + ph) * T * 0.05);
      ctx.lineTo(startX - wave * T * 0.3 + sx0 * T * 0.26 - lx * 2, bodyBot + T * (len + 0.12) + Math.cos(g.age * 3 + ph) * T * 0.05);
      ctx.stroke();
    }

    // Broad golden collar
    ctx.fillStyle = goldDim;
    ctx.beginPath();
    ctx.ellipse(gx + lx, gy + T * 0.03, T * 0.24, T * 0.1, 0, 0, Math.PI);
    ctx.fill();

    // Nemes headdress: gold hood with lapis stripes and side lappets
    const hy = gy - T * 0.2;
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(gx - T * 0.3, hy + T * 0.28);              // left lappet bottom
    ctx.lineTo(gx - T * 0.3, hy - T * 0.02);
    ctx.quadraticCurveTo(gx - T * 0.3, hy - T * 0.26, gx, hy - T * 0.28);
    ctx.quadraticCurveTo(gx + T * 0.3, hy - T * 0.26, gx + T * 0.3, hy - T * 0.02);
    ctx.lineTo(gx + T * 0.3, hy + T * 0.28);
    ctx.lineTo(gx + T * 0.18, hy + T * 0.3);
    ctx.lineTo(gx + T * 0.17, hy + T * 0.06);
    ctx.quadraticCurveTo(gx, hy + T * 0.14, gx - T * 0.17, hy + T * 0.06);
    ctx.lineTo(gx - T * 0.18, hy + T * 0.3);
    ctx.closePath();
    ctx.fill();
    // Lapis stripes down the hood
    ctx.strokeStyle = lapis;
    ctx.lineWidth = Math.max(1.5, T * 0.035);
    for (const s of [-0.24, -0.12, 0.12, 0.24]) {
      ctx.beginPath();
      ctx.moveTo(gx + T * s, hy - T * (0.26 - Math.abs(s) * 0.3));
      ctx.lineTo(gx + T * s * 1.2, hy + T * 0.27);
      ctx.stroke();
    }
    // Uraeus cobra on the brow
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(1.5, T * 0.035);
    ctx.beginPath();
    ctx.arc(gx, hy - T * 0.3, T * 0.045, Math.PI * 0.4, Math.PI * 2.2);
    ctx.stroke();

    // Golden death-mask face
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(gx, hy + T * 0.05, T * 0.16, T * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = hy + T * 0.01;
    if (!scared) {
      // Kohl-lined almond eyes, embers tracking the pod
      ctx.fillStyle = 'rgba(10,8,4,0.95)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(gx + s * T * 0.07, eyeY, T * 0.05, T * 0.028, s * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,210,110,0.95)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.07 + Math.cos(lean) * T * 0.02, eyeY + Math.sin(lean) * T * 0.015, T * 0.014, 0, Math.PI * 2);
        ctx.fill();
      }
      // Stern sealed mouth with the ceremonial beard below
      ctx.strokeStyle = 'rgba(10,8,4,0.85)';
      ctx.lineWidth = Math.max(1, T * 0.022);
      ctx.beginPath();
      ctx.moveTo(gx - T * 0.05, hy + T * 0.13);
      ctx.lineTo(gx + T * 0.05, hy + T * 0.13);
      ctx.stroke();
      ctx.fillStyle = lapis;
      ctx.fillRect(gx - T * 0.02, hy + T * 0.17, T * 0.04, T * 0.1);
    } else {
      // Terror: the royal composure cracks — wide eyes, screaming mouth
      for (const s of [-1, 1]) {
        ctx.fillStyle = 'rgba(250,245,230,0.95)';
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.07, eyeY, T * 0.055, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(10,8,4,0.95)';
        ctx.beginPath();
        ctx.arc(gx + s * T * 0.07, eyeY + T * 0.008, T * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(10,8,4,0.95)';
      ctx.beginPath();
      ctx.ellipse(gx, hy + T * 0.13, T * 0.045, T * 0.07 + Math.sin(g.age * 25) * T * 0.01, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wrapped arms: grasping for the pod — or thrown up in panic
    ctx.strokeStyle = linen;
    ctx.lineWidth = Math.max(1.5, T * 0.055);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      const ax0 = gx + s * T * 0.24, ay0 = gy + T * 0.05;
      let ax1, ay1;
      if (scared) {
        ax1 = gx + s * T * 0.38;
        ay1 = gy - T * 0.4 + Math.sin(g.age * 22 + s) * T * 0.04;
      } else {
        ax1 = gx + Math.cos(lean) * T * 0.48 + s * T * 0.13;
        ay1 = gy + Math.sin(lean) * T * 0.38 + T * 0.06;
      }
      ctx.moveTo(ax0, ay0);
      ctx.quadraticCurveTo((ax0 + ax1) / 2 + s * T * 0.06, (ay0 + ay1) / 2 + T * 0.08, ax1, ay1);
      ctx.stroke();
      // Skeletal gilded fingers
      ctx.strokeStyle = goldDim;
      ctx.lineWidth = Math.max(1, T * 0.026);
      for (const fa of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        const fAng = (scared ? -Math.PI / 2 : lean) + fa;
        ctx.lineTo(ax1 + Math.cos(fAng) * T * 0.11, ay1 + Math.sin(fAng) * T * 0.11);
        ctx.stroke();
      }
      ctx.strokeStyle = linen;
      ctx.lineWidth = Math.max(1.5, T * 0.055);
    }

    // Drifting golden motes of grave-dust
    ctx.fillStyle = `rgba(255,220,130,0.3)`;
    for (let i = 0; i < 3; i++) {
      const wxp = gx - T * (0.4 + i * 0.16) * Math.cos(g.age * 1.5);
      const wyp = gy + T * 0.22 + Math.sin(g.age * 4 + i * 1.8) * T * 0.12;
      ctx.beginPath();
      ctx.arc(wxp, wyp, T * (0.055 - i * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }

    // Flames while the beam is on it — same rules as any spectre
    if (scared || burn > 0.02) {
      const intensity = Math.max(burn, scared ? 0.35 : 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const fa = -Math.PI * 0.9 + (i / 4) * Math.PI * 0.8;
        const fx = gx + Math.cos(fa) * T * 0.28;
        const fy = gy - T * 0.12 + Math.sin(fa) * T * 0.27;
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

  // --- Server-room lights: drawn after the darkness pass so the racks glow
  // in the gloom. LED rows flash in a strict alternating pattern. ---
  drawServerGlow(ctx) {
    const T = C.TILE;
    if (this._rackVis && this._rackVis.length) {
      const phase = Math.floor(this.time * 2.2) % 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const t of this._rackVis) {
        const sx = (t.x - this.cam.x) * T, sy = (t.y - this.cam.y) * T;
        // Faint cool wash so the cabinet reads even in full darkness
        const wash = ctx.createRadialGradient(sx + T * 0.5, sy + T * 0.5, T * 0.05, sx + T * 0.5, sy + T * 0.5, T * 0.75);
        wash.addColorStop(0, 'rgba(120,170,220,0.10)');
        wash.addColorStop(1, 'rgba(120,170,220,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(sx - T * 0.25, sy - T * 0.25, T * 1.5, T * 1.5);
        for (let led = 0; led < 6; led++) {
          // Even rows and odd rows take turns — a marching alternating blink
          if ((led + phase) % 2) continue;
          const col = led % 2 ? '80,255,130' : '255,200,80';
          const lx = sx + T * 0.84, ly = sy + T * (0.08 + led * 0.15) + T * 0.055;
          ctx.fillStyle = `rgba(${col},0.95)`;
          ctx.fillRect(lx - T * 0.028, ly - T * 0.028, T * 0.056, T * 0.056);
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, T * 0.14);
          g.addColorStop(0, `rgba(${col},0.5)`);
          g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(lx - T * 0.14, ly - T * 0.14, T * 0.28, T * 0.28);
        }
      }
      ctx.restore();
    }
    // Sealed doors: the red lamp burns through the dark — frantic mid-slide
    if (this._doorVis && this._doorVis.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const t of this._doorVis) {
        const sx = (t.x - this.cam.x) * T, sy = (t.y - this.cam.y) * T;
        const anim = this.doorAnimAt(t.x, t.y);
        const pulse = anim > 0
          ? 0.5 + 0.5 * Math.sin(this.time * 24)
          : 0.35 + 0.3 * Math.sin(this.time * 2.4 + t.x);
        const lx = sx + T * 0.5, ly = sy + T * 0.2;
        ctx.fillStyle = `rgba(255,70,45,${0.75 * pulse})`;
        ctx.beginPath(); ctx.arc(lx, ly, T * 0.07, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, T * 0.4);
        g.addColorStop(0, `rgba(255,70,45,${0.45 * pulse})`);
        g.addColorStop(1, 'rgba(255,70,45,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx - T * 0.4, ly - T * 0.4, T * 0.8, T * 0.8);
      }
      ctx.restore();
    }
  },

  // --- Automatons, laser bolts, dropped heads, EMP shockwaves ---
  drawRobotFx(ctx) {
    const T = C.TILE;
    for (const r of this.robots) {
      const sx = (r.x - this.cam.x) * T, sy = (r.y - this.cam.y) * T;
      if (sx < -T * 2 || sx > C.VIEW_W + T * 2 || sy < -T * 2 || sy > C.VIEW_H + T * 2) continue;
      // Cutting beam: a thin flickering red lance from the pistol to the tile
      if (r.mining) {
        const gx = sx + r.facing * T * 0.24, gy = sy - T * 0.12;
        const mx = (r.mining.x + 0.5 - this.cam.x) * T, my = (r.mining.y + 0.5 - this.cam.y) * T;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,70,40,${0.55 + 0.35 * Math.sin(this.time * 40)})`;
        ctx.lineWidth = Math.max(2, T * 0.045);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,190,0.7)';
        ctx.lineWidth = Math.max(1, T * 0.018);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(mx, my); ctx.stroke();
        const g = ctx.createRadialGradient(mx, my, 1, mx, my, T * 0.35);
        g.addColorStop(0, 'rgba(255,120,70,0.7)');
        g.addColorStop(1, 'rgba(255,120,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(mx - T * 0.35, my - T * 0.35, T * 0.7, T * 0.7);
        ctx.restore();
      }
      Sprites.drawRobot(ctx, sx, sy, {
        facing: r.facing, walkPhase: r.walkPhase, flying: r.flying,
        heat: r.cooked / C.ROBOT.cookTime,
        // Booting: the eyes stutter on and off before it commits to the hunt
        dormant: r.dormant || (r.emergeT > 0 && Math.sin(this.time * 26) < 0.1),
        aim: r.aim || 0, zapT: r.zapT, time: this.time + r.age * 0.37,
      });
      // Under the beam: jagged electric arcs crawl across the chassis
      if (r.zapT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let a = 0; a < 3; a++) {
          ctx.strokeStyle = a === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(160,220,255,0.75)';
          ctx.lineWidth = Math.max(1, T * (a === 0 ? 0.02 : 0.03));
          let ax = sx + (Math.random() - 0.5) * T * 0.5;
          let ay = sy - T * 0.3 + Math.random() * T * 0.5;
          ctx.beginPath(); ctx.moveTo(ax, ay);
          for (let s = 0; s < 4; s++) {
            ax += (Math.random() - 0.5) * T * 0.3;
            ay += (Math.random() - 0.5) * T * 0.3;
            ctx.lineTo(ax, ay);
          }
          ctx.stroke();
        }
        // Hot white flash at the strike point
        const fg = ctx.createRadialGradient(sx, sy - T * 0.1, 1, sx, sy - T * 0.1, T * 0.55);
        fg.addColorStop(0, `rgba(255,255,255,${0.25 + 0.2 * Math.sin(this.time * 60)})`);
        fg.addColorStop(1, 'rgba(190,230,255,0)');
        ctx.fillStyle = fg;
        ctx.fillRect(sx - T * 0.55, sy - T * 0.65, T * 1.1, T * 1.1);
        ctx.restore();
      }
    }

    // Laser bolts: a hot white core dragging a red tail
    for (const b of this.roboLasers) {
      const sx = (b.x - this.cam.x) * T, sy = (b.y - this.cam.y) * T;
      if (sx < -T || sx > C.VIEW_W + T || sy < -T || sy > C.VIEW_H + T) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(-T * 0.55, 0, T * 0.18, 0);
      lg.addColorStop(0, 'rgba(255,60,30,0)');
      lg.addColorStop(1, 'rgba(255,90,50,0.85)');
      ctx.fillStyle = lg;
      ctx.fillRect(-T * 0.55, -T * 0.05, T * 0.73, T * 0.1);
      ctx.fillStyle = '#fff0d8';
      ctx.beginPath(); ctx.arc(T * 0.18, 0, T * 0.06, 0, Math.PI * 2); ctx.fill();
      const gl = ctx.createRadialGradient(T * 0.18, 0, 1, T * 0.18, 0, T * 0.2);
      gl.addColorStop(0, 'rgba(255,120,80,0.6)');
      gl.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(T * 0.18, 0, T * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Dropped heads: dead red eyes, unlit — and worth stopping for
    for (const h of this.roboHeads) {
      const sx = (h.x - this.cam.x) * T, sy = (h.y - this.cam.y) * T;
      if (sx < -T || sx > C.VIEW_W + T || sy < -T || sy > C.VIEW_H + T) continue;
      ctx.save();
      ctx.translate(sx, sy);
      // Attention shimmer so it reads as a pickup
      const pulse = 0.25 + 0.2 * Math.sin(this.time * 3);
      ctx.globalCompositeOperation = 'lighter';
      const pg = ctx.createRadialGradient(0, 0, T * 0.02, 0, 0, T * 0.5);
      pg.addColorStop(0, `rgba(140,200,255,${pulse})`);
      pg.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(0, 0, T * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#454c58';
      Sprites.rr(ctx, -T * 0.11, -T * 0.13, T * 0.22, T * 0.21, T * 0.05);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      Sprites.rr(ctx, -T * 0.11, -T * 0.13, T * 0.22, T * 0.21, T * 0.05);
      ctx.stroke();
      ctx.fillStyle = '#22252b';
      ctx.fillRect(-T * 0.08, T * 0.015, T * 0.16, T * 0.05);
      // The eyes: dark sockets, no light left in them
      ctx.fillStyle = '#2b1516';
      ctx.beginPath(); ctx.arc(-T * 0.05, -T * 0.04, T * 0.026, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(T * 0.05, -T * 0.04, T * 0.026, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // EMP shockwaves racing outward
    for (const wv of this.empWaves) {
      const p = wv.age / 0.9;
      const rad = p * C.EMP.radius * T;
      const sx = (wv.x - this.cam.x) * T, sy = (wv.y - this.cam.y) * T;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(150,220,255,${0.8 * (1 - p)})`;
      ctx.lineWidth = 7 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rad * 0.86, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
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
    // Big title with warm glow — shrink to fit narrow windows
    const title = 'MOTHERLOAD - REVAMPED';
    ctx.font = 'bold 64px Verdana';
    if (ctx.measureText(title).width > C.VIEW_W * 0.92) {
      const size = Math.floor(64 * (C.VIEW_W * 0.92) / ctx.measureText(title).width);
      ctx.font = `bold ${size}px Verdana`;
    }
    ctx.shadowColor = '#ff8a30';
    ctx.shadowBlur = 30;
    const g = ctx.createLinearGradient(0, C.VIEW_H * 0.3 - 40, 0, C.VIEW_H * 0.3 + 20);
    g.addColorStop(0, '#ffd9a0');
    g.addColorStop(1, '#e07b28');
    ctx.fillStyle = g;
    ctx.fillText(title, C.VIEW_W / 2, C.VIEW_H * 0.3);
    ctx.shadowBlur = 0;
    ctx.font = '19px Verdana';
    ctx.fillStyle = '#efe9dc';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText('A fan remake vibe coded with love', C.VIEW_W / 2, C.VIEW_H * 0.3 + 40);
    ctx.shadowBlur = 0;

    const hasSave = !!this.loadSaveData();
    ctx.font = 'bold 20px Verdana';
    ctx.fillStyle = '#7dffb0';
    const blink = 0.6 + 0.4 * Math.sin(this.time * 3);
    ctx.globalAlpha = blink;
    ctx.fillText(hasSave ? 'Press ENTER to continue your save' : 'Press ENTER to start digging', C.VIEW_W / 2, C.VIEW_H * 0.55);
    ctx.globalAlpha = 1;

    ctx.font = '16px Verdana';
    ctx.fillStyle = '#ded8cb';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 5;
    const lines = [
      'Arrows / WASD — fly & drill      E — enter buildings      N — mute',
      'Items: F fuel · R repair · X dynamite · C plastic · T teleport · M transmitter',
      'Sell minerals at the processor. Refuel often. Watch your hull. Dig deep…',
    ];
    lines.forEach((l, i) => ctx.fillText(l, C.VIEW_W / 2, C.VIEW_H * 0.68 + i * 26));
    ctx.font = '13px Verdana';
    ctx.fillStyle = '#aaa498';
    ctx.fillText('Music: "Airglow" by Stellardrone — CC BY 4.0', C.VIEW_W / 2, C.VIEW_H * 0.68 + lines.length * 26 + 20);
    ctx.shadowBlur = 0;
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
      gas: 'The green vapor was not a suggestion.',
      explosive: 'Standing next to your own blast radius is not recommended.',
      nuke: 'Fifty-megaton problems require more than a mining hull.',
      cavein: 'The ceiling remembered how gravity works.',
      worm: 'It was hungry. You were there. The math was simple.',
      robot: 'The security system flagged you as an intruder. Case closed.',
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
