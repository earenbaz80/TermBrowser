export type LatencyGlowTone = 'fast' | 'moderate' | 'slow' | 'unknown';

export interface LatencyGlow {
  tone: LatencyGlowTone;
  color: string;
  label: string;
}

/** Semantic glow for the boot sign: green, amber or red depending on current latency. */
export function getLatencyGlow(latencyMs?: number): LatencyGlow {
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) {
    return { tone: 'unknown', color: 'currentColor', label: 'sin datos' };
  }
  if (latencyMs <= 100) {
    return { tone: 'fast', color: '#22c55e', label: 'verde' };
  }
  if (latencyMs <= 250) {
    return { tone: 'moderate', color: '#f59e0b', label: 'ámbar' };
  }
  return { tone: 'slow', color: '#ef4444', label: 'rojo' };
}
