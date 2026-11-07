import React, { useState, useRef } from 'react';
import { BrowserTab, ThemeConfig, ThemeId, ViewMode } from '../types';
import { THEMES } from '../utils/themes';
import { soundEffects, SoundTheme } from '../utils/soundEffects';
import { Terminal, Volume2, VolumeX, Shield, Activity, Plus, X, Globe, Zap, Keyboard, HelpCircle, Folder } from 'lucide-react';

interface HeaderBarProps {
  theme: ThemeConfig;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  viewMode: ViewMode;
  onSetViewMode: (mode: ViewMode) => void;
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
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  currentThemeId,
  onSelectTheme,
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  viewMode,
  onSetViewMode,
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
}) => {
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => soundEffects.getSoundTheme());
  const [customWavName, setCustomWavName] = useState<string | null>(() => soundEffects.getCustomSoundName());
  const wavInputRef = useRef<HTMLInputElement>(null);

  return (
    <header
      className="flex items-center justify-between gap-8 px-4 py-2.5 border-b select-none font-mono text-xs z-30 shrink-0"
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
          <span>TermBrowser OS</span>
        </span>
        <span className="text-[10px] opacity-60">v2.4 [AES-256]</span>
      </div>

      {/* Zone 2: Browser Tabs and Quick Navigation Links (Single-line) */}
      <div className="hidden lg:flex items-center gap-2 overflow-x-auto max-w-2xl py-0.5">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => {
                soundEffects.playTabSwitch();
                onSelectTab(tab.id);
              }}
              className="group flex items-center gap-1.5 px-2.5 py-1 border rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 text-xs"
              style={{
                borderColor: isActive ? theme.accent : theme.border,
                backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : theme.bg,
                color: isActive ? theme.accent : theme.text,
              }}
            >
              <Globe className="w-3 h-3 shrink-0 opacity-70" />
              <span className="font-semibold max-w-[120px] truncate">
                {idx + 1}. {tab.title || 'Nueva Pestaña'}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => onCloseTab(tab.id, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 transition-opacity cursor-pointer"
                  title="Cerrar pestaña (Ctrl+W)"
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
            onNewTab();
          }}
          className="p-1 border rounded-xs hover:opacity-80 transition-opacity cursor-pointer shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
          title="Nueva pestaña (Ctrl+T)"
        >
          <Plus className="w-3 h-3" />
        </button>

        <span className="opacity-30">|</span>

        {/* Action Link Triggers */}
        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenMonitor();
          }}
          className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Monitor</span>
        </button>

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenScripts();
          }}
          className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Scripts</span>
        </button>

        {onOpenFileExplorer && (
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onOpenFileExplorer();
            }}
            className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
            title="Explorador de archivos (MC / F2)"
          >
            <Folder className="w-3.5 h-3.5 text-amber-300" />
            <span>Archivos</span>
          </button>
        )}

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenSecurity();
          }}
          className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
        >
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span>Seguridad</span>
        </button>

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenExtensions();
          }}
          className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Extensiones</span>
        </button>

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenShortcuts();
          }}
          className="hover:underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
          title="Atajos de teclado"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>Atajos</span>
        </button>

        <button
          onClick={() => {
            soundEffects.playKeyClick();
            onOpenHelp();
          }}
          className="hover:underline opacity-90 hover:opacity-100 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 font-semibold"
          style={{ color: theme.accent }}
          title="Manual interactivo de comandos (F1 o help)"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Ayuda</span>
        </button>
      </div>

      {/* Zone 3: Controls Zone (Theme, View mode, Sound toggle) */}
      <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
        {/* View Mode Segmented Selector */}
        <div
          className="hidden sm:flex items-center p-0.5 border rounded-xs"
          style={{ borderColor: theme.border, backgroundColor: theme.bg }}
        >
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onSetViewMode('split');
            }}
            className={`px-2 py-0.5 text-[11px] font-bold rounded-xs cursor-pointer transition-colors ${
              viewMode === 'split' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ color: viewMode === 'split' ? theme.accent : undefined }}
            title="Vista dividida (Terminal + Navegador)"
          >
            SPLIT
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onSetViewMode('terminal');
            }}
            className={`px-2 py-0.5 text-[11px] font-bold rounded-xs cursor-pointer transition-colors ${
              viewMode === 'terminal' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ color: viewMode === 'terminal' ? theme.accent : undefined }}
            title="Terminal exclusiva"
          >
            TERM
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onSetViewMode('browser');
            }}
            className={`px-2 py-0.5 text-[11px] font-bold rounded-xs cursor-pointer transition-colors ${
              viewMode === 'browser' ? 'bg-white/15' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ color: viewMode === 'browser' ? theme.accent : undefined }}
            title="Navegador web completo"
          >
            WEB
          </button>
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

        {/* Sound Theme Selector */}
        <select
          value={soundTheme}
          onChange={(e) => {
            const val = e.target.value as SoundTheme;
            soundEffects.setSoundTheme(val);
            setSoundTheme(val);
          }}
          className="px-2 py-1 text-[11px] font-bold border rounded-xs cursor-pointer focus:outline-hidden"
          style={{
            backgroundColor: theme.bg,
            borderColor: theme.border,
            color: theme.accent,
          }}
          title="Selector de sintetizador de audio (IBM PC Speaker, Commodore 64 Synth, Modern UI)"
        >
          <option value="ibm-pc">IBM PC Speaker</option>
          <option value="c64-synth">Commodore 64 Synth</option>
          <option value="modern-ui">Modern UI</option>
        </select>

        {/* Hidden WAV file input */}
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

        {/* Custom WAV Notification Button */}
        <button
          onClick={() => {
            soundEffects.playKeyClick();
            wavInputRef.current?.click();
          }}
          className="px-2 py-1 border text-[11px] font-bold rounded-xs cursor-pointer truncate max-w-[130px]"
          style={{
            borderColor: customWavName ? theme.accent : theme.border,
            backgroundColor: customWavName ? 'rgba(16, 185, 129, 0.15)' : theme.bg,
            color: customWavName ? theme.accent : theme.text,
          }}
          title={customWavName ? `WAV personalizado activo: ${customWavName} (Clic para cambiar)` : 'Cargar sonido WAV de notificación corto'}
        >
          {customWavName ? `WAV: ${customWavName}` : '[Cargar WAV]'}
        </button>

        {customWavName && (
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              soundEffects.clearCustomSound();
              setCustomWavName(null);
            }}
            className="p-1 border text-red-400 hover:text-red-300 cursor-pointer text-[10px]"
            style={{ borderColor: theme.border }}
            title="Eliminar sonido WAV personalizado"
          >
            [X]
          </button>
        )}

        {/* 8-bit Audio Toggle */}
        <button
          onClick={onToggleMute}
          className="p-1 border rounded-xs hover:opacity-80 transition-opacity cursor-pointer"
          style={{
            borderColor: theme.border,
            backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.15)' : theme.bg,
            color: isMuted ? '#fca5a5' : theme.accent,
          }}
          title={isMuted ? 'Activar sonido de 8-bits' : 'Silenciar sonido de 8-bits'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
