/**
 * Terminus - Type Definitions
 */

export type ThemeId =
  | 'monochrome-green'
  | 'amber-crt'
  | 'cyberpunk-obsidian'
  | 'retro-futurista'
  | 'ms-dos'
  | 'matrix-dark'
  | 'black-and-white';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  bg: string;
  cardBg: string;
  border: string;
  text: string;
  accent: string;
  muted: string;
  glow: string;
  cursorColor: string;
  promptSymbol: string;
}

export type TabKind = 'web' | 'terminal';

/** How a page is painted: the site as-is, the retro dark sheet, or readable text only */
export type PageMode = 'real' | 'dark' | 'text';

export interface TerminusSearchResult {
  title: string;
  url: string;
  snippet: string;
  image?: string;
}

export interface TerminusSearchState {
  query: string;
  status: 'loading' | 'ready' | 'error';
  results: TerminusSearchResult[];
  latencyMs: number;
  provider: string;
  error?: string;
}

export interface BrowserTab {
  id: string;
  /** What the tab shows: a real page (address bar, bookmarks) or its own terminal session */
  kind: TabKind;
  title: string;
  url: string;
  displayUrl: string;
  favicon?: string;
  isLoading: boolean;
  contentType?: string;
  statusCode?: number;
  /** True when the site allows direct embedding; otherwise the web surface uses /api/view */
  frameable?: boolean;
  content: string; // HTML, rendered text, or reader markdown
  readerText?: string;
  /** Links extracted from the page, numbered so they can be opened by typing their index (Lynx-style) */
  links?: WebpageLinkData[];
  /** Real images extracted from the page, matching the inline [img:n] placeholders in the text */
  images?: WebpageImageData[];
  headers?: Record<string, string>;
  latencyMs?: number;
  sizeBytes?: number;
  history: string[];
  historyIndex: number;
  /** Chosen view for this tab (survives reloads with the tab) */
  viewMode?: PageMode;
  /** Results rendered by the internal Terminus Search page */
  search?: TerminusSearchState;
  /** Per-tab page zoom (0.5–2). Undefined means 100%. */
  zoom?: number;
}

export interface InteractiveFileItem {
  name: string;
  type: 'file' | 'dir';
  action: string;
  size?: number;
  description?: string;
  isLocal?: boolean;
  localPath?: string;
}

export interface LocalFsMount {
  type: 'native' | 'workspace';
  name: string;
  path: string;
  itemCount: number;
  mountedAt: string;
}

export interface WebpageImageData {
  src: string;
  alt?: string;
}

export interface WebpageLinkData {
  text: string;
  href: string;
}

export interface WebpagePayload {
  url: string;
  title: string;
  /** Readable plain text of the page, as extracted by the backend (primary body in text-only view) */
  text?: string;
  /** Server-sanitized original markup (headings, lists, tables, quotes, images) for the retro view */
  structuredHtml?: string;
  /** True when the site allows being embedded, so the real page can be painted inside the CRT monitor */
  frameable?: boolean;
  statusCode?: number;
  latencyMs?: number;
  images: WebpageImageData[];
  links: WebpageLinkData[];
  headings: string[];
  paragraphs: string[];
  summary?: string;
}

export interface TerminalNotification {
  id: string;
  title: string;
  body: string;
  category: 'script' | 'anomaly' | 'security' | 'system';
  severity: 'info' | 'success' | 'warning' | 'critical';
  timestamp: string;
  actionText?: string;
  actionCommand?: string;
  resolved?: boolean;
}

export interface TerminalLogEntry {
  id: string;
  timestamp: string;
  command?: string;
  /** Working directory used by a native command when it was executed. */
  cwd?: string;
  output: string;
  type: 'command' | 'stdout' | 'stderr' | 'system' | 'browser' | 'script' | 'ascii' | 'webpage' | 'notification';
  tabId?: string;
  exitCode?: number;
  interactiveFiles?: InteractiveFileItem[];
  webpage?: WebpagePayload;
  notification?: TerminalNotification;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  installed: boolean;
  commands: {
    name: string;
    description: string;
    usage: string;
  }[];
}

export interface UserScript {
  id: string;
  name: string;
  description: string;
  steps: string[];
  createdAt: string;
  lastRun?: string;
  runCount: number;
  /** Set once the user edits a shipped example; it then stops following the UI language. */
  custom?: boolean;
}

export interface KeyBinding {
  key: string;
  command: string;
  description: string;
  custom?: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SEC' | 'HTTP' | 'SYS';
  module: string;
  message: string;
  metadata?: any;
}

export interface SystemMetrics {
  cpuUsage: number; // 0-100%
  cpuCores: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  networkRxKb: number;
  networkTxKb: number;
  latencyMs: number;
  activeProcesses: number;
  anomalies: {
    id: string;
    timestamp: string;
    type: 'HIGH_CPU' | 'HIGH_MEMORY' | 'LATENCY_SPIKE' | 'CRYPTO_WARN';
    message: string;
    severity: 'warning' | 'critical';
  }[];
}

