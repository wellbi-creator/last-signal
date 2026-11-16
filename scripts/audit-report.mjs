// Отчёт `npm audit` для CI. Не блокирует сборку: всегда завершается с кодом 0.
// Показывает пакет, установленную версию, уровень опасности, относится ли пакет к игре
// (production-зависимости) или только к инструментам разработки, описание и исправление.
// Запуск: node scripts/audit-report.mjs
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const LEVELS = ['critical', 'high', 'moderate', 'low', 'info'];

/** Запускает `npm audit --json`; npm возвращает код 1 при найденных уязвимостях — это не ошибка. */
function runAudit(extraArgs) {
  try {
    return JSON.parse(
      execFileSync('npm', ['audit', '--json', ...extraArgs], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (error) {
    const out = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
    try {
      return JSON.parse(out);
    } catch {
      return { error: String(error instanceof Error ? error.message : error) };
    }
  }
}

function installedVersions() {
  try {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    return lock.packages ?? {};
  } catch {
    return {};
  }
}

function versionOf(packages, name) {
  return packages[`node_modules/${name}`]?.version ?? '?';
}

function describeVia(via) {
  const parts = [];
  for (const item of via ?? []) {
    if (typeof item === 'string') parts.push(`через ${item}`);
    else if (item && typeof item === 'object') {
      parts.push(item.url ? `${item.title ?? 'уязвимость'} (${item.url})` : (item.title ?? '?'));
    }
  }
  return parts.join('; ');
}

function describeFix(fixAvailable) {
  if (fixAvailable === false || fixAvailable === undefined) return 'исправления нет';
  if (fixAvailable === true) return 'npm audit fix';
  const major = fixAvailable.isSemVerMajor ? ' (МАЖОРНОЕ обновление)' : '';
  return `${fixAvailable.name}@${fixAvailable.version}${major}`;
}

export function buildReport(all, prod, packages) {
  const lines = ['## npm audit (не блокирует сборку)', ''];
  if (all.error || !all.vulnerabilities) {
    const reason =
      typeof all.error === 'string'
        ? all.error
        : all.error?.summary || all.error?.code || JSON.stringify(all.error ?? all);
    lines.push(`Аудит не выполнен: ${reason}`);
    return lines.join('\n');
  }
  const prodNames = new Set(Object.keys(prod.vulnerabilities ?? {}));
  const rows = Object.values(all.vulnerabilities).sort(
    (a, b) =>
      LEVELS.indexOf(a.severity) - LEVELS.indexOf(b.severity) || a.name.localeCompare(b.name),
  );
  const meta = all.metadata?.vulnerabilities ?? {};
  lines.push(
    `Всего: ${rows.length}. ` + LEVELS.map((l) => `${l}: ${meta[l] ?? 0}`).join(', ') + '.',
    `Затрагивают игру (production): ${prodNames.size}.`,
    '',
    '| Пакет | Версия | Опасность | В игре | Описание | Исправление |',
    '|---|---|---|---|---|---|',
  );
  for (const v of rows) {
    const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${cell(v.name)} | ${versionOf(packages, v.name)} | ${v.severity} | ` +
        `${prodNames.has(v.name) ? 'ДА' : 'нет'} | ${cell(describeVia(v.via))} | ` +
        `${cell(describeFix(v.fixAvailable))} |`,
    );
  }
  const critical = rows.filter((v) => v.severity === 'critical');
  const criticalProd = critical.filter((v) => prodNames.has(v.name));
  lines.push(
    '',
    `Критических: ${critical.length}, из них в игровых зависимостях: ${criticalProd.length}.`,
  );
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const packages = installedVersions();
  const report = buildReport(runAudit([]), runAudit(['--omit=dev']), packages);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
}
