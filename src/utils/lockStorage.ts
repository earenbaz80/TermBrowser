/**
 * Local password gate. The password never leaves the machine: a salted, iterated
 * SHA-256 digest is stored in localStorage and compared on unlock.
 */
import { computeSHA256 } from './crypto';

export const LOCK_STORAGE_KEY = 'terminus.lock.v1';
export const MIN_LOCK_PASSWORD_LENGTH = 8;
const ITERATIONS = 5000;

export interface LockRecord {
  salt: string;
  hash: string;
  iterations: number;
  updatedAt: number;
}

const randomSalt = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const derive = async (password: string, salt: string, iterations: number): Promise<string> => {
  let hash = await computeSHA256(`${salt}:${password}`);
  for (let index = 1; index < iterations; index += 1) {
    hash = await computeSHA256(`${hash}:${salt}`);
  }
  return hash;
};

export function loadLockRecord(): LockRecord | null {
  try {
    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof parsed?.salt !== 'string' || typeof parsed?.hash !== 'string') return null;
    const iterations =
      typeof parsed.iterations === 'number' && Number.isFinite(parsed.iterations) && parsed.iterations > 0
        ? parsed.iterations
        : ITERATIONS;
    return {
      salt: parsed.salt,
      hash: parsed.hash,
      iterations,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export const hasLockPassword = (): boolean => loadLockRecord() !== null;

export async function setLockPassword(password: string): Promise<LockRecord> {
  if (password.length < MIN_LOCK_PASSWORD_LENGTH) {
    throw new Error('password-too-short');
  }
  const salt = randomSalt();
  const hash = await derive(password, salt, ITERATIONS);
  const record: LockRecord = { salt, hash, iterations: ITERATIONS, updatedAt: Date.now() };
  localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export async function verifyLockPassword(password: string): Promise<boolean> {
  const record = loadLockRecord();
  if (!record) return true;
  const hash = await derive(password, record.salt, record.iterations);
  return hash === record.hash;
}

export function clearLockPassword(): void {
  localStorage.removeItem(LOCK_STORAGE_KEY);
}
