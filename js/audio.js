// All sound effects are synthesized with WebAudio. The only audio file is the
// music: "Airglow" by Stellardrone (CC BY 4.0), looping via an <audio> element.

const Audio = {
  ctx: null,
  master: null,
  muted: false,
  thrustNode: null,
  drillNode: null,
  musicTimer: null,

  // --- User volume settings (0..1), persisted separately from the save ---
  sfxVol: 1,
  musicVol: 1,
  VOL_KEY: 'motherload-remake-volume',

  loadVolumes() {
    try {
      const v = JSON.parse(localStorage.getItem(this.VOL_KEY) || '{}');
      if (typeof v.sfx === 'number') this.sfxVol = Math.max(0, Math.min(1, v.sfx));
      if (typeof v.music === 'number') this.musicVol = Math.max(0, Math.min(1, v.music));
    } catch (e) {}
  },

  saveVolumes() {
    try { localStorage.setItem(this.VOL_KEY, JSON.stringify({ sfx: this.sfxVol, music: this.musicVol })); } catch (e) {}
  },

  setSfxVol(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5 * this.sfxVol;
    this.saveVolumes();
  },

  setMusicVol(v) {
    this.musicVol = Math.max(0, Math.min(1, v));
    this.saveVolumes();
  },

  // Note: this object shadows window.Audio, so the element is created via DOM
  music: null,
  initMusic() {
    const el = document.createElement('audio');
    el.src = 'audio/airglow.mp3';
    el.loop = true;
    el.volume = 0.5;
    el.preload = 'auto';
    this.music = el;
  },

  // Browsers block autoplay until a user gesture — called from every keydown,
  // so the music starts on the first key press and stays running
  startMusic() {
    if (this.music && this.music.paused && !this.muted) this.music.play().catch(() => {});
  },

  // Louder on the title screen, a quiet companion while mining;
  // scaled by the user's music volume setting
  setMusicLevel(v) {
    if (this.music) this.music.volume += (v * this.musicVol - this.music.volume) * 0.08;
  },

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5 * this.sfxVol;
      this.master.connect(this.ctx.destination);
    } catch (e) { return false; }
    return true;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.startMusic();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5 * this.sfxVol;
    if (this.music) {
      this.music.muted = this.muted;
      if (!this.muted) this.startMusic();
    }
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
      // --- Depth gimmicks ---
      case 'magnet':   this.tone(320, 0.35, 'sine', 0.12, 950); this.tone(160, 0.45, 'sine', 0.09, 70, 0.06); break;
      case 'discover': this.tone(392, 0.5, 'triangle', 0.12); this.tone(494, 0.5, 'triangle', 0.1, null, 0.25); this.tone(587, 0.9, 'triangle', 0.12, null, 0.5); this.noise(1.2, 0.06, 500); break;
      case 'curse':    this.tone(140, 1.6, 'sawtooth', 0.14, 60); this.tone(220, 1.3, 'sine', 0.1, 90, 0.2); this.noise(1.4, 0.18, 700); break;
      case 'nukeArm':  this.tone(1500, 0.12, 'square', 0.18); this.tone(1500, 0.12, 'square', 0.18, null, 0.2); this.tone(700, 0.4, 'sawtooth', 0.12, 250, 0.35); break;
      case 'defuse':   [660, 880, 1175].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.14, null, i * 0.09)); break;
      case 'nukeBlast':
        this.noise(0.25, 0.5, 4000);                                  // initial crack
        this.tone(55, 1.6, 'sawtooth', 0.4, 18);                      // deep core boom
        this.noise(1.8, 0.55, 450);                                   // main roar
        this.noise(2.4, 0.3, 180, 0.5);                               // long dying rumble
        this.tone(28, 2.0, 'sine', 0.3, 16, 0.2);
        break;
      case 'chomp':    this.noise(0.12, 0.35, 900); this.tone(150, 0.16, 'square', 0.2, 55); this.tone(85, 0.22, 'sawtooth', 0.16, 40, 0.06); break;
      // Geiger counter tick: a dry, sharp crackle. Fired at random intervals
      // whose rate scales with radiation intensity, so it clicks like the real thing.
      case 'geiger':
        this.noise(0.018, 0.32, 6500);
        if (Math.random() < 0.3) this.noise(0.014, 0.22, 7500, 0.03);   // occasional double-tick
        break;
      // Something superheated bursting apart under the microwave beam
      case 'mwPop':
        this.noise(0.35, 0.4, 1800);
        this.tone(600, 0.25, 'sine', 0.16, 120);
        this.tone(1400, 0.12, 'square', 0.08, 400, 0.03);
        break;
      case 'wormRoar': this.tone(70, 1.3, 'sawtooth', 0.24, 32); this.noise(1.3, 0.24, 300); this.tone(115, 0.9, 'square', 0.07, 50, 0.15); break;
    }
  },

  // Warhead countdown beep: pitch and urgency handed in by the caller
  beep(pitch, vol) {
    this.tone(pitch, 0.07, 'square', vol || 0.16);
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
    // Rocket rumble: pre-softened noise pushed low, a bass oscillator underneath,
    // and a fast flutter on the volume for that combustion roar
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
      d[i] = last * 3.2;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    // Low-end body
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 52;
    const oscF = this.ctx.createBiquadFilter();
    oscF.type = 'lowpass'; oscF.frequency.value = 130;
    const oscG = this.ctx.createGain();
    oscG.gain.value = 0.055;
    // Combustion flutter
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 13;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.045;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    osc.connect(oscF); oscF.connect(oscG); oscG.connect(this.master);
    src.start(); osc.start(); lfo.start();
    this.thrustNode = { src, g, osc, lfo };
  },

  thrustOff() {
    if (this.thrustNode) {
      try { this.thrustNode.src.stop(); this.thrustNode.osc.stop(); this.thrustNode.lfo.stop(); } catch (e) {}
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

  // Track clatter: mechanical rolling rumble with rhythmic link-slap whose
  // rate follows ground speed, over a low engine body
  treadNode: null,
  setTreads(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.treadNode) {
        try {
          this.treadNode.src.stop();
          this.treadNode.lfo.stop();
          this.treadNode.osc.stop();
        } catch (e) {}
        this.treadNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.treadNode) {
      // Pre-softened noise so the rumble is throaty rather than hissy
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.8 + (Math.random() * 2 - 1) * 0.2;
        d[i] = last * 2.8;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 1.1;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      // Link-slap: a fast square LFO chops the rumble into track clacks
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square'; lfo.frequency.value = 9;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.07;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      // Low drivetrain body underneath
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = 46;
      const oscG = this.ctx.createGain();
      oscG.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      osc.connect(oscG); oscG.connect(this.master);
      src.start(); lfo.start(); osc.start();
      this.treadNode = { src, f, g, lfo, osc, oscG };
    }
    // Twice the old volume, and everything speeds up with the pod
    this.treadNode.g.gain.value = 0.2 * intensity;
    this.treadNode.oscG.gain.value = 0.06 * intensity;
    this.treadNode.f.frequency.value = 220 + 260 * intensity;
    this.treadNode.lfo.frequency.value = 6 + 9 * intensity;
    this.treadNode.osc.frequency.value = 40 + 22 * intensity;
  },

  // Deep burrowing rumble while the worm is near: slow ground-shaking noise
  rumbleNode: null,
  setRumble(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.rumbleNode) {
        try { this.rumbleNode.src.stop(); this.rumbleNode.lfo.stop(); } catch (e) {}
        this.rumbleNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.rumbleNode) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.92 + (Math.random() * 2 - 1) * 0.08;
        d[i] = last * 5;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 130; f.Q.value = 1.2;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      // Slow surging so it feels like something pushing through rock
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.7;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 40;
      lfo.connect(lfoG); lfoG.connect(f.frequency);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.rumbleNode = { src, f, g, lfo };
    }
    this.rumbleNode.g.gain.value = 0.3 * intensity;
  },

  // Electric hum while the pod sits inside a magnetite field
  magnetNode: null,
  setMagnet(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.magnetNode) {
        try { this.magnetNode.osc.stop(); this.magnetNode.osc2.stop(); this.magnetNode.lfo.stop(); } catch (e) {}
        this.magnetNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.magnetNode) {
      // Two close-detuned oscillators beat against each other — classic mains hum
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 55;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine'; osc2.frequency.value = 57.5;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 420;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 5;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      osc.connect(f); osc2.connect(f); f.connect(g); g.connect(this.master);
      osc.start(); osc2.start(); lfo.start();
      this.magnetNode = { osc, osc2, g, lfo };
    }
    this.magnetNode.g.gain.value = 0.07 * intensity;
  },

  // Microwave Cannon: a real kitchen-microwave hum — deep 60 Hz mains drone
  // with its 120 Hz harmonic and a cycling fan whir — plus a focused,
  // vibrato-shimmering high tone so it still reads as an energy beam
  microwaveNode: null,
  setMicrowave(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.microwaveNode) {
        const n = this.microwaveNode;
        try { n.hum.stop(); n.hum2.stop(); n.fan.stop(); n.fanLfo.stop(); n.beam.stop(); n.beamVib.stop(); } catch (e) {}
        this.microwaveNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.microwaveNode) {
      const t0 = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + 0.18);   // spool-up instead of a hard click
      g.connect(this.master);

      // Mains hum: 60 Hz fundamental + softer 120 Hz harmonic (the classic drone)
      const hum = this.ctx.createOscillator();
      hum.type = 'sine'; hum.frequency.value = 60;
      const humG = this.ctx.createGain();
      humG.gain.value = 0.16;
      const hum2 = this.ctx.createOscillator();
      hum2.type = 'sine'; hum2.frequency.value = 120;
      const hum2G = this.ctx.createGain();
      hum2G.gain.value = 0.07;
      hum.connect(humG); humG.connect(g);
      hum2.connect(hum2G); hum2G.connect(g);

      // Fan/magnetron whir: soft looping noise through a mid bandpass, with a
      // slow rotor wobble on the volume
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.9 + (Math.random() * 2 - 1) * 0.1;
        d[i] = last * 4;
      }
      const fan = this.ctx.createBufferSource();
      fan.buffer = buf; fan.loop = true;
      const fanF = this.ctx.createBiquadFilter();
      fanF.type = 'bandpass'; fanF.frequency.value = 520; fanF.Q.value = 0.7;
      const fanG = this.ctx.createGain();
      fanG.gain.value = 0.1;
      const fanLfo = this.ctx.createOscillator();
      fanLfo.type = 'sine'; fanLfo.frequency.value = 4.3;
      const fanLfoG = this.ctx.createGain();
      fanLfoG.gain.value = 0.03;
      fanLfo.connect(fanLfoG); fanLfoG.connect(fanG.gain);
      fan.connect(fanF); fanF.connect(fanG); fanG.connect(g);

      // Beam shimmer: a thin, singing high tone with gentle vibrato riding on
      // top — the "focused energy" layer
      const beam = this.ctx.createOscillator();
      beam.type = 'sine'; beam.frequency.value = 1980;
      const beamG = this.ctx.createGain();
      beamG.gain.value = 0.016;
      const beamVib = this.ctx.createOscillator();
      beamVib.type = 'sine'; beamVib.frequency.value = 6.5;
      const beamVibG = this.ctx.createGain();
      beamVibG.gain.value = 22;
      beamVib.connect(beamVibG); beamVibG.connect(beam.frequency);
      beam.connect(beamG); beamG.connect(g);

      hum.start(); hum2.start(); fan.start(); fanLfo.start(); beam.start(); beamVib.start();
      this.microwaveNode = { g, hum, hum2, fan, fanLfo, beam, beamVib };
    }
  },

  // Geyser roar while the water surge carries the pod: churning filtered noise
  // with a fast watery warble on the cutoff
  geyserNode: null,
  setGeyser(intensity) {
    if (intensity <= 0.02 || this.muted) {
      if (this.geyserNode) {
        try { this.geyserNode.src.stop(); this.geyserNode.lfo.stop(); } catch (e) {}
        this.geyserNode = null;
      }
      return;
    }
    if (!this.ensure()) return;
    if (!this.geyserNode) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.7 + (Math.random() * 2 - 1) * 0.3;
        d[i] = last * 2.4;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 800; f.Q.value = 1.1;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 5.5;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 320;
      lfo.connect(lfoG); lfoG.connect(f.frequency);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.geyserNode = { src, f, g, lfo };
    }
    this.geyserNode.g.gain.value = 0.24 * intensity;
  },
};
