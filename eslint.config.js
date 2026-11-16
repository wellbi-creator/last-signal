import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * Правила детерминизма (docs/M1_PLAN.md: решение D2 и раздел 7.1).
 * Требование «одинаковый seed — одинаковый мир на любом устройстве» нарушают две вещи:
 * 1) функции Math, результат которых по спецификации JavaScript может отличаться между движками
 *    (Safari и Chrome) на последний бит, и операция возведения в степень;
 * 2) обход данных в порядке, который зависит от обстоятельств (ключи объектов, итераторы Map/Set).
 */
const nondeterministicBans = [
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
];

// Точные операции, которые разрешены: + − × ÷, Math.floor/abs/min/max/imul, побитовые операции.
const INEXACT_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'sqrt',
  'cbrt',
  'hypot',
];

const inexactMathBans = INEXACT_MATH.map((property) => ({
  object: 'Math',
  property,
  message:
    'Результат может отличаться между движками (Safari и Chrome). Разрешены только точные ' +
    'операции: + − × ÷, floor, abs, min, max, imul. Расстояния сравнивайте через квадраты.',
}));

const ORDER_MESSAGE =
  'Порядок обхода не должен влиять на мир. Читайте данные по фиксированному списку ' +
  'идентификаторов или по индексам.';

const objectOrderBans = ['keys', 'values', 'entries', 'getOwnPropertyNames'].map((property) => ({
  object: 'Object',
  property,
  message: ORDER_MESSAGE,
}));

const powerSyntaxBans = [
  {
    selector: "BinaryExpression[operator='**']",
    message: 'Оператор ** запрещён в логике (результат может отличаться между движками).',
  },
  {
    selector: "AssignmentExpression[operator='**=']",
    message: 'Оператор **= запрещён в логике (результат может отличаться между движками).',
  },
];

const orderSyntaxBans = [
  { selector: 'ForInStatement', message: ORDER_MESSAGE },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(keys|values|entries)$/][arguments.length=0]",
    message: ORDER_MESSAGE,
  },
];

const restrictedImports = [
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
];

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
      'no-restricted-imports': restrictedImports,
      'no-restricted-properties': ['error', ...nondeterministicBans, ...inexactMathBans],
      'no-restricted-syntax': ['error', ...powerSyntaxBans],
    },
  },
  {
    // Код систем (в том числе генерация мира) дополнительно не должен зависеть от порядка обхода.
    // Правила заменяют предыдущий блок для этих файлов, поэтому списки повторены целиком.
    files: ['src/systems/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...nondeterministicBans,
        ...inexactMathBans,
        ...objectOrderBans,
      ],
      'no-restricted-syntax': ['error', ...powerSyntaxBans, ...orderSyntaxBans],
    },
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
