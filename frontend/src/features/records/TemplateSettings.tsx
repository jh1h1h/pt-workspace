import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { recordApi, recordKeys } from '../../api/records';
import { Button } from '../../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../../components/Feedback';
import { CreateRecordDialog } from './CreateRecordDialog';
import { PropertySettings } from '../phase3/CustomProperties';
import { ImportManager } from '../phase3/Tools';
import { TemplateManager, WorkflowSettings } from '../phase3/TemplateManager';
export function TemplateSettings({
  eid
}: {
  eid: string;
}) {
  const query = useQuery({
    queryKey: recordKeys.list(eid, 'template', {}),
    queryFn: () => recordApi.all(eid, 'template')
  });
  const [create, setCreate] = useState(false);
  return <><section aria-label="Record document templates"><h2>Record document templates</h2><p>Customize the initial Test Case and Finding documents. Existing records keep their content when a template changes.</p><Button variant="outline" size="sm" onClick={() => setCreate(true)}>Create document template</Button>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : query.data.length ? <ul className="template-list">{query.data.map(p => <li key={p.id}><Link to={`/e/${eid}/pages/${p.id}`}>{p.title}</Link><span className="record-id">{p.record?.kind === 'template' ? `${p.record.record_type}${p.record.is_default ? ' · Default' : ''}` : ''}</span></li>)}</ul> : <Empty>New tests and findings currently use the built-in section templates.</Empty>}{create ? <CreateRecordDialog eid={eid} initialKind="template" onClose={() => setCreate(false)} /> : null}</section><TemplateManager eid={eid} /><PropertySettings eid={eid} /><WorkflowSettings eid={eid} /><ImportManager eid={eid} /></>;
}
