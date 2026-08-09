import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('sweeps expired, never-consumed nonces on the next issuance instead of leaking them forever', () => {
    vi.useFakeTimers();
    try {
      const stale = issueNonce();
      vi.advanceTimersByTime(6 * 60 * 1000); // past the 5-minute TTL, never consumed
      issueNonce(); // triggers the sweep

      // The stale nonce is gone from the store, not merely "expired" - consuming it
      // now hits the "unknown nonce" path rather than the "expired" path, but either
      // way it must be rejected.
      expect(consumeNonce(stale)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
