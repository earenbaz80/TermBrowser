import React, { useState } from 'react';
import { ThemeConfig, UserScript } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { Play, Plus, Trash2, Edit3, Code, Zap } from 'lucide-react';
import { useI18n } from '../i18n';

interface AutomationScriptsModalProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  scripts: UserScript[];
  onRunScript: (script: UserScript) => void;
  onSaveScript: (script: UserScript) => void;
  onDeleteScript: (id: string) => void;
}

export const AutomationScriptsModal: React.FC<AutomationScriptsModalProps> = ({
  theme,
  isOpen,
  onClose,
  scripts,
  onRunScript,
  onSaveScript,
  onDeleteScript,
}) => {
  const { t } = useI18n();
  const [selectedScript, setSelectedScript] = useState<UserScript | null>(scripts[0] || null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStepsText, setEditStepsText] = useState('');

  if (!isOpen) return null;

  const handleStartCreate = () => {
    soundEffects.playKeyClick();
    setSelectedScript(null);
    setEditName(t('scripts.defaultName'));
    setEditDesc(t('scripts.defaultDescription'));
    setEditStepsText(t('scripts.defaultSteps'));
    setIsEditing(true);
  };

  const handleStartEdit = (script: UserScript) => {
    soundEffects.playKeyClick();
    setSelectedScript(script);
    setEditName(script.name);
    setEditDesc(script.description);
    setEditStepsText(script.steps.join('\n'));
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    const steps = editStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#'));

    const newScript: UserScript = {
      id: selectedScript ? selectedScript.id : `script_${Date.now()}`,
      name: editName.trim(),
      description: editDesc.trim(),
      steps,
      createdAt: selectedScript ? selectedScript.createdAt : new Date().toISOString().split('T')[0],
      runCount: selectedScript ? selectedScript.runCount : 0,
    };

    onSaveScript(newScript);
    soundEffects.playExecute();
    setSelectedScript(newScript);
    setIsEditing(false);
  };

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
            <Zap className="w-4 h-4 text-amber-400" />
            <span>{t('modal.scripts.title')}</span>
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
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: theme.border }}>
          {/* Left Script List */}
          <div className="p-3 overflow-y-auto space-y-2 text-xs" style={{ backgroundColor: theme.cardBg }}>
            <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: theme.border }}>
              <span className="font-bold text-[11px] opacity-80">
                {t('modal.scripts.list', { n: scripts.length })}
              </span>
              <button
                onClick={handleStartCreate}
                className="flex items-center gap-1 px-1.5 py-0.5 border text-[11px] font-bold hover:opacity-80 cursor-pointer"
                style={{ borderColor: theme.border, backgroundColor: theme.bg }}
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                <span>{t('modal.scripts.new')}</span>
              </button>
            </div>

            <div className="space-y-1">
              {scripts.map((script) => {
                const isSelected = selectedScript?.id === script.id && !isEditing;
                return (
                  <div
                    key={script.id}
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setSelectedScript(script);
                      setIsEditing(false);
                    }}
                    className="p-2 border cursor-pointer transition-colors rounded-xs"
                    style={{
                      borderColor: isSelected ? theme.accent : theme.border,
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : theme.bg,
                    }}
                  >
                    <div className="font-bold truncate">{script.name}</div>
                    <div className="text-[10px] opacity-70 truncate mt-0.5">{script.description}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px] opacity-60">
                      <span>{t('modal.scripts.steps', { n: script.steps.length })}</span>
                      <span>{t('modal.scripts.runs', { n: script.runCount })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Script Details / Editor */}
          <div className="md:col-span-2 p-4 overflow-y-auto flex flex-col justify-between text-xs">
            {isEditing ? (
              <form onSubmit={handleSave} className="space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="font-bold text-xs flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-cyan-400" />
                    <span>{t('modal.scripts.editor')}</span>
                  </div>

                  <div>
                    <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.scripts.nameLabel')}</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.scripts.descLabel')}</label>
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] opacity-75 mb-0.5">
                      {t('modal.scripts.stepsLabel')}
                    </label>
                    <textarea
                      rows={8}
                      value={editStepsText}
                      onChange={(e) => setEditStepsText(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono border rounded-xs focus:outline-hidden"
                      style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: theme.border }}>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 border text-xs cursor-pointer"
                    style={{ borderColor: theme.border }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1 text-xs font-bold border rounded-xs cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    {t('modal.scripts.save')}
                  </button>
                </div>
              </form>
            ) : selectedScript ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold">{selectedScript.name}</h3>
                      <p className="text-xs opacity-75 mt-0.5">{selectedScript.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(selectedScript)}
                        className="px-2 py-1 border text-[11px] font-bold flex items-center gap-1 hover:opacity-80 cursor-pointer"
                        style={{ borderColor: theme.border }}
                      >
                        <Edit3 className="w-3 h-3 text-cyan-400" />
                        <span>{t('modal.scripts.edit')}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('modal.scripts.confirmDelete', { name: selectedScript.name }))) {
                            onDeleteScript(selectedScript.id);
                            setSelectedScript(scripts[0] || null);
                          }
                        }}
                        className="p-1 border text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
                        style={{ borderColor: theme.border }}
                        title={t('modal.scripts.deleteTitle')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div className="text-[11px] font-bold opacity-80 flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('modal.scripts.sequence', { n: selectedScript.steps.length })}</span>
                    </div>
                    <div className="space-y-1 font-mono text-[11px]">
                      {selectedScript.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 opacity-90">
                          <span className="opacity-40">{idx + 1}.</span>
                          <span className="font-semibold">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] opacity-70">
                    {t('modal.scripts.created', {
                      date: selectedScript.createdAt,
                      last: selectedScript.lastRun || t('modal.scripts.never'),
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t flex justify-end" style={{ borderColor: theme.border }}>
                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      onRunScript(selectedScript);
                      onClose();
                    }}
                    className="flex items-center gap-2 px-4 py-2 font-bold text-xs border rounded-xs shadow-md hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{t('modal.scripts.run')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center opacity-60">
                {t('modal.scripts.pick')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
