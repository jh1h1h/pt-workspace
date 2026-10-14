import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { RecordKind } from '../../api/recordTypes';
import { recordApi, recordKeys } from '../../api/records';
import { useRefresh } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { PageTree } from '../../components/PageTree';
import { ErrorMessage, Loading, Empty } from '../../components/Feedback';
import { configs } from './config';
import { RecordTable } from './RecordTable';
import { CreateRecordDialog } from './CreateRecordDialog';
import { BacklogKanban } from './BacklogKanban';
import { saves } from '../../hooks/saveCoordinator';
import { SavedViews } from '../phase3/SavedViews';
import type { SavedView } from '../../api/phase3';
import { EvidenceUploader } from '../phase3/Tools';
export function RecordModule({
  kind
}: {
  kind: RecordKind;
}) {
  const {
    eid = ''
  } = useParams();
  const [create, setCreate] = useState<RecordKind | null>(null);
  const [view, setView] = useState('table');
  const [savedView, setSavedView] = useState<SavedView | null>(null);
  const [error, setError] = useState<unknown>();
  const refresh = useRefresh(eid);
  const scopes = useQuery({
    queryKey: recordKeys.list(eid, 'scope', {}),
    queryFn: () => recordApi.all(eid, 'scope'),
    enabled: kind === 'asset'
  });
  async function initialize() {
    try {
      await recordApi.initializeScope(eid);
      await refresh();
    } catch (error) {
      setError(error);
    }
  }
  return <div className="database-width"><p className="eyebrow">VAPT WORKSPACE</p><h1>{configs[kind].label}</h1><p className="subtitle">{kind === 'asset' ? 'Document approved boundaries and maintain the asset inventory.' : kind === 'backlog' ? 'Technical assessment objectives, separate from your Personal Tasks.' : kind === 'test_case' ? 'Execution and assessment outcome are independent.' : kind === 'finding' ? 'Candidates require explicit verification before confirmation or reporting.' : kind === 'evidence' ? 'Local evidence references and notes. File attachments and HTTP inspection arrive in Phase 3.' : 'Structured surfaces and retained discovery provenance. No target requests are sent.'}</p>
 {kind === 'asset' ? <section className="scope-documentation"><h2>Engagement documentation</h2><div className="database-toolbar"><Button variant="outline" size="sm" onClick={() => void initialize()}>Create standard scope pages</Button><Button variant="outline" size="sm" onClick={() => setCreate('scope')}>Create scope page</Button></div>{scopes.isPending ? <Loading /> : scopes.error ? <ErrorMessage error={scopes.error} /> : scopes.data.length ? <PageTree pages={scopes.data} /> : <Empty>Create editable pages for rules, boundaries, exclusions, testing windows, contacts, account notes and open questions.</Empty>}<p className="scope-notice">An asset starts Pending Confirmation. Enumeration and discovery never authorize testing.</p><h2>Asset inventory</h2></section> : null}
 {kind === 'backlog' ? <div role="tablist" aria-label="Backlog views" className="view-tabs">{['table', 'kanban'].map(v => <Button key={v} variant={view === v ? 'default' : 'outline'} role="tab" aria-selected={view === v} onClick={() => void saves.flush().then(() => setView(v)).catch(setError)}>{v === 'table' ? 'Table' : 'Kanban'}</Button>)}</div> : null}
 <SavedViews eid={eid} kind={kind} onSelect={selected => { setSavedView(selected); if (kind === 'backlog' && selected) setView(selected.view_type); }} />
 {kind === 'evidence' ? <EvidenceUploader eid={eid} /> : null}
 {error ? <ErrorMessage error={error} /> : null}{kind === 'backlog' && view === 'kanban' ? <BacklogKanban key={eid} eid={eid} onCreate={() => setCreate(kind)} /> : <RecordTable key={`${eid}-${kind}`} eid={eid} kind={kind} savedView={savedView} onCreate={() => setCreate(kind)} />}
 {create ? <CreateRecordDialog eid={eid} initialKind={create} onClose={() => setCreate(null)} /> : null}</div>;
}
