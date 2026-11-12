import React, { useState, useMemo } from 'react';
import { ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import {
  HelpCircle,
  Search,
  Globe,
  Cpu,
  Network,
  Shield,
  Zap,
  Play,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

import { COMMAND_DOCS, type CommandDoc, type HelpCategory } from '../data/commandDocs';
import { localizeCommandDocs } from '../i18n/commandDocs';

export type { CommandDoc, HelpCategory } from '../data/commandDocs';
export { COMMAND_DOCS };

interface HelpModalProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand: (cmd: string) => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  theme,
  isOpen,
  onClose,
  onExecuteCommand,
}) => {
  const { t, locale } = useI18n();
  const docs = useMemo(() => localizeCommandDocs(locale, COMMAND_DOCS), [locale]);
  const categoryLabels: Record<CommandDoc['category'], MessageKey> = {
    navegación: 'modal.help.catWeb',
    sistema: 'modal.help.catSystem',
    red: 'modal.help.catNetwork',
    seguridad: 'modal.help.catSecurity',
    automatización: 'modal.help.catAutomation',
  };
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const categories: { id: HelpCategory; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'todas', label: t('modal.help.catAll'), icon: <Terminal className="w-3.5 h-3.5" />, count: docs.length },
    { id: 'navegación', label: t('modal.help.catWeb'), icon: <Globe className="w-3.5 h-3.5" />, count: docs.filter((c) => c.category === 'navegación').length },
    { id: 'sistema', label: t('modal.help.catSystem'), icon: <Cpu className="w-3.5 h-3.5" />, count: docs.filter((c) => c.category === 'sistema').length },
    { id: 'red', label: t('modal.help.catNetwork'), icon: <Network className="w-3.5 h-3.5" />, count: docs.filter((c) => c.category === 'red').length },
    { id: 'seguridad', label: t('modal.help.catSecurity'), icon: <Shield className="w-3.5 h-3.5" />, count: docs.filter((c) => c.category === 'seguridad').length },
    { id: 'automatización', label: t('modal.help.catAutomation'), icon: <Zap className="w-3.5 h-3.5" />, count: docs.filter((c) => c.category === 'automatización').length },
  ];

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const matchesCategory = selectedCategory === 'todas' || doc.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const inCmd = doc.command.toLowerCase().includes(q);
      const inSyntax = doc.syntax.toLowerCase().includes(q);
      const inSummary = doc.summary.toLowerCase().includes(q);
      const inDesc = doc.description.toLowerCase().includes(q);
      const inExamples = doc.examples.some(
        (ex) => ex.code.toLowerCase().includes(q) || ex.description.toLowerCase().includes(q)
      );

      return inCmd || inSyntax || inSummary || inDesc || inExamples;
    });
  }, [docs, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    soundEffects.playKeyClick();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  const handleRun = (code: string) => {
    soundEffects.playExecute();
    onClose();
    onExecuteCommand(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xs font-mono">
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col border shadow-2xl rounded-xs overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center justify-between px-3.5 py-2 border-b select-none text-xs"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-2 font-bold">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span className="tracking-wide">{t('modal.help.title')}</span>
          </div>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-2 py-0.5 border font-bold hover:bg-red-900/40 cursor-pointer text-xs"
            style={{ borderColor: theme.border }}
          >
            [X]
          </button>
        </div>

        {/* Search & Stats Bar */}
        <div
          className="p-3 border-b flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-60" />
            <input
              type="text"
              placeholder={t('modal.help.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-xs focus:outline-hidden"
              style={{
                backgroundColor: theme.bg,
                borderColor: theme.border,
                color: theme.text,
              }}
            />
          </div>

          <div className="text-[11px] opacity-75 whitespace-nowrap self-end sm:self-center">
            {t('modal.help.showing', { n: filteredDocs.length })}
          </div>
        </div>

        {/* Categories Tab Bar */}
        <div
          className="flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto text-xs shrink-0 select-none"
          style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
          <span className="text-[10px] opacity-60 mr-2 uppercase tracking-wider shrink-0">
            {t('modal.help.category')}
          </span>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  soundEffects.playKeyClick();
                  setSelectedCategory(cat.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  isSelected ? 'font-bold shadow-xs' : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  borderColor: isSelected ? theme.accent : theme.border,
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : theme.cardBg,
                  color: isSelected ? theme.accent : theme.text,
                }}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-60">({cat.count})</span>
              </button>
            );
          })}
        </div>

        {/* Command Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {filteredDocs.length === 0 ? (
            <div className="py-12 text-center opacity-60 space-y-1">
              <div className="font-bold text-sm">{t('modal.help.emptyTitle')}</div>
              <div className="text-[11px]">{t('modal.help.emptyHint')}</div>
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.command}
                className="border rounded-xs p-3.5 space-y-2.5 transition-all"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
              >
                {/* Command Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b" style={{ borderColor: theme.border }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-bold tracking-tight px-1.5 py-0.5 border rounded-xs" style={{ color: theme.accent, borderColor: theme.border, backgroundColor: theme.bg }}>
                      {doc.command}
                    </code>
                    <span className="text-[11px] opacity-80 font-mono">
                      {t('modal.help.syntax', { syntax: doc.syntax })}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wider rounded-xs self-start sm:self-auto"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.bg,
                      color:
                        doc.category === 'navegación'
                          ? '#38bdf8'
                          : doc.category === 'sistema'
                          ? '#4ade80'
                          : doc.category === 'red'
                          ? '#fbbf24'
                          : doc.category === 'seguridad'
                          ? '#c084fc'
                          : '#f43f5e',
                    }}
                  >
                    {t(categoryLabels[doc.category])}
                  </span>
                </div>

                {/* Summary & Description */}
                <div>
                  <div className="font-bold text-xs">{doc.summary}</div>
                  <div className="text-[11px] opacity-80 mt-1 leading-relaxed">{doc.description}</div>
                </div>

                {/* Interactive Examples Strip */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] opacity-65 font-bold uppercase tracking-wider">
                    {t('modal.help.examples')}
                  </div>
                  <div className="space-y-1.5">
                    {doc.examples.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-2 border rounded-xs"
                        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                      >
                        <div className="space-y-0.5 overflow-hidden">
                          <code className="font-bold text-[11px] text-emerald-400 block truncate font-mono">
                            {ex.code}
                          </code>
                          <div className="text-[10px] opacity-70 truncate">{ex.description}</div>
                          {ex.copyOnly && (
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90">
                              {t('modal.help.install')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                          <button
                            onClick={() => handleCopy(ex.code)}
                            className="flex items-center gap-1 px-2 py-1 border text-[10px] font-bold hover:opacity-80 cursor-pointer rounded-xs"
                            style={{ borderColor: theme.border }}
                            title={t('modal.help.copyTitle')}
                          >
                            {copiedCode === ex.code ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>{t('modal.help.copied')}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>{t('modal.help.copy')}</span>
                              </>
                            )}
                          </button>

                          {!ex.copyOnly && (
                            <button
                              onClick={() => handleRun(ex.code)}
                              className="flex items-center gap-1 px-2.5 py-1 border text-[10px] font-bold hover:opacity-90 cursor-pointer rounded-xs"
                              style={{
                                backgroundColor: theme.accent,
                                color: theme.bg,
                                borderColor: theme.accent,
                              }}
                              title={t('modal.help.runTitle')}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>{t('modal.help.run')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="px-3 py-2 border-t text-xs flex items-center justify-between select-none"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <span className="text-[11px] opacity-70">
            {t('modal.help.tip')}
          </span>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-4 py-1 border text-xs font-bold cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            {t('modal.help.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
