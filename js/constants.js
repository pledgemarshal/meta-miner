// Motherload Remake — central tuning data.
// Values sourced from the Motherload wiki & GameFAQs walkthrough to match the 2004 original.

const C = {
  // --- Display ---
  VIEW_W: 960,
  VIEW_H: 640,
  TILE: 48,            // on-screen pixels per tile
  TEX: 96,             // pre-rendered texture resolution per tile

  // --- World (12.5 ft per tile, 32 tiles wide; extended: ground to -11,000 ft + Hell) ---
  WORLD_W: 32,
  WORLD_H: 889,                 // tiles deep; Hell arena sits below the floor
  FEET_PER_TILE: 12.5,
  GROUND_BOTTOM_ROW: 880,       // impassable floor at -11,000 ft except the Hell gap
  HELL_GAP_X: 29,               // right-side soil gap leading into Hell
  SURFACE_ROWS: 8,              // sky rows drawn above ground
  DEPTH_MAX: 11000,             // feet at the bottom floor — depth curves normalize to this

  // --- Physics (units: tiles/sec, tiles/sec^2) ---
  GRAVITY: 14,
  THRUST: 26,
  SIDE_ACCEL: 16,
  AIR_DRAG: 1.6,
  MAX_FALL: 22,                 // terminal velocity (~600 ft fall to reach max dmg)
  MAX_ASCENT_FPS: 250,          // upward speed cap in feet per second
  WEIGHT_SLOW: 0.55,            // fraction of thrust lost at max cargo weight

  // --- Fall damage (distance in feet -> HP). Softened from the original: safe up to ~50 ft. ---
  FALL_DMG: [
    { ft: 50, dmg: 1 }, { ft: 100, dmg: 2 }, { ft: 200, dmg: 3 },
    { ft: 350, dmg: 4 }, { ft: 600, dmg: 5 },
  ],

  // --- Fuel (liters; original: ~5 L/min idle, ~17 L/min flying, more while digging) ---
  FUEL_IDLE_PER_SEC: 5 / 60,
  FUEL_THRUST_PER_SEC: 17 / 60,
  FUEL_DRILL_PER_SEC: 20 / 60,
  FUEL_PRICE: 1,               // $1 per liter
  FUEL_WARN_FRAC: 0.35,        // FUEL LOW banner + red bar at or below this fraction

  // --- Drilling ---
  DRILL_BASE_TIME: 0.5,        // seconds per tile with stock drill at surface
  // Each visibly darker soil band drills 25% slower than the one above it
  // (compounding), so deeper strata push the player toward drill upgrades.
  BAND_DRILL_PENALTY: 0.25,

  // --- Start state ---
  START_MONEY: 20,
  START_FUEL: 4,               // dropped off nearly empty — refueling is the first task

  // --- Minerals: value $, weight kg, spawn depths (ft, positive down), rarity ---
  MINERALS: {
    ironium:    { name: 'Ironium',     value: 30,     wt: 10,  min: 25,   fadeAt: 2600, freq: 58, color: '#b0623a' },
    bronzium:   { name: 'Bronzium',    value: 60,     wt: 10,  min: 25,   fadeAt: 3200, freq: 38, color: '#c98946' },
    silverium:  { name: 'Silverium',   value: 100,    wt: 10,  min: 25,   fadeAt: 4000, freq: 30, color: '#c9d2dd' },
    goldium:    { name: 'Goldium',     value: 250,    wt: 20,  min: 250,  fadeAt: 6500, freq: 22, color: '#f4c542' },
    platinium:  { name: 'Platinium',   value: 750,    wt: 30,  min: 800,  fadeAt: 8000, freq: 13, color: '#dfe8ef' },
    einsteinium:{ name: 'Einsteinium', value: 2000,   wt: 40,  min: 1600, fadeAt: 9500, freq: 9,  color: '#7de07d' },
    emerald:    { name: 'Emerald',     value: 5000,   wt: 60,  min: 2400, fadeAt: 10500, freq: 6,  color: '#2ee66b' },
    ruby:       { name: 'Ruby',        value: 20000,  wt: 80,  min: 4000, fadeAt: 11000, freq: 4,  color: '#f0304e' },
    diamond:    { name: 'Diamond',     value: 100000, wt: 100, min: 4400, fadeAt: 11000, freq: 2.5,color: '#aef4ff' },
    amazonite:  { name: 'Amazonite',   value: 500000, wt: 120, min: 5500, fadeAt: 11000, freq: 1.5,color: '#37d8c0' },
  },

  // --- Artifacts: instant cash on drilling (not stored in cargo), ~1-2 per 1,000 ft ---
  ARTIFACTS: {
    bones:    { name: 'Dinosaur Bones',     value: 1000,  min: 1000, freq: 1.2, color: '#e8e0c8' },
    treasure: { name: 'Buried Treasure',    value: 5000,  min: 1000, freq: 0.8, color: '#ffd76e' },
    skeleton: { name: 'Martian Skeleton',   value: 10000, min: 1000, freq: 0.6, color: '#d8f0d8' },
    artifact: { name: 'Religious Artifact', value: 50000, min: 1000, freq: 0.4, color: '#c98af5' },
    // Never random-rolled (freq 0): placed only in pyramid treasure chambers
    relic:    { name: "Pharaoh's Bounty",   value: 150000, min: 999999, freq: 0, color: '#ffd23e' },
  },

  // --- Hazards ---
  // Lava: visible red tiles from ~-3,000 ft. Two damage rolls (~58 and ~41 base ±2), radiator reduces.
  LAVA: { min: 3000, freq: 7, dmg1: 58, dmg2: 41, color: '#ff7a2f' },
  // Gas: visible green-stained tiles from ~-4,750 ft, ramping hard.
  // (Originally invisible like the 2004 game — changed for fairness.)
  // Damage = ((depth + 3000) / 15) * (1 - radiator), ±1.
  GAS: { min: 4750, common: 4950, maxFreq: 60 },
  // Stones/boulders: undrillable, from ~-1,500 ft, more common with depth.
  STONE: { min: 1500, freq: 22 },
  // Steam pockets: pools of boiling groundwater from ~-800 ft, sized 1x1 up to
  // roundish 4x4. Drilling any tile pops the whole pool and flushes the pod
  // through the open tunnel, steering around corners — 250 ft per tile of pool
  // size (1x1: 250, 2x2: 500, 3x3: 750, 4x4: 1,000). No damage — pure plumbing.
  STEAM: { min: 800, boostPerSizeFt: 250, color: '#9fd8e8' },
  // Gas can hurt badly but never one-shot: capped at this fraction of max hull
  GAS_DMG_CAP: 0.7,
  // Lava too: both damage rolls combined never exceed this fraction of max
  // hull, so full health always survives a lava kiss (barely)
  LAVA_DMG_CAP: 0.8,

  // --- Depth gimmicks: a new surprise every 1,000 ft ---
  // Magnetite lodestones from ~-1,000 ft: entering the visible field inverts
  // all controls until you leave (or drill the stone out).
  MAGNETITE: { min: 1000, chancePerRow: 0.1, radius: 3.4 },
  // Buried pyramids from ~-2,000 ft: sandstone shells (slower to drill),
  // hollow chambers, a treasure at the heart — and a curse on whoever takes it.
  PYRAMID: { minFt: 2000, maxFt: 6500, count: 5, sandHardness: 2.5 },
  // Dormant warheads from ~-4,000 ft. Drilling any tile beside one arms it:
  // flee the blast, or drill the warhead itself before the fuse runs out to
  // salvage it for a payout. Blasts chain-arm other warheads they uncover.
  // cloudLife: mushroom cloud dissipation (visual only — flyable); falloutLife:
  // how long the site stays radioactive (Geiger clicks inside dmgRadius);
  // shockRadius: how far the visible shockwave ring travels past the damage zone
  NUKE: { min: 4000, count: 5, fuse: 6, chainFuse: 0.8, blastRadius: 5, dmgRadius: 7.5, maxDmg: 150, salvage: 60000,
          cloudLife: 8, falloutLife: 120, shockRadius: 14 },
  // The worm from ~-5,000 ft: two tiles wide, chews its own tunnel toward the
  // pod at a fixed rate — half the stock drill's 2 tiles/sec, never faster no
  // matter what drill the player owns. ONLY the Microwave Cannon hurts it —
  // explosives just annoy it. It loses the trail if the pod gets 500+ ft away,
  // and never hunts above -500 ft.
  WORM: { min: 5000, speedSolid: 1.0, speedOpen: 1.6, biteDmg: 25, biteCd: 1.2, bounty: 40000, lifetime: 55, leashFt: 500, ceilingFt: 500 },

  // --- Microwave Cannon: unlocked by Mark Zucker-ore's transmission at -3,000 ft ---
  // Hold the mouse button to cook the tile under the cursor (anywhere on
  // screen, one-tile focus). Heating times in seconds per target type:
  // warheads arm, lodestones boil then burst, springs boil then burst (1-tile
  // blast), ghosts burn (stacks with the flashlight), and the worm cooks —
  // its ONLY weakness. Heat on rocks/springs resets if you switch targets;
  // worm heat is cumulative.
  // heatGas is near-instant: microwaves + combustible vapor = immediate ignition;
  // heatCrack lets the cannon knock loose a cracked ceiling from a safe distance
  MICROWAVE: { heatNuke: 0.6, heatMagnet: 2, heatSteam: 2, heatWorm: 10, heatGas: 0.15, heatCrack: 0.4, heatIce: 0.8 },

  // --- Permafrost band from -6,000 to -7,600 ft: the ground turns icy and
  // ice blocks pepper the soil. Drilling an ice block adds frost to the pod
  // (ICE bar in the HUD); at 100% the pod freezes solid and dies. Aim the
  // Microwave Cannon at YOURSELF to melt off — a full bar takes meltSecs
  // (faster with worm-meat power levels). Ice drills quickly, and the cannon
  // can also melt ice tiles in the ground outright.
  // Below maxFt the permafrost keeps going as frozen dirt down to deepMaxFt:
  // fewer ice blocks (deepFreq), but the same cold cast — cold enough that
  // something down there uses it for cooling…
  ICE: { minFt: 6000, maxFt: 7600, freq: 160, drillMult: 0.7, frostPerBlock: 10, meltSecs: 3,
         deepMaxFt: 9000, deepFreq: 55 },

  // --- AI server rooms, buried in the deep permafrost (-7,700 to -8,950 ft)
  // and kept cool by it. Metal-walled vaults full of humming racks. Cutting
  // into one trips the AI alarm: a door slides open and a security automaton
  // marches out. wallHardness: drill-speed penalty on the casing.
  SERVER: { minFt: 7700, maxFt: 8950, count: 4, wallHardness: 2.2, salvage: 20000 },
  // The automaton stalks slowly but never stops: it walks and rocket-flies,
  // fires a slow dodgeable laser bolt (50 dmg), and when the path is blocked
  // it lasers the rock away tile by tile (mineSecs each) to keep coming.
  // Only the Microwave Cannon hurts it: ~cookTime beam-seconds to melt down
  // (less with worm-meat power levels). Beyond leash tiles it powers down in
  // place and reboots when you return. doorSecs: the vault door slide-open;
  // emergeSecs: boot-up pause in the doorway before the hunt begins.
  ROBOT: { walkSpeed: 0.75, flySpeed: 1.5, laserDmg: 50, laserSpeed: 4.5, laserCd: 2.8,
           laserRange: 11, cookTime: 20, punchDmg: 15, punchCd: 1.2, leash: 40, wakeDist: 12,
           mineSecs: 0.5, doorSecs: 0.9, emergeSecs: 0.8 },
  // --- Nuclear rocket: the automaton's heavy option. It stops, bends over,
  // and a back-mounted designator locks onto the pod for aimSecs (with a
  // robotic callout), then launches a slow tracking rocket. It flies until it
  // meets rock, pod or beam — cookSecs of microwave sets it off mid-air.
  // The blast is a half-scale nuke that hurts EVERYTHING, its owner included.
  // First lock always comes within ~6 s of deployment; never again within cd.
  // The designator sees THROUGH rock (no hiding), and the rocket burrows
  // through terrain at groundSpeedMult pace — it only detonates on the beam,
  // the pod, or another creature. lifetime is a distant fail-safe.
  // noLosLock: if it can't draw a line of fire on a nearby pod for this many
  // seconds, it skips the wait and goes straight to the rocket lock.
  ROCKET: { speed: 2.4, turnRate: 2.2, aimSecs: 3, cookSecs: 3, lockRange: 13,
            firstDelayMin: 1.5, firstDelayMax: 5, cd: 15, groundSpeedMult: 0.5,
            noLosLock: 4,
            blastRadius: 2, dmgRadius: 4, maxDmg: 75, lifetime: 30 },

  // --- EMP burst: salvaged from a slain automaton's head. Hold Q to open the
  // bay doors and charge (chargeSecs); release at full charge to detonate a
  // pulse that vaporizes ALL blocks (boulders included) within radius tiles
  // and deals heatSecs' worth of microwave damage to anything alive.
  // Three stored charges (HUD pips); each refills in rechargeSecs — halved
  // for good after the second automaton kill.
  EMP: { chargeSecs: 2, radius: 4, heatSecs: 10, charges: 3, rechargeSecs: 20 },

  // --- Cave-ins from ~-6,000 ft: visibly cracked tiles that crumble ~1 s
  // after the pod passes beneath them, dropping a damaging rock. Localized,
  // telegraphed, dodgeable — drilling a cracked tile removes it safely.
  CAVEIN: { min: 6000, fuse: 1.0, dmg: 12, chancePerRow: 0.3 },

  // --- Upgrades (Autobuy 2000). Price ladder 750/2k/5k/20k/100k/500k. ---
  // Buying a fuel tank fills it; buying a hull fully repairs.
  UPGRADES: {
    drill: {
      label: 'Drill', unit: 'ft/s', desc: 'Digs faster through hardening soil.',
      tiers: [
        { name: 'Stock Drill',     price: 0,      stat: 1.0,  disp: '25' },
        { name: 'Silvide Drill',   price: 750,    stat: 1.25, disp: '28' },
        { name: 'Goldium Drill',   price: 2000,   stat: 1.8,  disp: '40' },
        { name: 'Emerald Drill',   price: 5000,   stat: 2.2,  disp: '50' },
        { name: 'Ruby Drill',      price: 20000,  stat: 3.1,  disp: '70' },
        { name: 'Diamond Drill',   price: 100000, stat: 4.2,  disp: '95' },
        { name: 'Amazonite Drill', price: 500000, stat: 5.3,  disp: '120' },
      ],
    },
    hull: {
      label: 'Hull', unit: 'HP', desc: 'Maximum hull points. Buying repairs fully.',
      tiers: [
        { name: 'Stock Hull',           price: 0,      stat: 10 },
        { name: 'Ironium Hull',         price: 750,    stat: 17 },
        { name: 'Bronzium Hull',        price: 2000,   stat: 30 },
        { name: 'Steel Hull',           price: 5000,   stat: 50 },
        { name: 'Platinium Hull',       price: 20000,  stat: 80 },
        { name: 'Einsteinium Hull',     price: 100000, stat: 120 },
        { name: 'Energy-Shielded Hull', price: 500000, stat: 180 },
      ],
    },
    engine: {
      label: 'Engine', unit: 'hp', desc: 'Stronger lift — fly faster, haul heavier loads.',
      tiers: [
        { name: 'Stock Engine',            price: 0,      stat: 1.0,  disp: '150' },
        { name: 'V4 1600cc',               price: 750,    stat: 1.07, disp: '160' },
        { name: 'V4 2.0 Ltr Turbo',        price: 2000,   stat: 1.14, disp: '170' },
        { name: 'V6 3.8 Ltr',              price: 5000,   stat: 1.21, disp: '180' },
        { name: 'V8 Supercharged 5.0 Ltr', price: 20000,  stat: 1.28, disp: '190' },
        { name: 'V12 6.0 Ltr',             price: 100000, stat: 1.35, disp: '200' },
        { name: 'V16 Jag Engine',          price: 500000, stat: 1.42, disp: '210' },
      ],
    },
    fuelTank: {
      label: 'Fuel Tank', unit: 'L', desc: 'Carry more fuel. Comes fully fueled.',
      tiers: [
        { name: 'Micro Tank',              price: 0,      stat: 10 },
        { name: 'Medium Tank',             price: 750,    stat: 15 },
        { name: 'Huge Tank',               price: 2000,   stat: 25 },
        { name: 'Gigantic Tank',           price: 5000,   stat: 40 },
        { name: 'Titanic Tank',            price: 20000,  stat: 60 },
        { name: 'Leviathan Tank',          price: 100000, stat: 100 },
        { name: 'Liquid Compression Tank', price: 500000, stat: 150 },
      ],
    },
    radiator: {
      label: 'Radiator', unit: '%', desc: 'Reduces lava & gas damage.',
      tiers: [
        { name: 'Stock Fan',               price: 0,      stat: 0 },
        { name: 'Dual Fans',               price: 2000,   stat: 0.10 },
        { name: 'Single Turbine',          price: 5000,   stat: 0.25 },
        { name: 'Dual Turbines',           price: 20000,  stat: 0.40 },
        { name: 'Puron Cooling',           price: 100000, stat: 0.60 },
        { name: 'Tri-Turbine Freon Array', price: 500000, stat: 0.80 },
      ],
    },
    cargo: {
      label: 'Cargo Bay', unit: 'units', desc: 'Haul more minerals per trip.',
      tiers: [
        { name: 'Micro Bay',     price: 0,      stat: 7 },
        { name: 'Medium Bay',    price: 750,    stat: 15 },
        { name: 'Huge Bay',      price: 2000,   stat: 25 },
        { name: 'Gigantic Bay',  price: 5000,   stat: 40 },
        { name: 'Titanic Bay',   price: 20000,  stat: 70 },
        { name: 'Leviathan Bay', price: 100000, stat: 120 },
      ],
    },
  },

  // --- Items (Emendation Station 3500). Explosives/teleporters require standing on ground. ---
  ITEMS: {
    fuelTank:   { name: 'Reserve Fuel Tank',    price: 2000,  desc: '+25 L fuel instantly', key: 'F' },
    nanobots:   { name: 'Hull Repair Nanobots', price: 7500,  desc: '+30 hull instantly', key: 'R' },
    dynamite:   { name: 'Dynamite',             price: 2000,  desc: 'Clears 3x3 around the pod', key: 'X' },
    plastic:    { name: 'Plastic Explosive',    price: 5000,  desc: 'Clears 5x5 around the pod', key: 'C' },
    teleporter: { name: 'Quantum Teleporter',   price: 2000,  desc: 'Teleport to the surface (rough landing possible)', key: 'T' },
    transmitter:{ name: 'Matter Transmitter',   price: 10000, desc: 'Safe teleport to beside the Fuel Station', key: 'M' },
  },
  REPAIR_COST_PER_HP: 15,       // Emendation Station hull repair

  // --- Surface buildings (x in tiles, left to right; spawn next to fuel station) ---
  BUILDINGS: {
    fuel:      { x: 2,  w: 4, name: 'Propellent Vendor 12000' },
    processor: { x: 9,  w: 4, name: 'Mineral Processor 3000' },
    save:      { x: 15, w: 2, name: 'Quantum Particle State Analyzer 6000', hover: true },
    upgrades:  { x: 19, w: 4, name: 'Autobuy 2000' },
    items:     { x: 26, w: 4, name: 'Emendation Station 3500' },
  },

  // --- Story: transmissions by depth (ft). Bonuses are one-time cash wires. ---
  TRANSMISSIONS: [
    { depth: 500,  bonus: 1000 },
    { depth: 1000, bonus: 3000 },
    { depth: 1750 },
    { depth: 2100 },
    { depth: 2500 },
    { depth: 3000 },   // Microwave Cannon unlock
    { depth: 3100 },
    { depth: 3500, bonus: 25000 },
    { depth: 4100 },
    { depth: 4500 },
    { depth: 10600 },
    { depth: 10800 },
    { depth: 10900 },  // entering Hell
  ],
  ALTIMETER_FAIL: 10000,         // below this the altimeter reads garbage
  HELL_ALTIMETER: -66666,        // displayed inside Hell

  // --- Boss (two forms; explosives hit hard, the Microwave Cannon sears
  // him steadily — mwDps scales with worm-meat power level) ---
  BOSS: {
    form1HP: 1000,
    form2HP: 2000,
    mwDps: 35,
    dynamiteDmg: 120,            // direct hit; glancing = 60
    plasticDmg: 240,
    glancingDmg: 60,
    laserDmg: 14,
    caneDmg: 18,
    clawDmg: 20,
    fireballDmg: 10,             // per touch tick
    touchDmg: 12,
    victoryCash: 28500000,
  },

  // Self-damage when your own explosive goes off under the pod
  EXPLOSION_SELF: { dynamite: 15, plastic: 30 },

  SAVE_KEY: 'motherload-remake-save',
};

// Depth helpers
C.feetToRow = ft => Math.floor(ft / C.FEET_PER_TILE);
C.rowToFeet = row => row * C.FEET_PER_TILE;
