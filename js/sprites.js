// Procedural art: every sprite and texture is drawn in code at load time.
// Modernized look: gradients, bevels, glow, per-depth soil palettes.

const Sprites = {
  BANDS: 8,                  // soil palettes from surface to Hell
  VARIANTS: 6,
  dirt: [],                  // [band][variant] -> canvas
  stone: [],                 // [band] -> canvas
  cave: [],                  // [band] -> dark tunnel-interior texture
  dirtPattern: [],           // [band] -> CanvasPattern for organic wall lips
  lavaBase: null,
  minerals: {},              // key -> [band] -> canvas
  artifacts: {},

  // Soil palette by band: Mars ochre -> deep red -> scorched dark
  soil(band) {
    const stops = [
      ['#a86a3e', '#8a5330'], ['#a05f38', '#7f4a2c'], ['#96522f', '#733f26'],
      ['#8a4527', '#66351f'], ['#7c3a20', '#57291a'], ['#6b2f1c', '#471f16'],
      ['#572317', '#361511'], ['#40170f', '#230b09'],
    ];
    return stops[Math.min(band, stops.length - 1)];
  },

  bandForRow(row) {
    const t = Math.max(0, Math.min(1, C.rowToFeet(row) / C.DEPTH_MAX));
    return Math.min(this.BANDS - 1, Math.floor(t * this.BANDS));
  },

  makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  },

  // Small deterministic rng for texture speckles
  rand: (function () { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(),

  init() {
    const S = C.TEX;
    const pctx = this.makeCanvas(4).getContext('2d');
    for (let b = 0; b < this.BANDS; b++) {
      this.dirt[b] = [];
      for (let v = 0; v < this.VARIANTS; v++) this.dirt[b].push(this.makeDirt(b, S));
      this.stone[b] = this.makeStone(b, S);
      this.cave[b] = this.makeCave(b, S);
      this.dirtPattern[b] = pctx.createPattern(this.dirt[b][0], 'repeat');
    }
    this.lavaBase = this.makeLava(S);
    this.steamBase = this.makeSteam(S);
    this.magnetiteTex = [];
    this.sandTex = [];
    this.nukeTex = [];
    this.gasTex = [];
    this.crackedTex = [];
    for (let b = 0; b < this.BANDS; b++) {
      this.magnetiteTex.push(this.makeMagnetite(b, S));
      this.sandTex.push(this.makeSand(b, S));
      this.nukeTex.push(this.makeNuke(b, S));
      this.gasTex.push(this.makeGas(b, S));
      this.crackedTex.push(this.makeCracked(b, S));
    }
    this.iceTex = this.makeIce(S);
    // Frozen variants of every dirt texture for the permafrost bands
    this.frozenDirt = [];
    for (let b = 0; b < this.BANDS; b++) {
      this.frozenDirt.push(this.dirt[b].map(d => this.makeFrozenDirt(d, S)));
    }
    this.serverWallTex = this.makeServerWall(S);
    this.serverRackTex = this.makeServerRack(S);
    this.serverDoorTex = this.makeServerDoor(S);
    for (const key of Object.keys(C.MINERALS)) {
      this.minerals[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.minerals[key].push(this.makeMineral(key, b, S));
    }
    for (const key of Object.keys(C.ARTIFACTS)) {
      this.artifacts[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.artifacts[key].push(this.makeArtifact(key, b, S));
    }

    // Permafrost variants: rebuild every soil-backed tile with frozen ground
    // behind it, by temporarily swapping the dirt/soil sources the generators
    // draw from. The ores themselves keep their color — only the soil chills.
    const realDirt = this.dirt, realSoil = this.soil;
    this.dirt = this.frozenDirt;
    this.soil = () => ['#8ba3b8', '#54687c'];
    this.frozenStone = [];
    this.frozenGasTex = [];
    this.frozenCrackedTex = [];
    this.frozenMagnetiteTex = [];
    this.frozenNukeTex = [];
    for (let b = 0; b < this.BANDS; b++) {
      this.frozenStone.push(this.makeStone(b, S));
      this.frozenGasTex.push(this.makeGas(b, S));
      this.frozenCrackedTex.push(this.makeCracked(b, S));
      this.frozenMagnetiteTex.push(this.makeMagnetite(b, S));
      this.frozenNukeTex.push(this.makeNuke(b, S));
    }
    this.frozenMinerals = {};
    for (const key of Object.keys(C.MINERALS)) {
      this.frozenMinerals[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.frozenMinerals[key].push(this.makeMineral(key, b, S));
    }
    this.frozenArtifacts = {};
    for (const key of Object.keys(C.ARTIFACTS)) {
      this.frozenArtifacts[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.frozenArtifacts[key].push(this.makeArtifact(key, b, S));
    }
    this.dirt = realDirt;
    this.soil = realSoil;
  },

  makeDirt(band, S) {
    // Deliberately seamless: flat base, no per-tile gradient and no edge bevel,
    // so adjacent tiles merge into one continuous soil mass with no grid lines.
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const [top, bot] = this.soil(band);
    ctx.fillStyle = this.mix(top, bot, 0.5);
    ctx.fillRect(0, 0, S, S);
    // Very faint in-tile blotches (large-scale variation is painted in world space
    // by Game.drawSoilClouds so it can cross tile boundaries)
    for (let i = 0; i < 5; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = S * (0.2 + this.rand() * 0.4);
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, this.rand() < 0.55 ? 'rgba(30,10,5,0.05)' : 'rgba(255,225,190,0.03)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    // Speckled grain — drawn at all 9 wrap positions so the texture tiles
    // seamlessly and no speckle gets clipped at a tile boundary
    const wrap = draw => {
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) draw(dx, dy);
    };
    for (let i = 0; i < 110; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 0.8 + this.rand() * 3.2;
      const col = this.rand() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)';
      wrap((dx, dy) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
      });
    }
    // Small pebbles, also wrapped
    for (let i = 0; i < 7; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 2 + this.rand() * 4, rot = this.rand() * 3;
      wrap((dx, dy) => {
        ctx.fillStyle = 'rgba(60,35,25,0.45)';
        ctx.beginPath(); ctx.ellipse(x + dx, y + dy, r, r * 0.75, rot, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.ellipse(x + dx - r * 0.25, y + dy - r * 0.25, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    return c;
  },

  // Dark tunnel interior: rough shadowed dirt, not a flat color
  makeCave(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const bot = this.soil(band)[1];
    ctx.fillStyle = this.shade(bot, -0.74);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 50; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 1 + this.rand() * 3;
      ctx.fillStyle = this.rand() < 0.6 ? 'rgba(0,0,0,0.25)' : 'rgba(255,220,190,0.035)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Faint half-buried rocks catching what little light there is
    for (let i = 0; i < 4; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 4 + this.rand() * 8;
      ctx.fillStyle = 'rgba(160,120,95,0.07)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, this.rand() * 3, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },

  mix(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return `rgb(${r},${g},${bl})`;
  },

  makeStone(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const soil = this.soil(band);
    ctx.fillStyle = this.mix(soil[0], soil[1], 0.5);
    ctx.fillRect(0, 0, S, S);
    // Shadow pocket behind the boulder
    let g = ctx.createRadialGradient(S / 2, S * 0.58, S * 0.1, S / 2, S * 0.58, S * 0.5);
    g.addColorStop(0, 'rgba(15,8,4,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // Irregular boulder silhouette (12 jittered radii)
    const pts = [];
    const npts = 12;
    for (let j = 0; j < npts; j++) {
      const a = (j / npts) * Math.PI * 2;
      const rr = S * (0.33 + this.rand() * 0.12);
      pts.push([S / 2 + Math.cos(a) * rr, S * 0.52 + Math.sin(a) * rr * 0.92]);
    }
    const tracePoly = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < npts; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath();
    };
    g = ctx.createRadialGradient(S * 0.38, S * 0.34, S * 0.06, S * 0.5, S * 0.52, S * 0.55);
    g.addColorStop(0, '#a8aeb6');
    g.addColorStop(0.45, '#7c828a');
    g.addColorStop(0.8, '#565b62');
    g.addColorStop(1, '#33373d');
    ctx.fillStyle = g;
    tracePoly();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,26,0.6)';
    ctx.lineWidth = Math.max(1.5, S * 0.015);
    tracePoly();
    ctx.stroke();

    // Lower-right facet in shadow
    ctx.save();
    tracePoly();
    ctx.clip();
    ctx.fillStyle = 'rgba(20,22,28,0.3)';
    ctx.beginPath();
    ctx.ellipse(S * 0.62, S * 0.66, S * 0.4, S * 0.32, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Mineral streaks
    ctx.strokeStyle = 'rgba(150,110,80,0.35)';
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.beginPath(); ctx.moveTo(S * 0.25, S * 0.42); ctx.quadraticCurveTo(S * 0.5, S * 0.5, S * 0.72, S * 0.44); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,125,135,0.4)';
    ctx.beginPath(); ctx.moveTo(S * 0.3, S * 0.62); ctx.quadraticCurveTo(S * 0.55, S * 0.68, S * 0.7, S * 0.6); ctx.stroke();
    // Cracks
    ctx.strokeStyle = 'rgba(25,27,32,0.6)';
    ctx.lineWidth = Math.max(1, S * 0.014);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = S * (0.3 + this.rand() * 0.4), y = S * (0.3 + this.rand() * 0.45);
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (this.rand() - 0.5) * S * 0.28; y += (this.rand() - 0.5) * S * 0.28; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // Speckled grain on the rock face
    for (let i = 0; i < 30; i++) {
      const x = S * (0.15 + this.rand() * 0.7), y = S * (0.15 + this.rand() * 0.75);
      ctx.fillStyle = this.rand() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)';
      ctx.beginPath(); ctx.arc(x, y, 0.6 + this.rand() * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.ellipse(S * 0.36, S * 0.3, S * 0.15, S * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();

    // Small stones settled around the base
    for (let i = 0; i < 4; i++) {
      const x = S * (0.12 + this.rand() * 0.76), y = S * (0.82 + this.rand() * 0.12);
      const r = S * (0.03 + this.rand() * 0.04);
      g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#8b9097'); g.addColorStop(1, '#41454c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r, this.rand(), 0, Math.PI * 2); ctx.fill();
    }

    // Soil creeping over the boulder's edges
    for (let i = 0; i < 5; i++) {
      const a = this.rand() * Math.PI * 2;
      const px = S * 0.5 + Math.cos(a) * S * 0.42;
      const py = S * 0.52 + Math.sin(a) * S * 0.4;
      const r = S * (0.05 + this.rand() * 0.06);
      ctx.fillStyle = this.alpha(this.mixToHex(soil[0], soil[1], 0.5), 0.8);
      ctx.beginPath(); ctx.ellipse(px, py, r * 1.5, r, a, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },

  makeSteam(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    // Boiling groundwater pocket: deep teal pool with bubbles and rising steam
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#1e5a6e'); g.addColorStop(0.5, '#2e88a0'); g.addColorStop(1, '#174a5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Churning surface swirls
    ctx.strokeStyle = 'rgba(200,240,250,0.4)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = S * (0.2 + i * 0.2);
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(S * 0.25, y - S * 0.06, S * 0.5, y);
      ctx.quadraticCurveTo(S * 0.75, y + S * 0.06, S, y);
      ctx.stroke();
    }
    // Bubbles
    for (let i = 0; i < 14; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 1.5 + this.rand() * 4;
      ctx.strokeStyle = 'rgba(230,250,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    // Steam wisps at the top
    ctx.fillStyle = 'rgba(235,250,255,0.2)';
    for (let i = 0; i < 3; i++) {
      const x = S * (0.15 + i * 0.32);
      ctx.beginPath();
      ctx.ellipse(x, S * 0.12, S * 0.1, S * 0.06, this.rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  },

  makeLava(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#8a1e00'); g.addColorStop(0.5, '#c73a05'); g.addColorStop(1, '#7a1500');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Bright molten veins
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,170,40,0.9)' : 'rgba(255,220,90,0.8)';
      ctx.lineWidth = 3 + this.rand() * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let x = this.rand() * S, y = 0;
      ctx.moveTo(x, y);
      while (y < S) { x += (this.rand() - 0.5) * S * 0.4; y += S * (0.2 + this.rand() * 0.2); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    return c;
  },

  makeMineral(key, band, S) {
    const m = C.MINERALS[key];
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][0], 0, 0);

    // Recessed pocket so the deposit sits IN the soil, not on it
    let g = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.44);
    g.addColorStop(0, 'rgba(18,7,3,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    const metallic = ['ironium', 'bronzium', 'silverium', 'goldium', 'platinium'].includes(key);

    if (metallic) {
      // Vein of irregular metallic nuggets
      const n = 6 + Math.floor(this.rand() * 3);
      for (let i = 0; i < n; i++) {
        const cx = S * (0.28 + this.rand() * 0.44), cy = S * (0.3 + this.rand() * 0.4);
        const r = S * (0.06 + this.rand() * 0.085);
        const rot = this.rand() * Math.PI;
        ctx.beginPath();
        const pts = 7;
        for (let j = 0; j <= pts; j++) {
          const a = rot + (j / pts) * Math.PI * 2;
          const rr = r * (0.65 + this.rand() * 0.55);
          const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r * 1.3);
        g.addColorStop(0, '#fff6e8');
        g.addColorStop(0.3, this.shade(m.color, 0.15));
        g.addColorStop(0.75, m.color);
        g.addColorStop(1, this.shade(m.color, -0.55));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = Math.max(1, S * 0.012);
        ctx.stroke();
        // Glint
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.3, cy - r * 0.35, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Cluster of elongated crystal shards radiating from a core
      const n = 5 + Math.floor(this.rand() * 3);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + this.rand() * 0.8 - Math.PI / 2;
        const bx = S * 0.5 + Math.cos(ang) * S * 0.04;
        const by = S * 0.52 + Math.sin(ang) * S * 0.04;
        const len = S * (0.15 + this.rand() * 0.17);
        const wid = S * (0.05 + this.rand() * 0.05);
        const tx = bx + Math.cos(ang) * len, ty = by + Math.sin(ang) * len;
        const px = -Math.sin(ang) * wid, py = Math.cos(ang) * wid;
        // Shard body
        ctx.beginPath();
        ctx.moveTo(bx + px, by + py);
        ctx.lineTo(tx + px * 0.25, ty + py * 0.25);
        ctx.lineTo(tx - px * 0.25, ty - py * 0.25);
        ctx.lineTo(bx - px, by - py);
        ctx.closePath();
        g = ctx.createLinearGradient(bx, by, tx, ty);
        g.addColorStop(0, this.shade(m.color, -0.5));
        g.addColorStop(0.55, m.color);
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(1, S * 0.01);
        ctx.stroke();
        // Central facet ridge
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = Math.max(1, S * 0.012);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
        // Shadowed lower edge
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(bx - px, by - py);
        ctx.lineTo(tx - px * 0.25, ty - py * 0.25);
        ctx.stroke();
      }
      // Glowing core the shards grow from
      g = ctx.createRadialGradient(S * 0.5, S * 0.52, S * 0.01, S * 0.5, S * 0.52, S * 0.12);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, this.shade(m.color, 0.2));
      g.addColorStop(1, this.shade(m.color, -0.4));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(S * 0.5, S * 0.52, S * 0.09, 0, Math.PI * 2); ctx.fill();
    }

    // Sparkle stars
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, S * 0.01);
    for (let i = 0; i < 3; i++) {
      const px = S * (0.3 + this.rand() * 0.4), py = S * (0.28 + this.rand() * 0.4);
      const sr = S * (0.02 + this.rand() * 0.02);
      ctx.beginPath();
      ctx.moveTo(px - sr, py); ctx.lineTo(px + sr, py);
      ctx.moveTo(px, py - sr); ctx.lineTo(px, py + sr);
      ctx.stroke();
    }

    // Dirt occlusion: soil creeping over the deposit's rim so it reads as embedded
    const soilCol = this.soil(band);
    for (let i = 0; i < 6; i++) {
      const a = this.rand() * Math.PI * 2;
      const px = S * 0.5 + Math.cos(a) * S * 0.38;
      const py = S * 0.5 + Math.sin(a) * S * 0.38;
      const r = S * (0.06 + this.rand() * 0.07);
      ctx.fillStyle = this.alpha(this.mixToHex(soilCol[0], soilCol[1], 0.5), 0.85);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.4, r, a, 0, Math.PI * 2);
      ctx.fill();
    }

    // Value glow for precious ones
    if (m.value >= 5000) {
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.55);
      g2.addColorStop(0, this.alpha(m.color, 0.35));
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
    }
    return c;
  },

  // mix() returns an rgb() string; this variant returns a hex for alpha()
  // Gas pocket: no longer disguised as dirt — sickly green-stained soil with
  // vapor bubbles seeping out, clearly visible and avoidable
  makeGas(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][4], 0, 0);
    // Mottled toxic staining soaked through the soil
    for (let i = 0; i < 7; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = S * (0.14 + this.rand() * 0.24);
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(110,205,80,${0.22 + this.rand() * 0.14})`);
      g.addColorStop(1, 'rgba(80,160,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    // Cracks venting vapor
    ctx.strokeStyle = 'rgba(150,235,110,0.5)';
    ctx.lineWidth = Math.max(1.5, S * 0.02);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = S * (0.2 + this.rand() * 0.6), y = S * (0.25 + this.rand() * 0.5);
      ctx.beginPath();
      ctx.moveTo(x - S * 0.07, y + S * 0.06);
      ctx.lineTo(x, y - S * 0.04);
      ctx.lineTo(x + S * 0.06, y + S * 0.03);
      ctx.stroke();
    }
    // Rising bubbles
    for (let i = 0; i < 8; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 1.5 + this.rand() * 3.5;
      ctx.strokeStyle = `rgba(170,245,130,${0.3 + this.rand() * 0.3})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Soft center glow so it reads even in deep darkness
    const gl = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.55);
    gl.addColorStop(0, 'rgba(140,230,100,0.14)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, S, S);
    return c;
  },

  // Glacial ice block: pale blue depth-lit ice with internal fractures,
  // trapped bubbles, and a frosted sparkle
  makeIce(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#cfeefc');
    g.addColorStop(0.45, '#8fd0ee');
    g.addColorStop(1, '#4e94c4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Deep internal glow
    const dg = ctx.createRadialGradient(S * 0.4, S * 0.6, S * 0.05, S * 0.5, S * 0.5, S * 0.7);
    dg.addColorStop(0, 'rgba(220,245,255,0.35)');
    dg.addColorStop(1, 'rgba(40,90,140,0.25)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, S, S);
    // Internal fracture planes
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(1, S * 0.018);
    for (let i = 0; i < 4; i++) {
      const x0 = this.rand() * S, y0 = this.rand() * S;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (this.rand() - 0.3) * S * 0.5, y0 + (this.rand() - 0.3) * S * 0.5);
      ctx.lineTo(x0 + (this.rand() - 0.2) * S * 0.7, y0 + (this.rand() - 0.5) * S * 0.6);
      ctx.stroke();
    }
    // Trapped air bubbles
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(235,250,255,${0.25 + this.rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(this.rand() * S, this.rand() * S, 1 + this.rand() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Frosted bevel edges
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(2, S * 0.04);
    ctx.strokeRect(S * 0.02, S * 0.02, S * 0.96, S * 0.96);
    // Sparkle glints
    for (let i = 0; i < 4; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = S * (0.02 + this.rand() * 0.02);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, S * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      ctx.stroke();
    }
    return c;
  },

  // Permafrost soil: the regular dirt drained of warmth — desaturated and
  // blue-shifted, with frost patches, thin ice veins and sparkle glints
  makeFrozenDirt(src, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    // Drain the warm browns out of the base soil
    try { ctx.filter = 'saturate(0.35) brightness(1.06)'; } catch (e) {}
    ctx.drawImage(src, 0, 0);
    try { ctx.filter = 'none'; } catch (e) {}
    // Cold blue wash
    ctx.fillStyle = 'rgba(130,180,230,0.30)';
    ctx.fillRect(0, 0, S, S);
    // Soft frost patches blooming through the soil
    for (let i = 0; i < 5; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = S * (0.08 + this.rand() * 0.14);
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(225,242,255,${0.22 + this.rand() * 0.15})`);
      g.addColorStop(1, 'rgba(225,242,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Thin ice veins threading the ground
    ctx.strokeStyle = 'rgba(210,238,255,0.4)';
    ctx.lineWidth = Math.max(1, S * 0.014);
    for (let i = 0; i < 3; i++) {
      let x = this.rand() * S, y = this.rand() * S;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        x += (this.rand() - 0.5) * S * 0.5;
        y += (this.rand() - 0.5) * S * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Ice-crystal sparkles
    for (let i = 0; i < 5; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = S * (0.015 + this.rand() * 0.02);
      ctx.strokeStyle = `rgba(240,250,255,${0.5 + this.rand() * 0.4})`;
      ctx.lineWidth = Math.max(1, S * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      ctx.stroke();
    }
    return c;
  },

  // Server-vault casing: brushed gunmetal plate, riveted, rimed with frost
  makeServerWall(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#7e8898');
    g.addColorStop(0.5, '#5c6472');
    g.addColorStop(1, '#434a56');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Brushed-metal grain
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = this.rand() * S;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (this.rand() - 0.5) * 4); ctx.stroke();
    }
    // Panel border + cross seam
    ctx.strokeStyle = 'rgba(18,22,28,0.55)';
    ctx.lineWidth = Math.max(2, S * 0.045);
    ctx.strokeRect(S * 0.03, S * 0.03, S * 0.94, S * 0.94);
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.05); ctx.lineTo(S * 0.5, S * 0.95); ctx.stroke();
    // Corner rivets
    ctx.fillStyle = '#aeb8c6';
    for (const [rx, ry] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
      ctx.beginPath(); ctx.arc(S * rx, S * ry, S * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    // Frost creeping in from the edges — the permafrost doing its job
    ctx.fillStyle = 'rgba(200,235,255,0.18)';
    for (let i = 0; i < 6; i++) {
      const x = this.rand() * S, y = this.rand() < 0.5 ? this.rand() * S * 0.15 : S * (0.85 + this.rand() * 0.15);
      ctx.beginPath(); ctx.arc(x, y, S * (0.04 + this.rand() * 0.06), 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },

  // Server rack: dark cabinet, rows of blade slots, LED clusters (the live
  // blinking is overlaid at draw time in drawTiles)
  makeServerRack(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b313c';
    ctx.fillRect(0, 0, S, S);
    // Cabinet frame
    ctx.strokeStyle = '#5c6472';
    ctx.lineWidth = Math.max(2, S * 0.05);
    ctx.strokeRect(S * 0.06, S * 0.02, S * 0.88, S * 0.96);
    // Blade rows
    for (let r = 0; r < 6; r++) {
      const y = S * (0.08 + r * 0.15);
      const g = ctx.createLinearGradient(0, y, 0, y + S * 0.11);
      g.addColorStop(0, '#48505e');
      g.addColorStop(1, '#333944');
      ctx.fillStyle = g;
      ctx.fillRect(S * 0.12, y, S * 0.76, S * 0.11);
      // Handle bar highlight
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(S * 0.12, y, S * 0.76, S * 0.02);
      // Vent slits
      ctx.fillStyle = 'rgba(10,13,18,0.55)';
      for (let v = 0; v < 5; v++) ctx.fillRect(S * (0.16 + v * 0.1), y + S * 0.03, S * 0.05, S * 0.05);
      // Dark LED sockets (the live alternating lights glow at draw time)
      ctx.fillStyle = '#12151a';
      ctx.beginPath(); ctx.arc(S * 0.84, y + S * 0.055, S * 0.022, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },

  // Sealed security door: heavy slab, hazard chevrons, a watchful red lamp
  makeServerDoor(S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, S, 0);
    g.addColorStop(0, '#4a515e');
    g.addColorStop(0.5, '#666f7e');
    g.addColorStop(1, '#3a404b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // Recessed frame
    ctx.strokeStyle = 'rgba(12,14,18,0.9)';
    ctx.lineWidth = Math.max(2, S * 0.05);
    ctx.strokeRect(S * 0.05, S * 0.05, S * 0.9, S * 0.9);
    // Hazard chevrons across the middle
    ctx.save();
    ctx.beginPath(); ctx.rect(S * 0.08, S * 0.38, S * 0.84, S * 0.24); ctx.clip();
    for (let i = -1; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#e8b53c' : '#22252b';
      ctx.beginPath();
      ctx.moveTo(S * (i * 0.18), S * 0.62);
      ctx.lineTo(S * (i * 0.18 + 0.18), S * 0.38);
      ctx.lineTo(S * (i * 0.18 + 0.3), S * 0.38);
      ctx.lineTo(S * (i * 0.18 + 0.12), S * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Center seam — it splits open when the alarm trips
    ctx.strokeStyle = 'rgba(10,12,16,0.85)';
    ctx.lineWidth = Math.max(1, S * 0.025);
    ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.07); ctx.lineTo(S * 0.5, S * 0.93); ctx.stroke();
    // Red status lamp, top center
    const lg = ctx.createRadialGradient(S * 0.5, S * 0.2, S * 0.01, S * 0.5, S * 0.2, S * 0.09);
    lg.addColorStop(0, '#ff6a58');
    lg.addColorStop(0.5, '#c22619');
    lg.addColorStop(1, 'rgba(120,20,12,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(S * 0.5, S * 0.2, S * 0.09, 0, Math.PI * 2); ctx.fill();
    return c;
  },

  // Cracked stratum: dirt shot through with a bold web of fissures — the
  // universal miner's sign for "do not linger underneath this"
  makeCracked(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][5], 0, 0);
    // Main fissure network radiating from a weak point
    const cx0 = S * (0.35 + this.rand() * 0.3), cy0 = S * (0.35 + this.rand() * 0.3);
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this.rand() * 0.8;
      let px = cx0, py = cy0;
      let ang = a;
      ctx.strokeStyle = 'rgba(12,6,4,0.75)';
      ctx.lineWidth = Math.max(2, S * 0.035);
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let s = 0; s < 4; s++) {
        ang += (this.rand() - 0.5) * 1.1;
        px += Math.cos(ang) * S * (0.1 + this.rand() * 0.12);
        py += Math.sin(ang) * S * (0.1 + this.rand() * 0.12);
        ctx.lineTo(px, py);
        ctx.lineWidth = Math.max(1, S * 0.035 * (1 - s * 0.22));
      }
      ctx.stroke();
      // Lighter stress edge alongside
      ctx.strokeStyle = 'rgba(255,225,190,0.14)';
      ctx.lineWidth = Math.max(1, S * 0.015);
      ctx.beginPath();
      ctx.moveTo(cx0 + 2, cy0 + 2);
      ctx.lineTo(px + 2, py + 2);
      ctx.stroke();
    }
    // Loose pebbles wedged in the cracks
    for (let i = 0; i < 5; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 1.5 + this.rand() * 2.5;
      ctx.fillStyle = 'rgba(30,16,10,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  },

  // Magnetite lodestone: a jagged near-black iron mass shot through with
  // glowing violet crystal veins — clearly not a normal rock
  makeMagnetite(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][2], 0, 0);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    // Angular iron chunk
    ctx.beginPath();
    const pts = 8;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const r = S * (0.3 + this.rand() * 0.1);
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.92;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const bg = ctx.createLinearGradient(-S * 0.3, -S * 0.3, S * 0.3, S * 0.3);
    bg.addColorStop(0, '#3a3f58');
    bg.addColorStop(0.5, '#20243a');
    bg.addColorStop(1, '#12141f');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Violet crystal veins branching from the center
    ctx.strokeStyle = '#b56cff';
    ctx.shadowColor = '#b56cff';
    ctx.shadowBlur = S * 0.08;
    ctx.lineWidth = S * 0.03;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * S * 0.05, Math.sin(a) * S * 0.05);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.5) * S * 0.14, Math.sin(a + 0.5) * S * 0.14,
        Math.cos(a) * S * 0.26, Math.sin(a) * S * 0.24);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // Bright core
    const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, S * 0.14);
    cg.addColorStop(0, 'rgba(230,190,255,0.95)');
    cg.addColorStop(1, 'rgba(181,108,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(-S * 0.15, -S * 0.15, S * 0.3, S * 0.3);
    ctx.restore();
    return c;
  },

  // Pyramid sandstone: pale carved blocks with mortar seams and worn glyphs —
  // unmistakably man-made against the Martian soil
  makeSand(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    const base = this.mixToHex('#d2a95e', this.soil(band)[0], 0.18);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    // Grain speckle
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = this.rand() < 0.5 ? 'rgba(90,60,25,0.12)' : 'rgba(255,240,200,0.1)';
      ctx.fillRect(this.rand() * S, this.rand() * S, 2, 2);
    }
    // Two block courses with offset mortar seams
    ctx.strokeStyle = 'rgba(70,45,18,0.55)';
    ctx.lineWidth = Math.max(2, S * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, S * 0.5); ctx.lineTo(S, S * 0.5);
    ctx.moveTo(S * 0.55, 0); ctx.lineTo(S * 0.55, S * 0.5);
    ctx.moveTo(S * 0.22, S * 0.5); ctx.lineTo(S * 0.22, S);
    ctx.stroke();
    // Bevel highlights on the block tops
    ctx.fillStyle = 'rgba(255,235,190,0.18)';
    ctx.fillRect(0, 0, S, S * 0.05);
    ctx.fillRect(0, S * 0.5, S, S * 0.045);
    ctx.fillStyle = 'rgba(60,35,12,0.22)';
    ctx.fillRect(0, S * 0.45, S, S * 0.05);
    ctx.fillRect(0, S * 0.95, S, S * 0.05);
    // A worn glyph on some blocks
    if (this.rand() < 0.65) {
      ctx.strokeStyle = 'rgba(80,50,20,0.5)';
      ctx.lineWidth = S * 0.025;
      ctx.save();
      ctx.translate(S * (0.3 + this.rand() * 0.4), S * (0.55 + this.rand() * 0.25));
      const glyph = Math.floor(this.rand() * 3);
      ctx.beginPath();
      if (glyph === 0) {          // eye
        ctx.ellipse(0, 0, S * 0.1, S * 0.05, 0, 0, Math.PI * 2);
        ctx.moveTo(S * 0.03, 0); ctx.arc(0, 0, S * 0.03, 0, Math.PI * 2);
      } else if (glyph === 1) {   // zigzag water
        ctx.moveTo(-S * 0.1, 0);
        for (let i = 0; i < 4; i++) ctx.lineTo(-S * 0.1 + (i + 1) * S * 0.05, (i % 2 ? 0 : -S * 0.05));
      } else {                    // sun disc
        ctx.arc(0, 0, S * 0.06, 0, Math.PI * 2);
        ctx.moveTo(-S * 0.1, S * 0.08); ctx.lineTo(S * 0.1, S * 0.08);
      }
      ctx.stroke();
      ctx.restore();
    }
    return c;
  },

  // A dormant warhead half-buried in the dirt: olive casing, hazard stripes,
  // radiation trefoil. The armed glow is layered on at draw time.
  makeNuke(band, S) {
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][3], 0, 0);
    // Recessed pocket
    const pg = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.46);
    pg.addColorStop(0, 'rgba(10,6,3,0.5)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-0.5);
    // Casing
    const body = ctx.createLinearGradient(0, -S * 0.16, 0, S * 0.16);
    body.addColorStop(0, '#7a7d52');
    body.addColorStop(0.45, '#565a38');
    body.addColorStop(1, '#33351f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-S * 0.3, -S * 0.13);
    ctx.lineTo(S * 0.14, -S * 0.13);
    ctx.quadraticCurveTo(S * 0.34, 0, S * 0.14, S * 0.13);   // rounded nose cone
    ctx.lineTo(-S * 0.3, S * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Tail fins
    ctx.fillStyle = '#3c3f26';
    ctx.beginPath();
    ctx.moveTo(-S * 0.3, -S * 0.13); ctx.lineTo(-S * 0.38, -S * 0.2); ctx.lineTo(-S * 0.38, -S * 0.05); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-S * 0.3, S * 0.13); ctx.lineTo(-S * 0.38, S * 0.2); ctx.lineTo(-S * 0.38, S * 0.05); ctx.closePath(); ctx.fill();
    // Hazard stripes near the tail
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? '#1a1a14' : '#e8c53c';
      ctx.fillRect(-S * 0.28 + i * S * 0.045, -S * 0.13, S * 0.04, S * 0.26);
    }
    // Radiation trefoil on the casing
    ctx.fillStyle = '#e8c53c';
    ctx.beginPath(); ctx.arc(S * 0.0, 0, S * 0.085, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a14';
    for (let i = 0; i < 3; i++) {
      const a0 = i * (Math.PI * 2 / 3) - 0.42;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, S * 0.075, a0, a0 + 0.84);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, S * 0.018, 0, Math.PI * 2); ctx.fill();
    // Glint
    ctx.fillStyle = 'rgba(255,255,230,0.25)';
    ctx.fillRect(-S * 0.28, -S * 0.115, S * 0.5, S * 0.028);
    ctx.restore();
    return c;
  },

  mixToHex(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
  },

  makeArtifact(key, band, S) {
    const a = C.ARTIFACTS[key];
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][1], 0, 0);
    // Recessed pocket so the relic reads as half-buried
    const pg = ctx.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.42);
    pg.addColorStop(0, 'rgba(18,7,3,0.55)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = a.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    if (key === 'bones') {
      // Crossed bone shapes
      for (const rot of [-0.5, 0.6]) {
        ctx.save(); ctx.rotate(rot);
        ctx.fillRect(-S * 0.28, -S * 0.045, S * 0.56, S * 0.09);
        for (const e of [-S * 0.28, S * 0.28]) {
          ctx.beginPath(); ctx.arc(e, -S * 0.05, S * 0.06, 0, Math.PI * 2); ctx.arc(e, S * 0.05, S * 0.06, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    } else if (key === 'treasure') {
      // Chest
      ctx.fillStyle = '#7a4a22';
      ctx.fillRect(-S * 0.25, -S * 0.12, S * 0.5, S * 0.3);
      ctx.fillStyle = '#8f5a2a';
      ctx.beginPath(); ctx.ellipse(0, -S * 0.12, S * 0.25, S * 0.12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = a.color;
      ctx.fillRect(-S * 0.04, -S * 0.1, S * 0.08, S * 0.14);
      ctx.strokeStyle = '#3a2210'; ctx.strokeRect(-S * 0.25, -S * 0.12, S * 0.5, S * 0.3);
    } else if (key === 'relic') {
      // Golden pharaoh death mask with lapis stripes
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.moveTo(-S * 0.2, -S * 0.22);
      ctx.lineTo(S * 0.2, -S * 0.22);
      ctx.lineTo(S * 0.24, S * 0.1);
      ctx.quadraticCurveTo(S * 0.12, S * 0.26, 0, S * 0.26);
      ctx.quadraticCurveTo(-S * 0.12, S * 0.26, -S * 0.24, S * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Headdress stripes
      ctx.strokeStyle = '#2a4fb0';
      ctx.lineWidth = S * 0.03;
      for (const sx of [-0.19, -0.13, 0.13, 0.19]) {
        ctx.beginPath();
        ctx.moveTo(S * sx, -S * 0.2);
        ctx.lineTo(S * sx * 1.25, S * 0.08);
        ctx.stroke();
      }
      // Eyes & mouth
      ctx.fillStyle = '#1a1408';
      ctx.beginPath();
      ctx.ellipse(-S * 0.06, -S * 0.04, S * 0.045, S * 0.025, 0, 0, Math.PI * 2);
      ctx.ellipse(S * 0.06, -S * 0.04, S * 0.045, S * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-S * 0.04, S * 0.12, S * 0.08, S * 0.02);
      // Cobra on the brow
      ctx.strokeStyle = '#2a4fb0';
      ctx.beginPath();
      ctx.arc(0, -S * 0.17, S * 0.03, Math.PI * 0.5, Math.PI * 2.2);
      ctx.stroke();
    } else if (key === 'skeleton') {
      // Skull
      ctx.beginPath(); ctx.arc(0, -S * 0.06, S * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-S * 0.09, S * 0.04, S * 0.18, S * 0.12);
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-S * 0.07, -S * 0.08, S * 0.045, 0, Math.PI * 2); ctx.arc(S * 0.07, -S * 0.08, S * 0.045, 0, Math.PI * 2); ctx.fill();
    } else {
      // Ankh-like relic
      ctx.lineWidth = S * 0.07;
      ctx.strokeStyle = a.color;
      ctx.beginPath(); ctx.arc(0, -S * 0.12, S * 0.1, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -S * 0.02); ctx.lineTo(0, S * 0.24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-S * 0.14, S * 0.06); ctx.lineTo(S * 0.14, S * 0.06); ctx.stroke();
    }
    ctx.restore();
    // Faint mystery glow
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g2.addColorStop(0, this.alpha(a.color, 0.22));
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  },

  // --- Color helpers ---
  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * (1 + amt))));
    g = Math.max(0, Math.min(255, Math.round(g * (1 + amt))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 + amt))));
    return `rgb(${r},${g},${b})`;
  },
  alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  },

  // --- The mining pod (detailed) ---
  drawPod(ctx, px, py, t) {
    // px, py: screen pixels of pod center. t: {facing, drilling, thrust, time, teleporting}
    const T = C.TILE, P2 = Math.PI * 2;
    ctx.save();
    ctx.translate(px, py);
    if (t.teleporting > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.teleporting / 1.2));
      ctx.scale(1, 0.4 + 0.6 * ctx.globalAlpha);
    }
    if (t.facing < 0) ctx.scale(-1, 1);
    const bob = Math.sin(t.time * 6) * (t.thrust ? 1.5 : 0.6);
    ctx.translate(0, bob);

    // Soft ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, T * 0.45 - bob, T * 0.4, T * 0.07, 0, 0, P2); ctx.fill();

    // ---- Drill arm: mount, hydraulic piston, collar, fluted cone bit ----
    const spin = t.time * (t.drilling ? 46 : 6);
    ctx.save();
    if (t.drilling === 'down') { ctx.translate(0, T * 0.44); ctx.rotate(Math.PI / 2); }
    else ctx.translate(T * 0.4, T * 0.13);
    if (t.drilling) ctx.translate((Math.random() - 0.5) * T * 0.03, (Math.random() - 0.5) * T * 0.03);
    // Mount bracket
    ctx.fillStyle = '#31353c';
    this.rr(ctx, -T * 0.14, -T * 0.11, T * 0.16, T * 0.22, T * 0.03);
    ctx.fill();
    // Telescoping piston
    let g = ctx.createLinearGradient(0, -T * 0.055, 0, T * 0.055);
    g.addColorStop(0, '#8b9097'); g.addColorStop(0.5, '#d5d9de'); g.addColorStop(1, '#5c6066');
    ctx.fillStyle = g;
    ctx.fillRect(-T * 0.02, -T * 0.055, T * 0.12, T * 0.11);
    g = ctx.createLinearGradient(0, -T * 0.04, 0, T * 0.04);
    g.addColorStop(0, '#b4b9c0'); g.addColorStop(0.5, '#eef1f4'); g.addColorStop(1, '#767a80');
    ctx.fillStyle = g;
    ctx.fillRect(T * 0.08, -T * 0.04, T * 0.08, T * 0.08);
    // Collar with bolts
    ctx.fillStyle = '#3a3f46';
    this.rr(ctx, T * 0.14, -T * 0.1, T * 0.07, T * 0.2, T * 0.02);
    ctx.fill();
    ctx.fillStyle = '#15181c';
    for (const by of [-0.06, 0, 0.06]) { ctx.beginPath(); ctx.arc(T * 0.175, T * by, Math.max(1, T * 0.013), 0, P2); ctx.fill(); }
    // Cone bit
    const bx = T * 0.21, len = T * 0.34;
    g = ctx.createLinearGradient(0, -T * 0.14, 0, T * 0.14);
    g.addColorStop(0, '#dde1e7'); g.addColorStop(0.45, '#9ba0a8'); g.addColorStop(1, '#53575d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx, -T * 0.14);
    ctx.quadraticCurveTo(bx + len * 0.55, -T * 0.055, bx + len, 0);
    ctx.quadraticCurveTo(bx + len * 0.55, T * 0.055, bx, T * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Spinning helical flutes
    ctx.strokeStyle = 'rgba(35,38,44,0.85)';
    ctx.lineWidth = Math.max(1.5, T * 0.03);
    for (let i = -2; i < 8; i++) {
      const off = ((spin * 0.35 + i) % 6) - 3;
      ctx.beginPath();
      ctx.moveTo(bx, off * T * 0.09 - T * 0.05);
      ctx.quadraticCurveTo(bx + len * 0.5, off * T * 0.06, bx + len, off * T * 0.02 + T * 0.01);
      ctx.stroke();
    }
    // Specular streak along the top edge
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath();
    ctx.moveTo(bx + T * 0.02, -T * 0.1);
    ctx.quadraticCurveTo(bx + len * 0.5, -T * 0.045, bx + len * 0.95, -T * 0.005);
    ctx.stroke();
    ctx.restore();
    if (t.drilling) {
      ctx.fillStyle = 'rgba(255,220,150,0.8)';
      ctx.beginPath(); ctx.arc(bx + len, 0, T * 0.03 + Math.random() * T * 0.02, 0, P2); ctx.fill();
    }
    ctx.restore();

    // ---- Track assembly: suspension, band, treads, road wheels ----
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = Math.max(2, T * 0.045);
    for (const ax of [-0.24, 0, 0.24]) {
      ctx.beginPath(); ctx.moveTo(ax * T, T * 0.22); ctx.lineTo(ax * T * 0.85, T * 0.33); ctx.stroke();
    }
    const trackY = T * 0.3;
    ctx.fillStyle = '#23262b';
    this.rr(ctx, -T * 0.42, trackY - T * 0.035, T * 0.84, T * 0.17, T * 0.085);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    this.rr(ctx, -T * 0.42, trackY - T * 0.035, T * 0.84, T * 0.17, T * 0.085);
    ctx.stroke();
    // Tread notches — scroll with ground speed (phase advances only while grounded).
    // The bottom run of a track moves backward relative to the hull, and the
    // context may be mirrored, so both signs are folded into the offset.
    const spacing = T * 0.115;
    const phasePx = (t.treadPhase || 0) * T * (t.facing < 0 ? 1 : -1);
    const off = ((phasePx % spacing) + spacing) % spacing;
    ctx.fillStyle = '#0f1114';
    for (let i = -1; i < 8; i++) {
      const nx = -T * 0.38 + i * spacing + off;
      if (nx < -T * 0.4 || nx > T * 0.36) continue;
      this.rr(ctx, nx, trackY + T * 0.1, T * 0.05, T * 0.035, T * 0.012);
      ctx.fill();
    }
    // Road wheels with hubs — hub bolts rotate in step with the treads
    const wheelR = T * 0.058;
    const wheelAng = ((t.treadPhase || 0) * T / wheelR) * (t.facing < 0 ? -1 : 1);
    for (let i = -2; i <= 2; i++) {
      const wx = i * T * 0.16;
      g = ctx.createRadialGradient(wx - T * 0.015, trackY + T * 0.02, T * 0.005, wx, trackY + T * 0.035, T * 0.062);
      g.addColorStop(0, '#8b9097'); g.addColorStop(0.7, '#4a4f56'); g.addColorStop(1, '#26292e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(wx, trackY + T * 0.035, wheelR, 0, P2); ctx.fill();
      ctx.fillStyle = '#15181c';
      ctx.beginPath(); ctx.arc(wx, trackY + T * 0.035, T * 0.018, 0, P2); ctx.fill();
      // Spinning hub bolts
      ctx.fillStyle = '#767c84';
      for (const ba of [0, Math.PI]) {
        const bxw = wx + Math.cos(wheelAng + ba) * wheelR * 0.55;
        const byw = trackY + T * 0.035 + Math.sin(wheelAng + ba) * wheelR * 0.55;
        ctx.beginPath(); ctx.arc(bxw, byw, Math.max(1, T * 0.011), 0, P2); ctx.fill();
      }
    }

    // ---- Hull: layered panels, stripe, seams, rivets, scratches, mud ----
    g = ctx.createLinearGradient(0, -T * 0.36, 0, T * 0.3);
    g.addColorStop(0, '#f2b246');
    g.addColorStop(0.4, '#d68a25');
    g.addColorStop(0.85, '#9a5f16');
    g.addColorStop(1, '#7a4a10');
    ctx.fillStyle = g;
    this.rr(ctx, -T * 0.4, -T * 0.34, T * 0.8, T * 0.62, T * 0.13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,28,4,0.7)';
    ctx.lineWidth = Math.max(1.5, T * 0.03);
    this.rr(ctx, -T * 0.4, -T * 0.34, T * 0.8, T * 0.62, T * 0.13);
    ctx.stroke();
    // Accent stripe
    ctx.fillStyle = 'rgba(150,42,30,0.9)';
    this.rr(ctx, -T * 0.4, T * 0.03, T * 0.8, T * 0.085, T * 0.03);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    this.rr(ctx, -T * 0.4, T * 0.03, T * 0.8, T * 0.025, T * 0.01);
    ctx.fill();
    // Panel seams
    ctx.strokeStyle = 'rgba(90,55,10,0.5)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    ctx.beginPath(); ctx.moveTo(-T * 0.4, T * 0.15); ctx.lineTo(T * 0.4, T * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-T * 0.15, -T * 0.34); ctx.lineTo(-T * 0.15, T * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(T * 0.19, -T * 0.34); ctx.lineTo(T * 0.19, T * 0.02); ctx.stroke();
    // Rivets
    ctx.fillStyle = 'rgba(255,235,200,0.4)';
    for (const rx of [-0.34, -0.2, -0.06, 0.1, 0.24, 0.34]) {
      ctx.beginPath(); ctx.arc(rx * T, T * 0.18, Math.max(1, T * 0.014), 0, P2); ctx.fill();
      ctx.beginPath(); ctx.arc(rx * T, -T * 0.3, Math.max(1, T * 0.014), 0, P2); ctx.fill();
    }
    // Scratches
    ctx.strokeStyle = 'rgba(255,240,210,0.25)';
    ctx.lineWidth = Math.max(0.8, T * 0.01);
    ctx.beginPath(); ctx.moveTo(-T * 0.32, -T * 0.1); ctx.lineTo(-T * 0.2, -T * 0.14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(T * 0.05, -T * 0.02); ctx.lineTo(T * 0.2, -T * 0.06); ctx.stroke();
    // Mud splatter low on the hull
    ctx.fillStyle = 'rgba(70,45,25,0.5)';
    for (const [mx, my, mr] of [[-0.3, 0.22, 0.035], [-0.12, 0.25, 0.05], [0.2, 0.23, 0.03], [0.33, 0.25, 0.04]]) {
      ctx.beginPath(); ctx.ellipse(mx * T, my * T, mr * T * 1.4, mr * T, 0, 0, P2); ctx.fill();
    }

    // ---- EMP bay: twin doors on the front hull hiding the automaton head.
    // t.empDoors 0..1 slides them open; t.empCharge 0..1 lights the eyes. ----
    if (t.hasHead) {
      const bx = -T * 0.13, by = -T * 0.04, bw = T * 0.28, bh = T * 0.24;
      const open = t.empDoors || 0, charge = t.empCharge || 0;
      // Recessed cavity behind the doors
      if (open > 0.02) {
        ctx.fillStyle = '#14161a';
        this.rr(ctx, bx, by, bw, bh, T * 0.02);
        ctx.fill();
        // The trophy head, cradled in the dark
        const hx = bx + bw / 2, hy = by + bh * 0.52, hr = T * 0.085;
        ctx.fillStyle = '#454c58';
        this.rr(ctx, hx - hr, hy - hr * 1.1, hr * 2, hr * 2.1, hr * 0.5);
        ctx.fill();
        ctx.fillStyle = '#22252b';
        ctx.fillRect(hx - hr * 0.7, hy - hr * 0.35, hr * 1.4, hr * 0.6);
        // Eyes wake with the charge
        const glow = 0.15 + 0.85 * charge;
        ctx.fillStyle = `rgba(255,${Math.round(80 - 40 * charge)},40,${glow})`;
        ctx.beginPath(); ctx.arc(hx - hr * 0.36, hy - hr * 0.05, hr * 0.2, 0, P2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + hr * 0.36, hy - hr * 0.05, hr * 0.2, 0, P2); ctx.fill();
        if (charge > 0.1) {
          ctx.globalCompositeOperation = 'lighter';
          const eg = ctx.createRadialGradient(hx, hy, hr * 0.1, hx, hy, hr * (1.2 + charge * 2));
          eg.addColorStop(0, `rgba(255,70,40,${0.35 * charge})`);
          eg.addColorStop(1, 'rgba(255,70,40,0)');
          ctx.fillStyle = eg;
          ctx.fillRect(bx - T * 0.15, by - T * 0.15, bw + T * 0.3, bh + T * 0.3);
          ctx.globalCompositeOperation = 'source-over';
        }
        // Fully charged: violent little arcs crawling over the bay
        if (charge >= 1) {
          ctx.strokeStyle = 'rgba(160,220,255,0.85)';
          ctx.lineWidth = Math.max(1, T * 0.016);
          for (let i = 0; i < 3; i++) {
            let ax = bx + Math.random() * bw, ay = by + Math.random() * bh;
            ctx.beginPath(); ctx.moveTo(ax, ay);
            for (let s = 0; s < 3; s++) {
              ax += (Math.random() - 0.5) * T * 0.16;
              ay += (Math.random() - 0.5) * T * 0.16;
              ctx.lineTo(ax, ay);
            }
            ctx.stroke();
          }
        }
      }
      // The sliding door panels (drawn last so they cover the cavity edges).
      // Each carries its slice of the hull's red accent stripe, so the paint
      // job reads continuous when closed — and splits with the doors.
      const slide = open * bw * 0.5;
      ctx.lineWidth = Math.max(1, T * 0.018);
      for (const dx of [bx - slide, bx + bw / 2 + slide]) {
        ctx.fillStyle = '#b87d20';
        ctx.strokeStyle = 'rgba(50,28,4,0.7)';
        this.rr(ctx, dx, by, bw / 2, bh, T * 0.02);
        ctx.fill();
        ctx.save();
        this.rr(ctx, dx, by, bw / 2, bh, T * 0.02);
        ctx.clip();
        ctx.fillStyle = 'rgba(150,42,30,0.9)';
        ctx.fillRect(dx, T * 0.03, bw / 2, T * 0.085);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(dx, T * 0.03, bw / 2, T * 0.025);
        ctx.restore();
        this.rr(ctx, dx, by, bw / 2, bh, T * 0.02);
        ctx.stroke();
      }
    }

    // Rear exhaust stack (glows while thrusting)
    ctx.fillStyle = '#3a3f46';
    this.rr(ctx, -T * 0.47, -T * 0.3, T * 0.09, T * 0.26, T * 0.03);
    ctx.fill();
    ctx.fillStyle = '#22252a';
    this.rr(ctx, -T * 0.485, -T * 0.35, T * 0.12, T * 0.07, T * 0.03);
    ctx.fill();
    if (t.thrust) {
      ctx.fillStyle = 'rgba(255,160,60,0.7)';
      ctx.beginPath(); ctx.arc(-T * 0.425, -T * 0.315, T * 0.025 + Math.random() * T * 0.015, 0, P2); ctx.fill();
    }

    // Headlamp
    ctx.fillStyle = '#2c3036';
    this.rr(ctx, T * 0.31, -T * 0.17, T * 0.11, T * 0.13, T * 0.03);
    ctx.fill();
    g = ctx.createRadialGradient(T * 0.375, -T * 0.105, T * 0.005, T * 0.375, -T * 0.105, T * 0.05);
    g.addColorStop(0, '#fff7d8'); g.addColorStop(1, '#c8b060');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(T * 0.375, -T * 0.105, T * 0.038, 0, P2); ctx.fill();

    // ---- Cockpit: framed dome, layered glass, pilot with visor, reflections ----
    ctx.fillStyle = '#8a5a14';
    ctx.beginPath(); ctx.ellipse(T * 0.04, -T * 0.15, T * 0.27, T * 0.235, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    g = ctx.createRadialGradient(T * 0.1, -T * 0.28, T * 0.02, T * 0.05, -T * 0.16, T * 0.28);
    g.addColorStop(0, '#f2fdff');
    g.addColorStop(0.35, '#8fdcf2');
    g.addColorStop(0.75, '#2f8cb0');
    g.addColorStop(1, '#175a78');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(T * 0.04, -T * 0.16, T * 0.235, T * 0.2, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    // Pilot: suit, helmet, tinted visor — clipped to the glass so nothing
    // pokes out of the dome onto the hull
    ctx.save();
    ctx.beginPath(); ctx.ellipse(T * 0.04, -T * 0.16, T * 0.235, T * 0.2, 0, Math.PI, 0); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#c96a20';
    this.rr(ctx, -T * 0.06, -T * 0.2, T * 0.17, T * 0.12, T * 0.04);
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(T * 0.025, -T * 0.24, T * 0.08, 0, P2); ctx.fill();
    ctx.fillStyle = '#20343f';
    ctx.beginPath(); ctx.ellipse(T * 0.05, -T * 0.24, T * 0.048, T * 0.038, 0, 0, P2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(T * 0.06, -T * 0.25, T * 0.015, T * 0.01, 0, 0, P2); ctx.fill();
    ctx.restore();
    // Glass reflection arc
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = Math.max(1, T * 0.022);
    ctx.beginPath(); ctx.arc(T * 0.04, -T * 0.15, T * 0.19, -Math.PI * 0.82, -Math.PI * 0.45); ctx.stroke();
    // Dome rim bolts
    ctx.fillStyle = '#5d3c0c';
    for (const a of [0.85, 0.6, 0.35, 0.12]) {
      const bxr = T * 0.04 - Math.cos(Math.PI * a) * T * 0.26;
      const byr = -T * 0.15 - Math.sin(Math.PI * a) * T * 0.22;
      ctx.beginPath(); ctx.arc(bxr, byr, Math.max(1, T * 0.016), 0, P2); ctx.fill();
    }

    // ---- Roof gear: antenna with blinker, warning beacon ----
    ctx.strokeStyle = '#2c3036';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath(); ctx.moveTo(-T * 0.3, -T * 0.34); ctx.lineTo(-T * 0.34, -T * 0.5); ctx.stroke();
    const blink = Math.sin(t.time * 5) > 0.4;
    ctx.fillStyle = blink ? '#ff5540' : '#7a2c22';
    ctx.beginPath(); ctx.arc(-T * 0.34, -T * 0.51, T * 0.025, 0, P2); ctx.fill();
    if (blink) {
      ctx.fillStyle = 'rgba(255,85,64,0.25)';
      ctx.beginPath(); ctx.arc(-T * 0.34, -T * 0.51, T * 0.06, 0, P2); ctx.fill();
    }
    ctx.fillStyle = t.drilling ? '#ff5540' : '#ffd040';
    ctx.beginPath(); ctx.arc(-T * 0.2, -T * 0.37, T * 0.035, 0, P2); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,80,0.2)';
    ctx.beginPath(); ctx.arc(-T * 0.2, -T * 0.37, T * 0.07, 0, P2); ctx.fill();

    // ---- Microwave Cannon: a parabolic dish popped out of the roof, tracking
    // the cursor. Only present once Mark Zucker-ore activates it at -3,000 ft. ----
    if (t.microwave && t.aim != null) {
      const aim = t.facing < 0 ? Math.PI - t.aim : t.aim;
      ctx.save();
      ctx.translate(-T * 0.18, -T * 0.46);
      // Telescoping mast up out of the hull
      ctx.fillStyle = '#2c3036';
      ctx.fillRect(-T * 0.03, T * 0.02, T * 0.06, T * 0.12);
      ctx.fillStyle = '#3a3f46';
      ctx.beginPath(); ctx.arc(0, 0, T * 0.055, 0, P2); ctx.fill();
      ctx.rotate(aim);
      // Waveguide arm
      ctx.fillStyle = '#4a4f57';
      ctx.fillRect(0, -T * 0.025, T * 0.1, T * 0.05);
      // Parabolic dish (side profile: an open arc facing along the aim)
      ctx.fillStyle = '#8b9097';
      ctx.beginPath();
      ctx.moveTo(T * 0.1, -T * 0.13);
      ctx.quadraticCurveTo(T * 0.02, 0, T * 0.1, T * 0.13);
      ctx.lineTo(T * 0.13, T * 0.11);
      ctx.quadraticCurveTo(T * 0.065, 0, T * 0.13, -T * 0.11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = Math.max(1, T * 0.014);
      ctx.stroke();
      // Feed horn on struts at the focal point
      ctx.strokeStyle = '#2c3036';
      ctx.beginPath();
      ctx.moveTo(T * 0.1, -T * 0.12); ctx.lineTo(T * 0.2, 0);
      ctx.moveTo(T * 0.1, T * 0.12); ctx.lineTo(T * 0.2, 0);
      ctx.stroke();
      ctx.fillStyle = t.mwFiring ? '#ffdf8a' : '#53575d';
      ctx.beginPath(); ctx.arc(T * 0.2, 0, T * 0.028, 0, P2); ctx.fill();
      // Hot glow while firing
      if (t.mwFiring) {
        ctx.globalCompositeOperation = 'lighter';
        const mg = ctx.createRadialGradient(T * 0.16, 0, 1, T * 0.16, 0, T * 0.22);
        mg.addColorStop(0, 'rgba(255,220,140,0.7)');
        mg.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(-T * 0.1, -T * 0.25, T * 0.5, T * 0.5);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    // ---- Swivel flashlight on the dome, aimed at the cursor ----
    if (t.aim != null) {
      // The context may be mirrored; fold that into the local angle
      const aim = t.facing < 0 ? Math.PI - t.aim : t.aim;
      ctx.save();
      ctx.translate(T * 0.04, -T * 0.4);
      // Swivel base
      ctx.fillStyle = '#2c3036';
      ctx.beginPath(); ctx.arc(0, 0, T * 0.05, 0, P2); ctx.fill();
      ctx.rotate(aim);
      // Lamp body
      ctx.fillStyle = '#3a3f46';
      this.rr(ctx, -T * 0.02, -T * 0.038, T * 0.12, T * 0.076, T * 0.022);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, T * 0.012);
      this.rr(ctx, -T * 0.02, -T * 0.038, T * 0.12, T * 0.076, T * 0.022);
      ctx.stroke();
      // Lens
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath(); ctx.arc(T * 0.1, 0, T * 0.03, 0, P2); ctx.fill();
      // Visible beam (short, soft; the real darkness-cutting cone is in the lighting pass)
      ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(T * 0.1, 0, T * 1.7, 0);
      bg.addColorStop(0, 'rgba(255,240,190,0.32)');
      bg.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(T * 0.1, -T * 0.03);
      ctx.lineTo(T * 1.7, -T * 0.34);
      ctx.lineTo(T * 1.7, T * 0.34);
      ctx.lineTo(T * 0.1, T * 0.03);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    ctx.restore();
  },

  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // --- Surface buildings: shared industrial base + unique props per shop ---
  drawBuilding(ctx, key, sx, sy, t) {
    const T = C.TILE, P2 = Math.PI * 2;
    const b = C.BUILDINGS[key];
    const w = b.w * T;
    ctx.save();
    ctx.translate(sx, sy);   // sy = ground line
    const palettes = {
      fuel:      { base: '#8a4b3a', roof: '#5f3026', accent: '#ffd23e', sign: 'FUEL',  h: 2.15 },
      processor: { base: '#4a5e70', roof: '#32414f', accent: '#7fd4ef', sign: 'ORE',   h: 2.5 },
      save:      { base: '#3f6a52', roof: '#2a4a38', accent: '#7dffb0', sign: 'SAVE',  h: 1.2 },
      upgrades:  { base: '#6a5a3f', roof: '#4a3e2a', accent: '#ffb347', sign: 'SHOP',  h: 2.3 },
      items:     { base: '#5e4a6e', roof: '#41324e', accent: '#c9a2ff', sign: 'ITEMS', h: 2.05 },
    };
    const p = palettes[key];
    const H = T * p.h;
    let g;

    if (b.hover) {
      // --- Hovering save machine: capsule, ring antenna, thruster pods, scan glow ---
      const hov = Math.sin(t * 1.8) * T * 0.12;
      ctx.translate(0, -T * 2.4 + hov);
      // Thruster pods
      for (const px of [T * 0.12, w - T * 0.12]) {
        ctx.fillStyle = '#2c463a';
        this.rr(ctx, px - T * 0.11, T * 0.55, T * 0.22, T * 0.42, T * 0.08);
        ctx.fill();
        const flick = 0.5 + 0.5 * Math.sin(t * 17 + px);
        g = ctx.createRadialGradient(px, T * 1.02, T * 0.02, px, T * 1.02, T * 0.18);
        g.addColorStop(0, `rgba(150,255,190,${0.5 + flick * 0.3})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, T * 1.02, T * 0.18, 0, P2); ctx.fill();
      }
      // Capsule body
      g = ctx.createLinearGradient(0, 0, 0, T * 1.1);
      g.addColorStop(0, this.shade(p.base, 0.25));
      g.addColorStop(0.5, p.base);
      g.addColorStop(1, p.roof);
      ctx.fillStyle = g;
      this.rr(ctx, 0, 0, w, T * 1.05, T * 0.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,30,22,0.7)';
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      this.rr(ctx, 0, 0, w, T * 1.05, T * 0.3);
      ctx.stroke();
      // Panel seams + rivets
      ctx.strokeStyle = 'rgba(10,25,18,0.4)';
      ctx.lineWidth = Math.max(1, T * 0.015);
      ctx.beginPath(); ctx.moveTo(T * 0.15, T * 0.52); ctx.lineTo(w - T * 0.15, T * 0.52); ctx.stroke();
      ctx.fillStyle = 'rgba(220,255,230,0.35)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(T * 0.2 + i * (w - T * 0.4) / 4, T * 0.13, Math.max(1, T * 0.015), 0, P2); ctx.fill();
      }
      // Data screen with scanline
      ctx.fillStyle = '#0a1a12';
      this.rr(ctx, T * 0.16, T * 0.2, T * 0.5, T * 0.34, T * 0.05);
      ctx.fill();
      ctx.fillStyle = 'rgba(125,255,176,0.7)';
      const scan = (t * 0.7) % 1;
      ctx.fillRect(T * 0.19, T * 0.22 + scan * T * 0.26, T * 0.44, T * 0.03);
      ctx.strokeStyle = 'rgba(125,255,176,0.5)';
      ctx.lineWidth = 1;
      this.rr(ctx, T * 0.16, T * 0.2, T * 0.5, T * 0.34, T * 0.05);
      ctx.stroke();
      // Central orb
      g = ctx.createRadialGradient(w / 2 - T * 0.08, T * 0.45, T * 0.03, w / 2, T * 0.53, T * 0.3);
      g.addColorStop(0, '#eafff2');
      g.addColorStop(0.4, p.accent);
      g.addColorStop(1, '#1d5c3c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(w / 2, T * 0.53, T * 0.27, 0, P2); ctx.fill();
      ctx.strokeStyle = 'rgba(10,40,25,0.8)';
      ctx.lineWidth = Math.max(1.5, T * 0.025);
      ctx.stroke();
      // Ring antenna with blinking tip
      ctx.strokeStyle = '#2c463a';
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, -T * 0.32); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, -T * 0.42, T * 0.11, 0, P2); ctx.stroke();
      const blink = Math.sin(t * 4) > 0.2;
      ctx.fillStyle = blink ? p.accent : '#2c5a40';
      ctx.beginPath(); ctx.arc(w / 2, -T * 0.42, T * 0.045, 0, P2); ctx.fill();
      // Anti-grav glow cone
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(w / 2, T * 1.25, T * 0.05, w / 2, T * 1.25, T * 0.9);
      gg.addColorStop(0, `rgba(125,255,176,${0.4 + 0.15 * Math.sin(t * 3)})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(-T, T * 0.8, w + 2 * T, T * 1.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      return;
    }

    // --- Ground shadow & foundation pad ---
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(w / 2, T * 0.04, w * 0.62, T * 0.09, 0, 0, P2); ctx.fill();
    g = ctx.createLinearGradient(0, -T * 0.08, 0, T * 0.08);
    g.addColorStop(0, '#6a6c72'); g.addColorStop(1, '#3f4146');
    ctx.fillStyle = g;
    this.rr(ctx, -T * 0.2, -T * 0.08, w + T * 0.4, T * 0.16, T * 0.04);
    ctx.fill();

    // --- Main structure: gradient walls + paneled facade ---
    g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, this.shade(p.base, 0.18));
    g.addColorStop(0.55, p.base);
    g.addColorStop(1, this.shade(p.base, -0.38));
    ctx.fillStyle = g;
    this.rr(ctx, 0, -H, w, H, T * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1.5, T * 0.025);
    this.rr(ctx, 0, -H, w, H, T * 0.12);
    ctx.stroke();
    // Vertical panel seams + rivets
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, T * 0.014);
    for (let i = 1; i < 4; i++) {
      const px = (w / 4) * i;
      ctx.beginPath(); ctx.moveTo(px, -H + T * 0.1); ctx.lineTo(px, -T * 0.1); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.arc(w / 8 + i * w / 4, -H + T * 0.22 + j * (H - T * 0.5), Math.max(1, T * 0.014), 0, P2);
        ctx.fill();
      }
    }
    // Corner trim columns
    ctx.fillStyle = this.shade(p.roof, -0.1);
    this.rr(ctx, -T * 0.04, -H, T * 0.12, H, T * 0.04); ctx.fill();
    this.rr(ctx, w - T * 0.08, -H, T * 0.12, H, T * 0.04); ctx.fill();
    // Warning stripes at the base corners
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -T * 0.34, T * 0.5, T * 0.26);
    ctx.rect(w - T * 0.5, -T * 0.34, T * 0.5, T * 0.26);
    ctx.clip();
    for (let i = -2; i < 14; i++) {
      ctx.fillStyle = i % 2 ? '#c9a227' : '#2c2c30';
      ctx.beginPath();
      ctx.moveTo(i * T * 0.16, -T * 0.08);
      ctx.lineTo(i * T * 0.16 + T * 0.16, -T * 0.08);
      ctx.lineTo(i * T * 0.16 + T * 0.32, -T * 0.34);
      ctx.lineTo(i * T * 0.16 + T * 0.16, -T * 0.34);
      ctx.fill();
    }
    ctx.restore();

    // --- Roof: slab, lip, vent boxes, pipe ---
    g = ctx.createLinearGradient(0, -H - T * 0.32, 0, -H);
    g.addColorStop(0, this.shade(p.roof, 0.15)); g.addColorStop(1, p.roof);
    ctx.fillStyle = g;
    this.rr(ctx, -T * 0.15, -H - T * 0.28, w + T * 0.3, T * 0.36, T * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    this.rr(ctx, -T * 0.15, -H - T * 0.28, w + T * 0.3, T * 0.08, T * 0.04);
    ctx.fill();
    // Vent box with slats
    ctx.fillStyle = this.shade(p.roof, -0.25);
    this.rr(ctx, w - T * 0.85, -H - T * 0.58, T * 0.6, T * 0.32, T * 0.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(w - T * 0.8, -H - T * 0.58 + i * T * 0.08);
      ctx.lineTo(w - T * 0.3, -H - T * 0.58 + i * T * 0.08);
      ctx.stroke();
    }
    // Side conduit pipe
    ctx.strokeStyle = this.shade(p.roof, -0.2);
    ctx.lineWidth = Math.max(2, T * 0.05);
    ctx.beginPath();
    ctx.moveTo(T * 0.22, -T * 0.05);
    ctx.lineTo(T * 0.22, -H + T * 0.3);
    ctx.quadraticCurveTo(T * 0.22, -H + T * 0.1, T * 0.42, -H + T * 0.1);
    ctx.stroke();
    ctx.fillStyle = this.shade(p.roof, -0.35);
    for (const py of [-T * 0.4, -H * 0.5, -H + T * 0.35]) {
      this.rr(ctx, T * 0.15, py, T * 0.14, T * 0.07, T * 0.02);
      ctx.fill();
    }

    // --- Door: frame, steps, glow edge, keypad, lamp ---
    const dx = w / 2 - T * 0.45;
    ctx.fillStyle = this.shade(p.roof, -0.15);
    this.rr(ctx, dx - T * 0.07, -T * 1.34, T * 1.04, T * 1.34, T * 0.12);
    ctx.fill();
    g = ctx.createLinearGradient(0, -T * 1.25, 0, 0);
    g.addColorStop(0, '#191a20'); g.addColorStop(1, '#0c0d11');
    ctx.fillStyle = g;
    this.rr(ctx, dx, -T * 1.25, T * 0.9, T * 1.25, T * 0.1);
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(1.5, T * 0.025);
    this.rr(ctx, dx, -T * 1.25, T * 0.9, T * 1.25, T * 0.1);
    ctx.stroke();
    // Door split line
    ctx.strokeStyle = this.hexA(p.accent, 0.4);
    ctx.lineWidth = Math.max(1, T * 0.012);
    ctx.beginPath(); ctx.moveTo(w / 2, -T * 1.25); ctx.lineTo(w / 2, 0); ctx.stroke();
    // Keypad
    ctx.fillStyle = '#22252b';
    this.rr(ctx, dx + T * 0.98, -T * 0.85, T * 0.12, T * 0.18, T * 0.02);
    ctx.fill();
    ctx.fillStyle = this.hexA(p.accent, 0.9);
    ctx.fillRect(dx + T * 1.005, -T * 0.82, T * 0.07, T * 0.03);
    // Lamp above the door with light cone
    ctx.fillStyle = '#2c2f35';
    this.rr(ctx, w / 2 - T * 0.09, -T * 1.52, T * 0.18, T * 0.1, T * 0.03);
    ctx.fill();
    g = ctx.createLinearGradient(0, -T * 1.45, 0, -T * 0.2);
    g.addColorStop(0, this.hexA(p.accent, 0.22));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w / 2 - T * 0.07, -T * 1.44);
    ctx.lineTo(w / 2 + T * 0.07, -T * 1.44);
    ctx.lineTo(w / 2 + T * 0.42, -T * 0.02);
    ctx.lineTo(w / 2 - T * 0.42, -T * 0.02);
    ctx.fill();

    // --- Windows: frame + lit interior + crossbar ---
    for (const wx of [T * 0.28, w - T * 0.72]) {
      ctx.fillStyle = this.shade(p.roof, -0.2);
      this.rr(ctx, wx - T * 0.05, -H + T * 0.3, T * 0.54, T * 0.46, T * 0.06);
      ctx.fill();
      g = ctx.createLinearGradient(0, -H + T * 0.34, 0, -H + T * 0.7);
      g.addColorStop(0, this.hexA(p.accent, 0.95));
      g.addColorStop(1, this.hexA(p.accent, 0.35));
      ctx.fillStyle = g;
      this.rr(ctx, wx, -H + T * 0.35, T * 0.44, T * 0.36, T * 0.04);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, T * 0.014);
      ctx.beginPath();
      ctx.moveTo(wx, -H + T * 0.53); ctx.lineTo(wx + T * 0.44, -H + T * 0.53);
      ctx.moveTo(wx + T * 0.22, -H + T * 0.35); ctx.lineTo(wx + T * 0.22, -H + T * 0.71);
      ctx.stroke();
    }

    // --- Per-building props ---
    this.drawBuildingProps(ctx, key, w, H, T, t, p);

    // --- Glowing sign with occasional flicker ---
    const signW = Math.min(w - T * 0.4, T * 2.2);
    ctx.fillStyle = '#111318';
    this.rr(ctx, (w - signW) / 2, -H - T * 0.88, signW, T * 0.52, T * 0.08);
    ctx.fill();
    ctx.strokeStyle = this.hexA(p.accent, 0.5);
    ctx.lineWidth = Math.max(1, T * 0.018);
    this.rr(ctx, (w - signW) / 2, -H - T * 0.88, signW, T * 0.52, T * 0.08);
    ctx.stroke();
    const flicker = Math.sin(t * 13 + w) > 0.985 ? 0.35 : 1;
    ctx.font = `bold ${Math.floor(T * 0.34)}px Verdana`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 12 * flicker;
    ctx.fillStyle = this.hexA(p.accent, flicker);
    ctx.fillText(p.sign, w / 2, -H - T * 0.62);
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  // Unique dressing per shop
  drawBuildingProps(ctx, key, w, H, T, t, p) {
    const P2 = Math.PI * 2;
    let g;
    if (key === 'fuel') {
      // Striped fuel silo on the left with a feed pipe into the wall
      const sx = -T * 0.72, sw = T * 0.55, sh = T * 1.6;
      g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      g.addColorStop(0, '#7a2b20'); g.addColorStop(0.35, '#c04a35'); g.addColorStop(0.65, '#c04a35'); g.addColorStop(1, '#6a241b');
      ctx.fillStyle = g;
      this.rr(ctx, sx, -sh, sw, sh, T * 0.12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const py of [-sh * 0.72, -sh * 0.38]) ctx.fillRect(sx, py, sw, T * 0.09);
      // Dome cap
      g = ctx.createRadialGradient(sx + sw * 0.4, -sh - T * 0.05, T * 0.02, sx + sw / 2, -sh, T * 0.35);
      g.addColorStop(0, '#d86a50'); g.addColorStop(1, '#6a241b');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(sx + sw / 2, -sh, sw / 2, T * 0.16, 0, Math.PI, 0); ctx.fill();
      // Feed pipe
      ctx.strokeStyle = '#4a4c52';
      ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath();
      ctx.moveTo(sx + sw, -sh * 0.5);
      ctx.lineTo(T * 0.1, -sh * 0.5);
      ctx.stroke();
      // Pump bollard + hose by the door
      ctx.fillStyle = '#2c2f35';
      this.rr(ctx, w - T * 0.42, -T * 0.55, T * 0.3, T * 0.55, T * 0.05);
      ctx.fill();
      ctx.fillStyle = p.accent;
      this.rr(ctx, w - T * 0.38, -T * 0.48, T * 0.22, T * 0.14, T * 0.03);
      ctx.fill();
      ctx.strokeStyle = '#191b1f';
      ctx.lineWidth = Math.max(2, T * 0.04);
      ctx.beginPath();
      ctx.moveTo(w - T * 0.27, -T * 0.55);
      ctx.quadraticCurveTo(w - T * 0.05, -T * 0.85, w - T * 0.12, -T * 0.32);
      ctx.stroke();
    } else if (key === 'processor') {
      // --- REFINERY dressing: twin heat stacks, furnace hatch, live conveyor, ore piles ---
      // Twin striped smokestacks rising from behind the roofline (left side)
      for (const [scx, sw2, sh2] of [[T * 0.55, T * 0.36, T * 2.1], [T * 1.18, T * 0.3, T * 1.7]]) {
        g = ctx.createLinearGradient(scx - sw2 / 2, 0, scx + sw2 / 2, 0);
        g.addColorStop(0, '#877c60'); g.addColorStop(0.35, '#c4b68e'); g.addColorStop(0.65, '#c4b68e'); g.addColorStop(1, '#655c48');
        ctx.fillStyle = g;
        this.rr(ctx, scx - sw2 / 2, -H - sh2, sw2, sh2 - T * 0.24, sw2 * 0.16);
        ctx.fill();
        // Ring seams
        ctx.fillStyle = 'rgba(55,46,32,0.4)';
        for (let i = 1; i <= 3; i++) ctx.fillRect(scx - sw2 / 2, -H - sh2 * i / 3.6, sw2, Math.max(1, T * 0.04));
        // Dark cap collar
        ctx.fillStyle = '#3a3f47';
        this.rr(ctx, scx - sw2 / 2 - T * 0.04, -H - sh2 - T * 0.1, sw2 + T * 0.08, T * 0.16, T * 0.04);
        ctx.fill();
        // Flickering heat glow at the mouth
        const fl = 0.5 + 0.5 * Math.sin(t * 7 + scx);
        g = ctx.createRadialGradient(scx, -H - sh2 - T * 0.08, T * 0.02, scx, -H - sh2 - T * 0.08, T * 0.3);
        g.addColorStop(0, `rgba(255,150,60,${0.25 + 0.25 * fl})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(scx, -H - sh2 - T * 0.08, T * 0.3, 0, P2); ctx.fill();
        // Smoke puffs drifting up and thinning out
        for (let i = 0; i < 4; i++) {
          const ph = (t * 0.16 + i / 4 + scx * 0.013) % 1;
          const px = scx + Math.sin(t * 1.1 + i * 2.3 + scx) * T * (0.04 + 0.16 * ph);
          const py = -H - sh2 - T * 0.16 - ph * T * 1.25;
          ctx.fillStyle = `rgba(190,190,200,${0.3 * (1 - ph)})`;
          ctx.beginPath(); ctx.arc(px, py, T * (0.07 + 0.15 * ph), 0, P2); ctx.fill();
        }
      }
      // Furnace hatch on the facade: slatted grille over a breathing fire glow
      const fhx = T * 0.34, fhy = -T * 0.72, fhw = T * 0.62, fhh = T * 0.5;
      ctx.fillStyle = '#22252b';
      this.rr(ctx, fhx - T * 0.05, fhy - T * 0.05, fhw + T * 0.1, fhh + T * 0.1, T * 0.06);
      ctx.fill();
      const breathe = 0.6 + 0.4 * Math.sin(t * 2.6);
      g = ctx.createLinearGradient(0, fhy, 0, fhy + fhh);
      g.addColorStop(0, `rgba(255,120,30,${0.55 + 0.3 * breathe})`);
      g.addColorStop(1, `rgba(150,40,10,${0.8})`);
      ctx.fillStyle = g;
      this.rr(ctx, fhx, fhy, fhw, fhh, T * 0.04);
      ctx.fill();
      ctx.fillStyle = '#1a1c20';
      for (let i = 1; i < 4; i++) ctx.fillRect(fhx, fhy + i * fhh / 4 - T * 0.02, fhw, T * 0.045);
      g = ctx.createRadialGradient(fhx + fhw / 2, fhy + fhh / 2, T * 0.05, fhx + fhw / 2, fhy + fhh / 2, T * 0.55);
      g.addColorStop(0, `rgba(255,140,50,${0.16 * breathe})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fhx + fhw / 2, fhy + fhh / 2, T * 0.55, 0, P2); ctx.fill();
      // Rooftop intake hopper
      ctx.fillStyle = '#3a4a58';
      ctx.beginPath();
      ctx.moveTo(w - T * 1.1, -H - T * 0.3);
      ctx.lineTo(w - T * 0.2, -H - T * 0.3);
      ctx.lineTo(w - T * 0.42, -H - T * 0.85);
      ctx.lineTo(w - T * 0.88, -H - T * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, T * 0.02);
      ctx.stroke();
      // Ore heap peeking out of the hopper
      ctx.fillStyle = '#8a6a3c';
      ctx.beginPath(); ctx.ellipse(w - T * 0.65, -H - T * 0.85, T * 0.2, T * 0.08, 0, Math.PI, 0); ctx.fill();
      // Inclined conveyor from the ground up to the hopper — running
      const cx0 = w + T * 0.55, cy0 = -T * 0.1, cx1 = w - T * 0.5, cy1 = -H - T * 0.78;
      const clen = Math.hypot(cx1 - cx0, cy1 - cy0);
      const ux = (cx1 - cx0) / clen, uy = (cy1 - cy0) / clen;   // unit along belt (up-slope)
      const nx = uy, ny = -ux;                                  // unit normal (off-belt side)
      ctx.strokeStyle = '#23262b';
      ctx.lineWidth = Math.max(3, T * 0.11);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
      ctx.strokeStyle = '#4a5058';
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
      // Belt motion: tread cleats marching toward the hopper
      const beltSpd = T * 0.45;
      const cleatGap = T * 0.24;
      ctx.strokeStyle = 'rgba(150,160,175,0.55)';
      ctx.lineWidth = Math.max(1, T * 0.022);
      for (let d = (t * beltSpd) % cleatGap; d < clen; d += cleatGap) {
        const px = cx0 + ux * d, py = cy0 + uy * d;
        ctx.beginPath();
        ctx.moveTo(px - nx * T * 0.05, py - ny * T * 0.05);
        ctx.lineTo(px + nx * T * 0.05, py + ny * T * 0.05);
        ctx.stroke();
      }
      // Ore chunks riding the belt into the hopper
      for (let i = 0; i < 3; i++) {
        const ph = ((t * beltSpd) / clen * 0.55 + i / 3) % 1;
        const d = ph * (clen - T * 0.2);
        const px = cx0 + ux * d + nx * T * 0.085, py = cy0 + uy * d + ny * T * 0.085;
        ctx.fillStyle = '#8a6a3c';
        ctx.beginPath();
        ctx.moveTo(px - T * 0.07, py + T * 0.03);
        ctx.lineTo(px - T * 0.03, py - T * 0.06);
        ctx.lineTo(px + T * 0.055, py - T * 0.045);
        ctx.lineTo(px + T * 0.07, py + T * 0.035);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,0.5)';
        ctx.beginPath(); ctx.arc(px - T * 0.01, py - T * 0.025, T * 0.02, 0, P2); ctx.fill();
      }
      // Rollers with rotating spokes so the drive reads as live
      for (let i = 0; i < 4; i++) {
        const rt2 = i / 3;
        const px = cx0 + (cx1 - cx0) * rt2, py = cy0 + (cy1 - cy0) * rt2;
        const rr2 = T * 0.045;
        ctx.fillStyle = '#5a616a';
        ctx.beginPath(); ctx.arc(px, py, rr2, 0, P2); ctx.fill();
        const ang = (t * beltSpd) / rr2;
        ctx.strokeStyle = 'rgba(20,22,26,0.8)';
        ctx.lineWidth = Math.max(1, T * 0.014);
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(ang) * rr2, py - Math.sin(ang) * rr2);
        ctx.lineTo(px + Math.cos(ang) * rr2, py + Math.sin(ang) * rr2);
        ctx.stroke();
      }
      // Support legs
      ctx.strokeStyle = '#2c313a';
      ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath(); ctx.moveTo(w + T * 0.18, -T * 0.02); ctx.lineTo(w + T * 0.05, -H * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w + T * 0.5, -T * 0.02); ctx.lineTo(w + T * 0.42, -T * 0.5); ctx.stroke();
      // Ore piles waiting at the foot of the belt
      for (const [pxc, prx, pry] of [[w + T * 0.85, T * 0.34, T * 0.24], [w + T * 1.38, T * 0.26, T * 0.18]]) {
        g = ctx.createLinearGradient(pxc, -pry, pxc, 0);
        g.addColorStop(0, '#b89a5c'); g.addColorStop(1, '#7a6238');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(pxc, 0, prx, pry, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,170,0.25)';
        ctx.beginPath(); ctx.ellipse(pxc - prx * 0.25, -pry * 0.55, prx * 0.3, pry * 0.25, -0.4, 0, P2); ctx.fill();
      }
    } else if (key === 'upgrades') {
      // Gear emblem on the facade
      const gx = w / 2, gy = -H + T * 0.52, gr = T * 0.2;
      ctx.fillStyle = this.shade(p.base, -0.3);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * P2;
        ctx.lineTo(gx + Math.cos(a - 0.12) * gr * 1.25, gy + Math.sin(a - 0.12) * gr * 1.25);
        ctx.lineTo(gx + Math.cos(a + 0.12) * gr * 1.25, gy + Math.sin(a + 0.12) * gr * 1.25);
        ctx.lineTo(gx + Math.cos(a + 0.28) * gr, gy + Math.sin(a + 0.28) * gr);
        ctx.lineTo(gx + Math.cos(a + 0.5) * gr, gy + Math.sin(a + 0.5) * gr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.hexA(p.accent, 0.85);
      ctx.beginPath(); ctx.arc(gx, gy, gr * 0.45, 0, P2); ctx.fill();
      ctx.fillStyle = this.shade(p.base, -0.3);
      ctx.beginPath(); ctx.arc(gx, gy, gr * 0.2, 0, P2); ctx.fill();
      // Parts crates stacked outside
      const crate = (cx, cy, cs) => {
        g = ctx.createLinearGradient(cx, cy - cs, cx, cy);
        g.addColorStop(0, '#8a6a42'); g.addColorStop(1, '#5c4326');
        ctx.fillStyle = g;
        this.rr(ctx, cx, cy - cs, cs, cs, T * 0.03);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,18,8,0.6)';
        ctx.lineWidth = Math.max(1, T * 0.016);
        this.rr(ctx, cx, cy - cs, cs, cs, T * 0.03);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - cs); ctx.lineTo(cx + cs, cy);
        ctx.moveTo(cx + cs, cy - cs); ctx.lineTo(cx, cy);
        ctx.stroke();
      };
      crate(w + T * 0.12, 0, T * 0.42);
      crate(w + T * 0.6, 0, T * 0.34);
      crate(w + T * 0.3, -T * 0.42, T * 0.36);
      // Drill-bit display rack outside the door — tiers on show like garage
      // tires: silver, goldium, ruby, point-down and ready to bolt on
      const rackX = -T * 0.98;
      ctx.fillStyle = '#4a3a26';
      ctx.fillRect(rackX + T * 0.02, -T * 0.72, T * 0.07, T * 0.72);
      ctx.fillRect(rackX + T * 0.78, -T * 0.72, T * 0.07, T * 0.72);
      ctx.fillRect(rackX, -T * 0.8, T * 0.87, T * 0.09);
      // Same anatomy as the pod's own bit — collar with bolts, curved fluted
      // cone, specular edge — just re-colored per tier
      const bitCols = [
        ['#dde1e7', '#9ba0a8', '#53575d'],   // stock silver
        ['#ffe9a8', '#f4c542', '#8a6a1a'],   // goldium
        ['#ffb0be', '#f0304e', '#701325'],   // ruby
      ];
      for (let i = 0; i < 3; i++) {
        const bx = rackX + T * (0.17 + i * 0.27);
        const s = 0.75 + i * 0.22;
        const topY = -T * 0.71, len = T * 0.42 * s, hw = T * 0.1 * s;
        // Hanging collar with bolts
        ctx.fillStyle = '#3a3f46';
        this.rr(ctx, bx - hw * 0.8, topY - T * 0.055, hw * 1.6, T * 0.07, T * 0.02);
        ctx.fill();
        ctx.fillStyle = '#15181c';
        for (const bxo of [-0.45, 0.45]) {
          ctx.beginPath(); ctx.arc(bx + hw * bxo, topY - T * 0.02, Math.max(1, T * 0.013), 0, P2); ctx.fill();
        }
        // Curved cone, tier-colored
        g = ctx.createLinearGradient(bx - hw, 0, bx + hw, 0);
        g.addColorStop(0, bitCols[i][0]); g.addColorStop(0.45, bitCols[i][1]); g.addColorStop(1, bitCols[i][2]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - hw, topY);
        ctx.quadraticCurveTo(bx - hw * 0.4, topY + len * 0.55, bx, topY + len);
        ctx.quadraticCurveTo(bx + hw * 0.4, topY + len * 0.55, bx + hw, topY);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.clip();
        // Helical flutes, at rest
        ctx.strokeStyle = 'rgba(35,38,44,0.8)';
        ctx.lineWidth = Math.max(1.2, T * 0.026);
        for (let k = 0; k < 4; k++) {
          const oy = topY + len * (0.12 + k * 0.22);
          ctx.beginPath();
          ctx.moveTo(bx - hw, oy - len * 0.06);
          ctx.quadraticCurveTo(bx, oy + len * 0.08, bx + hw, oy - len * 0.02);
          ctx.stroke();
        }
        // Specular streak down the lit side
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = Math.max(1, T * 0.018);
        ctx.beginPath();
        ctx.moveTo(bx - hw * 0.65, topY + T * 0.02);
        ctx.quadraticCurveTo(bx - hw * 0.3, topY + len * 0.55, bx - hw * 0.05, topY + len * 0.92);
        ctx.stroke();
        ctx.restore();
      }
      // Tool pegboard on the facade: wrench, hammer, screwdriver on hooks
      const pbX = w - T * 1.32, pbY = -H + T * 0.92, pbW = T * 1.08, pbH = T * 0.72;
      ctx.fillStyle = '#39301e';
      this.rr(ctx, pbX, pbY, pbW, pbH, T * 0.04);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,8,0.6)';
      ctx.lineWidth = Math.max(1, T * 0.018);
      this.rr(ctx, pbX, pbY, pbW, pbH, T * 0.04);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let px2 = 1; px2 < 5; px2++) {
        for (let py2 = 1; py2 < 4; py2++) {
          ctx.beginPath();
          ctx.arc(pbX + px2 * pbW / 5, pbY + py2 * pbH / 4, Math.max(1, T * 0.012), 0, P2);
          ctx.fill();
        }
      }
      // Wrench: open jaw + shaft, hung diagonally
      ctx.strokeStyle = '#c8ccd4';
      ctx.lineWidth = Math.max(2, T * 0.045);
      ctx.beginPath();
      ctx.moveTo(pbX + T * 0.14, pbY + T * 0.14);
      ctx.lineTo(pbX + T * 0.3, pbY + T * 0.56);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      ctx.beginPath(); ctx.arc(pbX + T * 0.12, pbY + T * 0.11, T * 0.055, Math.PI * 0.2, Math.PI * 1.6); ctx.stroke();
      // Hammer: vertical handle, heavy head
      ctx.fillStyle = '#8a6a42';
      ctx.fillRect(pbX + T * 0.5, pbY + T * 0.18, T * 0.055, T * 0.44);
      ctx.fillStyle = '#c8ccd4';
      this.rr(ctx, pbX + T * 0.42, pbY + T * 0.1, T * 0.22, T * 0.12, T * 0.03);
      ctx.fill();
      // Screwdriver: amber handle, thin shaft
      ctx.fillStyle = this.hexA(p.accent, 0.9);
      this.rr(ctx, pbX + T * 0.82, pbY + T * 0.1, T * 0.07, T * 0.2, T * 0.03);
      ctx.fill();
      ctx.strokeStyle = '#c8ccd4';
      ctx.lineWidth = Math.max(1.5, T * 0.025);
      ctx.beginPath();
      ctx.moveTo(pbX + T * 0.855, pbY + T * 0.3);
      ctx.lineTo(pbX + T * 0.855, pbY + T * 0.58);
      ctx.stroke();
      // Oil drum by the door with a leaning wrench
      ctx.fillStyle = '#4a4f57';
      this.rr(ctx, T * 0.34, -T * 0.6, T * 0.42, T * 0.6, T * 0.04);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(T * 0.34, -T * 0.5, T * 0.42, T * 0.06);
      ctx.fillRect(T * 0.34, -T * 0.24, T * 0.42, T * 0.06);
      ctx.fillStyle = 'rgba(15,12,8,0.55)';
      ctx.beginPath(); ctx.ellipse(T * 0.55, -T * 0.6, T * 0.19, T * 0.045, 0, 0, P2); ctx.fill();
      ctx.strokeStyle = '#9aa0a8';
      ctx.lineWidth = Math.max(2, T * 0.04);
      ctx.beginPath();
      ctx.moveTo(T * 0.82, -T * 0.02);
      ctx.lineTo(T * 0.98, -T * 0.5);
      ctx.stroke();
    } else if (key === 'items') {
      // Striped awning over the door
      const ax = w / 2 - T * 0.62, aw = T * 1.24;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ax, -T * 1.42);
      ctx.lineTo(ax + aw, -T * 1.42);
      ctx.lineTo(ax + aw - T * 0.12, -T * 1.14);
      ctx.lineTo(ax + T * 0.12, -T * 1.14);
      ctx.closePath();
      ctx.clip();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#c9a2ff' : '#4a3760';
        ctx.fillRect(ax + i * aw / 8, -T * 1.45, aw / 8 + 1, T * 0.34);
      }
      ctx.restore();
      // Scalloped awning edge
      ctx.fillStyle = '#4a3760';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(ax + T * 0.12 + (i + 0.5) * (aw - T * 0.24) / 6, -T * 1.14, T * 0.055, 0, Math.PI);
        ctx.fill();
      }
      // Supply barrel + crate
      g = ctx.createLinearGradient(-T * 0.6, 0, -T * 0.15, 0);
      g.addColorStop(0, '#3f6a52'); g.addColorStop(0.5, '#5c8a6e'); g.addColorStop(1, '#2c4a38');
      ctx.fillStyle = g;
      this.rr(ctx, -T * 0.58, -T * 0.62, T * 0.42, T * 0.62, T * 0.06);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-T * 0.58, -T * 0.5, T * 0.42, T * 0.05);
      ctx.fillRect(-T * 0.58, -T * 0.24, T * 0.42, T * 0.05);
      ctx.fillStyle = '#8a6a42';
      this.rr(ctx, -T * 1.05, -T * 0.4, T * 0.4, T * 0.4, T * 0.03);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,18,8,0.6)';
      ctx.lineWidth = Math.max(1, T * 0.016);
      this.rr(ctx, -T * 1.05, -T * 0.4, T * 0.4, T * 0.4, T * 0.03);
      ctx.stroke();
    }
  },

  shadeCss(hex, amt) { return this.shade(hex, amt); },
  hexA(hex, a) { return this.alpha(hex, a); },

  // --- Boss forms ---
  // Security automaton: a gunmetal endoskeleton with burning red eyes and a
  // laser pistol. r: {facing, walkPhase, flying, heat 0..1, dormant, aim,
  // zapT, time}. As heat climbs the metal glows through orange toward white.
  drawRobot(ctx, sx, sy, r) {
    const T = C.TILE, P2 = Math.PI * 2;
    const heat = Math.min(1, r.heat || 0);
    ctx.save();
    ctx.translate(sx, sy);
    if (r.facing < 0) ctx.scale(-1, 1);
    // Beam impact shudder
    if (r.zapT > 0) ctx.translate((Math.random() - 0.5) * T * 0.06, (Math.random() - 0.5) * T * 0.06);

    // Heat-shifted metal palette: gunmetal -> cherry -> white hot
    const mixCh = (a, b) => Math.round(a + (b - a) * heat);
    const metal = (base) => `rgb(${mixCh(base, 255)},${mixCh(Math.round(base * 0.85), 140 + 90 * heat)},${mixCh(Math.round(base * 0.95), 70)})`;
    const dark = metal(58), mid = metal(96), light = metal(150);

    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, T * 0.46, T * 0.24, T * 0.05, 0, 0, P2); ctx.fill();

    // Rocket flame when climbing
    if (r.flying) {
      ctx.globalCompositeOperation = 'lighter';
      const fl = T * (0.18 + Math.random() * 0.1);
      const fg = ctx.createLinearGradient(0, T * 0.3, 0, T * 0.3 + fl * 2);
      fg.addColorStop(0, 'rgba(160,220,255,0.9)');
      fg.addColorStop(0.5, 'rgba(255,180,80,0.7)');
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-T * 0.1, T * 0.28);
      ctx.lineTo(0, T * 0.3 + fl * 2);
      ctx.lineTo(T * 0.1, T * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Legs: pistoned struts with a mechanical gait
    const ph = r.flying ? 0 : Math.sin(r.walkPhase || 0);
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(2, T * 0.055);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const swing = ph * s * (r.dormant ? 0 : 1);
      const hipX = s * T * 0.07, kneeX = hipX + swing * T * 0.08, footX = hipX + swing * T * 0.14;
      ctx.beginPath();
      ctx.moveTo(hipX, T * 0.12);
      ctx.lineTo(kneeX, T * 0.28);
      ctx.lineTo(footX, T * 0.44);
      ctx.stroke();
      // Foot plate
      ctx.fillStyle = mid;
      ctx.fillRect(footX - T * 0.05, T * 0.42, T * 0.12, T * 0.045);
    }

    // Firing crouch: the upper body bends forward over the planted legs
    const crouch = r.crouch || 0;
    ctx.save();
    if (crouch > 0.01) {
      ctx.translate(0, T * 0.12);
      ctx.rotate(0.55 * crouch);
      ctx.translate(0, -T * 0.12 + T * 0.07 * crouch);
    }

    // Torso: ribbed chassis
    let g = ctx.createLinearGradient(0, -T * 0.18, 0, T * 0.16);
    g.addColorStop(0, light); g.addColorStop(0.55, mid); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    this.rr(ctx, -T * 0.16, -T * 0.18, T * 0.32, T * 0.32, T * 0.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    this.rr(ctx, -T * 0.16, -T * 0.18, T * 0.32, T * 0.32, T * 0.05);
    ctx.stroke();
    // Rib slats
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 3; i++) {
      const y = -T * 0.1 + i * T * 0.08;
      ctx.beginPath(); ctx.moveTo(-T * 0.12, y); ctx.lineTo(T * 0.12, y); ctx.stroke();
    }
    // Rocket backpack
    ctx.fillStyle = dark;
    this.rr(ctx, -T * 0.24, -T * 0.14, T * 0.09, T * 0.24, T * 0.03);
    ctx.fill();
    // Crouched: the back hatch swings open (the turret module itself is drawn
    // in world space by drawRobotFx so the beam stays attached to its lens)
    if (crouch > 0.3) {
      const open = (crouch - 0.3) / 0.7;
      ctx.fillStyle = dark;
      ctx.save();
      ctx.translate(-T * 0.24, -T * 0.14);
      ctx.rotate(-1.1 * open);
      this.rr(ctx, 0, -T * 0.02, T * 0.09, T * 0.04, T * 0.015);
      ctx.fill();
      ctx.restore();
    }
    // Core lamp on the chest — heartbeat red, dead when dormant
    const corePulse = r.dormant ? 0.12 : 0.5 + 0.5 * Math.sin((r.time || 0) * 5);
    ctx.fillStyle = `rgba(255,60,40,${0.25 + 0.6 * corePulse})`;
    ctx.beginPath(); ctx.arc(0, -T * 0.02, T * 0.035, 0, P2); ctx.fill();

    // Skull: squared cranium, hard jaw, two burning eyes
    g = ctx.createLinearGradient(0, -T * 0.42, 0, -T * 0.18);
    g.addColorStop(0, light); g.addColorStop(1, mid);
    ctx.fillStyle = g;
    this.rr(ctx, -T * 0.12, -T * 0.42, T * 0.24, T * 0.2, T * 0.05);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(-T * 0.09, -T * 0.24, T * 0.18, T * 0.05);   // jaw grille
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const x = -T * 0.06 + i * T * 0.06;
      ctx.beginPath(); ctx.moveTo(x, -T * 0.24); ctx.lineTo(x, -T * 0.19); ctx.stroke();
    }
    // Eyes
    const eyeA = r.dormant ? 0.12 : 0.85 + 0.15 * Math.sin((r.time || 0) * 7);
    for (const s of [-1, 1]) {
      ctx.fillStyle = `rgba(255,40,30,${eyeA})`;
      ctx.beginPath(); ctx.arc(s * T * 0.055, -T * 0.33, T * 0.028, 0, P2); ctx.fill();
      if (!r.dormant) {
        ctx.globalCompositeOperation = 'lighter';
        const egl = ctx.createRadialGradient(s * T * 0.055, -T * 0.33, 0, s * T * 0.055, -T * 0.33, T * 0.09);
        egl.addColorStop(0, 'rgba(255,50,30,0.5)');
        egl.addColorStop(1, 'rgba(255,50,30,0)');
        ctx.fillStyle = egl;
        ctx.fillRect(s * T * 0.055 - T * 0.09, -T * 0.42, T * 0.18, T * 0.18);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Gun arm: shoulder joint, forearm, laser pistol tracking the pod
    const aim = r.facing < 0 ? Math.PI - (r.aim || 0) : (r.aim || 0);
    ctx.save();
    ctx.translate(T * 0.12, -T * 0.12);
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.arc(0, 0, T * 0.05, 0, P2); ctx.fill();
    ctx.rotate(r.dormant ? Math.PI / 2.3 : aim);
    ctx.strokeStyle = mid;
    ctx.lineWidth = Math.max(2, T * 0.05);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(T * 0.16, 0); ctx.stroke();
    // Pistol: slab body + emitter
    ctx.fillStyle = dark;
    this.rr(ctx, T * 0.13, -T * 0.045, T * 0.16, T * 0.09, T * 0.02);
    ctx.fill();
    ctx.fillStyle = r.dormant ? '#3a2020' : '#ff4a30';
    ctx.beginPath(); ctx.arc(T * 0.3, 0, T * 0.025, 0, P2); ctx.fill();
    ctx.restore();

    // Off arm swings with the gait
    ctx.strokeStyle = mid;
    ctx.lineWidth = Math.max(2, T * 0.05);
    ctx.beginPath();
    ctx.moveTo(-T * 0.13, -T * 0.12);
    ctx.lineTo(-T * 0.13 - ph * T * 0.07, T * 0.06);
    ctx.stroke();

    // Molten sheen: past half-cooked the seams glow and the surface shimmers
    if (heat > 0.35) {
      ctx.globalCompositeOperation = 'lighter';
      const mg = ctx.createRadialGradient(0, -T * 0.1, T * 0.02, 0, -T * 0.05, T * 0.5);
      mg.addColorStop(0, `rgba(255,200,120,${0.5 * (heat - 0.35)})`);
      mg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(-T * 0.5, -T * 0.55, T, T * 1.1);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();   // end crouch transform

    ctx.restore();
  },

  drawBoss(ctx, sx, sy, boss) {
    const T = C.TILE;
    ctx.save();
    ctx.translate(sx, sy);
    if (boss.facing < 0) ctx.scale(-1, 1);
    const t = boss.animTime;
    const breathe = Math.sin(t * 2.2) * T * 0.05;
    const flash = boss.hitFlash > 0;

    if (boss.form === 1) {
      // --- FORM 1: Mark Zucker-ore, CEO — grey tee, khakis, sneakers, phone ---
      const h = T * 3.2, w = T * 1.3;
      ctx.translate(0, breathe);
      const ft = boss.betweenForms ? boss.faceFallT : -1;

      // Sneakers: white with green heel stripes
      const sneaker = (sx2, scale) => {
        const s = scale || 1;
        ctx.fillStyle = flash ? '#fff' : '#f0efe8';
        this.rr(ctx, sx2 - T * 0.16 * s, -T * 0.16 * s, T * 0.46 * s, T * 0.16 * s, T * 0.06 * s);
        ctx.fill();
        ctx.fillStyle = '#3a8a4a';
        ctx.fillRect(sx2 - T * 0.13 * s, -T * 0.14 * s, T * 0.05 * s, T * 0.1 * s);
        ctx.fillRect(sx2 - T * 0.05 * s, -T * 0.14 * s, T * 0.05 * s, T * 0.1 * s);
      };
      // Khaki slacks — seated over the chair while waiting, standing otherwise
      ctx.fillStyle = flash ? '#fff' : '#b3a077';
      if (boss.waiting) {
        ctx.fillRect(-w * 0.22, -T * 1.04, T * 0.72, T * 0.26);   // thighs forward
        ctx.fillRect(T * 0.3, -T * 0.8, T * 0.26, T * 0.8);       // shins down
        sneaker(T * 0.44);
        ctx.translate(0, T * 0.34);   // settle the torso into the chair
      } else {
        ctx.fillRect(-w * 0.3, -h * 0.38, w * 0.24, h * 0.34);
        ctx.fillRect(w * 0.06, -h * 0.38, w * 0.24, h * 0.34);
        sneaker(-w * 0.18); sneaker(w * 0.18);
      }
      // The grey crew-neck
      const tee = ctx.createLinearGradient(0, -h * 0.85, 0, -h * 0.3);
      tee.addColorStop(0, flash ? '#fff' : '#8a8f98');
      tee.addColorStop(1, flash ? '#ddd' : '#5e636c');
      ctx.fillStyle = tee;
      this.rr(ctx, -w / 2, -h * 0.84, w, h * 0.5, T * 0.14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,32,38,0.5)';
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      ctx.beginPath(); ctx.arc(0, -h * 0.84, T * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

      // Front arm + phone: raised while doomscrolling or firing the KPI beam,
      // otherwise hanging at his side. Slack during the face-off cinematic.
      const phoneUp = (boss.waiting || boss.attack === 'laser') && ft < 0;
      ctx.strokeStyle = flash ? '#fff' : '#6e737c';
      ctx.lineWidth = T * 0.16;
      ctx.lineCap = 'round';
      const shX = w * 0.36, shY = -h * 0.76;
      if (phoneUp) {
        const px = T * 0.55, py = -h * 0.66;
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.quadraticCurveTo(w * 0.62, -h * 0.6, px, py); ctx.stroke();
        // The phone itself
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-0.35);
        ctx.fillStyle = '#16181d';
        this.rr(ctx, -T * 0.07, -T * 0.16, T * 0.14, T * 0.3, T * 0.03);
        ctx.fill();
        const scr = ctx.createLinearGradient(0, -T * 0.14, 0, T * 0.12);
        const glow = boss.attack === 'laser' ? 1 : 0.55 + 0.25 * Math.sin(t * 2.7);
        scr.addColorStop(0, `rgba(150,200,255,${glow})`);
        scr.addColorStop(1, `rgba(60,110,230,${glow * 0.8})`);
        ctx.fillStyle = scr;
        this.rr(ctx, -T * 0.05, -T * 0.13, T * 0.1, T * 0.24, T * 0.02);
        ctx.fill();
        ctx.restore();
        // Screen light spilling onto the face
        if (boss.waiting) {
          const spill = ctx.createRadialGradient(px, py, T * 0.03, px, py, T * 0.7);
          spill.addColorStop(0, `rgba(140,190,255,${0.2 + 0.1 * Math.sin(t * 2.7)})`);
          spill.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = spill;
          ctx.beginPath(); ctx.arc(px, py, T * 0.7, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(w * 0.46, -h * 0.42); ctx.stroke();
      }

      // The headset throw: he pulls a VR headset from behind his back,
      // hoists it overhead, and lets it fly
      if (boss.attack === 'headset') {
        const u = Math.min(1, boss.attackT / 0.55);
        if (boss.attackT <= 0.55) {
          const hx = -w * 0.55 + (w * 0.62) * u * u;
          const hy = -h * 0.38 - (h * 0.74) * u;
          ctx.strokeStyle = flash ? '#fff' : '#6e737c';
          ctx.lineWidth = T * 0.15;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-w * 0.34, -h * 0.74);
          ctx.quadraticCurveTo(-w * 0.72, -h * 0.55, hx, hy);
          ctx.stroke();
          ctx.fillStyle = flash ? '#fff' : '#e8c9a8';
          ctx.beginPath(); ctx.arc(hx, hy, T * 0.07, 0, Math.PI * 2); ctx.fill();
          Sprites.drawVrHeadset(ctx, hx, hy - T * 0.12, u * 2.2, 0.85);
        } else {
          // Follow-through: arm flung forward
          ctx.strokeStyle = flash ? '#fff' : '#6e737c';
          ctx.lineWidth = T * 0.15;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-w * 0.34, -h * 0.74);
          ctx.quadraticCurveTo(w * 0.2, -h * 1.05, w * 0.62, -h * 0.92);
          ctx.stroke();
        }
      }

      // The NDA binder slam (melee): a corporate brick of paperwork
      if (boss.attack === 'cane') {
        const swing = Math.sin(boss.attackT * 12) * 0.8;
        ctx.save();
        ctx.translate(-w * 0.42, -h * 0.72);
        ctx.rotate(swing);
        ctx.strokeStyle = flash ? '#fff' : '#6e737c';
        ctx.lineWidth = T * 0.14;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, T * 0.75); ctx.stroke();
        ctx.translate(0, T * 0.95);
        ctx.rotate(0.2);
        ctx.fillStyle = '#e8e4da';
        this.rr(ctx, -T * 0.3, -T * 0.22, T * 0.6, T * 0.44, T * 0.04);
        ctx.fill();
        ctx.fillStyle = '#8a1520';
        ctx.fillRect(-T * 0.3, -T * 0.22, T * 0.09, T * 0.44);
        ctx.strokeStyle = 'rgba(40,40,45,0.5)';
        ctx.lineWidth = Math.max(1, T * 0.015);
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(-T * 0.16, -T * 0.22 + i * T * 0.11); ctx.lineTo(T * 0.26, -T * 0.22 + i * T * 0.11); ctx.stroke();
        }
        ctx.restore();
      }

      const headY = -h * 0.92;
      const burning = (boss.mwBurnT || 0) > 0 && ft < 0;
      if (ft < 0) {
        // Human(ish) head: pale polymer skin, Caesar fringe, unblinking stare
        ctx.fillStyle = flash ? '#fff' : '#e8c9a8';
        ctx.beginPath(); ctx.arc(0, headY, T * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flash ? '#eee' : '#4a3626';
        ctx.beginPath(); ctx.arc(0, headY, T * 0.34, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
        ctx.fillRect(-T * 0.34, headY - T * 0.2, T * 0.68, T * 0.1);
        if (burning) {
          // The polymer face DOES have a panic expression. It was expensive.
          for (const s of [-1, 1]) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(s * T * 0.13, headY + T * 0.01, T * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2c3a52';
            ctx.beginPath(); ctx.arc(s * T * 0.13, headY - T * 0.02, T * 0.026, 0, Math.PI * 2); ctx.fill();
            // Eyebrows way up
            ctx.strokeStyle = 'rgba(60,45,32,0.9)';
            ctx.lineWidth = Math.max(1.5, T * 0.028);
            ctx.beginPath();
            ctx.moveTo(s * T * 0.05, headY - T * 0.16);
            ctx.lineTo(s * T * 0.2, headY - T * 0.13);
            ctx.stroke();
          }
          // Screaming mouth, wobbling with the flames
          ctx.fillStyle = '#3a1614';
          ctx.beginPath();
          ctx.ellipse(T * 0.01, headY + T * 0.19, T * 0.09, T * 0.12 + Math.sin(t * 18) * T * 0.02, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#a84a42';
          ctx.beginPath(); ctx.ellipse(T * 0.01, headY + T * 0.24, T * 0.05, T * 0.04, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          // Wide unblinking eyes — the right one has that little red glint
          for (const s of [-1, 1]) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(s * T * 0.13, headY + T * 0.02, T * 0.075, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2c3a52';
            ctx.beginPath(); ctx.arc(s * T * 0.13 + T * 0.02, headY + T * 0.02, T * 0.035, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#ff3a2a';
          ctx.beginPath(); ctx.arc(T * 0.15, headY + T * 0.01, T * 0.016, 0, Math.PI * 2); ctx.fill();
          if (boss.attack === 'chant') {
            // Mid-chant: mouth wide open, projecting the letters
            ctx.fillStyle = '#3a1614';
            ctx.beginPath();
            ctx.ellipse(T * 0.02, headY + T * 0.19, T * 0.08, T * 0.1 + Math.sin(t * 22) * T * 0.02, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // A perfectly neutral mouth
            ctx.strokeStyle = 'rgba(90,60,45,0.8)';
            ctx.lineWidth = Math.max(1.5, T * 0.025);
            ctx.beginPath(); ctx.moveTo(-T * 0.08, headY + T * 0.18); ctx.lineTo(T * 0.1, headY + T * 0.18); ctx.stroke();
          }
        }
        // On fire like a spectre: flame tongues licking up the tee and fringe
        if (burning) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const spots = [[-w * 0.32, -h * 0.4], [w * 0.3, -h * 0.5], [0, -h * 0.64], [-w * 0.16, -h * 0.85], [w * 0.08, headY - T * 0.24]];
          for (let i = 0; i < spots.length; i++) {
            const wob = Math.sin(t * 9 + i * 2.4);
            const fh = T * (0.36 + 0.12 * wob);
            const fx0 = spots[i][0] + Math.sin(t * 5 + i) * T * 0.03, fy0 = spots[i][1];
            ctx.fillStyle = 'rgba(255,120,30,0.7)';
            ctx.beginPath();
            ctx.moveTo(fx0 - T * 0.1, fy0);
            ctx.quadraticCurveTo(fx0 - T * 0.11, fy0 - fh * 0.55, fx0 + wob * T * 0.07, fy0 - fh);
            ctx.quadraticCurveTo(fx0 + T * 0.11, fy0 - fh * 0.55, fx0 + T * 0.1, fy0);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,225,130,0.8)';
            ctx.beginPath();
            ctx.moveTo(fx0 - T * 0.05, fy0);
            ctx.quadraticCurveTo(fx0 - T * 0.05, fy0 - fh * 0.35, fx0 + wob * T * 0.04, fy0 - fh * 0.6);
            ctx.quadraticCurveTo(fx0 + T * 0.05, fy0 - fh * 0.35, fx0 + T * 0.05, fy0);
            ctx.fill();
          }
          ctx.restore();
        }
      } else {
        // FACE-OFF CINEMATIC: chrome skull under the mask, eyes booting up
        this.bossSkull(ctx, T, 0, headY, t, flash, ft > 1.1 && (ft > 1.9 || Math.sin(ft * 34) > -0.2), true);
        // The $2.3B face, tumbling to the floor
        const p = Math.min(1, ft / 0.85);
        const mx = T * 0.55 * p;
        const my = headY + (Math.abs(headY) - T * 0.14) * p * p;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(p * 2.8);
        ctx.fillStyle = '#e8c9a8';
        ctx.beginPath(); ctx.arc(0, 0, T * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a3626';
        ctx.beginPath(); ctx.arc(0, 0, T * 0.32, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
        ctx.fillRect(-T * 0.32, -T * 0.19, T * 0.64, T * 0.09);
        // Empty eye holes
        ctx.fillStyle = '#1a1216';
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(s * T * 0.13, T * 0.02, T * 0.06, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    } else {
      // --- FORM 2: ZUCKER-TRON 9000 — chrome endoskeleton, shirt in tatters,
      // infinity-core chest… and he kept the sneakers on ---
      const h = T * 3.8, w = T * 2.2;
      ctx.translate(0, breathe);
      // Piston legs
      for (const s of [-1, 1]) {
        ctx.fillStyle = flash ? '#fff' : '#4a4f57';
        ctx.fillRect(s * w * 0.28 - T * 0.11, -h * 0.42, T * 0.22, h * 0.2);
        ctx.fillStyle = flash ? '#eee' : '#7c828c';
        ctx.fillRect(s * w * 0.28 - T * 0.07, -h * 0.24, T * 0.14, h * 0.24);
        // Piston highlight
        ctx.fillStyle = 'rgba(220,230,240,0.5)';
        ctx.fillRect(s * w * 0.28 - T * 0.02, -h * 0.24, T * 0.03, h * 0.22);
        // Knee servo
        ctx.fillStyle = flash ? '#fff' : '#31353b';
        ctx.beginPath(); ctx.arc(s * w * 0.28, -h * 0.23, T * 0.09, 0, Math.PI * 2); ctx.fill();
        // Still wearing the sneakers (they were comfortable)
        ctx.fillStyle = flash ? '#fff' : '#f0efe8';
        this.rr(ctx, s * w * 0.28 - T * 0.2, -T * 0.19, T * 0.56, T * 0.19, T * 0.07);
        ctx.fill();
        ctx.fillStyle = '#3a8a4a';
        ctx.fillRect(s * w * 0.28 - T * 0.16, -T * 0.16, T * 0.06, T * 0.12);
        ctx.fillRect(s * w * 0.28 - T * 0.06, -T * 0.16, T * 0.06, T * 0.12);
      }
      // Chrome torso
      const torso = ctx.createLinearGradient(0, -h * 0.9, 0, -h * 0.3);
      torso.addColorStop(0, flash ? '#fff' : '#8a9099');
      torso.addColorStop(1, flash ? '#ccc' : '#3f444c');
      ctx.fillStyle = torso;
      this.rr(ctx, -w / 2, -h * 0.88, w, h * 0.52, T * 0.22);
      ctx.fill();
      // Panel seams + rivets
      ctx.strokeStyle = '#31353b';
      ctx.lineWidth = 2;
      for (const px of [-w * 0.25, 0, w * 0.25]) {
        ctx.beginPath(); ctx.moveTo(px, -h * 0.88); ctx.lineTo(px, -h * 0.36); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(230,240,250,0.4)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(-w * 0.38 + i * w * 0.25, -h * 0.82, Math.max(1, T * 0.02), 0, Math.PI * 2); ctx.fill();
      }
      // Shreds of the grey crew-neck still snagged on the shoulders
      ctx.fillStyle = flash ? '#ddd' : '#6a6f78';
      for (const [tx, tw2, tl] of [[-w * 0.46, T * 0.22, T * 0.5], [-w * 0.2, T * 0.16, T * 0.34], [w * 0.3, T * 0.2, T * 0.42]]) {
        ctx.beginPath();
        ctx.moveTo(tx, -h * 0.88);
        ctx.lineTo(tx + tw2, -h * 0.88);
        ctx.lineTo(tx + tw2 * 0.5 + Math.sin(t * 3 + tx) * T * 0.04, -h * 0.88 + tl);
        ctx.closePath();
        ctx.fill();
      }
      // Infinity core: the company logo, load-bearing
      const pulse = 0.6 + 0.4 * Math.sin(t * 4);
      ctx.save();
      ctx.shadowColor = '#4a9eff';
      ctx.shadowBlur = 14 * pulse;
      ctx.strokeStyle = `rgba(190,224,255,${0.75 + 0.25 * pulse})`;
      ctx.lineWidth = T * 0.075;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(s * T * 0.15, -h * 0.62, T * 0.13, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      // Skull (shared with the face-off cinematic), fully booted
      this.bossSkull(ctx, T, 0, -h * 0.97, t, flash, true, false);
      // Claw arm (attacks)
      if (boss.attack === 'claw') {
        const ext = Math.sin(Math.min(Math.PI, boss.attackT * 4)) * T * 2.4;
        ctx.strokeStyle = flash ? '#fff' : '#6e747c';
        ctx.lineWidth = T * 0.16;
        ctx.beginPath();
        ctx.moveTo(w * 0.45, -h * 0.65);
        ctx.lineTo(w * 0.45 + ext, -h * 0.55);
        ctx.stroke();
        ctx.fillStyle = '#9aa0a8';
        for (const a of [-0.5, 0, 0.5]) {
          ctx.save();
          ctx.translate(w * 0.45 + ext, -h * 0.55);
          ctx.rotate(a + Math.sin(t * 20) * 0.2);
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(T * 0.5, -T * 0.1); ctx.lineTo(T * 0.42, T * 0.12);
          ctx.fill();
          ctx.restore();
        }
      }
      // Under the beam the chrome sears molten, same as the security automatons
      if ((boss.mwBurnT || 0) > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const mg = ctx.createRadialGradient(0, -h * 0.6, T * 0.05, 0, -h * 0.55, T * 1.6);
        mg.addColorStop(0, 'rgba(255,200,120,0.5)');
        mg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(-w * 0.8, -h * 1.2, w * 1.6, h * 1.25);
        // Panel seams glowing hot
        ctx.strokeStyle = `rgba(255,170,80,${0.6 + 0.3 * Math.sin(t * 14)})`;
        ctx.lineWidth = 2.5;
        for (const px of [-w * 0.25, 0, w * 0.25]) {
          ctx.beginPath(); ctx.moveTo(px, -h * 0.88); ctx.lineTo(px, -h * 0.36); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  },

  // The corner office set: a big leather chair (drawn BEHIND the boss)…
  drawBossChair(ctx, sx, sy, t) {
    const T = C.TILE;
    ctx.save();
    ctx.translate(sx, sy);
    // Caster base: column + star feet + wheels
    ctx.strokeStyle = '#2c2f36';
    ctx.lineWidth = T * 0.09;
    ctx.beginPath(); ctx.moveTo(-T * 0.28, -T * 0.88); ctx.lineTo(-T * 0.28, -T * 0.18); ctx.stroke();
    ctx.lineWidth = T * 0.06;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-T * 0.28, -T * 0.18);
      ctx.lineTo(-T * 0.28 + s * T * 0.34, -T * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#191b20';
      ctx.beginPath(); ctx.arc(-T * 0.28 + s * T * 0.34, -T * 0.05, T * 0.055, 0, Math.PI * 2); ctx.fill();
    }
    // Seat + tall leather back with headrest
    const leather = ctx.createLinearGradient(-T * 1.15, 0, -T * 0.4, 0);
    leather.addColorStop(0, '#191b22'); leather.addColorStop(1, '#31353f');
    ctx.fillStyle = leather;
    this.rr(ctx, -T * 1.0, -T * 1.06, T * 1.5, T * 0.26, T * 0.1);   // seat
    ctx.fill();
    this.rr(ctx, -T * 1.18, -T * 2.85, T * 0.48, T * 2.0, T * 0.18); // back
    ctx.fill();
    this.rr(ctx, -T * 1.12, -T * 3.02, T * 0.4, T * 0.3, T * 0.12);  // headrest
    ctx.fill();
    // Stitch lines
    ctx.strokeStyle = 'rgba(120,128,140,0.25)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-T * 1.14, -T * 2.85 + i * T * 0.5);
      ctx.lineTo(-T * 0.74, -T * 2.85 + i * T * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  },

  // …and the executive desk (drawn IN FRONT), monitor logo, coffee and all
  drawBossDesk(ctx, sx, sy, t) {
    const T = C.TILE;
    ctx.save();
    ctx.translate(sx, sy);
    // Side panels
    const wood = ctx.createLinearGradient(0, -T * 1.28, 0, 0);
    wood.addColorStop(0, '#5a4028'); wood.addColorStop(1, '#332416');
    ctx.fillStyle = '#42301e';
    ctx.fillRect(T * 0.92, -T * 1.14, T * 0.16, T * 1.14);
    ctx.fillRect(T * 2.42, -T * 1.14, T * 0.16, T * 1.14);
    // Desktop slab
    ctx.fillStyle = wood;
    this.rr(ctx, T * 0.72, -T * 1.3, T * 2.05, T * 0.18, T * 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,170,0.14)';
    ctx.fillRect(T * 0.72, -T * 1.3, T * 2.05, T * 0.045);
    // Monitor, back to the room, company logo glowing on the shell
    ctx.fillStyle = '#191b20';
    ctx.fillRect(T * 1.95, -T * 1.44, T * 0.34, T * 0.16);          // stand
    this.rr(ctx, T * 1.7, -T * 2.06, T * 0.84, T * 0.66, T * 0.08); // shell
    ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.2);
    ctx.save();
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 10 * pulse;
    ctx.strokeStyle = `rgba(150,200,255,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = Math.max(1.5, T * 0.035);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(T * 2.12 + s * T * 0.09, -T * 1.74, T * 0.075, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Coffee mug with steam
    ctx.fillStyle = '#c8d0da';
    this.rr(ctx, T * 1.14, -T * 1.5, T * 0.2, T * 0.2, T * 0.03);
    ctx.fill();
    ctx.strokeStyle = '#c8d0da';
    ctx.lineWidth = Math.max(1.5, T * 0.03);
    ctx.beginPath(); ctx.arc(T * 1.37, -T * 1.4, T * 0.06, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,230,240,0.35)';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath();
    ctx.moveTo(T * 1.24, -T * 1.54);
    ctx.quadraticCurveTo(T * (1.24 + 0.05 * Math.sin(t * 2.5)), -T * 1.68, T * 1.24, -T * 1.82);
    ctx.stroke();
    // A thin stack of NDAs
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(T * 2.62, -T * 1.36, T * 0.34, T * 0.06);
    ctx.restore();
  },

  // Hell's bedrock, reimagined: 2x2-tile glass cubicles holding the missing
  // tech bros — trapped, exhausted, and still shipping code. Seeded per cell
  // so hair, hoodie, facing, props and posture all vary down the hallway.
  drawHellCubicle(ctx, sx, sy, cx, cy, t) {
    const T = C.TILE, W = T * 2, H = T * 2;
    let h = (cx * 374761393 + cy * 668265263) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    const rnd = k => ((h >> (k % 23)) & 255) / 255;
    const facing = rnd(3) < 0.5 ? 1 : -1;
    const skin = ['#e8c9a8', '#c9a077', '#8a6244', '#f0d6b8', '#a87b52'][Math.floor(rnd(5) * 5) % 5];
    const hood = ['#3a4152', '#2c2f36', '#454b3a', '#4a3040', '#37474f', '#5a2e2e'][Math.floor(rnd(7) * 6) % 6];
    const hairC = ['#2c2018', '#4a3626', '#151312', '#6a4a28', '#3d3d42'][Math.floor(rnd(9) * 5) % 5];
    const hairStyle = Math.floor(rnd(13) * 3) % 3;   // 0 messy, 1 flat, 2 beanie
    const phase = rnd(11) * 6.28;

    ctx.save();
    ctx.translate(sx, sy);
    // Room shell
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#14161d'); g.addColorStop(1, '#1d2028');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#23262e';
    ctx.fillRect(0, H - T * 0.18, W, T * 0.18);   // floor
    // Weak ceiling light + cone
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(W / 2 - T * 0.18, T * 0.06, T * 0.36, T * 0.05);
    g = ctx.createLinearGradient(0, T * 0.1, 0, H * 0.8);
    g.addColorStop(0, `rgba(220,230,210,${0.06 + 0.02 * Math.sin(t * 11 + phase)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(W / 2 - T * 0.15, T * 0.11);
    ctx.lineTo(W / 2 + T * 0.15, T * 0.11);
    ctx.lineTo(W / 2 + T * 0.55, H * 0.8);
    ctx.lineTo(W / 2 - T * 0.55, H * 0.8);
    ctx.fill();

    // Mirror everything room-side around the center for facing variety
    ctx.save();
    ctx.translate(W / 2, 0);
    ctx.scale(facing, 1);
    ctx.translate(-W / 2, 0);

    // Wall decor on the wall behind the bro: tally marks or a poster
    const decor = Math.floor(rnd(17) * 3) % 3;
    if (decor === 0) {
      // Days counted in chalk
      ctx.strokeStyle = 'rgba(200,205,215,0.35)';
      ctx.lineWidth = Math.max(1, T * 0.02);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(T * 0.22 + i * T * 0.07, T * 0.5);
        ctx.lineTo(T * 0.24 + i * T * 0.07, T * 0.72);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(T * 0.18, T * 0.7); ctx.lineTo(T * 0.5, T * 0.54); ctx.stroke();
    } else if (decor === 1) {
      // Motivational poster, mandatory
      ctx.fillStyle = '#2c3a52';
      ctx.fillRect(T * 0.16, T * 0.42, T * 0.5, T * 0.36);
      ctx.fillStyle = '#7fb4e8';
      ctx.font = `bold ${Math.round(T * 0.13)}px Verdana`;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(T * 0.41, 0);
      ctx.scale(facing, 1);   // undo the room mirror so the words read forward
      ctx.fillText('SHIP', 0, T * 0.57);
      ctx.fillText('IT', 0, T * 0.71);
      ctx.restore();
    } else {
      // The company logo, watching
      ctx.strokeStyle = `rgba(120,170,255,${0.3 + 0.15 * Math.sin(t * 2 + phase)})`;
      ctx.lineWidth = Math.max(1.5, T * 0.035);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(T * 0.4 + s * T * 0.08, T * 0.56, T * 0.07, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Ceiling security camera — one per employee, tilted at the desk,
    // recording light blinking
    ctx.save();
    ctx.translate(T * 0.14, T * 0.18);
    ctx.strokeStyle = '#2c2f36';
    ctx.lineWidth = T * 0.045;
    ctx.beginPath(); ctx.moveTo(0, -T * 0.08); ctx.lineTo(T * 0.08, T * 0.04); ctx.stroke();
    ctx.rotate(0.5);
    ctx.fillStyle = '#31353f';
    Sprites.rr(ctx, T * 0.02, 0, T * 0.28, T * 0.13, T * 0.04);
    ctx.fill();
    ctx.fillStyle = '#16181d';
    ctx.fillRect(T * 0.28, T * 0.015, T * 0.06, T * 0.1);
    ctx.fillStyle = Math.sin(t * 3.1 + phase) > 0 ? '#ff3a2a' : '#5a1f1a';
    ctx.beginPath(); ctx.arc(T * 0.075, T * 0.045, T * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // "AI TOKENS USED" wall counter, ticking ever upward
    ctx.fillStyle = '#101216';
    Sprites.rr(ctx, T * 0.86, T * 0.28, T * 0.78, T * 0.34, T * 0.04);
    ctx.fill();
    ctx.strokeStyle = '#2c2f36';
    ctx.lineWidth = Math.max(1, T * 0.02);
    Sprites.rr(ctx, T * 0.86, T * 0.28, T * 0.78, T * 0.34, T * 0.04);
    ctx.stroke();
    const toks = (1000000 + Math.floor(rnd(2) * 9000000) + Math.floor(t * (35 + rnd(10) * 90))).toLocaleString();
    ctx.save();
    ctx.translate(T * 1.25, 0);
    ctx.scale(facing, 1);   // counter-flip so the readout reads forward
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7fe8a0';
    ctx.font = `bold ${Math.round(T * 0.082)}px Verdana`;
    ctx.fillText('AI TOKENS USED', 0, T * 0.4);
    ctx.font = `bold ${Math.round(T * 0.125)}px Verdana`;
    ctx.fillText(toks, 0, T * 0.56);
    ctx.restore();

    // Everything on the floor is scaled down so the bros read closer to
    // pod size (the motivational signage stays full-size, as is tradition)
    ctx.save();
    ctx.translate(T * 0.85, H - T * 0.18);
    ctx.scale(0.78, 0.78);
    ctx.translate(-T * 0.85, -(H - T * 0.18));

    // Desk with laptop, cups, cans — bro sits on the right, faces left
    const deskY = H - T * 0.62;
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(T * 0.14, deskY, T * 0.95, T * 0.08);
    ctx.fillStyle = '#2c241a';
    ctx.fillRect(T * 0.2, deskY + T * 0.08, T * 0.07, T * 0.36);
    ctx.fillRect(T * 0.96, deskY + T * 0.08, T * 0.07, T * 0.36);
    // Laptop: base + screen tilted toward the bro, glow + crawling code lines
    ctx.fillStyle = '#20242c';
    ctx.fillRect(T * 0.52, deskY - T * 0.035, T * 0.42, T * 0.035);
    ctx.save();
    ctx.translate(T * 0.52, deskY - T * 0.02);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#191d24';
    ctx.fillRect(-T * 0.05, -T * 0.5, T * 0.08, T * 0.5);
    const flick = 0.75 + 0.15 * Math.sin(t * 13 + phase) + 0.1 * Math.sin(t * 31 + phase * 2);
    ctx.fillStyle = `rgba(140,190,240,${0.5 * flick})`;
    ctx.fillRect(T * 0.03, -T * 0.48, T * 0.045, T * 0.46);
    ctx.restore();
    // Screen light on the bro's face
    g = ctx.createRadialGradient(T * 0.6, deskY - T * 0.3, T * 0.03, T * 0.6, deskY - T * 0.3, T * 0.7);
    g.addColorStop(0, `rgba(140,190,240,${0.14 * flick})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, deskY - T, T * 1.6, T * 1.2);
    // Beverage graveyard
    const cups = 1 + Math.floor(rnd(19) * 3) % 3;
    for (let i = 0; i < cups; i++) {
      const cxp = T * (0.24 + i * 0.13);
      if (i % 2 === 0) {
        ctx.fillStyle = '#d8d3c8';
        ctx.fillRect(cxp, deskY - T * 0.13, T * 0.09, T * 0.13);
      } else {
        ctx.fillStyle = '#3a8a4a';
        ctx.fillRect(cxp, deskY - T * 0.15, T * 0.07, T * 0.15);
      }
    }
    // Steam off the freshest cup
    ctx.strokeStyle = 'rgba(220,230,240,0.22)';
    ctx.lineWidth = Math.max(1, T * 0.015);
    ctx.beginPath();
    ctx.moveTo(T * 0.28, deskY - T * 0.16);
    ctx.quadraticCurveTo(T * (0.28 + 0.04 * Math.sin(t * 2.2 + phase)), deskY - T * 0.28, T * 0.28, deskY - T * 0.4);
    ctx.stroke();

    // THE BRO. Slumped on a stool, running on caffeine and fear.
    const droopU = ((t / 3.4 + phase) % 1 + 1) % 1;
    const droop = (droopU < 0.75 ? Math.pow(droopU / 0.75, 2) : (1 - droopU) / 0.25) * T * 0.1;
    // Stool
    ctx.fillStyle = '#2c2f36';
    ctx.fillRect(T * 1.38, H - T * 0.48, T * 0.3, T * 0.06);
    ctx.fillRect(T * 1.5, H - T * 0.42, T * 0.07, T * 0.26);
    // Legs folded toward the desk
    ctx.fillStyle = '#31353f';
    ctx.fillRect(T * 1.08, H - T * 0.56, T * 0.42, T * 0.14);
    ctx.fillRect(T * 1.02, H - T * 0.46, T * 0.14, T * 0.3);
    // Slouched hoodie torso, leaning into the screen
    ctx.save();
    ctx.translate(T * 1.42, H - T * 0.52);
    ctx.rotate(-0.16 - droop * 0.012);
    ctx.fillStyle = hood;
    this.rr(ctx, -T * 0.3, -T * 0.72, T * 0.56, T * 0.76, T * 0.14);
    ctx.fill();
    // Hood bunched at the neck
    ctx.fillStyle = this.shade(hood, -0.25);
    ctx.beginPath(); ctx.arc(-T * 0.05, -T * 0.66, T * 0.14, Math.PI, 0); ctx.fill();
    // Typing forearms: alternating pecks at the keyboard
    ctx.strokeStyle = hood;
    ctx.lineWidth = T * 0.09;
    ctx.lineCap = 'round';
    for (const [i, armPh] of [[0, 0], [1, Math.PI / 2]]) {
      const bob = Math.abs(Math.sin(t * 9 + phase + armPh)) * T * 0.05;
      ctx.beginPath();
      ctx.moveTo(-T * 0.18, -T * 0.34 + i * T * 0.06);
      ctx.lineTo(-T * 0.62, -T * 0.1 - bob);
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(-T * 0.64, -T * 0.09 - bob, T * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    // Head, drooping with exhaustion then snapping back up
    ctx.translate(-T * 0.04, -T * 0.78 + droop);
    ctx.rotate(-droop * 0.025);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, 0, T * 0.2, 0, Math.PI * 2); ctx.fill();
    // Hair / beanie
    if (hairStyle === 2) {
      ctx.fillStyle = ['#7a3a3a', '#3a5a7a', '#4a4a30'][Math.floor(rnd(21) * 3) % 3];
      ctx.beginPath(); ctx.arc(0, -T * 0.04, T * 0.2, Math.PI * 1.0, Math.PI * 2.0); ctx.fill();
      ctx.fillRect(-T * 0.2, -T * 0.08, T * 0.4, T * 0.05);
    } else {
      ctx.fillStyle = hairC;
      ctx.beginPath(); ctx.arc(0, -T * 0.03, T * 0.2, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      if (hairStyle === 0) {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(-T * 0.14 + i * T * 0.09, -T * 0.16);
          ctx.lineTo(-T * 0.1 + i * T * 0.09, -T * 0.3 - (i % 2) * T * 0.04);
          ctx.lineTo(-T * 0.06 + i * T * 0.09, -T * 0.16);
          ctx.fill();
        }
      }
    }
    // Profile face: half-lidded eye, heavy bag, flat mouth
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-T * 0.09, T * 0.0, T * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c3a52';
    ctx.beginPath(); ctx.arc(-T * 0.1, T * 0.005, T * 0.022, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.fillRect(-T * 0.14, -T * 0.045, T * 0.1, T * 0.028);   // heavy eyelid
    ctx.strokeStyle = 'rgba(80,60,90,0.55)';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath(); ctx.arc(-T * 0.09, T * 0.05, T * 0.05, 0.2, Math.PI - 0.4); ctx.stroke();   // eye bag
    ctx.beginPath(); ctx.moveTo(-T * 0.16, T * 0.12); ctx.lineTo(-T * 0.06, T * 0.12); ctx.stroke();  // mouth
    ctx.restore();

    ctx.restore();   // end floor-scale group
    ctx.restore();   // end facing mirror

    // Glass front: sheen streaks and, in some cells, a smudged handprint
    ctx.save();
    g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0.15, 'rgba(200,220,255,0)');
    g.addColorStop(0.3, 'rgba(200,220,255,0.07)');
    g.addColorStop(0.38, 'rgba(200,220,255,0)');
    g.addColorStop(0.6, 'rgba(200,220,255,0.05)');
    g.addColorStop(0.72, 'rgba(200,220,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (rnd(15) < 0.55) {
      const hx = T * (0.4 + rnd(6) * 1.1), hy = T * (0.5 + rnd(8) * 0.9);
      ctx.fillStyle = 'rgba(220,230,245,0.09)';
      ctx.beginPath(); ctx.ellipse(hx, hy, T * 0.09, T * 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(hx - T * 0.07 + i * T * 0.05, hy - T * 0.15, T * 0.026, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Cell frame + hell's red cast so the band still sits in the scene
    ctx.fillStyle = 'rgba(60,10,5,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#0c0d11';
    ctx.lineWidth = Math.max(2, T * 0.09);
    ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = '#3a3f47';
    ctx.lineWidth = Math.max(1.5, T * 0.045);
    ctx.strokeRect(T * 0.05, T * 0.05, W - T * 0.1, H - T * 0.1);
    ctx.restore();
  },

  // A consumer VR headset: pale shell, dark visor with two faint lenses,
  // head strap arcing behind. Drawn spinning when airborne.
  drawVrHeadset(ctx, sx, sy, rot, scale) {
    const T = C.TILE * (scale || 1);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot || 0);
    // Strap
    ctx.strokeStyle = '#3a3f47';
    ctx.lineWidth = T * 0.055;
    ctx.beginPath();
    ctx.arc(T * 0.16, 0, T * 0.19, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
    // Shell
    const g = ctx.createLinearGradient(0, -T * 0.14, 0, T * 0.14);
    g.addColorStop(0, '#f0f1f4'); g.addColorStop(1, '#b8bdc6');
    ctx.fillStyle = g;
    Sprites.rr(ctx, -T * 0.26, -T * 0.15, T * 0.44, T * 0.3, T * 0.09);
    ctx.fill();
    // Visor face
    ctx.fillStyle = '#16181d';
    Sprites.rr(ctx, -T * 0.26, -T * 0.12, T * 0.14, T * 0.24, T * 0.06);
    ctx.fill();
    // Lens glints
    ctx.fillStyle = 'rgba(125,224,255,0.7)';
    ctx.beginPath(); ctx.arc(-T * 0.19, -T * 0.05, T * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-T * 0.19, T * 0.05, T * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  // A dead miner's pod, half-buried where its last run ended: scorched hull,
  // cracked dome, thrown tread. The emergency beacon blinks until the black
  // box is recovered.
  drawWreck(ctx, sx, sy, t, looted) {
    const T = C.TILE;
    ctx.save();
    ctx.translate(sx, sy + T * 0.18);
    ctx.rotate(-0.16);
    // Dust drift piled against the hull
    ctx.fillStyle = 'rgba(122,78,48,0.9)';
    ctx.beginPath(); ctx.ellipse(0, T * 0.3, T * 0.62, T * 0.16, 0, Math.PI, 0); ctx.fill();
    // Thrown tread lying beside the pod
    ctx.fillStyle = '#3a3d44';
    this.rr(ctx, T * 0.42, T * 0.16, T * 0.42, T * 0.13, T * 0.06);
    ctx.fill();
    // Scorched hull: the familiar pod silhouette gone dark
    const hull = ctx.createLinearGradient(0, -T * 0.36, 0, T * 0.26);
    hull.addColorStop(0, '#7a5a28');
    hull.addColorStop(1, '#4a3418');
    ctx.fillStyle = hull;
    this.rr(ctx, -T * 0.44, -T * 0.2, T * 0.88, T * 0.46, T * 0.12);
    ctx.fill();
    // Scorch streaks
    ctx.fillStyle = 'rgba(20,14,10,0.55)';
    this.rr(ctx, -T * 0.34, -T * 0.06, T * 0.3, T * 0.28, T * 0.06);
    ctx.fill();
    // Cracked dome, dark inside
    ctx.fillStyle = '#1b2430';
    ctx.beginPath(); ctx.arc(T * 0.02, -T * 0.2, T * 0.24, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(140,180,205,0.5)';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath();
    ctx.moveTo(-T * 0.1, -T * 0.32);
    ctx.lineTo(T * 0.0, -T * 0.22);
    ctx.lineTo(-T * 0.06, -T * 0.12);
    ctx.moveTo(T * 0.0, -T * 0.22);
    ctx.lineTo(T * 0.1, -T * 0.18);
    ctx.stroke();
    // Bent drill nose, dug into the dirt
    ctx.fillStyle = '#6a7078';
    ctx.save();
    ctx.translate(-T * 0.5, T * 0.12);
    ctx.rotate(0.55);
    ctx.beginPath();
    ctx.moveTo(0, -T * 0.09); ctx.lineTo(-T * 0.3, 0); ctx.lineTo(0, T * 0.09);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Emergency beacon: blinking until the black box is pulled
    if (!looted) {
      const on = Math.sin(t * 3.4) > 0.55;
      ctx.fillStyle = on ? '#ff3a2a' : '#5a1f1a';
      ctx.beginPath(); ctx.arc(T * 0.3, -T * 0.3, T * 0.045, 0, Math.PI * 2); ctx.fill();
      if (on) {
        const g = ctx.createRadialGradient(T * 0.3, -T * 0.3, T * 0.02, T * 0.3, -T * 0.3, T * 0.4);
        g.addColorStop(0, 'rgba(255,60,40,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(T * 0.3, -T * 0.3, T * 0.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  },

  // The chrome skull under the polymer face. `lit`: red LEDs on (they stutter
  // while booting mid-cinematic). `small`: form-1 head scale during the
  // face-off. The Caesar fringe is PAINTED ON the metal — it came standard.
  bossSkull(ctx, T, cx, cy, t, flash, lit, small) {
    const r = small ? T * 0.32 : T * 0.4;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
    g.addColorStop(0, flash ? '#fff' : '#c2c8d0');
    g.addColorStop(0.6, flash ? '#eee' : '#8a9099');
    g.addColorStop(1, flash ? '#ccc' : '#4a4f57');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    // Painted-on fringe
    ctx.fillStyle = 'rgba(50,42,38,0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillRect(cx - r, cy - r * 0.55, r * 2, r * 0.24);
    // Jaw vents
    ctx.fillStyle = flash ? '#eee' : '#3a3f47';
    Sprites.rr(ctx, cx - r * 0.72, cy + r * 0.38, r * 1.44, r * 0.5, r * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,17,20,0.8)';
    ctx.lineWidth = Math.max(1, T * 0.016);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5 + i * r * 0.38, cy + r * 0.46);
      ctx.lineTo(cx - r * 0.5 + i * r * 0.38 + r * 0.22, cy + r * 0.76);
      ctx.stroke();
    }
    // Red LED eyes
    if (lit) {
      ctx.save();
      ctx.shadowColor = '#ff3020';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff5a3a';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(cx + s * r * 0.4, cy + r * 0.02, r * 0.16, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffd9c8';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(cx + s * r * 0.4, cy + r * 0.02, r * 0.06, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1216';
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.arc(cx + s * r * 0.4, cy + r * 0.02, r * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
  },
};
