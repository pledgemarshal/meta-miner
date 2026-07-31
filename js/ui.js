// DOM-based menus, dialogs & toasts, plus the canvas HUD.

const UI = {
  overlay: null,
  toastBox: null,
  activePanel: null,
  onClose: null,

  init() {
    this.overlay = document.getElementById('ui-overlay');
    this.toastBox = document.createElement('div');
    this.toastBox.id = 'toasts';
    document.getElementById('game-container').appendChild(this.toastBox);
    window.addEventListener('resize', () => this.fitPanel(this.activePanel));
  },

  // Hints like "E / Enter — acknowledge" become gold keycaps + bold label,
  // matching the big interact prompts on the surface buildings
  buildHint(text) {
    const hint = document.createElement('div');
    hint.className = 'close-hint';
    text.split('·').forEach((seg, si) => {
      if (si) hint.appendChild(document.createTextNode('   ·   '));
      const dash = seg.indexOf('—');
      if (dash < 0) { hint.appendChild(document.createTextNode(seg.trim())); return; }
      seg.slice(0, dash).split('/').forEach(k => {
        const kk = document.createElement('span');
        kk.className = 'key';
        kk.textContent = k.trim();
        hint.appendChild(kk);
      });
      hint.appendChild(document.createTextNode(' ' + seg.slice(dash + 1).trim()));
    });
    return hint;
  },

  // Fuzzy tune-in: a burst of colorful analog static that clears as the
  // panel sharpens into focus (paired with the CSS blur-in)
  staticIn(p) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.floor(p.offsetWidth / 6));
    cv.height = Math.max(8, Math.floor(p.offsetHeight / 6));
    Object.assign(cv.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      borderRadius: 'inherit', pointerEvents: 'none', imageRendering: 'pixelated',
    });
    p.appendChild(cv);
    const ctx = cv.getContext('2d');
    const t0 = performance.now();
    const dur = 420;
    const tick = () => {
      if (!cv.isConnected) return;
      const t = (performance.now() - t0) / dur;
      if (t >= 1 || this.activePanel !== p) { cv.remove(); return; }
      const img = ctx.createImageData(cv.width, cv.height);
      const d = img.data;
      const alpha = 255 * (1 - t) * (1 - t);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.random() * 255;
        d[i + 1] = Math.random() * 255;
        d[i + 2] = Math.random() * 255;
        d[i + 3] = Math.random() < 0.85 ? alpha : 0;   // sparse dropout pixels
      }
      ctx.putImageData(img, 0, 0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  // Smaller screens: shrink the whole panel to fit the window instead of
  // growing a scrollbar — everything scales down together
  fitPanel(p) {
    if (!p) return;
    p.style.zoom = '';
    p.style.maxHeight = '';
    const avail = window.innerHeight * 0.92;
    if (p.scrollHeight > avail) {
      p.style.zoom = String(Math.max(0.5, avail / p.scrollHeight));
      p.style.maxHeight = 'none';
    }
  },

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toastBox.appendChild(el);
    setTimeout(() => el.remove(), 2800);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild.remove();
  },

  isOpen() { return !!this.activePanel; },

  close() {
    if (this.activePanel) {
      this.activePanel.remove();
      this.activePanel = null;
      const cb = this.onClose;
      this.onClose = null;
      if (cb) cb();
    }
  },

  // Build a panel. spec: { title, sub, cls, rows: [{name, detail, right, button:{label, disabled, onClick}}], hint }
  panel(spec) {
    this.close();
    const p = document.createElement('div');
    p.className = 'panel' + (spec.cls ? ' ' + spec.cls : '');
    const h = document.createElement('h2');
    h.textContent = spec.title;
    p.appendChild(h);
    if (spec.sub) {
      const s = document.createElement('div');
      s.className = 'sub';
      s.textContent = spec.sub;
      p.appendChild(s);
    }
    if (spec.body) p.appendChild(spec.body);
    for (const r of (spec.rows || [])) {
      const row = document.createElement('div');
      row.className = 'row' + (r.pulse ? ' pulse' : '');
      const left = document.createElement('div');
      left.className = 'grow';
      if (r.name) {
        const n = document.createElement('div');
        n.className = 'name';
        n.textContent = r.name;
        left.appendChild(n);
      }
      if (r.detail) {
        const d = document.createElement('div');
        d.className = 'detail';
        d.textContent = r.detail;
        left.appendChild(d);
      }
      row.appendChild(left);
      if (r.right) {
        const rt = document.createElement('div');
        rt.className = r.rightCls || 'money';
        rt.textContent = r.right;
        row.appendChild(rt);
      }
      if (r.button) {
        const b = document.createElement('button');
        b.textContent = r.button.label;
        b.disabled = !!r.button.disabled;
        b.onclick = e => { e.stopPropagation(); r.button.onClick(); };
        row.appendChild(b);
      }
      p.appendChild(row);
    }
    p.appendChild(this.buildHint(spec.hint || 'Esc / E — close'));
    this.overlay.appendChild(p);
    this.activePanel = p;
    this.onClose = spec.onClose || null;
    this.fitPanel(p);
    // Shops re-render on every purchase, so they skip the tune-in
    if (!spec.noTune) {
      p.classList.add('tune-in');
      this.staticIn(p);
    }
    return p;
  },

  // --- Pause menu (Esc): resume, options, clear saves ---
  pauseMenu(confirmClear) {
    this.panel({
      title: 'Paused',
      sub: 'The Martian soil will wait.',
      rows: [
        { name: 'Resume', detail: 'Back to digging', button: { label: 'Resume', onClick: () => this.close() } },
        { name: 'Options', detail: 'Sound & music volume', button: { label: 'Options', onClick: () => this.optionsMenu() } },
        { name: 'Cheat Codes', detail: 'Whisper the right word and the rules bend', button: { label: 'Cheats', onClick: () => this.cheatMenu() } },
        {
          name: 'Clear Saves',
          detail: confirmClear ? 'This erases ALL saved progress. Are you sure?' : 'Erase saved progress and start fresh',
          button: {
            label: confirmClear ? 'Yes, erase it' : 'Clear',
            onClick: () => {
              if (!confirmClear) { this.pauseMenu(true); return; }
              try { localStorage.removeItem(C.SAVE_KEY); } catch (e) {}
              Audio.play('clank');
              this.toast('Save data erased — next death or title visit starts fresh');
              this.pauseMenu(false);
            },
          },
        },
      ],
      hint: 'Esc — resume',
    });
  },

  // --- Cheat codes: a text field, a button, and whatever secrets it knows ---
  cheatMenu() {
    const body = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter code…';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.spellcheck = false;
    Object.assign(input.style, {
      flex: '1', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px', padding: '10px 14px', color: '#ffd9a0',
      font: 'bold 16px Verdana', outline: 'none', letterSpacing: '1px',
    });
    const b = document.createElement('button');
    b.textContent = 'Enter';
    const submit = () => { this.submitCheat(input.value); input.value = ''; };
    b.onclick = e => { e.stopPropagation(); submit(); };
    // Keep typed letters away from the game's global key handling (WASD, E…)
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') this.pauseMenu();
    });
    row.appendChild(input);
    row.appendChild(b);
    body.appendChild(row);
    this.panel({
      title: 'Cheat Codes',
      sub: 'Company policy strictly forbids these. Company policy is far away.',
      body,
      rows: [
        { name: 'Back', button: { label: 'Back', onClick: () => this.pauseMenu() } },
      ],
      hint: 'Enter — submit · Esc — resume',
    });
    setTimeout(() => input.focus(), 0);
  },

  submitCheat(raw) {
    const code = (raw || '').trim().toLowerCase();
    if (!code) return;
    if (code === 'emp') {
      // Express elevator: only from the surface
      if (Player.depthFeet() > 5 || Game.inHell() || Player.dead) {
        Audio.play('denied');
        this.toast('That code only answers from the surface.');
        return;
      }
      this.close();
      Game.cheatEmpDrop();
    } else if (code === 'zuck') {
      // Corner-office elevator: only from the surface
      if (Player.depthFeet() > 5 || Game.inHell() || Player.dead) {
        Audio.play('denied');
        this.toast('That code only answers from the surface.');
        return;
      }
      this.close();
      Game.cheatZuckDrop();
    } else {
      Audio.play('denied');
      this.toast('Unrecognized code.');
    }
  },

  optionsMenu() {
    const body = document.createElement('div');
    const slider = (label, value, onInput) => {
      const row = document.createElement('div');
      row.className = 'row';
      const left = document.createElement('div');
      left.className = 'grow';
      const n = document.createElement('div');
      n.className = 'name';
      n.textContent = label;
      const pct = document.createElement('div');
      pct.className = 'detail';
      pct.textContent = Math.round(value * 100) + '%';
      left.appendChild(n);
      left.appendChild(pct);
      const s = document.createElement('input');
      s.type = 'range';
      s.min = 0; s.max = 100; s.value = Math.round(value * 100);
      s.style.width = '170px';
      s.style.accentColor = '#ffb347';
      s.style.cursor = 'pointer';
      s.addEventListener('input', () => {
        pct.textContent = s.value + '%';
        onInput(s.value / 100);
      });
      row.appendChild(left);
      row.appendChild(s);
      body.appendChild(row);
      return s;
    };
    let blipT = 0;
    slider('Sound effects', Audio.sfxVol, v => {
      Audio.setSfxVol(v);
      // A throttled blip so the level can be judged by ear
      if (performance.now() - blipT > 250) { blipT = performance.now(); Audio.play('buy'); }
    });
    slider('Music', Audio.musicVol, v => {
      Audio.setMusicVol(v);
      if (Audio.music) Audio.music.volume = Math.min(1, Math.max(0, Audio.music.volume));
    });
    this.panel({
      title: 'Options',
      sub: 'Volumes are remembered between sessions. N still mutes everything.',
      body,
      rows: [
        { name: 'Back', button: { label: 'Back', onClick: () => this.pauseMenu() } },
      ],
      hint: 'Esc — resume game',
    });
  },

  // Transmission dialog with a procedural portrait
  transmission(t, onDone) {
    this.close();
    const p = document.createElement('div');
    p.className = 'panel transmission tune-in';
    const h = document.createElement('h2');
    h.textContent = 'Incoming Transmission';
    p.appendChild(h);
    const caller = document.createElement('div');
    caller.className = 'caller';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 100;
    canvas.className = 'portrait';
    this.drawPortrait(canvas, t.portrait);
    caller.appendChild(canvas);
    const who = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = t.from;
    nm.style.color = '#7de0ff';
    const sg = document.createElement('div');
    sg.className = 'detail';
    sg.textContent = t.signal || 'Signal: strong';
    who.appendChild(nm);
    who.appendChild(sg);
    caller.appendChild(who);
    p.appendChild(caller);
    const msg = document.createElement('p');
    msg.textContent = t.text;
    p.appendChild(msg);
    p.appendChild(this.buildHint('E / Enter / Esc — acknowledge'));
    this.overlay.appendChild(p);
    this.activePanel = p;
    this.onClose = onDone || null;
    this.fitPanel(p);
    this.staticIn(p);
  },

  drawPortrait(canvas, kind) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    ctx.fillStyle = '#0a1418';
    ctx.fillRect(0, 0, S, S);
    // Static noise
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(125,224,255,${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 1);
    }
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.scale(S / 56, S / 56);   // face geometry is authored at 56px
    if (kind === 'natas') {
      // Mark Zucker-ore: the fringe, the stare, the eternal grey tee
      // Shoulders in the crew-neck
      ctx.fillStyle = '#5b6673';
      ctx.beginPath();
      ctx.moveTo(-17, 27);
      ctx.quadraticCurveTo(-16, 14, -8, 12);
      ctx.lineTo(8, 12);
      ctx.quadraticCurveTo(16, 14, 17, 27);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#454e58';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 10.5, 6, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke();
      // Neck
      ctx.fillStyle = '#e2b48e';
      ctx.fillRect(-4, 5, 8, 8);
      // Ears
      ctx.fillStyle = '#eac19a';
      ctx.beginPath();
      ctx.ellipse(-13, 0.5, 2.4, 3.6, 0, 0, Math.PI * 2);
      ctx.ellipse(13, 0.5, 2.4, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pale face, faintly squared jaw
      ctx.beginPath();
      ctx.moveTo(-12.5, -6);
      ctx.quadraticCurveTo(-13.5, 8, -6, 12.5);
      ctx.quadraticCurveTo(0, 14.8, 6, 12.5);
      ctx.quadraticCurveTo(13.5, 8, 12.5, -6);
      ctx.quadraticCurveTo(11.5, -15.5, 0, -15.5);
      ctx.quadraticCurveTo(-11.5, -15.5, -12.5, -6);
      ctx.closePath();
      ctx.fill();
      // The Caesar fringe: auburn cap, scalloped hem high on the forehead
      ctx.fillStyle = '#8a5530';
      ctx.beginPath();
      ctx.moveTo(-13, -3.5);
      ctx.quadraticCurveTo(-14.5, -16.5, 0, -17);
      ctx.quadraticCurveTo(14.5, -16.5, 13, -3.5);
      ctx.lineTo(11.6, -8);
      for (let x = 9; x >= -11; x -= 4) {
        ctx.quadraticCurveTo(x + 2, -6.6, x, -8.3);
      }
      ctx.closePath();
      ctx.fill();
      // Brows hoisted a touch too high
      ctx.strokeStyle = '#6d4423';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -5.6); ctx.quadraticCurveTo(-5.2, -6.8, -2.4, -5.8);
      ctx.moveTo(2.4, -5.8); ctx.quadraticCurveTo(5.2, -6.8, 8, -5.6);
      ctx.stroke();
      // The Stare: big whites, pale-blue irises, pinpoint pupils
      ctx.fillStyle = '#f5f7f5';
      ctx.beginPath();
      ctx.ellipse(-5.2, -1.6, 3.4, 3.9, 0, 0, Math.PI * 2);
      ctx.ellipse(5.2, -1.6, 3.4, 3.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9db8cc';
      ctx.beginPath();
      ctx.arc(-5.2, -1.3, 1.9, 0, Math.PI * 2);
      ctx.arc(5.2, -1.3, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#191b20';
      ctx.beginPath();
      ctx.arc(-5.2, -1.3, 0.9, 0, Math.PI * 2);
      ctx.arc(5.2, -1.3, 0.9, 0, Math.PI * 2);
      ctx.fill();
      // Catchlights — and one faint red LED glint. Probably nothing.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(-5.7, -1.9, 0.45, 0, Math.PI * 2);
      ctx.arc(4.7, -1.9, 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,60,40,0.85)';
      ctx.beginPath(); ctx.arc(5.7, -0.7, 0.4, 0, Math.PI * 2); ctx.fill();
      // Small nose
      ctx.strokeStyle = '#c99a72';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0.2, 0); ctx.quadraticCurveTo(1.2, 2.6, -0.4, 3.4); ctx.stroke();
      // The not-quite-smile: flat, with one practiced corner
      ctx.strokeStyle = '#9c6255';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4.2, 7.4); ctx.quadraticCurveTo(1, 7.9, 4.4, 6.6); ctx.stroke();
    } else if (kind === 'miner') {
      ctx.fillStyle = '#c9955c';
      ctx.beginPath(); ctx.arc(0, 4, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8c53c';
      ctx.beginPath(); ctx.arc(0, -6, 13, Math.PI, 0); ctx.fill();
      ctx.fillRect(-16, -8, 32, 4);
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-5, 3, 2, 0, Math.PI * 2); ctx.arc(5, 3, 2, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'unknown') {
      ctx.strokeStyle = 'rgba(125,224,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -2, 12, Math.PI * 0.9, Math.PI * 2.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 14); ctx.stroke();
    } else if (kind === 'satan') {
      ctx.fillStyle = '#8a1f14';
      ctx.beginPath(); ctx.arc(0, 4, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2530';
      ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-22, -18, -13, -26); ctx.quadraticCurveTo(-11, -14, -5, -9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, -6); ctx.quadraticCurveTo(22, -18, 13, -26); ctx.quadraticCurveTo(11, -14, 5, -9); ctx.fill();
      ctx.shadowColor = '#ff4020'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffdf30';
      ctx.beginPath(); ctx.arc(-5, 2, 2.5, 0, Math.PI * 2); ctx.arc(5, 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < S; y += 3) ctx.fillRect(0, y, S, 1);
  },

  // --- Canvas HUD (scaled 1.8x for readability) ---
  drawHUD(ctx) {
    const P = Player;
    // 1.8x HUD on full-width screens, scaling down so nothing collides on narrow ones
    const U = Math.min(1.8, Math.max(1, C.VIEW_W / 1100));
    const pad = 12 * U, barW = 170 * U, barH = 15 * U, gap = 12 * U;
    ctx.save();
    ctx.textBaseline = 'middle';

    // Backdrop strip
    const stripH = 82 * U;
    const grad = ctx.createLinearGradient(0, 0, 0, stripH);
    grad.addColorStop(0, 'rgba(8,9,14,0.82)');
    grad.addColorStop(1, 'rgba(8,9,14,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, C.VIEW_W, stripH);

    const fuelFrac = P.fuel / P.fuelCap();
    // Fuel bar — red at or below the warn threshold; pulses in size while the
    // fuel-depot guide arrows are marching (until the pump refill retires them)
    if (Game.fuelGuideActive) {
      const throb = 1 + 0.16 * (0.5 + 0.5 * Math.sin(Game.time * 5));
      ctx.save();
      ctx.translate(pad + barW / 2, 10 * U + barH / 2);
      ctx.scale(throb, throb);
      ctx.translate(-(pad + barW / 2), -(10 * U + barH / 2));
      this.bar(ctx, pad, 10 * U, barW, barH, fuelFrac,
        fuelFrac <= C.FUEL_WARN_FRAC ? '#ff4530' : '#ffb347', `FUEL ${P.fuel.toFixed(1)} L`);
      ctx.restore();
    } else {
      this.bar(ctx, pad, 10 * U, barW, barH, fuelFrac,
        fuelFrac <= C.FUEL_WARN_FRAC ? '#ff4530' : '#ffb347', `FUEL ${P.fuel.toFixed(1)} L`);
    }
    // Hull bar — flashes urgent red below 20%, in step with the heartbeat
    const hullFrac = P.hull / P.hullCap();
    const hullColor = hullFrac < 0.2
      ? (Math.sin(Game.time * 8) > 0 ? '#ff4530' : '#8a1810')
      : '#7dffb0';
    this.bar(ctx, pad, 10 * U + barH + gap * 0.6, barW, barH, hullFrac, hullColor,
      `HULL ${Math.ceil(P.hull)}/${P.hullCap()}`);
    // Cargo bar — pulses while the refinery guide chevrons are marching
    if (Game.oreGuideActive) {
      const throb = 1 + 0.16 * (0.5 + 0.5 * Math.sin(Game.time * 5));
      const ccx = pad + barW + gap * 1.5 + (barW * 0.7) / 2, ccy = 10 * U + barH / 2;
      ctx.save();
      ctx.translate(ccx, ccy);
      ctx.scale(throb, throb);
      ctx.translate(-ccx, -ccy);
      this.bar(ctx, pad + barW + gap * 1.5, 10 * U, barW * 0.7, barH, P.cargo.length / P.cargoCap(), '#7de0ff',
        `CARGO ${P.cargo.length}/${P.cargoCap()}`);
      ctx.restore();
    } else {
      this.bar(ctx, pad + barW + gap * 1.5, 10 * U, barW * 0.7, barH, P.cargo.length / P.cargoCap(), '#7de0ff',
        `CARGO ${P.cargo.length}/${P.cargoCap()}`);
    }
    // Cargo value: what the hold is worth at the processor right now
    if (P.cargo.length) {
      ctx.textAlign = 'left';
      ctx.font = `bold ${Math.round(12 * U)}px Verdana`;
      ctx.fillStyle = '#7de0ff';
      ctx.fillText('$' + P.cargoValue().toLocaleString(),
        pad + barW + gap * 1.5 + barW * 0.7 + 8 * U, 10 * U + barH / 2);
    }
    // EMP capacitor pips: three charge bars, the next one filling as it
    // recharges (only once the automaton head is installed)
    let hudRow = 2;
    if (P.hasEmpHead) {
      const y3 = 10 * U + hudRow * (barH + gap * 0.6);
      const segGap = 5 * U;
      const segW = (barW - segGap * (C.EMP.charges - 1)) / C.EMP.charges;
      const cd = Game.empCooldown();
      for (let i = 0; i < C.EMP.charges; i++) {
        let frac = 0;
        if (i < (P.empCharges || 0)) frac = 1;
        else if (i === (P.empCharges || 0)) frac = Math.min(1, (Game.empRegenT || 0) / cd);
        this.bar(ctx, pad + i * (segW + segGap), y3, segW, barH * 0.85, frac, '#9ad8ff',
          i === 0 ? 'EMP' : '');
      }
      hudRow++;
    }
    // Ice bar: appears once the pod carries any frost — red-flash near freezing
    if ((P.frost || 0) > 0) {
      const iceFrac = P.frost / 100;
      const critical = iceFrac >= 0.75 && Math.sin(Game.time * 8) > 0;
      this.bar(ctx, pad, 10 * U + hudRow * (barH + gap * 0.6), barW, barH, iceFrac,
        critical ? '#ff4530' : '#8fd8ff',
        P.frost >= 100 ? 'FROZEN SOLID!' : `ICE ${Math.round(P.frost)}%`);
    }

    // Money & depth
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.round(16 * U)}px Verdana`;
    ctx.fillStyle = '#7dffb0';
    ctx.fillText('$' + P.money.toLocaleString(), C.VIEW_W - pad, 18 * U);
    ctx.font = `bold ${Math.round(13 * U)}px Verdana`;
    const depth = P.depthFeet();
    let depthStr;
    if (Game.inHell()) depthStr = C.HELL_ALTIMETER.toLocaleString() + ' ft';
    else if (depth > C.ALTIMETER_FAIL) depthStr = (Math.random() < 0.5 ? '?' : '') + '✕✕✕✕✕ ft';
    else depthStr = '-' + depth.toLocaleString() + ' ft';
    ctx.fillStyle = depth > C.ALTIMETER_FAIL ? '#ff6a50' : '#d8d3c8';
    ctx.fillText(depthStr, C.VIEW_W - pad, 40 * U);
    ctx.font = `${Math.round(11 * U)}px Verdana`;
    ctx.fillStyle = '#9a958a';
    ctx.fillText('SCORE ' + Game.score.toLocaleString(), C.VIEW_W - pad, 58 * U);
    ctx.fillText('MAX DEPTH: -' + Math.round(P.maxDepth || 0).toLocaleString() + ' ft', C.VIEW_W - pad, 74 * U);

    // Item quickbar
    ctx.textAlign = 'left';
    let ix = pad + barW + gap * 1.5;
    ctx.font = `${Math.round(11 * U)}px Verdana`;
    const itemIcons = { fuelTank: '⛽F', nanobots: '🔧R', dynamite: '🧨X', plastic: '💥C', teleporter: '🌀T', transmitter: '📡M' };
    for (const key of Object.keys(itemIcons)) {
      const n = P.items[key];
      ctx.fillStyle = n > 0 ? '#ffd9a0' : 'rgba(150,145,135,0.35)';
      ctx.fillText(`${itemIcons[key]}:${n}`, ix, 42 * U);
      ix += 58 * U;
    }

    // Strata gauge: the map of anticipation down the right edge
    this.drawStrataGauge(ctx, U);

    // Dense strata warning: pulsing banner just like the fuel alert
    if (Game.rockWarnT > 0) {
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Game.time * 6));
      ctx.save();
      ctx.globalAlpha = pulse * Math.min(1, Game.rockWarnT / 0.4);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(26 * U)}px Verdana`;
      ctx.shadowColor = '#8a5a20';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#e8b06a';
      ctx.fillText('ROCK DENSE! 25% SLOWER DRILLING!', C.VIEW_W / 2, C.VIEW_H * 0.47);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Depth-gimmick event banner (magnet field, pyramid, warhead, worm…)
    if (Game.alertT > 0) {
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Game.time * 6));
      ctx.save();
      ctx.globalAlpha = pulse * Math.min(1, Game.alertT / 0.4);
      ctx.textAlign = 'center';
      let fs = Math.round(26 * U);
      ctx.font = `bold ${fs}px Verdana`;
      // Shrink to fit long messages on narrow screens
      const tw = ctx.measureText(Game.alertMsg).width;
      if (tw > C.VIEW_W * 0.94) {
        fs = Math.max(12, Math.floor(fs * (C.VIEW_W * 0.94) / tw));
        ctx.font = `bold ${fs}px Verdana`;
      }
      ctx.shadowColor = Game.alertColor;
      ctx.shadowBlur = 20;
      ctx.fillStyle = Game.alertColor;
      ctx.fillText(Game.alertMsg, C.VIEW_W / 2, C.VIEW_H * 0.54);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Armed warhead countdown: stays up until the fuse resolves
    if (Game.armedNukes && Game.armedNukes.length) {
      const soonest = Game.armedNukes.reduce((m, n) => Math.min(m, n.t), Infinity);
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Game.time * (6 + (1 - soonest / C.NUKE.fuse) * 10)));
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(24 * U)}px Verdana`;
      ctx.shadowColor = '#ff2010';
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#ff5540';
      ctx.fillText(`☢ WARHEAD ARMED — ${Math.max(0, soonest).toFixed(1)}s`, C.VIEW_W / 2, C.VIEW_H * 0.3);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Low fuel warning: pulsing center-screen banner
    if (Game.fuelWarnT > 0) {
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(Game.time * 6));
      ctx.save();
      ctx.globalAlpha = pulse * Math.min(1, Game.fuelWarnT / 0.4);   // fade out at the end
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(34 * U)}px Verdana`;
      ctx.shadowColor = '#ff2010';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#ff4530';
      ctx.fillText('FUEL LOW!', C.VIEW_W / 2, C.VIEW_H * 0.4);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore();
  },

  // --- Strata gauge: a thin depth ruler on the right edge. Landmarks appear
  // as you reach them; the next one down shows only as "???" — a reason to
  // keep digging. Deeper than that: nothing. The pod marker jitters once the
  // altimeter dies at -10,000. Fades in on the first real descent. ---
  STRATA: [
    { ft: 0, label: 'SURFACE' },
    { ft: 800, label: 'SPRINGS' },
    { ft: 1000, label: 'LODESTONES' },
    { ft: 1500, label: 'BOULDERS' },
    { ft: 2000, label: 'PYRAMIDS' },
    { ft: 3000, label: 'LAVA' },
    { ft: 4000, label: 'WARHEADS' },
    { ft: 4750, label: 'GAS' },
    { ft: 5000, label: 'THE WORM' },
    { ft: 6000, label: 'PERMAFROST' },
    { ft: 7700, label: 'SERVER FARMS' },
    { ft: 10000, label: 'NO SIGNAL' },
    { ft: 11000, label: 'THE FLOOR' },
  ],
  drawStrataGauge(ctx, U) {
    const maxD = Player.maxDepth || 0;
    const alpha = Math.max(0, Math.min(1, (maxD - 120) / 200));
    if (alpha <= 0.01) return;
    const x = C.VIEW_W - 14 * U;
    const top = C.VIEW_H * 0.2, bot = C.VIEW_H * 0.86;
    const yFor = ft => top + (bot - top) * (ft / C.DEPTH_MAX);
    ctx.save();
    ctx.globalAlpha = alpha * 0.95;
    // Spine
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(2, 2 * U * 0.85);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    // Ticks for every landmark you've reached; names only at or ABOVE the pod
    // (the layers behind you are old news — the ones below stay surprises)
    ctx.font = `${Math.round(11 * U)}px Verdana`;
    ctx.textAlign = 'right';
    const depthNow = Player.depthFeet();
    let current = this.STRATA[0];
    for (const s of this.STRATA) if (depthNow >= s.ft) current = s;
    for (const s of this.STRATA) {
      if (s.ft !== 0 && maxD < s.ft) break;   // unreached landmarks don't exist yet
      const y = yFor(s.ft);
      ctx.strokeStyle = 'rgba(230,225,210,0.7)';
      ctx.lineWidth = Math.max(1.2, U * 1.1);
      ctx.beginPath(); ctx.moveTo(x - 5 * U, y); ctx.lineTo(x + 3 * U * 0.6, y); ctx.stroke();
      if (s.ft <= current.ft) {
        const here = s === current;
        ctx.font = `${here ? 'bold ' : ''}${Math.round(11 * U)}px Verdana`;
        ctx.fillStyle = here ? 'rgba(255,215,110,1)' : 'rgba(235,230,215,0.85)';
        ctx.fillText(s.label, x - 8 * U, y);
      }
    }
    // The pod, where it currently hangs — twitchy below the altimeter's grave
    const depth = Math.max(0, Math.min(C.DEPTH_MAX, Player.depthFeet()));
    let py = yFor(depth);
    if (Player.depthFeet() > C.ALTIMETER_FAIL) {
      py += Math.sin(Game.time * 43) * 3.5 + Math.sin(Game.time * 17) * 2.5;
    }
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath();
    ctx.moveTo(x - 7 * U, py - 4 * U);
    ctx.lineTo(x - 7 * U, py + 4 * U);
    ctx.lineTo(x - 1.2 * U, py);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  bar(ctx, x, y, w, h, frac, color, label) {
    frac = Math.max(0, Math.min(1, frac));
    const r = h * 0.28;
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    Sprites.rr(ctx, x, y, w, h, r);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      Sprites.rr(ctx, x, y, Math.max(h * 0.5, w * frac), h, r);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(1, h * 0.06);
    Sprites.rr(ctx, x, y, w, h, r);
    ctx.stroke();
    const fs = Math.max(10, Math.round(h * 0.66));
    ctx.font = `bold ${fs}px Verdana`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#10120e';
    ctx.fillText(label, x + h * 0.42, y + h / 2 + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(label, x + h * 0.38, y + h / 2);
  },
};
