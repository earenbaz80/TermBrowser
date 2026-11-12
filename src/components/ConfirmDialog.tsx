import React, { useEffect, useRef } from 'react';
import { ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n';

interface ConfirmDialogProps {
  theme: ThemeConfig;
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Themed replacement for window.confirm: same panel style as the rest of the modals */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  theme,
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Keep the latest handlers without re-running the effect (and stealing focus) on every parent render
  const cancelHandlerRef = useRef(onCancel);
  cancelHandlerRef.current = onCancel;
  const confirmHandlerRef = useRef(onConfirm);
  confirmHandlerRef.current = onConfirm;

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Lock background scroll while the dialog is open, compensating the scrollbar width
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    cancelRef.current?.focus();
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);

    const getFocusable = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'));
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelHandlerRef.current();
        return;
      }

      if (event.key === 'Enter') {
        // A focused button activates itself; only handle Enter for loose focus
        const focused = document.activeElement as HTMLElement | null;
        const onButton = !!focused && focused.tagName === 'BUTTON' && !!panelRef.current?.contains(focused);
        if (!onButton) {
          event.preventDefault();
          confirmHandlerRef.current();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement as HTMLElement | null;
      const inside = !!focused && !!panelRef.current?.contains(focused);

      if (event.shiftKey) {
        if (!inside || focused === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || focused === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKey);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-mono"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onPointerDown={(event) => {
        // Mouse, pen and touch alike: only a press that starts on the overlay itself dismisses
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={panelRef}
        onPointerDown={(event) => event.stopPropagation()}
        className="relative w-full max-w-md border-2 rounded-xs shadow-2xl"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.border }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
          <h2
            id="confirm-dialog-title"
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: theme.accent }}
          >
            {title}
          </h2>
        </div>

        <p className="px-3 py-4 text-[11px] leading-relaxed opacity-85">{message}</p>

        <div className="flex justify-end gap-2 border-t px-3 py-2" style={{ borderColor: theme.border }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              onCancel();
            }}
            className="border px-3 py-1 text-[10px] font-bold cursor-pointer hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              onConfirm();
            }}
            className="border px-3 py-1 text-[10px] font-bold cursor-pointer hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
            style={{ borderColor: theme.accent, backgroundColor: theme.accent, color: theme.bg }}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
