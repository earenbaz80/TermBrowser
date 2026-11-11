#!/usr/bin/env node
/**
 * Limpia artefactos antiguos:
 *  - release/: instaladores de versiones distintas a la actual (conserva la actual).
 *  - tmpdir: perfiles temporales de prueba creados por las sondas E2E
 *    (prefijos terminus-dosy-, terminus-installed-, etc.).
 *
 * Uso:
 *   node scripts/clean-release.cjs            (borra)
 *   node scripts/clean-release.cjs --dry-run  (solo muestra qué borraría)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const { version } = require(path.join(root, 'package.json'));
const dryRun = process.argv.includes('--dry-run');
const installerPattern = /^Terminus Setup (.+)\.exe(\.blockmap)?$/;
// mkdtemp appends random characters, so the suffix is required to avoid
// matching unrelated folders that merely start with the same words.
const profilePattern = /^terminus-(dosy|label|installed|pty|python|e2e|ui|probe)-[a-z0-9]+$/i;

const cleanInstallers = () => {
  if (!fs.existsSync(releaseDir)) {
    console.log('[clean-release] No existe release/; nada que limpiar ahí.');
    return;
  }

  const stale = fs
    .readdirSync(releaseDir)
    .filter((file) => installerPattern.test(file))
    .filter((file) => installerPattern.exec(file)[1] !== version);

  if (stale.length === 0) {
    console.log(`[clean-release] Solo está la versión actual (${version}); nada que borrar en release/.`);
    return;
  }

  for (const file of stale) {
    if (dryRun) {
      console.log(`[clean-release] (dry-run) borraría ${file}`);
      continue;
    }
    fs.rmSync(path.join(releaseDir, file), { force: true });
    console.log(`[clean-release] borrado ${file}`);
  }
  console.log(
    `[clean-release] ${dryRun ? 'Se borrarían' : 'Borrados'} ${stale.length} archivo(s) de versiones antiguas; se conserva ${version}.`,
  );
};

const cleanTempProfiles = () => {
  const tmpDir = os.tmpdir();
  let entries;
  try {
    entries = fs.readdirSync(tmpDir, { withFileTypes: true });
  } catch (error) {
    console.log(`[clean-release] No se pudo leer ${tmpDir}: ${error.message}`);
    return;
  }

  const profiles = entries.filter((entry) => entry.isDirectory() && profilePattern.test(entry.name));
  if (profiles.length === 0) {
    console.log('[clean-release] Sin perfiles temporales de prueba pendientes.');
    return;
  }

  let removed = 0;
  const failed = [];
  for (const entry of profiles) {
    if (dryRun) {
      console.log(`[clean-release] (dry-run) borraría el perfil ${entry.name}`);
      continue;
    }
    try {
      fs.rmSync(path.join(tmpDir, entry.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      removed += 1;
      console.log(`[clean-release] borrado perfil ${entry.name}`);
    } catch (error) {
      failed.push(entry.name);
      console.log(`[clean-release] no se pudo borrar ${entry.name}: ${error.message}`);
    }
  }

  if (dryRun) {
    console.log(`[clean-release] (dry-run) ${profiles.length} perfil(es) temporal(es) de prueba.`);
  } else {
    console.log(
      `[clean-release] Perfiles temporales: ${removed} borrado(s)${failed.length ? `, ${failed.length} bloqueado(s)` : ''}.`,
    );
  }
};

cleanInstallers();
cleanTempProfiles();
