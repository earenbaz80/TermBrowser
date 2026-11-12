import { useEffect, useState } from 'react';
import type { MessageKey } from '../i18n/messages';
import type { UserScript } from '../types';
import { buildExampleScripts, localizeExampleScripts } from './exampleScripts';

/**
 * Estado de los scripts: arranca en el idioma activo y sigue los cambios de
 * idioma en vivo. Los scripts editados por el usuario no se tocan.
 */
export const useExampleScripts = (t: (key: MessageKey) => string) => {
  const [scripts, setScripts] = useState<UserScript[]>(() => buildExampleScripts(t));

  useEffect(() => {
    setScripts((prev) => localizeExampleScripts(prev, t));
  }, [t]);

  return [scripts, setScripts] as const;
};
