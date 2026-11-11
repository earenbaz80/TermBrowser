import React, { useState, useRef } from 'react';
import { BrowserTab, TabKind, ThemeConfig, ThemeId } from '../types';
import { THEMES } from '../utils/themes';
import { soundEffects, SoundTheme } from '../utils/soundEffects';
import {
  Activity,
  Blocks,
  Folder,
  Globe,
  HelpCircle,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Plus,
  Shield,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
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
  surface,
  onSelectSurface,
}) => {
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => soundEffects.getSoundTheme());
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const activeKind: TabKind = tabs.find((t) => t.id === activeTabId)?.kind === 'terminal' ? 'terminal' : 'web';
  const [customWavName, setCustomWavName] = useState<string | null>(() => soundEffects.getCustomSoundName());
  const wavInputRef = useRef<HTMLInputElement>(null);
  const quickActions = [
    { id: 'monitor', label: 'Monitor', icon: Activity, color: '#34d399', onSelect: onOpenMonitor },
    { id: 'scripts', label: 'Scripts', icon: Zap, color: '#fbbf24', onSelect: onOpenScripts },
    ...(onOpenFileExplorer
      ? [{ id: 'files', label: 'Archivos', icon: Folder, color: '#fcd34d', onSelect: onOpenFileExplorer }]
      : []),
    { id: 'security', label: 'Seguridad', icon: Shield, color: '#22d3ee', onSelect: onOpenSecurity },
    { id: 'extensions', label: 'Extensiones', icon: Blocks, color: '#a78bfa', onSelect: onOpenExtensions },
    { id: 'shortcuts', label: 'Atajos', icon: Keyboard, color: '#94a3b8', onSelect: onOpenShortcuts },
    { id: 'help', label: 'Ayuda', icon: HelpCircle, color: '#22d3ee', onSelect: onOpenHelp },
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
      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <span
          className="font-bold tracking-tight text-sm flex items-center gap-2"
          style={{ color: theme.accent }}
        >
          <Terminal className="w-4 h-4" />
          <span>Terminus</span>
        </span>
        <span className="text-[10px] opacity-60">v0.2.0 [AES-256]</span>
      </div>

      {/* Zone 2: Browser Tabs and Quick Navigation Links (Single-line) */}
      <div
        className="order-last flex w-full min-w-[120px] items-center gap-1.5 overflow-x-auto border-t pt-1.5 pb-0.5"
        style={{ borderColor: theme.border }}
        role="tablist"
        aria-label="Pestañas abiertas"
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
              title={`Pestaña ${idx + 1} (${tab.kind === 'terminal' ? 'terminal' : 'web'}): ${tab.title || 'Nueva Pestaña'}${
                tab.kind === 'terminal' ? '' : ` — ${tab.url}`
              } (Ctrl+${idx + 1})`}
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
                {idx + 1}. {tab.title || 'Nueva Pestaña'}
              </span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => onCloseTab(tab.id, event)}
                  className={`${isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'} hover:text-red-400 p-0.5 transition-opacity cursor-pointer`}
                  title="Cerrar pestaña (Ctrl+W)"
                  aria-label={`Cerrar pestaña ${tab.title || idx + 1}`}
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
          title="Nueva sesión: cerrar todas las pestañas y empezar de cero"
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
            title={`Nueva pestaña ${activeKind === 'terminal' ? 'de terminal' : 'web'} (Ctrl+T)`}
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
            title="Elegir el tipo de pestaña nueva"
          >
            <span className="block text-[8px] leading-none">▾</span>
          </button>

          {newTabMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar menú de pestaña nueva"
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
                    <span className="block font-bold">Pestaña web</span>
                    <span className="block opacity-60">Barra de direcciones, página real y marcadores</span>
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
                    <span className="block font-bold">Pestaña de terminal</span>
                    <span className="block opacity-60">Su propio flujo de comandos y su historial</span>
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
        aria-label="Herramientas de Terminus"
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
            setAudioOpen(false);
            setSystemMenuOpen((open) => !open);
          }}
          className="flex cursor-pointer items-center gap-1 rounded-xs border px-2 py-1 text-[10px] font-bold hover:opacity-80"
          style={{ borderColor: systemMenuOpen ? theme.accent : theme.border, color: theme.text }}
          title="Herramientas de Terminus"
          aria-haspopup="menu"
          aria-expanded={systemMenuOpen}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">SISTEMA</span>
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
              aria-label="Herramientas de Terminus"
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
          title="MODO WEB: página real con barra de direcciones · MODO TERMINAL: comandos, archivos y monitor"
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
              title={
                mode === 'web'
                  ? 'Navegación web normal: barra de direcciones y página real'
                  : 'Terminal: comandos, archivos, scripts y monitor'
              }
            >
              {mode === 'web' ? 'WEB' : 'TERMINAL'}
            </button>
          ))}
        </div>

        {/* Theme Picker Dropdown */}
        <select
          value={currentThemeId}
          onChange={(e) => {
            soundEffects.playKeyClick();
            onSelectTheme(e.target.value as ThemeId);
          }}
          className="px-2 py-1 text-[11px] font-bold border rounded-xs cursor-pointer focus:outline-hidden"
          style={{
            backgroundColor: theme.bg,
            borderColor: theme.border,
            color: theme.accent,
          }}
          title="Seleccionar tema estético de terminal"
        >
          {Object.values(THEMES).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {/* Quick Pure Black & White Visual Mode Toggle */}
        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onSelectTheme(currentThemeId === 'black-and-white' ? 'cyberpunk-obsidian' : 'black-and-white');
          }}
          className={`px-2 py-1 border text-[11px] font-bold rounded-xs cursor-pointer transition-colors ${
            currentThemeId === 'black-and-white'
              ? 'bg-white text-black border-white'
              : 'opacity-75 hover:opacity-100'
          }`}
          style={{
            borderColor: currentThemeId === 'black-and-white' ? '#ffffff' : theme.border,
          }}
          title="Activar/Desactivar modo visual 100% Blanco y Negro (Comando: bw o theme bw)"
        >
          B&amp;W
        </button>

        {/* CRT Scanline Toggle */}
        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onToggleCrt();
          }}
          className={`px-2 py-1 border text-[11px] font-bold rounded-xs cursor-pointer transition-colors ${
            crtEnabled ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
          }`}
          style={{ borderColor: theme.border }}
          title="Alternar filtro CRT de fósforo"
        >
          CRT
        </button>

        <input
          ref={wavInputRef}
          type="file"
          accept=".wav,audio/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              const res = await soundEffects.loadCustomWavFile(file);
              if (res.success) {
                setCustomWavName(file.name);
              } else {
                alert(res.message);
              }
            }
          }}
        />

        {/* Audio: synthesizer, notification WAV and mute in one compact panel */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEffects.playKeyClick();
              setSystemMenuOpen(false);
              setAudioOpen((open) => !open);
            }}
            className="relative flex cursor-pointer items-center gap-1 rounded-xs border px-2 py-1 text-[10px] font-bold hover:opacity-80"
            style={{
              borderColor: audioOpen ? theme.accent : theme.border,
              backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.15)' : theme.bg,
              color: isMuted ? '#fca5a5' : theme.accent,
            }}
            title={isMuted ? 'Audio silenciado · abrir ajustes' : 'Ajustes de audio y notificaciones'}
            aria-haspopup="dialog"
            aria-expanded={audioOpen}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">AUDIO</span>
            {customWavName && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.accent }} />
            )}
          </button>

          {audioOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar ajustes de audio"
                onClick={() => setAudioOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                className="absolute bottom-full right-0 z-50 mb-1 w-64 rounded-xs border p-2 font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                role="dialog"
                aria-label="Ajustes de audio"
              >
                <div className="mb-2 flex items-center justify-between border-b pb-1.5 text-[9px] uppercase tracking-[0.14em] opacity-60" style={{ borderColor: theme.border }}>
                  <span>Audio / notificaciones</span>
                  <span>{isMuted ? 'OFF' : 'ON'}</span>
                </div>

                <button
                  type="button"
                  onClick={onToggleMute}
                  className="mb-2 flex w-full items-center justify-between border px-2 py-1.5 cursor-pointer hover:bg-white/5"
                  style={{ borderColor: theme.border }}
                >
                  <span>{isMuted ? 'Activar sonido' : 'Silenciar sonido'}</span>
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>

                <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="terminus-sound-theme">
                  Sintetizador
                </label>
                <select
                  id="terminus-sound-theme"
                  value={soundTheme}
                  onChange={(e) => {
                    const val = e.target.value as SoundTheme;
                    soundEffects.setSoundTheme(val);
                    setSoundTheme(val);
                  }}
                  className="mb-2 w-full border px-2 py-1 text-[11px] cursor-pointer focus:outline-hidden"
                  style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.accent }}
                >
                  <option value="ibm-pc">IBM PC Speaker</option>
                  <option value="c64-synth">Commodore 64 Synth</option>
                  <option value="modern-ui">Modern UI</option>
                </select>

                <div className="mb-1 text-[9px] uppercase tracking-wide opacity-50">Notificación WAV</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      soundEffects.playKeyClick();
                      wavInputRef.current?.click();
                    }}
                    className="min-w-0 flex-1 cursor-pointer truncate border px-2 py-1 text-left hover:bg-white/5"
                    style={{ borderColor: customWavName ? theme.accent : theme.border, color: theme.text }}
                    title={customWavName ? `WAV activo: ${customWavName}` : 'Cargar un WAV corto'}
                  >
                    {customWavName ? `WAV: ${customWavName}` : 'Cargar WAV…'}
                  </button>
                  {customWavName && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEffects.playKeyClick();
                        soundEffects.clearCustomSound();
                        setCustomWavName(null);
                      }}
                      className="shrink-0 cursor-pointer border px-1.5 py-1 text-red-400 hover:text-red-300"
                      style={{ borderColor: theme.border }}
                      title="Quitar WAV personalizado"
                      aria-label="Quitar WAV personalizado"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
