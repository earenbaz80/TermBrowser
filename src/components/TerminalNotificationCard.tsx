import React, { useState } from 'react';
import { TerminalNotification, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import {
  AlertTriangle,
  CheckCircle2,
  Bell,
  ShieldAlert,
  Terminal,
  Activity,
  ArrowRight,
  X,
} from 'lucide-react';

interface TerminalNotificationCardProps {
  theme: ThemeConfig;
  notification: TerminalNotification;
  onExecuteCommand: (cmd: string) => void;
  onDismiss?: (id: string) => void;
}

export const TerminalNotificationCard: React.FC<TerminalNotificationCardProps> = ({
  theme,
  notification,
  onExecuteCommand,
  onDismiss,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  const isAnomaly = notification.category === 'anomaly' || notification.severity === 'critical';
  const isScript = notification.category === 'script';

  // Ejecuta la acción de la tarjeta y la retira del flujo en el mismo gesto.
  const handleAction = (command: string) => {
    soundEffects.playKeyClick();
    onExecuteCommand(command);
    setIsDismissed(true);
    onDismiss?.(notification.id);
  };

  let borderColor = theme.border;
  let bgGradient = 'bg-black/40';
  let badgeColor = theme.accent;
  let IconComponent = Bell;

  if (isAnomaly) {
    borderColor = '#ef4444'; // Red
    bgGradient = 'bg-red-950/40';
    badgeColor = '#f87171';
    IconComponent = AlertTriangle;
  } else if (isScript) {
    borderColor = '#10b981'; // Emerald
    bgGradient = 'bg-emerald-950/30';
    badgeColor = '#34d399';
    IconComponent = CheckCircle2;
  } else if (notification.category === 'security') {
    borderColor = '#f59e0b'; // Amber
    bgGradient = 'bg-amber-950/30';
    badgeColor = '#fbbf24';
    IconComponent = ShieldAlert;
  }

  return (
    <div
      className={`my-2 p-3 border rounded-xs font-mono text-xs select-text shadow-lg transition-all animate-in fade-in slide-in-from-top-1 ${bgGradient}`}
      style={{
        borderColor,
        color: theme.text,
      }}
    >
      {/* Retro Banner Header */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b select-none" style={{ borderColor }}>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 font-bold text-[10px] px-1.5 py-0.5 rounded-xs ${
              isAnomaly ? 'animate-pulse bg-red-600 text-white' : 'bg-white/10'
            }`}
            style={{ color: isAnomaly ? '#ffffff' : badgeColor }}
          >
            <IconComponent className="w-3 h-3 shrink-0" />
            <span>
              {isAnomaly
                ? '¡ALERTA DE ANOMALÍA EN SISTEMA!'
                : isScript
                ? 'SCRIPT AUTOMATIZADO COMPLETADO'
                : 'NOTIFICACIÓN DEL NAVEGADOR'}
            </span>
          </span>
          <span className="text-[10px] opacity-60 font-mono">[{notification.timestamp}]</span>
        </div>

        {onDismiss && (
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setIsDismissed(true);
              onDismiss(notification.id);
            }}
            className="p-1 hover:text-red-400 cursor-pointer opacity-70 hover:opacity-100"
            title="Descartar notificación"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Main Title & Body */}
      <div className="space-y-1">
        <div className="font-bold text-xs flex items-center gap-1.5" style={{ color: badgeColor }}>
          <span>{notification.title}</span>
        </div>
        <div className="text-[11px] leading-relaxed opacity-90 whitespace-pre-wrap font-mono">
          {notification.body}
        </div>
      </div>

      {/* Interactive Action Buttons */}
      <div className="mt-2.5 pt-1.5 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {notification.actionCommand && !(isAnomaly && notification.actionCommand === 'top') && (
            <button
              onClick={() => handleAction(notification.actionCommand!)}
              className="flex items-center gap-1 px-2.5 py-1 border text-[10px] font-bold rounded-xs cursor-pointer active:scale-95 transition-transform hover:opacity-90"
              style={{
                backgroundColor: badgeColor,
                color: '#000000',
                borderColor: badgeColor,
              }}
              title={`Ejecutar: ${notification.actionCommand}`}
            >
              <span>{notification.actionText || 'Ver Detalles'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          {isAnomaly && (
            <button
              onClick={() => handleAction('top')}
              className="flex items-center gap-1 px-2 py-1 border text-[10px] rounded-xs cursor-pointer hover:bg-white/10"
              style={{ borderColor }}
            >
              <Activity className="w-3 h-3 text-red-400" />
              <span>Abrir Monitor TOP</span>
            </button>
          )}

          {isScript && (
            <button
              onClick={() => handleAction('script list')}
              className="flex items-center gap-1 px-2 py-1 border text-[10px] rounded-xs cursor-pointer hover:bg-white/10"
              style={{ borderColor }}
            >
              <Terminal className="w-3 h-3 text-emerald-400" />
              <span>Ver Scripts</span>
            </button>
          )}
        </div>

        <span className="text-[9px] opacity-40 font-mono select-none">
          Notificación W3C Web + Terminal CLI
        </span>
      </div>
    </div>
  );
};
