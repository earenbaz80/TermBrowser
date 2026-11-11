import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import { TerminusDesktopApi, ThemeConfig } from '../types';

interface WindowTitleBarProps {
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

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({ theme }) => {
  const [desktop] = useState<TerminusDesktopApi | null>(() =>
    typeof window !== 'undefined' ? window.terminusDesktop ?? null : null
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const desktopOnlyTitle = 'Disponible al abrir Terminus como aplicación de escritorio';

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
      className="tb-window-bar flex h-8 shrink-0 items-stretch justify-between overflow-hidden"
      style={{
        backgroundColor: theme.cardBg,
        borderBottom: `1px solid ${theme.border}`,
        color: theme.text,
      }}
      data-testid="window-titlebar"
    >
      <div className="tb-window-drag flex min-w-0 flex-1 items-center gap-2 px-3">
        <Terminal className="h-3 w-3 shrink-0" style={{ color: theme.accent }} aria-hidden="true" />
        <span
          className="truncate text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{ color: theme.accent }}
        >
          Terminus
        </span>
        <span className="hidden truncate text-[9px] uppercase tracking-[0.16em] opacity-40 sm:inline">
          / app de escritorio
        </span>
      </div>

      <div
        className="tb-window-controls flex shrink-0 items-stretch"
        role="group"
        aria-label="Controles de ventana"
      >
        <button
          type="button"
          className="tb-window-button"
          style={{ borderColor: theme.border }}
          onClick={() => desktop?.minimize()}
          aria-disabled={!desktop}
          aria-label="Minimizar ventana"
          title={desktop ? 'Minimizar' : desktopOnlyTitle}
        >
          <MinimizeIcon />
        </button>

        <button
          type="button"
          className="tb-window-button"
          style={{ borderColor: theme.border }}
          onClick={handleMaximize}
          aria-disabled={!desktop}
          aria-label={isMaximized ? 'Restaurar ventana' : 'Maximizar ventana'}
          title={desktop ? (isMaximized ? 'Restaurar' : 'Maximizar') : desktopOnlyTitle}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        <button
          type="button"
          className="tb-window-button tb-window-button--close"
          style={{ borderColor: theme.border }}
          onClick={() => desktop?.close()}
          aria-disabled={!desktop}
          aria-label="Cerrar ventana"
          title={desktop ? 'Cerrar' : desktopOnlyTitle}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
