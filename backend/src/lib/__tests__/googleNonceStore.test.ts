import { describe, expect, it } from 'vitest';
import { issueNonce, consumeNonce } from '../googleNonceStore';

describe('googleNonceStore', () => {
  it('consumes a freshly issued nonce exactly once', () => {
    const nonce = issueNonce();
    expect(consumeNonce(nonce)).toBe(true);
    expect(consumeNonce(nonce)).toBe(false);
  });

  it('rejects an unknown nonce', () => {
    expect(consumeNonce('not-a-real-nonce')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(consumeNonce(undefined)).toBe(false);
  });

  it('issues distinct values on each call', () => {
    const a = issueNonce();
    const b = issueNonce();
    expect(a).not.toBe(b);
  });
});
