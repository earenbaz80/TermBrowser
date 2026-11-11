import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('coincide con la versión de package.json', () => {
    // Vitest ejecuta desde la raíz del repositorio; jsdom no expone un import.meta.url de tipo file:.
    const packagePath = path.resolve(process.cwd(), 'package.json');
    const { version } = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(version);
  });

  it('es un semver sin prefijo', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
