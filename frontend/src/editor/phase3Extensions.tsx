import { useEffect, useState } from 'react';
import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { phase3Api } from '../api/phase3';
import type { Page } from '../api/types';

function ReferenceView({ node, extension }: NodeViewProps) {
  const eid = String(extension.options.engagementId || '');
  const id = String(node.attrs.recordId || '');
  const [target, setTarget] = useState<Page | null>();
  useEffect(() => {
    if (!eid || !id) return;
    fetch(`/api/v1/engagements/${eid}/pages/${id}`).then(async response => response.ok ? response.json() as Promise<Page> : null).then(setTarget).catch(() => setTarget(null));
  }, [eid, id]);
  const prefix = node.type.name === 'mention' ? '@' : '[[';
  const suffix = node.type.name === 'wikiLink' ? ']]' : '';
  return <NodeViewWrapper as="span" className={`internal-reference ${target === null ? 'missing' : ''}`} contentEditable={false}>
    {target ? <a href={`/e/${eid}/pages/${id}`}>{prefix}{target.title}{suffix} <small>{target.display_id}</small></a> : <span title="Deleted or inaccessible reference">{prefix}{node.attrs.label || 'Unavailable'}{suffix}</span>}
  </NodeViewWrapper>;
}

const reference = (name: 'mention' | 'wikiLink') => Node.create({
  name,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() { return { engagementId: '' }; },
  addAttributes() { return { recordId: { default: '' }, label: { default: '' } }; },
  parseHTML() { return [{ tag: `span[data-${name}]` }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { [`data-${name}`]: HTMLAttributes.recordId }), `${name === 'mention' ? '@' : '[['}${HTMLAttributes.label}${name === 'wikiLink' ? ']]' : ''}`]; },
  addNodeView() { return ReactNodeViewRenderer(ReferenceView); }
});

const Callout = Node.create({
  name: 'callout', group: 'block', content: 'block+', defining: true, draggable: true,
  addAttributes() { return { tone: { default: 'info' }, icon: { default: '💡' } }; },
  parseHTML() { return [{ tag: 'aside[data-callout]' }]; },
  renderHTML({ HTMLAttributes }) { return ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': HTMLAttributes.tone, class: 'editor-callout' }), 0]; }
});

function EvidenceImageView({ node, extension, updateAttributes }: NodeViewProps) {
  const eid = String(extension.options.engagementId || '');
  return <NodeViewWrapper className="evidence-image" draggable="true" data-drag-handle>
    <img src={`/api/v1/engagements/${eid}/evidence-files/${node.attrs.evidenceId}/preview`} alt={node.attrs.alt || ''} />
    <figcaption><input aria-label="Image caption" value={node.attrs.caption || ''} placeholder="Evidence image caption" onChange={event => updateAttributes({ caption: event.target.value })} /></figcaption>
  </NodeViewWrapper>;
}

const EvidenceImage = Node.create({
  name: 'evidenceImage', group: 'block', atom: true, draggable: true,
  addOptions() { return { engagementId: '' }; },
  addAttributes() { return { evidenceId: { default: '' }, alt: { default: '' }, caption: { default: '' } }; },
  parseHTML() { return [{ tag: 'figure[data-evidence-image]' }]; },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { 'data-evidence-image': HTMLAttributes.evidenceId })]; },
  addNodeView() { return ReactNodeViewRenderer(EvidenceImageView); }
});

function FileView({ node, extension }: NodeViewProps) {
  const eid = String(extension.options.engagementId || '');
  return <NodeViewWrapper className="file-attachment" contentEditable={false} draggable="true" data-drag-handle>📎 <a href={`/api/v1/engagements/${eid}/evidence-files/${node.attrs.evidenceId}/download`}>{node.attrs.label || 'Download evidence'}</a></NodeViewWrapper>;
}

const FileAttachment = Node.create({
  name: 'fileAttachment', group: 'block', atom: true, draggable: true,
  addOptions() { return { engagementId: '' }; },
  addAttributes() { return { evidenceId: { default: '' }, label: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-file-attachment]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-file-attachment': HTMLAttributes.evidenceId }), HTMLAttributes.label]; },
  addNodeView() { return ReactNodeViewRenderer(FileView); }
});

function DatabaseViewNode({ node, extension }: NodeViewProps) {
  const eid = String(extension.options.engagementId || '');
  const query = useQuery({ queryKey: ['workspace', eid, 'embedded-view', node.attrs.viewId], queryFn: () => phase3Api.viewRecords(eid, String(node.attrs.viewId)), enabled: Boolean(eid && node.attrs.viewId) });
  const records = query.data?.items;
  return <NodeViewWrapper className="embedded-view" contentEditable={false} draggable="true" data-drag-handle><strong>Embedded database view</strong>{query.error ? <p role="alert">Saved view was deleted or is unavailable.</p> : query.isPending ? <p>Loading view…</p> : records?.length ? <ul>{records.map(record => <li key={record.id}><a href={`/e/${eid}/pages/${record.id}`}>{record.title} <small>{record.display_id}</small></a></li>)}</ul> : <p>No records match this view.</p>}</NodeViewWrapper>;
}

const DatabaseView = Node.create({
  name: 'databaseView', group: 'block', atom: true, draggable: true,
  addOptions() { return { engagementId: '' }; },
  addAttributes() { return { viewId: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-database-view]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-database-view': HTMLAttributes.viewId })]; },
  addNodeView() { return ReactNodeViewRenderer(DatabaseViewNode); }
});

export const phase3Extensions = (engagementId = '') => [
  reference('mention').configure({ engagementId }), reference('wikiLink').configure({ engagementId }), Callout,
  EvidenceImage.configure({ engagementId }), FileAttachment.configure({ engagementId }), DatabaseView.configure({ engagementId })
];

export function moveCurrentBlock({ editor, direction }: { editor: CommandProps['editor']; direction: -1 | 1 }) {
  const { $from } = editor.state.selection;
  const depth = 1;
  if ($from.depth < depth) return false;
  const index = $from.index(depth - 1);
  const parent = $from.node(depth - 1);
  const target = index + direction;
  if (target < 0 || target >= parent.childCount) return false;
  const children = Array.from({ length: parent.childCount }, (_, i) => parent.child(i));
  [children[index], children[target]] = [children[target], children[index]];
  const replacement = parent.type.create(parent.attrs, children);
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, replacement.content));
  return true;
}
