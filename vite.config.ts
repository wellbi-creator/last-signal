import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Относительный base: сборка открывается и в корне домена, и в подпапке
  // GitHub Pages (https://<user>.github.io/<repo>/) без правок.
  base: './',
  build: {
    // Phaser весит больше 500 КБ: выносим в отдельный чанк, чтобы он кэшировался
    // независимо от кода игры, и поднимаем порог предупреждения.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Тесты расстановки объектов генерируют десятки целых миров: на медленном CI запас важнее скорости.
    testTimeout: 30000,
  },
});
