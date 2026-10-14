import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '../../api/types';
import { phase3Api, type CustomProperty, type PropertyType } from '../../api/phase3';
import { Button } from '../../components/ui/button';
import { ErrorMessage, Empty, Loading } from '../../components/Feedback';

export function ValueInput({ property, value, onChange, label }: { property: CustomProperty; value: unknown; onChange: (value: unknown) => void; label: string }) {
  if (property.data_type === 'checkbox') return <input aria-label={label} type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />;
  if (property.data_type === 'single_select') return <select aria-label={label} value={String(value ?? '')} onChange={event => onChange(event.target.value)}><option value="">None</option>{property.allowed_values.map(option => <option key={option}>{option}</option>)}</select>;
  if (property.data_type === 'multi_select') return <input aria-label={label} value={Array.isArray(value) ? value.join(', ') : ''} onChange={event => onChange(event.target.value.split(',').map(item => item.trim()).filter(Boolean))} />;
  if (property.data_type === 'number') return <input aria-label={label} type="number" value={String(value ?? '')} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
  if (property.data_type === 'date') return <input aria-label={label} type="date" value={String(value ?? '')} onChange={event => onChange(event.target.value || null)} />;
  if (property.data_type === 'url') return <input aria-label={label} type="url" value={String(value ?? '')} onChange={event => onChange(event.target.value)} />;
  if (property.data_type === 'relation') return <input aria-label={label} placeholder="Record UUIDs, comma separated" value={Array.isArray(value) ? value.join(', ') : ''} onChange={event => onChange(event.target.value.split(',').map(item => item.trim()).filter(Boolean))} />;
  return <input aria-label={label} value={String(value ?? '')} onChange={event => onChange(event.target.value)} />;
}

export function CustomValues({ page }: { page: Page }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['workspace', page.engagement_id, 'custom-values', page.id], queryFn: () => phase3Api.customValues(page.engagement_id, page.id), enabled: Boolean(page.record) });
  const [error, setError] = useState<unknown>();
  if (!page.record) return null;
  async function change(property: CustomProperty, value: unknown) {
    try {
      await phase3Api.setCustomValue(page.engagement_id, page.id, property.id, value);
      await client.invalidateQueries({ queryKey: ['workspace', page.engagement_id, 'custom-values', page.id] });
    } catch (caught) { setError(caught); }
  }
  return <div className="custom-values"><h3>Custom properties</h3>{query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : query.data.filter(item => item.definition.visible).length ? <div className="properties-grid">{query.data.filter(item => item.definition.visible).map(item => <label key={item.definition.id}>{item.definition.name}{item.definition.required ? ' *' : ''}<ValueInput property={item.definition} value={item.value} label={`${item.definition.name} custom property`} onChange={value => void change(item.definition, value)} /></label>)}</div> : <Empty>No custom properties for this record type.</Empty>}{error ? <ErrorMessage error={error} /> : null}</div>;
}

const TYPES: PropertyType[] = ['text', 'number', 'checkbox', 'date', 'single_select', 'multi_select', 'url', 'relation'];
const RECORDS = ['asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence'];
export function PropertySettings({ eid }: { eid: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['workspace', eid, 'custom-properties'], queryFn: () => phase3Api.properties(eid) });
  const [name, setName] = useState(''); const [kind, setKind] = useState('asset'); const [type, setType] = useState<PropertyType>('text'); const [options, setOptions] = useState(''); const [required, setRequired] = useState(false); const [error, setError] = useState<unknown>();
  async function refresh() { await client.invalidateQueries({ queryKey: ['workspace', eid, 'custom-properties'] }); }
  async function create(event: React.FormEvent) { event.preventDefault(); try { await phase3Api.createProperty(eid, { name, record_type: kind, data_type: type, allowed_values: options.split(',').map(v => v.trim()).filter(Boolean), default_value: null, required, display_order: query.data?.length ?? 0, visible: true }); setName(''); await refresh(); } catch (caught) { setError(caught); } }
  return <section><h2>Custom properties</h2><p className="section-caption">Typed fields stay stable when renamed. Type changes that would lose values require explicit confirmation.</p><form className="database-toolbar" onSubmit={event => void create(event)}><input aria-label="Property name" value={name} onChange={event => setName(event.target.value)} placeholder="Property name" required /><select aria-label="Property record type" value={kind} onChange={event => setKind(event.target.value)}>{RECORDS.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Property data type" value={type} onChange={event => setType(event.target.value as PropertyType)}>{TYPES.map(value => <option key={value}>{value}</option>)}</select>{type.includes('select') ? <input aria-label="Allowed values" value={options} onChange={event => setOptions(event.target.value)} placeholder="Allowed values, comma separated" /> : null}<label className="checkbox-label"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Required</label><Button>Create property</Button></form>{query.isPending ? <Loading /> : query.data?.length ? <ul className="template-list">{query.data.map(property => <li key={property.id}><span><strong>{property.name}</strong> · {property.record_type} · {property.data_type}{property.required ? ' · required' : ''}</span><label className="checkbox-label"><input type="checkbox" checked={property.visible} onChange={event => void phase3Api.patchProperty(eid, property.id, { visible: event.target.checked }).then(refresh)} />Visible</label><Button size="sm" variant="outline" onClick={() => { const renamed = window.prompt('Property name', property.name); if (renamed) void phase3Api.patchProperty(eid, property.id, { name: renamed }).then(refresh).catch(setError); }}>Rename</Button><Button size="sm" variant="ghost" onClick={() => void phase3Api.deleteProperty(eid, property.id).then(refresh).catch(setError)}>Delete</Button></li>)}</ul> : <Empty>No custom properties.</Empty>}{error ? <ErrorMessage error={error} /> : null}</section>;
}
