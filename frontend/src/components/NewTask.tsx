import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Priority } from '../api/types';
import { useRefresh } from '../api/queries';
import { Button } from './ui/button';
import { ErrorMessage } from './Feedback';
export function NewTask({
  eid,
  modal = false
}: {
  eid: string;
  modal?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('P2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [open, setOpen] = useState(false);
  const refresh = useRefresh(eid);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createTask(eid, title.trim(), priority);
      setTitle('');
      setOpen(false);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const form = <form className="inline-form" onSubmit={e => void submit(e)}><input autoFocus={modal} aria-label="New personal task" placeholder="Add a personal task…" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} required /><select aria-label="New task priority" value={priority} onChange={e => setPriority(e.target.value as Priority)}>{['P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}</select><Button variant="outline" size="sm" disabled={busy}>Add task</Button></form>;
  if (!modal) return <>{form}{error ? <ErrorMessage error={error} /> : null}</>;
  return <><Button aria-label="Add task" variant="ghost" size="sm" onClick={() => setOpen(true)}>+ Add task</Button>{open ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Add personal task"><h2>Add personal task</h2>{form}{error ? <ErrorMessage error={error} /> : null}<Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div></div> : null}</>;
}
