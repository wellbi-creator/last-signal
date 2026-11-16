import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Архитектурные правила из docs/ARCHITECTURE.md (раздел 3) и docs/M1_PLAN.md (D2, раздел 7.1)
 * проверяются автоматически:
 * - логика (src/core, src/systems) не импортирует Phaser и слои отрисовки/ввода;
 * - в логике нет недетерминированных источников (Math.random, Date.now);
 * - в логике нет «приблизительных» функций Math и оператора ** (D2): они могут давать разные
 *   результаты в Safari и Chrome;
 * - в src/systems порядок обхода данных не должен зависеть от обстоятельств: нет for…in,
 *   Object.keys/values/entries и вызовов .keys()/.values()/.entries();
 * - во всём проекте нет eval / new Function и записи в innerHTML.
 * Те же правила настроены в ESLint (eslint.config.js); тест страхует на случай, если линтер
 * не запускали, а детекторы ниже сами проверены на примерах.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function listTsFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // папки может ещё не быть
  }
  const files: string[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...listTsFiles(full));
    else if (name.endsWith('.ts')) files.push(full);
  }
  return files;
}

/** Убирает комментарии, чтобы упоминание запрещённого API в тексте не считалось нарушением. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function readCode(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

const INEXACT_MATH =
  'sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|' +
  'exp|expm1|log|log1p|log2|log10|pow|sqrt|cbrt|hypot';

/** Правила для всей логики (core и systems). */
const LOGIC_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['Math.random', /\bMath\.random\b/],
  ['Date.now', /\bDate\.now\b/],
  ['неточная функция Math (D2)', new RegExp(`\\bMath\\.(?:${INEXACT_MATH})\\b`)],
  ['оператор ** (D2)', /\*\*/],
];

/** Дополнительные правила для src/systems: порядок обхода данных. */
const SYSTEMS_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ['for…in', /\bfor\s*\(\s*(?:(?:const|let|var)\s+)?[\w$.]+\s+in\s/],
  ['Object.keys/values/entries', /\bObject\.(?:keys|values|entries|getOwnPropertyNames)\b/],
  ['вызов .keys()/.values()/.entries()', /\.(?:keys|values|entries)\(\s*\)/],
];

function findViolations(code: string, scope: 'core' | 'systems'): string[] {
  const clean = stripComments(code);
  const rules = scope === 'systems' ? [...LOGIC_RULES, ...SYSTEMS_RULES] : LOGIC_RULES;
  return rules.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name);
}

const coreFiles = listTsFiles(join(ROOT, 'src', 'core'));
const systemsFiles = listTsFiles(join(ROOT, 'src', 'systems'));
const logicFiles = [...coreFiles, ...systemsFiles];
const sourceFiles = listTsFiles(join(ROOT, 'src'));

