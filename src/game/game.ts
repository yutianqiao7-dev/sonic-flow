import { GOOD_WINDOW, PERFECT_WINDOW } from './types';
import type { Coin, Entity, EntityKind, Judgment } from './types';
import type { Stage } from './stages';

export interface JudgeEvent {
  entity: Entity;
  judgment: Judgment;
}

export interface GameCallbacks {
  onJudge(e: JudgeEvent): void;
  /** 判定対象のない自由ジャンプ */
  onFreeJump(): void;
  /** 2段ジャンプ */
  onAirJump(): void;
  /** 判定対象のない自由スライディング */
  onFreeSlide(): void;
  onCoin(total: number): void;
  /** 敵を踏んだ瞬間 */
  onStomp(): void;
}

/** 進行中のジャンプ (速度ベースの放物線) */
interface Jump {
  t0: number;
  h0: number;
  /** 着地時刻 */
  land: number;
  /** 判定対象がなかった自由ジャンプか */
  free: boolean;
}

/**
 * ランナー本体。自動で走り、タップ = ジャンプ (空中でもう1回 = 2段ジャンプ)、
 * スワイプ下 = スライディング。高さは正規化単位 (1 = 単ジャンプ頂点)。
 */
export class Game {
  score = 0;
  combo = 0;
  maxCombo = 0;
  coins = 0;
  readonly counts = { perfect: 0, good: 0, miss: 0 };
  readonly stage: Stage;
  readonly entities: Entity[];
  readonly coinList: Coin[];
  jump: Jump | null = null;
  slideStart = -10;
  crashUntil = -10;
  private airJumps = 0;
  private lastUpdate = -10;
  private readonly cb: GameCallbacks;

  constructor(stage: Stage, entities: Entity[], coins: Coin[], cb: GameCallbacks) {
    this.stage = stage;
    this.entities = entities;
    this.coinList = coins;
    this.cb = cb;
  }

  /** 初速: 滞空1拍・頂点1になるように決まる */
  private get v0(): number {
    return 4 / this.stage.air;
  }

  private get grav(): number {
    return 8 / (this.stage.air * this.stage.air);
  }

  private makeJump(t0: number, h0: number, free: boolean): Jump {
    const v = this.v0;
    const g = this.grav;
    const land = t0 + (v + Math.sqrt(v * v + 2 * g * h0)) / g;
    return { t0, h0, land, free };
  }

  heightAt(t: number): number {
    const j = this.jump;
    if (!j || t < j.t0 || t >= j.land) return 0;
    const dt = t - j.t0;
    return j.h0 + this.v0 * dt - 0.5 * this.grav * dt * dt;
  }

  isAirborne(t: number): boolean {
    const j = this.jump;
    return j !== null && t >= j.t0 && t < j.land;
  }

  isSliding(t: number): boolean {
    const dt = t - this.slideStart;
    return dt >= 0 && dt < this.stage.slide;
  }

  handleTap(now: number): void {
    if (this.isSliding(now)) this.slideStart = -10;
    if (!this.isAirborne(now)) {
      this.airJumps = 0;
      const hit = this.judgeAction(now, ['spike', 'enemy']);
      this.jump = this.makeJump(now, 0, !hit);
      if (!hit) this.cb.onFreeJump();
    } else if (this.airJumps < 1) {
      this.airJumps++;
      this.jump = this.makeJump(now, this.heightAt(now), true);
      this.cb.onAirJump();
    }
  }

  handleSwipe(dir: string, downTime: number): void {
    if (dir !== 'down') return;
    // 直前のタップで始まった自由ジャンプはスライディングに変換する
    // (スワイプは必ず pointerdown → ジャンプ発火の後に確定するため)
    if (
      this.jump &&
      this.jump.free &&
      this.airJumps === 0 &&
      Math.abs(this.jump.t0 - downTime) < 0.05
    ) {
      this.jump = null;
    }
    if (this.isAirborne(downTime)) return;
    this.slideStart = downTime;
    const hit = this.judgeAction(downTime, ['bar']);
    if (!hit) this.cb.onFreeSlide();
  }

  /** 通過したエンティティとコインの処理 */
  update(now: number): void {
    for (const e of this.entities) {
      if (e.done || now < e.time) continue;
      e.done = true;
      const h = this.heightAt(e.time);
      const air = this.isAirborne(e.time);

      if (e.kind === 'spike') {
        if (e.judged) continue;
        if (h >= 0.5) this.judge(e, GOOD_WINDOW);
        else this.crash(e, now);
      } else if (e.kind === 'bar') {
        if (this.isSliding(e.time)) {
          if (!e.judged) this.judge(e, GOOD_WINDOW);
        } else if (!e.judged) {
          this.crash(e, now);
        }
      } else {
        // enemy
        if (e.judged) {
          e.stomped = true;
          this.bounce(e.time);
          this.cb.onStomp();
        } else if (air && h > 0 && h <= 0.35) {
          e.stomped = true;
          this.judge(e, GOOD_WINDOW);
          this.bounce(e.time);
          this.cb.onStomp();
        } else if (air && h > 0.35) {
          // 高く飛び越えた: 敵は歩き去る (ノーカウント)
        } else {
          this.crash(e, now);
        }
      }
    }

    for (const c of this.coinList) {
      if (c.collected || c.time <= this.lastUpdate || c.time > now) continue;
      if (Math.abs(this.heightAt(c.time) - c.h) < 0.25) {
        c.collected = true;
        this.coins++;
        this.score += 25;
        this.cb.onCoin(this.coins);
      }
    }
    this.lastUpdate = now;
  }

  /** コンボに応じた音楽の盛り上がり段階 (0-3) */
  get intensityTier(): number {
    if (this.combo >= 24) return 3;
    if (this.combo >= 12) return 2;
    if (this.combo >= 4) return 1;
    return 0;
  }

  get finished(): boolean {
    return this.entities.every((e) => e.done);
  }

  /** 敵を踏んだ反動の自動ジャンプ */
  private bounce(t: number): void {
    this.jump = this.makeJump(t, 0, true);
    this.airJumps = 0;
  }

  private judgeAction(t: number, kinds: EntityKind[]): boolean {
    const e = this.entities.find(
      (o) =>
        !o.judged &&
        !o.done &&
        kinds.includes(o.kind) &&
        Math.abs(o.actionTime - t) <= GOOD_WINDOW,
    );
    if (!e) return false;
    this.judge(e, Math.abs(t - e.actionTime));
    return true;
  }

  private judge(e: Entity, delta: number): void {
    const judgment: Judgment = delta <= PERFECT_WINDOW ? 'perfect' : 'good';
    e.judged = true;
    e.result = judgment;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.counts[judgment]++;
    this.score += (judgment === 'perfect' ? 100 : 60) + Math.min(this.combo, 50) * 2;
    this.cb.onJudge({ entity: e, judgment });
  }

  private crash(e: Entity, now: number): void {
    e.judged = true;
    e.result = 'miss';
    this.combo = 0;
    this.counts.miss++;
    this.crashUntil = now + 0.6;
    this.slideStart = -10;
    // つまずき中の障害物は巻き込みミスにしない (救済・ノーカウント)
    for (const other of this.entities) {
      if (!other.done && !other.judged && other.time <= this.crashUntil + this.stage.air / 2) {
        other.done = true;
      }
    }
    this.cb.onJudge({ entity: e, judgment: 'miss' });
  }
}
