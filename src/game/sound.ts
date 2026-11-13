// Lightweight procedural Web Audio synthesizer (no external audio assets required)
class CityAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private hornOscA: OscillatorNode | null = null;
  private hornOscB: OscillatorNode | null = null;
  private hornFilter: BiquadFilterNode | null = null;
  private hornGain: GainNode | null = null;

  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenLfo: OscillatorNode | null = null;
  private sirenLfoGain: GainNode | null = null;
  private sirenFilter: BiquadFilterNode | null = null;
  private sirenGain: GainNode | null = null;

  private lastScreechTime = 0;

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

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
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
        this.hornFilter = filter;
        this.hornGain = gain;
      } catch {
        // Ignore audio playback errors
      }
    } else if (!active && this.hornGain) {
      const gain = this.hornGain;
      const oscA = this.hornOscA;
      const oscB = this.hornOscB;
      const filter = this.hornFilter;
      this.hornGain = null;
      this.hornOscA = null;
      this.hornOscB = null;
      this.hornFilter = null;
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
            filter?.disconnect();
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

  public setEngine(active: boolean, load: number): void {
    const clampedLoad = Math.max(0, Math.min(1, load));
    const ctx = active ? this.ensureContext() : this.ctx;
    if (!ctx) return;

    const baseFreq = 46 + clampedLoad * 120;
    const cutoff = 600 + clampedLoad * 1400;

    if (active && !this.engineGain) {
      try {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.08);
        gain.connect(ctx.destination);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, now);
        filter.connect(gain);

        const oscA = ctx.createOscillator();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(baseFreq, now);

        const oscB = ctx.createOscillator();
        oscB.type = 'square';
        oscB.frequency.setValueAtTime(baseFreq * 1.5, now);

        oscA.connect(filter);
        oscB.connect(filter);

        oscA.start(now);
        oscB.start(now);

        this.engineOscA = oscA;
        this.engineOscB = oscB;
        this.engineFilter = filter;
        this.engineGain = gain;
      } catch {
        // Ignore audio playback errors
      }
    } else if (active && this.engineGain && this.engineOscA && this.engineOscB && this.engineFilter) {
      try {
        const now = ctx.currentTime;
        this.engineOscA.frequency.setTargetAtTime(baseFreq, now, 0.04);
        this.engineOscB.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
        this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.04);
      } catch {
        // Ignore
      }
    } else if (!active && this.engineGain) {
      const gain = this.engineGain;
      const oscA = this.engineOscA;
      const oscB = this.engineOscB;
      const filter = this.engineFilter;
      this.engineGain = null;
      this.engineOscA = null;
      this.engineOscB = null;
      this.engineFilter = null;
      try {
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        setTimeout(() => {
          try {
            oscA?.stop();
            oscB?.stop();
            oscA?.disconnect();
            oscB?.disconnect();
            filter?.disconnect();
            gain.disconnect();
          } catch {
            // Ignore cleanup errors
          }
        }, 100);
      } catch {
        // Ignore
      }
    }
  }

  public setSiren(active: boolean): void {
    const ctx = active ? this.ensureContext() : this.ctx;
    if (!ctx) return;

    if (active && !this.sirenGain) {
      try {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.08);
        gain.connect(ctx.destination);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.connect(gain);

        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(680, now);
        osc.connect(filter);

        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.setValueAtTime(0.9, now);

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(190, now);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.start(now);
        lfo.start(now);

        this.sirenOsc = osc;
        this.sirenLfo = lfo;
        this.sirenLfoGain = lfoGain;
        this.sirenFilter = filter;
        this.sirenGain = gain;
      } catch {
        // Ignore
      }
    } else if (!active && this.sirenGain) {
      const gain = this.sirenGain;
      const osc = this.sirenOsc;
      const lfo = this.sirenLfo;
      const lfoGain = this.sirenLfoGain;
      const filter = this.sirenFilter;
      this.sirenGain = null;
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenLfoGain = null;
      this.sirenFilter = null;
      try {
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        setTimeout(() => {
          try {
            osc?.stop();
            lfo?.stop();
            osc?.disconnect();
            lfo?.disconnect();
            lfoGain?.disconnect();
            filter?.disconnect();
            gain.disconnect();
          } catch {
            // Ignore cleanup errors
          }
        }, 100);
      } catch {
        // Ignore
      }
    }
  }

  public playCrash(strength: number): void {
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = this.getNoiseBuffer(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320 + s * 2200, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.001, 0.4 * s), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start(now);
      source.stop(now + 0.46);
    } catch {
      // Ignore
    }
  }

  public playScreech(): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastScreechTime < 500) return;

    const ctx = this.ensureContext();
    if (!ctx) return;
    this.lastScreechTime = nowMs;

    try {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = this.getNoiseBuffer(ctx);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2600, now);
      filter.Q.setValueAtTime(3.5, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      source.start(now);
      source.stop(now + 0.46);
    } catch {
      // Ignore
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
    const stopImmediate = (
      nodes: { stop?: () => void; disconnect: () => void }[]
    ) => {
      for (const n of nodes) {
        try {
          n.stop?.();
        } catch {
          // Ignore
        }
        try {
          n.disconnect();
        } catch {
          // Ignore
        }
      }
    };

    if (this.hornOscA || this.hornOscB || this.hornFilter || this.hornGain) {
      stopImmediate(
        [this.hornOscA, this.hornOscB, this.hornFilter, this.hornGain].filter(
          Boolean
        ) as { stop?: () => void; disconnect: () => void }[]
      );
      this.hornOscA = null;
      this.hornOscB = null;
      this.hornFilter = null;
      this.hornGain = null;
    }

    if (this.engineOscA || this.engineOscB || this.engineFilter || this.engineGain) {
      stopImmediate(
        [this.engineOscA, this.engineOscB, this.engineFilter, this.engineGain].filter(
          Boolean
        ) as { stop?: () => void; disconnect: () => void }[]
      );
      this.engineOscA = null;
      this.engineOscB = null;
      this.engineFilter = null;
      this.engineGain = null;
    }

    if (
      this.sirenOsc ||
      this.sirenLfo ||
      this.sirenLfoGain ||
      this.sirenFilter ||
      this.sirenGain
    ) {
      stopImmediate(
        [
          this.sirenOsc,
          this.sirenLfo,
          this.sirenLfoGain,
          this.sirenFilter,
          this.sirenGain,
        ].filter(Boolean) as { stop?: () => void; disconnect: () => void }[]
      );
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenLfoGain = null;
      this.sirenFilter = null;
      this.sirenGain = null;
    }

    this.noiseBuffer = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const cityAudio = new CityAudioEngine();
