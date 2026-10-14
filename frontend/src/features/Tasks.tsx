import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { saves } from '../hooks/saveCoordinator';
import { api } from '../api/client';
import { useTasks, useRefresh } from '../api/queries';
import { TaskRow } from '../components/TaskRow';
import { NewTask } from '../components/NewTask';
import { Loading, ErrorMessage, Empty } from '../components/Feedback';
export function Tasks() {
  const {
    eid = ''
  } = useParams();
  const query = useTasks(eid);
  const refresh = useRefresh(eid);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [due, setDue] = useState('');
  const [group, setGroup] = useState('priority');
  const [search, setSearch] = useState('');
  const items = (query.data ?? []).filter(p => (!status || p.task?.status === status) && (!priority || p.task?.priority === priority) && (!due || p.task?.due_date && p.task.due_date <= due) && p.title.toLowerCase().includes(search.toLowerCase()));
  const groups = group === 'priority' ? ['P1', 'P2', 'P3'] : ['Open', 'In Progress', 'Done'];
  async function move(id: string, direction: number) {
    await saves.flush();
    const all = await api.tasks(eid);
    const index = all.findIndex(p => p.id === id);
    const other = index + direction;
    if (other < 0 || other >= all.length || all[other].task?.priority !== all[index].task?.priority) return;
    [all[index], all[other]] = [all[other], all[index]];
    await api.reorder(eid, all);
    await refresh();
  }
  return <div className="document-width"><p className="eyebrow">PERSONAL WORKSPACE</p><h1>My Tasks</h1><p className="subtitle">Personal work, independent of the testing backlog.</p><NewTask eid={eid} /><div className="filters"><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['Open', 'In Progress', 'Done'].map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filter priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{['P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}</select><label>Due before <input aria-label="Due before" type="date" value={due} onChange={e => setDue(e.target.value)} /></label><select aria-label="Group tasks" value={group} onChange={e => setGroup(e.target.value)}><option value="priority">Group by priority</option><option value="status">Group by status</option></select></div>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : items.length ? groups.map(g => <section key={g}><h2>{g}</h2>{items.filter(p => p.task?.[group as 'priority' | 'status'] === g).map(p => <TaskRow key={`${p.id}-${p.revision}`} page={p} canMoveUp={query.data?.[(query.data?.findIndex(a => a.id === p.id) ?? 0) - 1]?.task?.priority === p.task?.priority} canMoveDown={query.data?.[(query.data?.findIndex(a => a.id === p.id) ?? 0) + 1]?.task?.priority === p.task?.priority} onMove={d => move(p.id, d)} />)}</section>) : <Empty>No tasks match these filters.</Empty>}</div>;
}
