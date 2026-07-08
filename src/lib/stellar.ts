import { Keypair } from '@stellar/stellar-sdk';

/**
 * Generates a random authentication challenge (nonce).
 */
export function generateChallengeNonce(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Node.js environment
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }
}

/**
 * Verifies a Stellar public key signature.
 * @param publicKey The Stellar public key (starting with 'G')
 * @param challenge The challenge string that was signed
 * @param signatureBase64 The base64-encoded signature
 */
export function verifyStellarSignature(
  publicKey: string,
  challenge: string,
  signatureBase64: string
): boolean {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    const messageBuffer = Buffer.from(challenge, 'utf-8');
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch (error) {
    console.error('Stellar signature verification error:', error);
    return false;
  }
}
