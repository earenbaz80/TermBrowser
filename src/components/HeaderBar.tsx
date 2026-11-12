import React, { useState } from 'react';
import { BrowserTab, TabKind, ThemeConfig, ThemeId } from '../types';
import { SettingsMenu } from './SettingsMenu';
import { soundEffects } from '../utils/soundEffects';
import { WindowControls } from './WindowControls';
import { APP_VERSION } from '../utils/version';
import { useI18n } from '../i18n';
import {
  Activity,
  Folder,
  Globe,
  HelpCircle,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Plus,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

interface HeaderBarProps {
  theme: ThemeConfig;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: (kind: TabKind) => void;
  onNewSession: () => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenMonitor: () => void;
  onOpenSecurity: () => void;
  onOpenScripts: () => void;
  onOpenShortcuts: () => void;
  onOpenExtensions: () => void;
  onOpenHelp: () => void;
  onOpenFileExplorer?: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
  onLockNow: () => void;
  surface: 'web' | 'terminal';
  onSelectSurface: (surface: 'web' | 'terminal') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  currentThemeId,
  onSelectTheme,
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onNewSession,
  onCloseTab,
  isMuted,
  onToggleMute,
  onOpenMonitor,
  onOpenSecurity,
  onOpenScripts,
  onOpenShortcuts,
  onOpenExtensions,
  onOpenHelp,
  onOpenFileExplorer,
  crtEnabled,
  onToggleCrt,
  onLockNow,
  surface,
  onSelectSurface,
}) => {
  const { t } = useI18n();
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const activeKind: TabKind = tabs.find((t) => t.id === activeTabId)?.kind === 'terminal' ? 'terminal' : 'web';
  const quickActions = [
    { id: 'monitor', label: t('header.monitor'), icon: Activity, color: '#34d399', onSelect: onOpenMonitor },
    { id: 'scripts', label: t('header.scripts'), icon: Zap, color: '#fbbf24', onSelect: onOpenScripts },
    ...(onOpenFileExplorer
      ? [{ id: 'files', label: t('header.files'), icon: Folder, color: '#fcd34d', onSelect: onOpenFileExplorer }]
      : []),
    { id: 'shortcuts', label: t('header.shortcuts'), icon: Keyboard, color: '#94a3b8', onSelect: onOpenShortcuts },
    { id: 'help', label: t('header.help'), icon: HelpCircle, color: '#22d3ee', onSelect: onOpenHelp },
  ];

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2 border-b select-none font-mono text-xs z-30 shrink-0"
      style={{
        backgroundColor: theme.cardBg,
        borderColor: theme.border,
        color: theme.text,
      }}
    >
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="tb-window-drag flex items-center gap-2 whitespace-nowrap shrink-0">
        <span
          className="font-bold tracking-tight text-sm flex items-center gap-2"
          style={{ color: theme.accent }}
        >
          <Terminal className="w-4 h-4" />
          <span>Terminus</span>
        </span>
        <span className="text-[10px] opacity-60">{`v${APP_VERSION} [AES-256]`}</span>
      </div>

      {/* Zone 2: Browser Tabs and Quick Navigation Links (Single-line) */}
      <div
        className="order-last flex w-full min-w-[120px] items-center gap-1.5 overflow-x-auto border-t pt-1.5 pb-0.5"
        style={{ borderColor: theme.border }}
        role="tablist"
        aria-label={t('header.tabs')}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const selectTab = () => {
            soundEffects.playTabSwitch();
            onSelectTab(tab.id);
          };
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={selectTab}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectTab();
              }}
              onAuxClick={(event) => {
                if (event.button !== 1 || tabs.length <= 1) return;
                event.preventDefault();
                onCloseTab(tab.id, event);
              }}
              className="group flex items-center gap-1.5 px-2.5 py-1 border rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 text-xs outline-hidden focus-visible:ring-1 focus-visible:ring-current"
              title={t('header.tabTitle', {
                n: idx + 1,
                kind: tab.kind === 'terminal' ? 'terminal' : 'web',
                title: `${tab.title || t('header.newTab')}${tab.kind === 'terminal' ? '' : ` — ${tab.url}`}`,
              })}
              style={{
                borderColor: isActive ? theme.accent : theme.border,
                backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : theme.bg,
                color: isActive ? theme.accent : theme.text,
              }}
            >
              {tab.isLoading ? (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin opacity-80" />
              ) : tab.kind === 'terminal' ? (
                <Terminal className="w-3 h-3 shrink-0 opacity-70" />
              ) : tab.favicon ? (
                <img
                  src={tab.favicon}
                  alt=""
                  className="h-3 w-3 shrink-0 rounded-[2px] opacity-85"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <Globe className="w-3 h-3 shrink-0 opacity-70" />
              )}
              <span className="font-semibold max-w-[120px] truncate">
                {idx + 1}. {tab.title || t('header.newTab')}
              </span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => onCloseTab(tab.id, event)}
                  className={`${isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'} hover:text-red-400 p-0.5 transition-opacity cursor-pointer`}
                  title={t('header.closeTab')}
                  aria-label={`${t('header.closeTab')} ${tab.title || idx + 1}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onNewSession();
          }}
          className="p-1 border rounded-xs hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }}
          title={t('header.newSession')}
        >
          <Trash2 className="w-3 h-3" />
        </button>

        {/* New tab: the plain click repeats the current kind, the arrow picks one */}
        <div
          className="relative flex shrink-0 items-center overflow-visible border rounded-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
        >
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onNewTab(activeKind);
            }}
            className="p-1 hover:opacity-80 transition-opacity cursor-pointer"
            title={activeKind === 'terminal' ? t('header.newTabTerminal') : t('header.newTabWeb')}
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setNewTabMenuOpen((open) => !open);
            }}
            className="border-l px-0.5 py-1 cursor-pointer hover:opacity-80"
            style={{ borderColor: theme.border }}
            title={t('header.newTabMenu')}
          >
            <span className="block text-[8px] leading-none">▾</span>
          </button>

          {newTabMenuOpen && (
            <>
              <button
                type="button"
                aria-label={t('header.closeNewTabMenu')}
                onClick={() => setNewTabMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                className="absolute right-0 top-full z-50 mt-1 w-60 border rounded-xs font-mono text-[10px]"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
              >
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    setNewTabMenuOpen(false);
                    onNewTab('web');
                  }}
                  className="flex w-full items-start gap-2 px-2 py-1.5 text-left cursor-pointer hover:opacity-80"
                  style={{ color: theme.text }}
                >
                  <Globe className="mt-0.5 w-3 h-3 shrink-0" style={{ color: theme.accent }} />
                  <span>
                    <span className="block font-bold">{t('header.webTab')}</span>
                    <span className="block opacity-60">{t('header.webTabHint')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    setNewTabMenuOpen(false);
                    onNewTab('terminal');
                  }}
                  className="flex w-full items-start gap-2 border-t px-2 py-1.5 text-left cursor-pointer hover:opacity-80"
                  style={{ borderColor: theme.border, color: theme.text }}
                >
                  <Terminal className="mt-0.5 w-3 h-3 shrink-0" style={{ color: theme.accent }} />
                  <span>
                    <span className="block font-bold">{t('header.terminalTab')}</span>
                    <span className="block opacity-60">{t('header.terminalTabHint')}</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compact system actions: icons on wide screens, one grouped menu on narrow ones */}
      <div
        className="hidden items-center gap-0.5 shrink-0 rounded-xs border p-0.5 lg:flex"
        style={{ borderColor: theme.border }}
        role="group"
        aria-label={t('header.tools')}
      >
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                soundEffects.playKeyClick();
                action.onSelect();
              }}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-white/10"
              title={action.label}
              aria-label={action.label}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: action.color }} />
            </button>
          );
        })}
      </div>

      <div className="relative shrink-0 lg:hidden">
        <button
          type="button"
          onClick={() => {
            soundEffects.playKeyClick();
            setNewTabMenuOpen(false);
            setSystemMenuOpen((open) => !open);
          }}
          className="flex cursor-pointer items-center gap-1 rounded-xs border px-2 py-1 text-[10px] font-bold hover:opacity-80"
          style={{ borderColor: systemMenuOpen ? theme.accent : theme.border, color: theme.text }}
          title={t('header.tools')}
          aria-haspopup="menu"
          aria-expanded={systemMenuOpen}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('header.system')}</span>
        </button>

        {systemMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Cerrar menú de sistema"
              onClick={() => setSystemMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xs border font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
              role="menu"
              aria-label={t('header.tools')}
            >
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setSystemMenuOpen(false);
                      action.onSelect();
                    }}
                    className="flex w-full items-center gap-2 border-b px-2.5 py-2 text-left last:border-b-0 cursor-pointer hover:bg-white/10"
                    style={{ borderColor: theme.border, color: theme.text }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: action.color }} />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Zone 3: Controls Zone (Theme, View mode, Sound toggle) */}
      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
        {/* Real browser surface vs terminal stream */}
        <div
          className="flex items-center border rounded-xs overflow-hidden text-[10px] font-bold"
          style={{ borderColor: theme.border }}
          title={t('header.modeTitle')}
        >
          {(['web', 'terminal'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                soundEffects.playKeyClick();
                onSelectSurface(mode);
              }}
              className="px-2 py-0.5 cursor-pointer font-bold"
              style={{
                backgroundColor: surface === mode ? theme.accent : 'transparent',
                color: surface === mode ? theme.bg : theme.text,
              }}
              title={mode === 'web' ? t('header.webModeTitle') : t('header.terminalModeTitle')}
            >
              {mode === 'web' ? 'WEB' : 'TERMINAL'}
            </button>
          ))}
        </div>

      </div>
      <div className="ml-auto flex shrink-0 items-stretch -my-2 -mr-3">
        <SettingsMenu
          theme={theme}
          currentThemeId={currentThemeId}
          onSelectTheme={onSelectTheme}
          isMuted={isMuted}
          onToggleMute={onToggleMute}
          crtEnabled={crtEnabled}
          onToggleCrt={onToggleCrt}
          onLockNow={onLockNow}
          onOpenSecurity={onOpenSecurity}
          onOpenExtensions={onOpenExtensions}
        />
        <WindowControls theme={theme} />
      </div>
    </header>
  );
};
