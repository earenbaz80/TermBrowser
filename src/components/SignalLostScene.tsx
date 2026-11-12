import React from 'react';
import { RotateCw, WifiOff } from 'lucide-react';
import { ThemeConfig } from '../types';
import { useI18n } from '../i18n';

interface SignalLostSceneProps {
  theme: ThemeConfig;
  variant: 'offline' | 'not-found';
  url?: string;
  onRetry: () => void;
}

/**
 * Dead-channel scene for a lost connection or an unreachable page: animated
 * static, a rolling scan band and a torn title, all inside the CRT look.
 */
export const SignalLostScene: React.FC<SignalLostSceneProps> = ({ theme, variant, url, onRetry }) => {
  const { t } = useI18n();
  const offline = variant === 'offline';
  const title = offline ? t('signal.offlineTitle') : t('signal.notFoundTitle');
  const hint = offline ? t('signal.offlineHint') : t('signal.notFoundHint');

  return (
    <div
      className="signal-lost relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6 text-center font-mono"
      style={{ backgroundColor: theme.bg, color: theme.text }}
      role="alert"
      aria-live="polite"
      aria-label={title}
    >
      <div className="signal-static" aria-hidden="true" />
      <div className="signal-scan" aria-hidden="true" />

      <div className="relative z-10 flex max-w-xl flex-col items-center gap-3">
        <span
          className="signal-badge flex items-center gap-1.5 border px-2 py-1 text-[9px] uppercase tracking-[0.2em]"
          style={{ borderColor: theme.border, color: theme.accent }}
        >
          {offline ? <WifiOff className="h-3 w-3" /> : <span aria-hidden="true">404</span>}
          {offline ? t('signal.badge') : 'HTTP 404'}
        </span>

        <h2
          className="signal-title"
          data-text={title}
          style={{ color: theme.text, textShadow: `0 0 14px ${theme.accent}` }}
        >
          {title}
        </h2>

        <p className="max-w-md text-[11px] leading-5 opacity-70">{hint}</p>
        {url && !offline && (
          <p className="max-w-md truncate text-[10px] opacity-40" title={url}>
            {url}
          </p>
        )}

        <button
          type="button"
          onClick={onRetry}
          className="mt-1 flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold cursor-pointer hover:opacity-80"
          style={{ borderColor: theme.accent, backgroundColor: theme.accent, color: theme.bg }}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {t('signal.retry')}
        </button>

        <span className="signal-signature mt-2 text-[9px] uppercase tracking-[0.3em] opacity-30" aria-hidden="true">
          {t('signal.signature')}
        </span>
      </div>
    </div>
  );
};
