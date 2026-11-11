import React, { useEffect, useRef } from 'react';
import { ThemeConfig } from '../types';

export interface ContextMenuItem {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  theme: ThemeConfig;
  x: number;
  y: number;
  title: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 248;
const HEADER_HEIGHT = 30;
const ITEM_HEIGHT = 30;
const VIEWPORT_MARGIN = 8;

export const ContextMenu: React.FC<ContextMenuProps> = ({ theme, x, y, title, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const close = () => onClose();

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const estimatedHeight = HEADER_HEIGHT + items.length * ITEM_HEIGHT + 12;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(x, viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN));
  const top = Math.max(VIEWPORT_MARGIN, Math.min(y, viewportHeight - estimatedHeight - VIEWPORT_MARGIN));

  return (
    <>
      <div
        className="fixed inset-0 z-[100]"
        aria-hidden="true"
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={title}
        className="context-menu-pop fixed z-[101] overflow-hidden border font-mono text-[11px] shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
        style={{
          left,
          top,
          width: MENU_WIDTH,
          backgroundColor: theme.cardBg,
          borderColor: theme.border,
          color: theme.text,
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          className="flex items-center justify-between border-b px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ borderColor: theme.border, color: theme.accent }}
        >
          <span className="truncate">{title}</span>
          <span className="ml-2 shrink-0 opacity-40">ESC</span>
        </div>
        <div className="py-1">
          {items.map((item) => (
            <React.Fragment key={item.id}>
              {item.separatorBefore && (
                <div className="my-1 border-t" style={{ borderColor: theme.border }} />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  onClose();
                }}
                className="flex w-full items-center gap-2 px-2.5 py-[5px] text-left transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                style={{
                  color: item.danger ? '#f87171' : theme.text,
                  opacity: item.disabled ? 0.35 : 1,
                }}
              >
                <span className="w-3 shrink-0 text-center" style={{ color: theme.accent }}>
                  {item.checked ? '●' : ''}
                </span>
                <span className="truncate">{item.label}</span>
                {item.hint && <span className="ml-auto shrink-0 text-[9px] opacity-40">{item.hint}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
};
