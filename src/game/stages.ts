import { SONG_BARS } from './types';

export interface Chord {
  bass: number;
  pad: number[];
}

export type Genre = 'jazz' | 'edm' | 'dnb';

export interface Stage {
  id: number;
  name: string;
  desc: string;
  genre: Genre;
  bpm: number;
  /** 背景・テーマの色相 */
  hue: number;
  padWave: OscillatorType;
  padGain: number;
  /** ヒット/ジャンプ音の音色 (ジャンル感を補強) */
  sfxWave: OscillatorType;
  /** 8分のスウィング量 (0.5=ストレート, 0.63前後=ジャズのハネ) */
  swing: number;
  /** サイドチェイン・ポンプの深さ (0=なし, 1=EDM級) */
  pump: number;
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
    name: 'MIDNIGHT',
    desc: 'JAZZ · ゆったりスイング',
    genre: 'jazz',
    bpm: 100,
    hue: 265,
    padWave: 'triangle',
    padGain: 0.05,
    sfxWave: 'sine',
    swing: 0.63,
    pump: 0,
    // Cmaj7 - Am7 - Dm7 - G7 (ii-V を含むジャズ進行) / C メジャー
    chords: [
      { bass: 36, pad: [52, 55, 59, 62] },
      { bass: 45, pad: [52, 55, 60, 64] },
      { bass: 38, pad: [53, 57, 60, 65] },
      { bass: 43, pad: [53, 55, 59, 64] },
    ],
    ladder: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84],
    heat: 0,
  }),
  make({
    id: 1,
    name: 'NEON',
    desc: 'EDM · 四つ打ちアンセム',
    genre: 'edm',
    bpm: 126,
    hue: 320,
    padWave: 'sawtooth',
    padGain: 0.045,
    sfxWave: 'sawtooth',
    swing: 0.5,
    pump: 1,
    // Am - F - C - G (アンセム) / A マイナー
    chords: [
      { bass: 45, pad: [57, 60, 64, 69] },
      { bass: 41, pad: [57, 60, 65, 69] },
      { bass: 36, pad: [55, 60, 64, 67] },
      { bass: 43, pad: [55, 59, 62, 67] },
    ],
    ladder: [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
    heat: 0.35,
  }),
  make({
    id: 2,
    name: 'STORM',
    desc: 'DRUM & BASS · 高速ブレイク',
    genre: 'dnb',
    bpm: 150,
    hue: 155,
    padWave: 'sawtooth',
    padGain: 0.036,
    sfxWave: 'square',
    swing: 0.5,
    pump: 0.5,
    // Em - C - G - D (ダーク) / E マイナー
    chords: [
      { bass: 40, pad: [52, 55, 59, 64] },
      { bass: 36, pad: [52, 55, 60, 64] },
      { bass: 43, pad: [55, 59, 62, 67] },
      { bass: 38, pad: [54, 57, 62, 66] },
    ],
    ladder: [64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88],
    heat: 0.8,
  }),
];
