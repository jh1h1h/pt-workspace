import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { phase3Api, type SavedView } from '../../api/phase3';
import type { RecordKind } from '../../api/recordTypes';
import { Button } from '../../components/ui/button';
import { ErrorMessage } from '../../components/Feedback';

export function SavedViews({ eid, kind, onSelect }: { eid: string; kind: RecordKind; onSelect?: (view: SavedView | null) => void }) {
  const client = useQueryClient();
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const [name, setName] = useState('');
  const [columns, setColumns] = useState('display_id,title');
  const [widths, setWidths] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [sortField, setSortField] = useState('updated_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [groupBy, setGroupBy] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [editing, setEditing] = useState<SavedView | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [remove, setRemove] = useState<SavedView | null>(null);
  const [error, setError] = useState<unknown>();
  const query = useQuery({
    queryKey: ['workspace', eid, 'saved-views', kind],
    queryFn: () => phase3Api.views(eid, kind),
    enabled: ['asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence'].includes(kind)
  });
  useEffect(() => {
    const preferred = query.data?.find(view => view.is_default);
    if (preferred) selectRef.current?.(preferred);
  }, [query.data]);
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['workspace', eid, 'saved-views', kind] });
  }
  function reset() {
    setEditing(null); setName(''); setWidths(''); setGroupBy(''); setConfigOpen(false);
  }
  async function save() {
    if (!name.trim()) return;
    try {
      const visible = columns.split(',').map(value => value.trim()).filter(Boolean);
      const parsedWidths = Object.fromEntries(
        widths.split(',').map(item => item.split(':').map(value => value.trim()))
          .filter(parts => parts.length === 2 && Number.isFinite(Number(parts[1])))
          .map(([field, width]) => [field, Number(width)])
      );
      const config = {
        columns: visible,
        column_order: visible,
        column_widths: parsedWidths,
        filters: filterField && filterValue ? [{ field: filterField, value: filterValue }] : [],
        sorts: sortField ? [{ field: sortField, direction }] : [],
        group_by: groupBy || (kind === 'backlog' ? 'status' : null)
      };
      if (editing) await phase3Api.patchView(eid, editing.id, { name, config, is_default: makeDefault });
      else await phase3Api.createView(eid, {
        name, record_type: kind, view_type: kind === 'backlog' ? 'kanban' : 'table',
        config, is_default: makeDefault || !query.data?.length
      });
      reset();
      await refresh();
    } catch (caught) { setError(caught); }
  }
  function edit(view: SavedView) {
    const filter = view.config.filters[0]; const sort = view.config.sorts[0];
    setEditing(view); setConfigOpen(true); setName(view.name);
    setColumns(view.config.column_order.join(','));
    setWidths(Object.entries(view.config.column_widths).map(([field, width]) => `${field}:${width}`).join(','));
    setFilterField(filter?.field ?? ''); setFilterValue(String(filter?.value ?? ''));
    setSortField(sort?.field ?? 'updated_at'); setDirection(sort?.direction ?? 'desc');
    setGroupBy(view.config.group_by ?? ''); setMakeDefault(view.is_default);
  }
  async function rename(view: SavedView) {
    const value = window.prompt('View name', view.name);
    if (!value?.trim()) return;
    try { await phase3Api.patchView(eid, view.id, { name: value }); await refresh(); } catch (caught) { setError(caught); }
  }
  return <div className="saved-views">
    <div className="view-tabs" role="tablist" aria-label="Saved database views">
      <Button variant="outline" role="tab" onClick={() => onSelect?.(null)}>Current</Button>
      {query.data?.map(view => <Button key={view.id} variant={view.is_default ? 'default' : 'outline'} role="tab" onClick={() => onSelect?.(view)}>{view.name}</Button>)}
    </div>
    <details open={configOpen} onToggle={event => setConfigOpen(event.currentTarget.open)}>
      <summary>Configure saved view</summary>
      <div className="database-toolbar">
        <input aria-label="New view name" value={name} onChange={event => setName(event.target.value)} placeholder="New saved view" />
        <input aria-label="Visible view columns" value={columns} onChange={event => setColumns(event.target.value)} placeholder="title,status" />
        <input aria-label="View column widths" value={widths} onChange={event => setWidths(event.target.value)} placeholder="title:280,status:140" />
        <input aria-label="View filter field" value={filterField} onChange={event => setFilterField(event.target.value)} placeholder="Filter field" />
        <input aria-label="View filter value" value={filterValue} onChange={event => setFilterValue(event.target.value)} placeholder="Filter value" />
        <input aria-label="View sort field" value={sortField} onChange={event => setSortField(event.target.value)} placeholder="Sort field" />
        <select aria-label="View sort direction" value={direction} onChange={event => setDirection(event.target.value as 'asc' | 'desc')}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
        <input aria-label="View group field" value={groupBy} onChange={event => setGroupBy(event.target.value)} placeholder="Optional group field" />
        <label className="checkbox-label"><input type="checkbox" checked={makeDefault} onChange={event => setMakeDefault(event.target.checked)} />Default</label>
        <Button size="sm" onClick={() => void save()}>{editing ? 'Update view' : 'Save view'}</Button>
        {editing ? <Button size="sm" variant="outline" onClick={reset}>Cancel edit</Button> : null}
      </div>
    </details>
    <div className="database-toolbar">
      {query.data?.map(view => <span className="saved-view-actions" key={view.id}>
        <Button size="sm" variant="ghost" aria-label={`Edit ${view.name}`} onClick={() => edit(view)}>Edit</Button>
        <Button size="sm" variant="ghost" aria-label={`Rename ${view.name}`} onClick={() => void rename(view)}>Rename</Button>
        <Button size="sm" variant="ghost" aria-label={`Duplicate ${view.name}`} onClick={() => void phase3Api.duplicateView(eid, view.id).then(refresh).catch(setError)}>⧉</Button>
        <Button size="sm" variant="ghost" aria-label={`Delete ${view.name}`} onClick={() => setRemove(view)}>×</Button>
      </span>)}
    </div>
    {remove ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Delete saved view">
      <h3>Delete {remove.name}?</h3><p>The records remain available in other views.</p>
      <Button variant="destructive" onClick={() => void phase3Api.deleteView(eid, remove.id).then(() => { setRemove(null); return refresh(); }).catch(setError)}>Delete view</Button>
      <Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button>
    </div></div> : null}
    {error ? <ErrorMessage error={error} /> : null}
  </div>;
}
