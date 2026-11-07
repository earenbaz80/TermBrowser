/**
 * TermBrowser OS - Type Definitions
 */

export type ThemeId =
  | 'monochrome-green'
  | 'amber-crt'
  | 'cyberpunk-obsidian'
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

export type ViewMode = 'split' | 'terminal' | 'browser' | 'reader';

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  favicon?: string;
  isLoading: boolean;
  contentType?: string;
  statusCode?: number;
  content: string; // HTML, rendered text, or reader markdown
  readerText?: string;
  headers?: Record<string, string>;
  latencyMs?: number;
  sizeBytes?: number;
  history: string[];
  historyIndex: number;
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
