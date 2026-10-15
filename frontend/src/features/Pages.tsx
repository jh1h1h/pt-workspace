import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { Page } from '../api/types';
import { usePages } from '../api/queries';
import { PageTree } from '../components/PageTree';
import { Loading, ErrorMessage, Empty } from '../components/Feedback';
import { Button } from '../components/ui/button';
import { CreatePageDialog } from '../components/CreatePageDialog';
export function NewPageForm({
  eid,
  parentId,
  onCreated,
  label
}: {
  eid: string;
  parentId?: string;
  onCreated?: (page: Page) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return <>{<Button size="sm" variant="outline" onClick={() => setOpen(true)}>{label ?? (parentId ? 'Add child page' : 'New page')}</Button>}{open ? <CreatePageDialog eid={eid} parentId={parentId} onCreated={onCreated} onClose={() => setOpen(false)} /> : null}</>;
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
export function Pages() {
  const {
    eid = ''
  } = useParams();
  const query = usePages(eid);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('tree');
  const pages = (query.data ?? []).filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  return <div className="document-width"><p className="eyebrow">PERSONAL WORKSPACE</p><h1>All Pages</h1><p className="subtitle">Tasks and assessment records in this engagement.</p><div className="filters"><input aria-label="Search pages" placeholder="Search page titles…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Page view" value={view} onChange={e => setView(e.target.value)}><option value="tree">Hierarchy</option><option value="table">Page list</option></select></div>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : pages.length ? view === 'tree' ? <PageTree pages={pages} /> : <PageTable pages={pages} /> : <Empty>{search ? 'No matching pages.' : 'No workflow pages yet.'}</Empty>}</div>;
}
