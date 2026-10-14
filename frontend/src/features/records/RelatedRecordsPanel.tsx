import { nextRelatedKind } from './config';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Page } from '../../api/types';
import type { RelationshipType } from '../../api/recordTypes';
import { api } from '../../api/client';
import { recordApi, recordKeys } from '../../api/records';
import { useRefresh } from '../../api/queries';
import { saves } from '../../hooks/saveCoordinator';
import { Button } from '../../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../../components/Feedback';
import { CreateRecordDialog } from './CreateRecordDialog';
import { phase3Api } from '../../api/phase3';
const relationLabels: Record<RelationshipType, string> = {
  related_to: 'Related to',
  affects: 'Affects',
  assesses: 'Assesses',
  plans: 'Plans',
  supports: 'Supports',
  documents: 'Documents',
  observed_on: 'Observed on',
  depends_on: 'Depends on'
};
export function RelatedRecordsPanel({
  page
}: {
  page: Page;
}) {
  const query = useQuery({
    queryKey: recordKeys.relations(page.engagement_id, page.id),
    queryFn: () => recordApi.relationships(page.engagement_id, page.id)
  });
  const [pick, setPick] = useState(false);
  const [create, setCreate] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const refresh = useRefresh(page.engagement_id);
  const navigate = useNavigate();
  async function remove(id: string) {
    setBusy(true);
    try {
      await saves.flush();
      await recordApi.unlink(page.engagement_id, id);
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function personalTask() {
    setBusy(true);
    try {
      await saves.flush();
      const task = await api.createTask(page.engagement_id, `Follow up: ${page.title}`, 'P2', page.id);
      await refresh();
      await navigate(`/e/${page.engagement_id}/pages/${task.id}`);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return <section className="related-panel" aria-label="Linked records"><div className="panel-heading"><h2>Linked records</h2><div><Button variant="outline" size="sm" onClick={() => setPick(true)} disabled={busy}>Add links</Button><Button variant="outline" size="sm" onClick={() => setCreate(true)} disabled={busy}>Create linked record</Button><Button variant="ghost" size="sm" onClick={() => void personalTask()} disabled={busy}>Create personal task</Button></div></div>
 {error ? <ErrorMessage error={error} /> : null}{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : query.data.length ? <ul className="relationship-list">{query.data.map(relation => {
        const target = relation.direction === 'outgoing' ? relation.target : relation.source;
        return <li key={relation.id}><span className="relation-type">{relation.direction === 'incoming' ? '← ' : ''}{relationLabels[relation.relationship_type]}{relation.direction === 'outgoing' ? ' →' : ''}</span>{target.deleted ? <span className="deleted-reference">{target.title} · in trash</span> : <Link to={`/e/${page.engagement_id}/pages/${target.id}`}>{target.title}</Link>}<span className="record-id">{target.display_id} · {target.kind}</span><Button variant="ghost" size="sm" aria-label={`Remove link to ${target.title}`} disabled={busy} onClick={() => void remove(relation.id)}>×</Button></li>;
      })}</ul> : <Empty>No linked records. Add a relationship or create a linked record.</Empty>}
 <DocumentBacklinks page={page} />{pick ? <RelatedRecordPicker page={page} onClose={() => setPick(false)} /> : null}{create ? <CreateRecordDialog eid={page.engagement_id} initialKind={nextRelatedKind(page.record?.kind)} source={page} onClose={() => setCreate(false)} /> : null}</section>;
}
function DocumentBacklinks({ page }: { page: Page }) {
  const query = useQuery({ queryKey: ['workspace', page.engagement_id, 'document-backlinks', page.id], queryFn: () => phase3Api.backlinks(page.engagement_id, page.id) });
  if (!query.data?.length) return null;
  return <div className="document-backlinks"><h3>Inline backlinks</h3><ul className="relationship-list">{query.data.map(link => <li key={link.id}><span className="relation-type">{link.origin === 'mention' ? '@ mention' : '[[ page link'}</span>{link.source.deleted ? <span className="deleted-reference">{link.source.title} · in trash</span> : <Link to={`/e/${page.engagement_id}/pages/${link.source.id}`}>{link.source.title}</Link>}<span className="record-id">{link.source.display_id}</span></li>)}</ul></div>;
}
export function RelatedRecordPicker({
  page,
  onClose
}: {
  page: Page;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<RelationshipType>('related_to');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const refresh = useRefresh(page.engagement_id);
  const results = useQuery({
    queryKey: ['workspace', page.engagement_id, 'picker', search],
    queryFn: () => api.pages(page.engagement_id, search)
  });
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function submit() {
    setBusy(true);
    try {
      await saves.flush();
      await recordApi.linkMany(page.engagement_id, page.id, [...selected].map(target_id => ({
        target_id,
        relationship_type: type
      })));
      await refresh();
      onClose();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Link records" onKeyDown={e => {
      if (e.key === 'Escape' && !busy) onClose();
    }}><h2>Link records in this engagement</h2><input ref={input} aria-label="Search related records" placeholder="Search titles…" value={search} onChange={e => setSearch(e.target.value)} /><div className="filters"><select aria-label="Related record type" value={kind} onChange={e => setKind(e.target.value)}><option value="">All types</option>{['asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence', 'note', 'journal', 'task', 'scope', 'observation'].map(k => <option key={k}>{k}</option>)}</select><select aria-label="Relationship type" value={type} onChange={e => setType(e.target.value as RelationshipType)}>{Object.entries(relationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
 {results.isPending ? <Loading /> : results.error ? <ErrorMessage error={results.error} /> : <ul className="record-picker">{results.data.filter(p => p.id !== page.id && (!kind || (p.record?.kind ?? p.page_type) === kind)).map(p => <li key={p.id}><label><input type="checkbox" aria-label={`Select ${p.title}`} checked={selected.has(p.id)} onChange={e => setSelected(old => {
              const next = new Set(old);
              if (e.target.checked) next.add(p.id);else next.delete(p.id);
              return next;
            })} /><span>{p.title}<small>{p.display_id} · {p.record?.kind ?? p.page_type}</small></span></label></li>)}</ul>}
 {error ? <ErrorMessage error={error} /> : null}<div className="dialog-actions"><Button disabled={!selected.size || busy} onClick={() => void submit()}>Add selected links</Button><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div><p className="muted">Selections persist across searches. Links are stored by UUID and shown on both records.</p></div></div>;
}
