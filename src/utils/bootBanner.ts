/** Shared retro sign: terminal boot stream and the web portal. */

// Six-row ANSI Shadow lettering for TERMINUS.
const BOOT_ART = [
  '████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗██╗   ██╗███████╗',
  '╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██║   ██║██╔════╝',
  '   ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║██║   ██║███████╗',
  '   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██║   ██║╚════██║',
  '   ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝███████║',
  '   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝',
];

const BOOT_SUBTITLE = 'NAVEGADOR WEB BASADO EN LÍNEA DE COMANDOS';
const BOOT_FEATURES = '[CIFRADO AES-256-GCM] · [MFA TOTP] · [SCRIPTS PYTHON & BASH] · [MONITOR MS-DOS]';

const BOOT_INNER_WIDTH = Math.max(
  ...BOOT_ART.map((line) => line.length),
  BOOT_SUBTITLE.length,
  BOOT_FEATURES.length
);

const centerInBanner = (text: string): string => {
  const padding = Math.max(0, BOOT_INNER_WIDTH - text.length);
  const left = Math.floor(padding / 2);
  return `${' '.repeat(left)}${text}`.trimEnd();
};

// No outer frame: the ANSI Shadow artwork is the sign itself.
export const BOOT_ASCII = [
  ...BOOT_ART,
  centerInBanner(BOOT_SUBTITLE),
  centerInBanner(BOOT_FEATURES),
].join('\n');

const COMPACT_INNER_WIDTH = 34;

const centerInCompact = (text: string): string => {
  const padding = Math.max(0, COMPACT_INNER_WIDTH - text.length);
  const left = Math.floor(padding / 2);
  return `${' '.repeat(left)}${text}`.trimEnd();
};

/** Narrow-screen sign: retains the ASCII identity without shrinking to illegibility. */
export const BOOT_ASCII_COMPACT = [
  centerInCompact('TERMINUS'),
  centerInCompact('NAVEGADOR WEB DE COMANDOS'),
  centerInCompact('[AES-256] · [MFA] · [CLI]'),
].join('\n');
