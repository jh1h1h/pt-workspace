import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { extensions } from './extensions';
import { blockCommands } from './commands';
import { Button } from '../components/ui/button';
import { phase3Api, type SavedView, type SearchResult } from '../api/phase3';
import { moveCurrentBlock } from './phase3Extensions';
import { CreatePageDialog } from '../components/CreatePageDialog';
import { Redo2, Undo2 } from 'lucide-react';
export function RichEditor({
  content,
  onChange,
  label = 'Document',
  engagementId = '',
  parentPageId
}: {
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
  label?: string;
  engagementId?: string;
  parentPageId?: string;
}) {
  const effectiveEngagementId = engagementId || window.location.pathname.match(/^\/e\/([^/]+)/)?.[1] || '';
  const callback = useRef(onChange);
  callback.current = onChange;
  const [slash, setSlash] = useState<{
    from: number;
    to: number;
    query: string;
  } | null>(null);
  const [index, setIndex] = useState(0);
  const [formatVersion, setFormatVersion] = useState(0);
  const [invalid, setInvalid] = useState('');
  const [reference, setReference] = useState<{ from: number; to: number; query: string; kind: 'mention' | 'wikiLink' } | null>(null);
  const [referenceResults, setReferenceResults] = useState<SearchResult[]>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [pageAction, setPageAction] = useState<'create' | 'link' | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [pageResults, setPageResults] = useState<SearchResult[]>([]);
  const [resourcePicker, setResourcePicker] = useState<'evidenceImage' | 'fileAttachment' | 'databaseView' | null>(null);
  const [resourceSearch, setResourceSearch] = useState('');
  const [evidenceResults, setEvidenceResults] = useState<SearchResult[]>([]);
  const [viewResults, setViewResults] = useState<SavedView[]>([]);
  const [resourceError, setResourceError] = useState('');
  const referenceQuery = reference?.query;
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const referenceRef = useRef(reference);
  referenceRef.current = reference;
  const referenceResultsRef = useRef(referenceResults);
  referenceResultsRef.current = referenceResults;
  const referenceIndexRef = useRef(referenceIndex);
  referenceIndexRef.current = referenceIndex;
  const commands: { label: string; run: (editor: Editor) => void }[] = [
    ...blockCommands,
    { label: 'Evidence image', run: () => setResourcePicker('evidenceImage') },
    { label: 'File attachment', run: () => setResourcePicker('fileAttachment') },
    { label: 'Database view', run: () => setResourcePicker('databaseView') },
    ...(parentPageId ? [{ label: 'Create child page', run: () => setPageAction('create' as const) }] : []),
    { label: 'Link page', run: () => setPageAction('link') }
  ];
  const filtered = commands.filter(command => command.label.toLowerCase().includes(slash?.query.toLowerCase() ?? ''));
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const indexRef = useRef(index);
  indexRef.current = index;
  function inspect(editor: Editor) {
    const {
      $from
    } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc');
    const match = before.match(/(?:^|\s)\/([a-zA-Z0-9 ]*)$/);
    const wiki = before.match(/\[\[([^\]]*)$/);
    const mention = before.match(/(?:^|\s)@([\w -]*)$/);
    if (wiki || mention) {
      const query = String((wiki || mention)?.[1] ?? '');
      setReference({ from: $from.pos - query.length - (wiki ? 2 : 1), to: $from.pos, query, kind: wiki ? 'wikiLink' : 'mention' });
      setReferenceIndex(0);
      setSlash(null);
    } else setReference(null);
    if (match && !wiki && !mention) {
      setSlash({
        from: $from.pos - match[1].length - 1,
        to: $from.pos,
        query: match[1]
      });
      setIndex(0);
    } else setSlash(null);
  }
  useEffect(() => {
    if (referenceQuery === undefined || !effectiveEngagementId) {
      setReferenceResults([]);
      return;
    }
    const timer = window.setTimeout(() => void phase3Api.search(effectiveEngagementId, referenceQuery || '*').then(setReferenceResults).catch(() => setReferenceResults([])), 150);
    return () => window.clearTimeout(timer);
  }, [referenceQuery, effectiveEngagementId]);
  useEffect(() => {
    if (pageAction !== 'link' || !effectiveEngagementId) return;
    const timer = window.setTimeout(() => void phase3Api.search(effectiveEngagementId, pageSearch || '*').then(results => setPageResults(results.filter(result => result.id !== parentPageId))).catch(() => setPageResults([])), 150);
    return () => window.clearTimeout(timer);
  }, [pageAction, pageSearch, effectiveEngagementId, parentPageId]);
  useEffect(() => {
    if (!resourcePicker || !effectiveEngagementId) return;
    let active = true;
    setResourceError('');
    const timer = window.setTimeout(() => {
      const load = resourcePicker === 'databaseView'
        ? phase3Api.views(effectiveEngagementId).then(items => {
            if (active) setViewResults(items.filter(item => item.name.toLowerCase().includes(resourceSearch.toLowerCase())));
          })
        : phase3Api.search(effectiveEngagementId, resourceSearch || '*', resourceSearch ? 'evidence' : '').then(items => {
            if (active) setEvidenceResults(items.filter(item => item.kind === 'evidence'));
          });
      void load.catch(error => { if (active) setResourceError(error instanceof Error ? error.message : 'Unable to load records.'); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [resourcePicker, resourceSearch, effectiveEngagementId]);
  function insertReference(target: SearchResult) {
    const current = referenceRef.current;
    if (!current || !editorRef.current) return;
    editorRef.current.chain().focus().deleteRange({ from: current.from, to: current.to }).insertContent({ type: current.kind, attrs: { recordId: target.id, label: target.title } }).insertContent(' ').run();
    setReference(null);
  }
  function insert(editor: Editor, command: { label: string; run: (editor: Editor) => void }) {
    const current = slashRef.current;
    if (current) editor.chain().focus().deleteRange({
      from: current.from,
      to: current.to
    }).run();
    setSlash(null);
    command.run(editor);
  }
  function insertPageLink(target: Pick<SearchResult, 'id' | 'title'>) {
    editorRef.current?.chain().focus().insertContent({ type: 'wikiLink', attrs: { recordId: target.id, label: target.title } }).insertContent(' ').run();
    setPageAction(null);
    setPageSearch('');
  }
  function insertEvidence(target: SearchResult) {
    if (!editorRef.current || !resourcePicker || resourcePicker === 'databaseView') return;
    const content = resourcePicker === 'evidenceImage'
      ? { type: 'evidenceImage', attrs: { evidenceId: target.id, alt: target.title, caption: target.title } }
      : { type: 'fileAttachment', attrs: { evidenceId: target.id, label: target.title } };
    editorRef.current.chain().focus().insertContent(content).run();
    setResourcePicker(null);
    setResourceSearch('');
  }
  function insertView(target: SavedView) {
    editorRef.current?.chain().focus().insertContent({ type: 'databaseView', attrs: { viewId: target.id } }).run();
    setResourcePicker(null);
    setResourceSearch('');
  }
  const editor = useEditor({
    extensions: extensions(effectiveEngagementId),
    content,
    enableContentCheck: true,
    onContentError: ({
      error
    }) => setInvalid(`Unsupported content: ${error.message}. Original JSON is preserved. Download it before making changes.`),
    editorProps: {
      attributes: {
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true'
      },
      handleKeyDown: (_view, event) => {
        if (referenceRef.current) {
          if (event.key === 'Escape') { setReference(null); return true; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            setReferenceIndex(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(referenceResultsRef.current.length, 1)) % Math.max(referenceResultsRef.current.length, 1));
            return true;
          }
          if (event.key === 'Enter' && referenceResultsRef.current.length) {
            const target = referenceResultsRef.current[referenceIndexRef.current];
            if (target) insertReference(target);
            return true;
          }
        }
        if (!slashRef.current) return false;
        if (event.key === 'Escape') {
          setSlash(null);
          return true;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setIndex(i => (i + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(filteredRef.current.length, 1)) % Math.max(filteredRef.current.length, 1));
          return true;
        }
        if (event.key === 'Enter' && filteredRef.current.length) {
          const command = filteredRef.current[indexRef.current];
          if (command && editorRef.current) insert(editorRef.current, command);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const plain = event.clipboardData?.getData('text/plain') ?? '';
        if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|HTTP\/\d)/m.test(plain) && /\r?\n/.test(plain)) {
          event.preventDefault();
          editorRef.current?.chain().focus().insertContent({ type: 'codeBlock', attrs: { language: 'http' }, content: plain ? [{ type: 'text', text: plain }] : [] }).run();
          return true;
        }
        return false;
      }
    },
    onUpdate: ({
      editor
    }) => {
      if (!invalidRef.current) callback.current(editor.getJSON());
      inspect(editor);
    },
    onSelectionUpdate: ({
      editor
    }) => {
      inspect(editor);
      setFormatVersion(v => v + 1);
    }
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const invalidRef = useRef(invalid);
  invalidRef.current = invalid;
  useEffect(() => {
    if (invalid) editor?.setEditable(false);
  }, [invalid, editor]);
  if (!editor) return <p>Loading editor…</p>;
  const marks: [string, () => void, string][] = [['Bold', () => {
    editor.chain().focus().toggleBold().run();
  }, 'bold'], ['Italic', () => {
    editor.chain().focus().toggleItalic().run();
  }, 'italic'], ['Underline', () => {
    editor.chain().focus().toggleUnderline().run();
  }, 'underline'], ['Inline code', () => {
    editor.chain().focus().toggleCode().run();
  }, 'code']];
  function downloadOriginal() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='unsupported-original.json';anchor.click();URL.revokeObjectURL(url);
  }
  return <div className="rich-editor" data-format-version={formatVersion}>
  {invalid ? <div><p role="alert">{invalid}</p><Button variant="outline" onClick={downloadOriginal}>Download original JSON</Button></div> : null}
  <div className="editor-toolbar" aria-label={`${label} formatting`}>
   {marks.map(([name, action, mark]) => <Button key={name} variant="ghost" size="sm" aria-label={name} aria-pressed={editor.isActive(mark)} onMouseDown={e => e.preventDefault()} onClick={action}>{name === 'Inline code' ? '<>' : name[0]}</Button>)}
   <select aria-label="Insert block" value="" onChange={e => {
        const command = commands.find(c => c.label === e.target.value);
        if (command) command.run(editor);
      }}><option value="">Insert block…</option>{commands.map(c => <option key={c.label}>{c.label}</option>)}</select>
   <Button variant="ghost" size="icon" aria-label="Undo" title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={14} /></Button><Button variant="ghost" size="icon" aria-label="Redo" title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={14} /></Button>
   <select aria-label="Block actions" value="" onChange={event => {
        if (event.target.value === 'up') moveCurrentBlock({ editor, direction: -1 });
        if (event.target.value === 'down') moveCurrentBlock({ editor, direction: 1 });
        if (event.target.value === 'duplicate') {
          const { $from } = editor.state.selection;
          if ($from.depth) editor.chain().focus().insertContentAt($from.after(1), $from.node(1).toJSON()).run();
        }
      }}><option value="">Block actions…</option><option value="up">Move block up</option><option value="down">Move block down</option><option value="duplicate">Duplicate block</option></select>
   {editor.isActive('codeBlock') ? <input aria-label="Code language" placeholder="Language" value={editor.getAttributes('codeBlock').language ?? ''} onChange={e => editor.chain().focus().updateAttributes('codeBlock', {
        language: e.target.value
      }).run()} /> : null}
   {editor.isActive('table') ? <><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Button><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</Button><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button></> : null}
  </div>
  <EditorContent editor={editor} />
  {slash ? <div role="listbox" aria-label="Slash commands" className="slash-menu">{filtered.length ? filtered.map((command, i) => <button type="button" role="option" aria-selected={i === index} key={command.label} onMouseDown={e => e.preventDefault()} onClick={() => insert(editor, command)}>{command.label}</button>) : <span>No matching block</span>}</div> : null}
  {reference ? <div role="listbox" aria-label={reference.kind === 'mention' ? 'Mention records' : 'Link pages'} className="slash-menu">{referenceResults.length ? referenceResults.map((target, i) => <button type="button" role="option" aria-selected={i === referenceIndex} key={target.id} onMouseDown={e => e.preventDefault()} onClick={() => insertReference(target)}><strong>{target.title}</strong> <small>{target.kind} · {target.display_id}</small></button>) : <span>No matching records</span>}</div> : null}
  {pageAction === 'create' && parentPageId ? <CreatePageDialog eid={effectiveEngagementId} parentId={parentPageId} onClose={() => setPageAction(null)} onCreated={insertPageLink} /> : null}
  {pageAction === 'link' ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Link existing page"><h2>Link existing page</h2><input autoFocus aria-label="Search pages to link" placeholder="Search pages…" value={pageSearch} onChange={event => setPageSearch(event.target.value)} /><ul className="record-picker">{pageResults.map(result => <li key={result.id}><button type="button" onClick={() => insertPageLink(result)}><span>{result.title}<small>{result.kind} · {result.display_id}</small></span></button></li>)}</ul>{!pageResults.length ? <p className="muted">No matching pages.</p> : null}<Button variant="outline" onClick={() => setPageAction(null)}>Cancel</Button></div></div> : null}
  {resourcePicker ? <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-label="Insert workspace resource"><h2>{resourcePicker === 'databaseView' ? 'Insert saved database view' : resourcePicker === 'evidenceImage' ? 'Insert evidence image' : 'Insert evidence file'}</h2><input autoFocus aria-label="Search workspace resources" placeholder="Search…" value={resourceSearch} onChange={event => setResourceSearch(event.target.value)} />{resourceError ? <p role="alert">{resourceError}</p> : null}<ul className="record-picker">{resourcePicker === 'databaseView' ? viewResults.map(view => <li key={view.id}><button type="button" onClick={() => insertView(view)}><span>{view.name}<small>{view.record_type} · {view.view_type}</small></span></button></li>) : evidenceResults.map(result => <li key={result.id}><button type="button" onClick={() => insertEvidence(result)}><span>{result.title}<small>{result.display_id}</small></span></button></li>)}</ul>{!(resourcePicker === 'databaseView' ? viewResults : evidenceResults).length && !resourceError ? <p className="muted">No matching saved resources.</p> : null}<Button variant="outline" onClick={() => { setResourcePicker(null); setResourceSearch(''); }}>Cancel</Button></div></div> : null}
  <p className="editor-hint">Type / for blocks · @ to mention · [[ to link · Ctrl/⌘ B for bold · Ctrl/⌘ Z to undo</p>
 </div>;
}
