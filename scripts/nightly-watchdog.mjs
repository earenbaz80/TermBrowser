#!/usr/bin/env node
/**
 * Watchdog del nocturno del CI.
 *
 * Falla si el workflow de CI no tiene ninguna corrida programada en las últimas
 * 36 h. Nació porque el cron llevaba días con cero ejecuciones y nada lo
 * detectaba: la vigilancia del proyecto existía en el YAML y en ningún otro
 * sitio.
 *
 * Solo cuenta corridas con `event=schedule` del workflow de CI: un dispatch
 * manual no vale, porque lo que se vigila es justamente que el cron dispare.
 *
 * Uso:
 *   GITHUB_TOKEN=... node scripts/nightly-watchdog.mjs
 *   node scripts/nightly-watchdog.mjs --runs-file corridas.json --hours 36
 *
 * Opciones:
 *   --hours N        ventana máxima entre corridas (por defecto 36)
 *   --workflow NAME  workflow vigilado (por defecto ci.yml)
 *   --repo OWNER/REPO  por defecto, GITHUB_REPOSITORY
 *   --runs-file FILE   evalúa un JSON guardado (array o `{ workflow_runs }`)
 *                      en vez de llamar a la API; sirve para diagnosticar
 */

import fs from 'node:fs';
import { DEFAULT_MAX_AGE_HOURS, evaluateNightlyRuns } from './lib/nightly-watchdog.mjs';

const LOG = '[nightly-watchdog]';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

const maxAgeHours = Number(option('--hours', DEFAULT_MAX_AGE_HOURS));
const workflow = option('--workflow', 'ci.yml');
const repository = option('--repo', process.env.GITHUB_REPOSITORY || '');
const runsFile = option('--runs-file', '');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
  console.error(`${LOG} La ventana tiene que ser un número de horas mayor que cero.`);
  process.exit(1);
}

async function loadRuns() {
  if (runsFile) {
    const parsed = JSON.parse(fs.readFileSync(runsFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.workflow_runs ?? [];
  }
  if (!repository) throw new Error('Falta --repo o GITHUB_REPOSITORY.');
  if (!token) throw new Error('Falta GITHUB_TOKEN (con permiso actions: read).');

  // Endpoint del workflow, no del repositorio: si no, la corrida del propio
  // watchdog —también programada— taparía la falta del nocturno.
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?event=schedule&per_page=20`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub respondió ${response.status} al pedir las corridas programadas de ${workflow}.`);
  }
  const payload = await response.json();
  return payload.workflow_runs ?? [];
}

function writeSummary(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    fs.appendFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    // Sin resumen se pierde contexto, no el veredicto.
  }
}

try {
  const runs = await loadRuns();
  const result = evaluateNightlyRuns(runs, { maxAgeHours });

  console.log(`${LOG} Workflow vigilado: ${workflow} | ventana máxima: ${maxAgeHours} h`);
  if (result.runs.length > 0) {
    console.log(`${LOG} Últimas corridas programadas:`);
    for (const entry of result.runs.slice(0, 5)) {
      console.log(`  ${entry.createdAt}  ${entry.conclusion ?? entry.status ?? 'sin estado'}  ${entry.url ?? ''}`);
    }
  }

  if (result.ok) {
    console.log(`${LOG} OK: ${result.reason}`);
    writeSummary(['## Watchdog del nocturno', '', `- **Estado:** OK`, `- **Última corrida:** ${result.lastRun.createdAt} (${result.lastRun.ageHours} h)`, `- **Límite:** ${maxAgeHours} h`, '']);
  } else {
    console.error(`${LOG} FAIL: ${result.reason}`);
    // Anotación en el check para que el motivo se lea sin abrir el log.
    console.error(`::error title=Sin corridas nocturnas::${result.reason}. El cron de ${workflow} no está disparando.`);
    writeSummary([
      '## Watchdog del nocturno',
      '',
      '- **Estado:** FAIL',
      `- **Motivo:** ${result.reason}`,
      `- **Workflow:** ${workflow}`,
      `- **Límite:** ${maxAgeHours} h`,
      '',
      'El cron de CI no ha corrido. Revisa que el workflow siga activo y que `on.schedule` esté en el YAML.',
      '',
    ]);
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG} FAIL: no se pudo comprobar el cron: ${message}`);
  console.error(`::error title=Watchdog sin datos::${message}`);
  writeSummary(['## Watchdog del nocturno', '', '- **Estado:** FAIL', `- **Motivo:** no se pudo leer las corridas: ${message}`, '']);
  process.exitCode = 1;
}
