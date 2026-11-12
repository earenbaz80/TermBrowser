import React, { useEffect, useRef, useState } from 'react';
import { Blocks, Languages, Menu, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import { ThemeConfig, ThemeId } from '../types';
import { THEMES } from '../utils/themes';
import { themeName } from '../i18n/themes';
import { soundEffects, SoundTheme } from '../utils/soundEffects';
import { LOCALES } from '../i18n/locales';
import { useI18n } from '../i18n';
import { LockSettings } from './LockSettings';
import { applyAdblockEnabled, readAdblockState, AdblockState } from '../utils/adblockPreference';

interface SettingsMenuProps {
  theme: ThemeConfig;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  crtEnabled: boolean;
  onToggleCrt: () => void;
  onLockNow: () => void;
  onOpenSecurity: () => void;
  onOpenExtensions: () => void;
}

/**
 * Single entry point for configuration. Language, audio, visual settings,
 * ad blocking and local security live here so the header stays short.
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({
  theme,
  currentThemeId,
  onSelectTheme,
  isMuted,
  onToggleMute,
  crtEnabled,
  onToggleCrt,
  onLockNow,
  onOpenSecurity,
  onOpenExtensions,
}) => {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => soundEffects.getSoundTheme());
  const [customWavName, setCustomWavName] = useState<string | null>(() => soundEffects.getCustomSoundName());
  const [adblock, setAdblock] = useState<AdblockState>({ enabled: true, available: false });
  const [adblockBusy, setAdblockBusy] = useState(false);
  const wavInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void readAdblockState().then((state) => {
      if (active) setAdblock(state);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const toggleAdblock = async () => {
    if (adblockBusy || !adblock.available) return;
    soundEffects.playKeyClick();
    setAdblockBusy(true);
    setAdblock((previous) => ({ ...previous, enabled: !previous.enabled }));
    const state = await applyAdblockEnabled(!adblock.enabled);
    setAdblock(state);
    setAdblockBusy(false);
  };

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
        aria-label={t('settings.open')}
        title={t('settings.open')}
      >
        <Menu className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={t('settings.close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-3.5rem)] w-72 overflow-y-auto border p-2 font-mono text-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
            role="dialog"
            aria-label={t('settings.title')}
          >
            <div
              className="mb-2 flex items-center justify-between border-b pb-1.5 text-[9px] uppercase tracking-[0.14em] opacity-60"
              style={{ borderColor: theme.border }}
            >
              <span>{t('settings.title')}</span>
              <span>{isMuted ? t('settings.audioOff') : t('settings.audioOn')}</span>
            </div>

            <section aria-label={t('settings.language')} className="mb-3">
              {sectionTitle(t('settings.language'))}
              <label className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wide opacity-50" htmlFor="terminus-locale-select">
                <Languages className="h-3 w-3" />
                {t('settings.languageLabel')}
              </label>
              <select
                id="terminus-locale-select"
                value={locale}
                onChange={(event) => {
                  soundEffects.playKeyClick();
                  setLocale(event.target.value as (typeof LOCALES)[number]['id']);
                }}
                className="w-full border px-2 py-1 text-[11px] cursor-pointer focus:outline-hidden"
                style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.accent }}
              >
                {LOCALES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </section>

            <section aria-label={t('settings.audio')} className="mb-3 border-t pt-2" style={{ borderColor: theme.border }}>
              {sectionTitle(t('settings.audio'))}
              <button
                type="button"
                onClick={onToggleMute}
                className="mb-2 flex w-full items-center justify-between border px-2 py-1.5 cursor-pointer hover:bg-white/5"
                style={{ borderColor: theme.border }}
              >
                <span>{isMuted ? t('settings.unmute') : t('settings.mute')}</span>
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>

              <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="terminus-sound-theme">
                {t('settings.synth')}
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

              <div className="mb-1 text-[9px] uppercase tracking-wide opacity-50">{t('settings.wav')}</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    wavInputRef.current?.click();
                  }}
                  className="min-w-0 flex-1 cursor-pointer truncate border px-2 py-1 text-left hover:bg-white/5"
                  style={{ borderColor: customWavName ? theme.accent : theme.border, color: theme.text }}
                  title={customWavName ? `WAV: ${customWavName}` : t('settings.wavLoad')}
                >
                  {customWavName ? `WAV: ${customWavName}` : t('settings.wavLoad')}
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
                    title={t('settings.wavRemove')}
                    aria-label={t('settings.wavRemove')}
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
              aria-label={t('settings.appearance')}
              className="mb-3 border-t pt-2"
              style={{ borderColor: theme.border }}
            >
              {sectionTitle(t('settings.themes'))}
              <label className="mb-1 block text-[9px] uppercase tracking-wide opacity-50" htmlFor="terminus-theme-select">
                {t('settings.theme')}
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
                title={t('settings.theme')}
              >
                {Object.values(THEMES).map((option) => (
                  <option key={option.id} value={option.id}>
                    {themeName(locale, option.id)}
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
                  title={t('settings.bw')}
                >
                  {t('settings.bw')}
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
                  title={t('settings.crt')}
                >
                  {t('settings.crt')}
                </button>
              </div>
            </section>

            <section
              aria-label={t('settings.adblock')}
              className="mb-3 border-t pt-2"
              style={{ borderColor: theme.border }}
            >
              {sectionTitle(t('settings.adblock'))}
              <button
                type="button"
                onClick={() => void toggleAdblock()}
                disabled={!adblock.available || adblockBusy}
                aria-pressed={adblock.enabled}
                className="mb-1 flex w-full items-center justify-between border px-2 py-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: adblock.enabled ? theme.accent : theme.border }}
              >
                <span>{t('settings.adblock')}</span>
                <span style={{ color: adblock.enabled ? theme.accent : theme.text }}>
                  {adblock.enabled ? t('settings.on') : t('settings.off')}
                </span>
              </button>
              <p className="text-[9px] leading-4 opacity-45">
                {adblock.available ? t('settings.adblockHint') : t('settings.adblockDesktopOnly')}
              </p>
            </section>

            <section
              aria-label={t('settings.browser')}
              className="mb-3 border-t pt-2"
              style={{ borderColor: theme.border }}
            >
              {sectionTitle(t('settings.browser'))}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    setOpen(false);
                    onOpenSecurity();
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 border px-2 py-1.5 cursor-pointer hover:bg-white/5"
                  style={{ borderColor: theme.border, color: theme.text }}
                >
                  <ShieldCheck className="h-3 w-3 shrink-0" style={{ color: theme.accent }} />
                  {t('header.security')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    setOpen(false);
                    onOpenExtensions();
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 border px-2 py-1.5 cursor-pointer hover:bg-white/5"
                  style={{ borderColor: theme.border, color: theme.text }}
                >
                  <Blocks className="h-3 w-3 shrink-0" style={{ color: theme.accent }} />
                  {t('header.extensions')}
                </button>
              </div>
            </section>

            <section
              aria-label={t('settings.security')}
              className="mb-1 border-t pt-2"
              style={{ borderColor: theme.border }}
            >
              {sectionTitle(t('settings.security'))}
              <LockSettings theme={theme} onLockNow={onLockNow} />

              {/* Security opens from the Navegador section, so this block only describes the vault. */}
              <div className="mt-3 border-t pt-2" style={{ borderColor: theme.border }}>
                <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] opacity-60">
                  <ShieldCheck className="h-3 w-3" />
                  {t('settings.vault')}
                </div>
                <p className="text-[9px] leading-4 opacity-45">{t('settings.vaultHint')}</p>
              </div>
            </section>

            <p className="mt-2 border-t pt-1.5 text-[9px] leading-4 opacity-40" style={{ borderColor: theme.border }}>
              {t('settings.footer')}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
