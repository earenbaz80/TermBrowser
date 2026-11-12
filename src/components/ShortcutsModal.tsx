import React, { useState } from 'react';
import { KeyBinding, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { Keyboard, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';

interface ShortcutsModalProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  keybindings: KeyBinding[];
  onUpdateKeybinding: (updated: KeyBinding[]) => void;
}

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { key: 'ctrl+t', command: 'tab new', description: 'Abrir nueva pestaña' },
  { key: 'ctrl+w', command: 'tab close', description: 'Cerrar pestaña actual' },
  { key: 'ctrl+m', command: 'voice', description: 'Activar entrada y control por voz (Web Speech API)' },
  { key: 'ctrl+j', command: 'top', description: 'Abrir monitor de recursos MS-DOS' },
  { key: 'ctrl+l', command: 'clear', description: 'Limpiar terminal; en modo web, enfocar la barra de direcciones' },
  { key: 'ctrl+s', command: 'script list', description: 'Abrir scripts de automatización' },
  { key: 'ctrl+k', command: 'vault status', description: 'Abrir panel de seguridad y cifrado' },
  { key: 'ctrl+e', command: 'ext list', description: 'Abrir gestor de extensiones' },
  { key: 'ctrl+g', command: 'theme bw', description: 'Activar estilo visual Blanco y Negro puro' },
  { key: 'ctrl+h', command: 'help', description: 'Mostrar panel de ayuda interactivo' },
  { key: 'ctrl+1', command: 'tab switch 1', description: 'Cambiar a Pestaña 1' },
  { key: 'ctrl+2', command: 'tab switch 2', description: 'Cambiar a Pestaña 2' },
  { key: 'ctrl+3', command: 'tab switch 3', description: 'Cambiar a Pestaña 3' },
  { key: 'ctrl+r', command: 'reload', description: 'Recargar página web activa' },
  { key: 'f1', command: 'help', description: 'Mostrar panel de ayuda y ejemplos' },
  { key: 'f2', command: 'mc', description: 'Abrir explorador de archivos interactivo (MC)' },
  { key: 'ctrl+f', command: 'mc', description: 'Gestión de ficheros y directorios' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  theme,
  isOpen,
  onClose,
  keybindings,
  onUpdateKeybinding,
}) => {
  const { t } = useI18n();
  const [newKey, setNewKey] = useState('');
  const [newCmd, setNewCmd] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newKey.trim() || !newCmd.trim()) {
      setErrorMsg(t('modal.shortcuts.error'));
      return;
    }

    const cleanKey = newKey.trim().toLowerCase();
    const existingIndex = keybindings.findIndex((k) => k.key.toLowerCase() === cleanKey);

    let updated: KeyBinding[];
    if (existingIndex >= 0) {
      updated = [...keybindings];
      updated[existingIndex] = {
        key: cleanKey,
        command: newCmd.trim(),
        description: newDesc.trim() || t('modal.shortcuts.autoDesc', { cmd: newCmd.trim() }),
        custom: true,
      };
    } else {
      updated = [
        ...keybindings,
        {
          key: cleanKey,
          command: newCmd.trim(),
          description: newDesc.trim() || t('modal.shortcuts.autoDesc', { cmd: newCmd.trim() }),
          custom: true,
        },
      ];
    }

    onUpdateKeybinding(updated);
    soundEffects.playExecute();
    setNewKey('');
    setNewCmd('');
    setNewDesc('');
  };

  const handleDelete = (keyToDelete: string) => {
    soundEffects.playKeyClick();
    const updated = keybindings.filter((k) => k.key !== keyToDelete);
    onUpdateKeybinding(updated);
  };

  const handleReset = () => {
    soundEffects.playKeyClick();
    onUpdateKeybinding(DEFAULT_KEYBINDINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs font-mono">
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col border shadow-2xl rounded-xs overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b select-none text-xs"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-2 font-bold">
            <Keyboard className="w-4 h-4 text-cyan-400" />
            <span>{t('modal.shortcuts.title')}</span>
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

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          <div className="text-[11px] opacity-80 leading-relaxed">
            {t('modal.shortcuts.intro')}
          </div>

          {/* List of Keybindings */}
          <div className="border divide-y rounded-xs" style={{ borderColor: theme.border }}>
            {keybindings.map((kb) => (
              <div
                key={kb.key}
                className="flex items-center justify-between p-2 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 border font-bold text-[11px] uppercase tracking-wider rounded-xs"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.cardBg,
                      color: theme.accent,
                    }}
                  >
                    {kb.key}
                  </span>
                  <div>
                    <div className="font-semibold">{kb.description}</div>
                    <div className="text-[11px] opacity-70">
                      {t('modal.shortcuts.command')} <code className="font-bold">{kb.command}</code>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {kb.custom && (
                    <span className="text-[10px] opacity-60 italic">{t('modal.shortcuts.custom')}</span>
                  )}
                  <button
                    onClick={() => handleDelete(kb.key)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-xs cursor-pointer"
                    title={t('modal.shortcuts.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Form to add/edit keybinding */}
          <form
            onSubmit={handleAdd}
            className="border p-3 rounded-xs space-y-2.5"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <div className="font-bold text-[11px] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('modal.shortcuts.create')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.shortcuts.keyLabel')}</label>
                <input
                  type="text"
                  placeholder={t('modal.shortcuts.keyPlaceholder')}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                  style={{
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                />
              </div>

              <div>
                <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.shortcuts.commandLabel')}</label>
                <input
                  type="text"
                  placeholder={t('modal.shortcuts.commandPlaceholder')}
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                  style={{
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                />
              </div>

              <div>
                <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.shortcuts.descLabel')}</label>
                <input
                  type="text"
                  placeholder={t('modal.shortcuts.descPlaceholder')}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                  style={{
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="text-[11px] text-red-400 font-bold">{errorMsg}</div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-3 py-1 text-xs font-bold border rounded-xs hover:opacity-90 cursor-pointer"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.bg,
                  borderColor: theme.accent,
                }}
              >
                {t('modal.shortcuts.bind')}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div
          className="px-3 py-2 border-t text-xs flex items-center justify-between"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[11px] opacity-75 hover:opacity-100 underline cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('modal.shortcuts.reset')}</span>
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-3 py-1 border text-xs font-bold cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
};
