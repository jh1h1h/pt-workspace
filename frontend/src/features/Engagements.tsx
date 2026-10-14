import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys } from '../api/queries';
import { Button } from '../components/ui/button';
import { Loading, ErrorMessage } from '../components/Feedback';
export function Engagements() {
  const query = useQuery({
    queryKey: keys.engagements,
    queryFn: api.engagements
  });
  const archived = useQuery({
    queryKey: ['deleted-engagements'],
    queryFn: api.deletedEngagements
  });
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  return <main className="engagement-start"><div className="brand-mark">V</div><p className="eyebrow">LOCAL · PERSONAL · FOCUSED</p><h1>VAPT Workspace</h1><p className="subtitle">Your notes, tasks, and testing knowledge.<br />Start with an engagement. Everything stays on your machine.</p>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : <ul className="engagement-list">{query.data.map(e => <li key={e.id}><Link to={`/e/${e.id}/home`}>{e.name} <span>Open workspace →</span></Link></li>)}</ul>}<form onSubmit={e => {
      e.preventDefault();
      setBusy(true);
      void api.createEngagement(name.trim()).then(async engagement => {
        await client.invalidateQueries({
          queryKey: keys.engagements
        });
        await navigate(`/e/${engagement.id}/home`);
      }).catch(setError).finally(() => setBusy(false));
    }}><label htmlFor="new-engagement">Create an engagement</label><div className="inline-form"><input id="new-engagement" aria-label="New engagement name" placeholder="Engagement name" value={name} onChange={e => setName(e.target.value)} required maxLength={200} /><Button disabled={busy || !name.trim()}>Create engagement</Button></div></form>{error ? <ErrorMessage error={error} /> : null}{archived.data?.length ? <section><h2>Archived engagements</h2>{archived.data.map(e => <div className="trash-row" key={e.id}>{e.name}<Button variant="outline" onClick={() => void api.restoreEngagement(e.id).then(async () => {
          await client.invalidateQueries({
            queryKey: keys.engagements
          });
          await client.invalidateQueries({
            queryKey: ['deleted-engagements']
          });
        }).catch(setError)}>Restore {e.name}</Button></div>)}</section> : null}</main>;
}
