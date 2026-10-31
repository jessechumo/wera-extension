import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeraApi } from '../shared/api';
import { AppliedAlert, appliedMessage, CLOSE_AFTER, CLOSE_WITH_NEXT } from './AppliedAlert';

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

const next = { id: 9, title: 'Staff SRE', company: 'Globex', fit_score: 91, url: 'https://globex.example/9', application_status: null };
const quietApi = (found: unknown = null) => ({ nextMatch: vi.fn(async () => found) }) as unknown as WeraApi;

describe('after applying, the next best match', () => {
  it('is offered, and opens in this tab', async () => {
    const sent = fakeRuntime();
    render(<AppliedAlert api={quietApi(next)} reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={() => {}} />);
    expect(await screen.findByText(/Staff SRE at Globex/)).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Open it' }).click();
      await Promise.resolve();
    });
    expect(sent).toContainEqual({ type: 'wera:open-next', jobId: 9, url: 'https://globex.example/9' });
  });

  it('gets more time before the tab closes', async () => {
    vi.useFakeTimers();
    const sent = fakeRuntime();
    render(<AppliedAlert api={quietApi(next)} reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync((CLOSE_AFTER + 1) * 1000); });
    expect(sent.some((m) => m.type === 'wera:tab-close')).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(CLOSE_WITH_NEXT * 1000); });
    expect(sent.some((m) => m.type === 'wera:tab-close')).toBe(true);
  });

  it('is left out when there is none, or Wera cannot say', async () => {
    fakeRuntime();
    const failing = { nextMatch: vi.fn(async () => { throw new Error('down'); }) } as unknown as WeraApi;
    render(<AppliedAlert api={failing} reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Open it' })).not.toBeInTheDocument();
  });
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
    render(<AppliedAlert api={quietApi()} reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={() => {}} />);
    expect(screen.getByRole('alertdialog', { name: 'Application submitted' })).toBeTruthy();
    expect(screen.getByText(`Closing this tab in ${CLOSE_AFTER} s…`)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(CLOSE_AFTER * 1000));
    expect(sent).toEqual([{ type: 'wera:tab-close' }]);
  });

  it('keeps the tab when the user stays (or presses Escape)', async () => {
    const sent = fakeRuntime();
    const onStay = vi.fn();
    render(<AppliedAlert api={quietApi()} reply={{ state: 'marked', job, previous: 'saved', close: true }} onStay={onStay} />);
    screen.getByRole('button', { name: 'Stay on this page' }).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onStay).toHaveBeenCalledTimes(2);
    expect(sent).toEqual([]);
  });
});
