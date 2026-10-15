import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type Row, type ColumnFiltersState, type SortingState, type RowSelectionState, type ColumnSizingState } from '@tanstack/react-table';
import type { Page, PageChanges } from '../../api/types';
import type { RecordKind, RecordProperties, RecordChanges } from '../../api/recordTypes';
import { recordApi, recordKeys } from '../../api/records';
import { useAutosave } from '../../hooks/useAutosave';
import { saves } from '../../hooks/saveCoordinator';
import { SaveFeedback } from '../../editor/SavedDocument';
import { Button } from '../../components/ui/button';
import { Loading, ErrorMessage, Empty } from '../../components/Feedback';
import { configs, valueOf, displayValue, type FieldSpec } from './config';
import { PropertyInput } from './PropertyInput';
import { ObservationDialog } from './DiscoveryPanel';
import { CreateRecordDialog } from './CreateRecordDialog';
import { nextRelatedKind } from './config';
import { BlockReasonDialog } from './BlockReasonDialog';
import { phase3Api, type CustomProperty, type SavedView } from '../../api/phase3';
import { SlidersHorizontal } from 'lucide-react';
interface RowState {
  page: Page;
  title: string;
  properties: RecordProperties;
  edit: (field: keyof RecordChanges | 'title', value: unknown) => void;
}
const RowContext = createContext<RowState | null>(null);
function InlineCell({
  field
}: {
  field: FieldSpec;
}) {
  const context = useContext(RowContext)!;
  return <PropertyInput spec={field} properties={context.properties} value={valueOf(context.properties, field.key)} onChange={value => context.edit(field.key, value)} label={`${field.label} for ${context.page.display_id}`} />;
}
function TitleCell() {
  const context = useContext(RowContext)!;
  return <div className="record-title-cell"><input aria-label={`Title for ${context.page.display_id}`} value={context.title} maxLength={300} onChange={e => context.edit('title', e.target.value)} /><Link aria-label={`Open ${context.title}`} to={`/e/${context.page.engagement_id}/pages/${context.page.id}`}>↗</Link></div>;
}
function CustomCell({ property }: { property: CustomProperty }) {
  const context = useContext(RowContext)!;
  const query = useQuery({ queryKey: ['workspace', context.page.engagement_id, 'custom-values', context.page.id], queryFn: () => phase3Api.customValues(context.page.engagement_id, context.page.id) });
  const item = query.data?.find(value => value.definition.id === property.id);
  const value = item?.value;
  async function change(raw: string | boolean) {
    let next: unknown = raw;
    if (property.data_type === 'number') next = raw === '' ? null : Number(raw);
    if (property.data_type === 'multi_select' || property.data_type === 'relation') next = String(raw).split(',').map(value => value.trim()).filter(Boolean);
    await phase3Api.setCustomValue(context.page.engagement_id, context.page.id, property.id, next);
    await query.refetch();
  }
  if (property.data_type === 'checkbox') return <input aria-label={`${property.name} for ${context.page.display_id}`} type="checkbox" checked={Boolean(value)} onChange={event => void change(event.target.checked)} />;
  if (property.data_type === 'single_select') return <select aria-label={`${property.name} for ${context.page.display_id}`} value={String(value ?? '')} onChange={event => void change(event.target.value)}><option value="">None</option>{property.allowed_values.map(option => <option key={option}>{option}</option>)}</select>;
  return <input aria-label={`${property.name} for ${context.page.display_id}`} type={property.data_type === 'date' ? 'date' : property.data_type === 'number' ? 'number' : property.data_type === 'url' ? 'url' : 'text'} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={event => void change(event.target.value)} />;
}
function EditableRow({
  row,
  deleted,
  onRestore,
  onDelete
}: {
  row: Row<Page>;
  deleted: boolean;
  onRestore: (p: Page) => Promise<void>;
  onDelete: (p: Page) => void;
}) {
  const page = row.original;
  const save = useAutosave(page);
  const [title, setTitle] = useState(page.title);
  const [properties, setProperties] = useState(page.record!);
  const [error, setError] = useState<unknown>();
  const [blocked, setBlocked] = useState(false);
  const [observation,setObservation]=useState(false);
  const [linked,setLinked]=useState(false);
  const revision = useRef(page.revision);
  useEffect(() => {
    if (page.revision > revision.current && save.status === 'Saved') {
      revision.current = page.revision;
      setTitle(page.title);
      setProperties(page.record!);
    }
  }, [page, save.status]);
  function edit(field: keyof RecordChanges | 'title', value: unknown) {
    setError(null);
    if (field === 'title') {
      setTitle(String(value));
      if (String(value).trim()) save.change({
        title: String(value)
      });
      return;
    }
    if (properties.kind === 'asset' && field === 'scope_state' && value === 'In Scope' && !properties.authorization_confirmed) {
      setError(new Error('Open this asset and explicitly confirm testing authorization before selecting In Scope.'));
      return;
    }
    if (properties.kind === 'backlog' && field === 'status' && value === 'Blocked' && !properties.blocker_reason) {
      setBlocked(true);
      return;
    }
    setProperties({
      ...properties,
      [field]: value
    } as RecordProperties);
    save.change({
      [field]: value
    } as PageChanges);
  }
  return <RowContext.Provider value={{
    page,
    title,
    properties,
    edit
  }}><tr>{row.getVisibleCells().map(cell => <td key={cell.id}>{deleted ? cell.column.id === 'title' ? page.title : cell.column.id === 'actions' ? <Button variant="outline" size="sm" onClick={() => void onRestore(page)}>Restore {page.title}</Button> : cell.column.id === 'display_id' ? page.display_id : displayValue(valueOf(page.record, cell.column.id)) : cell.column.id === 'actions' ? <div className="row-actions">{page.record?.kind==='surface'?<Button variant="ghost" size="sm" aria-label={`Add observation to ${page.title}`} onClick={()=>setObservation(true)}>Observe</Button>:null}<Button variant="ghost" size="sm" aria-label={`Create linked record from ${page.title}`} onClick={()=>setLinked(true)}>Link +</Button><Button variant="ghost" size="sm" aria-label={`Delete ${page.title}`} onClick={() => onDelete(page)}>Trash</Button></div> : flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>{!title.trim() ? <tr><td colSpan={row.getVisibleCells().length}><p role="alert">Title cannot be empty.</p></td></tr> : null}{error || save.status === 'Save Failed' ? <tr><td colSpan={row.getVisibleCells().length}>{error ? <ErrorMessage error={error} /> : null}{save.status === 'Save Failed' ? <SaveFeedback save={save} /> : null}</td></tr> : null}{blocked ? <tr><td colSpan={row.getVisibleCells().length}><BlockReasonDialog onClose={() => setBlocked(false)} onSubmit={reason => {
          setBlocked(false);
          setProperties({
            ...properties,
            status: 'Blocked',
            blocker_reason: reason
          } as RecordProperties);
          save.change({
            status: 'Blocked',
            blocker_reason: reason
          });
        }} /></td></tr> : null}{observation?<tr><td colSpan={row.getVisibleCells().length}><ObservationDialog page={page} onClose={()=>setObservation(false)}/></td></tr>:null}{linked?<tr><td colSpan={row.getVisibleCells().length}><CreateRecordDialog eid={page.engagement_id} initialKind={nextRelatedKind(page.record!.kind)} source={page} onClose={()=>setLinked(false)}/></td></tr>:null}</RowContext.Provider>;
}
export function RecordTable({
  eid,
  kind,
  savedView,
  onCreate
}: {
  eid: string;
  kind: RecordKind;
  savedView?: SavedView | null;
  onCreate: () => void;
}) {
  const config = configs[kind];
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{
    id: 'created_at',
    desc: false
  }]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState(20);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<unknown>();
  const [remove, setRemove] = useState<Page | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [bulkField, setBulkField] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    if (!savedView) return;
    setFilters(savedView.config.filters.map(item => ({ id: item.field, value: String(item.value ?? '') })));
    setSorting(savedView.config.sorts.map(item => ({ id: item.field, desc: item.direction === 'desc' })));
    setColumnSizing(savedView.config.column_widths);
    setIndex(0);
  }, [savedView?.id]);
  const filterValues = Object.fromEntries(filters.map(f => [f.id, String(f.value)]));
  const params = {
    q: search,
    offset: String(index * size),
    limit: String(size),
    sort: sorting[0]?.id ?? 'created_at',
    direction: sorting[0]?.desc ? 'desc' : 'asc',
    deleted: String(deleted),
    filters: JSON.stringify(filterValues)
  };
  const query = useQuery({
    queryKey: recordKeys.list(eid, kind, params),
    queryFn: () => recordApi.list(eid, kind, params)
  });
  const customProperties = useQuery({ queryKey: ['workspace', eid, 'custom-properties', kind], queryFn: () => phase3Api.properties(eid, kind) });
  async function transition(action: () => void) {
    try {
      await saves.flush();
      setError(null);
      action();
    } catch (error) {
      setError(error);
    }
  }
  useEffect(() => {
    if(q===search)return;
    const timer = setTimeout(() => {
      void saves.flush().then(()=>{setSearch(q);setIndex(0);}).catch(setError);
    }, 300);
    return () => clearTimeout(timer);
  }, [q,search]);
  const columns = useMemo<ColumnDef<Page>[]>(() => [{
    id: 'select',
    header: ({ table }) => <input aria-label="Select all visible records" type="checkbox" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
    cell: ({ row }) => <input aria-label={`Select ${row.original.title}`} type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    enableSorting: false
  }, {
    id: 'display_id',
    accessorKey: 'display_id',
    header: 'ID',
    cell: info => <span className="record-id">{info.row.original.display_id}</span>
  }, {
    id: 'title',
    accessorKey: 'title',
    header: kind === 'asset' ? 'Name' : 'Title',
    cell: () => <TitleCell />
  }, ...config.columns.map(key => {
    const field = config.fields.find(f => f.key === key);
    return {
      id: key,
      header: field?.label ?? key,
      accessorFn: (p: Page) => displayValue(valueOf(p.record, key)),
      cell: () => field ? <InlineCell field={field} /> : <span>—</span>
    } as ColumnDef<Page>;
  }), ...(customProperties.data ?? []).filter(property => property.visible).map(property => ({ id: `custom:${property.id}`, header: property.name, enableSorting: false, cell: () => <CustomCell property={property} /> } as ColumnDef<Page>)), ...(kind === 'surface' ? [{
    id: 'duplicates',
    header: 'Duplicates',
    enableSorting: false,
    cell: info => <span className="status-pill">{info.row.original.record?.kind === 'surface' && info.row.original.record.duplicate_ids.length ? 'Possible duplicate' : '—'}</span>
  } as ColumnDef<Page>] : []), {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: () => null
  }], [config, kind, customProperties.data]);
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    rowCount: query.data?.total ?? 0,
    state: {
      sorting,
      columnFilters: filters,
      rowSelection: selection,
      columnSizing,
      columnOrder: savedView?.config.column_order.length ? ['select', ...savedView.config.column_order, 'actions'] : [],
      columnVisibility: savedView?.config.columns.length ? Object.fromEntries(columns.map(column => [String(column.id), ['select', 'actions', ...savedView.config.columns].includes(String(column.id))])) : {},
      pagination: {
        pageIndex: index,
        pageSize: size
      }
    },
    onRowSelectionChange: setSelection,
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
    enableRowSelection: true,
    getRowId: row => row.id,
    onSortingChange: updater => void transition(() => {
      setSorting(old => typeof updater === 'function' ? updater(old) : updater);
      setIndex(0);
    })
  });
  async function restore(page: Page) {
    try {
      await recordApi.restore(page);
      await query.refetch();
    } catch (error) {
      setError(error);
    }
  }
  async function deleteRecord() {
    if (!remove) return;
    try {
      await saves.flush();
      await recordApi.remove(remove);
      setRemove(null);
      await query.refetch();
    } catch (error) {
      setError(error);
    }
  }
  function filter(field: string, value: string) {
    void transition(() => {
      setFilters(old => [...old.filter(f => f.id !== field), ...(value ? [{
        id: field,
        value
      }] : [])]);
      setIndex(0);
    });
  }
  const selected = table.getSelectedRowModel().rows.map(row => row.original);
  async function bulk() {
    if (!selected.length || !bulkField) return;
    const spec = config.fields.find(field => field.key === bulkField);
    const custom = customProperties.data?.find(property => `custom:${property.id}` === bulkField);
    let value: unknown = bulkValue;
    if (spec?.type === 'boolean') value = bulkValue === 'true';
    if (spec?.type === 'number') value = Number(bulkValue);
    if (custom?.data_type === 'checkbox') value = bulkValue === 'true';
    if (custom?.data_type === 'number') value = Number(bulkValue);
    if (custom?.data_type === 'multi_select' || custom?.data_type === 'relation') value = bulkValue.split(',').map(item => item.trim()).filter(Boolean);
    try {
      await phase3Api.bulk(eid, selected.map(page => page.id), Object.fromEntries(selected.map(page => [page.id, page.revision])), bulkField, value);
      setSelection({});
      await query.refetch();
    } catch (caught) { setError(caught); }
  }
  function exportCsv() {
    if (savedView) {
      const selectedQuery = selected.length ? `?selected=${encodeURIComponent(selected.map(page => page.id).join(','))}` : '';
      const anchor = document.createElement('a'); anchor.href = `/api/v1/engagements/${eid}/saved-views/${savedView.id}/export.csv${selectedQuery}`; anchor.download = `${kind}-${savedView.name}.csv`; anchor.click();
      return;
    }
    const rows = selected.length ? selected : (query.data?.items ?? []);
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [['id', 'display_id', 'title', ...config.columns], ...rows.map(page => [page.id, page.display_id, page.title, ...config.columns.map(key => displayValue(valueOf(page.record, key)))])].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${kind}-view.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="record-database"><div className="database-toolbar"><input aria-label="Search records" placeholder={`Search ${config.label.toLowerCase()}…`} value={q} onChange={e => setQ(e.target.value)} /><Button size="sm" variant="outline" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={14} /> Filter{filters.length ? ` (${filters.length})` : ''}</Button><Button size="sm" onClick={onCreate}>Create {config.singular.toLowerCase()}</Button></div>
 {selected.length ? <div className="bulk-bar" role="toolbar" aria-label="Bulk edit records"><strong>{selected.length} selected</strong><select aria-label="Bulk field" value={bulkField} onChange={event => setBulkField(event.target.value)}><option value="">Choose field…</option>{config.fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}{customProperties.data?.filter(property => property.visible).map(property => <option key={property.id} value={`custom:${property.id}`}>{property.name}</option>)}</select><input aria-label="Bulk value" value={bulkValue} onChange={event => setBulkValue(event.target.value)} /><Button size="sm" onClick={() => void bulk()}>Update selected</Button><Button size="sm" variant="outline" onClick={exportCsv}>Export selected CSV</Button></div> : <Button size="sm" variant="outline" onClick={exportCsv}>Export visible CSV</Button>}
 {error ? <ErrorMessage error={error} /> : null}{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : <><div className="table-scroll"><table className="structured-table" aria-label={config.label}><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} style={{ width: header.getSize() }}>{header.column.getCanSort() ? <button aria-label={`Sort ${String(header.column.columnDef.header)}`} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : '↕'}</button> : flexRender(header.column.columnDef.header, header.getContext())}<span className={`column-resizer ${header.column.getIsResizing() ? 'resizing' : ''}`} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} /></th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <EditableRow key={row.original.id} row={row} deleted={deleted} onRestore={restore} onDelete={setRemove} />)}</tbody></table></div>{!query.data.items.length ? <Empty>{deleted ? 'No deleted records.' : 'No records match. Create a record or adjust your filters.'}</Empty> : null}<div className="pagination"><Button size="sm" variant="outline" disabled={index === 0} onClick={() => void transition(() => setIndex(i => i - 1))}>Previous page</Button><span>Page {index + 1} · {query.data.total} records</span><Button size="sm" variant="outline" disabled={(index + 1) * size >= query.data.total} onClick={() => void transition(() => setIndex(i => i + 1))}>Next page</Button><select aria-label="Rows per page" value={size} onChange={e => void transition(() => {
          setSize(Number(e.target.value));
          setIndex(0);
        })}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} rows</option>)}</select></div><p className="editor-hint">Tab moves through columns. Enter opens a link or changes the sort.</p></>}
 {remove ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Delete record"><h2>Move {remove.title} to trash?</h2><p>Relationships and documents remain stored. Linked panels will show an unavailable record until restored.</p><Button variant="destructive" onClick={() => void deleteRecord()}>Move to trash</Button><Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button></div></div> : null}
 {filterOpen ? <div className="dialog-backdrop"><div className="dialog filter-dialog" role="dialog" aria-modal="true" aria-label={`Filter and sort ${config.label}`}><h2>Filter and sort</h2><div className="filter-dialog-fields">{config.filters.map(key => {
        const spec = config.fields.find(field => field.key === key);
        const selectedFilter = String(filters.find(item => item.id === key)?.value ?? '');
        return <label key={key}>{spec?.label ?? key}{spec?.choices ? <select aria-label={`Filter ${spec.label}`} value={selectedFilter} onChange={event => filter(key, event.target.value)}><option value="">All</option>{spec.choices.map(choice => <option key={choice}>{choice}</option>)}</select> : <input aria-label={`Filter ${spec?.label ?? key}`} value={selectedFilter} placeholder="Exact value" onChange={event => filter(key, event.target.value)} />}</label>;
      })}<label>Sort by<select aria-label="Sort records by" value={sorting[0]?.id ?? 'created_at'} onChange={event => void transition(() => { setSorting([{ id: event.target.value, desc: sorting[0]?.desc ?? false }]); setIndex(0); })}><option value="created_at">Created</option><option value="updated_at">Updated</option><option value="title">Title</option>{config.fields.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label><label>Direction<select aria-label="Sort direction" value={sorting[0]?.desc ? 'desc' : 'asc'} onChange={event => void transition(() => setSorting([{ id: sorting[0]?.id ?? 'created_at', desc: event.target.value === 'desc' }]))}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label className="checkbox-label"><input aria-label="Show deleted records" type="checkbox" checked={deleted} onChange={event => void transition(() => { setDeleted(event.target.checked); setIndex(0); })} />Show trash</label></div><div className="dialog-actions"><Button variant="outline" onClick={() => { setFilters([]); setSorting([{ id: 'created_at', desc: false }]); setDeleted(false); setIndex(0); }}>Clear</Button><Button onClick={() => setFilterOpen(false)}>Done</Button></div></div></div> : null}
 </div>;
}
