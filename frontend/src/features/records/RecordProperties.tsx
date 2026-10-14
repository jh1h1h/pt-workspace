import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page, PageChanges } from '../../api/types';
import type { RecordProperties as Properties } from '../../api/recordTypes';
import { api } from '../../api/client';
import { recordApi } from '../../api/records';
import { useRefresh } from '../../api/queries';
import type { useAutosave } from '../../hooks/useAutosave';
import { Button } from '../../components/ui/button';
import { ErrorMessage } from '../../components/Feedback';
import { configs, valueOf, displayValue } from './config';
import { PropertyInput } from './PropertyInput';
import { CustomValues } from '../phase3/CustomProperties';
export function RecordProperties({
  page,
  save
}: {
  page: Page;
  save: ReturnType<typeof useAutosave>;
}) {
  const [properties, setProperties] = useState<Properties>(page.record!);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lastRevision = useRef(page.revision);
  const refresh = useRefresh(page.engagement_id);
  useEffect(() => {
    if (page.revision > lastRevision.current && save.status === 'Saved') {
      lastRevision.current = page.revision;
      setProperties(page.record!);
    }
  }, [page, save.status]);
  async function verify() {
    setBusy(true);
    try {
      await save.flush();
      const latest = await api.page(page.engagement_id, page.id);
      const verified = await recordApi.verify(latest, note.trim());
      setProperties(verified.record!);
      setNote('');
      setError(null);
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  if (properties.kind === 'observation') return <section className="structured-properties"><h2>Discovery provenance</h2><p className="section-caption">Historical classification is retained. Add another observation for later verification; edit this observation's description below.</p><dl className="provenance">{(['classification', 'discovery_source', 'source_reference', 'observed_method', 'observed_at', 'relevant_role', 'authentication_context', 'confidence_note'] as const).map(key => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{displayValue(properties[key])}</dd></div>)}</dl><Link to={`/e/${page.engagement_id}/pages/${properties.surface_id}`}>Open observed surface</Link></section>;
  return <section className="structured-properties" aria-label="Structured properties"><h2>{configs[properties.kind].singular} properties</h2><div className="properties-grid">{configs[properties.kind].fields.map(spec => <label key={spec.key}>{spec.label}<PropertyInput spec={spec} properties={properties} value={valueOf(properties, spec.key)} disabled={busy || properties.kind === 'template' && spec.key === 'record_type'} onChange={value => {
          setError(null);
          if (properties.kind === 'asset' && spec.key === 'scope_state' && value === 'In Scope' && !properties.authorization_confirmed) {
            setError(new Error('Confirm explicit testing authorization before selecting In Scope.'));
            return;
          }
          setProperties({
            ...properties,
            [spec.key]: value
          } as Properties);
          save.change({
            [spec.key]: value
          } as PageChanges);
        }} /></label>)}</div>
 {properties.kind === 'asset' ? <p className="scope-notice">{properties.scope_state === 'In Scope' && properties.authorization_confirmed ? 'Explicitly approved for the documented scope.' : 'Discovery is not authorization. Confirm approval and scope before testing.'}</p> : null}
 {properties.kind === 'backlog' ? <p className="section-caption">Blocked status requires a blocker reason. Completion does not change linked tasks or tests.</p> : null}
 {properties.kind === 'test_case' ? <p className="section-caption">Changing execution status never automatically changes the assessment outcome.</p> : null}
 {properties.kind === 'surface' && properties.duplicate_ids.length ? <div className="duplicate-notice"><p>Possible duplicates share route, method, authentication context, roles and linked assets. No records or observations have been merged.</p>{properties.duplicate_ids.map(id => <Link key={id} to={`/e/${page.engagement_id}/pages/${id}`}>Compare related surface ↗</Link>)}</div> : null}
 {properties.kind === 'finding' ? <div className="finding-verification"><span className="status-pill">{properties.verified_at ? 'Explicitly verified' : 'Unverified candidate / observation'}</span>{properties.verified_at ? <p>Verified {new Date(properties.verified_at).toLocaleString()}: {properties.verification_note}</p> : null}{properties.validation_status === 'Validating' ? <><label>Verification note<textarea aria-label="Verification note" value={note} onChange={e => setNote(e.target.value)} placeholder="Describe the manual verification and evidence." maxLength={20000} /></label><Button disabled={!note.trim() || busy} onClick={() => void verify()}>Verify finding</Button></> : <p className="section-caption">Move to Validating, review the evidence, then explicitly verify. Severity does not confirm a finding.</p>}</div> : null}
 <CustomValues page={page} />{properties.kind === 'template' ? <p className="section-caption">Edit the document below. New records copy this template; existing records are preserved.</p> : null}{error ? <ErrorMessage error={error} /> : null}</section>;
}
