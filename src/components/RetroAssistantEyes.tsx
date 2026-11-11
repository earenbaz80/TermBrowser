import React, { useState, useEffect, useRef } from 'react';
import { soundEffects } from '../utils/soundEffects';
import { Sparkles, X, Lightbulb } from 'lucide-react';
import { PageMode } from '../types';

export type AssistantExpression = 'idle' | 'happy' | 'thinking' | 'alert' | 'excited' | 'sleepy';

const EXPRESSION_LABELS: Record<AssistantExpression, string> = {
  idle: 'listo',
  happy: 'feliz',
  thinking: 'piensa',
  alert: 'alerta',
  excited: '¡wow!',
  sleepy: 'sueño',
};

interface RetroAssistantEyesProps {
  lastCommand?: string;
  lastLogType?: string;
  onExecuteCommand: (cmd: string) => void;
  isVoiceActive?: boolean;
  /** Terminal keeps its command tips; web focuses on CMD, bookmarks and views. */
  variant?: 'terminal' | 'web';
  onOpenCommandMenu?: () => void;
  onToggleBookmark?: () => void;
  bookmarkActive?: boolean;
  hasPage?: boolean;
  viewMode?: PageMode;
  onSelectViewMode?: (mode: PageMode) => void;
}

export const ASSISTANT_TIPS = [
  '¡Hola! Soy DOSY. Escribe "home" para volver al inicio.',
  'Presiona [Ctrl+M] o pulsa el icono de micrófono para dictar comandos por voz.',
  'Usa "ir a <url>" para navegar en terminal con fotos reales.',
  'Abre pestañas con Ctrl+T y salta a cualquiera con Ctrl+1..9 o "pestaña <n>".',
  'Haz clic sobre cualquier archivo en la terminal para abrirlo o ejecutarlo.',
  'Escribe "fs workspace" para explorar el código fuente local.',
  'Ejecuta "python benchmark.py" para cálculo numérico en tiempo real.',
  'Escribe "mc" para abrir Norton Commander con teclado y ratón.',
  'Tu sesión cuenta con cifrado AES-256. Escribe "bóveda" para gestionarla.',
  'Usa Flechas Arriba y Abajo (↑↓) para recuperar comandos del historial.',
  'Escribe "top" o "monitor" para ver el uso de CPU/RAM y alertas.',
  'Escribe "notify status" o "notify on" para activar alertas del navegador.',
];

export const WEB_ASSISTANT_TIPS = [
  'Pulsa [CMD] en la barra para ver y elegir comandos de navegación con el ratón.',
  'El menú CMD reúne ir, buscar, recargar, abrir pestañas y el manual.',
  'Guarda la página actual con la estrella ★ y aparecerá en la tira de Marcadores.',
  'Haz clic en un marcador para abrirlo; su X lo elimina de la tira.',
  'Cambia entre REAL, OSCURO y TEXTO desde la barra superior o desde este globo.',
  'La vista se recuerda por sitio; en SITIOS puedes olvidar una o todas.',
  'Escribe "goto <url>" o "search <texto>" y pulsa RUN para navegar.',
];

const WEB_VIEW_OPTIONS: { id: PageMode; label: string }[] = [
  { id: 'real', label: 'REAL' },
  { id: 'dark', label: 'OSCURO' },
  { id: 'text', label: 'TEXTO' },
];

