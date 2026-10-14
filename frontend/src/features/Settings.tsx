import { TemplateSettings } from './records/TemplateSettings';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useRefresh } from '../api/queries';
import { Button } from '../components/ui/button';
import { ErrorMessage, Empty } from '../components/Feedback';
export function Settings() {
  const {
    eid = ''
  } = useParams();
  const client = useQueryClient();
  const navigate = useNavigate();
  const engagements = useQuery({
    queryKey: keys.engagements,
    queryFn: api.engagements
  });
  const deletedEngagements = useQuery({
    queryKey: ['deleted-engagements'],
    queryFn: api.deletedEngagements
  });
  const trash = useQuery({
    queryKey: ['workspace', eid, 'trash'],
    queryFn: () => api.pages(eid, '', true)
  });
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>();
  const [confirm, setConfirm] = useState(false);
  const refresh = useRefresh(eid);
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
      await refresh();
      await client.invalidateQueries({
        queryKey: keys.engagements
      });
      await client.invalidateQueries({
        queryKey: ['deleted-engagements']
      });
    } catch (e) {
      setError(e);
    }
  }
  return <div className="document-width"><h1>Settings & Templates</h1><section><h2>Engagement</h2><p>Current: {engagements.data?.find(e => e.id === eid)?.name}</p><form className="inline-form" onSubmit={e => {
        e.preventDefault();
        void run(() => api.renameEngagement(eid, name));
      }}><input aria-label="Engagement name" placeholder="New engagement name" value={name} onChange={e => setName(e.target.value)} maxLength={200} required /><Button variant="outline">Rename</Button></form><Button variant="destructive" onClick={() => setConfirm(true)}>Archive engagement</Button>{confirm ? <div role="dialog" aria-label="Archive engagement"><p>Archive this engagement and hide its workspace? All data remains recoverable.</p><Button variant="destructive" onClick={() => void run(async () => {
          await api.deleteEngagement(eid);
          await navigate('/');
        })}>Confirm archive</Button><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button></div> : null}</section><section><h2>Trash</h2><p>Restoring a page does not move its children back automatically.</p>{trash.error ? <ErrorMessage error={trash.error} /> : trash.data?.length ? trash.data.map(p => <div className="trash-row" key={p.id}><span>{p.title} · {p.display_id}</span><Button variant="outline" size="sm" onClick={() => void run(() => api.restorePage(eid, p.id))}>Restore {p.title}</Button></div>) : <Empty>No deleted pages.</Empty>}</section><section><h2>Archived engagements</h2>{deletedEngagements.data?.map(e => <div className="trash-row" key={e.id}>{e.name}<Button variant="outline" size="sm" onClick={() => void run(() => api.restoreEngagement(e.id))}>Restore engagement</Button></div>)}</section><TemplateSettings eid={eid} /><section><h2>Advanced customization</h2><p className="muted">Custom properties and saved views are planned for Phase 3.</p></section>{error ? <ErrorMessage error={error} /> : null}</div>;
}
