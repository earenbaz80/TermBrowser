/**
 * Web Speech Recognition Service for Terminus
 * Provides hands-free voice input, speech-to-command translation,
 * and retro CRT visualization hooks.
 */

// Declare SpeechRecognition types for cross-browser support
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => any) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: {
      new (): SpeechRecognitionInstance;
    };
    webkitSpeechRecognition?: {
      new (): SpeechRecognitionInstance;
    };
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Normalizes spoken speech into valid Terminus CLI commands
 */
export function normalizeSpokenCommand(spoken: string): string {
  const clean = spoken.trim();
  const lower = clean.toLowerCase();

  // Natural Spanish & English Voice Shortcuts
  if (/^(inicio|home|portal|ir a inicio|ir al inicio)$/i.test(lower)) {
    return 'home';
  }

  if (/^(limpiar|limpiar pantalla|borrar|borrar pantalla|cls|clear)$/i.test(lower)) {
    return 'limpiar';
  }

  if (/^(ayuda|comandos|mostrar comandos|manual|help)$/i.test(lower)) {
    return 'ayuda';
  }

  if (/^(listar|listar archivos|ver archivos|directorio|ls|dir)$/i.test(lower)) {
    return 'ls';
  }

  if (/^(workspace|espacio de trabajo|codigo local|código local|abrir workspace)$/i.test(lower)) {
    return 'fs workspace';
  }

  if (/^(mc|norton|norton commander|explorador|gestor de archivos)$/i.test(lower)) {
    return 'mc';
  }

  if (/^(top|monitor|monitor de recursos|rendimiento|ver recursos|procesos)$/i.test(lower)) {
    return 'top';
  }

  if (/^(boveda|bóveda|seguridad|mfa|estado de seguridad|vault)$/i.test(lower)) {
    return 'vault status';
  }

  if (/^(nueva pestaña|abrir pestaña|pestaña nueva|nueva pestana)$/i.test(lower)) {
    return 'pestaña nueva';
  }

  if (/^(cerrar pestaña|cerrar pestana|cerrar tab)$/i.test(lower)) {
    return 'pestaña cerrar';
  }

  if (/^(pestaña uno|pestaña 1|pestana uno|pestana 1|tab uno|tab 1)$/i.test(lower)) {
    return 'pestaña 1';
  }

  if (/^(pestaña dos|pestaña 2|pestana dos|pestana 2|tab dos|tab 2)$/i.test(lower)) {
    return 'pestaña 2';
  }

  if (/^(pestaña tres|pestaña 3|pestana tres|pestana 3|tab tres|tab 3)$/i.test(lower)) {
    return 'pestaña 3';
  }

  if (/^(ejecutar python|correr python|demo python|python)$/i.test(lower)) {
    return 'python -c "print(\'Comando de voz recibido: cálculo en Python listo\')"';
  }

  if (/^(probar alerta|probar notificacion|probar notificación|alerta)$/i.test(lower)) {
    return 'notify test script';
  }

  // Voice URL navigations: "ir a wikipedia punto org" -> "goto https://wikipedia.org"
  const navMatch = lower.match(/^(?:ir a|navegar a|abrir web|visitar)\s+(.+)$/i);
  if (navMatch && navMatch[1]) {
    let target = navMatch[1].trim();
    // replace spoken "punto" with "."
    target = target.replace(/\s+punto\s+/g, '.').replace(/\s*dot\s*/g, '.').replace(/\s+/g, '');
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }
    return `goto ${target}`;
  }

  // "buscar <algo>" -> "buscar <algo>"
  const searchMatch = lower.match(/^(?:buscar|busca|search for|google|search)\s+(.+)$/i);
  if (searchMatch && searchMatch[1]) {
    return `buscar ${searchMatch[1].trim()}`;
  }

  // Preserve arbitrary speech: browser fallback automatically conducts web search
  return clean;
}

export interface VoiceRecognitionCallbacks {
  onStart?: () => void;
  onInterim?: (interimText: string) => void;
  onFinal?: (finalText: string, normalizedCmd: string) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
}

export class VoiceRecognitionController {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening: boolean = false;
  private callbacks: VoiceRecognitionCallbacks = {};
  private language: string = 'es-ES';

  constructor(lang: string = 'es-ES') {
    this.language = lang;
  }

  public setCallbacks(cbs: VoiceRecognitionCallbacks): void {
    this.callbacks = cbs;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public start(): boolean {
    if (!isSpeechRecognitionSupported()) {
      this.callbacks.onError?.('La API de Web Speech no está disponible en este navegador.');
      return false;
    }

    if (this.isListening) {
      this.stop();
      return false;
    }

    try {
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechClass) return false;

      this.recognition = new SpeechClass();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.language;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks.onStart?.();
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalText += item[0].transcript;
          } else {
            interimText += item[0].transcript;
          }
        }

        if (interimText) {
          this.callbacks.onInterim?.(interimText);
        }

        if (finalText) {
          const normalized = normalizeSpokenCommand(finalText);
          this.callbacks.onFinal?.(finalText, normalized);
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        let errorMsg = 'Error en el reconocimiento de voz';
        if (event.error === 'not-allowed') {
          errorMsg = 'Permiso de micrófono denegado. Permita el acceso al micrófono en el navegador.';
        } else if (event.error === 'no-speech') {
          errorMsg = 'No se detectó voz. Hable claramente hacia el micrófono.';
        } else if (event.error === 'network') {
          errorMsg = 'Error de conexión en el motor de voz.';
        } else if (event.error) {
          errorMsg = `Aviso Web Speech: ${event.error}`;
        }
        this.callbacks.onError?.(errorMsg);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.callbacks.onEnd?.();
      };

      this.recognition.start();
      return true;
    } catch (err: any) {
      this.isListening = false;
      this.callbacks.onError?.(`Fallo al iniciar micrófono: ${err.message || 'Error desconocido'}`);
      return false;
    }
  }

  public stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
  }
}
