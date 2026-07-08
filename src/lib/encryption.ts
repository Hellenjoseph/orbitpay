/**
 * End-to-End Encryption Utilities for StellarWhisper.
 * Uses the browser's Web Crypto API to derive keys and perform AES-GCM encryption.
 */

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives a CryptoKey from the user's wallet signature.
 * The signature acts as a high-entropy seed.
 */
export async function deriveMasterKey(signature: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const signatureBytes = enc.encode(signature);
  
  // Hash the signature to get a consistent 256-bit seed
  const hash = await window.crypto.subtle.digest('SHA-256', signatureBytes as any);
  
  // Import hash as raw key material
  return window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random 256-bit AES key for a chat room.
 */
export function generateRoomKey(): Uint8Array {
  const key = new Uint8Array(32);
  window.crypto.getRandomValues(key);
  return key;
}

/**
 * Encrypts a room key using the user's master key.
 * Returns a Base64 string containing both the IV and the ciphertext.
 */
export async function encryptRoomKey(roomKey: Uint8Array, masterKey: CryptoKey): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    roomKey as any
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bufferToBase64(combined.buffer);
}

/**
 * Decrypts a room key using the user's master key.
 */
export async function decryptRoomKey(encryptedRoomKeyBase64: string, masterKey: CryptoKey): Promise<Uint8Array> {
  const combined = new Uint8Array(base64ToBuffer(encryptedRoomKeyBase64));
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    ciphertext as any
  );

  return new Uint8Array(decrypted);
}

/**
 * Encrypts a message using a room key.
 */
export async function encryptMessage(text: string, roomKey: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const messageBytes = enc.encode(text);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // Import the raw room key
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    roomKey as any,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    messageBytes as any
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bufferToBase64(combined.buffer);
}

/**
 * Decrypts a message using a room key.
 */
export async function decryptMessage(encryptedText: string, roomKey: Uint8Array): Promise<string> {
  try {
    const combined = new Uint8Array(base64ToBuffer(encryptedText));
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Import the raw room key
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      roomKey as any,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext as any
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    return '🔒 [Decryption Failed: Private Key or Signature mismatch]';
  }
}
