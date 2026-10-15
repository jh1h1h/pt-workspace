import { RichEditor } from './RichEditor';
import { useAutosave } from '../hooks/useAutosave';
import type { Page } from '../api/types';
import { Button } from '../components/ui/button';
export function SavedDocument({
  page,
  label = 'Document'
}: {
  page: Page;
  label?: string;
}) {
  const save = useAutosave(page);
  return <><SaveFeedback save={save} /><RichEditor content={page.content} onChange={content => save.change({
      content
    })} label={label} engagementId={page.engagement_id} /></>;
}
export function SaveFeedback({
  save
}: {
  save: ReturnType<typeof useAutosave>;
}) {
  return <div className="save-feedback"><span role="status" className={save.status === 'Save Failed' ? 'error' : 'muted'}>{save.status === 'Unsaved' ? 'Unsaved · waiting to save' : save.status}</span>{save.error ? <><p role="alert">{save.error} Your edits remain in this editor.</p><Button size="sm" variant="outline" onClick={() => void save.flush().catch(() => {})}>Retry save</Button><Button size="sm" variant="outline" onClick={save.download}>Download unsaved JSON</Button><Button size="sm" variant="outline" onClick={() => void save.review()}>Review server version</Button></> : null}{save.latest ? <div className="recovery"><p>Server revision {save.latest.revision}: {save.latest.title}</p><pre>{JSON.stringify(save.latest.content, null, 2)}</pre><Button variant="outline" onClick={() => void save.overwrite()}>Save my edits over this version</Button></div> : null}</div>;
}
