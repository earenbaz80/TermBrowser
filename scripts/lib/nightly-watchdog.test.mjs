import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_AGE_HOURS, evaluateNightlyRuns } from './nightly-watchdog.mjs';

const NOW = Date.parse('2026-11-15T09:00:00Z');
const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

const run = (hours, overrides = {}) => ({
  id: Math.round(hours * 100),
  created_at: hoursAgo(hours),
  conclusion: 'success',
  status: 'completed',
  html_url: `https://github.com/earenbaz80/terminus/actions/runs/${Math.round(hours * 100)}`,
  ...overrides,
});

describe('watchdog del nocturno', () => {
  it('falla cuando no hay ninguna corrida programada', () => {
    const result = evaluateNightlyRuns([], { now: NOW });

    expect(result.ok).toBe(false);
    expect(result.lastRun).toBeNull();
    expect(result.reason).toMatch(/no hay ninguna corrida programada/);
    expect(result.maxAgeHours).toBe(DEFAULT_MAX_AGE_HOURS);
  });

  it('una corrida reciente mantiene la vigilancia viva', () => {
    const result = evaluateNightlyRuns([run(5)], { now: NOW });

    expect(result.ok).toBe(true);
    expect(result.lastRun.ageHours).toBe(5);
    expect(result.reason).toContain('límite 36 h');
  });

  it('pasa del límite cuando la última es vieja', () => {
    const result = evaluateNightlyRuns([run(40)], { now: NOW });

    expect(result.ok).toBe(false);
    expect(result.lastRun.ageHours).toBe(40);
    expect(result.reason).toContain('más que el límite de 36 h');
  });

  it('acepta justo el límite y rechaza una hora más', () => {
    expect(evaluateNightlyRuns([run(36)], { now: NOW }).ok).toBe(true);
    expect(evaluateNightlyRuns([run(37)], { now: NOW }).ok).toBe(false);
  });

  it('respeta una ventana distinta pedida a mano', () => {
    expect(evaluateNightlyRuns([run(100)], { now: NOW, maxAgeHours: 120 }).ok).toBe(true);
    expect(evaluateNightlyRuns([run(100)], { now: NOW, maxAgeHours: 48 }).ok).toBe(false);
  });

  it('mira la más reciente aunque lleguen desordenadas', () => {
    const result = evaluateNightlyRuns([run(50), run(2), run(26)], { now: NOW });

    expect(result.ok).toBe(true);
    expect(result.lastRun.ageHours).toBe(2);
    expect(result.runs).toHaveLength(3);
  });

  it('cuenta una corrida fallida como cron vivo', () => {
    // El watchdog vigila que el cron dispare, no que el nocturno pase: un fallo
    // del propio E2E ya se ve como check rojo en su corrida.
    const result = evaluateNightlyRuns([run(6, { conclusion: 'failure' })], { now: NOW });

    expect(result.ok).toBe(true);
    expect(result.reason).toContain('failure');
  });

  it('ignora entradas sin fecha utilizable', () => {
    const result = evaluateNightlyRuns([{ id: 1 }, { created_at: 'no es una fecha' }, run(4)], { now: NOW });

    expect(result.ok).toBe(true);
    expect(result.runs).toHaveLength(1);
  });

  it('admite el instante actual como Date', () => {
    const result = evaluateNightlyRuns([run(10)], { now: new Date(NOW) });

    expect(result.ok).toBe(true);
    expect(result.lastRun.ageHours).toBe(10);
  });
});
