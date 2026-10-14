import { request } from './client';
import type { Page, Listing, PageChanges } from './types';
import { recordPaths, type RecordKind, type RecordCreateInput, type Relationship, type LinkInput } from './recordTypes';
const path = (eid: string, kind: RecordKind) => `/engagements/${eid}/${recordPaths[kind]}`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : {
    body: JSON.stringify(body)
  })
});
export const recordApi = {
  list: (eid: string, kind: RecordKind, params: Record<string, string> = {}) => request<Listing<Page>>(`${path(eid, kind)}?${new URLSearchParams(params)}`),
  async all(eid: string, kind: RecordKind, params: Record<string, string> = {}) {
    const items: Page[] = [];
    let offset = 0;
    for (;;) {
      const data = await recordApi.list(eid, kind, {
        ...params,
        offset: String(offset),
        limit: '200'
      });
      items.push(...data.items);
      offset += data.items.length;
      if (offset >= data.total || !data.items.length) return items;
    }
  },
  create: (eid: string, kind: RecordKind, values: RecordCreateInput) => request<Page>(path(eid, kind), json('POST', values)),
  patch: (page: Page, changes: PageChanges) => request<Page>(`${path(page.engagement_id, page.record!.kind)}/${page.id}`, json('PATCH', {
    revision: page.revision,
    ...changes
  })),
  remove: (page: Page) => request<void>(`${path(page.engagement_id, page.record!.kind)}/${page.id}`, json('DELETE')),
  restore: (page: Page) => request<Page>(`${path(page.engagement_id, page.record!.kind)}/${page.id}/restore`, json('POST')),
  initializeScope: (eid: string) => request<Page[]>(`${path(eid, 'scope')}/initialize`, json('POST')),
  verify: (page: Page, note: string) => request<Page>(`${path(page.engagement_id, 'finding')}/${page.id}/verify`, json('POST', {
    revision: page.revision,
    verification_note: note
  })),
  relationships: (eid: string, id: string) => request<Relationship[]>(`/engagements/${eid}/records/${id}/relationships`),
  linkMany: (eid: string, id: string, links: LinkInput[]) => request<Relationship[]>(`/engagements/${eid}/relationships/batch`, json('POST', {
    source_id: id,
    links
  })),
  unlink: (eid: string, id: string) => request<void>(`/engagements/${eid}/relationships/${id}`, json('DELETE'))
};
export const recordKeys = {
  list: (eid: string, kind: RecordKind, params: Record<string, string>) => ['workspace', eid, 'records', kind, params] as const,
  relations: (eid: string, id: string) => ['workspace', eid, 'relations', id] as const
};
