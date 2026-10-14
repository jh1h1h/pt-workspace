import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Page } from '../../api/types';
import type { BacklogStatus } from '../../api/recordTypes';
import { recordApi, recordKeys } from '../../api/records';
import { useRefresh } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../../components/Feedback';
import { BlockReasonDialog } from './BlockReasonDialog';
import { backlogStatuses } from './config';
export function BacklogKanban({
  eid,
  onCreate
}: {
  eid: string;
  onCreate: () => void;
}) {
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<Page | null>(null);
  const refresh = useRefresh(eid);
  const params = {
    q,
    ...(priority ? {
      priority
    } : {}),
    ...(status ? {
      status
    } : {}),
    view: 'kanban'
  };
  const query = useQuery({
    queryKey: recordKeys.list(eid, 'backlog', params),
    queryFn: () => recordApi.all(eid, 'backlog', params)
  });
  async function move(page: Page, next: BacklogStatus, reason?: string) {
    if (page.record?.kind !== 'backlog' || page.record.status === next) return;
    if (next === 'Blocked' && !page.record.blocker_reason && !reason) {
      setBlocked(page);
      return;
    }
    setBusy(true);
    try {
      await recordApi.patch(page, {
        status: next,
        ...(reason ? {
          blocker_reason: reason
        } : {})
      });
      setError(null);
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return <div className="record-database"><div className="database-toolbar"><input aria-label="Search backlog" placeholder="Search backlog…" value={q} onChange={e => setQ(e.target.value)} /><select aria-label="Kanban priority filter" value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{['P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}</select><select aria-label="Kanban status filter" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{backlogStatuses.map(s => <option key={s}>{s}</option>)}</select><Button size="sm" onClick={onCreate}>Create backlog item</Button></div><p className="section-caption">Drag a card to change status. Keyboard users can use its status selector.</p>{error ? <ErrorMessage error={error} /> : null}{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : <div className="kanban" aria-label="Backlog Kanban">{backlogStatuses.map(column => <section key={column} className="kanban-column" role="group" aria-label={`${column} column`} onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        const page = query.data.find(p => p.id === id);
        if (page && !busy) void move(page, column);
      }}><h2>{column}</h2>{query.data.filter(p => p.record?.kind === 'backlog' && p.record.status === column).map(p => <article role="group" aria-label={`Backlog card ${p.title}`} className="kanban-card" key={p.id} draggable={!busy} onDragStart={e => {
          e.dataTransfer.setData('text/plain', p.id);
          e.dataTransfer.effectAllowed = 'move';
        }}><span className="record-id">{p.display_id} · {p.record?.kind === 'backlog' ? p.record.priority : ''}</span><Link to={`/e/${eid}/pages/${p.id}`}>{p.title}</Link><select aria-label={`Status for ${p.title}`} value={column} disabled={busy} onChange={e => void move(p, e.target.value as BacklogStatus)}>{backlogStatuses.map(s => <option key={s}>{s}</option>)}</select></article>)}</section>)}</div>}{query.data && !query.data.length ? <Empty>No backlog items match.</Empty> : null}{blocked ? <BlockReasonDialog onClose={() => setBlocked(null)} onSubmit={reason => {
      const page = blocked;
      setBlocked(null);
      void move(page, 'Blocked', reason);
    }} /> : null}</div>;
}
