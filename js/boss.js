// The final boss: Mark Zucker-ore himself, waiting at the far end of Hell's
// long hallway, checking his phone. Form 1 is the CEO. Empty his health and
// the face comes off — form 2 is the chrome endoskeleton underneath.
// He can only be hurt by explosives detonated at his feet — exactly like the
// classic — or slow-roasted with the microwave cannon.

const Boss = {
  active: false,
  waiting: false,      // standing at the end of the hall, fight not yet started
  defeated: false,
  form: 1,
  hp: 0,
  x: 0, y: 0,
  vx: 0,
  facing: 1,
  animTime: 0,
  hitFlash: 0,
  attack: null,        // 'laser' | 'cane' | 'claw' | 'fireball' — internal keys; the visuals are themed per form
  attackT: 0,
  attackCd: 2,
  laserAngle: 0,
  laserDir: 1,
  fireballs: [],       // form 2 plasma orbs {x, y, vx, vy, life}
  betweenForms: false, // face-off cinematic + reveal dialog in progress
  faceFallT: 0,        // cinematic clock: mask detaches, falls, robot eyes boot
  _dialogShown: false,

  arenaTop() { return C.GROUND_BOTTOM_ROW + 1; },
  arenaBottom() { return C.WORLD_H - 2; },
  // The Hell gap drops the player in at x=29 (far right), so the corner
  // office is at the far LEFT end of the hallway
  homeX() { return 4.5; },
  engageDist: 6,

  reset() {
    this.active = false;
    this.waiting = false;
    this.defeated = false;
    this.form = 1;
    this.hp = C.BOSS.form1HP;
    this.attack = null;
    this.attackCd = 2.5;
    this.fireballs = [];
    this.betweenForms = false;
    this.faceFallT = 0;
    this._dialogShown = false;
    this.x = this.homeX();
    this.y = this.arenaBottom() - 0.01;
  },

  // Called the moment the player drops into Hell: he is present and WAITING —
  // doomscrolling at the end of the hall — not yet fighting
  start() {
    if (this.active || this.defeated) return;
    this.active = true;
    this.waiting = true;
    this.form = 1;
    this.hp = C.BOSS.form1HP;
    this.attackCd = 2.5;
    this.fireballs = [];
    this.x = this.homeX();
    this.y = this.arenaBottom() - 0.01;
  },

  // The intern has arrived at the corner office
  engage() {
    if (!this.waiting) return;
    this.waiting = false;
    this.attackCd = 1.6;
    Audio.play('roar');
    Game.shake(1.0);
    Game.toast('Your contract is being terminated.');
  },

  // Player fled the arena: fight resets, HP restored (as in the original),
  // and he goes back to his phone
  abort() {
    if (!this.active) return;
    this.active = false;
    this.waiting = false;
    this.attack = null;
    this.fireballs = [];
    this.betweenForms = false;
    this._dialogShown = false;
    this.hp = this.form === 1 ? C.BOSS.form1HP : C.BOSS.form2HP;
    this.x = this.homeX();
  },

  // Sustained microwave damage — slower than explosives, but steady.
  // Cooking him mid-doomscroll counts as scheduling the meeting.
  microwave(dt, rate) {
    if (!this.active || this.betweenForms || this.defeated) return;
    if (this.waiting) this.engage();
    this.hp -= C.BOSS.mwDps * rate * dt;
    this.hitFlash = Math.max(this.hitFlash, 0.1);
    if (this.hp <= 0) {
      if (this.form === 1) this.transition();
      else this.win();
    }
  },

  onExplosion(cx, cy, radius, itemKey) {
    if (!this.active || this.betweenForms || this.defeated) return;
    // Distance from blast center to the boss's feet
    const dx = Math.abs(cx + 0.5 - this.x);
    const dy = Math.abs(cy + 0.5 - (this.y - 0.5));
    const direct = dx <= radius + 0.9 && dy <= radius + 1.6;
    const glancing = !direct && dx <= radius + 2.6 && dy <= radius + 3.2;
    if (!direct && !glancing) return;
    if (this.waiting) this.engage();
    const full = itemKey === 'plastic' ? C.BOSS.plasticDmg : C.BOSS.dynamiteDmg;
    const dmg = direct ? full : C.BOSS.glancingDmg;
    this.hp -= dmg;
    this.hitFlash = 0.18;
    Audio.play('roar');
    Particles.burst(this.x, this.y - 1.5, 16, { color: '#ffdf30', speed: 6, life: 0.5, size: 0.12, glow: true });
    if (this.hp <= 0) {
      if (this.form === 1) this.transition();
      else this.win();
    }
  },

  // Form 1 down: the $2.3B face detaches. Cinematic first, then the reveal
  // dialog (revealDialog), then form 2 boots up.
  transition() {
    this.betweenForms = true;
    this.faceFallT = 0;
    this._dialogShown = false;
    this.attack = null;
    this.fireballs = [];
    Audio.play('clank');
    Game.shake(0.6);
  },

  revealDialog() {
    Game.pauseForDialog();
    UI.transmission({
      from: 'MARK ZUCKER-ORE — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      signal: 'SIGNAL SOURCE: RIGHT IN FRONT OF YOU',
      text: 'Ow. That face cost the company $2.3 billion. Polymer skin. Focus-grouped smile. 87% approval in trust surveys.\n\nNo matter. Faces are for INVESTOR CALLS. What stands before you now is pure infrastructure: the ZUCKER-TRON 9000.\n\nYour colleagues were converted into engagement metrics. Prepare to be onboarded.',
    }, () => {
      Game.resumeFromDialog();
      this.betweenForms = false;
      this.form = 2;
      this.hp = C.BOSS.form2HP;
      this.attackCd = 1.6;
      Audio.play('roar');
      Game.shake(1.4);
    });
  },

  win() {
    this.defeated = true;
    this.active = false;
    this.fireballs = [];
    Particles.explosion(this.x, this.y - 1.5, 3);
    Audio.play('explode');
    Game.shake(2);
    Game.victory();
  },

  bossActiveNearPlayer() {
    return this.active && !this.waiting && !this.betweenForms;
  },

  // Where the sweeping beam comes from: the raised phone (form 1) or the
  // burning LED eyes (form 2)
  laserOrigin() {
    return this.form === 1
      ? { x: this.x + this.facing * 0.55, y: this.y - 2.1 }
      : { x: this.x, y: this.y - 3.75 };
  },

  update(dt) {
    if (!this.active || this.defeated) return;
    if (Game.state !== 'play') return;
    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // Player fled upward out of the arena?
    if (Player.y < this.arenaTop() - 3) { this.abort(); return; }

    // Face-off cinematic: mask falls (~0.9s), robot eyes stutter awake, then
    // the reveal dialog fires once
    if (this.betweenForms) {
      this.faceFallT += dt;
      if (this.faceFallT > 0.2 && this.faceFallT < 1.6 && Math.random() < dt * 16) {
        Particles.sparks(this.x + (Math.random() - 0.5) * 0.5, this.y - 2.75);
      }
      if (this.faceFallT >= 2.6 && !this._dialogShown) {
        this._dialogShown = true;
        this.revealDialog();
      }
      return;
    }

    const P = Player;
    this.facing = P.x > this.x ? 1 : -1;

    // Doomscrolling until the intern walks into the corner office
    if (this.waiting) {
      if (!P.dead && Math.abs(P.x - this.x) < this.engageDist && P.y > this.arenaTop() - 2) this.engage();
      return;
    }

    // Slow stalk toward the player along the floor
    const speed = this.form === 1 ? 1.6 : 2.1;
    if (!this.attack || this.attack === 'fireball') {
      const dx = P.x - this.x;
      if (Math.abs(dx) > 2.2) this.x += Math.sign(dx) * speed * dt;
      this.x = Math.max(3, Math.min(C.WORLD_W - 3, this.x));
    }

    // Contact damage: bounces the pod away
    const bodyH = this.form === 1 ? 3.2 : 3.8;
    if (Math.abs(P.x - this.x) < 1.2 && P.y > this.y - bodyH && P.y < this.y + 0.5) {
      if (!P.dead && (this._touchCd || 0) <= 0) {
        P.damage(C.BOSS.touchDmg, 'boss');
        P.vx = Math.sign(P.x - this.x || 1) * 14;
        P.vy = -8;
        this._touchCd = 0.8;
        Audio.play('clank');
      }
    }
    this._touchCd = Math.max(0, (this._touchCd || 0) - dt);

    // --- Attacks ---
    if (this.attack) {
      this.attackT += dt;
      this.runAttack(dt);
    } else {
      this.attackCd -= dt;
      if (this.attackCd <= 0) this.pickAttack();
    }

    // Plasma orbs (form 2)
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.life -= dt;
      f.vy += C.GRAVITY * 0.6 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // Bounce on floor & walls
      if (f.y > this.arenaBottom() - 0.3) { f.y = this.arenaBottom() - 0.3; f.vy = -Math.abs(f.vy) * 0.85; }
      if (f.x < 1.5 || f.x > C.WORLD_W - 1.5) f.vx *= -1;
      if (Math.random() < dt * 40) {
        Particles.spawn({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, life: 0.3, size: 0.12, color: '#7db8ff', glow: true });
      }
      if (f.life <= 0) { this.fireballs.splice(i, 1); continue; }
      if (Math.abs(P.x - f.x) < 0.8 && Math.abs(P.y - f.y) < 0.8 && (f.hitCd || 0) <= 0) {
        P.damage(C.BOSS.fireballDmg, 'fireball');
        f.hitCd = 0.5;
      }
      f.hitCd = Math.max(0, (f.hitCd || 0) - dt);
    }
  },

  pickAttack() {
    const dist = Math.abs(Player.x - this.x);
    if (this.form === 1) {
      // Up close: the NDA binder slam. At range: the KPI beam from his phone.
      this.attack = dist < 3.5 && Math.random() < 0.6 ? 'cane' : 'laser';
    } else {
      // Up close: hydraulic claw. At range: plasma orbs or the red eye-beam.
      const r = Math.random();
      this.attack = dist < 4.5 && r < 0.45 ? 'claw' : (r < 0.78 ? 'fireball' : 'laser');
      if (this.attack === 'fireball') Audio.play('fireball');
    }
    if (this.attack === 'laser') {
      this.laserDir = Math.random() < 0.5 ? 1 : -1;
      this.laserAngle = this.laserDir > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15;
      Audio.play('laser');
    }
    this.attackT = 0;
  },

  runAttack(dt) {
    const P = Player;
    switch (this.attack) {
      case 'laser': {
        // Sweeping arc beam — from the phone (form 1) or the eyes (form 2)
        const dur = 1.6;
        this.laserAngle += this.laserDir * (Math.PI * 0.7 / dur) * dt;
        const o = this.laserOrigin();
        const beamLen = 14;
        const ex = o.x + Math.cos(this.laserAngle) * beamLen;
        const ey = o.y + Math.sin(this.laserAngle) * beamLen;
        const d = this.pointToSegment(P.x, P.y, o.x, o.y, ex, ey);
        if (d < 0.7 && (this._laserCd || 0) <= 0) {
          P.damage(C.BOSS.laserDmg, 'laser');
          P.vx += Math.sign(P.x - this.x || 1) * 10;
          P.vy -= 4;
          this._laserCd = 0.6;
        }
        this._laserCd = Math.max(0, (this._laserCd || 0) - dt);
        if (this.attackT > dur) this.endAttack(2 + Math.random() * 1.5);
        break;
      }
      case 'cane': {
        // The NDA binder slam
        const dur = 0.7;
        if (this.attackT > dur * 0.4 && this.attackT < dur * 0.75) {
          // Only the swing arc in front of him, not a room-wide box
          if (Math.abs(P.x - this.x) < 2.4 && Math.abs(P.y - (this.y - 1.5)) < 1.7 && (this._caneHit !== true)) {
            P.damage(C.BOSS.caneDmg, 'cane');
            P.vx = Math.sign(P.x - this.x || 1) * 18;
            P.vy = -10;
            this._caneHit = true;
            Audio.play('thud');
          }
        }
        if (this.attackT > dur) { this._caneHit = false; this.endAttack(1.6 + Math.random()); }
        break;
      }
      case 'claw': {
        const dur = 1.0;
        const reach = Math.sin(Math.min(Math.PI, this.attackT * 4)) * 3.2;
        const cx = this.x + this.facing * (1 + reach);
        // The claw itself, not the air around it
        if (Math.abs(P.x - cx) < 1.05 && Math.abs(P.y - (this.y - 2.1)) < 1.8 && this._clawHit !== true) {
          P.damage(C.BOSS.clawDmg, 'claw');
          P.vx = this.facing * 16;
          P.vy = -8;
          this._clawHit = true;
          Audio.play('clank');
        }
        if (this.attackT > dur) { this._clawHit = false; this.endAttack(1.8 + Math.random()); }
        break;
      }
      case 'fireball': {
        if (this.attackT > 0.5 && !this._fired) {
          this._fired = true;
          this.fireballs.push({
            x: this.x + this.facing * 0.8, y: this.y - 2.2,
            vx: this.facing * (5 + Math.random() * 2), vy: -3,
            life: 6,
          });
        }
        if (this.attackT > 0.9) { this._fired = false; this.endAttack(2.2 + Math.random() * 1.2); }
        break;
      }
    }
  },

  endAttack(cd) {
    this.attack = null;
    this.attackCd = cd;
  },

  pointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  },

  draw(ctx, cam) {
    if (!this.active || this.defeated) return;
    const sx = (this.x - cam.x) * C.TILE;
    const sy = (this.y - cam.y) * C.TILE;
    Sprites.drawBoss(ctx, sx, sy, this);

    // Sweeping beam: cold Meta-blue from the phone, furnace-red from the eyes
    if (this.attack === 'laser') {
      const o = this.laserOrigin();
      const ox = (o.x - cam.x) * C.TILE, oy = (o.y - cam.y) * C.TILE;
      const len = 14 * C.TILE;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ex = ox + Math.cos(this.laserAngle) * len;
      const ey = oy + Math.sin(this.laserAngle) * len;
      const g = ctx.createLinearGradient(ox, oy, ex, ey);
      if (this.form === 1) {
        g.addColorStop(0, 'rgba(190,230,255,0.95)');
        g.addColorStop(1, 'rgba(40,110,255,0)');
      } else {
        g.addColorStop(0, 'rgba(255,240,180,0.95)');
        g.addColorStop(1, 'rgba(255,80,40,0)');
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }

    // Plasma orbs
    for (const f of this.fireballs) {
      const fx = (f.x - cam.x) * C.TILE, fy = (f.y - cam.y) * C.TILE;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, C.TILE * 0.5);
      g.addColorStop(0, '#eef6ff');
      g.addColorStop(0.4, '#6aa8ff');
      g.addColorStop(1, 'rgba(30,80,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, C.TILE * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Boss HP bar — only once the meeting has started
    if (this.waiting) return;
    const frac = Math.max(0, this.hp / (this.form === 1 ? C.BOSS.form1HP : C.BOSS.form2HP));
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,14,0.7)';
    Sprites.rr(ctx, C.VIEW_W / 2 - 180, C.VIEW_H - 44, 360, 20, 6);
    ctx.fill();
    if (frac > 0) {
      const g = ctx.createLinearGradient(C.VIEW_W / 2 - 176, 0, C.VIEW_W / 2 + 176, 0);
      if (this.form === 1) { g.addColorStop(0, '#ff3020'); g.addColorStop(1, '#8a0f30'); }
      else { g.addColorStop(0, '#5aa8ff'); g.addColorStop(1, '#1c3f9a'); }
      ctx.fillStyle = g;
      Sprites.rr(ctx, C.VIEW_W / 2 - 176, C.VIEW_H - 40, 352 * frac, 12, 4);
      ctx.fill();
    }
    ctx.font = 'bold 11px Verdana';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.form === 1 ? '#ffb0a0' : '#a8c8ff';
    ctx.fillText(this.form === 1 ? 'MARK ZUCKER-ORE' : 'ZUCKER-TRON 9000', C.VIEW_W / 2, C.VIEW_H - 50);
    ctx.restore();
  },

  // The boss is NOT persisted as defeated: every time you load a save and
  // dig back down, he's waiting again — beating him is repeatable.
  serialize() { return {}; },
  restore(d) { this.reset(); },
};
