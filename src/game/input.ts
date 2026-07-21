import type { SwipeDir } from './types';

const SWIPE_THRESHOLD = 28;

export interface InputListener {
  /** 指が触れた瞬間 (タップ判定はここで即時) */
  onDown(time: number): void;
  /** スワイプと確定した瞬間。downTime は指が触れた時刻 */
  onSwipe(dir: SwipeDir, downTime: number): void;
}

interface PointerState {
  x: number;
  y: number;
  downTime: number;
  swiped: boolean;
}

/**
 * タッチ入力。pointerdown で即座に onDown を発火し (低遅延)、
 * 一定距離動いたら onSwipe を発火する。
 */
export class InputHandler {
  private readonly pointers = new Map<number, PointerState>();
  private readonly listener: InputListener;
  private readonly now: () => number;

  constructor(el: HTMLElement, listener: InputListener, now: () => number) {
    this.listener = listener;
    this.now = now;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.pointers.delete(e.pointerId));
    el.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
  }

  private down(e: PointerEvent): void {
    const time = this.now();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, downTime: time, swiped: false });
    this.listener.onDown(time);
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p || p.swiped) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (dx * dx + dy * dy < SWIPE_THRESHOLD * SWIPE_THRESHOLD) return;
    p.swiped = true;
    const dir: SwipeDir =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up';
    this.listener.onSwipe(dir, p.downTime);
  }
}
