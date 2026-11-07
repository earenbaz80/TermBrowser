/**
 * Cryptographic Subsystem: AES-256-GCM & MFA (TOTP)
 * Built with standard Web Crypto API (FIPS 140-2 compliant primitives)
 */

// Helper: Uint8Array <-> Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive a 256-bit AES-GCM key from password and salt using PBKDF2 (100,000 iterations)
async function deriveAESKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plain text using AES-256-GCM
 * Returns serialized package: salt.iv.ciphertext
 */
export async function encryptAES256(plainText: string, masterKey: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAESKey(masterKey, salt);

  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const saltB64 = arrayBufferToBase64(salt.buffer);
  const ivB64 = arrayBufferToBase64(iv.buffer);
  const cipherB64 = arrayBufferToBase64(cipherBuffer);

  return `${saltB64}.${ivB64}.${cipherB64}`;
}

/**
 * Decrypt ciphertext package using AES-256-GCM
 */
export async function decryptAES256(encryptedPackage: string, masterKey: string): Promise<string> {
  const parts = encryptedPackage.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato cifrado inválido. Se esperaba salt.iv.ciphertext');
  }

  const [saltB64, ivB64, cipherB64] = parts;
  const salt = new Uint8Array(base64ToArrayBuffer(saltB64));
  const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
  const cipherBuffer = base64ToArrayBuffer(cipherB64);

  const key = await deriveAESKey(masterKey, salt);
  const decBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBuffer
  );

  const dec = new TextDecoder();
  return dec.decode(decBuffer);
}

/**
 * Compute SHA-256 checksum of data string
 */
export async function computeSHA256(content: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(content));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate standard Base32 Secret for Multi-Factor Authentication
 */
export function generateMfaSecret(): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.getRandomValues(new Uint8Array(20));
  let secret = '';
  for (let i = 0; i < randomBytes.length; i++) {
    secret += charset[randomBytes[i] % charset.length];
  }
  return secret;
}

/**
 * Generate 6-digit TOTP (Time-based One-Time Password) RFC 6238
 * Using HMAC-SHA256 for browser runtime security
 */
export async function generateTOTP(secret: string, timeStepSeconds: number = 30): Promise<{ code: string; secondsRemaining: number }> {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStepSeconds);
  const secondsRemaining = timeStepSeconds - (epoch % timeStepSeconds);

  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setBigUint64(0, BigInt(counter), false);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', keyMaterial, counterBuffer);
  const sigBytes = new Uint8Array(signature);

  // Dynamic truncation
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;
  const binaryCode =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const code = (binaryCode % 1000000).toString().padStart(6, '0');
  return { code, secondsRemaining };
}

/**
 * Verify TOTP user input code (allows +/- 1 time-step window for clock drift)
 */
export async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  const cleanToken = token.trim();
  const epoch = Math.floor(Date.now() / 1000);

  for (let offset = -1; offset <= 1; offset++) {
    const counter = Math.floor(epoch / 30) + offset;
    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    view.setBigUint64(0, BigInt(counter), false);

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', keyMaterial, counterBuffer);
    const sigBytes = new Uint8Array(signature);
    const off = sigBytes[sigBytes.length - 1] & 0x0f;
    const binaryCode =
      ((sigBytes[off] & 0x7f) << 24) |
      ((sigBytes[off + 1] & 0xff) << 16) |
      ((sigBytes[off + 2] & 0xff) << 8) |
      (sigBytes[off + 3] & 0xff);

    const candidate = (binaryCode % 1000000).toString().padStart(6, '0');
    if (candidate === cleanToken) {
      return true;
    }
  }

  return false;
}
