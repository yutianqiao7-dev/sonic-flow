import { AudioEngine, midiToFreq } from './engine';

/**
 * ヒット音。ステージ固有のペンタトニック階段をコンボに合わせて
 * 駆け上がるので、決めるほど音がどんどん高揚していく。
 * その曲の BGM と常に協和するのでどのタイミングでも気持ちいい。
 */
export class Sfx {
  private readonly engine: AudioEngine;
  private ladder = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
  private jumpIdx = 0;
  /** ヒット音の音色 (ステージのジャンルで変える) */
  private wave: OscillatorType = 'triangle';

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  setLadder(ladder: number[]): void {
    this.ladder = ladder;
  }

  setTimbre(wave: OscillatorType): void {
    this.wave = wave;
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

  /**
   * ジャンプ音。いま鳴っているコードの構成音 (tones) から音を選ぶので
   * 必ず BGM と調和する。連続ジャンプでも音が変わって心地よいよう、
   * 内部カウンタで構成音を巡回させる。high=2段ジャンプ (1オクターブ上)。
   */
  jump(tones: number[], high = false): void {
    if (tones.length === 0) tones = [60, 64, 67];
    // 上側の構成音を巡回。2段ジャンプは一段高い音を選ぶ
    const base = tones[this.jumpIdx % tones.length];
    this.jumpIdx++;
    const midi = high ? base + 12 : base;
    const t = this.engine.ctx.currentTime;
    this.bell(midiToFreq(midi), t, high ? 0.16 : 0.13);
    if (high) {
      // 2段ジャンプは5度上のきらめきを添える
      this.bell(midiToFreq(midi + 7), t + 0.03, 0.08);
      this.sparkle(t);
    }
  }

  /** スライディングの柔らかいスワッシュ音 */
  slide(): void {
    const ctx = this.engine.ctx;
    const t = ctx.currentTime;
    const noise = this.noiseBuffer(0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3500, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.14, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    noise.connect(bp);
    bp.connect(env);
    this.engine.out(env, 0.15);
    noise.start(t);
    noise.stop(t + 0.22);
  }

  /** やわらかいベル (正弦波2倍音入り) */
  private bell(freq: number, t: number, level: number): void {
    const ctx = this.engine.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    this.engine.out(env, 0.4);

    const fund = ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.value = freq;
    fund.connect(env);
    fund.start(t);
    fund.stop(t + 0.45);

    const partial = ctx.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = freq * 2;
    const pEnv = ctx.createGain();
    pEnv.gain.setValueAtTime(0, t);
    pEnv.gain.linearRampToValueAtTime(level * 0.3, t + 0.006);
    pEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    partial.connect(pEnv);
    this.engine.out(pEnv, 0.3);
    partial.start(t);
    partial.stop(t + 0.2);
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
    osc.type = this.wave;
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    // 鋸/矩形は倍音がきついのでローパスで角を丸める
    if (this.wave === 'sawtooth' || this.wave === 'square') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(6000, freq * 6);
      osc.connect(lp);
      lp.connect(env);
    } else {
      osc.connect(env);
    }
    this.engine.out(env, wet);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  private sparkle(t: number): void {
    const ctx = this.engine.ctx;
    const src = this.noiseBuffer(0.08);
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

  private noiseBuffer(seconds: number): AudioBufferSourceNode {
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
