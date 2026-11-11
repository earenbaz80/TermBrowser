/**
 * Remember the last native folder mounted with the File System Access API.
 *
 * Directory handles can be structured-cloned into IndexedDB, but their
 * permissions may need to be queried or renewed after a page reload. The handle
 * is never serialized to localStorage because that would lose the native
 * reference.
 */

export type NativeMountPermission = 'granted' | 'prompt' | 'denied';

export interface LastNativeMount {
  handle: any;
  name: string;
  mountPath: string;
  mountedAt: string;
}

const DB_NAME = 'termbrowser-local-mount';
const DB_VERSION = 1;
const STORE_NAME = 'mounts';
const RECORD_KEY = 'last';

const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir el almacenamiento de carpetas locales.'));
    request.onblocked = () =>
      reject(new Error('El almacenamiento de carpetas locales está bloqueado por otra pestaña.'));
  });
}

/** Save the latest native mount so the next page load can offer it again. */
export async function saveLastNativeMount(
  record: Omit<LastNativeMount, 'mountedAt'> & { mountedAt?: string }
): Promise<void> {
  if (!hasIndexedDb()) return;

  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(
        {
          ...record,
          mountedAt: record.mountedAt ?? new Date().toISOString(),
        },
        RECORD_KEY
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('No se pudo recordar la carpeta local.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('No se pudo recordar la carpeta local.'));
    });
  } finally {
    db.close();
  }
}

/** Read the remembered mount. Unsupported or corrupt storage simply returns null. */
export async function loadLastNativeMount(): Promise<LastNativeMount | null> {
  if (!hasIndexedDb()) return null;

  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const record = await new Promise<any>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('No se pudo leer la carpeta local recordada.'));
    });

    if (
      !record ||
      !record.handle ||
      record.handle.kind !== 'directory' ||
      typeof record.name !== 'string' ||
      typeof record.mountPath !== 'string'
    ) {
      return null;
    }

    return {
      handle: record.handle,
      name: record.name,
      mountPath: record.mountPath,
      mountedAt: typeof record.mountedAt === 'string' ? record.mountedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** Forget the remembered mount, for example after the folder disappears. */
export async function clearLastNativeMount(): Promise<void> {
  if (!hasIndexedDb()) return;

  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('No se pudo olvidar la carpeta local.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('No se pudo olvidar la carpeta local.'));
    });
  } finally {
    db?.close();
  }
}

function normalizePermission(value: unknown): NativeMountPermission {
  return value === 'granted' || value === 'denied' || value === 'prompt' ? value : 'prompt';
}

/** Check whether the browser still allows read/write access without another gesture. */
export async function queryNativeMountPermission(handle: any): Promise<NativeMountPermission> {
  if (!handle) return 'denied';
  if (typeof handle.queryPermission !== 'function') return 'granted';

  try {
    return normalizePermission(await handle.queryPermission({ mode: 'readwrite' }));
  } catch {
    return 'prompt';
  }
}

/** Ask for permission again. Call this only from a user gesture. */
export async function requestNativeMountPermission(handle: any): Promise<NativeMountPermission> {
  if (!handle) return 'denied';
  if (typeof handle.requestPermission !== 'function') {
    return queryNativeMountPermission(handle);
  }

  try {
    return normalizePermission(await handle.requestPermission({ mode: 'readwrite' }));
  } catch {
    return 'denied';
  }
}
