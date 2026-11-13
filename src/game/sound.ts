// Lightweight procedural Web Audio synthesizer (no external audio assets required)
class CityAudioEngine {
  private ctx: AudioContext | null = null;
  private hornOscA: OscillatorNode | null = null;
  private hornOscB: OscillatorNode | null = null;
  private hornGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setHorn(active: boolean): void {
    const ctx = active ? this.ensureContext() : this.ctx;
    if (!ctx) return;

    if (active && !this.hornGain) {
      try {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.03);
        gain.connect(ctx.destination);

        const oscA = ctx.createOscillator();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(415, ctx.currentTime);

        const oscB = ctx.createOscillator();
        oscB.type = 'triangle';
        oscB.frequency.setValueAtTime(523, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, ctx.currentTime);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(gain);

        oscA.start();
        oscB.start();

        this.hornOscA = oscA;
        this.hornOscB = oscB;
        this.hornGain = gain;
      } catch {
        // Ignore audio playback errors
      }
    } else if (!active && this.hornGain) {
      const gain = this.hornGain;
      const oscA = this.hornOscA;
      const oscB = this.hornOscB;
      this.hornGain = null;
      this.hornOscA = null;
      this.hornOscB = null;
      try {
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        setTimeout(() => {
          try {
            oscA?.stop();
            oscB?.stop();
            oscA?.disconnect();
            oscB?.disconnect();
            gain.disconnect();
          } catch {
            // Ignore cleanup errors
          }
        }, 80);
      } catch {
        // Ignore
      }
    }
  }

  public playViolationChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.setValueAtTime(540, now + 0.11);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  public dispose(): void {
    this.setHorn(false);
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const cityAudio = new CityAudioEngine();