export const RetroAssistantEyes: React.FC<RetroAssistantEyesProps> = ({
  lastCommand,
  lastLogType,
  onExecuteCommand,
  isVoiceActive = false,
  variant = 'terminal',
  onOpenCommandMenu,
  onToggleBookmark,
  bookmarkActive = false,
  hasPage = true,
  viewMode,
  onSelectViewMode,
}) => {
  const tips = variant === 'web' ? WEB_ASSISTANT_TIPS : ASSISTANT_TIPS;
  const [expression, setExpression] = useState<AssistantExpression>('idle');
  const [isBlinking, setIsBlinking] = useState(false);
  const [showSpeechBubble, setShowSpeechBubble] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [bubbleMessage, setBubbleMessage] = useState<string>(() => tips[0]);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });

  // The label doubles as the assistant's current mood; idle keeps just the name.
  const moodLabel = expression === 'idle' ? 'DOSY' : `DOSY · ${EXPRESSION_LABELS[expression]}`;

  const eyesContainerRef = useRef<HTMLDivElement>(null);

  // Switching between terminal and web swaps the tips and starts from the first one.
  useEffect(() => {
    setCurrentTipIndex(0);
    setBubbleMessage(tips[0]);
    setShowSpeechBubble(false);
    setExpression('idle');
  }, [variant, tips]);

  // Follow the mouse pointer smoothly in real-time
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!eyesContainerRef.current) return;
      const rect = eyesContainerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Max eye shift (smooth and compact)
      const maxShift = 4.5;
      if (dist > 0) {
        const intensity = Math.min(dist / 180, 1) * maxShift;
        setPointerOffset({
          x: (dx / dist) * intensity,
          y: (dy / dist) * intensity,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Periodic natural blinking
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 140);
    }, 3600 + Math.random() * 2600);

    return () => clearInterval(blinkInterval);
  }, []);

  // React to voice recognition activity
  useEffect(() => {
    if (isVoiceActive) {
      setExpression('excited');
      setBubbleMessage('Te estoy escuchando por el micrófono... Di cualquier comando o búsqueda web.');
    } else {
      setExpression('idle');
    }
  }, [isVoiceActive]);

  // React dynamically to commands and log events
  useEffect(() => {
    if (!lastCommand) return;

    const lower = lastCommand.toLowerCase();
    const isWeb = variant === 'web';
    setExpression('thinking');

    const timer = setTimeout(() => {
      if (lastLogType === 'stderr' || lower.includes('error')) {
        setExpression('alert');
        setBubbleMessage(
          isWeb
            ? 'Ese comando no salió bien. Abre CMD para revisar las opciones o escribe "help".'
            : '¡Atención! Ese comando tuvo un detalle. Escribe "ayuda" para ver la sintaxis.',
        );
        setShowSpeechBubble(true);
      } else if (
        lower.startsWith('goto') ||
        lower.startsWith('ir a') ||
        lower.startsWith('web') ||
        lower.startsWith('lynx')
      ) {
        setExpression('excited');
        setBubbleMessage(
          isWeb
            ? 'Página cargada. Cambia entre REAL, OSCURO y TEXTO para ajustar la vista.'
            : '¡Navegando! Web cargada en terminal con imágenes reales.',
        );
      } else if (isWeb && (lower.startsWith('search') || lower.startsWith('buscar'))) {
        setExpression('happy');
        setBubbleMessage('Búsqueda enviada. Abre un resultado o pulsa CMD para otra acción.');
      } else if (isWeb && lower.startsWith('bookmark')) {
        setExpression('happy');
        setBubbleMessage('Marcadores al día. La estrella ★ y la tira superior son tus accesos rápidos.');
      } else if (isWeb && lower.startsWith('reader')) {
        setExpression('happy');
        setBubbleMessage('Modo lectura activo. Prueba REAL u OSCURO para volver a la página completa.');
      } else if (isWeb && lower === 'home') {
        setExpression('happy');
        setBubbleMessage('De vuelta a la portada. Pulsa CMD para empezar otra búsqueda.');
      } else if (!isWeb && (lower.startsWith('python') || lower.startsWith('py'))) {
        setExpression('happy');
        setBubbleMessage('¡Código Python ejecutado correctamente!');
      } else if (
        !isWeb &&
        (lower.startsWith('fs') ||
          lower === 'mc' ||
          lower === 'ls' ||
          lower === 'dir')
      ) {
        setExpression('happy');
        setBubbleMessage('Sistema de archivos local listo. ¡Haz clic para interactuar!');
      } else if (!isWeb && lower.startsWith('notify')) {
        setExpression('excited');
        setBubbleMessage('Sistema de notificaciones W3C + Terminal activo.');
      } else {
        setExpression('happy');
      }

      const returnIdle = setTimeout(() => {
        setExpression('idle');
      }, 3500);

      return () => clearTimeout(returnIdle);
    }, 280);

    return () => clearTimeout(timer);
  }, [lastCommand, lastLogType, variant]);

  const cycleNextTip = () => {
    soundEffects.playKeyClick();
    const nextIdx = (currentTipIndex + 1) % tips.length;
    setCurrentTipIndex(nextIdx);
    setBubbleMessage(tips[nextIdx]);
    setExpression('excited');
    setShowSpeechBubble(true);
    setTimeout(() => setExpression('idle'), 1800);
  };

  const handleEyesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffects.playKeyClick();
    if (!showSpeechBubble) {
      setShowSpeechBubble(true);
      setExpression('happy');
    } else {
      cycleNextTip();
    }
  };

  // Determine eye color and glow by expression (solid, pupil-less retro eyes)
  let eyeColor = '#ffffff'; // White default
  let glowColor = 'rgba(255, 255, 255, 0.6)';
  let expressionLabel = 'Normal';

  if (expression === 'happy') {
    eyeColor = '#34d399'; // Emerald
    glowColor = 'rgba(52, 211, 153, 0.7)';
    expressionLabel = 'Feliz';
  } else if (expression === 'thinking') {
    eyeColor = '#fbbf24'; // Amber
    glowColor = 'rgba(251, 191, 36, 0.7)';
    expressionLabel = 'Pensando';
  } else if (expression === 'alert') {
    eyeColor = '#f87171'; // Crimson
    glowColor = 'rgba(248, 113, 113, 0.8)';
    expressionLabel = 'Alerta';
  } else if (expression === 'excited') {
    eyeColor = '#c084fc'; // Purple / Violet
    glowColor = 'rgba(192, 132, 252, 0.8)';
    expressionLabel = 'Entusiasmado';
  } else if (expression === 'sleepy') {
    eyeColor = '#94a3b8'; // Dim Slate
    glowColor = 'rgba(148, 163, 184, 0.4)';
    expressionLabel = 'Reposo';
  }

  // Web mode keeps DOSY's eyes white; expression colors remain in the bubble accents.
  const displayedEyeColor = variant === 'web' ? '#ffffff' : eyeColor;
  const displayedGlowColor = variant === 'web' ? 'rgba(255, 255, 255, 0.6)' : glowColor;

  return (
    <div className="relative inline-flex items-center select-none font-mono">
      {/* Speech Bubble / Advice Tooltip */}
      {showSpeechBubble && (
        <div
          className="absolute bottom-full right-0 mb-3 w-72 sm:w-80 p-2.5 rounded-xs border shadow-2xl z-40 text-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            backgroundColor: 'rgba(10, 15, 29, 0.97)',
            borderColor: eyeColor,
            color: '#f8fafc',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[10px] font-bold">
            <span className="flex items-center gap-1" style={{ color: eyeColor }}>
              <Sparkles className="w-3 h-3" />
              <span>DOSY · ASISTENTE [{expressionLabel.toUpperCase()}]</span>
            </span>
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setShowSpeechBubble(false);
              }}
              className="p-0.5 hover:text-red-400 cursor-pointer"
              title="Cerrar globo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Message Content */}
          <div className="text-[11px] leading-relaxed opacity-95">
            {bubbleMessage}
          </div>

          {/* Quick Action Chips */}
          <div className="mt-2.5 pt-1.5 border-t border-white/10 flex flex-wrap gap-1">
            <button
              onClick={cycleNextTip}
              className="px-1.5 py-0.5 border border-white/20 hover:border-emerald-400 text-[10px] rounded-xs cursor-pointer flex items-center gap-1"
            >
              <Lightbulb className="w-2.5 h-2.5 text-amber-400" />
              <span>Siguiente</span>
            </button>

            {variant === 'web' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowSpeechBubble(false);
                    onOpenCommandMenu?.();
                  }}
                  disabled={!onOpenCommandMenu}
                  className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer text-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Abrir el menú de comandos de la barra"
                >
                  [CMD]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowSpeechBubble(false);
                    onToggleBookmark?.();
                  }}
                  disabled={!hasPage || !onToggleBookmark}
                  className="px-1.5 py-0.5 border border-white/20 hover:border-amber-300 text-[10px] rounded-xs cursor-pointer text-amber-300 disabled:cursor-not-allowed disabled:opacity-30"
                  title={
                    !hasPage
                      ? 'Abre una página para guardarla en marcadores'
                      : bookmarkActive
                        ? 'Quitar la página actual de marcadores'
                        : 'Guardar la página actual en marcadores'
                  }
                >
                  {bookmarkActive ? '[★ quitar]' : '[★ marcar]'}
                </button>

                {WEB_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setShowSpeechBubble(false);
                      onSelectViewMode?.(option.id);
                    }}
                    disabled={!hasPage || !onSelectViewMode}
                    aria-pressed={viewMode === option.id}
                    className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                    style={viewMode === option.id ? { borderColor: eyeColor, color: eyeColor } : undefined}
                    title={
                      !hasPage
                        ? 'Abre una página para cambiar la vista'
                        : `Ver la página en modo ${option.label.toLowerCase()}`
                    }
                  >
                    [{option.label}]
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onExecuteCommand('home');
                    setShowSpeechBubble(false);
                  }}
                  className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer"
                >
                  [home]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onExecuteCommand('ir a https://news.ycombinator.com');
                    setShowSpeechBubble(false);
                  }}
                  className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer text-amber-300"
                >
                  [ir a HN]
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onExecuteCommand('fs workspace');
                    setShowSpeechBubble(false);
                  }}
                  className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer text-emerald-300"
                >
                  [workspace]
                </button>
              </>
            )}
          </div>

          {/* Bubble tail pointer pointing down to eyes */}
          <div
            className="absolute -bottom-1.5 right-4 w-3 h-3 rotate-45 border-r border-b"
            style={{
              backgroundColor: 'rgba(10, 15, 29, 0.97)',
              borderColor: eyeColor,
            }}
          />
        </div>
      )}

      {/* Floating Retro Eyes (No box/frame, vertical rectangles, pupil-less, tracking pointer) */}
      <div
        ref={eyesContainerRef}
        onClick={handleEyesClick}
        className="group relative inline-flex items-center justify-center p-0 cursor-pointer transition-transform duration-75 hover:scale-110 active:scale-95"
        title="DOSY: Asistente personal (ojos rectangulares verticales sin pupilas · siguen el cursor · clic para consejos)"
      >
        <div
          className="flex items-center gap-1.5 transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${pointerOffset.x}px, ${pointerOffset.y}px)`,
          }}
        >
          {/* Left Solid Retro Eye (Vertical Rectangle, No Pupil) */}
          <div
            className="rounded-[1px] transition-all duration-100"
            style={{
              width: '4px',
              height: isBlinking ? '2px' : '10px',
              backgroundColor: displayedEyeColor,
              boxShadow: `0 0 6px ${displayedGlowColor}`,
            }}
          />

          {/* Right Solid Retro Eye (Vertical Rectangle, No Pupil) */}
          <div
            className="rounded-[1px] transition-all duration-100"
            style={{
              width: '4px',
              height: isBlinking ? '2px' : '10px',
              backgroundColor: displayedEyeColor,
              boxShadow: `0 0 6px ${displayedGlowColor}`,
            }}
          />
        </div>

        {/* Always-visible name tag so the assistant is identifiable at a glance */}
        <span
          aria-hidden="true"
          className="ml-1.5 whitespace-nowrap select-none font-mono text-[9px] font-bold uppercase leading-none tracking-[0.18em]"
          style={{
            color: displayedEyeColor,
            textShadow: `0 0 6px ${displayedGlowColor}`,
          }}
        >
          {moodLabel}
        </span>
      </div>
    </div>
  );
};
