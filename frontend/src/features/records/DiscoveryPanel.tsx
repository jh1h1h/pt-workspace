import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import type { Page } from '../../api/types';
import { methods, type Classification } from '../../api/recordTypes';
import { recordApi, recordKeys } from '../../api/records';
import { usePages, useRefresh } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../../components/Feedback';
import { RichEditor } from '../../editor/RichEditor';
import { saves } from '../../hooks/saveCoordinator';
export function DiscoveryPanel({
  page
}: {
  page: Page;
}) {
  const query = useQuery({
    queryKey: recordKeys.list(page.engagement_id, 'observation', {
      surface_id: page.id
    }),
    queryFn: () => recordApi.all(page.engagement_id, 'observation', {
      surface_id: page.id
    })
  });
  const [add, setAdd] = useState(false);
  return <section className="discovery-panel" aria-label="Discovery observations"><div className="panel-heading"><h2>Discovery observations</h2><Button size="sm" variant="outline" onClick={() => setAdd(true)}>Add discovery observation</Button></div><p className="section-caption">Each classification is historical provenance, not a claim of security or testing authorization.</p>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : query.data.length ? <ul className="observations">{query.data.map(p => p.record?.kind === 'observation' ? <li key={p.id}><span className={`status-pill classification-${p.record.classification.toLowerCase()}`}>{p.record.classification}</span><div><Link to={`/e/${page.engagement_id}/pages/${p.id}`}>{p.title}</Link><p>{p.record.discovery_source} · {p.record.source_reference || 'No source reference'} · {p.record.observed_method ?? 'Method not recorded'}</p><p>{p.record.relevant_role ?? 'Role not specified'} · {p.record.authentication_context ?? 'Authentication context not specified'}</p><small>{new Date(p.record.observed_at).toLocaleString()} · {p.record.confidence_note}</small></div></li> : null)}</ul> : <Empty>No observations recorded. Add observed, advertised or inferred provenance.</Empty>}{add ? <ObservationDialog page={page} onClose={() => setAdd(false)} /> : null}</section>;
}
export function ObservationDialog({
  page,
  onClose
}: {
  page: Page;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [classification, setClassification] = useState<Classification>('Inferred');
  const [source, setSource] = useState('');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [role, setRole] = useState('');
  const [auth, setAuth] = useState('');
  const [confidence, setConfidence] = useState('');
  const [evidence, setEvidence] = useState('');
  const [content, setContent] = useState<JSONContent>({
    type: 'doc',
    content: [{
      type: 'paragraph'
    }]
  });
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const pages = usePages(page.engagement_id);
  const refresh = useRefresh(page.engagement_id);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saves.flush();
      await recordApi.create(page.engagement_id, 'observation', {
        title: title.trim(),
        surface_id: page.id,
        classification,
        discovery_source: source.trim(),
        source_reference: reference,
        observed_method: method as typeof methods[number] || null,
        ...(timestamp ? {
          observed_at: new Date(timestamp).toISOString()
        } : {}),
        relevant_role: role || null,
        authentication_context: auth || null,
        confidence_note: confidence,
        evidence_id: evidence || null,
        content
      });
      await refresh();
      onClose();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return <div className="dialog-backdrop"><div role="dialog" aria-modal="true" aria-label="Add discovery observation" className="dialog observation-dialog"><h2>Add discovery observation</h2><form onSubmit={e => void submit(e)}><label>Title<input autoFocus aria-label="Observation title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={300} /></label><div className="properties-grid"><label>Classification<select aria-label="Observation classification" value={classification} onChange={e => setClassification(e.target.value as Classification)}>{['Observed', 'Advertised', 'Inferred'].map(c => <option key={c}>{c}</option>)}</select></label><label>Discovery source<input aria-label="Discovery source" value={source} placeholder="browser, Burp, JavaScript, OpenAPI…" onChange={e => setSource(e.target.value)} required maxLength={300} /></label><label>Source reference<input aria-label="Observation source reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={2000} /></label><label>Observed method<select aria-label="Observed method" value={method} onChange={e => setMethod(e.target.value)}><option value="">Not recorded</option>{methods.map(m => <option key={m}>{m}</option>)}</select></label><label>Timestamp (optional)<input aria-label="Observation timestamp" type="datetime-local" value={timestamp} onChange={e => setTimestamp(e.target.value)} /></label><label>Relevant role<input aria-label="Observation role" value={role} onChange={e => setRole(e.target.value)} maxLength={300} /></label><label>Authentication context<input aria-label="Observation authentication context" value={auth} onChange={e => setAuth(e.target.value)} maxLength={300} /></label><label>Evidence reference<select aria-label="Observation evidence" value={evidence} onChange={e => setEvidence(e.target.value)}><option value="">None</option>{pages.data?.filter(p => p.record?.kind === 'evidence').map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div><label>Confidence / verification note<textarea aria-label="Observation confidence note" value={confidence} onChange={e => setConfidence(e.target.value)} maxLength={20000} /></label><p>Description</p><RichEditor content={content} onChange={setContent} label="Observation description" />{error ? <ErrorMessage error={error} /> : null}<div className="dialog-actions"><Button disabled={busy || !title.trim() || !source.trim()}>Add observation</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div></form></div></div>;
}
