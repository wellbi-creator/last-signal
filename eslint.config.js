import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Архитектурные правила: логика (core, systems) не знает о Phaser и интерфейсе,
    // и она детерминирована. Подробности — docs/ARCHITECTURE.md, раздел 3.
    files: ['src/core/**/*.ts', 'src/systems/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'Логика (core, systems) не должна зависеть от Phaser.',
            },
            {
              group: ['**/scenes/*', '**/view/*', '**/ui/*', '**/input/*'],
              message: 'Логика не должна импортировать слои отрисовки и ввода.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Недетерминированно. Используйте Rng из core/Rng.ts.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Время не должно влиять на генерацию мира и логику. Передавайте его аргументом.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
