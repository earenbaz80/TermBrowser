import React, { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { ThemeConfig } from '../types';
import { useI18n } from '../i18n';
import {
  clearLockPassword,
  hasLockPassword,
  MIN_LOCK_PASSWORD_LENGTH,
  setLockPassword,
  verifyLockPassword,
} from '../utils/lockStorage';

interface LockSettingsProps {
  theme: ThemeConfig;
  onLockNow: () => void;
}

type Feedback = { kind: 'idle' | 'error' | 'ok'; message?: string };

/** Password section of the settings panel: create, rotate, remove and lock now. */
export const LockSettings: React.FC<LockSettingsProps> = ({ theme, onLockNow }) => {
  const { t } = useI18n();
  const [configured, setConfigured] = useState(() => hasLockPassword());
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFeedback({ kind: 'idle' });
    if (next.length < MIN_LOCK_PASSWORD_LENGTH) {
      setFeedback({ kind: 'error', message: t('settings.passwordTooShort') });
      return;
    }
    if (next !== confirm) {
      setFeedback({ kind: 'error', message: t('settings.passwordMismatch') });
      return;
    }
    setBusy(true);
    try {
      if (configured && !(await verifyLockPassword(current))) {
        setFeedback({ kind: 'error', message: t('settings.passwordWrong') });
        return;
      }
      await setLockPassword(next);
      setConfigured(true);
      reset();
      setFeedback({ kind: 'ok', message: t('settings.passwordSaved') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (configured && !(await verifyLockPassword(current))) {
        setFeedback({ kind: 'error', message: t('settings.passwordWrong') });
        return;
      }
      clearLockPassword();
      setConfigured(false);
      reset();
      setFeedback({ kind: 'ok', message: t('settings.passwordRemoved') });
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'mb-2 w-full border px-2 py-1 text-[11px] focus:outline-hidden';
  const inputStyle = { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] opacity-60">
        <span className="flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" />
          {t('settings.password')}
        </span>
        <span>{configured ? t('settings.passwordSet') : t('settings.passwordNone')}</span>
      </div>

      <form onSubmit={save}>
        {configured && (
          <>
            <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="lock-current">
              {t('settings.passwordCurrent')}
            </label>
            <input
              id="lock-current"
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
              style={inputStyle}
            />
          </>
        )}

        <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="lock-new">
          {t('settings.passwordNew')}
        </label>
        <input
          id="lock-new"
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          autoComplete="new-password"
          className={inputClass}
          style={inputStyle}
        />

        <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="lock-confirm">
          {t('settings.passwordConfirm')}
        </label>
        <input
          id="lock-confirm"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          className={inputClass}
          style={inputStyle}
        />

        {feedback.kind !== 'idle' && (
          <p
            className="mb-2 text-[9px]"
            style={{ color: feedback.kind === 'error' ? '#f87171' : theme.accent }}
          >
            {feedback.message}
          </p>
        )}

        <div className="flex items-center gap-1">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 cursor-pointer border px-2 py-1 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: theme.accent, color: theme.accent }}
          >
            {configured ? t('settings.passwordChange') : t('settings.passwordCreate')}
          </button>
          {configured && (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="cursor-pointer border px-2 py-1 text-[10px] font-bold text-red-400 disabled:opacity-40"
                style={{ borderColor: theme.border }}
              >
                {t('settings.passwordRemove')}
              </button>
              <button
                type="button"
                onClick={onLockNow}
                className="flex cursor-pointer items-center gap-1 border px-2 py-1 text-[10px] font-bold"
                style={{ borderColor: theme.border, color: theme.text }}
                title={t('settings.lockNow')}
              >
                <Lock className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
};
