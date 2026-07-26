// Lightweight particle system: dust, sparks, thruster flame, explosions, smoke.

const Particles = {
  list: [],

  spawn(opts) {
    // opts: x,y (world tiles), vx,vy, life, size, color, gravity, fade, glow
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, life: 0.6, age: 0,
      size: 0.08, color: '#fff', gravity: 0, fade: true, glow: false, shrink: true,
    }, opts));
  },

  burst(x, y, n, base) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.5 + Math.random() * 0.5) * (base.speed || 4);
      this.spawn(Object.assign({}, base, {
        x, y,
        vx: Math.cos(a) * s + (base.vx || 0),
        vy: Math.sin(a) * s + (base.vy || 0),
        life: (base.life || 0.6) * (0.6 + Math.random() * 0.8),
        size: (base.size || 0.08) * (0.6 + Math.random() * 0.9),
      }));
    }
  },

  dust(x, y, color) {
    this.burst(x, y, 9, { color: color || '#a9744c', speed: 2.8, life: 0.5, size: 0.09, gravity: 8 });
    // A couple of heavier chips that arc and fall
    this.burst(x, y, 2, { color: color || '#7a5236', speed: 4, life: 0.7, size: 0.13, gravity: 14 });
  },

  sparks(x, y) {
    this.burst(x, y, 8, { color: '#ffd97a', speed: 6, life: 0.35, size: 0.05, gravity: 10, glow: true });
  },

  explosion(x, y, scale) {
    const s = scale || 1;
    this.burst(x, y, 26 * s, { color: '#ff9a3c', speed: 9 * s, life: 0.55, size: 0.16, glow: true });
    this.burst(x, y, 18 * s, { color: '#ffd97a', speed: 6 * s, life: 0.4, size: 0.1, glow: true });
    this.burst(x, y, 14 * s, { color: '#5a5a5a', speed: 3.5 * s, life: 1.2, size: 0.2, gravity: -1.5 });
  },

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) { list.splice(i, 1); continue; }
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  },

  draw(ctx, cam) {
    for (const p of this.list) {
      const t = p.age / p.life;
      const alpha = p.fade ? 1 - t : 1;
      const size = (p.shrink ? (1 - t * 0.7) : 1) * p.size * C.TILE;
      const sx = (p.x - cam.x) * C.TILE;
      const sy = (p.y - cam.y) * C.TILE;
      if (sx < -20 || sx > C.VIEW_W + 20 || sy < -20 || sy > C.VIEW_H + 20) continue;
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  },

  clear() { this.list.length = 0; },
};
