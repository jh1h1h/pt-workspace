import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Page } from '../../api/types';
import { recordApi } from '../../api/records';
import type { RecordKind } from '../../api/recordTypes';
import { usePages, useRefresh } from '../../api/queries';
import { configs } from './config';
import { Button } from '../../components/ui/button';
import { ErrorMessage } from '../../components/Feedback';
import { saves } from '../../hooks/saveCoordinator';
import { useQuery } from '@tanstack/react-query';
import { phase3Api } from '../../api/phase3';
import { ValueInput } from '../phase3/CustomProperties';
export function CreateRecordDialog({
  eid,
  initialKind,
  source,
  onClose,
  onCreated
}: {
  eid: string;
  initialKind: RecordKind;
  source?: Page;
  onClose: () => void;
  onCreated?: (page: Page) => void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('');
  const [templateType, setTemplateType] = useState<'test_case' | 'finding'>('test_case');
  const [useDefault, setUseDefault] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const pages = usePages(eid);
  const refresh = useRefresh(eid);
  const customProperties = useQuery({ queryKey: ['workspace', eid, 'custom-properties', kind], queryFn: () => phase3Api.properties(eid, kind), enabled: ['asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence'].includes(kind) });
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saves.flush();
      const p = await recordApi.create(eid, kind, {
        title: title.trim(),
        ...(template ? {
          template_id: template
        } : {}),
        ...(kind === 'template' ? {
          record_type: templateType,
          is_default: useDefault
        } : {}),
        ...(source ? {
          links: [{
            target_id: source.id
          }]
        } : {}),
        custom_values: customValues
      });
      await refresh();
      onClose();
      if (onCreated) onCreated(p);else await navigate(`/e/${eid}/pages/${p.id}`);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Create record" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) onClose();
    }}><h2>Create {configs[kind].singular.toLowerCase()}</h2><form onSubmit={event => void submit(event)}>
 {source ? <><p>Linked to {source.title} using its immutable ID.</p><label>Record type<select aria-label="Record type" value={kind} onChange={e => {
              setKind(e.target.value as RecordKind);
              setTemplate('');
            }}>{(['asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence'] as const).map(k => <option key={k} value={k}>{configs[k].singular}</option>)}</select></label></> : null}
 <label>{kind === 'asset' ? 'Name' : 'Title'}<input ref={input} aria-label="Record title" value={title} maxLength={300} required onChange={e => setTitle(e.target.value)} /></label>
 {kind === 'test_case' || kind === 'finding' ? <label>Document template<select aria-label="Document template" value={template} onChange={e => setTemplate(e.target.value)}><option value="">Engagement default / built-in</option>{pages.data?.filter(p => p.record?.kind === 'template' && p.record.record_type === kind).map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label> : null}
 {kind === 'template' ? <><label>For record type<select aria-label="Template type" value={templateType} onChange={e => setTemplateType(e.target.value as 'test_case' | 'finding')}><option value="test_case">Test case</option><option value="finding">Finding</option></select></label><label className="checkbox-label"><input type="checkbox" aria-label="Use as default" checked={useDefault} onChange={e => setUseDefault(e.target.checked)} />Use as engagement default</label></> : null}
 {customProperties.data?.filter(property => property.visible).map(property => <label key={property.id}>{property.name}{property.required ? ' *' : ''}<ValueInput property={property} value={customValues[property.id] ?? property.default_value} label={`${property.name} custom property`} onChange={value => setCustomValues(current => ({ ...current, [property.id]: value }))} /></label>)}
 {kind === 'asset' ? <p className="muted">New assets are Pending Confirmation. Discovery alone never grants testing authorization.</p> : null}{kind === 'finding' ? <p className="muted">New findings are Candidate and Unassigned. Confirmation requires explicit verification.</p> : null}
 {error ? <ErrorMessage error={error} /> : null}<div className="dialog-actions"><Button disabled={busy || !title.trim() || Boolean(customProperties.data?.some(property => property.required && (customValues[property.id] ?? property.default_value) == null))}>Create record</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button></div></form></div></div>;
}
