/**
 * Synthesized tactical Web Audio engine:
 * - Realistic multi-harmonic FPV quadrotor motor buzz + airflow noise
 * - Layered ballistics, supersonic bullet near-miss cracks, sub-bass explosions
 * - Radio squelch clicks, hitmarker ticks, kill confirm tones, and low-battery warnings
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private motorPrimaryOsc: OscillatorNode | null = null;
  private motorHarmonicOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastNearMissTime = 0;
  private lastLowBatBeep = 0;
  private lastDeathScreamTime = 0;
  private lastVocalAlertTime = 0;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.85;
    this.masterGain.connect(this.ctx.destination);

    // Pre-bake reusable white noise buffer (1.5s)
    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // FPV brushless quad-motor layered synthesis
    this.motorPrimaryOsc = this.ctx.createOscillator();
    this.motorPrimaryOsc.type = 'sawtooth';
    this.motorPrimaryOsc.frequency.value = 115;

    this.motorHarmonicOsc = this.ctx.createOscillator();
    this.motorHarmonicOsc.type = 'triangle';
    this.motorHarmonicOsc.frequency.value = 232;

    const motorFilter = this.ctx.createBiquadFilter();
    motorFilter.type = 'bandpass';
    motorFilter.frequency.value = 420;
    motorFilter.Q.value = 1.1;

    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.value = 0;

    this.motorPrimaryOsc.connect(motorFilter);
    this.motorHarmonicOsc.connect(motorFilter);
    motorFilter.connect(this.motorGain);
    this.motorGain.connect(this.masterGain);

    this.motorPrimaryOsc.start();
    this.motorHarmonicOsc.start();

    // Airframe wind rush
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = this.noiseBuffer;
    this.windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.7;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windSource.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.85,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateEngine(
    speedRatio: number,
    isBoosting: boolean,
    silenced = false,
    maneuverLoad = 0
  ): void {
    if (!this.ctx || !this.motorPrimaryOsc || !this.motorHarmonicOsc || !this.motorGain)
      return;

    const t = this.ctx.currentTime;
    if (silenced || this.muted) {
      this.motorGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }

    const baseFreq =
      108 + speedRatio * 140 + (isBoosting ? 88 : 0) + maneuverLoad * 32;
    this.motorPrimaryOsc.frequency.setTargetAtTime(baseFreq, t, 0.06);
    this.motorHarmonicOsc.frequency.setTargetAtTime(baseFreq * 2.02, t, 0.06);
    this.motorGain.gain.setTargetAtTime(
      0.024 + speedRatio * 0.025 + (isBoosting ? 0.015 : 0),
      t,
      0.06
    );

    if (this.windFilter && this.windGain) {
      this.windFilter.frequency.setTargetAtTime(
        260 + speedRatio * 1100 + (isBoosting ? 450 : 0),
        t,
        0.08
      );
      this.windGain.gain.setTargetAtTime(
        0.008 + speedRatio * 0.032 + (isBoosting ? 0.018 : 0),
        t,
        0.08
      );
    }
  }

  stopEngine(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.motorGain) this.motorGain.gain.setTargetAtTime(0, t, 0.05);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
  }

  playShoot(isEnemy = false, isAlly = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;

    // Punchy crack oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isEnemy ? 'sawtooth' : isAlly ? 'square' : 'triangle';
    const startFreq = (isEnemy ? 340 : isAlly ? 460 : 760) * pitchJitter;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.095);

    const vol = isEnemy ? 0.045 : isAlly ? 0.04 : 0.095;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.1);

    // Powder transient noise burst for realism
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isEnemy ? 1100 : 1800;
      filter.Q.value = 0.8;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(isEnemy ? 0.04 : 0.08, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.08);
    }
  }

  playNearMiss(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = performance.now();
    if (now - this.lastNearMissTime < 220) return;
    this.lastNearMissTime = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.08);
    gain.gain.setValueAtTime(0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  playHitMarker(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1650, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.045);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  playKillConfirm(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    [980, 1340].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const start = this.ctx.currentTime + i * 0.085;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.125);
    });
  }

  playRadioSquelch(): void {
    if (!this.ctx || !this.masterGain || this.muted || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    src.stop(t + 0.075);
  }

  playLowBatteryBeep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = performance.now();
    if (now - this.lastLowBatBeep < 1400) return;
    this.lastLowBatBeep = now;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.095);
  }

  playExplosion(intensity = 1): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const scale = Math.max(0.35, Math.min(1.4, intensity));

    // Sub-bass concussion thump
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.45);
    subGain.gain.setValueAtTime(0.38 * scale, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.52);

    // Filtered blast roar & debris tail
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.78);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] =
        (Math.random() * 2 - 1) *
        Math.exp(-i / (this.ctx.sampleRate * 0.22));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, t);
    filter.frequency.exponentialRampToValueAtTime(65, t + 0.72);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.34 * scale, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.76);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
  }

  playWallBump(intensity = 0.6): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const scale = Math.max(0.25, Math.min(1.0, intensity));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    gain.gain.setValueAtTime(0.22 * scale, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  playLaserLockWarning(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = performance.now();
    if (now - this.lastLowBatBeep < 900) return;
    this.lastLowBatBeep = now;

    [1950, 2320].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    });
  }

  playArtilleryDistant(): void {
    if (!this.ctx || !this.masterGain || this.muted || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, t);
    filter.frequency.exponentialRampToValueAtTime(55, t + 0.65);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.68);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    src.stop(t + 0.7);
  }

  playAllyKIAAlert(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    [520, 390, 280].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + i * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }

  playSquadOrderChirp(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    [1180, 1520].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const t = this.ctx.currentTime + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.055);
    });
  }

  playEnemyDeathScream(
    distanceMeters = 25,
    archetype: 'ASSAULT' | 'SNIPER' | 'HEAVY' = 'ASSAULT'
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = performance.now();
    if (now - this.lastDeathScreamTime < 180) return;
    this.lastDeathScreamTime = now;

    const atten = Math.max(0.22, Math.min(1.0, 1 / (1 + Math.max(0, distanceMeters - 6) * 0.026)));
    const t = this.ctx.currentTime;
    const duration = 0.42 + Math.random() * 0.18;

    const basePitch =
      archetype === 'HEAVY'
        ? 122 + Math.random() * 20
        : archetype === 'SNIPER'
        ? 210 + Math.random() * 32
        : 168 + Math.random() * 28;

    // Vocal cord fundamental dropping sharply in pain
    const cord = this.ctx.createOscillator();
    cord.type = 'sawtooth';
    cord.frequency.setValueAtTime(basePitch * 1.15, t);
    cord.frequency.exponentialRampToValueAtTime(basePitch * 0.85, t + 0.12);
    cord.frequency.exponentialRampToValueAtTime(Math.max(58, basePitch * 0.46), t + duration);

    // Dual vocal-tract formant resonators ("Aaaghh")
    const formant1 = this.ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.setValueAtTime(780, t);
    formant1.frequency.linearRampToValueAtTime(460, t + duration);
    formant1.Q.value = 3.2;

    const formant2 = this.ctx.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.setValueAtTime(1420, t);
    formant2.frequency.linearRampToValueAtTime(920, t + duration);
    formant2.Q.value = 4.0;

    const vocalGain = this.ctx.createGain();
    vocalGain.gain.setValueAtTime(0.001, t);
    vocalGain.gain.linearRampToValueAtTime(0.24 * atten, t + 0.025);
    vocalGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    cord.connect(formant1);
    cord.connect(formant2);
    formant1.connect(vocalGain);
    formant2.connect(vocalGain);
    vocalGain.connect(this.masterGain);
    cord.start(t);
    cord.stop(t + duration + 0.02);

    // Raspy breath exhale layer
    if (this.noiseBuffer) {
      const breath = this.ctx.createBufferSource();
      breath.buffer = this.noiseBuffer;
      const bFilter = this.ctx.createBiquadFilter();
      bFilter.type = 'bandpass';
      bFilter.frequency.setValueAtTime(1150, t);
      bFilter.Q.value = 1.6;
      const bGain = this.ctx.createGain();
      bGain.gain.setValueAtTime(0.09 * atten, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.85);

      breath.connect(bFilter);
      bFilter.connect(bGain);
      bGain.connect(this.masterGain);
      breath.start(t);
      breath.stop(t + duration);
    }
  }

  playSoldierVocalAlert(distanceMeters = 20): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = performance.now();
    if (now - this.lastVocalAlertTime < 650) return;
    this.lastVocalAlertTime = now;

    const atten = Math.max(0.2, Math.min(0.95, 1 / (1 + Math.max(0, distanceMeters - 6) * 0.03)));
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190 + Math.random() * 25, t);
    osc.frequency.exponentialRampToValueAtTime(145, t + 0.16);

    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 920;
    formant.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12 * atten, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  playRocketLaunch(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(92, t + 0.34);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.37);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.frequency.exponentialRampToValueAtTime(420, t + 0.36);
      filter.Q.value = 1.2;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.18, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.4);
    }
  }

  playGrenadeThrow(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.12);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  playBarrelExplosion(): void {
    this.playExplosion(1.38);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
