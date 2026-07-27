// World generation & tile queries.
// Tile ids: 0 empty, 1 dirt, 2 stone (undrillable), 3 lava, 4 gas (invisible — draws as dirt),
// then minerals, then artifacts.

const World = {
  grid: null,          // Uint8Array WORLD_W * WORLD_H
  tileKinds: [],
  kindIndex: {},
  variant: null,       // per-tile texture variant (visual only)
  dug: null,           // per-tile "was drilled" flag
  seed: 0,

  init(seed) {
    this.seed = seed >>> 0;
    const W = C.WORLD_W, H = C.WORLD_H;
    this.grid = new Uint8Array(W * H);
    this.variant = new Uint8Array(W * H);
    this.dug = new Uint8Array(W * H);

    this.tileKinds = [
      { key: 'empty' }, { key: 'dirt' }, { key: 'stone' },
      { key: 'lava', lava: true }, { key: 'gas', gas: true },
      { key: 'steam', steam: true },
      { key: 'magnetite', magnet: true }, { key: 'sand', sand: true },
      { key: 'nuke', nuke: true },
    ];
    this.kindIndex = { empty: 0, dirt: 1, stone: 2, lava: 3, gas: 4, steam: 5, magnetite: 6, sand: 7, nuke: 8 };
    for (const key of Object.keys(C.MINERALS)) {
      this.kindIndex[key] = this.tileKinds.length;
      this.tileKinds.push({ key, mineral: C.MINERALS[key] });
    }
    for (const key of Object.keys(C.ARTIFACTS)) {
      this.kindIndex[key] = this.tileKinds.length;
      this.tileKinds.push({ key, artifact: C.ARTIFACTS[key] });
    }

    this.generate();
  },

  // Deterministic PRNG (mulberry32)
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  generate() {
    const W = C.WORLD_W, H = C.WORLD_H;
    const rand = this.rng(this.seed);
    const bottom = C.GROUND_BOTTOM_ROW;

    for (let y = 0; y < H; y++) {
      const feet = C.rowToFeet(y);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        this.variant[i] = Math.floor(rand() * 6);

        // Side walls: impassable stone
        if (x === 0 || x === W - 1) { this.grid[i] = 2; continue; }
        // Very bottom rows: bedrock floor of Hell
        if (y >= H - 2) { this.grid[i] = 2; continue; }

        // Hell: hollow arena below the impassable floor
        if (y > bottom) { this.grid[i] = 0; continue; }
        // Impassable floor at ~-7,300 ft with one drillable gap at the far right
        if (y >= bottom - 1 && y <= bottom) {
          this.grid[i] = (x === C.HELL_GAP_X) ? 1 : 2;
          continue;
        }

        const r = rand() * 1000;
        const depthT = Math.min(1, feet / 7300);

        // Occasional natural caverns (rarer near surface)
        const cavern = y < 3 ? 0 : 6 + depthT * 18;
        if (r < cavern) { this.grid[i] = 0; continue; }
        let acc = cavern;

        // Stones/boulders from ~-1,500 ft, more common with depth
        if (feet >= C.STONE.min) {
          acc += C.STONE.freq * (0.4 + 0.6 * depthT);
          if (r < acc) { this.grid[i] = 2; continue; }
        }

        // Lava pockets from ~-3,000 ft
        if (feet >= C.LAVA.min) {
          acc += C.LAVA.freq * (0.5 + 0.5 * depthT);
          if (r < acc) { this.grid[i] = 3; continue; }
        }

        // Gas pockets from ~-4,750 ft, ramping hard toward the bottom
        if (feet >= C.GAS.min) {
          const t = Math.min(1, (feet - C.GAS.min) / (7300 - C.GAS.min));
          acc += C.GAS.maxFreq * t * t;
          if (r < acc) { this.grid[i] = 4; continue; }
        }

        // Minerals by depth band (frequency fades out below fadeAt)
        let placed = false;
        for (const key of Object.keys(C.MINERALS)) {
          const m = C.MINERALS[key];
          if (feet < m.min) continue;
          let f = m.freq;
          if (feet > m.fadeAt) f *= Math.max(0, 1 - (feet - m.fadeAt) / 800);
          if (f <= 0) continue;
          acc += f;
          if (r < acc) { this.grid[i] = this.kindIndex[key]; placed = true; break; }
        }
        if (placed) continue;

        // Artifacts (instant cash), rare, from ~-1,000 ft
        for (const key of Object.keys(C.ARTIFACTS)) {
          const a = C.ARTIFACTS[key];
          if (feet < a.min) continue;
          acc += a.freq;
          if (r < acc) { this.grid[i] = this.kindIndex[key]; placed = true; break; }
        }
        if (placed) continue;

        this.grid[i] = 1;   // dirt
      }
    }

    // Steam pockets: pools sized 1x1 up to 4x4, stamped after the main pass so
    // each pool exists whole regardless of scan order
    const minRow = C.feetToRow(C.STEAM.min);
    const pockets = Math.floor((bottom - minRow) / 14);
    for (let n = 0; n < pockets; n++) {
      const size = 1 + Math.floor(rand() * 4);
      const cy = minRow + 2 + Math.floor(rand() * (bottom - minRow - 8));
      const cx = 2 + Math.floor(rand() * (W - 4 - size));
      for (let y = cy; y < cy + size; y++) {
        for (let x = cx; x < cx + size; x++) {
          if (x <= 0 || x >= W - 1 || y <= 2 || y >= bottom - 1) continue;
          if (size === 4) {
            // The big pools get clipped corners so they read as round
            const ddx = x - (cx + 1.5), ddy = y - (cy + 1.5);
            if (ddx * ddx + ddy * ddy > 4.4) continue;
          }
          if (this.grid[y * W + x] === 2) continue;        // leave boulders be
          this.grid[y * W + x] = 5;
        }
      }
    }

    // Magnetite lodestones: lone tiles scattered from ~-1,000 ft whose field
    // inverts the pod's controls (handled in Game.updateMagnet)
    const magRow = C.feetToRow(C.MAGNETITE.min);
    for (let y = magRow; y < bottom - 2; y++) {
      if (rand() >= C.MAGNETITE.chancePerRow) continue;
      const x = 2 + Math.floor(rand() * (W - 4));
      if (this.grid[y * W + x] === 1) this.grid[y * W + x] = 6;
    }

    // Buried pyramids: sandstone shells with hollow chambers and a treasure
    // (plus its curse) at the heart. Spread one per depth slice.
    this.pyramids = [];
    const pTop = C.feetToRow(C.PYRAMID.minFt), pBot = C.feetToRow(C.PYRAMID.maxFt);
    for (let n = 0; n < C.PYRAMID.count; n++) {
      const cy = pTop + Math.floor(((n + rand()) / C.PYRAMID.count) * (pBot - pTop));
      const cx = 6 + Math.floor(rand() * (W - 12));
      this.stampPyramid(cx, cy);
      this.pyramids.push({ x: cx, y: cy });
    }

    // Dormant nuclear warheads sleeping in the deep rock
    this.nukes = [];
    const nukeRow = C.feetToRow(C.NUKE.min);
    for (let n = 0; n < C.NUKE.count; n++) {
      for (let tries = 0; tries < 40; tries++) {
        const y = nukeRow + Math.floor(rand() * (bottom - 3 - nukeRow));
        const x = 2 + Math.floor(rand() * (W - 4));
        if (this.grid[y * W + x] !== 1) continue;
        this.grid[y * W + x] = 8;
        this.nukes.push({ x, y });
        break;
      }
    }
  },

  // A pyramid: 11 tiles wide at the base, 6 tall, 2-thick sandstone walls
  // around a hollow tomb. The relic waits at the center of the floor row,
  // flanked by goldium grave goods.
  stampPyramid(cx, cy) {
    const W = C.WORLD_W;
    const put = (x, y, id) => {
      if (x <= 0 || x >= W - 1 || y <= 2 || y >= C.GROUND_BOTTOM_ROW - 1) return;
      this.grid[y * W + x] = id;
    };
    for (let r = 0; r <= 5; r++) {
      const y = cy - 5 + r;
      for (let dx = -r; dx <= r; dx++) {
        const interior = r >= 2 && Math.abs(dx) <= r - 2;
        put(cx + dx, y, interior ? 0 : 7);
      }
    }
    put(cx, cy, this.kindIndex.relic);
    put(cx - 2, cy, this.kindIndex.goldium);
    put(cx + 2, cy, this.kindIndex.goldium);
  },

  inBounds(x, y) { return x >= 0 && x < C.WORLD_W && y >= 0 && y < C.WORLD_H; },

  get(x, y) {
    if (y < 0) return 0;                        // sky
    if (!this.inBounds(x, y)) return 2;         // out of bounds = stone
    return this.grid[y * C.WORLD_W + x];
  },

  kind(x, y) { return this.tileKinds[this.get(x, y)]; },

  isSolid(x, y) { return this.get(x, y) !== 0; },

  isDrillable(x, y) {
    const id = this.get(x, y);
    return id !== 0 && id !== 2 && y >= 0;
  },

  clear(x, y) {
    if (!this.inBounds(x, y) || y < 0) return;
    const i = y * C.WORLD_W + x;
    this.grid[i] = 0;
    this.dug[i] = 1;
  },

  // Blast a square area (explosives clear everything except boundary stone).
  // Warheads shrug off the blast — they get ARMED instead, and are returned
  // so the caller can start their fuses.
  blast(cx, cy, radius) {
    const armed = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y) || y < 0) continue;
        if (x === 0 || x === C.WORLD_W - 1 || y >= C.WORLD_H - 2) continue;
        // The impassable floor resists blasting (except the gap column)
        if (y >= C.GROUND_BOTTOM_ROW - 1 && y <= C.GROUND_BOTTOM_ROW && x !== C.HELL_GAP_X) continue;
        if (this.grid[y * C.WORLD_W + x] === 8) { armed.push({ x, y }); continue; }
        this.clear(x, y);
      }
    }
    return armed;
  },

  // Marsquake: collapse dug tunnels — refill with plain dirt (no ore respawn)
  quake() {
    for (let i = 0; i < this.grid.length; i++) {
      if (this.dug[i] && this.grid[i] === 0) {
        const y = Math.floor(i / C.WORLD_W);
        // Keep Hell hollow
        if (y > C.GROUND_BOTTOM_ROW) continue;
        this.grid[i] = 1;
        this.dug[i] = 0;
      }
    }
  },

  // Persistence: the cleared set fully describes the world (generation is seeded)
  serialize() {
    const cleared = [];
    for (let i = 0; i < this.grid.length; i++) {
      const y = Math.floor(i / C.WORLD_W);
      if (y > C.GROUND_BOTTOM_ROW) continue;          // Hell is naturally hollow
      if (this.grid[i] === 0 && y >= 0) cleared.push(i);
    }
    return { seed: this.seed, cleared };
  },

  restore(d) {
    this.init(d.seed);
    for (const i of d.cleared) {
      this.grid[i] = 0;
      this.dug[i] = 1;
    }
  },
};
