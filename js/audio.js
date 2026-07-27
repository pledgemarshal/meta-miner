// All sound is synthesized with WebAudio — no audio files.

const Audio = {
  ctx: null,
  master: null,
  muted: false,
  thrustNode: null,
  drillNode: null,
  musicTimer: null,

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { return false; }
    return true;
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  noise(dur, vol, filterFreq, delay) {
    if (!this.ensure() || this.muted) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // Ore collection jingle — escalates with the ore's value
  pickup(value) {
    if (value >= 100000) {
      // Diamond / Amazonite: triumphant rising fanfare with a sparkle on top
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.16, null, i * 0.07));
      this.tone(2093, 0.3, 'sine', 0.1, null, 0.46);
      this.tone(1568, 0.24, 'sine', 0.08, null, 0.52);
    } else if (value >= 20000) {
      // Ruby: five-note fanfare
      [523, 659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.15, null, i * 0.06));
    } else if (value >= 2000) {
      // Einsteinium / Emerald: bright four-note sparkle
      [587, 740, 880, 1175].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.14, null, i * 0.055));
    } else if (value >= 250) {
      // Goldium / Platinium: happy three-note arpeggio
      [523, 659, 784].forEach((f, i) => this.tone(f, 0.09, 'sine', 0.14, null, i * 0.05));
    } else {
      // Ironium / Bronzium / Silverium: simple two-tone blip
      this.tone(660, 0.07, 'sine', 0.13);
      this.tone(880, 0.1, 'sine', 0.12, null, 0.06);
    }
  },

  play(name) {
    switch (name) {
      case 'pickup':   this.tone(660, 0.08, 'sine', 0.15); this.tone(990, 0.12, 'sine', 0.15, null, 0.07); break;
      case 'moan':     this.tone(180, 1.4, 'sine', 0.1, 120); this.tone(240, 1.2, 'sine', 0.06, 150, 0.15); break;
      case 'shriek':   this.tone(1750, 0.55, 'sawtooth', 0.16, 280); this.tone(2300, 0.4, 'square', 0.08, 500, 0.05); this.noise(0.45, 0.2, 3500, 0.05); break;
      case 'ghostHit': this.tone(420, 0.5, 'sine', 0.14, 90); this.tone(330, 0.4, 'triangle', 0.1, 70, 0.1); this.noise(0.3, 0.15, 600, 0.05); break;
      case 'crackle':  this.noise(0.1, 0.08, 2800); this.noise(0.07, 0.06, 4000, 0.05); break;
      case 'steam':    this.noise(0.9, 0.4, 5200); this.tone(240, 0.5, 'sine', 0.09, 520); this.tone(320, 0.3, 'sine', 0.07, 640, 0.15); break;
      case 'sell':     [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.14, null, i * 0.07)); break;
      case 'buy':      this.tone(784, 0.09, 'triangle', 0.15); this.tone(1175, 0.14, 'triangle', 0.13, null, 0.08); break;
      case 'denied':   this.tone(180, 0.18, 'square', 0.12, 120); break;
      case 'clank':    this.noise(0.08, 0.25, 3500); this.tone(220, 0.06, 'square', 0.1, 140); break;
      case 'thud':     this.noise(0.15, 0.3, 500); this.tone(80, 0.14, 'sine', 0.25, 40); break;
      case 'explode':  this.noise(0.7, 0.5, 900); this.tone(70, 0.5, 'sawtooth', 0.3, 25); break;
      case 'gas':      this.noise(0.5, 0.4, 1500); this.tone(300, 0.3, 'sawtooth', 0.15, 60); break;
      case 'lava':     this.noise(0.6, 0.35, 700); this.tone(120, 0.5, 'sawtooth', 0.2, 45); break;
      case 'refuel':   this.tone(330, 0.3, 'sine', 0.12, 520); break;
      case 'repair':   [440, 554, 659].forEach((f, i) => this.tone(f, 0.09, 'sine', 0.12, null, i * 0.06)); break;
      case 'teleport': this.tone(1200, 0.5, 'sine', 0.15, 200); this.tone(800, 0.5, 'sine', 0.1, 2400, 0.05); break;
      case 'radio':    this.tone(880, 0.06, 'square', 0.08); this.tone(1320, 0.06, 'square', 0.08, null, 0.09); break;
      case 'quake':    this.noise(1.6, 0.4, 300); break;
      case 'laser':    this.tone(1800, 0.25, 'sawtooth', 0.14, 300); break;
      case 'roar':     this.tone(90, 0.9, 'sawtooth', 0.3, 45); this.noise(0.9, 0.3, 400); break;
      case 'fireball': this.noise(0.3, 0.25, 1000); this.tone(260, 0.3, 'sawtooth', 0.12, 90); break;
      case 'save':     this.tone(587, 0.1, 'sine', 0.13); this.tone(880, 0.16, 'sine', 0.13, null, 0.09); break;
      case 'drill':    this.startDrill(); break;
    }
  },

  startDrill() {
    if (!this.ensure() || this.muted || this.drillNode) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    g.gain.value = 0.07;
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 18; lfoG.gain.value = 20;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.connect(g); g.connect(this.master);
    osc.start(); lfo.start();
    this.drillNode = { osc, g, lfo };
  },

  stop(name) {
    if (name === 'drill' && this.drillNode) {
      try { this.drillNode.osc.stop(); this.drillNode.lfo.stop(); } catch (e) {}
      this.drillNode = null;
    }
  },

  thrustOn() {
    if (!this.ensure() || this.muted || this.thrustNode) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = 0.08;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.thrustNode = { src, g };
  },

  thrustOff() {
    if (this.thrustNode) {
      try { this.thrustNode.src.stop(); } catch (e) {}
      this.thrustNode = null;
    }
  },

  // Falling wind rush: looping filtered noise whose volume/pitch track fall speed
  windNode: null,
  setWind(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.windNode) {
        try { this.windNode.src.stop(); this.windNode.lfo.stop(); } catch (e) {}
        this.windNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.windNode) {
      // Smooth breeze: noise through two gentle lowpasses (no hissy band), with a
      // slow LFO swirling the cutoff so it breathes like rushing air
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Pre-soften the noise itself (simple one-pole smoothing)
        last = last * 0.82 + (Math.random() * 2 - 1) * 0.18;
        d[i] = last * 3;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'lowpass'; f1.frequency.value = 400; f1.Q.value = 0.8;
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'lowpass'; f2.frequency.value = 600; f2.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 1.1;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 110;
      lfo.connect(lfoG); lfoG.connect(f1.frequency);
      src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.windNode = { src, f1, f2, g, lfo };
    }
    this.windNode.g.gain.value = 0.3 * intensity;
    this.windNode.f1.frequency.value = 240 + 480 * intensity;
    this.windNode.f2.frequency.value = 380 + 620 * intensity;
  },

  // Track rumble: quiet low rolling noise while driving on the ground
  treadNode: null,
  setTreads(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.treadNode) {
        try { this.treadNode.src.stop(); } catch (e) {}
        this.treadNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.treadNode) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      this.treadNode = { src, f, g };
    }
    this.treadNode.g.gain.value = 0.1 * intensity;
    this.treadNode.f.frequency.value = 180 + 160 * intensity;
  },
};
