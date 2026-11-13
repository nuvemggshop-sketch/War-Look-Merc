/**
 * Sintetizador de audio táctico (Web Audio API)
 * Genera zumbido de motores FPV, disparos, explosiones, pitido de confirmación de baja y estática.
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.engineOsc = null;
        this.engineGain = null;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 95;
        this.engineGain.gain.value = 0.03;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 340;

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
    }

    updateEngine(speedRatio, isBoosting, muted = false) {
        if (!this.ctx || !this.engineOsc) return;
        if (muted) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
            return;
        }
        const targetFreq = 92 + (speedRatio * 145) + (isBoosting ? 80 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
        this.engineGain.gain.setTargetAtTime(0.03 + speedRatio * 0.03, this.ctx.currentTime, 0.08);
    }

    stopEngine() {
        if (this.engineGain && this.ctx) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        }
    }

    playShoot(isEnemy = false) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = isEnemy ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(isEnemy ? 390 : 820, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.11);

        gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.11);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.11);
    }

    playKillConfirm() {
        if (!this.ctx) return;
        // Doble tono táctico agudo de confirmación de baja
        [980, 1320].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            const start = this.ctx.currentTime + i * 0.09;
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.14, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.12);
        });
    }

    playExplosion() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.65;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.18));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(480, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(55, this.ctx.currentTime + 0.6);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.38, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.62);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }
}