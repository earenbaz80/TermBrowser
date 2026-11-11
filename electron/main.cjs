'use strict';

const { app, BrowserWindow, dialog, ipcMain, screen, session, shell } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { parse: parseDomain } = require('tldts-experimental');
const { isBlockedAdUrl } = require('./adblock.cjs');
const { isPrivateAddress, isPrivateTargetUrl } = require('./networkPolicy.cjs');
const { startForwardProxy } = require('./forwardProxy.cjs');
const { execFileSync, spawn } = require('node:child_process');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const APP_ROOT = app.getAppPath();
const APP_ORIGIN_FALLBACK = 'http://127.0.0.1';
const MAXIMIZED_CHANGED_CHANNEL = 'terminus:window:maximized-changed';
const FRAME_CONTEXT_MENU_CHANNEL = 'terminus:context-menu:frame';
const FIND_SHORTCUT_CHANNEL = 'terminus:find:shortcut';
const PTY_DATA_CHANNEL = 'terminus:pty:data';
const PTY_EXIT_CHANNEL = 'terminus:pty:exit';
const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const MAX_SHELL_TIMEOUT_MS = 300000;
const MAX_SHELL_COMMAND_LENGTH = 20000;
const MAX_SHELL_OUTPUT_BYTES = 1024 * 1024;
const MAX_PTY_WRITE_LENGTH = 64 * 1024;
const MAX_PTY_BUFFER_LENGTH = 512 * 1024;
const SHELL_IDS = new Set(['auto', 'cmd', 'powershell', 'bash']);
const ADBLOCK_CACHE_FILENAME = 'adblock-engine.bin';
let adblockBlocker = null;
let adblockInitialization = null;
let networkGuardOrigin = null;
const dnsVerdictCache = new Map();
const DNS_VERDICT_TTL_MS = 60_000;
// Only the trusted top-level app frame may use these. Everything else (including
// remote iframes and proxied documents) is denied by default.
const APP_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'fileSystem',
  'media',
  'notifications',
]);
const activeShellChildren = new Set();
const ptySessions = new Map();
let ptyModule = null;
let ptyLoadError = '';

try {
  ptyModule = require('node-pty');
} catch (error) {
  ptyLoadError = error instanceof Error ? error.message : String(error);
  console.error(`[Terminus] PTY no disponible: ${ptyLoadError}`);
}

let cachedWindowsDrives = null;

let mainWindow = null;
let serverProcess = null;
let forwardProxy = null;
let isQuitting = false;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => {
        if (port > 0) resolve(port);
        else reject(new Error('No se pudo reservar un puerto local.'));
      });
    });
  });
}

function canReach(url, timeoutMs = 900) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canReach(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`El servidor local no respondió en ${url}.`);
}

async function startPackagedServer() {
  const serverBundle = path.join(APP_ROOT, 'dist-electron', 'server.cjs');
  const distDirectory = path.join(APP_ROOT, 'dist');

  if (!fs.existsSync(serverBundle) || !fs.existsSync(path.join(distDirectory, 'index.html'))) {
    throw new Error('Falta la compilación de Terminus. Ejecuta "npm run desktop:build".');
  }

  const port = await getFreePort();
  const workspaceDirectory = path.join(app.getPath('userData'), 'workspace');
  fs.mkdirSync(workspaceDirectory, { recursive: true });

  process.env.NODE_ENV = 'production';
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.TERMINUS_DIST_DIR = distDirectory;
  process.env.TERMINUS_WORKSPACE_ROOT = workspaceDirectory;

  // The bundle starts Express itself and serves the compiled SPA.
  require(serverBundle);

  return {
    host: process.env.HOST,
    port,
  };
}

