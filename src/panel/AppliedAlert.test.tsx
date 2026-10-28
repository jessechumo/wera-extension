import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppliedAlert, appliedMessage, CLOSE_AFTER } from './AppliedAlert';

const job = { id: 4, title: 'SRE', company: 'Acme', status: 'applied' };

function fakeRuntime() {
  const sent: { type: string }[] = [];
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async (m: { type: string }) => (sent.push(m), { ok: true, value: null })) } });
  return sent;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the alert after applying', () => {
  it('says what Wera did with the application', () => {
    expect(appliedMessage({ state: 'marked', job, previous: 'saved' }).detail).toBe('SRE at Acme is now Applied in your Wera tracker.');
    expect(appliedMessage({ state: 'marked', job, previous: null, added: true }).detail).toBe('SRE at Acme was added to your Wera tracker as Applied.');
    expect(appliedMessage({ state: 'already', job }).detail).toMatch(/already in your Wera tracker/);
    expect(appliedMessage({ state: 'unknown', draft: null }).detail).toMatch(/not in Wera/);
  });

  it('counts down, then closes the tab', async () => {
    vi.useFakeTimers();
    const sent = fakeRuntime();
    render(<AppliedAlert reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={() => {}} />);
    expect(screen.getByRole('alertdialog', { name: 'Application submitted' })).toBeTruthy();
    expect(screen.getByText(`Closing this tab in ${CLOSE_AFTER} s…`)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(CLOSE_AFTER * 1000));
    expect(sent).toEqual([{ type: 'wera:tab-close' }]);
  });

  it('keeps the tab when the user stays (or presses Escape)', async () => {
    const sent = fakeRuntime();
    const onStay = vi.fn();
    render(<AppliedAlert reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={onStay} />);
    screen.getByRole('button', { name: 'Stay on this page' }).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onStay).toHaveBeenCalledTimes(2);
    expect(sent).toEqual([]);
  });
});
