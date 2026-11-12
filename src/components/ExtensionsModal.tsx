import React, { useState } from 'react';
import { ExtensionManifest, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { Puzzle, Check, Play, Terminal, Code } from 'lucide-react';
import { useI18n } from '../i18n';
import { localizeExtensions } from '../i18n/extensions';

interface ExtensionsModalProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  extensions: ExtensionManifest[];
  onToggleExtension: (id: string) => void;
  onRunCommandInTerminal: (cmd: string) => void;
}

export const ExtensionsModal: React.FC<ExtensionsModalProps> = ({
  theme,
  isOpen,
  onClose,
  extensions,
  onToggleExtension,
  onRunCommandInTerminal,
}) => {
  const { t, locale } = useI18n();
  const localizedExtensions = localizeExtensions(locale, extensions);
  const [selectedExt, setSelectedExt] = useState<ExtensionManifest | null>(extensions[0] || null);
  const selectedText = selectedExt
    ? localizedExtensions.find((ext) => ext.id === selectedExt.id) ?? selectedExt
    : null;
  const [showApiDoc, setShowApiDoc] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs font-mono">
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col border shadow-2xl rounded-xs overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b select-none text-xs"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-2 font-bold">
            <Puzzle className="w-4 h-4 text-purple-400" />
            <span>{t('modal.ext.title')}</span>
          </div>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-2 py-0.5 border font-bold hover:bg-red-900/40 cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            [X]
          </button>
        </div>

        {/* Sub-header / API doc toggle */}
        <div
          className="px-3 py-1.5 border-b text-xs flex items-center justify-between"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <span className="text-[11px] opacity-80">
            {t('modal.ext.enabled', {
              n: extensions.filter((e) => e.installed).length,
              total: extensions.length,
            })}
          </span>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setShowApiDoc(!showApiDoc);
            }}
            className="text-[11px] underline hover:opacity-100 cursor-pointer flex items-center gap-1"
          >
            <Code className="w-3.5 h-3.5" />
            <span>{showApiDoc ? t('modal.ext.showCatalog') : t('modal.ext.showApi')}</span>
          </button>
        </div>

        {/* Content */}
        {showApiDoc ? (
          <div className="p-4 overflow-y-auto space-y-3 text-xs">
            <h3 className="font-bold text-sm text-cyan-400">{t('modal.ext.apiTitle')}</h3>
            <p className="opacity-80 text-[11px] leading-relaxed">
              {t('modal.ext.apiIntro')}
            </p>
            <pre
              className="p-3 border rounded-xs font-mono text-[11px] overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            >
{`{
  "id": "my-tool",
  "name": "My Automation Tool",
  "version": "1.0.0",
  "author": "Dev",
  "commands": [
    {
      "name": "mytool",
      "description": "Ejecuta analisis personalizado",
      "usage": "mytool <target> [--flags]"
    }
  ]
}`}
            </pre>
            <div className="text-[11px] opacity-75">
              {t('modal.ext.apiInstall')} <code className="font-bold">ext install &lt;nombre&gt;</code>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: theme.border }}>
            {/* Left Extension List */}
            <div className="p-3 overflow-y-auto space-y-1.5 text-xs" style={{ backgroundColor: theme.cardBg }}>
              {localizedExtensions.map((ext) => {
                const isSelected = selectedExt?.id === ext.id;
                return (
                  <div
                    key={ext.id}
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setSelectedExt(ext);
                    }}
                    className="p-2 border cursor-pointer transition-colors rounded-xs"
                    style={{
                      borderColor: isSelected ? theme.accent : theme.border,
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : theme.bg,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold truncate">{ext.name}</span>
                      {ext.installed ? (
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> {t('modal.ext.active')}
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-50">{t('modal.ext.inactive')}</span>
                      )}
                    </div>
                    <div className="text-[10px] opacity-70 mt-1 truncate">{ext.description}</div>
                  </div>
                );
              })}
            </div>

            {/* Right Details */}
            <div className="md:col-span-2 p-4 overflow-y-auto flex flex-col justify-between text-xs">
              {selectedText ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold">{selectedText.name}</h3>
                      <div className="text-[11px] opacity-70 mt-0.5">
                        {t('modal.ext.meta', { version: selectedText.version, author: selectedText.author })}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        soundEffects.playKeyClick();
                        onToggleExtension(selectedText.id);
                      }}
                      className="px-3 py-1 border text-xs font-bold rounded-xs cursor-pointer"
                      style={{
                        borderColor: theme.border,
                        backgroundColor: selectedText.installed ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                        color: selectedText.installed ? '#fca5a5' : '#86efac',
                      }}
                    >
                      {selectedText.installed ? t('modal.ext.disable') : t('modal.ext.enable')}
                    </button>
                  </div>

                  <p className="text-xs opacity-85 leading-relaxed">{selectedText.description}</p>

                  <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div className="text-[11px] font-bold opacity-80 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t('modal.ext.commands')}</span>
                    </div>

                    <div className="space-y-2">
                      {selectedText.commands.map((cmd) => (
                        <div key={cmd.name} className="p-2 border rounded-xs space-y-1" style={{ borderColor: theme.border, backgroundColor: theme.bg }}>
                          <div className="flex items-center justify-between">
                            <code className="font-bold text-xs text-amber-400">{cmd.name}</code>
                            <button
                              onClick={() => {
                                soundEffects.playKeyClick();
                                onRunCommandInTerminal(cmd.usage);
                                onClose();
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 border text-[10px] font-bold hover:opacity-80 cursor-pointer"
                              style={{ borderColor: theme.border }}
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>{t('modal.ext.try')}</span>
                            </button>
                          </div>
                          <div className="text-[11px] opacity-80">{cmd.description}</div>
                          <div className="text-[10px] font-mono opacity-60">
                            {t('modal.ext.syntax', { usage: cmd.usage })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center opacity-60">{t('modal.ext.pick')}</div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="px-3 py-2 border-t text-xs flex justify-end"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-4 py-1 border text-xs font-bold cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
