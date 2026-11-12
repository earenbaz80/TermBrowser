/**
 * Scripts de ejemplo: sus textos y sus pasos viven en el catálogo, así que se
 * reconstruyen con el idioma activo. Los scripts editados por el usuario
 * (`custom: true`) conservan su propio texto.
 */
import type { MessageKey } from '../i18n/messages';
import type { UserScript } from '../types';

export const buildExampleSteps = (id: string, t: (key: MessageKey) => string): string[] => {
  switch (id) {
    case 'script_audit':
      return [
        `echo "${t('exampleScripts.auditStart')}"`,
        'whoami',
        'date',
        'vault status',
        `echo "${t('exampleScripts.auditVaultOk')}"`,
      ];
    case 'script_morning_news':
      return [
        `echo "${t('exampleScripts.newsFetching')}"`,
        'goto https://news.ycombinator.com',
        'reader',
        `echo "${t('exampleScripts.newsReady')}"`,
      ];
    case 'script_benchmark':
      return [
        `echo "${t('exampleScripts.benchRunning')}"`,
        `python -c "print('${t('exampleScripts.benchPrintLabel')}', sum([x**2 for x in range(100)]))"`,
        'speedtest',
        'top',
      ];
    default:
      return [];
  }
};

export const EXAMPLE_SCRIPT_KEYS: Record<string, { name: MessageKey; description: MessageKey }> = {
  script_audit: { name: 'exampleScripts.auditName', description: 'exampleScripts.auditDescription' },
  script_morning_news: {
    name: 'exampleScripts.newsName',
    description: 'exampleScripts.newsDescription',
  },
  script_benchmark: { name: 'exampleScripts.benchName', description: 'exampleScripts.benchDescription' },
};

export const buildExampleScripts = (t: (key: MessageKey) => string): UserScript[] => [
  {
    id: 'script_audit',
    name: t('exampleScripts.auditName'),
    description: t('exampleScripts.auditDescription'),
    steps: buildExampleSteps('script_audit', t),
    createdAt: '2026-11-07',
    runCount: 2,
  },
  {
    id: 'script_morning_news',
    name: t('exampleScripts.newsName'),
    description: t('exampleScripts.newsDescription'),
    steps: buildExampleSteps('script_morning_news', t),
    createdAt: '2026-11-07',
    runCount: 5,
  },
  {
    id: 'script_benchmark',
    name: t('exampleScripts.benchName'),
    description: t('exampleScripts.benchDescription'),
    steps: buildExampleSteps('script_benchmark', t),
    createdAt: '2026-11-07',
    runCount: 1,
  },
];

/**
 * Vuelve a traducir los ejemplos con el `t` actual. Devuelve el mismo objeto
 * cuando nada cambia y respeta los scripts marcados como `custom`.
 */
export const localizeExampleScripts = (
  scripts: UserScript[],
  t: (key: MessageKey) => string
): UserScript[] =>
  scripts.map((script) => {
    const keys = EXAMPLE_SCRIPT_KEYS[script.id];
    if (!keys || script.custom) return script;
    const name = t(keys.name);
    const description = t(keys.description);
    const steps = buildExampleSteps(script.id, t);
    const stepsChanged =
      steps.length !== script.steps.length || steps.some((step, i) => step !== script.steps[i]);
    return name === script.name && description === script.description && !stepsChanged
      ? script
      : { ...script, name, description, steps };
  });
