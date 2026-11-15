import { describe, expect, it } from 'vitest';
import { SEED_MAX_LENGTH } from '../../src/config.ts';
import { generateSeedText, sanitizeSeedText, worldSeedToNumber } from '../../src/core/Seed.ts';

describe('sanitizeSeedText', () => {
  it('обрезает пробелы и сжимает повторные', () => {
    expect(sanitizeSeedText('  мой   мир  ')).toBe('мой мир');
  });

  it('заменяет управляющие символы и переводы строк на пробел', () => {
    expect(sanitizeSeedText('a\u0000b\nc\td')).toBe('a b c d');
  });

  it('ограничивает длину', () => {
    const result = sanitizeSeedText('x'.repeat(SEED_MAX_LENGTH * 3));
    expect(Array.from(result)).toHaveLength(SEED_MAX_LENGTH);
  });

  it('не разрезает эмодзи при обрезке', () => {
    const result = sanitizeSeedText('🙂'.repeat(SEED_MAX_LENGTH + 10));
    expect(Array.from(result)).toHaveLength(SEED_MAX_LENGTH);
    expect(result).toBe('🙂'.repeat(SEED_MAX_LENGTH));
  });

  it('приводит Unicode к форме NFC: визуально одинаковый ввод даёт один seed', () => {
    const composed = 'é'; // é одним символом
    const decomposed = 'é'; // e + комбинируемый акцент
    expect(sanitizeSeedText(decomposed)).toBe(composed);
  });

  it('идемпотентна', () => {
    const once = sanitizeSeedText('  Hello\u0007  World 🙂  ');
    expect(sanitizeSeedText(once)).toBe(once);
  });

  it('пустой и «пробельный» ввод даёт пустую строку', () => {
    expect(sanitizeSeedText('')).toBe('');
    expect(sanitizeSeedText(' \n\t ')).toBe('');
  });

  it('не интерпретирует разметку: возвращает текст как есть', () => {
    expect(sanitizeSeedText('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('worldSeedToNumber', () => {
  it('одинаковый текст после очистки даёт одно число', () => {
    expect(worldSeedToNumber(' abc ')).toBe(worldSeedToNumber('abc'));
  });

  it('разный текст даёт разные числа', () => {
    expect(worldSeedToNumber('abc')).not.toBe(worldSeedToNumber('abd'));
  });
});

describe('generateSeedText', () => {
  it('создаёт 8 символов из безопасного алфавита', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateSeedText()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it('результат проходит очистку без изменений', () => {
    const seed = generateSeedText();
    expect(sanitizeSeedText(seed)).toBe(seed);
  });
});
