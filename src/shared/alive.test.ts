import { afterEach, describe, expect, it, vi } from 'vitest';
import { extensionAlive, sendSafe } from './alive';

afterEach(() => vi.unstubAllGlobals());

describe('after the extension is reloaded', () => {
  it('sends nothing and throws nothing', async () => {
    const sendMessage = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    expect(extensionAlive()).toBe(false);
    await expect(sendSafe({ type: 'x' })).resolves.toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('survives a call that throws while the id is still there', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: () => { throw new Error('Extension context invalidated.'); } } });
    await expect(sendSafe({ type: 'x' })).resolves.toBeNull();
  });

  it('passes answers through while running', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: vi.fn(async () => ({ ok: true })) } });
    expect(extensionAlive()).toBe(true);
    await expect(sendSafe({ type: 'x' })).resolves.toEqual({ ok: true });
  });
});
