import React, { useState } from 'react';
import { LockKeyhole, Unlock } from 'lucide-react';
import { ThemeConfig } from '../types';
import { useI18n } from '../i18n';
import { verifyLockPassword } from '../utils/lockStorage';

interface LockScreenProps {
  theme: ThemeConfig;
  onUnlock: () => void;
}

/** Full-window password gate shown on launch while the local lock is enabled. */
export const LockScreen: React.FC<LockScreenProps> = ({ theme, onUnlock }) => {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    const valid = await verifyLockPassword(password);
    setBusy(false);
    if (valid) {
      setPassword('');
      setError('');
      onUnlock();
      return;
    }
    setError(t('lock.error'));
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-6 font-mono"
      style={{ backgroundColor: theme.bg, color: theme.text }}
      role="dialog"
      aria-modal="true"
      aria-label={t('lock.title')}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm border p-5"
        style={{ borderColor: theme.accent, backgroundColor: theme.cardBg }}
      >
        <div className="mb-4 flex items-center gap-2" style={{ color: theme.accent }}>
          <LockKeyhole className="h-4 w-4" />
          <span className="text-sm font-bold tracking-[0.12em] uppercase">{t('lock.title')}</span>
        </div>

        <p className="mb-4 text-[11px] leading-5 opacity-75">{t('lock.subtitle')}</p>

        <label className="mb-1 block text-[9px] uppercase tracking-[0.16em] opacity-50" htmlFor="terminus-lock-password">
          {t('lock.placeholder')}
        </label>
        <input
          id="terminus-lock-password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError('');
          }}
          autoComplete="current-password"
          autoFocus
          className="mb-3 w-full border px-2 py-2 text-[13px] focus:outline-hidden"
          style={{ backgroundColor: theme.bg, borderColor: error ? '#f87171' : theme.border, color: theme.text }}
        />

        {error && (
          <p className="mb-3 text-[10px]" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!password || busy}
          className="flex w-full items-center justify-center gap-2 border px-3 py-2 text-[11px] font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: theme.accent, backgroundColor: theme.accent, color: theme.bg }}
        >
          <Unlock className="h-3.5 w-3.5" />
          {busy ? '…' : t('lock.unlock')}
        </button>

        <p className="mt-3 text-[9px] leading-4 opacity-40">{t('lock.hint')}</p>
      </form>
    </div>
  );
};
