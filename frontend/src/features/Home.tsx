import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useTasks } from '../api/queries';
import { TaskRow } from '../components/TaskRow';
import { NewTask } from '../components/NewTask';
import { Loading, ErrorMessage, Empty } from '../components/Feedback';
import { SavedDocument } from '../editor/SavedDocument';
import type { Page } from '../api/types';
export const priorityQueue = (tasks: Page[]) => tasks.filter(p => p.task && p.task.status !== 'Done').sort((a, b) => a.task!.priority.localeCompare(b.task!.priority) || a.task!.position - b.task!.position || a.created_at.localeCompare(b.created_at));
export function Home() {
  const {
    eid = ''
  } = useParams();
  const tasks = useTasks(eid);
  const scratch = useQuery({
    queryKey: keys.scratch(eid),
    queryFn: () => api.scratchpad(eid)
  });
  const recent = useQuery({
    queryKey: keys.recent(eid),
    queryFn: () => api.recent(eid)
  });
  return <div className="home"><section className="home-priority" aria-labelledby="priority-heading"><div className="section-title-row"><h2 id="priority-heading">Priority Queue</h2><NewTask eid={eid} modal /></div><div className="home-panel-content">{tasks.isPending ? <Loading /> : tasks.error ? <ErrorMessage error={tasks.error} /> : <>{priorityQueue(tasks.data ?? []).map(page => <TaskRow key={`${page.id}-${page.revision}`} page={page} />)}{!priorityQueue(tasks.data ?? []).length ? <Empty>Nothing waiting. Add your next small step.</Empty> : null}</>}</div></section><section className="home-scratch" aria-labelledby="scratch-heading"><h2 id="scratch-heading">Notes</h2><div className="home-panel-content">{scratch.isPending ? <Loading /> : scratch.error ? <ErrorMessage error={scratch.error} /> : <SavedDocument key={scratch.data.id} page={scratch.data} label="Scratchpad content" />}</div></section><section className="home-recent" aria-labelledby="recent-heading"><h2 id="recent-heading">Recently Opened</h2><div className="home-panel-content">{recent.isPending ? <Loading /> : recent.error ? <ErrorMessage error={recent.error} /> : recent.data.length ? <ul className="recent-list">{recent.data.slice(0, 8).map(p => <li key={p.id}><Link to={`/e/${eid}/pages/${p.id}`}><span>{p.icon || '▤'} {p.title}</span><span className="muted">{p.display_id} ↗</span></Link></li>)}</ul> : <Empty>Open a page and it will appear here.</Empty>}</div></section></div>;
}
