#!/usr/bin/env node
/**
 * Prepara los artefactos de una release de Windows.
 *
 * Localiza el instalador NSIS recién generado, escribe `release/SHA256SUMS.txt`
 * con el formato del release (hash, dos espacios y el nombre) y redacta
 * `release/RELEASE_NOTES.md`. Lo usan el CI (solo los hashes) y el workflow de
 * release (hashes, notas y nombres para publicar), así que el formato vive en
 * un único sitio.
 *
 * Uso:
 *   node scripts/release-artifacts.cjs                        # tag = v<versión>
 *   node scripts/release-artifacts.cjs --tag v0.3.0-rc1
 *   node scripts/release-artifacts.cjs --tag v0.3.0 --check-only
 *   node scripts/release-artifacts.cjs --dir release
 *
 * El tag tiene que ser `v<versión>` o `v<versión>-<sufijo>` (el sufijo marca
 * la release como preliminar). Si existe `$GITHUB_OUTPUT`, escribe ahí
 * `installer`, `sums`, `notes`, `version`, `tag` y `prerelease`.
 */

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return '';
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : '';
}

const dir = path.resolve(root, option('dir') || 'release');
const tag = option('tag') || `v${version}`;
const checkOnly = args.includes('--check-only');

const match = new RegExp(`^v${version.replace(/\./g, '\\.')}(?:-(.+))?$`).exec(tag);
if (!match) {
  console.error(
    `El tag ${tag} no corresponde a la versión ${version} de package.json: sube la versión antes de publicar, o usa v${version}[-sufijo].`,
  );
  process.exit(1);
}
const prerelease = Boolean(match[1]);
console.log(`Tag ${tag}: versión ${version}${prerelease ? ` (preliminar: ${match[1]})` : ''}.`);

if (checkOnly) process.exit(0);

/** Instalador NSIS más reciente; electron-builder deja además su desinstalador. */
function findInstaller() {
  const candidates = fs
    .readdirSync(dir)
    .filter((file) => /^Terminus Setup .+\.exe$/.test(file) && !file.includes('__uninstaller'))
    .map((file) => path.join(dir, file))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const installer = candidates[0];
  if (!installer) {
    throw new Error(`No se encontró ningún instalador NSIS en ${dir}: ejecuta npm run desktop:build.`);
  }
  if (!path.basename(installer).includes(version)) {
    throw new Error(
      `El instalador ${path.basename(installer)} no es de la versión ${version}: hay artefactos de otra versión en ${dir}.`,
    );
  }
  return installer;
}

function writeNotes({ installer, hash, sumsName }) {
  const installerName = path.basename(installer);
  const lines = [
    `# Terminus ${version}${prerelease ? ` (${match[1]})` : ''}`,
    '',
    'Instalador de Windows generado desde el tag `' + tag + '`.',
    '',
    '## Descarga',
    '',
    `- \`${installerName}\``,
    '',
    '## Verificación',
    '',
    '```',
    `${hash}  ${installerName}`,
    '```',
    '',
    'Comprueba el hash con:',
    '',
    '```powershell',
    `(Get-FileHash -Algorithm SHA256 -LiteralPath "${installerName}").Hash.ToLowerInvariant()`,
    '```',
    '',
    `El fichero \`${sumsName}\` adjunto lleva la misma línea.`,
    '',
    '## Instalación',
    '',
    '- Windows 10 u 11 de 64 bits.',
    `- Doble clic, o instalación silenciosa con \`"${installerName}" /S\`.`,
    '- Instalar encima de una versión anterior conserva el perfil (tema, pestañas, búsquedas recientes).',
    '',
    '## Notas',
    '',
    '- El instalador se publica **sin firma Authenticode** por decisión del proyecto: Windows SmartScreen puede mostrar una advertencia. Verifica el binario con el hash de arriba.',
    '- Firma de código (referencia): `docs/code-signing-windows.md`.',
    '- E2E sobre la app instalada: `docs/e2e-installed-windows.md`.',
    '',
  ];
  if (process.env.GITHUB_SHA) {
    lines.push(`Commit: \`${process.env.GITHUB_SHA}\`.`, '');
  }

  const notesPath = path.join(dir, 'RELEASE_NOTES.md');
  fs.writeFileSync(notesPath, lines.join('\n'), 'utf8');
  return notesPath;
}

try {
  const installer = findInstaller();
  const hash = createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
  const sumsPath = path.join(dir, 'SHA256SUMS.txt');
  // Mismo formato que el release: hash, dos espacios y el nombre, sin BOM.
  fs.writeFileSync(sumsPath, `${hash}  ${path.basename(installer)}\n`, 'utf8');

  const notesPath = writeNotes({ installer, hash, sumsName: 'SHA256SUMS.txt' });

  const outputs = {
    installer: path.resolve(installer),
    sums: path.resolve(sumsPath),
    notes: path.resolve(notesPath),
    version,
    tag,
    prerelease: String(prerelease),
  };

  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(os.EOL) + os.EOL);
  }

  console.log(JSON.stringify(outputs, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