describe('детекторы правил детерминизма (проверка самих проверок)', () => {
  it('находят неточные функции Math и оператор **', () => {
    expect(findViolations('const a = Math.sin(1);', 'core')).toEqual([
      'неточная функция Math (D2)',
    ]);
    expect(findViolations('const a = Math.sqrt(4) + Math.pow(2, 3);', 'core')).toEqual([
      'неточная функция Math (D2)',
    ]);
    expect(findViolations('const a = Math.hypot(1, 2);', 'systems')).toContain(
      'неточная функция Math (D2)',
    );
    expect(findViolations('const a = 2 ** 3;', 'core')).toEqual(['оператор ** (D2)']);
    expect(findViolations('let a = 2; a **= 3;', 'systems')).toContain('оператор ** (D2)');
  });

  it('находят Math.random и Date.now', () => {
    expect(findViolations('Math.random()', 'core')).toEqual(['Math.random']);
    expect(findViolations('Date.now()', 'systems')).toContain('Date.now');
  });

  it('разрешают точные операции', () => {
    const code =
      'const a = Math.floor(1.5) + Math.abs(-1) + Math.min(1, 2) + Math.max(1, 2) + Math.imul(2, 3);';
    expect(findViolations(code, 'systems')).toEqual([]);
    expect(findViolations('const a = (7 * 3 + 2) / 5; const b = a % 3;', 'core')).toEqual([]);
  });

  it('не принимают комментарии за код', () => {
    const code = `
      /** Не используйте Math.sin и оператор ** здесь. */
      // Date.now() и Object.keys() запрещены
      const a = 1;
    `;
    expect(findViolations(code, 'systems')).toEqual([]);
  });

  it('в systems находят for…in, Object.keys/values/entries и итераторы', () => {
    expect(findViolations('for (const k in obj) {}', 'systems')).toContain('for…in');
    expect(findViolations('for (k in obj) {}', 'systems')).toContain('for…in');
    expect(findViolations('const k = Object.keys(o);', 'systems')).toContain(
      'Object.keys/values/entries',
    );
    expect(findViolations('Object.entries(o);', 'systems')).toContain('Object.keys/values/entries');
    expect(findViolations('const it = m.keys();', 'systems')).toContain(
      'вызов .keys()/.values()/.entries()',
    );
    expect(findViolations('for (const v of s.values()) {}', 'systems')).toContain(
      'вызов .keys()/.values()/.entries()',
    );
  });

  it('правила порядка применяются только к systems, а не к core', () => {
    expect(findViolations('const k = Object.keys(o); for (const x in o) {}', 'core')).toEqual([]);
  });

  it('обычные циклы и методы Map разрешены', () => {
    const code = `
      for (let i = 0; i < arr.length; i++) {}
      for (const x of arr) {}
      m.set(1, 2); m.get(1); m.has(1); m.delete(1);
    `;
    expect(findViolations(code, 'systems')).toEqual([]);
  });
});

describe('архитектурные правила', () => {
  it('находит файлы логики (защита от пустой проверки)', () => {
    expect(coreFiles.length).toBeGreaterThan(5);
    expect(systemsFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('логика не импортирует Phaser', () => {
    for (const file of logicFiles) {
      const code = readCode(file);
      expect(
        /from\s+['"]phaser(\/[^'"]*)?['"]/.test(code),
        `${relative(ROOT, file)} импортирует Phaser`,
      ).toBe(false);
    }
  });

  it('логика не импортирует scenes, view, ui и input', () => {
    for (const file of logicFiles) {
      const code = readCode(file);
      expect(
        /from\s+['"][^'"]*\/(scenes|view|ui|input)\//.test(code),
        `${relative(ROOT, file)} импортирует слой отрисовки или ввода`,
      ).toBe(false);
    }
  });

  it('ядро не импортирует systems (зависимости идут сверху вниз)', () => {
    for (const file of coreFiles) {
      const code = readCode(file);
      expect(
        /from\s+['"][^'"]*\/systems\//.test(code),
        `${relative(ROOT, file)} импортирует systems`,
      ).toBe(false);
    }
  });

  it('логика детерминирована: нет Math.random, Date.now, неточных Math и ** (D2)', () => {
    for (const file of coreFiles) {
      expect(findViolations(readFileSync(file, 'utf8'), 'core'), relative(ROOT, file)).toEqual([]);
    }
  });

  it('systems не зависят от порядка обхода и детерминированы', () => {
    for (const file of systemsFiles) {
      expect(findViolations(readFileSync(file, 'utf8'), 'systems'), relative(ROOT, file)).toEqual(
        [],
      );
    }
  });

  it('в проекте нет eval и new Function', () => {
    for (const file of sourceFiles) {
      const code = readCode(file);
      expect(/\beval\s*\(/.test(code), `${relative(ROOT, file)}: eval`).toBe(false);
      expect(/\bnew\s+Function\s*\(/.test(code), `${relative(ROOT, file)}: new Function`).toBe(
        false,
      );
    }
  });

  it('пользовательские данные не вставляются через innerHTML', () => {
    for (const file of sourceFiles) {
      const code = readCode(file);
      expect(/\.innerHTML\s*=/.test(code), `${relative(ROOT, file)}: innerHTML`).toBe(false);
    }
  });
});
