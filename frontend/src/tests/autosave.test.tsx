import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { useAutosave } from '../hooks/useAutosave';
import { api, ApiError } from '../api/client';
import { page } from './fixtures';
import type { Page } from '../api/types';
function wrapper({
  children
}: {
  children: ReactNode;
}) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.restoreAllMocks());
it('serializes overlapping saves and retains edits typed during a response', async () => {
  const p = page();
  let resolve!: (p: Page) => void;
  const first = new Promise<Page>(r => {
    resolve = r;
  });
  const patch = vi.spyOn(api, 'patch').mockImplementationOnce(() => first).mockImplementation(async (p, changes) => ({
    ...p,
    ...changes,
    revision: p.revision + 1
  }));
  const {
    result
  } = renderHook(() => useAutosave(p), {
    wrapper
  });
  let flushing!: Promise<void>;
  act(() => {
    result.current.change({
      title: 'First'
    });
    flushing = result.current.flush();
  });
  act(() => result.current.change({
    title: 'Second'
  }));
  await act(async () => {
    resolve({
      ...p,
      title: 'First',
      revision: 2
    });
    await flushing;
  });
  expect(patch).toHaveBeenCalledTimes(2);
  expect(patch.mock.calls[1][0].revision).toBe(2);
  expect(patch.mock.calls[1][1]).toEqual({
    title: 'Second'
  });
  expect(result.current.status).toBe('Saved');
});
it('retains failed changes and retries without replacing editor content', async () => {
  const p = page();
  const patch = vi.spyOn(api, 'patch').mockRejectedValueOnce(new ApiError(500, 'Disk error')).mockImplementation(async (p, changes) => ({
    ...p,
    ...changes,
    revision: p.revision + 1
  }));
  const {
    result
  } = renderHook(() => useAutosave(p), {
    wrapper
  });
  act(() => result.current.change({
    title: 'Retained'
  }));
  await act(async () => {
    await result.current.flush().catch(() => {});
  });
  expect(result.current.status).toBe('Save Failed');
  expect(result.current.error).toBe('Disk error');
  await act(async () => {
    await result.current.flush();
  });
  expect(patch.mock.calls[1][1]).toEqual({
    title: 'Retained'
  });
  expect(result.current.status).toBe('Saved');
});
it('unchanged structured documents do not trigger unnecessary writes', async () => {
  const p = page();
  const patch = vi.spyOn(api, 'patch');
  const {
    result
  } = renderHook(() => useAutosave(p), {
    wrapper
  });
  act(() => result.current.change({
    content: JSON.parse(JSON.stringify(p.content))
  }));
  await act(async () => {
    await result.current.flush();
  });
  expect(patch).not.toHaveBeenCalled();
});
it('revision conflict retains pending edits until explicit review and overwrite', async () => {
  const p = page();
  const remote = {
    ...p,
    title: 'Remote',
    revision: 9
  };
  vi.spyOn(api, 'page').mockResolvedValue(remote);
  const patch = vi.spyOn(api, 'patch').mockRejectedValueOnce(new ApiError(409, 'Revision conflict')).mockImplementation(async (p, changes) => ({
    ...p,
    ...changes,
    revision: p.revision + 1
  }));
  const {
    result
  } = renderHook(() => useAutosave(p), {
    wrapper
  });
  act(() => result.current.change({
    title: 'Mine'
  }));
  await act(async () => {
    await result.current.flush().catch(() => {});
  });
  expect(result.current.status).toBe('Save Failed');
  await act(async () => {
    await result.current.review();
  });
  expect(result.current.latest?.revision).toBe(9);
  await act(async () => {
    await result.current.overwrite();
  });
  expect(patch.mock.calls[1][0].revision).toBe(9);
  expect(patch.mock.calls[1][1]).toEqual({
    title: 'Mine'
  });
  await waitFor(() => expect(result.current.status).toBe('Saved'));
});
