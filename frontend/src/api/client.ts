import { recordPaths } from './recordTypes';
import type { Engagement, Listing, Page, PageChanges, Priority } from './types';
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: {
        message?: string;
        details?: {
          message: string;
        }[];
      };
    } | null;
    throw new ApiError(response.status, body?.error?.details?.map(d => d.message).join('; ') || body?.error?.message || `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const scoped = (eid: string) => `/engagements/${eid}`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : {
    body: JSON.stringify(body)
  })
});
// Fetch every API page; do not silently truncate the explorer at its first 100 records.
async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await request<Listing<T>>(`${path}${path.includes('?') ? '&' : '?'}offset=${offset}&limit=200`);
    items.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) return items;
  }
}
export const api = {
  engagements: () => all<Engagement>('/engagements'),
  deletedEngagements: () => all<Engagement>('/engagements?deleted=true'),
  createEngagement: (name: string) => request<Engagement>('/engagements', json('POST', {
    name
  })),
  renameEngagement: (eid: string, name: string) => request<Engagement>(scoped(eid), json('PATCH', {
    name
  })),
  deleteEngagement: (eid: string) => request<void>(scoped(eid), json('DELETE')),
  restoreEngagement: (eid: string) => request<Engagement>(`${scoped(eid)}/restore`, json('POST')),
  pages: (eid: string, q = '', deleted = false) => all<Page>(`${scoped(eid)}/pages?q=${encodeURIComponent(q)}&deleted=${deleted}`),
  tasks: (eid: string, filters: Record<string, string> = {}) => all<Page>(`${scoped(eid)}/tasks?${new URLSearchParams(filters)}`),
  page: (eid: string, id: string) => request<Page>(`${scoped(eid)}/pages/${id}`),
  scratchpad: (eid: string) => request<Page>(`${scoped(eid)}/scratchpad`),
  recent: (eid: string) => request<Page[]>(`${scoped(eid)}/recent`),
  createPage: (eid: string, values: {
    title: string;
    parent_id?: string | null;
    page_type?: 'page' | 'note' | 'journal';
    journal_date?: string;
  }) => request<Page>(`${scoped(eid)}/pages`, json('POST', values)),
  createTask: (eid: string, title: string, priority: Priority = 'P2', related_page_id?: string) => request<Page>(`${scoped(eid)}/tasks`, json('POST', {
    title,
    priority,
    ...(related_page_id ? {
      related_page_id
    } : {})
  })),
  patch: (page: Page, changes: PageChanges) => request<Page>(`${scoped(page.engagement_id)}/${page.record ? recordPaths[page.record.kind] : page.task ? 'tasks' : 'pages'}/${page.id}`, json('PATCH', {
    revision: page.revision,
    ...changes
  })),
  reorder: (eid: string, pages: Page[]) => request<Page[]>(`${scoped(eid)}/tasks/reorder`, json('POST', {
    items: pages.map(p => ({
      id: p.id,
      revision: p.revision
    }))
  })),
  open: (eid: string, id: string) => request<void>(`${scoped(eid)}/pages/${id}/open`, json('POST')),
  deletePage: (eid: string, id: string) => request<void>(`${scoped(eid)}/pages/${id}`, json('DELETE')),
  restorePage: (eid: string, id: string) => request<Page>(`${scoped(eid)}/pages/${id}/restore`, json('POST'))
};
