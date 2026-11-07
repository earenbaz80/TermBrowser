import React, { useState, useEffect } from 'react';
import { SystemMetrics, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { Activity, AlertTriangle, Cpu, HardDrive, Network, X, RefreshCw, Bell } from 'lucide-react';

interface ResourceMonitorHUDProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  metrics: SystemMetrics;
  onResolveAnomaly: (id: string) => void;
  onSimulateSpike?: () => void;
}

export const ResourceMonitorHUD: React.FC<ResourceMonitorHUDProps> = ({
  theme,
  isOpen,
  onClose,
  metrics,
  onResolveAnomaly,
  onSimulateSpike,
}) => {
  const [refreshInterval, setRefreshInterval] = useState<number>(1000);
  const [viewMode, setViewMode] = useState<'standard' | 'ms-dos-full'>('ms-dos-full');

  // Trigger audio alert when critical anomalies appear
  useEffect(() => {
    const hasCritical = metrics.anomalies.some((a) => a.severity === 'critical');
    if (hasCritical) {
      soundEffects.playAnomalyAlert();
    }
  }, [metrics.anomalies.length]);

  if (!isOpen) return null;

  // Helper to render ASCII progress bar (e.g., [██████░░░░░░] 50%)
  const renderAsciiBar = (percentage: number, length = 20) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
    const filledCount = Math.round((clamped / 100) * length);
    const emptyCount = length - filledCount;
    const filled = '█'.repeat(filledCount);
    const empty = '░'.repeat(emptyCount);
    return `[${filled}${empty}] ${clamped.toString().padStart(3, ' ')}%`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs font-mono">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col border shadow-2xl overflow-hidden rounded-xs"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Retro MS-DOS Window Titlebar */}
        <div
          className="flex items-center justify-between px-3 py-1.5 border-b text-xs select-none"
          style={{
            backgroundColor: theme.cardBg,
            borderColor: theme.border,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wider">
              ╔═[ MS-DOS SYSTEM RESOURCE MONITOR v6.22 / HIGH-PRECISION HUD ]═╗
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] opacity-75">
              REFRESH: {refreshInterval}ms
            </span>
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setViewMode(viewMode === 'standard' ? 'ms-dos-full' : 'standard');
              }}
              className="text-[11px] underline hover:opacity-100 cursor-pointer"
            >
              MODO: {viewMode.toUpperCase()}
            </button>
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                onClose();
              }}
              className="px-2 py-0.5 border text-xs font-bold hover:bg-red-900/50 cursor-pointer transition-colors"
              style={{ borderColor: theme.border }}
              title="Cerrar monitor"
            >
              [X]
            </button>
          </div>
        </div>

        {/* Anomaly Notification Banner */}
        {metrics.anomalies.length > 0 && (
          <div
            className="px-4 py-2 border-b flex items-center justify-between animate-pulse"
            style={{
              backgroundColor: 'rgba(220, 38, 38, 0.25)',
              borderColor: '#dc2626',
              color: '#fca5a5',
            }}
          >
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>
                ALERTA DE ANOMALIA: {metrics.anomalies[0].message} ({metrics.anomalies[0].timestamp})
              </span>
            </div>
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                onResolveAnomaly(metrics.anomalies[0].id);
              }}
              className="px-2 py-0.5 text-[11px] border border-red-400 font-bold hover:bg-red-800/60 cursor-pointer"
            >
              RESOLVER
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Top Gauges Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* CPU Gauge */}
            <div
              className="p-3 border rounded-xs"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: theme.border }}>
                <div className="flex items-center gap-1.5 font-bold">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>PROCESADOR (CPU)</span>
                </div>
                <span className="text-[11px] font-bold">{metrics.cpuCores} NÚCLEOS</span>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] opacity-80">CARGA ACTIVA:</div>
                <div className="font-bold tracking-tight text-sm">
                  {renderAsciiBar(metrics.cpuUsage, 18)}
                </div>
                <div className="flex justify-between text-[11px] opacity-75 pt-1">
                  <span>FREQ: 3.40 GHz</span>
                  <span>LOAD: {(metrics.cpuUsage / 100 * 2.5).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* RAM Gauge */}
            <div
              className="p-3 border rounded-xs"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: theme.border }}>
                <div className="flex items-center gap-1.5 font-bold">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span>MEMORIA (RAM)</span>
                </div>
                <span className="text-[11px] font-bold">{metrics.memoryTotalMb} MB TOTAL</span>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] opacity-80">USO CONVENCIONAL:</div>
                <div className="font-bold tracking-tight text-sm">
                  {renderAsciiBar(metrics.memoryPercent, 18)}
                </div>
                <div className="flex justify-between text-[11px] opacity-75 pt-1">
                  <span>USADA: {metrics.memoryUsedMb} MB</span>
                  <span>LIBRE: {metrics.memoryTotalMb - metrics.memoryUsedMb} MB</span>
                </div>
              </div>
            </div>

            {/* Network & Latency */}
            <div
              className="p-3 border rounded-xs"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: theme.border }}>
                <div className="flex items-center gap-1.5 font-bold">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <span>RED & LATENCIA</span>
                </div>
                <span className="text-[11px] font-bold">{metrics.latencyMs} ms PING</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span>RX (DESCARGA):</span>
                  <span className="font-bold">{metrics.networkRxKb.toFixed(1)} KB/s</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>TX (SUBIDA):</span>
                  <span className="font-bold">{metrics.networkTxKb.toFixed(1)} KB/s</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t" style={{ borderColor: theme.border }}>
                  <span>CANAL CIFRADO:</span>
                  <span className="font-bold text-emerald-400">AES-256 ACTIVO</span>
                </div>
              </div>
            </div>
          </div>

          {/* MS-DOS Process & Thread Table */}
          <div
            className="border p-3 rounded-xs"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b font-bold" style={{ borderColor: theme.border }}>
              <span>TABLA DE PROCESOS ACTIVOS (TASKLIST / TOP)</span>
              <span>{metrics.activeProcesses} TAREAS EN EJECUCIÓN</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b opacity-75" style={{ borderColor: theme.border }}>
                    <th className="py-1 px-2">PID</th>
                    <th className="py-1 px-2">COMANDO / PROCESO</th>
                    <th className="py-1 px-2">HILOS</th>
                    <th className="py-1 px-2 text-right">CPU %</th>
                    <th className="py-1 px-2 text-right">MEM (MB)</th>
                    <th className="py-1 px-2 text-center">ESTADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-1 px-2 font-bold">1001</td>
                    <td className="py-1 px-2">termbrowser-core.bin</td>
                    <td className="py-1 px-2">4</td>
                    <td className="py-1 px-2 text-right font-mono">{(metrics.cpuUsage * 0.4).toFixed(1)}%</td>
                    <td className="py-1 px-2 text-right font-mono">142.5</td>
                    <td className="py-1 px-2 text-center text-emerald-400">RUNNING</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-bold">1002</td>
                    <td className="py-1 px-2">aes-gcm-crypto-worker</td>
                    <td className="py-1 px-2">2</td>
                    <td className="py-1 px-2 text-right font-mono">{(metrics.cpuUsage * 0.25).toFixed(1)}%</td>
                    <td className="py-1 px-2 text-right font-mono">38.2</td>
                    <td className="py-1 px-2 text-center text-cyan-400">SEALED</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-bold">1003</td>
                    <td className="py-1 px-2">web-sandbox-iframe-proc</td>
                    <td className="py-1 px-2">6</td>
                    <td className="py-1 px-2 text-right font-mono">{(metrics.cpuUsage * 0.2).toFixed(1)}%</td>
                    <td className="py-1 px-2 text-right font-mono">210.8</td>
                    <td className="py-1 px-2 text-center text-emerald-400">ISOLATED</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-bold">1004</td>
                    <td className="py-1 px-2">python-runtime-evaluator</td>
                    <td className="py-1 px-2">1</td>
                    <td className="py-1 px-2 text-right font-mono">1.2%</td>
                    <td className="py-1 px-2 text-right font-mono">45.0</td>
                    <td className="py-1 px-2 text-center text-slate-400">STANDBY</td>
                  </tr>
                  <tr>
                    <td className="py-1 px-2 font-bold">1005</td>
                    <td className="py-1 px-2">network-daemon-prober</td>
                    <td className="py-1 px-2">1</td>
                    <td className="py-1 px-2 text-right font-mono">0.8%</td>
                    <td className="py-1 px-2 text-right font-mono">18.6</td>
                    <td className="py-1 px-2 text-center text-emerald-400">LISTENING</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Anomaly Log History */}
          <div
            className="border p-3 rounded-xs"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b font-bold" style={{ borderColor: theme.border }}>
              <div className="flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-red-400" />
                <span>HISTORIAL DE ANOMALÍAS DETECTADAS</span>
              </div>
              {onSimulateSpike && (
                <button
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onSimulateSpike();
                  }}
                  className="px-2 py-0.5 border text-[11px] font-bold hover:bg-amber-900/40 cursor-pointer"
                  style={{ borderColor: theme.border }}
                >
                  SIMULAR PICO DE CARGA
                </button>
              )}
            </div>

            {metrics.anomalies.length === 0 ? (
              <div className="py-2 text-center opacity-60 text-xs">
                [✓] Sin anomalías registradas. Sistema operando bajo parámetros nominales.
              </div>
            ) : (
              <div className="space-y-1.5">
                {metrics.anomalies.map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="flex items-center justify-between p-1.5 border text-xs"
                    style={{
                      borderColor: anomaly.severity === 'critical' ? '#dc2626' : '#d97706',
                      backgroundColor: anomaly.severity === 'critical' ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[11px]">[{anomaly.timestamp}]</span>
                      <span className="font-bold">[{anomaly.type}]</span>
                      <span>{anomaly.message}</span>
                    </div>
                    <button
                      onClick={() => onResolveAnomaly(anomaly.id)}
                      className="px-1.5 py-0.5 text-[11px] underline hover:opacity-80 cursor-pointer"
                    >
                      Descartar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer info bar */}
        <div
          className="px-3 py-1.5 border-t text-[11px] flex items-center justify-between select-none"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <span>PULSE [ESC] O BOTÓN CERRAR PARA REGRESAR AL NAVEGADOR</span>
          <span>ESTADO: VIGILANCIA NOMINAL</span>
        </div>
      </div>
    </div>
  );
};
