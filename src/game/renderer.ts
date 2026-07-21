import type { Judgment } from './types';
import type { Game } from './game';

const PLAYER_COLOR = '#6cf5ff';
const SPIKE_COLOR = '#ff7bd5';
const BAR_COLOR = '#ffa94d';
const ENEMY_COLOR = '#c07bff';
const PAD_COLOR = '#8f7bff';
const COIN_COLOR = '#ffe36c';
const JUDGE_COLORS: Record<Judgment, string> = {
  perfect: '#6cf5ff',
  good: '#ffe36c',
  miss: '#ff6c8f',
};
const JUDGE_LABELS: Record<Judgment, string> = {
  perfect: 'PERFECT',
  good: 'GOOD',
  miss: 'MISS',
};

interface Particle {
  vx: number;
  vy: number;
}

interface Effect {
  y: number;
  t0: number;
  judgment: Judgment;
  particles: Particle[];
}

export class Renderer {
  private readonly g: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private effects: Effect[] = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private syncSize(): void {
    if (this.W !== window.innerWidth || this.H !== window.innerHeight) {
      this.resize();
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * dpr);
    this.canvas.height = Math.floor(this.H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private get groundY(): number {
    return this.H * 0.72;
  }

  private get playerX(): number {
    return this.W * 0.28;
  }

  private get playerSize(): number {
    return Math.max(30, Math.min(this.W, this.H) * 0.055);
  }

  private get jumpHeight(): number {
    return this.H * 0.19;
  }

  /** スクロール速度 (px/秒)。1拍あたり画面幅の36% (前より速い) */
  private speed(beat: number): number {
    return (this.W * 0.36) / beat;
  }

  private timeToX(t: number, now: number, beat: number): number {
    return this.playerX + (t - now) * this.speed(beat);
  }

  addJudgeEffect(judgment: Judgment, heightNorm: number, now: number): void {
    const particles: Particle[] = [];
    if (judgment !== 'miss') {
      const n = judgment === 'perfect' ? 14 : 8;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        const v = 120 + Math.random() * 220;
        particles.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v });
      }
    }
    this.effects.push({
      y: this.groundY - this.jumpHeight * heightNorm - this.playerSize,
      t0: now,
      judgment,
      particles,
    });
  }

  render(game: Game | null, now: number, hue: number, tier: number): void {
    this.syncSize();
    const g = this.g;
    const { W, H } = this;
    const beat = game ? game.stage.beat : 0.5;

    g.save();
    if (game && now < game.crashUntil) {
      const power = (game.crashUntil - now) / 0.6;
      g.translate((Math.random() - 0.5) * 10 * power, (Math.random() - 0.5) * 10 * power);
    }

    // 背景: ビートで脈打つ
    g.fillStyle = '#0a0a14';
    g.fillRect(-20, -20, W + 40, H + 40);
    const phase = ((((now % beat) + beat) % beat) / beat) || 0;
    const pulse = Math.pow(1 - phase, 2) * (0.05 + tier * 0.03);
    const grad = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.7);
    grad.addColorStop(0, `hsla(${hue}, 80%, 60%, ${0.1 + pulse})`);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);

    this.drawParallax(now, hue, beat, 0.15, this.groundY - H * 0.16, H * 0.1, 0.4);
    this.drawParallax(now, hue, beat, 0.35, this.groundY - H * 0.06, H * 0.06, 0.55);
    this.drawGround(now, beat, pulse);

    if (game) {
      this.drawCoins(game, now);
      this.drawCourse(game, now);
      this.drawPlayer(game, now, tier, phase);
    }
    this.drawEffects(now);
    if (game) {
      this.drawHud(game, now, phase);
      if (now < game.crashUntil) {
        g.fillStyle = `rgba(255, 60, 90, ${((game.crashUntil - now) / 0.6) * 0.16})`;
        g.fillRect(-20, -20, W + 40, H + 40);
      }
    }
    g.restore();
  }

  private drawParallax(now: number, hue: number, beat: number, factor: number, baseY: number, amp: number, alpha: number): void {
    const g = this.g;
    const { W } = this;
    const scroll = now * this.speed(beat) * factor;
    g.fillStyle = `hsla(${hue}, 45%, 16%, ${alpha})`;
    g.beginPath();
    g.moveTo(0, this.groundY);
    for (let x = 0; x <= W; x += 12) {
      const wx = (x + scroll) * 0.01;
      const y = baseY - (Math.sin(wx) * 0.6 + Math.sin(wx * 2.7) * 0.4) * amp;
      g.lineTo(x, y);
    }
    g.lineTo(W, this.groundY);
    g.closePath();
    g.fill();
  }

  private drawGround(now: number, beat: number, pulse: number): void {
    const g = this.g;
    const { W, H } = this;
    const gy = this.groundY;
    const speed = this.speed(beat);

    g.fillStyle = 'rgba(20, 22, 40, 0.9)';
    g.fillRect(-20, gy, W + 40, H - gy + 20);

    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    const firstBeat = Math.floor((now - this.playerX / speed) / beat) * beat;
    for (let i = 0; i < 28; i++) {
      const x = this.timeToX(firstBeat + i * beat, now, beat);
      if (x > W + 20) break;
      g.beginPath();
      g.moveTo(x, gy);
      g.lineTo(x - 30, H);
      g.stroke();
    }

    g.save();
    g.shadowColor = PLAYER_COLOR;
    g.shadowBlur = 10 + pulse * 100;
    g.strokeStyle = `rgba(160, 220, 255, ${0.45 + pulse * 2})`;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-20, gy);
    g.lineTo(W + 20, gy);
    g.stroke();
    g.restore();
  }

  private drawCoins(game: Game, now: number): void {
    const g = this.g;
    const beat = game.stage.beat;
    const r = this.playerSize * 0.28;
    for (const c of game.coinList) {
      if (c.collected) continue;
      const x = this.timeToX(c.time, now, beat);
      if (x < -40) continue;
      if (x > this.W + 40) break;
      const y = this.groundY - this.jumpHeight * c.h - this.playerSize * 0.5;
      const spin = Math.abs(Math.cos(now * 6 + c.id));
      g.save();
      g.shadowColor = COIN_COLOR;
      g.shadowBlur = 12;
      g.fillStyle = COIN_COLOR;
      g.beginPath();
      g.ellipse(x, y, r * (0.35 + spin * 0.65), r, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  private drawCourse(game: Game, now: number): void {
    const g = this.g;
    const gy = this.groundY;
    const s = this.playerSize;
    const beat = game.stage.beat;

    for (const e of game.entities) {
      const x = this.timeToX(e.time, now, beat);
      if (x < -100) continue;
      if (x > this.W + 100) break;

      // アクションパッド (光る目印)
      if (!e.judged) {
        const padX = this.timeToX(e.actionTime, now, beat);
        const near = Math.max(0, 1 - Math.abs(e.actionTime - now) / 0.35);
        g.save();
        g.shadowColor = PAD_COLOR;
        g.shadowBlur = 8 + near * 20;
        g.fillStyle = PAD_COLOR;
        g.globalAlpha = 0.6 + near * 0.4;
        g.beginPath();
        g.ellipse(padX, gy + 6, s * (0.5 + near * 0.2), s * 0.16, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      if (e.kind === 'spike') {
        this.drawSpike(x, gy, s, e.result === 'miss');
      } else if (e.kind === 'bar') {
        this.drawBar(x, gy, s, e.result === 'miss');
      } else {
        this.drawEnemy(x, gy, s, e.stomped, e.result === 'miss');
      }
    }
  }

  private drawSpike(x: number, gy: number, s: number, missed: boolean): void {
    const g = this.g;
    const h = s * 1.05;
    const w = s * 0.8;
    g.save();
    g.shadowColor = SPIKE_COLOR;
    g.shadowBlur = 14;
    g.fillStyle = missed ? 'rgba(255, 123, 213, 0.35)' : SPIKE_COLOR;
    g.beginPath();
    g.moveTo(x - w / 2, gy);
    g.lineTo(x, gy - h);
    g.lineTo(x + w / 2, gy);
    g.closePath();
    g.fill();
    g.restore();
  }

  /** 頭上バー: スライディングでくぐる */
  private drawBar(x: number, gy: number, s: number, missed: boolean): void {
    const g = this.g;
    const w = s * 1.1;
    // 立ったままの高さ (top = gy - s) より下端を下げ、スライド必須に見せる
    const top = gy - s * 1.7;
    const barH = s * 0.95;
    g.save();
    g.shadowColor = BAR_COLOR;
    g.shadowBlur = 14;
    g.fillStyle = missed ? 'rgba(255, 169, 77, 0.3)' : BAR_COLOR;
    g.beginPath();
    g.roundRect(x - w / 2, top, w, barH, 6);
    g.fill();
    // 下向きの警告ストライプ
    g.globalAlpha = 0.35;
    g.fillStyle = '#0a0a14';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(x - w / 2 + i * (w / 3) + 4, top + barH);
      g.lineTo(x - w / 2 + i * (w / 3) + 14, top + barH);
      g.lineTo(x - w / 2 + i * (w / 3) + 4, top + barH - 12);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  /** 歩く敵: 1拍前にジャンプして着地で踏む */
  private drawEnemy(x: number, gy: number, s: number, stomped: boolean, missed: boolean): void {
    const g = this.g;
    const size = s * 0.82;
    const flat = stomped;
    g.save();
    g.shadowColor = ENEMY_COLOR;
    g.shadowBlur = 12;
    g.fillStyle = missed ? 'rgba(192, 123, 255, 0.35)' : ENEMY_COLOR;
    const eh = flat ? size * 0.3 : size;
    g.beginPath();
    g.roundRect(x - size / 2, gy - eh, size, eh, [size * 0.4, size * 0.4, 6, 6]);
    g.fill();
    if (!flat) {
      // 怒り目
      g.shadowBlur = 0;
      g.fillStyle = '#0a0a14';
      g.beginPath();
      g.arc(x - size * 0.16, gy - eh * 0.65, size * 0.09, 0, Math.PI * 2);
      g.arc(x + size * 0.16, gy - eh * 0.65, size * 0.09, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawPlayer(game: Game, now: number, tier: number, beatPhase: number): void {
    const g = this.g;
    const s = this.playerSize;
    const hNorm = game.heightAt(now);
    const airborne = game.isAirborne(now);
    const sliding = game.isSliding(now);
    const grounded = !airborne;

    const bob = grounded && !sliding ? Math.abs(Math.sin(beatPhase * Math.PI)) * s * 0.08 : 0;
    const cx = this.playerX;
    const cy = this.groundY - this.jumpHeight * hNorm - s / 2 - bob;

    // 高コンボ時の残像
    if (tier >= 2 && airborne) {
      for (let i = 1; i <= 3; i++) {
        const pt = now - i * 0.05;
        const ph = game.heightAt(pt);
        g.fillStyle = `rgba(108, 245, 255, ${0.12 / i})`;
        g.beginPath();
        g.arc(cx - i * 14, this.groundY - this.jumpHeight * ph - s / 2, s * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    }

    g.save();
    g.translate(cx, cy);

    const flicker = now < game.crashUntil && Math.floor(now * 18) % 2 === 0;
    g.globalAlpha = flicker ? 0.35 : 1;
    g.shadowColor = PLAYER_COLOR;
    g.shadowBlur = 18;
    g.fillStyle = PLAYER_COLOR;
    const r = s * 0.22;

    if (sliding) {
      // スライディング: 平たく低くなる
      const w = s * 1.35;
      const hh = s * 0.5;
      g.beginPath();
      g.roundRect(-w / 2, s / 2 - hh, w, hh, r);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#0a0a14';
      g.beginPath();
      g.arc(w / 2 - s * 0.28, s / 2 - hh * 0.55, s * 0.07, 0, Math.PI * 2);
      g.arc(w / 2 - s * 0.5, s / 2 - hh * 0.55, s * 0.07, 0, Math.PI * 2);
      g.fill();
    } else {
      // ジャンプ中は回転
      const j = game.jump;
      if (j && now >= j.t0 && now < j.land) {
        const p = (now - j.t0) / (j.land - j.t0);
        g.rotate(p * Math.PI * 2);
      }
      g.beginPath();
      g.roundRect(-s / 2, -s / 2, s, s, r);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#0a0a14';
      g.beginPath();
      g.arc(s * 0.12, -s * 0.1, s * 0.08, 0, Math.PI * 2);
      g.arc(s * 0.34, -s * 0.1, s * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawEffects(now: number): void {
    const g = this.g;
    const DURATION = 0.5;
    this.effects = this.effects.filter((e) => now - e.t0 < DURATION && now >= e.t0 - 0.1);
    const x = this.playerX;

    for (const e of this.effects) {
      const t = Math.max(0, (now - e.t0) / DURATION);
      const alpha = 1 - t;
      const color = JUDGE_COLORS[e.judgment];

      if (e.judgment !== 'miss') {
        g.globalAlpha = alpha * 0.8;
        g.strokeStyle = color;
        g.lineWidth = 3 * (1 - t) + 1;
        g.beginPath();
        g.arc(x, e.y, this.playerSize * (0.7 + t * 2), 0, Math.PI * 2);
        g.stroke();

        g.fillStyle = color;
        for (const p of e.particles) {
          g.globalAlpha = alpha;
          g.beginPath();
          g.arc(x + p.vx * t * DURATION, e.y + p.vy * t * DURATION, 3 * (1 - t), 0, Math.PI * 2);
          g.fill();
        }
      }

      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.font = `900 ${e.judgment === 'perfect' ? 26 : 22}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(JUDGE_LABELS[e.judgment], x, e.y - this.playerSize - 12 - t * 30);
      g.globalAlpha = 1;
    }
  }

  private drawHud(game: Game, now: number, beatPhase: number): void {
    const g = this.g;
    g.textAlign = 'center';

    g.fillStyle = 'rgba(238, 240, 255, 0.9)';
    g.font = '700 22px sans-serif';
    g.fillText(game.score.toLocaleString(), this.W / 2, 46);

    // コイン枚数
    g.textAlign = 'left';
    g.fillStyle = COIN_COLOR;
    g.font = '700 17px sans-serif';
    g.fillText(`◉ ${game.coins}`, 16, 30);

    // ステージ名
    g.textAlign = 'right';
    g.fillStyle = 'rgba(200, 210, 255, 0.5)';
    g.font = '700 14px sans-serif';
    g.fillText(game.stage.name, this.W - 16, 30);

    g.textAlign = 'center';
    if (game.combo >= 2) {
      const scale = 1 + Math.pow(1 - beatPhase, 3) * 0.12;
      g.save();
      g.translate(this.W / 2, this.H * 0.22);
      g.scale(scale, scale);
      g.fillStyle = 'rgba(255, 255, 255, 0.92)';
      g.font = '900 54px sans-serif';
      g.fillText(String(game.combo), 0, 0);
      g.fillStyle = 'rgba(180, 200, 255, 0.65)';
      g.font = '700 15px sans-serif';
      g.fillText('COMBO', 0, 24);
      g.restore();
    }

    if (now < 0) {
      g.fillStyle = 'rgba(238, 240, 255, 0.8)';
      g.font = '900 34px sans-serif';
      g.fillText('READY...', this.W / 2, this.H * 0.42);
    }
  }
}
