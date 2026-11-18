/**
 * Эталонные хеши мира, записанные на ПК (Node/V8) для WORLD_GEN_VERSION = 1.
 * Используются двумя способами:
 * - автотест проверяет, что генерация их воспроизводит (tests/world/chunkgen.test.ts);
 * - отладочная панель сравнивает с ними хеш на устройстве: совпадение на iPhone Safari
 *   доказывает одинаковую генерацию в JavaScriptCore и V8 (ручная проверка M1-07).
 *
 * Значения меняются ТОЛЬКО вместе с WORLD_GEN_VERSION. После M1.5–M1.7 (объекты, точки интереса,
 * тропы) они записываются заново; окончательные — в M1.8.
 */
export const GOLDEN_WORLD_HASHES: Readonly<Record<string, string>> = {
  'M0-DEMO': 'e777f55e9dc93b72',
  'LAST SIGNAL': 'de7fb2e1b5de0b10',
  '12345': '879ac42fea88dcaa',
};

/** Эталонный хеш для очищенного текста seed или undefined, если эталона нет. */
export function goldenHashFor(seedText: string): string | undefined {
  return Object.hasOwn(GOLDEN_WORLD_HASHES, seedText) ? GOLDEN_WORLD_HASHES[seedText] : undefined;
}
