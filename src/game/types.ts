export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export type Judgment = 'perfect' | 'good' | 'miss';

export type EntityKind = 'spike' | 'bar' | 'enemy';

/**
 * コース上の障害物。
 * - spike: ジャンプで飛び越える (actionTime にタップ)
 * - bar:   頭上バー。スライディングでくぐる (actionTime にスワイプ下)
 * - enemy: 歩く敵。1拍前にジャンプして着地で踏む (actionTime にタップ)
 */
export interface Entity {
  id: number;
  kind: EntityKind;
  /** 理想アクション時刻 (拍に一致する) */
  actionTime: number;
  /** エンティティがプレイヤー位置に到達する時刻 */
  time: number;
  /** 判定済み (カウントされた) */
  judged: boolean;
  /** 通過処理済み */
  done: boolean;
  result: Judgment | null;
  /** 敵を踏んだ (演出用) */
  stomped: boolean;
}

export interface Coin {
  id: number;
  time: number;
  /** 正規化高さ (1 = 単ジャンプの頂点。2段ジャンプで ~1.8 まで届く) */
  h: number;
  collected: boolean;
}

export const SONG_BARS = 32;
export const PERFECT_WINDOW = 0.065;
export const GOOD_WINDOW = 0.14;