export interface SecurityState {
  vaultLocked: boolean;
  encryptionAlgorithm: 'AES-256-GCM';
  mfaEnabled: boolean;
  mfaSecret: string;
  mfaVerified: boolean;
  lastBackup?: string;
  integrityChecksum: string;
  auditEventsCount: number;
}

/** Secure bridge exposed by the Electron preload script (absent in a normal browser tab). */
export interface TerminusDesktopApi {
  platform: string;
  minimize(): void;
  toggleMaximize(): Promise<boolean>;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  onFrameContextMenu(listener: (event: FrameContextMenuEvent) => void): () => void;
  /** Ctrl/Cmd+F captured by the desktop shell, including inside direct REAL iframes. */
  onFindShortcut(listener: () => void): () => void;
  /** Cosmetic CSS computed from EasyList for a proxied page's original URL. */
  getAdblockCosmetics?(url: string): Promise<string>;
  /** Ad-blocking switch owned by the Electron main process. */
  getAdblockState?(): Promise<{ enabled: boolean; available: boolean }>;
  setAdblockEnabled?(enabled: boolean): Promise<{ enabled: boolean; available: boolean }>;
}

export interface FrameContextMenuEvent {
  x: number;
  y: number;
  pageURL?: string;
  linkURL?: string;
  selectionText?: string;
}

/** Real shells available only through the Electron preload bridge. */
export type NativeShellId = 'auto' | 'cmd' | 'powershell' | 'bash';
export type TerminalShellMode = 'terminus' | NativeShellId;

export interface NativeShellRunRequest {
  command: string;
  shell: NativeShellId;
  /** Real local directory where the command runs; defaults to the Terminus workspace. */
  cwd?: string;
  timeoutMs?: number;
}

export interface NativeShellResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  shell: string;
  cwd: string;
  durationMs: number;
  truncated: boolean;
  timedOut: boolean;
  error?: string;
}

export interface TerminusShellApi {
  platform: string;
  available: boolean;
  run(request: NativeShellRunRequest): Promise<NativeShellResult>;
}

export interface PtyCreateRequest {
  id: string;
  shell: NativeShellId;
  cwd?: string;
  cols: number;
  rows: number;
}

export interface PtyCreateResult {
  ok: boolean;
  id: string;
  shell?: string;
  label?: string;
  cwd?: string;
  buffer?: string;
  seq?: number;
  reused?: boolean;
  error?: string;
}

export interface PtyDataEvent {
  id: string;
  data: string;
  seq: number;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number | null;
  signal?: number | string;
}

/** Interactive PTY bridge, available only in the Electron desktop app. */
export interface TerminusPtyApi {
  available: boolean;
  create(request: PtyCreateRequest): Promise<PtyCreateResult>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(listener: (event: PtyDataEvent) => void): () => void;
  onExit(listener: (event: PtyExitEvent) => void): () => void;
}

export interface ArchiveExtractRequest {
  /** Archive path chosen by the caller; when omitted, the desktop app opens a picker. */
  archivePath?: string;
  /** Destination directory; when omitted, the desktop app opens a directory picker. */
  destination?: string;
  /** Prefill for the archive picker, usually the selected terminal text. */
  defaultPath?: string;
  /** Base directory used to resolve a relative defaultPath. */
  cwd?: string;
}

export interface ArchiveExtractResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  archivePath?: string;
  destination?: string;
  output?: string;
}

export interface ArchiveCreateRequest {
  /** File or directory to compress; when omitted, the desktop app opens a folder picker. */
  sourcePath?: string;
  /** Output archive; when omitted, the desktop app opens a save dialog. */
  destination?: string;
  /** Prefill for the source picker, usually the selected terminal text. */
  defaultPath?: string;
  /** Base directory used to resolve a relative defaultPath. */
  cwd?: string;
}

export interface ArchiveCreateResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  sourcePath?: string;
  destination?: string;
  output?: string;
}

export interface TerminusArchiveApi {
  available: boolean;
  extract(request?: ArchiveExtractRequest): Promise<ArchiveExtractResult>;
  create(request?: ArchiveCreateRequest): Promise<ArchiveCreateResult>;
}

/** Native local filesystem exposed by Electron, not by the browser. */
export interface NativeFsInfo {
  platform: string;
  home: string;
  workspace: string;
  drives: string[];
}

export interface NativeFsResolveRequest {
  cwd?: string;
  target: string;
  shell: NativeShellId;
}

export interface NativeFsResolveResult {
  ok: boolean;
  path: string;
  cwd: string;
  home: string;
  drives: string[];
  error?: string;
}

export interface TerminusFsApi {
  platform: string;
  available: boolean;
  info(): Promise<NativeFsInfo>;
  resolveDirectory(request: NativeFsResolveRequest): Promise<NativeFsResolveResult>;
}

declare global {
  interface Window {
    terminusDesktop?: TerminusDesktopApi;
    terminusShell?: TerminusShellApi;
    terminusFs?: TerminusFsApi;
    terminusPty?: TerminusPtyApi;
    terminusArchive?: TerminusArchiveApi;
  }
}
