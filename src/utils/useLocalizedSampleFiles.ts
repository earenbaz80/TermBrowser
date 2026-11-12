import { useEffect } from 'react';
import type { MessageKey } from '../i18n/messages';
import type { VirtualFile } from './interpreter';
import { localizeSampleFiles } from './interpreter';

/**
 * Los archivos de muestra del intérprete siguen el idioma en vivo igual que los
 * scripts de ejemplo; lo que el usuario haya editado no se toca.
 */
export const useLocalizedSampleFiles = (
  setFileSystem: React.Dispatch<React.SetStateAction<Record<string, VirtualFile[]>>>,
  t: (key: MessageKey) => string
) => {
  useEffect(() => {
    setFileSystem((prev) => localizeSampleFiles(prev, t));
  }, [setFileSystem, t]);
};