async function startDevelopmentServer() {
  const port = await getFreePort();
  const tsxCli = require.resolve('tsx/cli');

  serverProcess = spawn(process.execPath, [tsxCli, path.join(APP_ROOT, 'server.ts')], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  serverProcess.once('exit', (code, signal) => {
    serverProcess = null;
    if (!isQuitting) {
      console.error(`[Terminus] El servidor de desarrollo terminó (${code ?? signal ?? 'sin código'}).`);
    }
  });

  return { host: '127.0.0.1', port };
}

async function resolveAppUrl() {
  const explicitDevUrl = process.env.TERMINUS_DEV_URL;

  if (explicitDevUrl) {
    await waitForServer(explicitDevUrl, 15000);
    return explicitDevUrl;
  }

  let server;
  if (app.isPackaged) {
    server = await startPackagedServer();
  } else {
    server = await startDevelopmentServer();
  }

  const url = `http://${server.host}:${server.port}/`;
  await waitForServer(url);
  return url;
}

function nativeShellCwd() {
  const configured = process.env.TERMINUS_WORKSPACE_ROOT;
  const fallback = app.isPackaged
    ? path.join(app.getPath('userData'), 'workspace')
    : app.getAppPath();
  const candidate = configured ? path.resolve(configured) : fallback;

  try {
    if (fs.statSync(candidate).isDirectory()) return candidate;
  } catch {}

  try {
    fs.mkdirSync(candidate, { recursive: true });
    return candidate;
  } catch {}

  return app.getPath('home');
}

function validNativeCwd(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  try {
    const resolved = path.resolve(candidate);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

function listWindowsDrives() {
  if (process.platform !== 'win32') return ['/'];
  if (cachedWindowsDrives) return cachedWindowsDrives;

  const drives = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`;
    try {
      if (fs.statSync(root).isDirectory()) drives.push(root);
    } catch {}
  }
  cachedWindowsDrives = drives;
  return drives;
}

function nativeFsInfo() {
  return {
    platform: process.platform,
    home: app.getPath('home'),
    workspace: nativeShellCwd(),
    drives: listWindowsDrives(),
  };
}

function unquoteShellPath(value) {
  let result = String(value || '').trim();
  if (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1);
  }
  return result;
}

function resolveNativeDirectory(request) {
  const shell = typeof request?.shell === 'string' && SHELL_IDS.has(request.shell)
    ? request.shell
    : 'auto';
  const base = validNativeCwd(request?.cwd) || nativeShellCwd();
  const home = app.getPath('home');
  const drives = listWindowsDrives();
  let target = unquoteShellPath(request?.target);

  if (!target || target === '~') target = home;
  else if (target.startsWith('~/') || target.startsWith('~\\')) {
    target = path.join(home, target.slice(2));
  }

  if (process.platform === 'win32') {
    // Git Bash/WSL users often type POSIX drive paths; map them to Windows roots.
    if (shell === 'bash' || shell === 'auto') {
      const posixDrive = /^\/(?:mnt\/)?([a-zA-Z])(?:\/(.*))?$/.exec(target);
      if (posixDrive) {
        target = `${posixDrive[1].toUpperCase()}:\\${(posixDrive[2] || '').replace(/\//g, '\\')}`;
      }
    }

    if (target === '/' || target === '\\') target = path.parse(base).root;
    if (/^[a-zA-Z]:$/.test(target)) target = `${target}\\`;
  }

  let resolved;
  try {
    resolved = path.resolve(base, target);
  } catch (error) {
    return {
      ok: false,
      path: '',
      cwd: base,
      home,
      drives,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        path: resolved,
        cwd: base,
        home,
        drives,
        error: `"${resolved}" no es un directorio.`,
      };
    }
  } catch {
    return {
      ok: false,
      path: resolved,
      cwd: base,
      home,
      drives,
      error: `No existe el directorio "${resolved}".`,
    };
  }

  return { ok: true, path: resolved, cwd: base, home, drives };
}

function findExecutableOnPath(executable) {
  const pathValue = process.env.PATH || '';
  for (const rawDir of pathValue.split(path.delimiter)) {
    const dir = rawDir.trim().replace(/^"|"$/g, '');
    if (!dir) continue;
    const candidate = path.join(dir, executable);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

let pythonDirCache;

/**
 * Windows ships a Microsoft Store alias stub that shadows a real Python installed
 * through the `py` launcher, so `python` fails inside the terminal. When the stub
 * is the only python on PATH, put the launcher's interpreter first for our shells.
 */
function pythonPathPrefix() {
  if (pythonDirCache !== undefined) return pythonDirCache;
  pythonDirCache = null;
  if (process.platform !== 'win32') return pythonDirCache;

  try {
    const pythonOnPath = findExecutableOnPath('python.exe');
    // Keep a real interpreter that is already first on PATH; only fix a missing or Store-aliased one.
    if (pythonOnPath && !/[\\/]WindowsApps[\\/]/i.test(pythonOnPath)) return pythonDirCache;

    const launcher = findExecutableOnPath('py.exe');
    if (!launcher) return pythonDirCache;

    const resolved = execFileSync(launcher, ['-3', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/)
      .pop();

    if (!resolved || !/python\.exe$/i.test(resolved) || !fs.existsSync(resolved)) return pythonDirCache;
    pythonDirCache = path.dirname(resolved);
  } catch {
    pythonDirCache = null;
  }
  return pythonDirCache;
}

/** Environment for local shells: the app env plus a usable Python on Windows. */
function shellEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  const prefix = pythonPathPrefix();
  if (!prefix) return env;

  const currentPath = env.PATH || env.Path || '';
  env.PATH = currentPath ? `${prefix}${path.delimiter}${currentPath}` : prefix;
  if (typeof env.Path === 'string') env.Path = env.PATH;
  return env;
}

function resolveWindowsBash() {
  const candidates = [
    process.env.TERMINUS_BASH_PATH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }

  return findExecutableOnPath('bash.exe');
}

function ptyShellFor(requestedShell) {
  const shell = requestedShell === 'auto'
    ? (process.platform === 'win32' ? 'powershell' : 'bash')
    : requestedShell;

  if (shell === 'cmd') {
    if (process.platform !== 'win32') {
      throw new Error('CMD solo está disponible en Windows.');
    }
    return {
      id: 'cmd',
      label: 'CMD',
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d'],
    };
  }

  if (shell === 'powershell') {
    return {
      id: 'powershell',
      label: process.platform === 'win32' ? 'POWERSHELL' : 'PWSH',
      file: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
      args: ['-NoLogo'],
    };
  }

  if (shell === 'bash') {
    if (process.platform === 'win32') {
      const gitBash = resolveWindowsBash();
      if (gitBash) {
        return { id: 'bash', label: 'BASH/GIT', file: gitBash, args: ['-i'] };
      }
      return { id: 'bash', label: 'BASH/WSL', file: 'wsl.exe', args: ['--exec', 'bash', '-i'] };
    }

    const bash = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    return { id: 'bash', label: 'BASH', file: bash, args: ['-i'] };
  }

  throw new Error(`Shell no soportado: ${requestedShell}`);
}

function clampPtyDimension(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sendPtyEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function appendPtyBuffer(session, data) {
  session.buffer += data;
  if (session.buffer.length > MAX_PTY_BUFFER_LENGTH) {
    session.buffer = session.buffer.slice(-MAX_PTY_BUFFER_LENGTH);
  }
}

function ptyErrorResult(id, message) {
  return { ok: false, id: typeof id === 'string' ? id : '', error: message };
}

function createPtySession(request) {
  if (!ptyModule || typeof ptyModule.spawn !== 'function') {
    return ptyErrorResult(request?.id, ptyLoadError || 'node-pty no está disponible en esta instalación.');
  }

  const id = typeof request?.id === 'string' ? request.id : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return ptyErrorResult(id, 'Identificador de sesión PTY no válido.');
  }

  let shellSpec;
  try {
    shellSpec = ptyShellFor(typeof request?.shell === 'string' ? request.shell : 'auto');
  } catch (error) {
    return ptyErrorResult(id, error instanceof Error ? error.message : String(error));
  }

  const existing = ptySessions.get(id);
  if (existing && !existing.exited) {
    if (existing.shellId === shellSpec.id) {
      return {
        ok: true,
        id,
        shell: existing.shellId,
        label: existing.label,
        cwd: existing.cwd,
        buffer: existing.buffer,
        seq: existing.seq,
        reused: true,
      };
    }
    killPtySession(id);
  }

  const cwd = validNativeCwd(typeof request?.cwd === 'string' ? request.cwd : '') || nativeShellCwd();
  const cols = clampPtyDimension(request?.cols, 20, 400, 80);
  const rows = clampPtyDimension(request?.rows, 5, 200, 24);
  let child;

  try {
    child = ptyModule.spawn(shellSpec.file, shellSpec.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: shellEnvironment({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      }),
    });
  } catch (error) {
    return ptyErrorResult(id, error instanceof Error ? error.message : String(error));
  }

  const session = {
    id,
    pty: child,
    shellId: shellSpec.id,
    label: shellSpec.label,
    cwd,
    buffer: '',
    seq: 0,
    exited: false,
  };
  ptySessions.set(id, session);

  child.onData((data) => {
    session.seq += 1;
    appendPtyBuffer(session, data);
    sendPtyEvent(PTY_DATA_CHANNEL, { id, data, seq: session.seq });
  });

  child.onExit(({ exitCode, signal }) => {
    session.exited = true;
    if (ptySessions.get(id) === session) ptySessions.delete(id);
    sendPtyEvent(PTY_EXIT_CHANNEL, { id, exitCode, signal });
  });

  return {
    ok: true,
    id,
    shell: session.shellId,
    label: session.label,
    cwd: session.cwd,
    buffer: session.buffer,
    seq: session.seq,
    reused: false,
  };
}

function writePtySession(payload) {
  const id = typeof payload?.id === 'string' ? payload.id : '';
  const data = typeof payload?.data === 'string' ? payload.data : '';
  if (!id || !data || data.length > MAX_PTY_WRITE_LENGTH) return;
  const session = ptySessions.get(id);
  if (!session || session.exited) return;
  try {
    session.pty.write(data);
  } catch {}
}

function resizePtySession(payload) {
  const id = typeof payload?.id === 'string' ? payload.id : '';
  const session = ptySessions.get(id);
  if (!session || session.exited) return;
  try {
    session.pty.resize(
      clampPtyDimension(payload?.cols, 20, 400, 80),
      clampPtyDimension(payload?.rows, 5, 200, 24)
    );
  } catch {}
}

function killPtySession(id) {
  const session = ptySessions.get(id);
  if (!session) return;
  ptySessions.delete(id);
  session.exited = true;
  try {
    session.pty.kill();
  } catch {}
}

function killAllPtySessions() {
  for (const id of [...ptySessions.keys()]) killPtySession(id);
}

function shellSpecFor(requestedShell, command) {
  const shell = requestedShell === 'auto'
    ? (process.platform === 'win32' ? 'powershell' : 'bash')
    : requestedShell;

  if (shell === 'cmd') {
    if (process.platform !== 'win32') {
      throw new Error('CMD solo está disponible en Windows.');
    }
    return {
      id: shell,
      label: 'CMD',
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `chcp 65001>nul & ${command}`],
    };
  }

  if (shell === 'powershell') {
    const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    return {
      id: shell,
      label: process.platform === 'win32' ? 'POWERSHELL' : 'PWSH',
      file: executable,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`,
      ],
    };
  }

  if (shell === 'bash') {
    if (process.platform === 'win32') {
      const gitBash = resolveWindowsBash();
      if (gitBash) {
        return {
          id: shell,
          label: 'BASH/GIT',
          file: gitBash,
          args: ['-lc', command],
        };
      }

      return {
        id: shell,
        label: 'BASH/WSL',
        file: 'wsl.exe',
        args: ['--exec', 'bash', '-lc', command],
      };
    }

    const bash = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    return {
      id: shell,
      label: 'BASH',
      file: bash,
      args: ['-lc', command],
    };
  }

  throw new Error(`Shell no soportado: ${requestedShell}`);
}

function killShellProcess(child) {
  if (!child || child.killed) return;

  try {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', () => {
        try {
          child.kill();
        } catch {}
      });
    } else {
      child.kill('SIGKILL');
    }
  } catch {}
}

function stripAnsi(input) {
  return input
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
}

function emptyShellResult(requestedShell, error, cwd = '') {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    exitCode: null,
    shell: requestedShell,
    cwd,
    durationMs: 0,
    truncated: false,
    timedOut: false,
    error,
  };
}

function runNativeShell(request) {
  const command = typeof request?.command === 'string' ? request.command : '';
  const requestedShell = typeof request?.shell === 'string' && SHELL_IDS.has(request.shell)
    ? request.shell
    : 'auto';

  if (!command.trim()) {
    return Promise.resolve(emptyShellResult(requestedShell, 'El comando está vacío.'));
  }
  if (command.length > MAX_SHELL_COMMAND_LENGTH) {
    return Promise.resolve(
      emptyShellResult(requestedShell, `El comando supera el límite de ${MAX_SHELL_COMMAND_LENGTH} caracteres.`)
    );
  }

  const cwd = validNativeCwd(request?.cwd) || nativeShellCwd();
  let spec;
  try {
    spec = shellSpecFor(requestedShell, command);
  } catch (error) {
    return Promise.resolve(
      emptyShellResult(requestedShell, error instanceof Error ? error.message : String(error), cwd)
    );
  }

  const requestedTimeout = Number(request?.timeoutMs);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, MAX_SHELL_TIMEOUT_MS)
    : DEFAULT_SHELL_TIMEOUT_MS;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child = null;
    let stdout = '';
    let stderr = '';
    let capturedBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let killed = false;
    let timer = null;

    const stop = () => {
      if (killed) return;
      killed = true;
      killShellProcess(child);
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child) activeShellChildren.delete(child);

      const cleanStdout = stripAnsi(stdout).replace(/\r\n/g, '\n');
      const cleanStderr = stripAnsi(stderr).replace(/\r\n/g, '\n');
      const exitCode = typeof child?.exitCode === 'number' ? child.exitCode : null;

      resolve({
        ok: !error && !timedOut && !truncated && exitCode === 0,
        stdout: cleanStdout,
        stderr: cleanStderr,
        exitCode,
        shell: spec.label,
        cwd,
        durationMs: Date.now() - startedAt,
        truncated,
        timedOut,
        error,
      });
    };

    const appendOutput = (current, chunk) => {
      if (truncated) return current;
      const size = Buffer.byteLength(chunk, 'utf8');
      const remaining = MAX_SHELL_OUTPUT_BYTES - capturedBytes;

      if (size > remaining) {
        truncated = true;
        const clipped = chunk.slice(0, Math.max(0, remaining));
        stop();
        return current + clipped;
      }

      capturedBytes += size;
      return current + chunk;
    };

    timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      stop();
    }, timeoutMs);

    try {
      child = spawn(spec.file, spec.args, {
        cwd,
        env: shellEnvironment({
          TERM: 'xterm-256color',
          NO_COLOR: '1',
          CLICOLOR: '0',
        }),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
      return;
    }

    activeShellChildren.add(child);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout = appendOutput(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendOutput(stderr, chunk);
    });
    child.once('error', (error) => {
      finish(`No se pudo iniciar ${spec.label}: ${error.message}`);
    });
    child.once('close', () => finish());
  });
}

function windowForEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (event.sender !== mainWindow.webContents) return null;
  // Only the top-level document may use the privileged bridge. A subframe (for example a
  // proxied page or an embedded widget) must never reach the shell, PTY or filesystem IPC.
  if (event.senderFrame && event.senderFrame !== mainWindow.webContents.mainFrame) return null;
  return mainWindow;
}

function sendMaximizedState(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(MAXIMIZED_CHANGED_CHANNEL, win.isMaximized());
}

const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz'];
const ARCHIVE_EXTRACT_TIMEOUT_MS = 5 * 60 * 1000;
const ARCHIVE_LIST_TIMEOUT_MS = 30 * 1000;
const MAX_ARCHIVE_ENTRIES = 20000;
const MAX_ARCHIVE_LIST_BYTES = 2 * 1024 * 1024;

function isSupportedArchive(filePath) {
  const lower = String(filePath || '').toLowerCase();
  return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Reject absolute paths and any `..` component before handing an archive to the extractor. */
function isUnsafeArchiveEntry(entry) {
  const normalized = String(entry || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!normalized || normalized === '.') return false;
  if (normalized.includes('\0')) return true;
  if (normalized.startsWith('/') || normalized.startsWith('//') || /^[a-z]:\//i.test(normalized)) {
    return true;
  }
  return normalized.split('/').some((part) => part === '..');
}

function archiveListCommand(archivePath) {
  const isZip = archivePath.toLowerCase().endsWith('.zip');
  if (process.platform === 'win32') {
    const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    return { command: fs.existsSync(systemTar) ? systemTar : 'tar.exe', args: ['-tf', archivePath] };
  }
  if (isZip) return { command: 'unzip', args: ['-Z1', archivePath] };
  return { command: 'tar', args: ['-tf', archivePath] };
}

function listArchiveEntries(archivePath) {
  return new Promise((resolve) => {
    let child;
    try {
      const spec = archiveListCommand(archivePath);
      child = spawn(spec.command, spec.args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let output = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, error: 'El listado del archivo comprimido superó el límite de 30 segundos.' });
    }, ARCHIVE_LIST_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > MAX_ARCHIVE_LIST_BYTES) {
        try {
          child.kill();
        } catch {}
        finish({ ok: false, error: 'El archivo comprimido contiene demasiadas rutas para validarlo.' });
      }
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString();
    });
    child.once('error', (error) => {
      finish({ ok: false, error: `No se pudo inspeccionar el archivo comprimido: ${error.message}` });
    });
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = (stderr || `El listador terminó con código ${code ?? 'desconocido'}.`).trim();
        finish({ ok: false, error: detail.slice(0, 8192) });
        return;
      }

      const entries = output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
      if (entries.length > MAX_ARCHIVE_ENTRIES) {
        finish({ ok: false, error: 'El archivo comprimido supera el máximo de 20.000 entradas.' });
        return;
      }
      const unsafe = entries.find(isUnsafeArchiveEntry);
      if (unsafe) {
        finish({ ok: false, error: `Entrada no segura en el archivo comprimido: ${unsafe.slice(0, 200)}` });
        return;
      }
      finish({ ok: true, entries });
    });
  });
}

function extractArchiveWithSystemTool(archivePath, destination) {
  return new Promise((resolve) => {
    const isZip = archivePath.toLowerCase().endsWith('.zip');
    let command;
    let args;

    if (process.platform === 'win32') {
      // Git Bash ships GNU tar, which cannot read zip; Windows' bsdtar can.
      const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      command = fs.existsSync(systemTar) ? systemTar : 'tar.exe';
      args = ['-xf', archivePath, '-C', destination];
    } else if (isZip) {
      command = 'unzip';
      args = ['-o', archivePath, '-d', destination];
    } else {
      command = 'tar';
      args = ['-xf', archivePath, '-C', destination];
    }

    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let output = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, error: 'La extracción superó el límite de 5 minutos.' });
    }, ARCHIVE_EXTRACT_TIMEOUT_MS);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on('data', (chunk) => {
      if (output.length < 8192) output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString();
    });
    child.once('error', (error) => {
      finish({ ok: false, error: `No se pudo iniciar el extractor: ${error.message}` });
    });
    child.once('close', (code) => {
      if (code === 0) {
        finish({ ok: true, output: output.slice(0, 8192) });
        return;
      }
      const detail = (stderr || output || `El extractor terminó con código ${code ?? 'desconocido'}.`).trim();
      finish({ ok: false, error: detail.slice(0, 8192) });
    });
  });
}

async function extractArchiveRequest(owner, request) {
  const requestCwd = typeof request?.cwd === 'string' ? request.cwd : '';
  let archivePath = typeof request?.archivePath === 'string' ? request.archivePath.trim() : '';
  let destination = typeof request?.destination === 'string' ? request.destination.trim() : '';

  if (!archivePath && typeof request?.defaultPath === 'string') {
    const candidate = request.defaultPath.trim();
    if (candidate) {
      const resolved = path.isAbsolute(candidate) ? candidate : requestCwd ? path.resolve(requestCwd, candidate) : candidate;
      try {
        if (fs.statSync(resolved).isFile() && isSupportedArchive(resolved)) archivePath = resolved;
      } catch {}
    }
  }

  if (!archivePath) {
    const options = {
      title: 'Seleccionar archivo comprimido',
      properties: ['openFile'],
      filters: [
        { name: 'Archivos comprimidos', extensions: ['zip', 'tar', 'tgz', 'gz', 'bz2', 'xz'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
    archivePath = picked.filePaths[0];
  }

  archivePath = path.resolve(archivePath);
  if (!isSupportedArchive(archivePath)) {
    return { ok: false, error: 'Solo se admiten archivos .zip, .tar, .tar.gz, .tgz, .tar.bz2 o .tar.xz.' };
  }

  let archiveStat;
  try {
    archiveStat = fs.statSync(archivePath);
  } catch {
    return { ok: false, error: 'El archivo comprimido no existe.' };
  }
  if (!archiveStat.isFile()) return { ok: false, error: 'La ruta seleccionada no es un archivo.' };

  if (!destination) {
    const options = {
      title: 'Seleccionar carpeta de destino',
      defaultPath: path.dirname(archivePath),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
    destination = picked.filePaths[0];
  }

  destination = path.resolve(destination);
  try {
    if (!fs.statSync(destination).isDirectory()) throw new Error('not a directory');
  } catch {
    return { ok: false, error: 'La carpeta de destino no existe o no es válida.' };
  }

  const listing = await listArchiveEntries(archivePath);
  if (!listing.ok) return { ok: false, error: listing.error };

  const result = await extractArchiveWithSystemTool(archivePath, destination);
  return { ...result, archivePath, destination };
}

function compressArchiveWithSystemTool(sourcePath, destination) {
  return new Promise((resolve) => {
    const isZip = destination.toLowerCase().endsWith('.zip');
    const parent = path.dirname(sourcePath);
    const base = path.basename(sourcePath);
    let command;
    let args;
    let cwd;

    if (process.platform === 'win32') {
      const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      command = fs.existsSync(systemTar) ? systemTar : 'tar.exe';
      args = isZip
        ? ['-a', '-cf', destination, '-C', parent, base]
        : ['-cf', destination, '-C', parent, base];
    } else if (isZip) {
      command = 'zip';
      args = ['-r', destination, base];
      cwd = parent;
    } else {
      command = 'tar';
      args = ['-cf', destination, '-C', parent, base];
    }

    let child;
    try {
      child = spawn(command, args, { windowsHide: true, cwd });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }

    let output = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, error: 'La compresión superó el límite de 5 minutos.' });
    }, ARCHIVE_EXTRACT_TIMEOUT_MS);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout?.on('data', (chunk) => {
      if (output.length < 8192) output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 8192) stderr += chunk.toString();
    });
    child.once('error', (error) => {
      finish({ ok: false, error: `No se pudo iniciar el compresor: ${error.message}` });
    });
    child.once('close', (code) => {
      if (code === 0) {
        finish({ ok: true, output: output.slice(0, 8192) });
        return;
      }
      const detail = (stderr || output || `El compresor terminó con código ${code ?? 'desconocido'}.`).trim();
      finish({ ok: false, error: detail.slice(0, 8192) });
    });
  });
}

async function createArchiveRequest(owner, request) {
  const requestCwd = typeof request?.cwd === 'string' ? request.cwd : '';
  let sourcePath = typeof request?.sourcePath === 'string' ? request.sourcePath.trim() : '';
  let destination = typeof request?.destination === 'string' ? request.destination.trim() : '';

  if (!sourcePath && typeof request?.defaultPath === 'string') {
    const candidate = request.defaultPath.trim().replace(/^["']|["']$/g, '');
    if (candidate) {
      const resolved = path.isAbsolute(candidate) ? candidate : requestCwd ? path.resolve(requestCwd, candidate) : candidate;
      try {
        const stat = fs.statSync(resolved);
        if (stat.isFile() || stat.isDirectory()) sourcePath = resolved;
      } catch {}
    }
  }

  if (!sourcePath) {
    const options = {
      title: 'Seleccionar carpeta para comprimir',
      defaultPath: requestCwd && fs.existsSync(requestCwd) ? requestCwd : undefined,
      properties: ['openDirectory'],
    };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
    sourcePath = picked.filePaths[0];
  }

  sourcePath = path.resolve(sourcePath);
  let sourceStat;
  try {
    sourceStat = fs.statSync(sourcePath);
  } catch {
    return { ok: false, error: 'La ruta de origen no existe.' };
  }
  if (!sourceStat.isFile() && !sourceStat.isDirectory()) {
    return { ok: false, error: 'La ruta de origen no es un archivo ni una carpeta.' };
  }
  if (sourceStat.isDirectory() && !path.basename(sourcePath)) {
    return { ok: false, error: 'No se puede comprimir la raíz de una unidad.' };
  }

  if (!destination) {
    const options = {
      title: 'Guardar archivo comprimido',
      defaultPath: path.join(path.dirname(sourcePath), `${path.basename(sourcePath)}.zip`),
      filters: [
        { name: 'Archivo ZIP', extensions: ['zip'] },
        { name: 'Archivo TAR', extensions: ['tar'] },
      ],
    };
    const picked = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
    destination = picked.filePath;
  }

  destination = path.resolve(destination);
  if (!path.extname(destination)) destination += '.zip';
  if (!/\.(zip|tar)$/i.test(destination)) {
    return { ok: false, error: 'El archivo de salida debe terminar en .zip o .tar.' };
  }

  try {
    if (!fs.statSync(path.dirname(destination)).isDirectory()) throw new Error('not a directory');
  } catch {
    return { ok: false, error: 'La carpeta de destino no existe.' };
  }

  const relative = path.relative(sourcePath, destination);
  if (sourceStat.isDirectory() && relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return { ok: false, error: 'El archivo comprimido no puede guardarse dentro de la carpeta que se comprime.' };
  }
  if (!sourceStat.isDirectory() && destination === sourcePath) {
    return { ok: false, error: 'El archivo comprimido no puede ser el mismo archivo de origen.' };
  }

  const result = await compressArchiveWithSystemTool(sourcePath, destination);
  return { ...result, sourcePath, destination };
}

function registerWindowIpc() {
  ipcMain.on('terminus:window:minimize', (event) => {
    windowForEvent(event)?.minimize();
  });

  ipcMain.handle('terminus:window:toggle-maximize', (event) => {
    const win = windowForEvent(event);
    if (!win) return false;

    if (win.isMaximized()) win.unmaximize();
    else win.maximize();

    return win.isMaximized();
  });

  ipcMain.handle('terminus:window:is-maximized', (event) => {
    return windowForEvent(event)?.isMaximized() ?? false;
  });

  ipcMain.on('terminus:window:close', (event) => {
    windowForEvent(event)?.close();
  });

  ipcMain.handle('terminus:pty:create', (event, request) => {
    if (!windowForEvent(event)) {
      return ptyErrorResult(request?.id, 'Origen no autorizado.');
    }
    return createPtySession(request);
  });

  ipcMain.on('terminus:pty:write', (event, payload) => {
    if (!windowForEvent(event)) return;
    writePtySession(payload);
  });

  ipcMain.on('terminus:pty:resize', (event, payload) => {
    if (!windowForEvent(event)) return;
    resizePtySession(payload);
  });

  ipcMain.on('terminus:pty:kill', (event, id) => {
    if (!windowForEvent(event) || typeof id !== 'string') return;
    killPtySession(id);
  });

  ipcMain.handle('terminus:shell:run', async (event, request) => {
    if (!windowForEvent(event)) {
      return emptyShellResult('auto', 'Origen no autorizado.');
    }
    return runNativeShell(request);
  });

  ipcMain.handle('terminus:fs:info', (event) => {
    if (!windowForEvent(event)) return null;
    return nativeFsInfo();
  });

  ipcMain.handle('terminus:fs:resolve-directory', (event, request) => {
    if (!windowForEvent(event)) {
      return {
        ok: false,
        path: '',
        cwd: '',
        home: '',
        drives: [],
        error: 'Origen no autorizado.',
      };
    }
    return resolveNativeDirectory(request);
  });

  ipcMain.handle('terminus:archive:extract', (event, request) => {
    const win = windowForEvent(event);
    if (!win) return { ok: false, error: 'Origen no autorizado.' };
    return extractArchiveRequest(win, request);
  });

  ipcMain.handle('terminus:archive:create', (event, request) => {
    const win = windowForEvent(event);
    if (!win) return { ok: false, error: 'Origen no autorizado.' };
    return createArchiveRequest(win, request);
  });

  ipcMain.handle('terminus:adblock:cosmetics', (event, rawUrl) => {
    if (!windowForEvent(event)) return '';
    return getAdblockCosmetics(rawUrl);
  });
}

function isAppOriginUrl(value, appOrigin) {
  try {
    return new URL(value).origin === appOrigin;
  } catch {
    return false;
  }
}

function getAdblockCosmetics(rawUrl) {
  if (!adblockBlocker || typeof rawUrl !== 'string') return '';
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(target.protocol)) return '';

  const parsed = parseDomain(target.href);
  const hostname = parsed.hostname || target.hostname;
  const domain = parsed.domain || hostname;
  try {
    const { active, styles } = adblockBlocker.getCosmeticsFilters({
      domain,
      hostname,
      url: target.href,
      getBaseRules: true,
      getInjectionRules: true,
      getExtendedRules: false,
      getRulesFromHostname: true,
      getRulesFromDOM: false,
    });
    return active ? String(styles || '') : '';
  } catch {
    return '';
  }
}

function configureSessionPermissions(appOrigin) {
  const appSession = session.defaultSession;
  const isTrustedPermission = (permission, requestingUrl, details) => {
    if (!APP_PERMISSIONS.has(permission)) return false;
    if (!isAppOriginUrl(requestingUrl, appOrigin)) return false;
    // Chromium reports fileSystem checks with isMainFrame=false even for the
    // top-level document, so validate those by origin only.
    return permission === 'fileSystem' || details?.isMainFrame === true;
  };

  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents?.getURL() || '';
    callback(isTrustedPermission(permission, requestingUrl, details));
  });

  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!webContents) return false;
    const requestingUrl = details?.requestingUrl || webContents.getURL() || requestingOrigin;
    return isTrustedPermission(permission, requestingUrl, details);
  });
}

function isIpLiteralHostname(hostname) {
  return net.isIP(hostname.replace(/^\[|\]$/g, '')) !== 0;
}

async function hostnameResolvesToPrivate(hostname) {
  const key = hostname.toLowerCase().replace(/\.$/, '');
  const now = Date.now();
  const cached = dnsVerdictCache.get(key);
  if (cached && cached.expiresAt > now) return cached.isPrivate;

  let verdict = false;
  try {
    const addresses = await dns.lookup(key, { all: true, verbatim: true });
    verdict = addresses.some((entry) => isPrivateAddress(entry.address));
  } catch {
    // Chromium will surface its own DNS failure; an unresolved hostname is not
    // a private target until it resolves to one.
  }

  dnsVerdictCache.set(key, { isPrivate: verdict, expiresAt: now + DNS_VERDICT_TTL_MS });
  return verdict;
}

async function isBlockedRemoteRequest(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (isPrivateTargetUrl(rawUrl)) return true;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteralHostname(hostname)) return false;
  return hostnameResolvesToPrivate(hostname);
}

function configureNetworkGuard(appOrigin) {
  networkGuardOrigin = appOrigin;
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      // The local SPA, its API and its proxied pages must always load.
      if (isAppOriginUrl(details.url, appOrigin)) {
        callback({});
        return;
      }

      // Remote pages may not probe the host's private network, even in REAL
      // mode where the server-side proxy policy is not in the request path.
      void isBlockedRemoteRequest(details.url)
        .then((blocked) => {
          if (blocked) {
            callback({ cancel: true });
            return;
          }
          // Delegate to the easyList engine installed by Ghostery. This also
          // preserves its startup fallback when the engine is still loading.
          if (adblockBlocker) {
            try {
              adblockBlocker.onBeforeRequest(details, callback);
            } catch {
              callback({});
            }
            return;
          }
          callback(isBlockedAdUrl(details.url) ? { cancel: true } : {});
        })
        .catch(() => callback({}));
    }
  );
}

function isBlockedSubframeNavigation(rawUrl, appOrigin) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin === appOrigin) return false;
    if (parsed.protocol === 'about:') return rawUrl !== 'about:blank';
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    return isPrivateTargetUrl(rawUrl);
  } catch {
    return true;
  }
}

async function initializeAdblock() {
  if (process.env.TERMINUS_DISABLE_ADBLOCK === '1') return null;
  if (adblockBlocker) return adblockBlocker;
  if (adblockInitialization) return adblockInitialization;

  adblockInitialization = (async () => {
    if (typeof fetch !== 'function') {
      throw new Error('fetch no está disponible en el proceso principal.');
    }

    // The serialized engine makes subsequent launches offline-friendly. The
    // package falls back to downloading EasyList/EasyPrivacy if the cache is
    // missing, stale or corrupt.
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(app.getPath('userData'), ADBLOCK_CACHE_FILENAME),
      read: (file) => fs.promises.readFile(file),
      write: (file, buffer) => fs.promises.writeFile(file, buffer),
    });
    blocker.enableBlockingInSession(session.defaultSession);
    adblockBlocker = blocker;
    // Install the shared guard after Ghostery: Electron allows only one
    // onBeforeRequest listener, and ours wraps the adblock callback.
    if (networkGuardOrigin) configureNetworkGuard(networkGuardOrigin);
    return blocker;
  })().catch((error) => {
    adblockInitialization = null;
    console.warn(
      '[Terminus] No se pudo cargar EasyList/EasyPrivacy; se usará la lista local.',
      error
    );
    return null;
  });

  return adblockInitialization;
}

async function configureRealNetworkProxy(appUrl, proxyPort) {
  const host = new URL(appUrl).hostname;
  const bypassRules = ['127.0.0.1', 'localhost', '[::1]', host].filter(Boolean);
  await session.defaultSession.setProxy({
    mode: 'fixed_servers',
    // Chromium only ever connects to this loopback proxy. The proxy resolves
    // each remote hostname, validates every answer and connects to that exact
    // IP; CONNECT keeps TLS/SNI and certificate validation in Chromium.
    proxyRules: `http=127.0.0.1:${proxyPort};https=127.0.0.1:${proxyPort}`,
    proxyBypassRules: [...new Set(bypassRules)].join(';'),
  });
}

function createWindow(appUrl) {
  const appOrigin = new URL(appUrl).origin || APP_ORIGIN_FALLBACK;
  configureSessionPermissions(appOrigin);
  configureNetworkGuard(appOrigin);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 540,
    frame: false,
    show: false,
    backgroundColor: '#0c0e12',
    autoHideMenuBar: true,
    title: 'Terminus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  mainWindow.on('maximize', () => sendMaximizedState(mainWindow));
  mainWindow.on('unmaximize', () => sendMaximizedState(mainWindow));
  mainWindow.on('enter-full-screen', () => sendMaximizedState(mainWindow));
  mainWindow.on('leave-full-screen', () => sendMaximizedState(mainWindow));

  mainWindow.on('closed', () => {
    killAllPtySessions();
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url, disposition }) => {
    if (isPrivateTargetUrl(url)) {
      return { action: 'deny' };
    }
    const adBlocked =
      process.env.TERMINUS_DISABLE_ADBLOCK !== '1' && isBlockedAdUrl(url);
    // Background tabs and explicit popup windows are usually ads or tracking
    // flows. A normal foreground link may still open in the system browser.
    const unnecessaryPopup =
      process.env.TERMINUS_ALLOW_POPUPS !== '1' && disposition !== 'foreground-tab';
    if (adBlocked || unnecessaryPopup) {
      return { action: 'deny' };
    }
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // A cross-origin page shown in REAL mode owns its keyboard events, so the renderer
  // cannot see Ctrl/Cmd+F there. Catch it before Chromium handles it and tell the
  // web surface to open its own find bar.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (!input.control && !input.meta) return;
    if (input.alt || String(input.key || '').toLowerCase() !== 'f') return;

    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(FIND_SHORTCUT_CHANNEL);
  });

  // Right-clicks inside a page iframe never reach the renderer's DOM handlers.
  // Forward them with content coordinates so the web surface can show its own menu.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!mainWindow || mainWindow.isDestroyed() || !params.frame) return;
    if (params.frame === mainWindow.webContents.mainFrame) return;

    const cursor = screen.getCursorScreenPoint();
    const contentBounds = mainWindow.getContentBounds();
    mainWindow.webContents.send(FRAME_CONTEXT_MENU_CHANNEL, {
      x: cursor.x - contentBounds.x,
      y: cursor.y - contentBounds.y,
      pageURL: params.pageURL,
      linkURL: params.linkURL,
      selectionText: params.selectionText,
    });
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== appOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // A public page in REAL mode may navigate its iframe to a private target even
  // though the top-level document is confined to the app origin. Block private
  // and non-web subframe navigations here; webRequest catches the network side.
  mainWindow.webContents.on('will-frame-navigate', (event, url, isMainFrame) => {
    if (isMainFrame) return;
    if (!isBlockedSubframeNavigation(url, appOrigin)) return;
    event.preventDefault();
    console.warn(`[Terminus] Navegación de subframe bloqueada: ${url}`);
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    if (errorCode === -3) return; // Abortos de navegación propios
    console.error(`[Terminus] No se pudo cargar ${validatedUrl}: ${errorDescription} (${errorCode}).`);
  });

  void mainWindow.loadURL(appUrl);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.terminus.browser');
    registerWindowIpc();

    try {
      const appUrl = await resolveAppUrl();
      forwardProxy = await startForwardProxy();
      await configureRealNetworkProxy(appUrl, forwardProxy.port);
      // Give the cached engine a short head start so cosmetic filters exist on
      // the first paint. The download may continue in the background if slow.
      await Promise.race([
        initializeAdblock(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      createWindow(appUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox('No se pudo iniciar Terminus', message);
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) {
        resolveAppUrl()
          .then((appUrl) => createWindow(appUrl))
          .catch((error) => {
            dialog.showErrorBox('No se pudo iniciar Terminus', String(error));
            app.quit();
          });
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (forwardProxy) {
      void forwardProxy.close();
      forwardProxy = null;
    }
    killAllPtySessions();
    for (const child of activeShellChildren) killShellProcess(child);
    activeShellChildren.clear();
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
