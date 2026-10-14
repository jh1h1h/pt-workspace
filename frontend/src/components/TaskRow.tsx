import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page, Priority, PageChanges } from '../api/types';
import { useAutosave } from '../hooks/useAutosave';
import { SaveFeedback } from '../editor/SavedDocument';
import { ErrorMessage } from './Feedback';
import { Button } from './ui/button';
export function TaskRow({
  page,
  onMove,
  canMoveUp = true,
  canMoveDown = true
}: {
  page: Page;
  onMove?: (direction: number) => Promise<void>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const save = useAutosave(page);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(page.title);
  const task = page.task!;
  const [complete,setComplete]=useState(task.status==='Done');
  const [priority,setPriority]=useState(task.priority);
  async function patch(changes: PageChanges) {
    setBusy(true);
    setError(null);
    save.change(changes);
    try {
      await save.flush();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return <div className="task-container">
  <div className="task-row">
   <input type="checkbox" aria-label={`Complete ${page.title}`} checked={complete} disabled={busy} onChange={() => {setComplete(!complete);void patch({status:complete?'Open':'Done'});}} />
   <input aria-label={`Title for ${page.display_id}`} className={task.status === 'Done' ? 'done' : ''} value={title} disabled={busy} onChange={e => {
        setTitle(e.target.value);
        if (e.target.value.trim()) save.change({
          title: e.target.value
        });
      }} onKeyDown={e => {
        if (e.key === 'Enter') void save.flush().catch(setError);
      }} />
   <select aria-label={`Priority for ${page.title}`} className={`priority ${task.priority.toLowerCase()}`} disabled={busy} value={priority} onChange={e => {const value=e.target.value as Priority;setPriority(value);void patch({priority:value});}}>{['P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}</select>
   <Link className="detail-link" aria-label={`Open ${page.title}`} to={`/e/${page.engagement_id}/pages/${page.id}`}>↗</Link>
   {onMove ? <>
    <Button variant="ghost" size="sm" disabled={busy || !canMoveUp} aria-label={`Move ${page.title} up`} onClick={() => {
          setBusy(true);
          void onMove(-1).catch(setError).finally(() => setBusy(false));
        }}>↑</Button>
    <Button variant="ghost" size="sm" disabled={busy || !canMoveDown} aria-label={`Move ${page.title} down`} onClick={() => {
          setBusy(true);
          void onMove(1).catch(setError).finally(() => setBusy(false));
        }}>↓</Button>
   </> : null}
  </div>
  {!title.trim() ? <p role="alert">Task title cannot be empty. The last nonempty title will be saved.</p> : null}
  {save.status === 'Save Failed' ? <SaveFeedback save={save} /> : null}
  {error && save.status !== 'Save Failed' ? <ErrorMessage error={error} /> : null}
 </div>;
}
