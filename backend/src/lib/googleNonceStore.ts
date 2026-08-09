import { randomUUID } from 'crypto';

const NONCE_TTL_MS = 5 * 60 * 1000;
const pending = new Map<string, number>(); // nonce -> expiresAt

export function issueNonce(): string {
  const nonce = randomUUID();
  pending.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

export function consumeNonce(nonce: string | undefined): boolean {
  if (!nonce) return false;
  const expiresAt = pending.get(nonce);
  pending.delete(nonce); // single-use regardless of outcome
  return expiresAt !== undefined && expiresAt > Date.now();
}
