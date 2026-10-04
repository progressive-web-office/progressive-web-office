import { afterEach, describe, expect, it, vi } from 'vitest';
import { relayFallback } from '../src/devsync/live';

describe('DEVSYNC-002 the relays when no device is reached directly', () => {
  afterEach(() => vi.useRealTimers());
  const transport = () => {
    let join: (id: string) => void = () => {};
    let mode: 'direct' | 'relays' = 'direct';
    const useRelays = vi.fn(async () => void (mode = 'relays'));
    return { room: { onPeerJoin: (fn: (id: string) => void) => void (join = fn) }, useRelays, mode: () => mode, join: (id: string) => join(id) };
  };

  it('goes through the relays after a while without anybody', () => {
    vi.useFakeTimers();
    const t = transport();
    relayFallback(t, 10);
    vi.advanceTimersByTime(9_000);
    expect(t.useRelays).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(t.useRelays).toHaveBeenCalledOnce();
  });

  it('stays direct when a device was reached, or when stopped', () => {
    vi.useFakeTimers();
    const reached = transport();
    relayFallback(reached, 10);
    reached.join('peer');
    const stopped = transport();
    relayFallback(stopped, 10)();
    vi.advanceTimersByTime(20_000);
    expect(reached.useRelays).not.toHaveBeenCalled();
    expect(stopped.useRelays).not.toHaveBeenCalled();
  });
});
