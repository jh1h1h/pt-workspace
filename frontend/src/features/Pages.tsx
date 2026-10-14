import { useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { api } from '../api/client';
import type { Page } from '../api/types';
import { usePages, useRefresh } from '../api/queries';
import { PageTree } from '../components/PageTree';
import { Button } from '../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../components/Feedback';
export function NewPageForm({
  eid,
  parentId,
  onCreated
}: {
  eid: string;
  parentId?: string;
  onCreated?: (page: Page) => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const refresh = useRefresh(eid);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.createPage(eid, {
        title: title.trim(),
        parent_id: parentId ?? null
      });
      setTitle('');
      await refresh();
      if (onCreated) onCreated(p);else await navigate(`/e/${eid}/pages/${p.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return <><form className="inline-form" onSubmit={e => void submit(e)}><input aria-label={parentId ? 'New child page title' : 'New page title'} placeholder={parentId ? 'Name a child page…' : 'Name a new page…'} value={title} onChange={e => setTitle(e.target.value)} required maxLength={300} /><Button disabled={busy || !title.trim()} variant="outline" size="sm">{parentId ? 'Add child page' : 'Create page'}</Button></form>{error ? <ErrorMessage error={error} /> : null}</>;
}
const helper = createColumnHelper<Page>();
const columns = [helper.accessor('title', {
  header: 'Page',
  cell: info => <Link to={`/e/${info.row.original.engagement_id}/pages/${info.row.original.id}`}>{info.row.original.icon || '▤'} {info.getValue()}</Link>
}), helper.accessor('page_type', {
  header: 'Type'
}), helper.accessor('updated_at', {
  header: 'Updated',
  cell: info => new Date(info.getValue()).toLocaleDateString()
})];
function PageTable({
  pages
}: {
  pages: Page[];
}) {
  const table = useReactTable({
    data: pages,
    columns,
    getCoreRowModel: getCoreRowModel()
  });
  return <table className="page-table"><thead>{table.getHeaderGroups().map(g => <tr key={g.id}>{g.headers.map(h => <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(r => <tr key={r.id}>{r.getVisibleCells().map(c => <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody></table>;
}
export function Pages({
  notes = false
}: {
  notes?: boolean;
}) {
  const {
    eid = ''
  } = useParams();
  const query = usePages(eid);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('tree');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [error, setError] = useState<unknown>();
  const navigate = useNavigate();
  const refresh = useRefresh(eid);
  const pages = (query.data ?? []).filter(p => (!notes || ['note', 'journal'].includes(p.page_type)) && p.title.toLowerCase().includes(search.toLowerCase()));
  async function journal() {
    try {
      const existing = (query.data ?? []).find(p => p.page_type === 'journal' && p.journal_date === date);
      const p = existing ?? (await api.createPage(eid, {
        title: `Journal · ${date}`,
        page_type: 'journal',
        journal_date: date
      }));
      await refresh();
      await navigate(`/e/${eid}/pages/${p.id}`);
    } catch (e) {
      setError(e);
    }
  }
  return <div className="document-width"><p className="eyebrow">PERSONAL WORKSPACE</p><h1>{notes ? 'Notes & Journal' : 'All Pages'}</h1><p className="subtitle">{notes ? 'Freeform notes and a daily place to think.' : 'Your engagement, one page at a time.'}</p><NewPageForm eid={eid} />{notes ? <div className="inline-form"><input type="date" aria-label="Journal date" value={date} onChange={e => setDate(e.target.value)} /><Button variant="outline" size="sm" onClick={() => void journal()} disabled={!date}>Open daily journal</Button></div> : null}<div className="filters"><input aria-label="Search pages" placeholder="Search page titles…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Page view" value={view} onChange={e => setView(e.target.value)}><option value="tree">Hierarchy</option><option value="table">Page list</option></select></div>{error ? <ErrorMessage error={error} /> : null}{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : pages.length ? <>{view === 'tree' ? <PageTree pages={pages} /> : <PageTable pages={pages} />} {notes ? <section><h2>Journal by date</h2><ul className="recent-list">{pages.filter(p => p.page_type === 'journal').sort((a, b) => (b.journal_date ?? '').localeCompare(a.journal_date ?? '')).map(p => <li key={p.id}><Link to={`/e/${eid}/pages/${p.id}`}>{p.journal_date} · {p.title}</Link></li>)}</ul></section> : null}</> : <Empty>{search ? 'No matching pages.' : 'Create your first page above.'}</Empty>}</div>;
}
