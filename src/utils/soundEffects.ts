/**
  * 8-Bit Classic Terminal Synthesizer (Web Audio API)
  * Supports sound themes ('ibm-pc', 'c64-synth', 'modern-ui') and custom WAV notification imports.
  */

export type SoundTheme = 'ibm-pc' | 'c64-synth' | 'modern-ui';

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private soundTheme: SoundTheme = 'ibm-pc';
  private volume: number = 0.15;
  private customAudioBuffer: AudioBuffer | null = null;
  private customSoundName: string | null = null;

  constructor() {
    const savedMute = localStorage.getItem('termbrowser_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
    }
    const savedTheme = localStorage.getItem('termbrowser_sound_theme') as SoundTheme | null;
    if (savedTheme && ['ibm-pc', 'c64-synth', 'modern-ui'].includes(savedTheme)) {
      this.soundTheme = savedTheme;
    }

    // Restore custom WAV from localStorage if saved
    const savedWav = localStorage.getItem('termbrowser_custom_wav_data');
    const savedName = localStorage.getItem('termbrowser_custom_wav_name');
    if (savedWav && savedName) {
      this.customSoundName = savedName;
      this.decodeBase64Audio(savedWav).catch(() => {
        this.customAudioBuffer = null;
        this.customSoundName = null;
      });
    }
  }

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private async decodeBase64Audio(base64Data: string) {
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const res = await fetch(base64Data);
      const arrayBuf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      this.customAudioBuffer = decoded;
    } catch {}
  }

  public async loadCustomWavFile(file: File): Promise<{ success: boolean; message: string }> {
    if (!file.type.includes('audio') && !file.name.toLowerCase().endsWith('.wav')) {
      return { success: false, message: 'El archivo seleccionado no es un audio WAV válido.' };
    }
    if (file.size > 1024 * 1024) {
      return { success: false, message: 'El archivo WAV es demasiado grande (máximo 1MB recomendado para notificaciones).' };
    }

    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = this.initCtx();
      if (!ctx) return { success: false, message: 'AudioContext no disponible.' };

      const decoded = await ctx.decodeAudioData(arrayBuf);
      this.customAudioBuffer = decoded;
      this.customSoundName = file.name;

      // Save to localStorage as Data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          try {
            localStorage.setItem('termbrowser_custom_wav_data', dataUrl);
            localStorage.setItem('termbrowser_custom_wav_name', file.name);
          } catch {}
        }
      };
      reader.readAsDataURL(file);

      // Play test sound
      this.playCustomSound();

      return { success: true, message: `Sonido personalizado "${file.name}" cargado y establecido como notificación.` };
    } catch (err: any) {
      return { success: false, message: `Error al decodificar WAV: ${err.message || 'Formato no soportado'}` };
    }
  }

  public getCustomSoundName(): string | null {
    return this.customSoundName;
  }

  public clearCustomSound(): void {
    this.customAudioBuffer = null;
    this.customSoundName = null;
    try {
      localStorage.removeItem('termbrowser_custom_wav_data');
      localStorage.removeItem('termbrowser_custom_wav_name');
    } catch {}
  }

  public playCustomSound(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx || !this.customAudioBuffer) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = this.customAudioBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 1.5, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {}
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('termbrowser_muted', String(this.isMuted));
    if (!this.isMuted) {
      this.playBeep(880, 0.05, 'triangle');
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    localStorage.setItem('termbrowser_muted', String(muted));
  }

  public getSoundTheme(): SoundTheme {
    return this.soundTheme;
  }

  public setSoundTheme(theme: SoundTheme): void {
    this.soundTheme = theme;
    localStorage.setItem('termbrowser_sound_theme', theme);
    if (!this.isMuted) {
      this.playBoot();
    }
  }

  private getWaveType(defaultType: OscillatorType): OscillatorType {
    if (this.soundTheme === 'ibm-pc') return 'square';
    if (this.soundTheme === 'c64-synth') return 'sawtooth';
    return 'sine';
  }

  // Key press mechanical click
  public playKeyClick(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType('triangle');
      const baseFreq = this.soundTheme === 'modern-ui' ? 600 : this.soundTheme === 'c64-synth' ? 1400 : 1200;
      osc.frequency.setValueAtTime(baseFreq + Math.random() * 300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.015);

      const volMult = this.soundTheme === 'modern-ui' ? 0.08 : 0.18;
      gain.gain.setValueAtTime(this.volume * volMult, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.018);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch {}
  }

  // Command Execution Blip
  public playExecute(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType('square');
      const startFreq = this.soundTheme === 'modern-ui' ? 523.25 : 987.77;
      const endFreq = this.soundTheme === 'modern-ui' ? 659.25 : 1318.51;

      osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
      osc.frequency.setValueAtTime(endFreq, ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.085);
    } catch {}
  }

  // Error Buzzer
  public playError(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.soundTheme === 'modern-ui' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(this.soundTheme === 'modern-ui' ? 220 : 150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(this.soundTheme === 'modern-ui' ? 160 : 110, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(this.volume * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }

  // Tab switch frequency slide
  public playTabSwitch(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType('sine');
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(this.volume * 0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.075);
    } catch {}
  }

  // Retro notification bell (Uses custom WAV if loaded, otherwise synthesized bell)
  public playNotification(): void {
    if (this.isMuted) return;
    if (this.customAudioBuffer) {
      this.playCustomSound();
      return;
    }

    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = this.soundTheme === 'modern-ui' ? [523.25, 659.25, 783.99] : [587.33, 880, 1174.66];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = this.getWaveType('sine');
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(this.volume * 0.25, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.2);
      });
    } catch {}
  }

  // Anomaly alarm
  public playAnomalyAlert(): void {
    if (this.isMuted) return;
    if (this.customAudioBuffer) {
      this.playCustomSound();
      return;
    }

    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType('square');
      osc.frequency.setValueAtTime(1760, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      osc.frequency.setValueAtTime(1760, now + 0.16);

      gain.gain.setValueAtTime(this.volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.26);
    } catch {}
  }

  // Classic BIOS Boot POST Beep
  public playBoot(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType('square');
      osc.frequency.setValueAtTime(this.soundTheme === 'modern-ui' ? 523.25 : 900, now);

      gain.gain.setValueAtTime(this.volume * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.19);
    } catch {}
  }

  public playVoiceStart(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = this.getWaveType('sine');
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.12);
      gain.gain.setValueAtTime(this.volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.16);
    } catch {}
  }

  public playVoiceRecognized(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = this.getWaveType('triangle');
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.0, now + 0.06);
      osc.frequency.setValueAtTime(1174.66, now + 0.12);
      gain.gain.setValueAtTime(this.volume * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.21);
    } catch {}
  }

  public playVoiceError(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = this.getWaveType('sawtooth');
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
      gain.gain.setValueAtTime(this.volume * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.19);
    } catch {}
  }

  public playBeep(freq = 440, duration = 0.05, type: OscillatorType = 'sine'): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = this.getWaveType(type);
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }
}

export const soundEffects = new SoundSynthesizer();
