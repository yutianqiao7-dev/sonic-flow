import { SONG_BARS } from './types';
import type { Coin, Entity, EntityKind } from './types';
import type { Stage } from './stages';

/**
 * 小節内のアクション位置パターン (拍単位 0-3.5)。難易度ティアごと。
 * ジャンプ滞空が1拍なので、間隔1拍 = 着地即ジャンプの連続チェイン。
 */
const PATTERNS: number[][][] = [
  [[0], [0, 2]],
  [[0, 2], [1, 3], [0, 2.5]],
  [[0, 1.5, 3], [0, 2, 3], [1, 2.5], [0.5, 2, 3.5]],
  [[0, 1, 2], [0, 2, 3], [0, 1, 3], [0, 1.5, 2.5, 3.5]],
];

/** ティアごとの最小アクション間隔 (拍) */
const MIN_GAP = [2, 1.5, 1.5, 1];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function tierForBar(bar: number, heat: number): number {
  const boost = heat >= 0.6 ? 1 : 0;
  let base: number;
  if (bar < 10) base = bar < 6 ? 0 : 1;
  else if (bar < 18) base = Math.random() < 0.4 ? 1 : 2;
  else if (bar < 26) base = Math.random() < 0.4 ? 2 : 3;
  else base = 3;
  return Math.min(3, base + boost);
}

export interface Course {
  entities: Entity[];
  coins: Coin[];
}

/** コース (障害物 + コイン) を手続き生成する。小節2から29まで */
export function generateCourse(stage: Stage): Course {
  const entities: Entity[] = [];
  const coins: Coin[] = [];
  let id = 0;
  let coinId = 0;
  let lastAction = -10;
  const beat = stage.beat;
  const bar = stage.bar;
  const air = stage.air;

  for (let barIdx = 2; barIdx < SONG_BARS - 2; barIdx++) {
    const tier = tierForBar(barIdx, stage.heat);
    const pattern = pick(PATTERNS[tier]);

    for (const pos of pattern) {
      const actionTime = barIdx * bar + pos * beat;
      if (actionTime - lastAction < MIN_GAP[tier] * beat - 1e-6) continue;

      // 種類を選ぶ。序盤はトゲ中心、進むと bar / enemy が混ざる
      let kind: EntityKind = 'spike';
      const r = Math.random();
      if (tier >= 1) {
        const barRate = 0.12 + stage.heat * 0.12;
        const enemyRate = 0.16 + stage.heat * 0.12;
        if (r < barRate) kind = 'bar';
        else if (r < barRate + enemyRate) kind = 'enemy';
      }

      // bar (スライディング) と enemy はトゲと到達タイミングの意味が違う
      let time: number;
      if (kind === 'spike') {
        time = actionTime + air / 2; // ジャンプ頂点でトゲを越える
      } else if (kind === 'bar') {
        time = actionTime + stage.slide / 2; // スライディング中にバーをくぐる
      } else {
        time = actionTime + air; // 1拍後の着地で敵を踏む
      }

      entities.push({
        id: id++,
        kind,
        actionTime,
        time,
        judged: false,
        done: false,
        result: null,
        stomped: false,
      });
      lastAction = actionTime;

      // コインをまく
      if (kind === 'spike' && Math.random() < 0.5) {
        // ジャンプ頂点に1枚 or 弧に沿って3枚
        if (tier >= 2 && Math.random() < 0.4) {
          for (let k = -1; k <= 1; k++) {
            coins.push({ id: coinId++, time: time + k * beat * 0.25, h: 1 - k * k * 0.25, collected: false });
          }
        } else {
          coins.push({ id: coinId++, time, h: 1, collected: false });
        }
      } else if (Math.random() < 0.3) {
        // 地面近くのコイン (アクションの合間)
        coins.push({ id: coinId++, time: actionTime + beat * 0.5, h: 0.12, collected: false });
      }
    }

    // 2段ジャンプ専用の高所コインボーナス (たまに)
    if (tier >= 2 && barIdx % 5 === 2) {
      const t = barIdx * bar + 3.5 * beat;
      coins.push({ id: coinId++, time: t, h: 1.6, collected: false });
    }
  }

  return { entities, coins };
}
