import { defineConfig } from 'vite';

// GitHub Pages のサブパス (https://user.github.io/<repo>/) でも動くよう
// アセット参照を相対パスにする。この SPA はルーティングを持たないため './' で十分。
export default defineConfig({
  base: './',
});
