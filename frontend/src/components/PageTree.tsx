import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page } from '../api/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
export function PageTree({
  pages,
  parent = null,
  depth = 0,
  label
}: {
  pages: Page[];
  parent?: string | null;
  depth?: number;
  label?: string;
}) {
  const [visible, setVisible] = useState(true);
  const children = pages.filter(p => p.parent_id === parent || parent === null && p.parent_id && !pages.some(a => a.id === p.parent_id));
  if (depth === 0) return <div className="page-tree-root"><button className={`page-tree-toggle${label ? ' has-label' : ''}`} aria-label={`${visible ? 'Collapse' : 'Expand'} pages`} title={`${visible ? 'Collapse' : 'Expand'} pages`} aria-expanded={visible} aria-controls="page-tree-items" onClick={() => setVisible(value => !value)}>{visible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{label ? <span>{label}</span> : null}</button>{visible ? <ul id="page-tree-items" className="page-tree">{children.map(page => <TreeNode key={page.id} page={page} pages={pages} depth={depth} />)}</ul> : null}</div>;
  return <ul className="page-tree">{children.map(page => <TreeNode key={page.id} page={page} pages={pages} depth={depth} />)}</ul>;
}
function TreeNode({
  page,
  pages,
  depth
}: {
  page: Page;
  pages: Page[];
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = pages.some(p => p.parent_id === page.id);
  return <li><div>{hasChildren ? <button aria-label={`${expanded ? 'Collapse' : 'Expand'} ${page.title}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="tree-spacer" />}<Link to={`/e/${page.engagement_id}/pages/${page.id}`}>{page.icon || '▤'} {page.title}</Link></div>{hasChildren && expanded && depth < 60 ? <PageTree pages={pages} parent={page.id} depth={depth + 1} /> : null}</li>;
}
