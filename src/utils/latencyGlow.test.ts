import { describe, expect, it } from 'vitest';
import { getLatencyGlow } from './latencyGlow';

describe('getLatencyGlow', () => {
  it('returns the neutral fallback without a finite latency', () => {
    expect(getLatencyGlow()).toMatchObject({ tone: 'unknown', color: 'currentColor' });
    expect(getLatencyGlow(Number.NaN)).toMatchObject({ tone: 'unknown', color: 'currentColor' });
  });

  it('uses green for low latency', () => {
    expect(getLatencyGlow(18)).toMatchObject({ tone: 'fast', color: '#22c55e' });
    expect(getLatencyGlow(100).tone).toBe('fast');
  });

  it('uses amber for medium latency', () => {
    expect(getLatencyGlow(101)).toMatchObject({ tone: 'moderate', color: '#f59e0b' });
    expect(getLatencyGlow(250).tone).toBe('moderate');
  });

  it('uses red for high latency', () => {
    expect(getLatencyGlow(251)).toMatchObject({ tone: 'slow', color: '#ef4444' });
    expect(getLatencyGlow(380).tone).toBe('slow');
  });
});
