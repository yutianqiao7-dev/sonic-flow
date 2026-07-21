import { SONG_BARS } from './types';

export interface Chord {
  bass: number;
  pad: number[];
}

export interface Stage {
  id: number;
  name: string;
  desc: string;
  bpm: number;
  /** 背景・テーマの色相 */
  hue: number;
  padWave: OscillatorType;
  padGain: number;
  /** コード進行 (1小節ずつループ) */
  chords: Chord[];
  /** ヒット音の音階 (BGM と協和するペンタトニック) */
  ladder: number[];
  /** 難易度の底上げ (0-1) */
  heat: number;
  // 以下は bpm から導出
  beat: number;
  bar: number;
  /** ジャンプ滞空時間 = 1拍 */
  air: number;
  /** スライディング持続時間 = 1拍 */
  slide: number;
  songLength: number;
}

function make(s: Omit<Stage, 'beat' | 'bar' | 'air' | 'slide' | 'songLength'>): Stage {
  const beat = 60 / s.bpm;
  const bar = beat * 4;
  return { ...s, beat, bar, air: beat, slide: beat, songLength: bar * SONG_BARS };
}

export const STAGES: Stage[] = [
  make({
    id: 0,
    name: 'DAWN',
    desc: 'BPM 118 / やさしい',
    bpm: 118,
    hue: 235,
    padWave: 'sawtooth',
    padGain: 0.05,
    // C - G - Am - F
    chords: [
      { bass: 36, pad: [48, 52, 55, 59] },
      { bass: 43, pad: [50, 55, 59, 62] },
      { bass: 45, pad: [48, 52, 55, 57] },
      { bass: 41, pad: [48, 53, 57, 60] },
    ],
    // C メジャーペンタトニック
    ladder: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84],
    heat: 0,
  }),
  make({
    id: 1,
    name: 'NEON',
    desc: 'BPM 130 / ふつう',
    bpm: 130,
    hue: 320,
    padWave: 'square',
    padGain: 0.032,
    // Am - F - C - G
    chords: [
      { bass: 45, pad: [57, 60, 64, 67] },
      { bass: 41, pad: [57, 60, 65, 69] },
      { bass: 36, pad: [55, 60, 64, 67] },
      { bass: 43, pad: [55, 59, 62, 67] },
    ],
    // A マイナーペンタトニック
    ladder: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
    heat: 0.35,
  }),
  make({
    id: 2,
    name: 'STORM',
    desc: 'BPM 142 / むずかしい',
    bpm: 142,
    hue: 160,
    padWave: 'sawtooth',
    padGain: 0.05,
    // Em - C - G - D
    chords: [
      { bass: 40, pad: [52, 55, 59, 62] },
      { bass: 36, pad: [48, 52, 55, 59] },
      { bass: 43, pad: [50, 55, 59, 62] },
      { bass: 38, pad: [50, 54, 57, 62] },
    ],
    // E マイナーペンタトニック
    ladder: [64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88],
    heat: 0.7,
  }),
];
