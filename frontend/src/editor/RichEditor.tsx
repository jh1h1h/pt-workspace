import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { extensions } from './extensions';
import { blockCommands } from './commands';
import { Button } from '../components/ui/button';
import { phase3Api, type SearchResult } from '../api/phase3';
import { moveCurrentBlock } from './phase3Extensions';
export function RichEditor({
  content,
  onChange,
  label = 'Document',
  engagementId = ''
}: {
  content: JSONContent;
  onChange: (doc: JSONContent) => void;
  label?: string;
  engagementId?: string;
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
  const referenceQuery = reference?.query;
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const referenceRef = useRef(reference);
  referenceRef.current = reference;
  const referenceResultsRef = useRef(referenceResults);
  referenceResultsRef.current = referenceResults;
  const referenceIndexRef = useRef(referenceIndex);
  referenceIndexRef.current = referenceIndex;
  const filtered = blockCommands.filter(command => command.label.toLowerCase().includes(slash?.query.toLowerCase() ?? ''));
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
  function insertReference(target: SearchResult) {
    const current = referenceRef.current;
    if (!current || !editorRef.current) return;
    editorRef.current.chain().focus().deleteRange({ from: current.from, to: current.to }).insertContent({ type: current.kind, attrs: { recordId: target.id, label: target.title } }).insertContent(' ').run();
    setReference(null);
  }
  function insert(editor: Editor, command: typeof blockCommands[number]) {
    const current = slashRef.current;
    if (current) editor.chain().focus().deleteRange({
      from: current.from,
      to: current.to
    }).run();
    setSlash(null);
    command.run(editor);
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
        const command = blockCommands.find(c => c.label === e.target.value);
        if (command) command.run(editor);
      }}><option value="">Insert block…</option>{blockCommands.map(c => <option key={c.label}>{c.label}</option>)}</select>
   <Button variant="ghost" size="sm" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}>↶</Button><Button variant="ghost" size="sm" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}>↷</Button>
   <Button variant="ghost" size="sm" aria-label="Move block up" onClick={() => moveCurrentBlock({ editor, direction: -1 })}>↑ Block</Button><Button variant="ghost" size="sm" aria-label="Move block down" onClick={() => moveCurrentBlock({ editor, direction: 1 })}>↓ Block</Button><Button variant="ghost" size="sm" aria-label="Duplicate block" onClick={() => {
        const { $from } = editor.state.selection;
        if ($from.depth) editor.chain().focus().insertContentAt($from.after(1), $from.node(1).toJSON()).run();
      }}>Duplicate</Button>
   {editor.isActive('codeBlock') ? <input aria-label="Code language" placeholder="Language" value={editor.getAttributes('codeBlock').language ?? ''} onChange={e => editor.chain().focus().updateAttributes('codeBlock', {
        language: e.target.value
      }).run()} /> : null}
   {editor.isActive('table') ? <><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</Button><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</Button><Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</Button></> : null}
  </div>
  <EditorContent editor={editor} />
  {slash ? <div role="listbox" aria-label="Slash commands" className="slash-menu">{filtered.length ? filtered.map((command, i) => <button type="button" role="option" aria-selected={i === index} key={command.label} onMouseDown={e => e.preventDefault()} onClick={() => insert(editor, command)}>{command.label}</button>) : <span>No matching block</span>}</div> : null}
  {reference ? <div role="listbox" aria-label={reference.kind === 'mention' ? 'Mention records' : 'Link pages'} className="slash-menu">{referenceResults.length ? referenceResults.map((target, i) => <button type="button" role="option" aria-selected={i === referenceIndex} key={target.id} onMouseDown={e => e.preventDefault()} onClick={() => insertReference(target)}><strong>{target.title}</strong> <small>{target.kind} · {target.display_id}</small></button>) : <span>No matching records</span>}</div> : null}
  <p className="editor-hint">Type / for blocks · @ to mention · [[ to link · Ctrl/⌘ B for bold · Ctrl/⌘ Z to undo</p>
 </div>;
}
