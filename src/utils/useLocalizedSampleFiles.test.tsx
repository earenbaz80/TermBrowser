import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { I18nProvider, useI18n } from '../i18n';
import { buildInitialFileSystem, VirtualFile } from './interpreter';
import { useLocalizedSampleFiles } from './useLocalizedSampleFiles';

const fileText = (id: string) => screen.getByTestId(id).textContent ?? '';

const Harness = () => {
  const { t, setLocale } = useI18n();
  const [fileSystem, setFileSystem] = useState<Record<string, VirtualFile[]>>(buildInitialFileSystem);
  useLocalizedSampleFiles(setFileSystem, t);

  const contents = (path: string) =>
    (fileSystem[path] ?? []).map((file) => `${file.name}:${file.content ?? ''}`).join('\n');

  return (
    <div>
      <button type="button" onClick={() => setLocale('en')}>
        switch-to-en
      </button>
      <button
        type="button"
        onClick={() =>
          setFileSystem((prev) => ({
            ...prev,
            '/home/user': (prev['/home/user'] ?? []).map((file) =>
              file.name === 'readme.txt' ? { ...file, content: 'mi nota' } : file
            ),
          }))
        }
      >
        edit-readme
      </button>
      <p data-testid="home">{contents('/home/user')}</p>
      <p data-testid="scripts">{contents('/home/user/scripts')}</p>
    </div>
  );
};

const renderHarness = () =>
  render(
    <I18nProvider>
      <Harness />
    </I18nProvider>
  );

describe('useLocalizedSampleFiles', () => {
  it('re-traduce benchmark.py, readme.txt, audit.sh y scrape_news.py al cambiar de idioma', async () => {
    renderHarness();

    expect(fileText('home')).toContain('Resultado de computo paralelo');
    expect(fileText('home')).toContain('Navegador web controlado por linea de comandos');
    expect(fileText('scripts')).toContain('Auditoria de seguridad iniciada');
    expect(fileText('scripts')).toContain('Obteniendo titulares de actualidad');

    fireEvent.click(screen.getByText('switch-to-en'));

    await waitFor(() => expect(fileText('home')).toContain('Parallel compute result'));
    expect(fileText('home')).toContain('Command-line controlled web browser with AES-256 encryption.');
    expect(fileText('scripts')).toContain('Security audit started');
    expect(fileText('scripts')).toContain('Fetching current headlines');
  });

  it('no pisa un archivo de muestra que el usuario ha editado', async () => {
    renderHarness();

    fireEvent.click(screen.getByText('edit-readme'));
    fireEvent.click(screen.getByText('switch-to-en'));

    await waitFor(() => expect(fileText('scripts')).toContain('Security audit started'));
    expect(fileText('home')).toContain('readme.txt:mi nota');
  });
});
