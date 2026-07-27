// The mining pod: physics, drilling, fuel, hull, cargo, items.

const Player = {
  // Position in tile units (center of pod). Pod is slightly smaller than a tile.
  x: 0, y: 0, vx: 0, vy: 0,
  w: 0.82, h: 0.86,
  facing: 1,
  onGround: false,
  fallStartY: null,          // tile row where the current fall began

  fuel: 0, hull: 0, money: 0,
  cargo: [],                 // list of mineral keys
  items: null,
  tiers: null,

  drilling: null,            // { x, y, dir, progress, time }
  dead: false,
  teleporting: 0,
  teleportRough: false,

  reset() {
    this.x = C.BUILDINGS.fuel.x + C.BUILDINGS.fuel.w + 1.5;   // dropped off next to the fuel station
    this.y = -0.5;
    this.vx = 0; this.vy = 0;
    this.money = C.START_MONEY;
    this.cargo = [];
    this.items = { fuelTank: 0, nanobots: 0, dynamite: 0, plastic: 0, teleporter: 0, transmitter: 0 };
    this.tiers = { drill: 0, hull: 0, engine: 0, fuelTank: 0, radiator: 0, cargo: 0 };
    this.fuel = C.START_FUEL;
    this.hull = this.hullCap();
    this.drilling = null;
    this.dead = false;
    this.teleporting = 0;
    this.fallStartY = null;
    this.treadPhase = 0;
    this.maxDepth = 0;
    this.flush = null;
  },

  // --- Derived stats from upgrade tiers ---
  stat(cat) { return C.UPGRADES[cat].tiers[this.tiers[cat]].stat; },
  fuelCap() { return this.stat('fuelTank'); },
  hullCap() { return this.stat('hull'); },
  cargoCap() { return this.stat('cargo'); },
  drillSpeed() { return this.stat('drill'); },
  engineMult() { return this.stat('engine'); },
  heatResist() { return this.stat('radiator'); },

  cargoValue() { return this.cargo.reduce((s, k) => s + C.MINERALS[k].value, 0); },
  cargoWeight() { return this.cargo.reduce((s, k) => s + C.MINERALS[k].wt, 0); },
  depthFeet() { return Math.max(0, Math.floor((this.y + 0.5) * C.FEET_PER_TILE)); },

  // Heavier loads reduce lift (pod ~1,980 kg; loads beyond ~4,000 kg extra can ground you)
  liftFactor() {
    const load = Math.min(1, this.cargoWeight() / 4000);
    return 1 - C.WEIGHT_SLOW * load;
  },

  damage(amount, cause) {
    if (this.dead) return;
    this.hull -= amount;
    Game.flashHurt();
    if (this.hull <= 0) {
      this.hull = 0;
      this.die(cause);
    }
  },

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.drilling = null;
    this.flush = null;
    Audio.stop('drill');
    Audio.setWind(0);
    Audio.setTreads(0);
    Audio.thrustOff();
    Audio.play('explode');
    Particles.explosion(this.x, this.y, 1.8);
    Game.shake(1.2);
    Game.onPlayerDeath(cause);
  },

  update(dt, input) {
    if (this.dead) return;

    if (this.teleporting > 0) {
      this.teleporting -= dt;
      if (this.teleporting <= 0) {
        const b = C.BUILDINGS.fuel;
        this.x = b.x + b.w + 1.5;
        this.y = -0.5;
        this.vx = 0;
        this.drilling = null;
        this.fallStartY = null;
        if (this.teleportRough) {
          // Quantum Teleporter can fling the pod on arrival (5-9 damage possible)
          this.y = -3 - Math.random() * 2.5;
          this.vy = 0;
          this.vx = (Math.random() - 0.5) * 8;
        } else {
          this.vy = 0;
        }
        Particles.burst(this.x, this.y, 20, { color: '#7de0ff', speed: 5, life: 0.7, size: 0.1, glow: true });
      }
      return;
    }

    // --- Being flushed through the tunnels by a steam surge ---
    if (this.flush) {
      const f = this.flush;
      const speed = 15;
      const px2 = Math.floor(this.x), py2 = Math.floor(this.y);
      // Steer along the open passage: turn at corners instead of stopping
      const aheadX = Math.floor(this.x + f.dx * 0.7), aheadY = Math.floor(this.y + f.dy * 0.7);
      if (World.isSolid(aheadX, aheadY)) {
        let turns;
        if (f.dx !== 0) { f.lastDx = f.dx; turns = [[0, -1], [0, 1]]; }
        else if (f.lastDx) turns = [[f.lastDx, 0], [-f.lastDx, 0]];
        else turns = [[1, 0], [-1, 0]];
        let turned = false;
        for (const [tx2, ty2] of turns) {
          if (!World.isSolid(px2 + tx2, py2 + ty2)) { f.dx = tx2; f.dy = ty2; turned = true; break; }
        }
        if (!turned) this.flush = null;                 // dead end — surge dissipates
      }
      if (this.flush) {
        this.vx = f.dx * speed;
        this.vy = f.dy * speed;
        // Ride the middle of the passage for clean cornering
        if (f.dx !== 0) this.y += (py2 + 0.5 - this.y) * Math.min(1, dt * 8);
        else this.x += (px2 + 0.5 - this.x) * Math.min(1, dt * 8);
        this.moveAndCollide(dt);
        f.remaining -= speed * C.FEET_PER_TILE * dt;
        // Spray carrying the pod along
        if (Math.random() < dt * 50) {
          Particles.spawn({
            x: this.x - f.dx * 0.5 + (Math.random() - 0.5) * 0.4,
            y: this.y - f.dy * 0.5 + (Math.random() - 0.5) * 0.4,
            vx: -f.dx * 3 + (Math.random() - 0.5) * 2,
            vy: -f.dy * 3 + (Math.random() - 0.5) * 2,
            life: 0.5, size: 0.11,
            color: Math.random() < 0.6 ? '#7fd4ef' : '#e8f8ff', gravity: 6,
          });
        }
        if (f.remaining <= 0 || this.y < -1) this.flush = null;
        if (!this.flush) { this.vy = Math.min(this.vy, 0); this.vx *= 0.4; this.fallStartY = null; }
        Audio.setWind(0);
        Audio.setTreads(0);
        this.maxDepth = Math.max(this.maxDepth || 0, this.depthFeet());
        return;
      }
    }

    // --- Drilling in progress: pod eases into the target tile ---
    if (this.drilling) {
      Audio.setWind(0);
      Audio.setTreads(0);
      const d = this.drilling;
      d.progress += dt / d.time;
      this.fuel = Math.max(0, this.fuel - C.FUEL_DRILL_PER_SEC * dt);
      if (this.fuel <= 0) { this.die('fuel'); return; }
      const tx = d.x + 0.5, ty = d.y + 0.5 + (1 - this.h) / 2 - 0.06;
      const ease = Math.min(1, d.progress);
      this.x += (tx - this.x) * Math.min(1, dt * (4 + 10 * ease));
      this.y += (ty - this.y) * Math.min(1, dt * (4 + 10 * ease));
      // Denser debris: dust kicked out around the bit, plus occasional sparks
      const kind = World.kind(d.x, d.y);
      const dustCol = kind && kind.mineral ? kind.mineral.color : undefined;
      if (Math.random() < dt * 45) Particles.dust(tx + (Math.random() - 0.5) * 0.5, ty + 0.3, dustCol);
      if (Math.random() < dt * 30) Particles.dust(tx, ty - 0.2, dustCol);
      if (Math.random() < dt * 10) Particles.sparks(tx, ty);
      if (d.progress >= 1) this.finishDrill();
      this.maxDepth = Math.max(this.maxDepth || 0, this.depthFeet());
      return;
    }

    // --- Input & physics ---
    const thrustUp = input.up;
    const eng = this.engineMult() * this.liftFactor();

    if (thrustUp && this.fuel > 0) {
      this.vy -= C.THRUST * eng * dt;
      this.fuel = Math.max(0, this.fuel - C.FUEL_THRUST_PER_SEC * dt);
      Particles.spawn({
        x: this.x + (Math.random() - 0.5) * 0.3, y: this.y + this.h / 2,
        vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 2,
        life: 0.25, size: 0.1, color: Math.random() < 0.5 ? '#ffb347' : '#ff7a2f', glow: true,
      });
      Audio.thrustOn();
    } else {
      Audio.thrustOff();
    }
    if (input.left)  { this.vx -= C.SIDE_ACCEL * eng * dt; this.facing = -1; }
    if (input.right) { this.vx += C.SIDE_ACCEL * eng * dt; this.facing = 1; }

    // Fuel burns only while maneuvering (no idle drain); an empty tank mid-move still explodes
    if ((input.left || input.right) && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - C.FUEL_IDLE_PER_SEC * dt);
    }
    if (this.fuel <= 0 && (thrustUp || input.left || input.right)) { this.die('fuel'); return; }

    this.vy += C.GRAVITY * dt;
    this.vx -= this.vx * C.AIR_DRAG * dt;
    if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;
    // Ascent is capped at 100 ft/s — except while riding a steam geyser
    this.boostT = Math.max(0, (this.boostT || 0) - dt);
    if (this.boostT <= 0) {
      const maxUp = C.MAX_ASCENT_FPS / C.FEET_PER_TILE;
      if (this.vy < -maxUp) this.vy = -maxUp;
    }

    // Wind rush builds with fall speed
    const windI = Math.max(0, (this.vy - 7) / (C.MAX_FALL - 7));
    Audio.setWind(Math.min(1, windI));

    // Track fall start for distance-based damage
    if (this.vy > 0.5 && this.fallStartY === null) this.fallStartY = this.y;
    if (this.vy <= 0) this.fallStartY = this.y;

    this.moveAndCollide(dt);

    // Treads roll only while actually driving on the ground
    if (this.onGround) this.treadPhase = (this.treadPhase || 0) + this.vx * dt;
    // Quiet track rumble scaled to ground speed
    Audio.setTreads(this.onGround ? Math.min(1, Math.abs(this.vx) / 5) : 0);

    // Personal depth record
    this.maxDepth = Math.max(this.maxDepth || 0, this.depthFeet());

    // --- Start drilling? Grounded + direction key toward a drillable tile ---
    if (this.onGround && !thrustUp) {
      const cx = Math.floor(this.x), cy = Math.floor(this.y);
      if (input.down) this.tryDrill(cx, cy + 1, 'down');
      else if (input.left && World.isSolid(cx - 1, cy)) this.tryDrill(cx - 1, cy, 'left');
      else if (input.right && World.isSolid(cx + 1, cy)) this.tryDrill(cx + 1, cy, 'right');
    }
  },

  tryDrill(tx, ty, dir) {
    if (ty < 0 || !World.isSolid(tx, ty)) return;
    if (!World.isDrillable(tx, ty)) return;    // stone: drill just skitters off
    const feet = C.rowToFeet(ty);
    const harden = 1 + (feet / 7300) * C.DRILL_DEPTH_HARDEN;
    const time = (C.DRILL_BASE_TIME * harden) / this.drillSpeed();
    this.drilling = { x: tx, y: ty, dir, progress: 0, time: Math.max(0.1, time) };
    this.fallStartY = null;
    Audio.play('drill');
  },

  finishDrill() {
    const d = this.drilling;
    this.drilling = null;
    const kind = World.kind(d.x, d.y);
    World.clear(d.x, d.y);
    Audio.stop('drill');

    if (kind.mineral) {
      if (this.cargo.length < this.cargoCap()) {
        this.cargo.push(kind.key);
        Audio.pickup(kind.mineral.value);
        Game.popup(d.x + 0.5, d.y + 0.2, '+$' + kind.mineral.value.toLocaleString());
        Particles.sparks(d.x + 0.5, d.y + 0.5);
      } else {
        // Full bay: the mineral is destroyed, as in the original
        Game.toast('Cargo bay full — mineral destroyed!');
        Audio.play('clank');
      }
    } else if (kind.artifact) {
      const a = kind.artifact;
      this.money += a.value;
      Audio.pickup(a.value);
      Game.popup(d.x + 0.5, d.y + 0.2, '+$' + a.value.toLocaleString(), '#ffd76e');
      Game.toast(`${a.name}! +$${a.value.toLocaleString()}`);
      Particles.burst(d.x + 0.5, d.y + 0.5, 14, { color: a.color, speed: 4, life: 0.7, size: 0.08, glow: true });
    } else if (kind.lava) {
      // Lava hits twice (two damage rolls), reduced by radiator
      const res = 1 - this.heatResist();
      const roll = base => Math.max(1, Math.round((base + (Math.random() * 4 - 2)) * res));
      Particles.explosion(d.x + 0.5, d.y + 0.5, 1.3);
      Audio.play('lava');
      Game.shake(0.5);
      this.damage(roll(C.LAVA.dmg1), 'lava');
      if (!this.dead) this.damage(roll(C.LAVA.dmg2), 'lava');
    } else if (kind.steam) {
      // The pressurized pool bursts and flushes the pod back through the open
      // tunnel — away from the pocket, steering around corners, for ~200 ft.
      Audio.play('steam');
      Game.shake(0.5);
      Game.toast('Steam pocket — pressure surge!');
      let fdx = 0, fdy = 0;
      if (d.dir === 'left') fdx = 1;
      else if (d.dir === 'right') fdx = -1;
      else fdy = -1;
      this.flush = { dx: fdx, dy: fdy, lastDx: fdx, remaining: C.STEAM.boostFt };
      this.fallStartY = null;
      Particles.burst(d.x + 0.5, d.y + 0.5, 26, { color: '#7fd4ef', speed: 5, life: 0.6, size: 0.12, vx: fdx * 7, vy: fdy * 7, gravity: 8 });
      Particles.burst(d.x + 0.5, d.y + 0.3, 14, { color: '#e8f8ff', speed: 2.5, life: 0.9, size: 0.16, vx: fdx * 4, vy: fdy * 4, gravity: -2 });
    } else if (kind.gas) {
      // Invisible gas pocket: detonates like dynamite with a green blast.
      // Damage scales with depth but is capped so it can never one-shot a full hull.
      const feet = C.rowToFeet(d.y);
      const raw = Math.round(((feet - 3000) / 15) * (1 - this.heatResist()) + (Math.random() * 2 - 1));
      const dmg = Math.max(1, Math.min(raw, Math.floor(this.hullCap() * C.GAS_DMG_CAP)));
      World.blast(d.x, d.y, 1);
      Particles.explosion(d.x + 0.5, d.y + 0.5, 1.2);
      Particles.burst(d.x + 0.5, d.y + 0.5, 20, { color: '#9fe870', speed: 7, life: 0.5, size: 0.12, glow: true });
      Audio.play('gas');
      Game.shake(0.7);
      this.damage(dmg, 'gas');
    }
    this.vy = Math.min(this.vy, 1);
  },

  moveAndCollide(dt) {
    const hw = this.w / 2, hh = this.h / 2;
    let nx = this.x + this.vx * dt;

    // Horizontal
    const dirX = Math.sign(this.vx);
    if (dirX !== 0) {
      const edge = nx + dirX * hw;
      const tx = Math.floor(edge);
      for (let ty = Math.floor(this.y - hh + 0.02); ty <= Math.floor(this.y + hh - 0.02); ty++) {
        if (World.isSolid(tx, ty)) {
          nx = dirX > 0 ? tx - hw - 0.001 : tx + 1 + hw + 0.001;
          this.vx = 0;
          break;
        }
      }
    }
    this.x = nx;

    let ny = this.y + this.vy * dt;
    const dirY = Math.sign(this.vy);
    this.onGround = false;
    if (dirY !== 0) {
      const edge = ny + dirY * hh;
      const ty = Math.floor(edge);
      for (let tx = Math.floor(this.x - hw + 0.02); tx <= Math.floor(this.x + hw - 0.02); tx++) {
        if (World.isSolid(tx, ty) || (dirY > 0 && ty === 0 && this.y < 0 && Game.overBuildingPad(this.x))) {
          if (dirY > 0) {
            this.land();
            ny = ty - hh - 0.001;
            this.onGround = true;
          } else {
            ny = ty + 1 + hh + 0.001;
          }
          this.vy = 0;
          break;
        }
      }
    }
    this.y = ny;

    if (!this.onGround && Math.abs(this.vy) < 0.5) {
      const ty = Math.floor(this.y + hh + 0.05);
      for (let tx = Math.floor(this.x - hw + 0.02); tx <= Math.floor(this.x + hw - 0.02); tx++) {
        if (World.isSolid(tx, ty)) { this.onGround = true; break; }
      }
    }
  },

  land() {
    if (this.fallStartY === null) return;
    const fallFt = (this.y - this.fallStartY) * C.FEET_PER_TILE;
    this.fallStartY = null;
    if (fallFt < C.FALL_DMG[0].ft) return;
    let dmg = 0;
    for (const step of C.FALL_DMG) if (fallFt >= step.ft) dmg = step.dmg;
    Audio.play('thud');
    Game.shake(Math.min(0.6, dmg * 0.06));
    Particles.dust(this.x, this.y + this.h / 2, '#8a6a4a');
    this.damage(dmg, 'fall');
  },

  // --- Items ---
  useItem(key) {
    if (this.dead || this.teleporting > 0 || !this.items || this.items[key] <= 0) return false;
    const grounded = this.onGround && !this.drilling;
    switch (key) {
      case 'fuelTank':
        if (this.fuel >= this.fuelCap()) { Game.toast('Fuel already full'); return false; }
        this.items[key]--;
        this.fuel = Math.min(this.fuelCap(), this.fuel + 25);
        Audio.play('refuel');
        Game.toast('Reserve fuel: +25 L');
        return true;
      case 'nanobots':
        if (this.hull >= this.hullCap()) { Game.toast('Hull already full'); return false; }
        this.items[key]--;
        this.hull = Math.min(this.hullCap(), this.hull + 30);
        Audio.play('repair');
        Game.toast('Nanobots: +30 hull');
        return true;
      case 'dynamite':
      case 'plastic': {
        if (!grounded) { Game.toast('Must be on solid ground'); return false; }
        this.items[key]--;
        const r = key === 'dynamite' ? 1 : 2;
        const cx = Math.floor(this.x), cy = Math.floor(this.y);
        World.blast(cx, cy, r);
        Particles.explosion(this.x, this.y, key === 'dynamite' ? 1.4 : 2.0);
        Audio.play('explode');
        Game.shake(key === 'dynamite' ? 0.6 : 1.0);
        Boss.onExplosion(cx, cy, r, key);
        return true;
      }
      case 'teleporter':
        if (!grounded) { Game.toast('Must be on solid ground'); return false; }
        if (Game.bossActive()) { Game.toast('Something is blocking the signal…'); return false; }
        this.items[key]--;
        this.teleporting = 1.2;
        this.teleportRough = true;
        Audio.play('teleport');
        Particles.burst(this.x, this.y, 24, { color: '#7de0ff', speed: 5, life: 0.8, size: 0.1, glow: true });
        return true;
      case 'transmitter':
        if (!grounded) { Game.toast('Must be on solid ground'); return false; }
        if (Game.bossActive()) { Game.toast('Something is blocking the signal…'); return false; }
        this.items[key]--;
        this.teleporting = 1.2;
        this.teleportRough = false;
        Audio.play('teleport');
        Particles.burst(this.x, this.y, 24, { color: '#c9a2ff', speed: 5, life: 0.8, size: 0.1, glow: true });
        return true;
    }
    return false;
  },

  serialize() {
    return {
      money: this.money, fuel: this.fuel, hull: this.hull,
      maxDepth: this.maxDepth || 0,
      items: Object.assign({}, this.items),
      tiers: Object.assign({}, this.tiers),
    };
  },

  restore(d) {
    this.reset();
    this.money = d.money;
    this.fuel = d.fuel;
    this.hull = d.hull;
    this.maxDepth = d.maxDepth || 0;
    Object.assign(this.items, d.items);
    Object.assign(this.tiers, d.tiers);
  },
};
