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
  input: { up: false, down: false, left: false, right: false },
  stars: [],
  deathCause: null,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    UI.init();
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
    this._caveA = this._caveB = null;    // mask canvases must match the viewport
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

    if (this.state !== 'play') { Particles.update(dt); return; }
    // Shop menus pause the world (and the fuel drain), as in the original
    if (UI.isOpen()) { Particles.update(dt); return; }

    Player.update(dt, this.input);
    Boss.update(dt);
    Particles.update(dt);
    Story.check();

    // Fuel-low banner: fires each time fuel crosses down through 25%
    if (this.fuelWarnT > 0) this.fuelWarnT -= dt;
    const fuelFrac = Player.fuel / Player.fuelCap();
    if (fuelFrac <= 0.25 && this._prevFuelFrac > 0.25 && !Player.dead) {
      this.fuelWarnT = 3.5;
      Audio.play('denied');
    }
    this._prevFuelFrac = fuelFrac;

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
      Sprites.drawPod(ctx,
        (Player.x - this.cam.x) * C.TILE,
        (Player.y - this.cam.y) * C.TILE,
        {
          facing: Player.facing,
          drilling: Player.drilling ? Player.drilling.dir : null,
          thrust: this.input.up && this.state === 'play',
          time: this.time,
          teleporting: Player.teleporting,
        });
    }
    this.drawLighting(ctx);

    // Hurt vignette
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,30,20,${this.hurtFlash * 0.9})`;
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
        let tex;
        if (id === 1) tex = Sprites.dirt[band][v];
        else if (id === 2) tex = Sprites.stone[band];
        else if (id === 3) tex = Sprites.lavaBase;
        else if (id === 4) tex = Sprites.dirt[band][v];        // gas is indistinguishable from dirt
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

    const px = (Player.x - this.cam.x) * C.TILE;
    const py = (Player.y - this.cam.y) * C.TILE;
    const radius = C.TILE * (this.inHell() ? 7 : 5.2);

    // Radial light around the pod, multiplied over a dark overlay
    const g = ctx.createRadialGradient(px, py, C.TILE * 0.8, px, py, radius);
    const tint = this.inHell() ? '40,8,4' : '6,5,8';
    g.addColorStop(0, `rgba(${tint},0)`);
    g.addColorStop(0.55, `rgba(${tint},${darkness * 0.45})`);
    g.addColorStop(1, `rgba(${tint},${darkness})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);

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
