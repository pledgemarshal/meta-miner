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
    const t = Math.max(0, Math.min(1, C.rowToFeet(row) / 7300));
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
    // Speckled grain
    for (let i = 0; i < 110; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 0.8 + this.rand() * 3.2;
      ctx.fillStyle = this.rand() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Small pebbles
    for (let i = 0; i < 7; i++) {
      const x = this.rand() * S, y = this.rand() * S, r = 2 + this.rand() * 4;
      ctx.fillStyle = 'rgba(60,35,25,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, this.rand() * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
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
    const [top] = this.soil(band);
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, S, S);
    // Big rounded boulder filling the tile
    const g = ctx.createRadialGradient(S * 0.35, S * 0.3, S * 0.1, S * 0.5, S * 0.5, S * 0.62);
    g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.6, '#6e747c'); g.addColorStop(1, '#43484f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(S / 2, S / 2, S * 0.47, S * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cracks
    ctx.strokeStyle = 'rgba(30,32,36,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = S * (0.25 + this.rand() * 0.5), y = S * (0.25 + this.rand() * 0.5);
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (this.rand() - 0.5) * S * 0.3; y += (this.rand() - 0.5) * S * 0.3; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.ellipse(S * 0.38, S * 0.32, S * 0.13, S * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
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
    // Cluster of faceted crystals
    const n = 3 + Math.floor(this.rand() * 3);
    for (let i = 0; i < n; i++) {
      const cx = S * (0.28 + this.rand() * 0.44), cy = S * (0.3 + this.rand() * 0.4);
      const r = S * (0.11 + this.rand() * 0.1);
      const sides = 5 + Math.floor(this.rand() * 3);
      const rot = this.rand() * Math.PI;
      ctx.beginPath();
      for (let j = 0; j <= sides; j++) {
        const a = rot + (j / sides) * Math.PI * 2;
        const rr = r * (0.75 + this.rand() * 0.4);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * 1.2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, m.color);
      g.addColorStop(1, this.shade(m.color, -0.45));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Facet line + sparkle
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.5, cy); ctx.lineTo(cx + r * 0.3, cy - r * 0.6); ctx.stroke();
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

  makeArtifact(key, band, S) {
    const a = C.ARTIFACTS[key];
    const c = this.makeCanvas(S), ctx = c.getContext('2d');
    ctx.drawImage(this.dirt[band][1], 0, 0);
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

  // --- The mining pod ---
  drawPod(ctx, px, py, t) {
    // px, py: screen pixels of pod center. t: {facing, drilling, thrust, time, teleporting}
    const T = C.TILE;
    ctx.save();
    ctx.translate(px, py);
    if (t.teleporting) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.teleporting / 1.2));
      ctx.scale(1, 0.4 + 0.6 * ctx.globalAlpha);
    }
    if (t.facing < 0) ctx.scale(-1, 1);
    const bob = Math.sin(t.time * 6) * (t.thrust ? 1.5 : 0.6);
    ctx.translate(0, bob);

    // Drill arm (in front, pointing right or down)
    const drillLen = T * 0.34;
    const spin = t.time * (t.drilling ? 40 : 6);
    ctx.save();
    if (t.drilling === 'down') { ctx.translate(0, T * 0.42); ctx.rotate(Math.PI / 2); }
    else ctx.translate(T * 0.42, T * 0.1);
    // Arm
    ctx.fillStyle = '#5a5f66';
    ctx.fillRect(-T * 0.1, -T * 0.07, T * 0.2, T * 0.14);
    // Cone bit with spinning stripes
    const grad = ctx.createLinearGradient(0, -T * 0.12, 0, T * 0.12);
    grad.addColorStop(0, '#c8ccd2'); grad.addColorStop(0.5, '#8b9097'); grad.addColorStop(1, '#5c6066');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(T * 0.05, -T * 0.13);
    ctx.lineTo(drillLen, 0);
    ctx.lineTo(T * 0.05, T * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,44,50,0.7)';
    ctx.lineWidth = 2;
    for (let i = -3; i < 6; i++) {
      const off = ((spin + i * 6) % 12) - 6;
      ctx.beginPath();
      ctx.moveTo(T * 0.02, off * T * 0.035 - T * 0.1);
      ctx.lineTo(drillLen, off * T * 0.035 + T * 0.02);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    // Tracks / undercarriage
    ctx.fillStyle = '#2e3238';
    this.rr(ctx, -T * 0.4, T * 0.26, T * 0.8, T * 0.18, T * 0.09);
    ctx.fill();
    ctx.fillStyle = '#484e56';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * T * 0.16, T * 0.35, T * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    const bodyGrad = ctx.createLinearGradient(0, -T * 0.4, 0, T * 0.3);
    bodyGrad.addColorStop(0, '#e8a33c');
    bodyGrad.addColorStop(0.45, '#c97f22');
    bodyGrad.addColorStop(1, '#8a5514');
    ctx.fillStyle = bodyGrad;
    this.rr(ctx, -T * 0.38, -T * 0.34, T * 0.76, T * 0.62, T * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,5,0.6)';
    ctx.lineWidth = 2;
    this.rr(ctx, -T * 0.38, -T * 0.34, T * 0.76, T * 0.62, T * 0.14);
    ctx.stroke();
    // Rivets & panel line
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const rx of [-0.28, -0.1, 0.08, 0.26]) {
      ctx.beginPath(); ctx.arc(rx * T, T * 0.18, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,55,10,0.5)';
    ctx.beginPath(); ctx.moveTo(-T * 0.38, T * 0.1); ctx.lineTo(T * 0.38, T * 0.1); ctx.stroke();

    // Cockpit dome
    const glass = ctx.createRadialGradient(T * 0.08, -T * 0.26, T * 0.02, T * 0.05, -T * 0.18, T * 0.26);
    glass.addColorStop(0, '#eafaff');
    glass.addColorStop(0.4, '#7fd4ef');
    glass.addColorStop(1, '#1d6d8f');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(T * 0.05, -T * 0.16, T * 0.23, T * 0.2, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#274';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Pilot silhouette
    ctx.fillStyle = 'rgba(20,40,50,0.75)';
    ctx.beginPath(); ctx.arc(T * 0.03, -T * 0.17, T * 0.07, 0, Math.PI * 2); ctx.fill();

    // Warning light
    ctx.fillStyle = t.drilling ? '#ff5540' : '#ffd040';
    ctx.beginPath(); ctx.arc(-T * 0.28, -T * 0.28, T * 0.045, 0, Math.PI * 2); ctx.fill();

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

  // --- Surface buildings (modernized industrial look) ---
  drawBuilding(ctx, key, sx, sy, t) {
    const T = C.TILE;
    const b = C.BUILDINGS[key];
    const w = b.w * T;
    ctx.save();
    ctx.translate(sx, sy);   // sy = ground line
    const palettes = {
      fuel:      { base: '#8a4b3a', roof: '#5f3026', accent: '#ffd23e', sign: 'FUEL' },
      processor: { base: '#4a5e70', roof: '#32414f', accent: '#7fd4ef', sign: 'ORE' },
      save:      { base: '#3f6a52', roof: '#2a4a38', accent: '#7dffb0', sign: 'SAVE' },
      upgrades:  { base: '#6a5a3f', roof: '#4a3e2a', accent: '#ffb347', sign: 'SHOP' },
      items:     { base: '#5e4a6e', roof: '#41324e', accent: '#c9a2ff', sign: 'ITEMS' },
    };
    const p = palettes[key];
    const H = T * 2.1;

    if (b.hover) {
      // Hovering save machine
      const hov = Math.sin(t * 1.8) * T * 0.12;
      ctx.translate(0, -T * 2.4 + hov);
      const g = ctx.createLinearGradient(0, 0, 0, T * 1.4);
      g.addColorStop(0, p.base); g.addColorStop(1, p.roof);
      ctx.fillStyle = g;
      this.rr(ctx, 0, 0, w, T * 1.1, T * 0.25);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath(); ctx.arc(w / 2, T * 0.55, T * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(w / 2 - T * 0.08, T * 0.47, T * 0.09, 0, Math.PI * 2); ctx.fill();
      // Anti-grav glow
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(w / 2, T * 1.2, T * 0.05, w / 2, T * 1.2, T * 0.8);
      gg.addColorStop(0, 'rgba(125,255,176,0.5)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(-T, T * 0.8, w + 2 * T, T * 1.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      return;
    }

    // Main structure
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, p.base);
    g.addColorStop(1, this.shadeCss(p.base, -0.35));
    ctx.fillStyle = g;
    this.rr(ctx, 0, -H, w, H, T * 0.15);
    ctx.fill();
    // Roof
    ctx.fillStyle = p.roof;
    this.rr(ctx, -T * 0.15, -H - T * 0.28, w + T * 0.3, T * 0.4, T * 0.1);
    ctx.fill();
    // Door
    ctx.fillStyle = 'rgba(15,15,20,0.85)';
    this.rr(ctx, w / 2 - T * 0.45, -T * 1.25, T * 0.9, T * 1.25, T * 0.12);
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    this.rr(ctx, w / 2 - T * 0.45, -T * 1.25, T * 0.9, T * 1.25, T * 0.12);
    ctx.stroke();
    // Windows
    ctx.fillStyle = this.hexA(p.accent, 0.75);
    for (let i = 0; i < 2; i++) {
      this.rr(ctx, T * 0.25 + i * (w - T * 0.9), -H + T * 0.35, T * 0.4, T * 0.35, 4);
      ctx.fill();
    }
    // Glowing sign
    ctx.fillStyle = '#14161c';
    const signW = Math.min(w - T * 0.4, T * 2.2);
    this.rr(ctx, (w - signW) / 2, -H - T * 0.85, signW, T * 0.5, 6);
    ctx.fill();
    ctx.font = `bold ${Math.floor(T * 0.34)}px Verdana`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.accent;
    ctx.fillText(p.sign, w / 2, -H - T * 0.6);
    ctx.shadowBlur = 0;
    ctx.restore();
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
