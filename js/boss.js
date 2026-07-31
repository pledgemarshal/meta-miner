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
  attack: null,        // 'headset' | 'cane' | 'claw' | 'fireball' | 'laser' — internal keys; visuals themed per form
  attackT: 0,
  attackCd: 2,
  laserAngle: 0,
  laserDir: 1,
  fireballs: [],       // form 2 plasma orbs {x, y, vx, vy, life}
  headsets: [],        // form 1 thrown VR headsets {x, y, vx, vy, rot, spin, life}
  aiChantT: 8,         // countdown to the next chant attack (15s cadence once fighting)
  sepT: 0,             // separation timer: chant and headset stay 4s apart, never overlap
  chantWave: null,     // the travelling "AI AI AI" soundwave {x, y, dir, age, hit}
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
    this.headsets = [];
    this.chantWave = null;
    this.sepT = 0;
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

  // The intern has arrived at the corner office: he looks up from the phone,
  // says his piece, and THEN the fight begins
  engage() {
    if (!this.waiting) return;
    this.waiting = false;
    Game.pauseForDialog();
    UI.transmission({
      from: 'MARK ZUCKER-ORE — CEO of Meta-Minerals Inc.',
      portrait: 'natas',
      signal: 'SIGNAL SOURCE: ACROSS THE DESK',
      text: 'Hello intern, it appears that you\'ve seen too much.\n\nI\'ll have to delete your data myself.',
    }, () => {
      Game.resumeFromDialog();
      this.attackCd = 1.6;
      this.aiChantT = 2.5;
      Audio.play('roar');
      Game.shake(1.0);
      Game.toast('Your contract is being terminated.');
    });
  },

  // Player fled the arena: fight resets, HP restored (as in the original),
  // and he goes back to his phone
  abort() {
    if (!this.active) return;
    this.active = false;
    this.waiting = false;
    this.attack = null;
    this.fireballs = [];
    this.headsets = [];
    this.chantWave = null;
    this.sepT = 0;
    this.betweenForms = false;
    this._dialogShown = false;
    this.hp = this.form === 1 ? C.BOSS.form1HP : C.BOSS.form2HP;
    this.x = this.homeX();
  },

  // Sustained microwave damage — slower than explosives, but steady.
  // Cooking him mid-doomscroll counts as scheduling the meeting.
  // No white hit-flash here: form 1 catches FIRE (with a face to match),
  // form 2 sears molten like the security automatons.
  microwave(dt, rate) {
    if (!this.active || this.betweenForms || this.defeated) return;
    if (this.waiting) this.engage();
    this.hp -= C.BOSS.mwDps * rate * dt;
    this.mwBurnT = 0.22;
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
    this.headsets = [];
    this.chantWave = null;
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
    if ((this.mwBurnT || 0) > 0) {
      this.mwBurnT -= dt;
      // Burning under the beam: embers off the CEO, molten sparks off the bot
      if (Math.random() < dt * 22) {
        Particles.spawn({
          x: this.x + (Math.random() - 0.5) * 0.9,
          y: this.y - 0.6 - Math.random() * (this.form === 1 ? 2.4 : 3),
          vx: (Math.random() - 0.5) * 1.5,
          vy: -1.5 - Math.random() * 2,
          life: 0.5 + Math.random() * 0.4,
          size: 0.09,
          color: Math.random() < 0.5 ? '#ffb347' : '#ff7a2f',
          glow: true,
        });
      }
      if (Math.random() < dt * 6) Audio.play('crackle');
    }

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

    // The AI chant attack: only every 15s, never while a headset is airborne,
    // and always at least 4s clear of any headset business (sepT)
    this.sepT = Math.max(0, (this.sepT || 0) - dt);
    if (this.form === 1) {
      this.aiChantT -= dt;
      if (this.aiChantT <= 0 && !this.attack && this.sepT <= 0 && this.headsets.length === 0) {
        this.attack = 'chant';
        this.attackT = 0;
        this.aiChantT = 15;
        this.chantWave = { x: this.x + this.facing * 0.35, y: this.y - 2.55, dir: this.facing, age: 0, hit: false };
        Audio.chantAI();
      }
    }

    // The travelling soundwave: a wall of "AI" lettering that hits like a
    // thrown headset. Fly over or under it.
    if (this.chantWave) {
      const wv = this.chantWave;
      wv.age += dt;
      const front = wv.x + wv.dir * 6.5 * wv.age;
      // The wall of sound reaches all the way down to the carpet — the dodge
      // is flying OVER it, not hugging the floor
      const wdy = P.y - wv.y;
      if (!wv.hit && !P.dead && Math.abs(P.x - front) < 0.7 && wdy > -1.6 && wdy < 2.3) {
        wv.hit = true;
        P.damage(C.BOSS.headsetDmg, 'chant');
        P.vx += wv.dir * 12;
        P.vy -= 4;
      }
      if (wv.age > 2.3) this.chantWave = null;
    }

    // --- Attacks ---
    if (this.attack) {
      this.attackT += dt;
      this.runAttack(dt);
    } else {
      this.attackCd -= dt;
      if (this.attackCd <= 0) this.pickAttack();
    }

    // Thrown VR headsets: ballistic, spinning, shattering on whatever they meet
    for (let i = this.headsets.length - 1; i >= 0; i--) {
      const hs = this.headsets[i];
      hs.life -= dt;
      hs.vy += C.GRAVITY * 0.5 * dt;
      hs.x += hs.vx * dt;
      hs.y += hs.vy * dt;
      hs.rot += hs.spin * dt;
      const shatter = () => {
        Particles.burst(hs.x, hs.y, 12, { color: '#d8dce2', speed: 4.5, life: 0.5, size: 0.08 });
        Particles.burst(hs.x, hs.y, 6, { color: '#7de0ff', speed: 3, life: 0.6, size: 0.06, glow: true });
        Audio.play('clank');
        this.headsets.splice(i, 1);
        this.sepT = Math.max(this.sepT, 4);   // 4s of quiet after the headset leaves the screen
      };
      if (Math.abs(P.x - hs.x) < 0.75 && Math.abs(P.y - hs.y) < 0.75) {
        P.damage(C.BOSS.headsetDmg, 'headset');
        P.vx += Math.sign(hs.vx || 1) * 8;
        P.vy -= 3;
        shatter();
        continue;
      }
      if (hs.y > this.arenaBottom() - 0.2 || hs.x < 1.3 || hs.x > C.WORLD_W - 1.3 || hs.life <= 0) {
        shatter();
      }
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
      // Up close: the NDA binder slam. At range: a VR headset from behind
      // his back, hurled at the pod. Try the demo. TRY THE DEMO.
      // (The throw waits out the 4s separation window around a chant.)
      const wantMelee = dist < 3.5 && Math.random() < 0.6;
      if (wantMelee) this.attack = 'cane';
      else if (this.sepT <= 0) this.attack = 'headset';
      else if (dist < 3.5) this.attack = 'cane';
      else { this.attackCd = 0.4; return; }
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
      case 'headset': {
        // Windup (reaching behind his back) is 0.55s, then the throw —
        // a ballistic lob aimed to land on the pod
        if (this.attackT > 0.55 && !this._thrown) {
          this._thrown = true;
          const ox = this.x + this.facing * 0.35, oy = this.y - 2.9;
          const dx = P.x - ox, dy = P.y - oy;
          const tf = Math.max(0.45, Math.min(1.1, Math.hypot(dx, dy) / 10));
          const g2 = C.GRAVITY * 0.5;
          this.headsets.push({
            x: ox, y: oy,
            vx: dx / tf,
            vy: dy / tf - 0.5 * g2 * tf,
            rot: 0,
            spin: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5),
            life: 4,
          });
          this.sepT = 4;   // no chanting while hardware is in the air (plus 4s)
          Audio.play('fireball');
        }
        if (this.attackT > 0.85) { this._thrown = false; this.endAttack(1.9 + Math.random() * 1.3); }
        break;
      }
      case 'chant': {
        // He stands and shouts; the wave does the travelling. The 4s
        // separation starts when the shout ends.
        if (this.attackT > 1.1) {
          this.sepT = Math.max(this.sepT, 4);
          this.endAttack(1.4 + Math.random());
        }
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
    const T = C.TILE;
    const sx = (this.x - cam.x) * T;
    const sy = (this.y - cam.y) * T;
    // The corner office: chair behind him, desk in front. The set stays put
    // when he stands up to terminate you — the empty chair keeps spinning.
    const ox0 = (this.homeX() - cam.x) * T;
    const oy0 = (this.arenaBottom() - cam.y) * T;
    Sprites.drawBossChair(ctx, ox0, oy0, this.animTime);
    Sprites.drawBoss(ctx, sx, sy, this);
    Sprites.drawBossDesk(ctx, ox0, oy0, this.animTime);

    // Form 2's crackling red eye-beam: pulsing core wrapped in jittering arcs
    if (this.attack === 'laser') {
      const o = this.laserOrigin();
      const ox = (o.x - cam.x) * T, oy = (o.y - cam.y) * T;
      const len = 14 * T;
      const ex = ox + Math.cos(this.laserAngle) * len;
      const ey = oy + Math.sin(this.laserAngle) * len;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(ox, oy, ex, ey);
      g.addColorStop(0, 'rgba(255,240,180,0.95)');
      g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 6 + 3 * Math.sin(this.animTime * 30);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      // Electric arcs snapping around the core
      const nx = -Math.sin(this.laserAngle), ny = Math.cos(this.laserAngle);
      for (let a = 0; a < 2; a++) {
        ctx.strokeStyle = `rgba(255,150,110,${0.5 + 0.3 * Math.random()})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        const segs = 9;
        for (let i = 1; i <= segs; i++) {
          const d = (len * i) / segs;
          const jit = (Math.random() - 0.5) * T * 0.5 * (i < segs ? 1 : 0.2);
          ctx.lineTo(ox + Math.cos(this.laserAngle) * d + nx * jit,
                     oy + Math.sin(this.laserAngle) * d + ny * jit);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Airborne VR headsets, spinning end over end
    for (const hs of this.headsets) {
      Sprites.drawVrHeadset(ctx, (hs.x - cam.x) * T, (hs.y - cam.y) * T, hs.rot, 1);
    }

    // The chant soundwave: "AI" lettering rolling out of his mouth, each
    // glyph bigger than the last, sound-blue with a white-hot leading edge
    if (this.chantWave) {
      const wv = this.chantWave;
      const ox = (wv.x - cam.x) * T, oy = (wv.y - cam.y) * T;
      const travelled = 6.5 * wv.age;
      const fade = Math.min(1, (2.3 - wv.age) / 0.3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      // Ripple arcs at the mouth while he's still shouting
      if (this.attack === 'chant') {
        ctx.strokeStyle = 'rgba(125,184,255,0.5)';
        ctx.lineWidth = 2.5;
        for (let r = 0; r < 3; r++) {
          const rr2 = T * (0.25 + r * 0.2 + ((wv.age * 2.4) % 0.2));
          ctx.beginPath();
          ctx.arc(ox, oy, rr2, wv.dir > 0 ? -0.7 : Math.PI - 0.7, wv.dir > 0 ? 0.7 : Math.PI + 0.7);
          ctx.stroke();
        }
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let d = 0.7; d < travelled && d < 15; d += 1.15) {
        const lx = ox + wv.dir * d * T;
        const ly = oy - d * 0.05 * T + Math.sin(this.animTime * 16 + d * 2.1) * T * 0.05;
        const atFront = travelled - d < 1.15;
        ctx.font = `bold ${Math.round(T * (0.2 + d * 0.062))}px Verdana`;
        ctx.shadowColor = '#4a9eff';
        ctx.shadowBlur = 16;
        ctx.fillStyle = atFront ? 'rgba(235,246,255,0.95)' : 'rgba(125,184,255,0.8)';
        ctx.fillText('AI', lx, ly);
      }
      ctx.shadowBlur = 0;
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
