import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Архитектурные правила из docs/ARCHITECTURE.md, раздел 3, проверяются автоматически:
 * - логика (src/core, src/systems) не импортирует Phaser и слои отрисовки/ввода;
 * - в логике нет недетерминированных источников (Math.random, Date.now);
 * - во всём проекте нет eval / new Function.
 * Те же правила настроены в ESLint; тест страхует на случай, если линтер не запускали.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function listTsFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // папки может ещё не быть (например, src/systems до этапа M1)
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

const logicFiles = [
  ...listTsFiles(join(ROOT, 'src', 'core')),
  ...listTsFiles(join(ROOT, 'src', 'systems')),
];
const sourceFiles = listTsFiles(join(ROOT, 'src'));

describe('архитектурные правила', () => {
  it('находит файлы логики (защита от пустой проверки)', () => {
    expect(logicFiles.length).toBeGreaterThan(5);
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

  it('логика не использует Math.random и Date.now', () => {
    for (const file of logicFiles) {
      const code = readCode(file);
      expect(/\bMath\.random\b/.test(code), `${relative(ROOT, file)}: Math.random`).toBe(false);
      expect(/\bDate\.now\b/.test(code), `${relative(ROOT, file)}: Date.now`).toBe(false);
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
