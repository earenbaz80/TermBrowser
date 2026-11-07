/**
 * Real Local File System Integration for TermBrowser OS
 * Supports both modern browser File System Access API (showDirectoryPicker)
 * and the backend Local Workspace filesystem (/api/local-fs/*).
 */

import { VirtualFile } from './interpreter';

export interface LocalFsFile {
  name: string;
  type: 'file' | 'dir';
  path: string;
  size?: number;
  content?: string;
  updatedAt?: string;
  handle?: any; // FileSystemFileHandle or FileSystemDirectoryHandle
}

let activeDirectoryHandle: any = null;

/**
 * Mount a real directory from the user's computer using the Native File System Access API
 */
export async function mountNativeLocalDirectory(): Promise<{
  name: string;
  files: LocalFsFile[];
  handle: any;
}> {
  if (typeof (window as any).showDirectoryPicker !== 'function') {
    throw new Error('La API File System Access no está disponible en este navegador. Use la opción de importar carpeta.');
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      id: 'termbrowser_local_mount',
      mode: 'readwrite',
    });

    activeDirectoryHandle = dirHandle;
    const files: LocalFsFile[] = [];

    for await (const [name, handle] of (dirHandle as any).entries()) {
      if (name.startsWith('.') || name === 'node_modules') continue;

      if (handle.kind === 'directory') {
        files.push({
          name,
          type: 'dir',
          path: `/${name}`,
          handle,
          updatedAt: new Date().toLocaleDateString(),
        });
      } else if (handle.kind === 'file') {
        const fileObj = await handle.getFile();
        let content: string | undefined = undefined;
        // Read text if smaller than 500KB
        if (fileObj.size < 500 * 1024) {
          try {
            content = await fileObj.text();
          } catch {}
        }

        files.push({
          name,
          type: 'file',
          path: `/${name}`,
          size: fileObj.size,
          content,
          updatedAt: new Date(fileObj.lastModified).toLocaleDateString(),
          handle,
        });
      }
    }

    return {
      name: dirHandle.name,
      files,
      handle: dirHandle,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Selección de carpeta local cancelada por el usuario.');
    }
    throw err;
  }
}

/**
 * Read the live real local workspace files from the backend server (/api/local-fs/list)
 */
export async function fetchWorkspaceFiles(relDir: string = ''): Promise<{
  root: string;
  currentDir: string;
  parentDir: string | null;
  items: LocalFsFile[];
}> {
  const res = await fetch(`/api/local-fs/list?dir=${encodeURIComponent(relDir)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Error al conectar con el sistema de archivos del servidor');
  }

  const data = await res.json();
  const items: LocalFsFile[] = (data.items || []).map((item: any) => ({
    name: item.name,
    type: item.isDirectory ? ('dir' as const) : ('file' as const),
    path: item.path,
    size: item.size,
    updatedAt: new Date(item.updatedAt).toLocaleDateString(),
  }));

  return {
    root: data.root,
    currentDir: data.currentDir,
    parentDir: data.parentDir,
    items,
  };
}

/**
 * Read a file directly from the local workspace backend
 */
export async function readWorkspaceFile(relPath: string): Promise<{
  path: string;
  content: string;
  size: number;
  updatedAt: string;
}> {
  const res = await fetch(`/api/local-fs/read?file=${encodeURIComponent(relPath)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `No se pudo leer el archivo ${relPath}`);
  }
  return await res.json();
}

/**
 * Write a file directly to the local workspace backend
 */
export async function writeWorkspaceFile(relPath: string, content: string): Promise<boolean> {
  const res = await fetch('/api/local-fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: relPath, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al guardar ${relPath}`);
  }
  return true;
}

/**
 * Convert LocalFsFile list to VirtualFile format for terminal state
 */
export function toVirtualFiles(files: LocalFsFile[]): VirtualFile[] {
  return files.map((f) => ({
    name: f.name,
    type: f.type,
    size: f.size,
    content: f.content,
    updatedAt: f.updatedAt || new Date().toLocaleDateString(),
  }));
}
