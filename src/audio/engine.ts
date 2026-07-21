/**
 * Web Audio の土台。マスターチェーン (コンプレッサー) と
 * 共有リバーブを持ち、各音源はここに接続する。
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private readonly reverb: ConvolverNode;

  constructor() {
    this.ctx = new AudioContext();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.8);
    const reverbLevel = this.ctx.createGain();
    reverbLevel.gain.value = 0.5;
    this.reverb.connect(reverbLevel);
    reverbLevel.connect(this.master);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }

  /** node をドライ + リバーブセンドに接続する */
  out(node: AudioNode, wet = 0.15): void {
    node.connect(this.master);
    if (wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(this.reverb);
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
