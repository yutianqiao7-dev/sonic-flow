import './style.css';
import { AudioEngine } from './audio/engine';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { generateCourse } from './game/chart';
import { Game } from './game/game';
import { InputHandler } from './game/input';
import { Renderer } from './game/renderer';
import { STAGES } from './game/stages';
import type { Stage } from './game/stages';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const titleScreen = document.getElementById('title-screen')!;
const resultScreen = document.getElementById('result-screen')!;
const stageSelect = document.getElementById('stage-select')!;
const el = (id: string) => document.getElementById(id)!;

const renderer = new Renderer(canvas);

let engine: AudioEngine | null = null;
let music: Music | null = null;
let sfx: Sfx | null = null;
let game: Game | null = null;
let songStart = 0;
let playing = false;
let selectedStage: Stage = STAGES[0];

function songTime(): number {
  return engine ? engine.ctx.currentTime - songStart : 0;
}

function vibrate(ms: number): void {
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

// --- ステージ選択カード ---
function buildStageSelect(): void {
  stageSelect.innerHTML = '';
  STAGES.forEach((stage) => {
    const card = document.createElement('button');
    card.className = 'stage-card' + (stage.id === selectedStage.id ? ' selected' : '');
    card.style.setProperty('--stage-accent', `hsl(${stage.hue}, 85%, 68%)`);
    card.innerHTML = `<div class="stage-name">${stage.name}</div><div class="stage-desc">${stage.desc}</div>`;
    card.addEventListener('click', () => {
      selectedStage = stage;
      buildStageSelect();
    });
    stageSelect.appendChild(card);
  });
}
buildStageSelect();

new InputHandler(
  canvas,
  {
    onDown: (t) => {
      if (playing && game) game.handleTap(t);
    },
    onSwipe: (dir, t) => {
      if (playing && game) game.handleSwipe(dir, t);
    },
  },
  songTime,
);

async function startGame(): Promise<void> {
  if (!engine) {
    engine = new AudioEngine();
    music = new Music(engine);
    sfx = new Sfx(engine);
  }
  await engine.resume();

  const stage = selectedStage;
  sfx!.setLadder(stage.ladder);
  const course = generateCourse(stage);

  game = new Game(stage, course.entities, course.coins, {
    onJudge: ({ judgment }) => {
      if (judgment === 'miss') {
        sfx!.miss();
        vibrate(35);
      } else {
        sfx!.hit(Math.max(0, game!.combo - 1), judgment === 'perfect');
        vibrate(judgment === 'perfect' ? 15 : 8);
      }
      music!.setIntensity(game!.intensityTier);
      renderer.addJudgeEffect(judgment, game!.heightAt(songTime()), songTime());
    },
    onFreeJump: () => sfx!.tick(),
    onAirJump: () => sfx!.tick(),
    onFreeSlide: () => sfx!.tick(),
    onCoin: () => sfx!.coin(),
    onStomp: () => {
      sfx!.stomp();
      vibrate(12);
    },
  });

  songStart = engine.ctx.currentTime + 1.2;
  music!.start(stage, songStart);
  playing = true;
  titleScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__debug = { game, songTime, engine, endGame, renderer, startGame };
  }
}

function endGame(): void {
  if (!game) return;
  playing = false;
  music?.stop();

  const c = game.counts;
  const total = Math.max(1, c.perfect + c.good + c.miss);
  const acc = (c.perfect + c.good * 0.6) / total;
  const rank = acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : 'C';

  el('result-rank').textContent = rank;
  el('stat-score').textContent = game.score.toLocaleString();
  el('stat-combo').textContent = String(game.maxCombo);
  el('stat-coins').textContent = String(game.coins);
  el('stat-perfect').textContent = String(c.perfect);
  el('stat-good').textContent = String(c.good);
  el('stat-miss').textContent = String(c.miss);
  resultScreen.classList.remove('hidden');
}

function loop(): void {
  requestAnimationFrame(loop);
  if (playing && game) {
    const now = songTime();
    game.update(now);
    if (now > game.stage.songLength + 0.5 || (game.finished && now > game.stage.songLength - 2)) {
      endGame();
      return;
    }
    renderer.render(game, now, game.stage.hue, game.intensityTier);
  } else {
    renderer.render(null, 0, selectedStage.hue, 0);
  }
}

// バックグラウンドで曲ごと一時停止
document.addEventListener('visibilitychange', () => {
  if (!engine || !playing) return;
  if (document.hidden) void engine.ctx.suspend();
  else void engine.ctx.resume();
});

el('start-button').addEventListener('click', () => void startGame());
el('retry-button').addEventListener('click', () => void startGame());
el('menu-button').addEventListener('click', () => {
  resultScreen.classList.add('hidden');
  titleScreen.classList.remove('hidden');
});

loop();
