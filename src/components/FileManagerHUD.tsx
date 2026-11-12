import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { formatAsciiBox } from '../utils/asciiBox';
import { APP_VERSION } from '../utils/version';
import { VirtualFile } from '../utils/interpreter';
import { useI18n } from '../i18n';
import {
  Folder,
  FileText,
  FileCode,
  Globe,
  CornerLeftUp,
  Plus,
  Trash2,
  Edit,
  Play,
  CheckSquare,
  Square,
  Save,
} from 'lucide-react';

interface FileManagerHUDProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  onNavigatePath: (path: string) => void;
  fileSystem: Record<string, VirtualFile[]>;
  onCreateFile: (path: string, name: string, content: string) => void;
  onCreateDir: (path: string, name: string) => void;
  onDeleteFile: (path: string, name: string) => void;
  onSaveFileContent: (path: string, name: string, content: string) => void;
  onExecuteInTerminal: (cmd: string) => void;
}

export const FileManagerHUD: React.FC<FileManagerHUDProps> = ({
  theme,
  isOpen,
  onClose,
  currentPath,
  onNavigatePath,
  fileSystem,
  onCreateFile,
  onCreateDir,
  onDeleteFile,
  onSaveFileContent,
  onExecuteInTerminal,
}) => {
  const { t } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<VirtualFile | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [newDirPrompt, setNewDirPrompt] = useState<boolean>(false);
  const [newDirName, setNewDirName] = useState<string>('');
  const [newFilePrompt, setNewFilePrompt] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');

  const listRef = useRef<HTMLDivElement>(null);

  const filesInCurrentDir = useMemo(() => fileSystem[currentPath] || [], [fileSystem, currentPath]);

  const keyHandlersRef = useRef<{
    handleDelete: (name: string) => void;
    handleGoUp: () => void;
    handleItemOpen: (item: VirtualFile) => void;
    onClose: () => void;
  } | null>(null);

  // Reset index when path changes
  useEffect(() => {
    setSelectedIndex(0);
    setSelectedNames(new Set());
    setPreviewFile(null);
    setIsEditing(false);
  }, [currentPath]);

  // Keyboard navigation & Shortcuts (Arrows, Space, Enter, F3, F4, F7, F8, Backspace)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea or input
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        if (e.key === 'Escape') {
          setIsEditing(false);
          setNewDirPrompt(false);
          setNewFilePrompt(false);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        soundEffects.playKeyClick();
        setSelectedIndex((prev) => (filesInCurrentDir.length ? Math.min(filesInCurrentDir.length - 1, prev + 1) : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        soundEffects.playKeyClick();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        soundEffects.playKeyClick();
        const cur = filesInCurrentDir[selectedIndex];
        if (cur) {
          setSelectedNames((prev) => {
            const next = new Set(prev);
            if (next.has(cur.name)) next.delete(cur.name);
            else next.add(cur.name);
            return next;
          });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cur = filesInCurrentDir[selectedIndex];
        if (cur) {
          keyHandlersRef.current?.handleItemOpen(cur);
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        keyHandlersRef.current?.handleGoUp();
      } else if (e.key === 'F3') {
        e.preventDefault();
        const cur = filesInCurrentDir[selectedIndex];
        if (cur && cur.type === 'file') {
          handleView(cur);
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        const cur = filesInCurrentDir[selectedIndex];
        if (cur && cur.type === 'file') {
          handleEdit(cur);
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        soundEffects.playKeyClick();
        setNewDirPrompt(true);
      } else if (e.key === 'F8' || e.key === 'Delete') {
        e.preventDefault();
        const cur = filesInCurrentDir[selectedIndex];
        if (cur) {
          keyHandlersRef.current?.handleDelete(cur.name);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (previewFile || isEditing) {
          setPreviewFile(null);
          setIsEditing(false);
        } else {
          keyHandlersRef.current?.onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filesInCurrentDir, previewFile, isEditing, currentPath]);

  if (!isOpen) return null;

  const handleGoUp = () => {
    soundEffects.playKeyClick();
    if (currentPath === '/' || currentPath === '/home') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parent = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    onNavigatePath(parent);
  };

  const handleItemOpen = (item: VirtualFile) => {
    soundEffects.playKeyClick();
    if (item.type === 'dir') {
      const nextPath = currentPath === '/' ? `/${item.name}` : `${currentPath}/${item.name}`;
      onNavigatePath(nextPath);
    } else {
      // File
      handleView(item);
    }
  };

  const handleView = (item: VirtualFile) => {
    soundEffects.playKeyClick();
    setPreviewFile(item);
    setIsEditing(false);
    setEditContent(item.content || '');
  };

  const handleEdit = (item: VirtualFile) => {
    soundEffects.playKeyClick();
    setPreviewFile(item);
    setIsEditing(true);
    setEditContent(item.content || '');
  };

  const handleSaveEdit = () => {
    soundEffects.playExecute();
    if (previewFile) {
      onSaveFileContent(currentPath, previewFile.name, editContent);
      setPreviewFile({ ...previewFile, content: editContent, size: editContent.length });
      setIsEditing(false);
    }
  };

  const handleDelete = (name: string) => {
    soundEffects.playKeyClick();
    if (confirm(t('fileManager.confirmDelete', { name }))) {
      onDeleteFile(currentPath, name);
      if (previewFile?.name === name) {
        setPreviewFile(null);
        setIsEditing(false);
      }
    }
  };

  keyHandlersRef.current = { handleDelete, handleGoUp, handleItemOpen, onClose };

  const handleExecuteFile = (item: VirtualFile) => {
    soundEffects.playExecute();
    onClose();
    if (item.name.endsWith('.py')) {
      onExecuteInTerminal(`python -c "${(item.content || '').replace(/"/g, '\\"')}"`);
    } else if (item.name.endsWith('.sh') || item.name.endsWith('.bat')) {
      onExecuteInTerminal(`bash -c "${(item.content || '').replace(/"/g, '\\"')}"`);
    } else if (item.name.endsWith('.json') && item.name.includes('bookmarks')) {
      onExecuteInTerminal('bookmark list');
    } else {
      onExecuteInTerminal(`cat ${item.name}`);
    }
  };

  const handleCreateDirectory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDirName.trim()) return;
    soundEffects.playExecute();
    onCreateDir(currentPath, newDirName.trim());
    setNewDirName('');
    setNewDirPrompt(false);
  };

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    soundEffects.playExecute();
    onCreateFile(currentPath, newFileName.trim(), '# Nuevo archivo en Terminus\n');
    setNewFileName('');
    setNewFilePrompt(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xs font-mono select-none">
      <div
        className="w-full max-w-5xl h-[88vh] flex flex-col border shadow-2xl rounded-xs overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Title Bar (Norton Commander / MS-DOS Aesthetic) */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b select-none text-xs"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-2">
            <pre
              className="m-0 shrink-0 whitespace-pre font-mono text-[10px] leading-tight select-none"
              style={{ color: theme.accent }}
              aria-label={`Terminus File Commander v${APP_VERSION}`}
            >
              {formatAsciiBox(`TERMINUS FILE COMMANDER v${APP_VERSION}`)}
            </pre>
            <span className="hidden lg:inline text-[11px] opacity-75">
              {t('fileManager.touchTitle')}
            </span>
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

        {/* Current Path Bar & Quick Directory Buttons */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b text-xs shrink-0"
          style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={handleGoUp}
              disabled={currentPath === '/' || currentPath === '/home'}
              className="p-1 border rounded-xs hover:opacity-80 disabled:opacity-30 cursor-pointer flex items-center gap-1 text-[11px] font-bold"
              style={{ borderColor: theme.border }}
              title={t('fileManager.upTitle')}
            >
              <CornerLeftUp className="w-3.5 h-3.5" />
              <span>{t('fileManager.up')}</span>
            </button>

            <span className="opacity-40">|</span>

            <span className="text-[11px] font-bold text-emerald-400 truncate font-mono">
              RUTA: {currentPath}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setNewFilePrompt(true);
              }}
              className="flex items-center gap-1 px-2 py-0.5 border rounded-xs hover:opacity-80 cursor-pointer text-[11px] font-bold"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}
              title={t('fileManager.newFileTitle')}
            >
              <Plus className="w-3 h-3 text-cyan-400" />
              <span>{t('fileManager.newFile')}</span>
            </button>

            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setNewDirPrompt(true);
              }}
              className="flex items-center gap-1 px-2 py-0.5 border rounded-xs hover:opacity-80 cursor-pointer text-[11px] font-bold"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}
              title={t('fileManager.newDirTitle')}
            >
              <Plus className="w-3 h-3 text-amber-400" />
              <span>{t('fileManager.newDir')}</span>
            </button>
          </div>
        </div>

        {/* New Directory Prompt Modal */}
        {newDirPrompt && (
          <form
            onSubmit={handleCreateDirectory}
            className="p-2.5 border-b flex items-center gap-2 text-xs"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <span className="font-bold text-[11px]">CREAR DIRECTORIO:</span>
            <input
              type="text"
              autoFocus
              placeholder="nombre_de_carpeta"
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              className="px-2 py-1 text-xs border rounded-xs flex-1 focus:outline-hidden"
              style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
            />
            <button
              type="submit"
              className="px-3 py-1 border text-xs font-bold rounded-xs cursor-pointer"
              style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => setNewDirPrompt(false)}
              className="px-2 py-1 border text-xs cursor-pointer"
              style={{ borderColor: theme.border }}
            >
              Cancelar
            </button>
          </form>
        )}

        {/* New File Prompt Modal */}
        {newFilePrompt && (
          <form
            onSubmit={handleCreateFile}
            className="p-2.5 border-b flex items-center gap-2 text-xs"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <span className="font-bold text-[11px]">{t('fileManager.createFile')}</span>
            <input
              type="text"
              autoFocus
              placeholder={t('fileManager.fileNamePlaceholder')}
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="px-2 py-1 text-xs border rounded-xs flex-1 focus:outline-hidden"
              style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
            />
            <button
              type="submit"
              className="px-3 py-1 border text-xs font-bold rounded-xs cursor-pointer"
              style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => setNewFilePrompt(false)}
              className="px-2 py-1 border text-xs cursor-pointer"
              style={{ borderColor: theme.border }}
            >
              Cancelar
            </button>
          </form>
        )}

        {/* Dual Pane: Left File List + Right Inspector / Editor */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x" style={{ borderColor: theme.border }}>
          {/* File Grid Table (Mouse, Touch & Keyboard friendly) */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-1"
            style={{ backgroundColor: theme.bg }}
          >
            {/* Table Header */}
            <div
              className="grid grid-cols-12 px-2 py-1.5 border-b font-bold opacity-75 text-[11px]"
              style={{ borderColor: theme.border }}
            >
              <span className="col-span-1">{t('fileManager.colSel')}</span>
              <span className="col-span-6">{t('fileManager.colName')}</span>
              <span className="col-span-2 text-right">{t('fileManager.colSize')}</span>
              <span className="col-span-3 text-right">{t('fileManager.colModified')}</span>
            </div>

            {filesInCurrentDir.length === 0 ? (
              <div className="py-12 text-center opacity-60">
                {t('fileManager.emptyDir')}
              </div>
            ) : (
              filesInCurrentDir.map((file, idx) => {
                const isSelectedCursor = idx === selectedIndex;
                const isChecked = selectedNames.has(file.name);
                const isDir = file.type === 'dir';

                return (
                  <div
                    key={file.name}
                    onClick={() => {
                      soundEffects.playKeyClick();
                      setSelectedIndex(idx);
                    }}
                    onDoubleClick={() => handleItemOpen(file)}
                    className={`grid grid-cols-12 items-center px-2 py-1.5 border rounded-xs cursor-pointer transition-colors ${
                      isSelectedCursor ? 'ring-1 ring-cyan-400 font-bold' : 'hover:bg-white/5'
                    }`}
                    style={{
                      borderColor: isSelectedCursor ? theme.accent : 'transparent',
                      backgroundColor: isSelectedCursor
                        ? 'rgba(255, 255, 255, 0.08)'
                        : isChecked
                        ? 'rgba(255, 255, 85, 0.05)'
                        : undefined,
                    }}
                  >
                    {/* Checkbox for Tactile Selection */}
                    <div
                      className="col-span-1 flex items-center cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        soundEffects.playKeyClick();
                        setSelectedNames((prev) => {
                          const next = new Set(prev);
                          if (next.has(file.name)) next.delete(file.name);
                          else next.add(file.name);
                          return next;
                        });
                      }}
                      title="Seleccionar (Espacio o clic)"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                      )}
                    </div>

                    {/* File Icon & Name */}
                    <div className="col-span-6 flex items-center gap-2 truncate">
                      {isDir ? (
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : file.name.endsWith('.py') ? (
                        <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : file.name.endsWith('.json') ? (
                        <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-slate-300 shrink-0" />
                      )}

                      <span
                        className={`truncate font-mono ${
                          isDir ? 'text-amber-300 font-bold' : 'text-slate-100'
                        }`}
                      >
                        {file.name}
                        {isDir ? '/' : ''}
                      </span>
                    </div>

                    {/* Size */}
                    <span className="col-span-2 text-right font-mono opacity-70 truncate">
                      {isDir ? '<DIR>' : `${file.size || (file.content?.length ?? 0)} B`}
                    </span>

                    {/* Date */}
                    <span className="col-span-3 text-right font-mono opacity-60 text-[10px] truncate">
                      {file.updatedAt || '07-11-2026'}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Inspector & Preview / Editor Panel */}
          <div
            className="w-full md:w-96 flex flex-col justify-between p-3 overflow-hidden text-xs"
            style={{ backgroundColor: theme.cardBg }}
          >
            {previewFile ? (
              <div className="flex-1 flex flex-col justify-between overflow-hidden space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b shrink-0" style={{ borderColor: theme.border }}>
                  <div className="flex items-center gap-1.5 truncate">
                    <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="font-bold truncate">{previewFile.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isEditing ? (
                      <button
                        onClick={() => handleEdit(previewFile)}
                        className="px-2 py-0.5 border text-[11px] font-bold hover:opacity-80 cursor-pointer flex items-center gap-1"
                        style={{ borderColor: theme.border }}
                        title={t('fileManager.editTitle')}
                      >
                        <Edit className="w-3 h-3 text-amber-400" />
                        <span>{t('fileManager.edit')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveEdit}
                        className="px-2.5 py-0.5 border text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                        title={t('fileManager.saveTitle')}
                      >
                        <Save className="w-3 h-3" />
                        <span>{t('fileManager.save')}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(previewFile.name)}
                      className="p-1 border text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
                      style={{ borderColor: theme.border }}
                      title={t('fileManager.deleteTitle')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content Viewer / Editor */}
                <div className="flex-1 overflow-auto border p-2 rounded-xs select-text" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                  {isEditing ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full bg-transparent border-0 outline-hidden font-mono text-[11px] leading-relaxed resize-none"
                      style={{ color: theme.text }}
                    />
                  ) : (
                    <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
                      {previewFile.content || t('fileManager.emptyFile')}
                    </pre>
                  )}
                </div>

                {/* File Action Triggers */}
                <div className="pt-2 flex items-center justify-between gap-2 shrink-0">
                  <div className="text-[10px] opacity-65">
                    {t('fileManager.charCount', { count: (previewFile.content || '').length })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(previewFile.name.endsWith('.py') || previewFile.name.endsWith('.sh')) && (
                      <button
                        onClick={() => handleExecuteFile(previewFile)}
                        className="flex items-center gap-1 px-3 py-1 border text-xs font-bold rounded-xs cursor-pointer shadow-xs hover:opacity-90"
                        style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{t('fileManager.runScript')}</span>
                      </button>
                    )}

                    {previewFile.name.endsWith('.json') && previewFile.name.includes('bookmarks') && (
                      <button
                        onClick={() => handleExecuteFile(previewFile)}
                        className="flex items-center gap-1 px-2.5 py-1 border text-xs font-bold rounded-xs cursor-pointer hover:opacity-80"
                        style={{ borderColor: theme.border }}
                      >
                        <Globe className="w-3 h-3 text-cyan-400" />
                        <span>{t('fileManager.viewBookmarks')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-65 space-y-2">
                <FileText className="w-8 h-8 opacity-40" />
                <div className="font-bold">{t('fileManager.noPreview')}</div>
                <div className="text-[11px] max-w-xs">{t('fileManager.previewHint')}</div>
              </div>
            )}
          </div>
        </div>

        {/* Retro Function Keys Bar (F1..F8 MS-DOS / Norton Commander Style) */}
        <div
          className="grid grid-cols-8 divide-x border-t text-[11px] font-bold select-none text-center"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
              onExecuteInTerminal('help');
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnHelp')}
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setNewFilePrompt(true);
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnNew')}
          </button>
          <button
            onClick={() => {
              const cur = filesInCurrentDir[selectedIndex];
              if (cur) handleView(cur);
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnView')}
          </button>
          <button
            onClick={() => {
              const cur = filesInCurrentDir[selectedIndex];
              if (cur) handleEdit(cur);
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnEdit')}
          </button>
          <button
            onClick={() => {
              const cur = filesInCurrentDir[selectedIndex];
              if (cur) {
                soundEffects.playExecute();
                onCreateFile(currentPath, `copia_${cur.name}`, cur.content || '');
              }
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnCopy')}
          </button>
          <button
            onClick={() => {
              const cur = filesInCurrentDir[selectedIndex];
              if (cur) {
                const newName = prompt(t('fileManager.renamePrompt'), cur.name);
                if (newName && newName !== cur.name) {
                  onCreateFile(currentPath, newName, cur.content || '');
                  onDeleteFile(currentPath, cur.name);
                }
              }
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnRename')}
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setNewDirPrompt(true);
            }}
            className="py-1.5 hover:bg-white/10 cursor-pointer"
          >
            {t('fileManager.fnMkdir')}
          </button>
          <button
            onClick={() => {
              const cur = filesInCurrentDir[selectedIndex];
              if (cur) handleDelete(cur.name);
            }}
            className="py-1.5 hover:bg-white/10 text-red-400 cursor-pointer"
          >
            {t('fileManager.fnDelete')}
          </button>
        </div>
      </div>
    </div>
  );
};
