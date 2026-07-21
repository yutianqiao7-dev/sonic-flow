import { AudioEngine, midiToFreq } from './engine';
import { SONG_BARS } from '../game/types';
import type { Chord, Stage } from '../game/stages';

const LOOKAHEAD = 0.15;
const TICK_MS = 30;

/** アルペジオのステップ (コード構成音+オクターブ配列へのインデックス) */
const ARP_PATTERNS: number[][] = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 4, 2, 1, 3, 4, 3],
  [4, 3, 2, 1, 0, 1, 2, 3],
];

/**
 * BGM をリアルタイム合成するシーケンサー。ステージごとに BPM・コード進行・
 * 音色が変わる。intensity (0-3, コンボ連動) が上がるとフィルターが開き、
 * ドラム・アルペジオのレイヤーが増えて音楽が「気持ちよく」なっていく。
 *
 * キック毎にサイドチェイン風のポンプ (pad/bass/arp が軽く沈んで戻る) をかけ、
 * グルーヴに躍動感を出している。
 */
export class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private songStart = 0;
  private intensity = 0;
  private stage!: Stage;
  private readonly padFilter: BiquadFilterNode;
  /** pad/bass/arp をまとめる母線。ここにポンプをかける */
  private readonly musicBus: GainNode;
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) {
    this.engine = engine;

    this.musicBus = engine.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(engine.master);
    // 母線にだけ薄くリバーブ (ドライは上のダイレクト接続)
    engine.sendReverb(this.musicBus, 0.18);

    this.padFilter = engine.ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.musicBus);
    engine.sendReverb(this.padFilter, 0.3);
  }

  start(stage: Stage, songStart: number): void {
    this.stage = stage;
    this.songStart = songStart;
    this.nextBar = 0;
    this.intensity = 0;
    this.padFilter.frequency.setValueAtTime(600, this.engine.ctx.currentTime);
    this.musicBus.gain.cancelScheduledValues(this.engine.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(1, this.engine.ctx.currentTime);
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
    const cutoff = 700 + tier * 1500;
    this.padFilter.frequency.setTargetAtTime(cutoff, this.engine.ctx.currentTime, 0.25);
  }

  /**
   * いま鳴っているコードの構成音 (MIDI) を返す。ジャンプ音を
   * これに合わせると必ず和声的に調和する。停止中は先頭コード。
   */
  currentTones(now: number): number[] {
    if (!this.stage) return [60, 64, 67];
    const elapsed = now; // songStart 基準の秒数 (= songTime)
    const barIdx = Math.max(0, Math.floor(elapsed / this.stage.bar));
    return this.stage.chords[barIdx % this.stage.chords.length].pad;
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
    const drums = bar >= 2 && !lastBar;

    this.schedulePad(chord, t, lastBar);
    this.scheduleBass(chord, t, bar);

    if (this.intensity >= 1 && drums) {
      this.scheduleArp(chord, t, bar);
    }

    if (drums) {
      for (let b = 0; b < 4; b++) {
        this.kick(t + b * beat);
        this.pump(t + b * beat);
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

  /** キック位置で母線をサッと沈めて戻す (サイドチェイン風) */
  private pump(t: number): void {
    const beat = this.stage.beat;
    const depth = 0.45 - this.intensity * 0.04; // 盛り上がるほど深く沈む
    const g = this.musicBus.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(depth, t + 0.03);
    g.linearRampToValueAtTime(1, t + beat * 0.7);
  }

  private schedulePad(chord: Chord, t: number, lastBar: boolean): void {
    const ctx = this.engine.ctx;
    const bar = this.stage.bar;
    const release = lastBar ? bar * 1.5 : 0.4;
    const end = t + bar + release;
    const gain = this.stage.padGain;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.35);
    env.gain.setValueAtTime(gain, t + bar);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(this.padFilter);

    // 3声のデチューンで厚みを出す
    chord.pad.forEach((midi, i) => {
      for (const cents of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = this.stage.padWave;
        osc.frequency.value = midiToFreq(midi);
        osc.detune.value = cents + (i % 2 === 0 ? 2 : -2);
        osc.connect(env);
        osc.start(t);
        osc.stop(end);
      }
    });
  }

  /** やさしいアルペジオのメロディ層。コード構成音を8分でなぞる */
  private scheduleArp(chord: Chord, t: number, bar: number): void {
    const ctx = this.engine.ctx;
    const beat = this.stage.beat;
    // コード構成音 (上2声) + オクターブ上でスケールを作る
    const top = chord.pad.slice(-3);
    const scale = [top[0], top[1], top[2], top[0] + 12, top[1] + 12];
    const pattern = ARP_PATTERNS[bar % ARP_PATTERNS.length];
    const level = this.intensity >= 3 ? 0.075 : 0.055;

    for (let i = 0; i < 8; i++) {
      const start = t + (i * beat) / 2;
      const midi = scale[pattern[i]];
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(midi + 12);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(level, start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(env);
      env.connect(this.musicBus);
      this.engine.sendReverb(env, 0.35);
      osc.start(start);
      osc.stop(start + 0.3);
    }
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
      env.connect(this.musicBus);
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
    env.gain.setValueAtTime(0.1 * level, t);
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
    env.gain.setValueAtTime(0.22, t);
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
