/**
 * Общие проверки данных JSON (worldgen.json, objects.json): типы, диапазоны, массивы.
 * Ошибка данных — это исключение с путём к полю, которое бросает `fail` вызывающего файла
 * (так сообщение начинается с имени нужного файла).
 *
 * Правило порядка (docs/M1_PLAN.md, п. 9): здесь нет for…in и Object.keys/values/entries;
 * данные читаются по известным именам полей и массивами.
 */

/** Бросает исключение «поле path: problem». Никогда не возвращает управление. */
export type Fail = (path: string, problem: string) => never;

export function asObject(value: unknown, path: string, fail: Fail): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'должно быть объектом');
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, path: string, fail: Fail): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'должно быть массивом');
  return value as readonly unknown[];
}

/** Число из поля `key` объекта `parent`; `path` — путь к самому объекту. */
export function numberField(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  fail: Fail,
  min: number,
  max: number,
  integer = false,
): number {
  const full = `${path}.${key}`;
  const value = parent[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(full, 'должно быть конечным числом');
  }
  if (integer && !Number.isInteger(value)) return fail(full, 'должно быть целым');
  if (value < min || value > max) {
    return fail(full, `должно быть в диапазоне ${min}…${max}, получено ${value}`);
  }
  return value;
}

/** Непустая строка из поля `key`. */
export function stringField(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  fail: Fail,
): string {
  const value = parent[key];
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${path}.${key}`, 'должно быть непустой строкой');
  }
  return value;
}

export function booleanField(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  fail: Fail,
): boolean {
  const value = parent[key];
  if (typeof value !== 'boolean') return fail(`${path}.${key}`, 'должно быть true или false');
  return value;
}

/** Ищет имя в таблице пар [имя, значение]; порядок таблицы фиксирован. */
export function lookupName<T>(
  table: ReadonlyArray<readonly [string, T]>,
  name: unknown,
  path: string,
  fail: Fail,
): T {
  for (const [key, value] of table) {
    if (key === name) return value;
  }
  return fail(path, `неизвестное имя «${String(name)}»`);
}
