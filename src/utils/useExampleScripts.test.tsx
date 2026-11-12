import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useI18n } from '../i18n';
import { useExampleScripts } from './useExampleScripts';

const Harness = () => {
  const { t, setLocale } = useI18n();
  const [scripts, setScripts] = useExampleScripts(t);

  return (
    <div>
      <button type="button" onClick={() => setLocale('en')}>
        switch-to-en
      </button>
      <button
        type="button"
        onClick={() =>
          setScripts((prev) =>
            prev.map((script) =>
              script.id === 'script_audit'
                ? {
                    ...script,
                    name: 'Mi auditoría',
                    description: 'Editada a mano',
                    steps: ['echo hola'],
                    custom: true,
                  }
                : script
            )
          )
        }
      >
        edit-audit
      </button>
      {scripts.map((script) => (
        <p key={script.id} data-testid={script.id}>
          {`${script.name}|${script.steps.join('|')}`}
        </p>
      ))}
    </div>
  );
};

const renderHarness = () =>
  render(
    <I18nProvider>
      <Harness />
    </I18nProvider>
  );

describe('useExampleScripts', () => {
  it('reconstruye nombre, descripción y pasos de los ejemplos al cambiar de idioma en vivo', async () => {
    renderHarness();

    expect(screen.getByTestId('script_audit').textContent).toContain(
      'Auditoría de Seguridad y Cifrado AES-256'
    );
    expect(screen.getByTestId('script_benchmark').textContent).toContain("print('Calculo factorial:'");

    fireEvent.click(screen.getByText('switch-to-en'));

    await waitFor(() =>
      expect(screen.getByTestId('script_audit').textContent).toContain(
        'Security and AES-256 Encryption Audit'
      )
    );
    expect(screen.getByTestId('script_audit').textContent).toContain(
      'echo "=== STARTING CRYPTOGRAPHIC AUDIT ==="'
    );
    expect(screen.getByTestId('script_morning_news').textContent).toContain(
      'Morning Tech News Roundup'
    );
    expect(screen.getByTestId('script_benchmark').textContent).toContain(
      "print('Factorial result:', sum([x**2 for x in range(100)]))"
    );
  });

  it('deja de seguir el idioma cuando el script está editado a mano', async () => {
    renderHarness();

    fireEvent.click(screen.getByText('edit-audit'));

    fireEvent.click(screen.getByText('switch-to-en'));
    await waitFor(() =>
      expect(screen.getByTestId('script_morning_news').textContent).toContain(
        'Morning Tech News Roundup'
      )
    );

    expect(screen.getByTestId('script_audit').textContent).toBe('Mi auditoría|echo hola');
  });
});
