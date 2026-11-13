import type { SoundManager } from './audio';
import type { RadioSpeaker } from './types';

export interface VoiceTransmission {
  speaker: RadioSpeaker;
  callsign: string;
  text: string;
  durationMs?: number;
}

/**
 * Spanish Tactical Radio & Battlefield Voice Synthesizer using Web Speech API
 * layered with walkie-talkie PTT static squelch from SoundManager.
 */
export class TacticalVoiceManager {
  private sound: SoundManager;
  private muted = false;
  private userUnlocked = false;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private secondaryVoice: SpeechSynthesisVoice | null = null;
  private queue: Array<Required<VoiceTransmission>> = [];
  private speaking = false;
  private activeTimer: number | null = null;
  private lastEnemyVoiceMs = 0;
  private lastAllyVoiceMs = 0;

  public onTransmissionDisplay:
    | ((tx: Required<VoiceTransmission>) => void)
    | null = null;

  constructor(sound: SoundManager) {
    this.sound = sound;
    this.pickSpanishVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.(
        'voiceschanged',
        this.handleVoicesChanged
      );
    }
  }

  private handleVoicesChanged = (): void => {
    this.pickSpanishVoices();
  };

  private pickSpanishVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      const spanishVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith('es')
      );
      if (spanishVoices.length === 0) {
        this.preferredVoice = null;
        this.secondaryVoice = null;
        return;
      }

      const scoreVoice = (v: SpeechSynthesisVoice): number => {
        let score = 0;
        if (/es[-_](MX|419|ES|US|AR|CO)/i.test(v.lang)) score += 3;
        if (/Google|Microsoft|Natural|Online/i.test(v.name)) score += 4;
        if (v.localService) score += 1;
        return score;
      };

      spanishVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
      this.preferredVoice = spanishVoices[0] ?? null;
      this.secondaryVoice = spanishVoices[1] ?? spanishVoices[0] ?? null;
    } catch {
      this.preferredVoice = null;
      this.secondaryVoice = null;
    }
  }

  unlock(): void {
    this.userUnlocked = true;
    this.pickSpanishVoices();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.clear();
    }
  }

  clear(): void {
    this.queue = [];
    this.speaking = false;
    if (this.activeTimer !== null) {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe no-op
      }
    }
  }

  speak(tx: VoiceTransmission, urgent = false): void {
    const entry: Required<VoiceTransmission> = {
      speaker: tx.speaker,
      callsign: tx.callsign,
      text: tx.text,
      durationMs: tx.durationMs ?? Math.max(4200, Math.min(7200, tx.text.length * 68)),
    };

    if (urgent) {
      this.clear();
      this.queue.unshift(entry);
    } else {
      if (this.queue.length >= 3) {
        this.queue.shift();
      }
      this.queue.push(entry);
    }

    if (!this.speaking) {
      this.processNext();
    }
  }

  private processNext(): void {
    const next = this.queue.shift();
    if (!next) {
      this.speaking = false;
      return;
    }

    this.speaking = true;
    this.sound.playRadioSquelch();
    this.onTransmissionDisplay?.(next);

    const canSpeak =
      !this.muted &&
      this.userUnlocked &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined';

    if (!canSpeak) {
      this.activeTimer = window.setTimeout(() => {
        this.speaking = false;
        this.processNext();
      }, Math.min(next.durationMs, 3200));
      return;
    }

    try {
      const utter = new SpeechSynthesisUtterance(next.text);
      const voice =
        next.speaker === 'ESCUADRÓN' && this.secondaryVoice
          ? this.secondaryVoice
          : this.preferredVoice;
      utter.lang = voice?.lang ?? 'es-ES';
      if (voice) {
        utter.voice = voice;
      }

      if (next.speaker === 'COMANDANTE') {
        utter.pitch = 0.84;
        utter.rate = 1.02;
      } else if (next.speaker === 'OPERADOR') {
        utter.pitch = 1.05;
        utter.rate = 1.08;
      } else {
        utter.pitch = 0.96;
        utter.rate = 1.07;
      }
      utter.volume = 0.92;

      let finished = false;
      const complete = () => {
        if (finished) return;
        finished = true;
        if (this.activeTimer !== null) {
          window.clearTimeout(this.activeTimer);
          this.activeTimer = null;
        }
        this.sound.playRadioSquelch();
        this.activeTimer = window.setTimeout(() => {
          this.speaking = false;
          this.processNext();
        }, 280);
      };

      utter.onend = complete;
      utter.onerror = complete;
      this.activeTimer = window.setTimeout(complete, next.durationMs + 1200);
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utter);
    } catch {
      this.activeTimer = window.setTimeout(() => {
        this.speaking = false;
        this.processNext();
      }, 2600);
    }
  }

  /**
   * Speaks tactical Spanish combat callouts from allies (squadmates) or nearby soldiers
   * without interrupting urgent Commander radio traffic.
   */
  speakCombatCallout(
    text: string,
    kind: 'ally' | 'enemy',
    distanceMeters: number
  ): void {
    const now = performance.now();
    if (kind === 'ally') {
      if (now - this.lastAllyVoiceMs < 2400) return;
    } else {
      if (now - this.lastEnemyVoiceMs < 1500) return;
    }
    if (this.speaking || this.queue.length > 0) return;
    if (
      this.muted ||
      !this.userUnlocked ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return;
    }

    if (kind === 'ally') {
      this.lastAllyVoiceMs = now;
    } else {
      this.lastEnemyVoiceMs = now;
    }

    try {
      const utter = new SpeechSynthesisUtterance(text);
      const voice =
        kind === 'ally' && this.secondaryVoice
          ? this.secondaryVoice
          : this.preferredVoice;
      utter.lang = voice?.lang ?? 'es-ES';
      if (voice) {
        utter.voice = voice;
      }
      if (kind === 'ally') {
        utter.pitch = 0.92 + Math.random() * 0.14;
        utter.rate = 1.12;
        utter.volume = Math.max(0.45, Math.min(0.9, 0.92 - distanceMeters * 0.005));
      } else {
        utter.pitch = 0.78 + Math.random() * 0.28;
        utter.rate = 1.2 + Math.random() * 0.14;
        utter.volume = Math.max(0.28, Math.min(0.95, 0.98 - distanceMeters * 0.008));
      }
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utter);
    } catch {
      // Safe fallback
    }
  }

  /**
   * Speaks brief shouted Spanish last words or combat warning from a dying/panicking soldier.
   */
  speakEnemyLastWords(text: string, distanceMeters: number): void {
    this.speakCombatCallout(text, 'enemy', distanceMeters);
  }

  dispose(): void {
    this.clear();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.removeEventListener?.(
        'voiceschanged',
        this.handleVoicesChanged
      );
    }
  }
}
