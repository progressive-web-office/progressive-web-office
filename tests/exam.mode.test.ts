import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedUrl, checkCode, endExam, inExam, installExamGuards, loadExam, logEvent, startExam } from '../src/exam/mode';

afterEach(() => localStorage.removeItem('pwo.exam'));

describe('TEACH-005 exam mode', () => {
  it('starts with a code kept hashed, logs, and ends only with that code', async () => {
    expect(inExam()).toBe(false);
    await startExam('2468', 'Maths', 1000);
    expect(inExam()).toBe(true);
    const s = loadExam()!;
    expect(s.title).toBe('Maths');
    expect(JSON.stringify(s)).not.toContain('2468');
    expect(await checkCode('1357')).toBe(false);
    expect(await checkCode('2468')).toBe(true);
    logEvent('blur', undefined, 5000);
    logEvent('blur', undefined, 5500); // the same within a second: once
    logEvent('hidden', undefined, 6000);
    const log = endExam();
    expect(log.map((e) => e.kind)).toEqual(['start', 'wrong-code', 'blur', 'hidden']);
    expect(inExam()).toBe(false);
  });

  it('allows only the application itself on the network', () => {
    const base = 'https://example.org/app/';
    expect(allowedUrl('assets/x.js', base)).toBe(true);
    expect(allowedUrl('https://example.org/other', base)).toBe(true);
    expect(allowedUrl('blob:https://example.org/1234', base)).toBe(true);
    expect(allowedUrl('https://cdn.jsdelivr.net/x', base)).toBe(false);
    expect(allowedUrl('wss://relay.example', base)).toBe(false);
  });

  it('refuses connections elsewhere and pastes from outside once installed', async () => {
    await startExam('2468');
    const realFetch = vi.fn(async () => new Response('ok'));
    const saved = { fetch: window.fetch, WebSocket: window.WebSocket };
    window.fetch = realFetch as unknown as typeof fetch;
    const told: string[] = [];
    installExamGuards((k) => told.push(k));
    await expect(fetch('https://api.anthropic.com/v1')).rejects.toThrow(/no network/);
    await expect(fetch('/app/icon.svg')).resolves.toBeInstanceOf(Response);
    expect(() => new WebSocket('wss://relay.example')).toThrow(/no network/);
    // A paste of text never copied here is stopped before the editors see it.
    const target = document.createElement('div');
    document.body.append(target);
    const seen = vi.fn();
    target.addEventListener('paste', seen);
    const paste = (text: string): void => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(e, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : ''), files: [] } });
      target.dispatchEvent(e);
    };
    paste('from the web');
    expect(seen).not.toHaveBeenCalled();
    // Copied in the application: pasted.
    const copy = new Event('copy', { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(copy, 'clipboardData', { value: { getData: () => 'my own  answer' } });
    target.dispatchEvent(copy);
    paste('my own answer');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(told).toEqual(['network-blocked', 'network-blocked', 'paste-blocked']);
    expect(loadExam()!.log.map((e) => e.kind)).toContain('paste-blocked');
    Object.assign(window, saved);
  });
});
