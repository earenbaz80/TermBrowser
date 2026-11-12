import React, { useEffect, useState } from 'react';
import { TerminusDesktopApi, ThemeConfig } from '../types';
import { useI18n } from '../i18n';

interface WindowControlsProps {
  theme: ThemeConfig;
}

const MinimizeIcon: React.FC = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M2.25 5h5.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const MaximizeIcon: React.FC = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const RestoreIcon: React.FC = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M3.1 2.6V1.5h5.4v5.4H7.4" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x="1.5" y="3.1" width="5.4" height="5.4" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

/**
 * Native window buttons of the frameless desktop window. They live in the app
 * header so the shell does not need a second title bar above it.
 */
export const WindowControls: React.FC<WindowControlsProps> = ({ theme }) => {
  const { t } = useI18n();
  const [desktop] = useState<TerminusDesktopApi | null>(() =>
    typeof window !== 'undefined' ? window.terminusDesktop ?? null : null
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const desktopOnlyTitle = t('window.desktopOnly');

  useEffect(() => {
    if (!desktop) return;

    let active = true;
    desktop.isMaximized().then(
      (value) => {
        if (active) setIsMaximized(value);
      },
      () => {}
    );

    const unsubscribe = desktop.onMaximizedChange((value) => {
      if (active) setIsMaximized(value);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktop]);

  const handleMaximize = () => {
    if (!desktop) return;
    desktop.toggleMaximize().then(setIsMaximized, () => {});
  };

  return (
    <div
      className="tb-window-controls flex shrink-0 items-stretch self-stretch"
      role="group"
      aria-label={t('window.controls')}
    >
      <button
        type="button"
        className="tb-window-button"
        style={{ borderColor: theme.border }}
        onClick={() => desktop?.minimize()}
        aria-disabled={!desktop}
        aria-label={t('window.minimize')}
        title={desktop ? t('window.minimizeTitle') : desktopOnlyTitle}
      >
        <MinimizeIcon />
      </button>

      <button
        type="button"
        className="tb-window-button"
        style={{ borderColor: theme.border }}
        onClick={handleMaximize}
        aria-disabled={!desktop}
        aria-label={isMaximized ? t('window.restore') : t('window.maximize')}
        title={
          desktop
            ? isMaximized
              ? t('window.restoreTitle')
              : t('window.maximizeTitle')
            : desktopOnlyTitle
        }
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button
        type="button"
        className="tb-window-button tb-window-button--close"
        style={{ borderColor: theme.border }}
        onClick={() => desktop?.close()}
        aria-disabled={!desktop}
        aria-label={t('window.close')}
        title={desktop ? t('window.closeTitle') : desktopOnlyTitle}
      >
        <CloseIcon />
      </button>
    </div>
  );
};
