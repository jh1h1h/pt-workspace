import { recordPaths } from '../api/recordTypes';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, request } from '../api/client';
import type { Page, PageChanges } from '../api/types';
import { keys } from '../api/queries';
import { saves } from './saveCoordinator';
export type SaveStatus = 'Saved' | 'Saving' | 'Unsaved' | 'Save Failed';
export function useAutosave(page: Page) {
  const client = useQueryClient();
  const base = useRef(page);
  const pending = useRef<PageChanges>({});
  const flight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('Saved');
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<Page | null>(null);
  const dirty = () => Object.keys(pending.current).length > 0 || flight.current !== null;
  // A single serialized writer; responses never replace the editor's newer local state.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = async () => {
    clearTimeout(timer.current);
    if (flight.current) {
      await flight.current;
      if (Object.keys(pending.current).length) await flushRef.current();
      return;
    }
    if (!Object.keys(pending.current).length) return;
    const work = async () => {
      while (Object.keys(pending.current).length) {
        const snapshot = {
          ...pending.current
        };
        setStatus('Saving');
        setError('');
        try {
          const saved = await api.patch(base.current, snapshot);
          base.current = saved;
          for (const key of Object.keys(snapshot) as (keyof PageChanges)[]) {
            if (JSON.stringify(pending.current[key]) === JSON.stringify(snapshot[key])) delete pending.current[key];
          }
          client.setQueryData(keys.page(saved.engagement_id, saved.id), saved);
          if (saved.page_type === 'scratchpad') client.setQueryData(keys.scratch(saved.engagement_id), saved);
        } catch (e) {
          setStatus('Save Failed');
          setError(e instanceof Error ? e.message : 'Save failed');
          throw e;
        }
      }
      setStatus('Saved');
      const eid = base.current.engagement_id;
      for (const key of [keys.pages(eid), keys.tasks(eid), ['workspace', eid, 'records'], ['workspace', eid, 'relations']]) void client.invalidateQueries({
        queryKey: key
      });
    };
    flight.current = work();
    saves.notify();
    try {
      await flight.current;
    } finally {
      flight.current = null;
      saves.notify();
    }
  };
  const change = (changes: PageChanges) => {
    for (const key of Object.keys(changes) as (keyof PageChanges)[]) {
      // During a request even a return to baseline must be saved after that request.
      if (!flight.current && JSON.stringify(changes[key]) === JSON.stringify(Reflect.get({
        ...base.current,
        ...base.current.task,
        ...base.current.record
      }, key))) delete pending.current[key];else Object.assign(pending.current, {
        [key]: changes[key]
      });
    }
    clearTimeout(timer.current);
    setStatus(Object.keys(pending.current).length ? 'Unsaved' : 'Saved');
    saves.notify();
    if (Object.keys(pending.current).length) timer.current = setTimeout(() => {
      void flushRef.current().catch(() => {});
    }, 700);
  };
  useEffect(() => {
    const cleanup = saves.register({
      dirty,
      flush: () => flushRef.current(),
      shutdown: () => {
        if (flight.current || !Object.keys(pending.current).length) return;
        const current = base.current;
        const body = JSON.stringify({
          revision: current.revision,
          ...pending.current
        });
        if (new Blob([body]).size < 60000) void request(`/engagements/${current.engagement_id}/${current.record ? recordPaths[current.record.kind] : current.task ? 'tasks' : 'pages'}/${current.id}`, {
          method: 'PATCH',
          body,
          keepalive: true
        }).catch(() => {});
      }
    });
    return () => {
      clearTimeout(timer.current);
      cleanup();
    };
    // Each editor is keyed by immutable page ID. Its writer lives for the same lifetime.
  }, []);
  useEffect(() => {
    if (!Object.keys(pending.current).length && flight.current === null && page.revision > base.current.revision) base.current = page;
  }, [page]);
  function download() {
    const blob = new Blob([JSON.stringify({
      ...base.current,
      ...pending.current
    }, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${page.display_id}-unsaved.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function review() {
    try {
      setLatest(await api.page(page.engagement_id, page.id));
    } catch (e) {
      setError(String(e));
    }
  }
  async function overwrite() {
    if (!latest) return;
    base.current = latest;
    setLatest(null);
    await flushRef.current().catch(() => {});
  }
  return {
    change,
    status,
    error,
    flush: () => flushRef.current(),
    download,
    review,
    latest,
    overwrite
  };
}
