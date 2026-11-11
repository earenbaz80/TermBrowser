import React, { useRef, useState } from 'react';
import { Menu, Volume2, VolumeX, X } from 'lucide-react';
import { ThemeConfig, ThemeId } from '../types';
import { THEMES } from '../utils/themes';
import { soundEffects, SoundTheme } from '../utils/soundEffects';

interface SettingsMenuProps {
  theme: ThemeConfig;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
}

/**
 * Single entry point for configuration. Audio and visual settings live here so the
 * header stays short, and new options can be added as extra sections of this panel.
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  theme,
  currentThemeId,
  onSelectTheme,
  isMuted,
  onToggleMute,
  crtEnabled,
  onToggleCrt,
}) => {
  const [open, setOpen] = useState(false);
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => soundEffects.getSoundTheme());
  const [customWavName, setCustomWavName] = useState<string | null>(() => soundEffects.getCustomSoundName());
  const wavInputRef = useRef<HTMLInputElement>(null);

  const sectionTitle = (label: string) => (
    <div className="mb-1 text-[9px] uppercase tracking-[0.16em] opacity-50">{label}</div>
  );

  return (
    <div className="relative flex shrink-0 items-stretch">
      <button
        type="button"
        className="tb-window-button"
        style={{ borderColor: theme.border }}
        onClick={() => {
          soundEffects.playKeyClick();
          setOpen((value) => !value);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Menú de configuración"
        title="Configuración: audio, temas visuales y más"
      >
        <Menu className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar menú de configuración"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 w-72 border p-2 font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
            role="dialog"
            aria-label="Configuración"
          >
            <div
              className="mb-2 flex items-center justify-between border-b pb-1.5 text-[9px] uppercase tracking-[0.14em] opacity-60"
              style={{ borderColor: theme.border }}
            >
              <span>Configuración</span>
              <span>{isMuted ? 'AUDIO OFF' : 'AUDIO ON'}</span>
            </div>

            <section aria-label="Audio" className="mb-3">
              {sectionTitle('Audio')}
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
                onChange={(event) => {
                  const value = event.target.value as SoundTheme;
                  soundEffects.setSoundTheme(value);
                  setSoundTheme(value);
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

              <input
                ref={wavInputRef}
                type="file"
                accept=".wav,audio/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const result = await soundEffects.loadCustomWavFile(file);
                  if (result.success) setCustomWavName(file.name);
                  else alert(result.message);
                }}
              />
            </section>

            <section
              aria-label="Apariencia"
              className="border-t pt-2"
              style={{ borderColor: theme.border }}
            >
              {sectionTitle('Temas visuales')}
              <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="terminus-theme-select">
                Tema
              </label>
              <select
                id="terminus-theme-select"
                value={currentThemeId}
                onChange={(event) => {
                  soundEffects.playKeyClick();
                  onSelectTheme(event.target.value as ThemeId);
                }}
                className="mb-2 w-full border px-2 py-1 text-[11px] cursor-pointer focus:outline-hidden"
                style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.accent }}
                title="Seleccionar tema estético de terminal"
              >
                {Object.values(THEMES).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onSelectTheme(currentThemeId === 'black-and-white' ? 'cyberpunk-obsidian' : 'black-and-white');
                  }}
                  className="flex-1 cursor-pointer border px-2 py-1 text-[10px] font-bold"
                  style={{
                    borderColor: currentThemeId === 'black-and-white' ? '#ffffff' : theme.border,
                    backgroundColor: currentThemeId === 'black-and-white' ? '#ffffff' : 'transparent',
                    color: currentThemeId === 'black-and-white' ? '#000000' : theme.text,
                  }}
                  title="Activar/Desactivar modo visual 100% Blanco y Negro (Comando: bw o theme bw)"
                >
                  B&amp;W
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onToggleCrt();
                  }}
                  className="flex-1 cursor-pointer border px-2 py-1 text-[10px] font-bold"
                  style={{
                    borderColor: crtEnabled ? theme.accent : theme.border,
                    backgroundColor: crtEnabled ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: theme.text,
                  }}
                  title="Alternar filtro CRT de fósforo"
                >
                  CRT
                </button>
              </div>
            </section>

            <p className="mt-2 border-t pt-1.5 text-[9px] leading-4 opacity-40" style={{ borderColor: theme.border }}>
              Aquí se irán sumando las próximas opciones de configuración.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
