import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { phase3Api } from '../api/phase3';
import { Button } from './ui/button';
import { ErrorMessage } from './Feedback';

export function SearchDialog({ eid, onClose }: { eid: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useQuery({
    queryKey: ['workspace', eid, 'fts-search', search, kind],
    queryFn: () => phase3Api.search(eid, search, kind),
    enabled: search.trim().length > 0
  });
  useEffect(() => { input.current?.focus(); }, []);
  const groups = (results.data ?? []).reduce<Record<string, NonNullable<typeof results.data>>>((all, result) => {
    (all[result.kind] ??= []).push(result);
    return all;
  }, {});
  return <div className="dialog-backdrop"><div role="dialog" aria-modal="true" aria-label="Global search" className="dialog" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(results.data?.length ?? 0, 1)) % Math.max(results.data?.length ?? 0, 1));
    }
    if (event.key === 'Enter' && results.data?.[index]) window.location.assign(`/e/${eid}/pages/${results.data[index].id}`);
  }}><h2>Search this engagement</h2><div className="database-toolbar"><input ref={input} aria-label="Search workspace" value={search} placeholder="Search titles and documents…" onChange={event => { setSearch(event.target.value); setIndex(0); }} /><select aria-label="Search record type" value={kind} onChange={event => setKind(event.target.value)}><option value="">All types</option>{['note', 'journal', 'task', 'asset', 'surface', 'backlog', 'test_case', 'finding', 'evidence'].map(value => <option key={value}>{value}</option>)}</select></div>{results.error ? <ErrorMessage error={results.error} /> : null}<div className="search-results">{Object.entries(groups).map(([type, items]) => <section key={type}><h3>{type}</h3><ul>{items?.map(result => <li key={result.id}><Link className={results.data?.[index]?.id === result.id ? 'selected' : ''} onClick={onClose} to={`/e/${eid}/pages/${result.id}`}><span>{result.title}<small>{result.excerpt}</small></span><span className="muted">{result.display_id}</span></Link></li>)}</ul></section>)}</div>{results.isFetching ? <p role="status">Searching…</p> : search && !results.data?.length ? <p>No matching workspace content.</p> : null}<Button variant="outline" onClick={onClose}>Close search</Button></div></div>;
}
