'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const MAXIMIZED_CHANGED_CHANNEL = 'terminus:window:maximized-changed';
const FRAME_CONTEXT_MENU_CHANNEL = 'terminus:context-menu:frame';
const FIND_SHORTCUT_CHANNEL = 'terminus:find:shortcut';
const PTY_DATA_CHANNEL = 'terminus:pty:data';
const PTY_EXIT_CHANNEL = 'terminus:pty:exit';

const subscribe = (channel, callback) => {
  if (typeof callback !== 'function') return () => {};

  const listener = (_event, payload) => callback(payload || {});
  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

contextBridge.exposeInMainWorld('terminusDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('terminus:window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('terminus:window:toggle-maximize'),
  close: () => ipcRenderer.send('terminus:window:close'),
  isMaximized: () => ipcRenderer.invoke('terminus:window:is-maximized'),
  onMaximizedChange: (callback) => {
    if (typeof callback !== 'function') return () => {};

    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on(MAXIMIZED_CHANGED_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(MAXIMIZED_CHANGED_CHANNEL, listener);
    };
  },
  onFrameContextMenu: (callback) => {
    if (typeof callback !== 'function') return () => {};

    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on(FRAME_CONTEXT_MENU_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(FRAME_CONTEXT_MENU_CHANNEL, listener);
    };
  },
  onFindShortcut: (callback) => {
    if (typeof callback !== 'function') return () => {};

    const listener = () => callback();
    ipcRenderer.on(FIND_SHORTCUT_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(FIND_SHORTCUT_CHANNEL, listener);
    };
  },
});

contextBridge.exposeInMainWorld('terminusShell', {
  platform: process.platform,
  available: true,
  run: (request) => ipcRenderer.invoke('terminus:shell:run', request),
});

contextBridge.exposeInMainWorld('terminusFs', {
  platform: process.platform,
  available: true,
  info: () => ipcRenderer.invoke('terminus:fs:info'),
  resolveDirectory: (request) => ipcRenderer.invoke('terminus:fs:resolve-directory', request),
});

contextBridge.exposeInMainWorld('terminusArchive', {
  available: true,
  extract: (request) => ipcRenderer.invoke('terminus:archive:extract', request),
  create: (request) => ipcRenderer.invoke('terminus:archive:create', request),
});

contextBridge.exposeInMainWorld('terminusPty', {
  available: true,
  create: (request) => ipcRenderer.invoke('terminus:pty:create', request),
  write: (id, data) => ipcRenderer.send('terminus:pty:write', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('terminus:pty:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.send('terminus:pty:kill', id),
  onData: (callback) => subscribe(PTY_DATA_CHANNEL, callback),
  onExit: (callback) => subscribe(PTY_EXIT_CHANNEL, callback),
});
