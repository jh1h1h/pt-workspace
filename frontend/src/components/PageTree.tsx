import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page } from '../api/types';
export function PageTree({
  pages,
  parent = null,
  depth = 0
}: {
  pages: Page[];
  parent?: string | null;
  depth?: number;
}) {
  const children = pages.filter(p => p.parent_id === parent || parent === null && p.parent_id && !pages.some(a => a.id === p.parent_id));
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
  return <li><div>{hasChildren ? <button aria-label={`${expanded ? 'Collapse' : 'Expand'} ${page.title}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '⌄' : '›'}</button> : <span className="tree-spacer" />}<Link to={`/e/${page.engagement_id}/pages/${page.id}`}>{page.icon || '▤'} {page.title}</Link></div>{hasChildren && expanded && depth < 60 ? <PageTree pages={pages} parent={page.id} depth={depth + 1} /> : null}</li>;
}
