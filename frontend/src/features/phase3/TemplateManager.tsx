import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { phase3Api } from '../../api/phase3';
import { api } from '../../api/client';
import type { Page } from '../../api/types';
import { saves } from '../../hooks/saveCoordinator';
import { Button } from '../../components/ui/button';
import { Empty, ErrorMessage, Loading } from '../../components/Feedback';

const templateTypes = ['note', 'journal', 'surface', 'test_case', 'finding', 'backlog', 'task'];

export function TemplateManager({ eid }: { eid: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['workspace', eid, 'content-templates'], queryFn: () => phase3Api.contentTemplates(eid) });
  const [name, setName] = useState('');
  const [kind, setKind] = useState('note');
  const [instantiate, setInstantiate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [remove, setRemove] = useState<string | null>(null);
  const [error, setError] = useState<unknown>();
  async function refresh() { await client.invalidateQueries({ queryKey: ['workspace', eid, 'content-templates'] }); }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      await phase3Api.createContentTemplate(eid, { name, record_type: kind, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] }, { type: 'paragraph' }] } });
      setName('');
      await refresh();
    } catch (caught) { setError(caught); }
  }
  async function instantiateSelectedTemplate() {
    if (!instantiate || !title.trim()) return;
    try {
      const created = await phase3Api.instantiateTemplate(eid, instantiate, title);
      await client.invalidateQueries({ queryKey: ['workspace', eid] });
      await navigate(`/e/${eid}/pages/${created.id}`);
    } catch (caught) { setError(caught); }
  }
  return <section aria-label="Reusable templates">
    <h2>Reusable templates</h2>
    <p className="section-caption">Templates create real records with copied Tiptap blocks and default properties. Editing a template never changes existing records.</p>
    <Button variant="outline" onClick={() => void phase3Api.initializeTemplates(eid).then(refresh).catch(setError)}>Add sample templates</Button>
    <form className="database-toolbar" onSubmit={event => void create(event)}>
      <input aria-label="Template name" value={name} onChange={event => setName(event.target.value)} placeholder="Template name" required />
      <select aria-label="Template record type" value={kind} onChange={event => setKind(event.target.value)}>{templateTypes.map(value => <option key={value}>{value}</option>)}</select>
      <Button>Create template</Button>
    </form>
    {query.isPending ? <Loading /> : query.error ? <ErrorMessage error={query.error} /> : query.data.length ? <ul className="template-list">{query.data.map(template => <li key={template.id}><span><Link to={`/e/${eid}/pages/${template.page.id}`}>{template.name}</Link><small>{template.record_type}</small></span><Button size="sm" variant="outline" onClick={() => { setInstantiate(template.id); setTitle(`New ${template.name}`); }}>Use</Button><Button size="sm" variant="outline" onClick={() => void phase3Api.duplicateContentTemplate(eid, template.id).then(refresh).catch(setError)}>Duplicate</Button><Button size="sm" variant="ghost" onClick={() => setRemove(template.id)}>Delete</Button></li>)}</ul> : <Empty>No reusable templates yet.</Empty>}
    {instantiate ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Use template"><h3>Create from template</h3><label>Title<input autoFocus aria-label="New record title" value={title} onChange={event => setTitle(event.target.value)} /></label><Button onClick={() => void instantiateSelectedTemplate()}>Create record</Button><Button variant="outline" onClick={() => setInstantiate(null)}>Cancel</Button></div></div> : null}
    {remove ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Delete template"><h3>Delete this template?</h3><p>Records previously created from it remain unchanged.</p><Button variant="destructive" onClick={() => void phase3Api.deleteContentTemplate(eid, remove).then(() => { setRemove(null); return refresh(); }).catch(setError)}>Delete template</Button><Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button></div></div> : null}
    {error ? <ErrorMessage error={error} /> : null}
  </section>;
}

const canonical: Record<'task' | 'backlog' | 'finding', string[]> = {
  task: ['Open', 'In Progress', 'Done'],
  backlog: ['Queued', 'In Progress', 'Blocked', 'Completed', 'Skipped'],
  finding: ['Candidate', 'Validating', 'Confirmed', 'Inconclusive', 'Dismissed', 'Report Ready']
};

export function WorkflowSettings({ eid }: { eid: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['workspace', eid, 'workflow-options'], queryFn: () => phase3Api.workflowOptions(eid) });
  const [kind, setKind] = useState<'task' | 'backlog' | 'finding'>('task');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('Open');
  const [error, setError] = useState<unknown>();
  function changeKind(value: 'task' | 'backlog' | 'finding') { setKind(value); setCategory(canonical[value][0]); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await phase3Api.createWorkflowOption(eid, { record_type: kind, label, canonical_category: category, display_order: query.data?.length ?? 0 });
      setLabel('');
      await client.invalidateQueries({ queryKey: ['workspace', eid, 'workflow-options'] });
    } catch (caught) { setError(caught); }
  }
  return <section><h2>Workflow labels</h2><p className="section-caption">Custom labels always map to canonical completion and finding-validation semantics.</p><form className="database-toolbar" onSubmit={event => void submit(event)}><select aria-label="Workflow record type" value={kind} onChange={event => changeKind(event.target.value as typeof kind)}>{Object.keys(canonical).map(value => <option key={value}>{value}</option>)}</select><input aria-label="Workflow label" value={label} onChange={event => setLabel(event.target.value)} placeholder="Display label" required /><select aria-label="Canonical workflow category" value={category} onChange={event => setCategory(event.target.value)}>{canonical[kind].map(value => <option key={value}>{value}</option>)}</select><Button>Create label</Button></form>{query.data?.length ? <ul className="template-list">{query.data.map(option => <li key={option.id}><strong>{option.label}</strong><span>{option.record_type} → {option.canonical_category}</span></li>)}</ul> : <Empty>No custom workflow labels.</Empty>}{error ? <ErrorMessage error={error} /> : null}</section>;
}

export function WorkflowControl({ page }: { page: Page }) {
  const client = useQueryClient();
  const kind = page.task ? 'task' : page.record?.kind === 'backlog' || page.record?.kind === 'finding' ? page.record.kind : '';
  const query = useQuery({ queryKey: ['workspace', page.engagement_id, 'workflow-options', kind], queryFn: () => phase3Api.workflowOptions(page.engagement_id, kind), enabled: Boolean(kind) });
  const [error, setError] = useState<unknown>();
  if (!kind || !query.data?.length) return null;
  async function apply(option: string) {
    if (!option) return;
    try {
      await saves.flush();
      const latest = await api.page(page.engagement_id, page.id);
      await phase3Api.applyWorkflowOption(latest, option);
      await client.invalidateQueries({ queryKey: ['workspace', page.engagement_id] });
    } catch (caught) { setError(caught); }
  }
  return <div className="workflow-control"><label>Custom workflow label<select aria-label="Custom workflow label" defaultValue="" onChange={event => void apply(event.target.value)}><option value="">Choose label…</option>{query.data.map(option => <option key={option.id} value={option.id}>{option.label} → {option.canonical_category}</option>)}</select></label>{error ? <ErrorMessage error={error} /> : null}</div>;
}
