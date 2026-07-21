import { AudioEngine, midiToFreq } from './engine';

/**
 * ヒット音。ステージ固有のペンタトニック階段をコンボに合わせて
 * 駆け上がるので、決めるほど音がどんどん高揚していく。
 * その曲の BGM と常に協和するのでどのタイミングでも気持ちいい。
 */
export class Sfx {
  private readonly engine: AudioEngine;
  private ladder = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  setLadder(ladder: number[]): void {
    this.ladder = ladder;
  }

  hit(combo: number, perfect: boolean): void {
    const top = this.ladder.length - 1;
    const idx = combo <= top ? combo : top - (combo % 3);
    const freq = midiToFreq(this.ladder[idx]);
    const t = this.engine.ctx.currentTime;

    this.pluck(freq, t, perfect ? 0.4 : 0.28, perfect ? 0.45 : 0.2);
    this.pluck(freq * 2, t, perfect ? 0.14 : 0.08, 0.3);
    if (perfect) {
      // パーフェクト時だけ5度上のきらめきを重ねる
      this.pluck(freq * 3, t + 0.02, 0.06, 0.6);
      this.sparkle(t);
    }
  }

  /** 判定対象のない自由ジャンプの控えめな音 */
  tick(): void {
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.07, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(env);
    this.engine.out(env, 0.05);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** コイン取得: 上ずった2音の軽いアルペジオ */
  coin(): void {
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    [88, 93].forEach((midi, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = midiToFreq(midi);
      const env = ctx.createGain();
      const s = t + i * 0.05;
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(0.12, s + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, s + 0.14);
      osc.connect(env);
      this.engine.out(env, 0.25);
      osc.start(s);
      osc.stop(s + 0.16);
    });
  }

  /** 敵を踏んだ音: 短いローパスの「ポヨン」 */
  stomp(): void {
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.28, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env);
    this.engine.out(env, 0.1);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  miss(): void {
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(env);
    this.engine.out(env, 0.05);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private pluck(freq: number, t: number, level: number, wet: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(env);
    this.engine.out(env, wet);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  private sparkle(t: number): void {
    const ctx = this.engine.ctx;
    const length = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 9000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp);
    hp.connect(env);
    this.engine.out(env, 0.5);
    src.start(t);
    src.stop(t + 0.08);
  }
}
