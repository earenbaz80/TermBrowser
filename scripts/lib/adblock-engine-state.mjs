/**
 * Lee el motor de adblock serializado para distinguir una caché sin listas de
 * una regresión del producto.
 *
 * El binario `adblock-engine.bin` es el motor de Ghostery serializado. Se puede
 * deserializar en el proceso de pruebas con la misma librería que usa la app,
 * así que no hace falta tocar el producto ni pedirle nada por IPC: basta con
 * contar los filtros que quedaron guardados.
 *
 * Un motor sano con las listas de anuncios y rastreo trae del orden de 120.000
 * filtros de red y 36.000 cosméticos (medido el 14 de noviembre de 2026 con
 * `fromPrebuiltAdsAndTracking`). Los mínimos de aquí están tres órdenes de
 * magnitud por debajo: no buscan medir la lista, solo detectar que no hay nada
 * o que quedó a medias.
 */
import fs from 'node:fs';
import { FiltersEngine } from '@ghostery/adblocker';

export const ENGINE_MINIMUMS = { network: 1000, cosmetic: 1000 };

/**
 * @returns {{
 *   exists: boolean,
 *   bytes: number,
 *   filters: { network: number, cosmetic: number } | null,
 *   healthy: boolean,
 *   reason: string | null,
 * }}
 */
export function readEngineState(file) {
  if (!fs.existsSync(file)) {
    return { exists: false, bytes: 0, filters: null, healthy: false, reason: 'sin caché del motor' };
  }

  const bytes = fs.statSync(file).size;

  try {
    const engine = FiltersEngine.deserialize(fs.readFileSync(file));
    const { networkFilters, cosmeticFilters } = engine.getFilters();
    const filters = { network: networkFilters.length, cosmetic: cosmeticFilters.length };

    if (filters.network < ENGINE_MINIMUMS.network || filters.cosmetic < ENGINE_MINIMUMS.cosmetic) {
      return {
        exists: true,
        bytes,
        filters,
        healthy: false,
        reason: `listas vacías o incompletas: ${filters.network} filtros de red y ${filters.cosmetic} cosméticos (mínimos ${ENGINE_MINIMUMS.network}/${ENGINE_MINIMUMS.cosmetic})`,
      };
    }

    return { exists: true, bytes, filters, healthy: true, reason: null };
  } catch (error) {
    // El motor lleva una suma de comprobación al final: un fichero truncado o
    // escrito a medias no deserializa, que es justo lo que queremos detectar.
    return {
      exists: true,
      bytes,
      filters: null,
      healthy: false,
      reason: `caché ilegible: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** True cuando la caché no puede explicar un fallo de cosméticos. */
export function isEngineUnusable(state) {
  return state.healthy !== true;
}
