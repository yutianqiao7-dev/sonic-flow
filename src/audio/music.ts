import { AudioEngine, midiToFreq } from './engine';
import { SONG_BARS } from '../game/types';
import type { Chord, Stage } from '../game/stages';

const LOOKAHEAD = 0.15;
const TICK_MS = 30;

/**
 * BGM をリアルタイム合成するシーケンサー。ステージごとに BPM・コード進行・
 * 音色が変わる。intensity (0-3, コンボ連動) が上がるとローパスフィルターが
 * 開き、ドラムのレイヤーが増えて音楽が「気持ちよく」なっていく。
 */
export class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private songStart = 0;
  private intensity = 0;
  private stage!: Stage;
  private readonly padFilter: BiquadFilterNode;
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) {
    this.engine = engine;
    this.padFilter = engine.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.8;
    engine.out(this.padFilter, 0.35);
  }

  start(stage: Stage, songStart: number): void {
    this.stage = stage;
    this.songStart = songStart;
    this.nextBar = 0;
    this.intensity = 0;
    this.padFilter.frequency.setValueAtTime(600, this.engine.ctx.currentTime);
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** コンボに応じて音の明るさ・厚みを変える (0-3) */
  setIntensity(tier: number): void {
    if (tier === this.intensity && this.timer !== null) return;
    this.intensity = tier;
    const cutoff = 600 + tier * 1400;
    this.padFilter.frequency.setTargetAtTime(cutoff, this.engine.ctx.currentTime, 0.25);
  }

  private tick(): void {
    const now = this.engine.ctx.currentTime;
    const bar = this.stage.bar;
    while (this.nextBar < SONG_BARS) {
      const barTime = this.songStart + this.nextBar * bar;
      if (barTime > now + LOOKAHEAD + bar) break;
      this.scheduleBar(this.nextBar, barTime);
      this.nextBar++;
    }
    if (this.nextBar >= SONG_BARS) {
      this.stop();
    }
  }

  private scheduleBar(bar: number, t: number): void {
    const chord = this.stage.chords[bar % this.stage.chords.length];
    const lastBar = bar === SONG_BARS - 1;
    const beat = this.stage.beat;

    this.schedulePad(chord, t, lastBar);
    this.scheduleBass(chord, t, bar);

    if (bar >= 2 && !lastBar) {
      for (let b = 0; b < 4; b++) {
        this.kick(t + b * beat);
      }
      if (this.intensity >= 2) {
        this.clap(t + beat);
        this.clap(t + 3 * beat);
      }
      if (this.intensity >= 1) {
        const div = this.intensity >= 3 ? 4 : 2;
        for (let i = 0; i < 4 * div; i++) {
          const accent = i % div === 0 ? 0.5 : 1;
          this.hat(t + (i * beat) / div, accent);
        }
      }
    }
    if (lastBar) {
      this.kick(t);
    }
  }

  private schedulePad(chord: Chord, t: number, lastBar: boolean): void {
    const ctx = this.engine.ctx;
    const bar = this.stage.bar;
    const release = lastBar ? bar * 1.5 : 0.4;
    const end = t + bar + release;
    const gain = this.stage.padGain;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.3);
    env.gain.setValueAtTime(gain, t + bar);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(this.padFilter);

    chord.pad.forEach((midi, i) => {
      const osc = ctx.createOscillator();
      osc.type = this.stage.padWave;
      osc.frequency.value = midiToFreq(midi);
      osc.detune.value = i % 2 === 0 ? 5 : -5;
      osc.connect(env);
      osc.start(t);
      osc.stop(end);
    });
  }

  private scheduleBass(chord: Chord, t: number, bar: number): void {
    const ctx = this.engine.ctx;
    const beat = this.stage.beat;
    const freq = midiToFreq(chord.bass);
    const hits = bar >= 2 && this.intensity >= 2 ? [0, 0.75, 1, 2, 2.75, 3] : [0, 2];
    for (const b of hits) {
      const start = t + b * beat;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.22, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(env);
      this.engine.out(env, 0);
      osc.start(start);
      osc.stop(start + 0.6);
    }
  }

  private kick(t: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env);
    this.engine.out(env, 0);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private hat(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const noise = this.noiseSource(0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12 * level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    noise.connect(hp);
    hp.connect(env);
    this.engine.out(env, 0.05);
    noise.start(t);
    noise.stop(t + 0.05);
  }

  private clap(t: number): void {
    const ctx = this.engine.ctx;
    const noise = this.noiseSource(0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.25, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(bp);
    bp.connect(env);
    this.engine.out(env, 0.25);
    noise.start(t);
    noise.stop(t + 0.2);
  }

  private noiseSource(seconds: number): AudioBufferSourceNode {
    const ctx = this.engine.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
