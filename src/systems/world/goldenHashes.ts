/**
 * Эталонные хеши мира, записанные на ПК (Node/V8) для WORLD_GEN_VERSION = 1.
 * Используются двумя способами:
 * - автотест проверяет, что генерация их воспроизводит (tests/world/chunkgen.test.ts);
 * - отладочная панель сравнивает с ними хеш на устройстве: совпадение на iPhone Safari
 *   доказывает одинаковую генерацию в JavaScriptCore и V8 (ручная проверка M1-07).
 *
 * Значения меняются ТОЛЬКО вместе с WORLD_GEN_VERSION. Пока сохранений нет, они записываются
 * заново при каждом этапе, меняющем мир: M1.5a (объекты) — текущие значения; дальше точки интереса
 * и тропы (M1.6, M1.7); окончательные — в M1.8.
 * История: M1.3–M1.4 (мир без объектов): M0-DEMO e777f55e9dc93b72, LAST SIGNAL de7fb2e1b5de0b10,
 * 12345 879ac42fea88dcaa.
 */
export const GOLDEN_WORLD_HASHES: Readonly<Record<string, string>> = {
  'M0-DEMO': '9c01bd927a9b58e3',
  'LAST SIGNAL': '223d38463b146048',
  '12345': '4b812527a96549ad',
};

/** Эталонный хеш для очищенного текста seed или undefined, если эталона нет. */
export function goldenHashFor(seedText: string): string | undefined {
  return Object.hasOwn(GOLDEN_WORLD_HASHES, seedText) ? GOLDEN_WORLD_HASHES[seedText] : undefined;
}
