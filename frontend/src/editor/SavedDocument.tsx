import { RichEditor } from './RichEditor';
import { useAutosave } from '../hooks/useAutosave';
import type { Page } from '../api/types';
import { Button } from '../components/ui/button';
import { useState } from 'react';
import { phase3Api } from '../api/phase3';
import { ErrorMessage } from '../components/Feedback';
import { api } from '../api/client';
export function SavedDocument({
  page,
  label = 'Document'
}: {
  page: Page;
  label?: string;
}) {
  const save = useAutosave(page);
  const [convert, setConvert] = useState(false);
  const [title, setTitle] = useState('');
  const [clear, setClear] = useState(false);
  const [error, setError] = useState<unknown>();
  async function createNote() {
    try {
      await save.flush();
      const current = await api.scratchpad(page.engagement_id);
      await phase3Api.convertScratchpad(current, title, clear);
      setConvert(false);
      if (clear) window.location.reload();
    } catch (caught) { setError(caught); }
  }
  return <><SaveFeedback save={save} />{page.page_type === 'scratchpad' ? <Button size="sm" variant="outline" onClick={() => setConvert(true)}>Convert to Note</Button> : null}<RichEditor content={page.content} onChange={content => save.change({
      content
    })} label={label} engagementId={page.engagement_id} />{convert ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Convert scratchpad to note"><h2>Convert Scratchpad to Note</h2><input autoFocus aria-label="Converted note title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Note title" /><label className="checkbox-label"><input type="checkbox" checked={clear} onChange={event => setClear(event.target.checked)} />Clear the scratchpad only after the note saves</label><p>The full formatted document and internal links will be copied. The scratchpad stays intact by default.</p>{error ? <ErrorMessage error={error} /> : null}<Button disabled={!title.trim()} onClick={() => void createNote()}>Create note</Button><Button variant="outline" onClick={() => setConvert(false)}>Cancel</Button></div></div> : null}</>;
}
export function SaveFeedback({
  save
}: {
  save: ReturnType<typeof useAutosave>;
}) {
  return <div className="save-feedback"><span role="status" className={save.status === 'Save Failed' ? 'error' : 'muted'}>{save.status === 'Unsaved' ? 'Unsaved · waiting to save' : save.status}</span>{save.error ? <><p role="alert">{save.error} Your edits remain in this editor.</p><Button size="sm" variant="outline" onClick={() => void save.flush().catch(() => {})}>Retry save</Button><Button size="sm" variant="outline" onClick={save.download}>Download unsaved JSON</Button><Button size="sm" variant="outline" onClick={() => void save.review()}>Review server version</Button></> : null}{save.latest ? <div className="recovery"><p>Server revision {save.latest.revision}: {save.latest.title}</p><pre>{JSON.stringify(save.latest.content, null, 2)}</pre><Button variant="outline" onClick={() => void save.overwrite()}>Save my edits over this version</Button></div> : null}</div>;
}
