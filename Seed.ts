import { SEED_MAX_LENGTH } from '../config.ts';
import { hashString } from './Rng.ts';

/**
 * Приводит введённый пользователем текст seed к безопасному каноническому виду:
 * нормализация Unicode (NFC), удаление управляющих символов, сжатие пробелов, обрезка по длине.
 * Результат одинаков на всех устройствах, поэтому одинаковый ввод даёт одинаковый мир.
 * Функция идемпотентна: повторный вызов не меняет результат.
 */
export function sanitizeSeedText(input: string): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Обрезаем по кодовым точкам, чтобы не разрезать суррогатную пару (эмодзи).
  return Array.from(cleaned).slice(0, SEED_MAX_LENGTH).join('').trim();
}

/** Числовой seed мира из текста. Текст предварительно очищается. */
export function worldSeedToNumber(seedText: string): number {
  return hashString(sanitizeSeedText(seedText));
}

// Без похожих символов (нет I, O, 0, 1): 24 буквы + 8 цифр = 32 символа.
// Длина алфавита — степень двойки, поэтому выбор по байту не даёт смещения.
const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GENERATED_SEED_LENGTH = 8;

/**
 * Случайный текст seed для кнопки «случайный мир».
 * Единственное место, где допустима недетерминированность: это выбор мира, а не его генерация.
 * Вызывается только из интерфейса, никогда из логики мира.
 */
export function generateSeedText(): string {
  const bytes = new Uint8Array(GENERATED_SEED_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) {
    result += SEED_ALPHABET[byte % SEED_ALPHABET.length];
  }
  return result;
}
