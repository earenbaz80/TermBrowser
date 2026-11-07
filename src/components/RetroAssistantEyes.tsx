import React, { useState, useEffect, useRef } from 'react';
import { ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { Sparkles, X, Lightbulb } from 'lucide-react';

export type AssistantExpression = 'idle' | 'happy' | 'thinking' | 'alert' | 'excited' | 'sleepy';

interface RetroAssistantEyesProps {
  theme: ThemeConfig;
  lastCommand?: string;
  lastLogType?: string;
  onExecuteCommand: (cmd: string) => void;
  isVoiceActive?: boolean;
}

const ASSISTANT_TIPS = [
  '¡Hola! Soy DOSY. Escribe "home" para volver al inicio.',
  'Presiona [Ctrl+M] o pulsa el icono de micrófono para dictar comandos por voz.',
  'Usa "ir a <url>" para navegar en terminal con fotos reales.',
  'Alterna rápidamente entre pestañas con "pestaña 1" y "pestaña 2".',
  'Haz clic sobre cualquier archivo en la terminal para abrirlo o ejecutarlo.',
  'Escribe "fs workspace" para explorar el código fuente local.',
  'Ejecuta "python benchmark.py" para cálculo numérico en tiempo real.',
  'Escribe "mc" para abrir Norton Commander con teclado y ratón.',
  'Tu sesión cuenta con cifrado AES-256. Escribe "bóveda" para gestionarla.',
  'Usa Flechas Arriba y Abajo (↑↓) para recuperar comandos del historial.',
  'Escribe "top" o "monitor" para ver el uso de CPU/RAM y alertas.',
  'Escribe "notify status" o "notify on" para activar alertas del navegador.',
];

export const RetroAssistantEyes: React.FC<RetroAssistantEyesProps> = ({
  theme,
  lastCommand,
  lastLogType,
  onExecuteCommand,
  isVoiceActive = false,
}) => {
  const [expression, setExpression] = useState<AssistantExpression>('idle');
  const [isBlinking, setIsBlinking] = useState(false);
  const [showSpeechBubble, setShowSpeechBubble] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [bubbleMessage, setBubbleMessage] = useState<string>(ASSISTANT_TIPS[0]);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });

  const eyesContainerRef = useRef<HTMLDivElement>(null);

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
    setExpression('thinking');

    const timer = setTimeout(() => {
      if (lastLogType === 'stderr' || lower.includes('error')) {
        setExpression('alert');
        setBubbleMessage('¡Atención! Ese comando tuvo un detalle. Escribe "ayuda" para ver la sintaxis.');
        setShowSpeechBubble(true);
      } else if (
        lower.startsWith('goto') ||
        lower.startsWith('ir a') ||
        lower.startsWith('web') ||
        lower.startsWith('lynx')
      ) {
        setExpression('excited');
        setBubbleMessage('¡Navegando! Web cargada en terminal con imágenes reales.');
      } else if (lower.startsWith('python') || lower.startsWith('py')) {
        setExpression('happy');
        setBubbleMessage('¡Código Python ejecutado correctamente!');
      } else if (
        lower.startsWith('fs') ||
        lower === 'mc' ||
        lower === 'ls' ||
        lower === 'dir'
      ) {
        setExpression('happy');
        setBubbleMessage('Sistema de archivos local listo. ¡Haz clic para interactuar!');
      } else if (lower.startsWith('notify')) {
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
  }, [lastCommand, lastLogType]);

  const cycleNextTip = () => {
    soundEffects.playKeyClick();
    const nextIdx = (currentTipIndex + 1) % ASSISTANT_TIPS.length;
    setCurrentTipIndex(nextIdx);
    setBubbleMessage(ASSISTANT_TIPS[nextIdx]);
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

            <button
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
              onClick={() => {
                soundEffects.playKeyClick();
                onExecuteCommand('fs workspace');
                setShowSpeechBubble(false);
              }}
              className="px-1.5 py-0.5 border border-white/20 hover:border-cyan-400 text-[10px] rounded-xs cursor-pointer text-emerald-300"
            >
              [workspace]
            </button>
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

      {/* Floating Retro Eyes (No box/frame, compact vertical rectangles, pupil-less, tracking pointer) */}
      <div
        ref={eyesContainerRef}
        onClick={handleEyesClick}
        className="group relative inline-flex items-center justify-center p-0 cursor-pointer transition-transform duration-75 hover:scale-110 active:scale-95"
        title="DOSY: Asistente personal (ojos rectangulares verticales sin pupilas · siguen el cursor · clic para consejos)"
      >
        <div
          className="flex items-center gap-1 transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${pointerOffset.x}px, ${pointerOffset.y}px)`,
          }}
        >
          {/* Left Solid Retro Eye (Vertical Rectangle, No Pupil) */}
          <div
            className="rounded-[1px] transition-all duration-100"
            style={{
              width: '3px',
              height: isBlinking ? '1.5px' : '7.5px',
              backgroundColor: eyeColor,
              boxShadow: `0 0 5px ${glowColor}`,
            }}
          />

          {/* Right Solid Retro Eye (Vertical Rectangle, No Pupil) */}
          <div
            className="rounded-[1px] transition-all duration-100"
            style={{
              width: '3px',
              height: isBlinking ? '1.5px' : '7.5px',
              backgroundColor: eyeColor,
              boxShadow: `0 0 5px ${glowColor}`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
