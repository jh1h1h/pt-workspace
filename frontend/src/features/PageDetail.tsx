import { RecordProperties } from './records/RecordProperties';
import { RelatedRecordsPanel } from './records/RelatedRecordsPanel';
import { DiscoveryPanel } from './records/DiscoveryPanel';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Star } from 'lucide-react';
import { api } from '../api/client';
import { keys, usePages, useRefresh } from '../api/queries';
import type { Page, Priority, Status } from '../api/types';
import { RichEditor } from '../editor/RichEditor';
import { SaveFeedback } from '../editor/SavedDocument';
import { useAutosave } from '../hooks/useAutosave';
import { Loading, ErrorMessage } from '../components/Feedback';
import { Button } from '../components/ui/button';
import { NewPageForm } from './Pages';
import { EvidenceFileDetails, EvidenceUploader } from './phase3/Tools';
import { WorkflowControl } from './phase3/TemplateManager';
export function PageDetail() {
  const {
    eid = '',
    pid = ''
  } = useParams();
  const query = useQuery({
    queryKey: keys.page(eid, pid),
    queryFn: () => api.page(eid, pid)
  });
  const client = useQueryClient();
  useEffect(() => {
    void api.open(eid, pid).then(() => client.invalidateQueries({
      queryKey: keys.recent(eid)
    })).catch(() => {});
  }, [eid, pid, client]);
  return query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : <Detail key={query.data.id} initial={query.data} />;
}
function Detail({
  initial
}: {
  initial: Page;
}) {
  const page = initial;
  const save = useAutosave(page);
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon ?? '');
  const [parent, setParent] = useState(page.parent_id ?? '');
  const [favorite, setFavorite] = useState(page.favorite);
  const [task, setTask] = useState(page.task);
  const [error, setError] = useState<unknown>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const pages = usePages(page.engagement_id);
  const refresh = useRefresh(page.engagement_id);
  const navigate = useNavigate();
  function descendant(p: Page) {
    let parent = p.parent_id;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (parent === page.id) return true;
      visited.add(parent);
      parent = pages.data?.find(a => a.id === parent)?.parent_id ?? null;
    }
    return false;
  }
  async function remove() {
    setBusy(true);
    try {
      await save.flush();
      await api.deletePage(page.engagement_id, page.id);
      await refresh();
      await navigate(`/e/${page.engagement_id}/pages`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const childPages = pages.data?.filter(p => p.parent_id === page.id) ?? [];
  return <div className="document-width page-detail"><div className="page-title-row"><div className="title-line"><input className="icon-input" aria-label="Page icon" placeholder="▤" value={icon} maxLength={32} onChange={e => {
        setIcon(e.target.value);
        save.change({
          icon: e.target.value || null
        });
      }} /><input aria-label="Page title" className="page-title" value={title} maxLength={300} onChange={e => {
        setTitle(e.target.value);
        if (e.target.value.trim()) save.change({
          title: e.target.value
        });
      }} /></div><div className="page-title-actions"><Button variant="ghost" size="icon" aria-label={favorite ? 'Unpin page' : 'Pin page'} title={favorite ? 'Unpin page' : 'Pin page'} aria-pressed={favorite} onClick={() => {
        setFavorite(!favorite);
        save.change({
          favorite: !favorite
        });
      }}><Star size={16} fill={favorite ? 'currentColor' : 'none'} /></Button><details className="page-actions-menu"><summary aria-label="Page actions" title="Page actions"><MoreHorizontal size={18} /></summary><div className="page-actions-popover"><Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>Delete page</Button></div></details></div></div>{!title.trim() ? <p role="alert">A page title cannot be empty. The last nonempty title will be saved.</p> : null}<div className="page-meta"><span>{page.display_id} · {page.record?.kind.replaceAll('_', ' ') ?? (page.task ? 'personal task' : 'general page')}</span><label>Parent <select aria-label="Parent page" value={parent} onChange={e => {
          setParent(e.target.value);
          save.change({
            parent_id: e.target.value || null
          });
        }}><option value="">Top level</option>{(pages.data ?? []).filter(p => p.id !== page.id && !descendant(p)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label></div>{task ? <div className="task-properties"><label>Status <select aria-label="Task status" value={task.status} onChange={e => {
          const status = e.target.value as Status;
          setTask({
            ...task,
            status
          });
          save.change({
            status
          });
        }}>{['Open', 'In Progress', 'Done'].map(s => <option key={s}>{s}</option>)}</select></label><label>Priority <select aria-label="Task priority" value={task.priority} onChange={e => {
          const priority = e.target.value as Priority;
          setTask({
            ...task,
            priority
          });
          save.change({
            priority
          });
        }}>{['P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}</select></label><label>Due date <input aria-label="Task due date" type="date" value={task.due_date ?? ''} onChange={e => {
          setTask({
            ...task,
            due_date: e.target.value || null
          });
          save.change({
            due_date: e.target.value || null
          });
        }} /></label><label>Related page <select aria-label="Related page" value={task.related_page_id ?? ''} onChange={e => {
          setTask({
            ...task,
            related_page_id: e.target.value || null
          });
          save.change({
            related_page_id: e.target.value || null
          });
        }}><option value="">None</option>{pages.data?.filter(p => p.id !== page.id).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Parent task <select aria-label="Parent task" value={task.parent_task_id ?? ''} onChange={e => {
          setTask({
            ...task,
            parent_task_id: e.target.value || null
          });
          save.change({
            parent_task_id: e.target.value || null
          });
        }}><option value="">None</option>{pages.data?.filter(p => p.task && p.id !== page.id).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>{task.related_page_id ? <Link to={`/e/${page.engagement_id}/pages/${task.related_page_id}`}>Open related page ↗</Link> : null}<ul>{pages.data?.filter(p => p.task?.parent_task_id === page.id).map(p => <li key={p.id}><Link to={`/e/${page.engagement_id}/pages/${p.id}`}>{p.title}</Link></li>)}</ul></div> : null}<WorkflowControl page={page} />{page.record ? <RecordProperties page={page} save={save} /> : null}{page.record?.kind === 'finding' || page.record?.kind === 'test_case' ? <EvidenceUploader eid={page.engagement_id} related={page} /> : null}{page.record?.kind === 'evidence' ? <EvidenceFileDetails page={page} /> : null}<RichEditor content={page.content} onChange={content => save.change({
      content
    })} engagementId={page.engagement_id} parentPageId={page.id} /><SaveFeedback save={save} />{page.record?.kind === 'surface' ? <DiscoveryPanel page={page} /> : null}<RelatedRecordsPanel page={page} /><section className="compact-panel child-pages-panel"><div className="panel-heading"><h2>Child pages <span className="panel-count">({childPages.length})</span></h2><NewPageForm eid={page.engagement_id} parentId={page.id} label="+ New child" /></div>{childPages.length ? <ul className="child-pages-list">{childPages.map(p => <li key={p.id}><Link to={`/e/${page.engagement_id}/pages/${p.id}`}>{p.icon || '▤'} {p.title}</Link></li>)}</ul> : <p className="empty">No child pages.</p>}</section>{error ? <ErrorMessage error={error} /> : null}{confirmDelete ? <div className="dialog-backdrop"><div role="dialog" aria-modal="true" aria-label="Delete page" className="dialog"><h2>Move this page to trash?</h2><p>Child pages move to the parent level. Linked records stay intact. Restore this page in Settings.</p><Button variant="destructive" disabled={busy} onClick={() => void remove()}>Move to trash</Button><Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button></div></div> : null}</div>;
}
