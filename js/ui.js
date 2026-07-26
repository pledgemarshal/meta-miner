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
      row.className = 'row';
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
    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = spec.hint || 'Esc / E — close';
    p.appendChild(hint);
    this.overlay.appendChild(p);
    this.activePanel = p;
    this.onClose = spec.onClose || null;
    return p;
  },

  // Transmission dialog with a procedural portrait
  transmission(t, onDone) {
    this.close();
    const p = document.createElement('div');
    p.className = 'panel transmission';
    const h = document.createElement('h2');
    h.textContent = 'Incoming Transmission';
    p.appendChild(h);
    const caller = document.createElement('div');
    caller.className = 'caller';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 56;
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
    const hint = document.createElement('div');
    hint.className = 'close-hint';
    hint.textContent = 'E / Enter / Esc — acknowledge';
    p.appendChild(hint);
    this.overlay.appendChild(p);
    this.activePanel = p;
    this.onClose = onDone || null;
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
    if (kind === 'natas') {
      ctx.fillStyle = '#b03830';
      ctx.beginPath(); ctx.arc(0, 4, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a3038';
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-16, -20, -10, -24); ctx.quadraticCurveTo(-9, -14, -4, -10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -8); ctx.quadraticCurveTo(16, -20, 10, -24); ctx.quadraticCurveTo(9, -14, 4, -10); ctx.fill();
      ctx.fillStyle = '#ffdf5e';
      ctx.beginPath(); ctx.arc(-5, 2, 2, 0, Math.PI * 2); ctx.arc(5, 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(5, 2, 4.5, 0, Math.PI * 2); ctx.stroke();
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
    const stripH = 66 * U;
    const grad = ctx.createLinearGradient(0, 0, 0, stripH);
    grad.addColorStop(0, 'rgba(8,9,14,0.82)');
    grad.addColorStop(1, 'rgba(8,9,14,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, C.VIEW_W, stripH);

    const fuelFrac = P.fuel / P.fuelCap();
    // Fuel bar — red at or below 25%
    this.bar(ctx, pad, 10 * U, barW, barH, fuelFrac,
      fuelFrac <= 0.25 ? '#ff4530' : '#ffb347', `FUEL ${P.fuel.toFixed(1)} L`);
    // Hull bar
    this.bar(ctx, pad, 10 * U + barH + gap * 0.6, barW, barH, P.hull / P.hullCap(), '#7dffb0',
      `HULL ${Math.ceil(P.hull)}/${P.hullCap()}`);
    // Cargo bar
    this.bar(ctx, pad + barW + gap * 1.5, 10 * U, barW * 0.7, barH, P.cargo.length / P.cargoCap(), '#7de0ff',
      `CARGO ${P.cargo.length}/${P.cargoCap()}`);

    // Money & depth
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.round(16 * U)}px Verdana`;
    ctx.fillStyle = '#7dffb0';
    ctx.fillText('$' + P.money.toLocaleString(), C.VIEW_W - pad, 18 * U);
    ctx.font = `bold ${Math.round(13 * U)}px Verdana`;
    const depth = P.depthFeet();
    let depthStr;
    if (Game.inHell()) depthStr = C.HELL_ALTIMETER.toLocaleString() + ' ft';
    else if (depth > C.ALTIMETER_FAIL) depthStr = (Math.random() < 0.5 ? '?' : '') + '✕✕✕✕ ft';
    else depthStr = '-' + depth.toLocaleString() + ' ft';
    ctx.fillStyle = depth > C.ALTIMETER_FAIL ? '#ff6a50' : '#d8d3c8';
    ctx.fillText(depthStr, C.VIEW_W - pad, 40 * U);
    ctx.font = `${Math.round(11 * U)}px Verdana`;
    ctx.fillStyle = '#9a958a';
    ctx.fillText('SCORE ' + Game.score.toLocaleString(), C.VIEW_W - pad, 58 * U);

    // Item quickbar
    ctx.textAlign = 'left';
    let ix = pad + barW + gap * 1.5;
    ctx.font = `${Math.round(11 * U)}px Verdana`;
    const itemIcons = { fuelTank: '⛽F', nanobots: '🔧R', dynamite: '🧨X', plastic: '💥C', teleporter: '🌀Q', transmitter: '📡M' };
    for (const key of Object.keys(itemIcons)) {
      const n = P.items[key];
      ctx.fillStyle = n > 0 ? '#ffd9a0' : 'rgba(150,145,135,0.35)';
      ctx.fillText(`${itemIcons[key]}:${n}`, ix, 42 * U);
      ix += 58 * U;
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
