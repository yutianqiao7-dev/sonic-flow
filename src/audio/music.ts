import { AudioEngine, midiToFreq } from './engine';
import { SONG_BARS } from '../game/types';
import type { Chord, Stage } from '../game/stages';

const LOOKAHEAD = 0.15;
const TICK_MS = 30;

/**
 * BGM をリアルタイム合成するシーケンサー。ステージの genre によって
 * ドラムパターン・ベースの奏法・和音の鳴らし方・スウィング・サイドチェインが
 * ガラッと変わり、JAZZ / EDM / DnB が別物の音楽として鳴る。
 *
 * intensity (0-3, コンボ連動) が上がるとフィルターが開き、レイヤーが増えて
 * 音楽が「気持ちよく」なっていく。
 */
export class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private songStart = 0;
  private intensity = 0;
  private stage!: Stage;
  private readonly padFilter: BiquadFilterNode;
  /** pad/bass/lead をまとめる母線。ここにポンプ (サイドチェイン) をかける */
  private readonly musicBus: GainNode;
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) {
    this.engine = engine;

    this.musicBus = engine.ctx.createGain();
    this.musicBus.gain.value = 1;
    this.musicBus.connect(engine.master);
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

  setIntensity(tier: number): void {
    if (tier === this.intensity && this.timer !== null) return;
    this.intensity = tier;
    const cutoff = 700 + tier * 1500;
    this.padFilter.frequency.setTargetAtTime(cutoff, this.engine.ctx.currentTime, 0.25);
  }

  /** いま鳴っているコードの構成音 (MIDI)。ジャンプ音の調和に使う */
  currentTones(now: number): number[] {
    if (!this.stage) return [60, 64, 67];
    const barIdx = Math.max(0, Math.floor(now / this.stage.bar));
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

  /** 8分の位置 pos(拍) をスウィングを反映した時刻に変換 */
  private posTime(t0: number, pos: number): number {
    const beat = this.stage.beat;
    const whole = Math.floor(pos);
    const frac = pos - whole;
    // 「ウラ」(x.5) だけハネさせる
    const f = Math.abs(frac - 0.5) < 1e-6 ? this.stage.swing : frac;
    return t0 + (whole + f) * beat;
  }

  private scheduleBar(bar: number, t: number): void {
    const chord = this.stage.chords[bar % this.stage.chords.length];
    const next = this.stage.chords[(bar + 1) % this.stage.chords.length];
    const lastBar = bar === SONG_BARS - 1;
    const active = bar >= 2 && !lastBar;

    switch (this.stage.genre) {
      case 'jazz':
        this.arrangeJazz(chord, next, t, bar, active, lastBar);
        break;
      case 'edm':
        this.arrangeEdm(chord, t, bar, active, lastBar);
        break;
      case 'dnb':
        this.arrangeDnb(chord, t, active, lastBar);
        break;
    }
  }

  // ============================== JAZZ ==============================
  // ゆったりスイング。ウォーキングベース + ブラシのドラム + Rhodes風コンピング。
  private arrangeJazz(chord: Chord, next: Chord, t: number, bar: number, active: boolean, lastBar: boolean): void {
    this.padChord(chord, t, lastBar, 0.5); // 柔らかいロングパッド (控えめ)

    // Rhodes 風コンピング: 裏拍で短くコードを差し込む
    if (active) {
      for (const pos of [1.5, 2.5, 3.5]) {
        if (Math.random() < 0.75) this.rhodesStab(chord, this.posTime(t, pos));
      }
    } else {
      this.rhodesStab(chord, t);
    }

    // ウォーキングベース: 4分でコードトーン + 次コードへのクロマチック・アプローチ
    if (bar >= 1) {
      const beat = this.stage.beat;
      const line = this.walkingLine(chord, next);
      for (let b = 0; b < 4; b++) {
        this.uprightBass(midiToFreq(line[b]), t + b * beat);
      }
    }

    if (active) {
      const beat = this.stage.beat;
      // 軽いキック (フェザー) を 1 と 3 に
      this.kick(t, 0.28);
      this.kick(t + 2 * beat, 0.24);
      // ブラシのスネアを 2 と 4
      this.snare(t + beat, 0.18, true);
      this.snare(t + 3 * beat, 0.2, true);
      // スイングしたライドのパターン (チーンチッチ)
      for (let b = 0; b < 4; b++) {
        this.ride(t + b * beat, 0.14);
        if (this.intensity >= 1) this.ride(this.posTime(t, b + 0.5), 0.09);
      }
    }
  }

  // ============================== EDM ==============================
  // 四つ打ち + 強いサイドチェイン + オフビートのプラックベース + クラップ。
  private arrangeEdm(chord: Chord, t: number, bar: number, active: boolean, lastBar: boolean): void {
    this.padChord(chord, t, lastBar, 1); // スーパーソウの厚いパッド (ポンプで脈打つ)

    const beat = this.stage.beat;

    if (active) {
      // 四つ打ちキック + 各キックでポンプ
      for (let b = 0; b < 4; b++) {
        this.kick(t + b * beat, 0.5);
        this.pump(t + b * beat);
      }
      // クラップ (スネア代わり) を 2 と 4
      this.clap(t + beat);
      this.clap(t + 3 * beat);
      // オフビートのオープンハット (ウンチ・ウンチ)
      for (let b = 0; b < 4; b++) this.openHat(t + (b + 0.5) * beat, 0.12);
      // 刻みハット
      if (this.intensity >= 1) {
        const div = this.intensity >= 3 ? 4 : 2;
        for (let i = 0; i < 4 * div; i++) this.hat(t + (i * beat) / div, i % div === 0 ? 0.4 : 0.9);
      }
    } else {
      this.pump(t);
    }

    // オフビートのプラックベース (ハウス)
    const root = chord.bass + 12;
    const hits = active ? [0.5, 1.5, 2.5, 3.5] : [0.5, 2.5];
    for (const p of hits) this.pluckBass(midiToFreq(root), t + p * beat);
    if (active) this.subKickBass(midiToFreq(chord.bass), t); // ダウンビートに低音の芯

    // リード・プラック (盛り上がると出現)
    if (active && this.intensity >= 2) this.leadArp(chord, t, bar);
  }

  // ============================== DnB ==============================
  // 高速ブレイクビート + サブ/リースベース + ダークなスタブ。
  private arrangeDnb(chord: Chord, t: number, active: boolean, lastBar: boolean): void {
    this.padChord(chord, t, lastBar, 0.7); // 暗いパッド (薄め)

    const beat = this.stage.beat;

    // リース/サブベース: ルートを持続 + シンコペのアクセント
    this.reeseBass(midiToFreq(chord.bass), t, this.stage.bar);
    if (active && this.intensity >= 2) {
      for (const p of [1.5, 2.75]) this.reeseBass(midiToFreq(chord.bass), this.posTime(t, p), beat * 0.6);
    }

    // ダークなスタブ (裏で刻む)
    if (active) {
      for (const p of [0.75, 2.5]) if (Math.random() < 0.7) this.darkStab(chord, t + p * beat);
    }

    if (active) {
      // ブレイクビート: キック 1 と 2.5、スネア 2 と 4
      this.kick(t, 0.5);
      this.kick(t + 2.5 * beat, 0.42);
      if (this.intensity >= 3) this.kick(t + 3.25 * beat, 0.3);
      this.snare(t + beat, 0.34, false);
      this.snare(t + 3 * beat, 0.34, false);
      // ゴーストスネア
      if (this.intensity >= 2) this.snare(t + 2.25 * beat, 0.12, false);
      // 高速の刻みハット (16分)
      if (this.intensity >= 1) {
        const div = this.intensity >= 2 ? 4 : 2;
        for (let i = 0; i < 4 * div; i++) this.hat(t + (i * beat) / div, i % 2 === 0 ? 0.5 : 0.85);
      }
    } else {
      this.kick(t, 0.45);
    }
  }

  // ---- ポンプ (サイドチェイン風) ----
  private pump(t: number): void {
    const amt = this.stage.pump;
    if (amt <= 0) return;
    const beat = this.stage.beat;
    const depth = 1 - amt * (0.6 - this.intensity * 0.04);
    const g = this.musicBus.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(depth, t + 0.03);
    g.linearRampToValueAtTime(1, t + beat * 0.7);
  }

  // ---- 和音レイヤー ----
  private padChord(chord: Chord, t: number, lastBar: boolean, level: number): void {
    const ctx = this.engine.ctx;
    const bar = this.stage.bar;
    const release = lastBar ? bar * 1.5 : 0.4;
    const end = t + bar + release;
    const gain = this.stage.padGain * level;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.35);
    env.gain.setValueAtTime(gain, t + bar);
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(this.padFilter);

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

  /** Rhodes 風の柔らかいコード刻み (ジャズのコンピング) */
  private rhodesStab(chord: Chord, t: number): void {
    const ctx = this.engine.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.06, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    env.connect(this.musicBus);
    this.engine.sendReverb(env, 0.3);
    for (const midi of chord.pad) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(midi);
      const p = ctx.createOscillator();
      p.type = 'triangle';
      p.frequency.value = midiToFreq(midi + 12);
      const pg = ctx.createGain();
      pg.gain.value = 0.25;
      p.connect(pg);
      pg.connect(env);
      osc.connect(env);
      osc.start(t); osc.stop(t + 0.72);
      p.start(t); p.stop(t + 0.4);
    }
  }

  /** EDM のリードプラック (アルペジオ) */
  private leadArp(chord: Chord, t: number, bar: number): void {
    const ctx = this.engine.ctx;
    const beat = this.stage.beat;
    const top = chord.pad.slice(-3);
    const scale = [top[0], top[1], top[2], top[0] + 12, top[1] + 12];
    const pat = bar % 2 === 0 ? [0, 2, 4, 2, 1, 3, 4, 3] : [4, 3, 2, 1, 0, 1, 2, 3];
    for (let i = 0; i < 8; i++) {
      const start = t + (i * beat) / 2;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(scale[pat[i]] + 12);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3500;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.06, start + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(lp); lp.connect(env);
      env.connect(this.musicBus);
      this.engine.sendReverb(env, 0.35);
      osc.start(start); osc.stop(start + 0.24);
    }
  }

  /** DnB のダークなコードスタブ */
  private darkStab(chord: Chord, t: number): void {
    const ctx = this.engine.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.08, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    lp.connect(env);
    env.connect(this.musicBus);
    for (const midi of chord.pad) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(midi);
      osc.connect(lp);
      osc.start(t); osc.stop(t + 0.18);
    }
  }

  // ---- ベース各種 ----
  /** 次コードへ半音で導く4音のウォーキングライン */
  private walkingLine(chord: Chord, next: Chord): number[] {
    const root = chord.bass;
    const fifth = root + 7;
    const third = root + (chord.pad.some((m) => (m - root) % 12 === 3) ? 3 : 4);
    // 4音目は次コードのルートへクロマチックに接近
    const target = next.bass;
    const approach = target > root ? target - 1 : target + 1;
    return [root, third, fifth, approach];
  }

  private uprightBass(freq: number, t: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.24, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + this.stage.beat * 0.9);
    osc.connect(env);
    env.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + this.stage.beat);
  }

  private pluckBass(freq: number, t: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.24, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(lp); lp.connect(env);
    env.connect(this.musicBus);
    osc.start(t); osc.stop(t + 0.22);
  }

  private subKickBass(freq: number, t: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq / 2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.28, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(env);
    env.connect(this.musicBus);
    osc.start(t); osc.stop(t + 0.32);
  }

  /** うなる DnB のリース/サブ (デチューンした鋸をローパスで濁らせる) */
  private reeseBass(freq: number, t: number, dur = this.stage.bar): void {
    const ctx = this.engine.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2, t + 0.02);
    env.gain.setValueAtTime(0.2, t + dur - 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    lp.connect(env);
    env.connect(this.musicBus);
    // サブの芯 (サイン)
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    sub.connect(sg); sg.connect(env);
    sub.start(t); sub.stop(t + dur);
    for (const det of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = det;
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur);
    }
  }

  // ---- ドラム各種 ----
  private kick(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env);
    this.engine.out(env, 0);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private snare(t: number, level: number, brush: boolean): void {
    const ctx = this.engine.ctx;
    // 胴鳴り
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    const oEnv = ctx.createGain();
    oEnv.gain.setValueAtTime(level * 0.5, t);
    oEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(oEnv);
    this.engine.out(oEnv, 0.05);
    osc.start(t); osc.stop(t + 0.1);
    // ノイズ (ブラシは柔らかく)
    const dur = brush ? 0.14 : 0.18;
    const noise = this.noiseSource(dur);
    const filt = ctx.createBiquadFilter();
    filt.type = brush ? 'bandpass' : 'highpass';
    filt.frequency.value = brush ? 3000 : 1800;
    const nEnv = ctx.createGain();
    nEnv.gain.setValueAtTime(level * (brush ? 0.5 : 0.8), t);
    nEnv.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filt); filt.connect(nEnv);
    this.engine.out(nEnv, brush ? 0.12 : 0.08);
    noise.start(t); noise.stop(t + dur);
  }

  private hat(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const noise = this.noiseSource(0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.09 * level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    noise.connect(hp); hp.connect(env);
    this.engine.out(env, 0.05);
    noise.start(t); noise.stop(t + 0.05);
  }

  private openHat(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const noise = this.noiseSource(0.16);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.connect(hp); hp.connect(env);
    this.engine.out(env, 0.08);
    noise.start(t); noise.stop(t + 0.16);
  }

  /** ジャズのライドシンバル (金属的なチーン) */
  private ride(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const noise = this.noiseSource(0.3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    noise.connect(hp); hp.connect(env);
    this.engine.out(env, 0.12);
    noise.start(t); noise.stop(t + 0.3);
    // 金属倍音のきらめき
    for (const f of [5040, 6180]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const oe = ctx.createGain();
      oe.gain.setValueAtTime(level * 0.04, t);
      oe.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(oe);
      this.engine.out(oe, 0.1);
      osc.start(t); osc.stop(t + 0.13);
    }
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
    noise.connect(bp); bp.connect(env);
    this.engine.out(env, 0.25);
    noise.start(t); noise.stop(t + 0.2);
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
