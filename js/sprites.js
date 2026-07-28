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
    for (const key of Object.keys(C.MINERALS)) {
      this.minerals[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.minerals[key].push(this.makeMineral(key, b, S));
    }
    for (const key of Object.keys(C.ARTIFACTS)) {
      this.artifacts[key] = [];
      for (let b = 0; b < this.BANDS; b++) this.artifacts[key].push(this.makeArtifact(key, b, S));
    }
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
    // Pilot: suit, helmet, tinted visor
    ctx.fillStyle = '#c96a20';
    this.rr(ctx, -T * 0.06, -T * 0.12, T * 0.17, T * 0.11, T * 0.04);
    ctx.fill();
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(T * 0.025, -T * 0.18, T * 0.08, 0, P2); ctx.fill();
    ctx.fillStyle = '#20343f';
    ctx.beginPath(); ctx.ellipse(T * 0.05, -T * 0.18, T * 0.048, T * 0.038, 0, 0, P2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(T * 0.06, -T * 0.19, T * 0.015, T * 0.01, 0, 0, P2); ctx.fill();
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
    // the cursor. Only present once Mr. Natas activates it at -4,000 ft. ----
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
      // Rooftop hopper + inclined conveyor with rollers
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
      // Conveyor from the ground up to the hopper
      const cx0 = w + T * 0.55, cy0 = -T * 0.1, cx1 = w - T * 0.5, cy1 = -H - T * 0.78;
      ctx.strokeStyle = '#23262b';
      ctx.lineWidth = Math.max(3, T * 0.11);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
      ctx.strokeStyle = '#4a5058';
      ctx.lineWidth = Math.max(1.5, T * 0.03);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx1, cy1); ctx.stroke();
      // Rollers
      ctx.fillStyle = '#5a616a';
      for (let i = 0; i < 4; i++) {
        const rt2 = i / 3;
        ctx.beginPath();
        ctx.arc(cx0 + (cx1 - cx0) * rt2, cy0 + (cy1 - cy0) * rt2, T * 0.045, 0, P2);
        ctx.fill();
      }
      // Support leg
      ctx.strokeStyle = '#2c313a';
      ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.beginPath(); ctx.moveTo(w + T * 0.18, -T * 0.02); ctx.lineTo(w + T * 0.05, -H * 0.55); ctx.stroke();
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
  drawBoss(ctx, sx, sy, boss) {
    const T = C.TILE;
    ctx.save();
    ctx.translate(sx, sy);
    if (boss.facing < 0) ctx.scale(-1, 1);
    const t = boss.animTime;
    const breathe = Math.sin(t * 2.2) * T * 0.05;
    const flash = boss.hitFlash > 0;

    if (boss.form === 1) {
      // Mr. Natas: tall suited figure, horns, monocle, cane
      const h = T * 3.2, w = T * 1.3;
      ctx.translate(0, breathe);
      // Legs
      ctx.fillStyle = flash ? '#fff' : '#16151a';
      ctx.fillRect(-w * 0.28, -h * 0.35, w * 0.2, h * 0.35);
      ctx.fillRect(w * 0.08, -h * 0.35, w * 0.2, h * 0.35);
      // Coat
      const coat = ctx.createLinearGradient(0, -h, 0, 0);
      coat.addColorStop(0, flash ? '#fff' : '#26232c');
      coat.addColorStop(1, flash ? '#ddd' : '#121016');
      ctx.fillStyle = coat;
      this.rr(ctx, -w / 2, -h * 0.82, w, h * 0.5, T * 0.15);
      ctx.fill();
      // Shirt + tie
      ctx.fillStyle = flash ? '#eee' : '#d8d3c8';
      ctx.fillRect(-w * 0.1, -h * 0.8, w * 0.2, h * 0.22);
      ctx.fillStyle = '#8a1520';
      ctx.fillRect(-w * 0.04, -h * 0.8, w * 0.08, h * 0.2);
      // Head
      ctx.fillStyle = flash ? '#fff' : '#b03830';
      ctx.beginPath(); ctx.arc(0, -h * 0.92, T * 0.34, 0, Math.PI * 2); ctx.fill();
      // Horns
      ctx.fillStyle = flash ? '#fff' : '#3a3038';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * T * 0.18, -h * 0.92 - T * 0.22);
        ctx.quadraticCurveTo(s * T * 0.42, -h * 0.92 - T * 0.5, s * T * 0.28, -h * 0.92 - T * 0.62);
        ctx.quadraticCurveTo(s * T * 0.3, -h * 0.92 - T * 0.42, s * T * 0.08, -h * 0.92 - T * 0.3);
        ctx.fill();
      }
      // Eyes + monocle
      ctx.fillStyle = '#ffdf5e';
      ctx.beginPath(); ctx.arc(T * 0.12, -h * 0.94, T * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-T * 0.12, -h * 0.94, T * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(T * 0.12, -h * 0.94, T * 0.1, 0, Math.PI * 2); ctx.stroke();
      // Cane
      ctx.strokeStyle = flash ? '#fff' : '#5a4a2f';
      ctx.lineWidth = T * 0.09;
      ctx.beginPath();
      const caneA = boss.attack === 'cane' ? Math.sin(boss.attackT * 12) * 0.8 : 0.15;
      ctx.moveTo(w * 0.5, -h * 0.6);
      ctx.lineTo(w * 0.5 + Math.sin(caneA) * T * 1.1, -h * 0.6 + Math.cos(caneA) * T * 1.1);
      ctx.stroke();
    } else {
      // Satan form: hulking cyborg demon with chest furnace
      const h = T * 3.8, w = T * 2.2;
      ctx.translate(0, breathe);
      // Legs (digitigrade)
      ctx.fillStyle = flash ? '#fff' : '#511';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * w * 0.22, -h * 0.4);
        ctx.lineTo(s * w * 0.34, -h * 0.18);
        ctx.lineTo(s * w * 0.2, 0);
        ctx.lineTo(s * w * 0.38, 0);
        ctx.lineTo(s * w * 0.44, -h * 0.2);
        ctx.lineTo(s * w * 0.3, -h * 0.42);
        ctx.fill();
      }
      // Torso
      const torso = ctx.createLinearGradient(0, -h, 0, -h * 0.3);
      torso.addColorStop(0, flash ? '#fff' : '#8a1f14');
      torso.addColorStop(1, flash ? '#ccc' : '#4a0f0a');
      ctx.fillStyle = torso;
      this.rr(ctx, -w / 2, -h * 0.88, w, h * 0.52, T * 0.3);
      ctx.fill();
      // Metal plating (cyborg half)
      ctx.fillStyle = flash ? '#eee' : '#6e747c';
      this.rr(ctx, 0, -h * 0.88, w / 2, h * 0.52, T * 0.3);
      ctx.fill();
      ctx.strokeStyle = '#31353b';
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(w * 0.5 * i / 4, -h * 0.88); ctx.lineTo(w * 0.5 * i / 4, -h * 0.36); ctx.stroke();
      }
      // Chest furnace
      const furn = ctx.createRadialGradient(-w * 0.15, -h * 0.6, T * 0.05, -w * 0.15, -h * 0.6, T * 0.4);
      const pulse = 0.6 + 0.4 * Math.sin(t * 5);
      furn.addColorStop(0, `rgba(255,230,120,${pulse})`);
      furn.addColorStop(0.5, `rgba(255,120,30,${pulse * 0.9})`);
      furn.addColorStop(1, 'rgba(60,10,5,0.9)');
      ctx.fillStyle = furn;
      ctx.beginPath(); ctx.arc(-w * 0.15, -h * 0.6, T * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a2d33';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Grate
      ctx.strokeStyle = 'rgba(30,30,35,0.8)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.15 - T * 0.3, -h * 0.6 + i * T * 0.12);
        ctx.lineTo(-w * 0.15 + T * 0.3, -h * 0.6 + i * T * 0.12);
        ctx.stroke();
      }
      // Head: demon skull with metal jaw
      ctx.fillStyle = flash ? '#fff' : '#8a1f14';
      ctx.beginPath(); ctx.arc(0, -h * 0.97, T * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#eee' : '#6e747c';
      this.rr(ctx, -T * 0.32, -h * 0.97, T * 0.64, T * 0.32, T * 0.08);
      ctx.fill();
      // Burning eyes
      ctx.shadowColor = '#ff4020';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffdf30';
      ctx.beginPath(); ctx.arc(-T * 0.15, -h * 1.0, T * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(T * 0.15, -h * 1.0, T * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Big horns
      ctx.fillStyle = flash ? '#fff' : '#2c2530';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * T * 0.2, -h * 1.05 - T * 0.15);
        ctx.quadraticCurveTo(s * T * 0.75, -h * 1.05 - T * 0.55, s * T * 0.5, -h * 1.05 - T * 0.95);
        ctx.quadraticCurveTo(s * T * 0.45, -h * 1.05 - T * 0.5, s * T * 0.05, -h * 1.05 - T * 0.28);
        ctx.fill();
      }
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
    }
    ctx.restore();
  },
};
