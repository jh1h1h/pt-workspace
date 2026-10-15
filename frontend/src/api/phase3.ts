import { request } from './client';
import type { Listing, Page } from './types';

const root = (eid: string) => `/engagements/${eid}`;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export type PropertyType = 'text' | 'number' | 'checkbox' | 'date' | 'single_select' | 'multi_select' | 'url' | 'relation';
export interface CustomProperty { id: string; engagement_id: string; record_type: string; name: string; data_type: PropertyType; allowed_values: string[]; default_value: unknown; required: boolean; display_order: number; visible: boolean; deleted_at: string | null }
export interface CustomValue { definition: CustomProperty; value: unknown }
export interface ViewConfig { columns: string[]; column_order: string[]; column_widths: Record<string, number>; filters: { field: string; value: unknown }[]; sorts: { field: string; direction: 'asc' | 'desc' }[]; group_by: string | null }
export interface SavedView { id: string; engagement_id: string; record_type: string; name: string; view_type: 'table' | 'kanban'; config: ViewConfig; is_default: boolean; deleted_at: string | null }
export interface SearchResult { id: string; display_id: string; title: string; kind: string; excerpt: string }
export interface DocumentBacklink { id: string; origin: 'mention' | 'wiki'; source: { id: string; display_id: string; title: string; deleted: boolean } }
export interface ImportJob { id: string; format: string; source_filename: string; status: 'preview' | 'confirmed' | 'failed'; preview: { records: ({ row: string; url?: string; method?: string; title: string; duplicate: boolean; kind?: string })[]; rejected: ({ row: string; error: string })[] }; created_at: string }
export interface ContentTemplate { id: string; name: string; record_type: string; default_properties: Record<string, unknown>; page: Page }
export interface WorkflowOption { id: string; record_type: 'task' | 'backlog' | 'finding'; label: string; canonical_category: string; display_order: number }
export interface EvidenceFile { id: string; original_filename: string; file_size: number; mime_type: string; sha256: string; review_state: 'Needs Review' | 'Reviewed' | 'Restricted'; evidence_type: string }

export const phase3Api = {
  search: async (eid: string, q: string, kind = '') => {
    if (q === '*') {
      const data = await request<Listing<Page>>(`${root(eid)}/pages?offset=0&limit=100`);
      return data.items.map(page => ({ id: page.id, display_id: page.display_id, title: page.title, kind: page.page_type, excerpt: '' }));
    }
    return request<SearchResult[]>(`${root(eid)}/search?q=${encodeURIComponent(q)}${kind ? `&record_type=${encodeURIComponent(kind)}` : ''}`);
  },
  properties: (eid: string, kind = '') => request<CustomProperty[]>(`${root(eid)}/custom-properties${kind ? `?record_type=${kind}` : ''}`),
  createProperty: (eid: string, data: Omit<CustomProperty, 'id' | 'engagement_id' | 'deleted_at'>) => request<CustomProperty>(`${root(eid)}/custom-properties`, json('POST', data)),
  patchProperty: (eid: string, id: string, data: Partial<CustomProperty> & { conversion_confirmed?: boolean }) => request<CustomProperty>(`${root(eid)}/custom-properties/${id}`, json('PATCH', data)),
  deleteProperty: (eid: string, id: string) => request<void>(`${root(eid)}/custom-properties/${id}`, json('DELETE')),
  customValues: (eid: string, id: string) => request<CustomValue[]>(`${root(eid)}/records/${id}/custom-values`),
  setCustomValue: (eid: string, id: string, property: string, value: unknown) => request(`${root(eid)}/records/${id}/custom-values/${property}`, json('PUT', { value })),
  views: (eid: string, kind = '') => request<SavedView[]>(`${root(eid)}/saved-views${kind ? `?record_type=${kind}` : ''}`),
  createView: (eid: string, data: Omit<SavedView, 'id' | 'engagement_id' | 'deleted_at'>) => request<SavedView>(`${root(eid)}/saved-views`, json('POST', data)),
  patchView: (eid: string, id: string, data: Partial<SavedView>) => request<SavedView>(`${root(eid)}/saved-views/${id}`, json('PATCH', data)),
  duplicateView: (eid: string, id: string) => request<SavedView>(`${root(eid)}/saved-views/${id}/duplicate`, json('POST')),
  deleteView: (eid: string, id: string) => request<void>(`${root(eid)}/saved-views/${id}`, json('DELETE')),
  viewRecords: (eid: string, id: string) => request<Listing<Page>>(`${root(eid)}/saved-views/${id}/records`),
  bulk: (eid: string, ids: string[], revisions: Record<string, number>, field: string, value: unknown) => request<Page[]>(`${root(eid)}/bulk-update`, json('POST', { ids, revisions, field, value })),
  backlinks: (eid: string, id: string) => request<DocumentBacklink[]>(`${root(eid)}/records/${id}/document-backlinks`),
  quickCapture: (eid: string, kind: string, title: string, related_id?: string, priority = 'P2') => request<Page>(`${root(eid)}/quick-capture`, json('POST', { kind, title, related_id, priority })),
  uploadEvidence: async (eid: string, file: File, metadata: Record<string, unknown>) => {
    const response = await fetch(`/api/v1${root(eid)}/evidence-files?metadata=${encodeURIComponent(JSON.stringify(metadata))}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': file.name }, body: file });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || `Upload failed (${response.status})`);
    return response.json() as Promise<{ page: Page; file: { sha256: string; file_size: number; mime_type: string }; duplicate: boolean }>;
  },
  evidenceFile: (eid: string, id: string) => request<EvidenceFile>(`${root(eid)}/evidence-files/${id}`),
  previewImport: async (eid: string, format: string, file: File) => {
    const response = await fetch(`/api/v1${root(eid)}/imports/preview?format=${encodeURIComponent(format)}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || 'Import preview failed');
    return response.json() as Promise<ImportJob>;
  },
  confirmImport: (eid: string, id: string) => request<{ created: number; existing: number; rejected: number }>(`${root(eid)}/imports/confirm`, json('POST', { import_id: id })),
  importHistory: (eid: string) => request<ImportJob[]>(`${root(eid)}/imports`),
  contentTemplates: (eid: string) => request<ContentTemplate[]>(`${root(eid)}/content-templates`),
  initializeTemplates: (eid: string) => request<ContentTemplate[]>(`${root(eid)}/content-templates/initialize`, json('POST')),
  createContentTemplate: (eid: string, data: { name: string; record_type: string; content: Page['content']; default_properties?: Record<string, unknown> }) => request<ContentTemplate>(`${root(eid)}/content-templates`, json('POST', data)),
  duplicateContentTemplate: (eid: string, id: string) => request<ContentTemplate>(`${root(eid)}/content-templates/${id}/duplicate`, json('POST')),
  deleteContentTemplate: (eid: string, id: string) => request<void>(`${root(eid)}/content-templates/${id}`, json('DELETE')),
  instantiateTemplate: (eid: string, id: string, title: string) => request<Page>(`${root(eid)}/content-templates/${id}/instantiate`, json('POST', { title })),
  workflowOptions: (eid: string, kind = '') => request<WorkflowOption[]>(`${root(eid)}/workflow-options${kind ? `?record_type=${kind}` : ''}`),
  createWorkflowOption: (eid: string, data: Omit<WorkflowOption, 'id'>) => request<WorkflowOption>(`${root(eid)}/workflow-options`, json('POST', data)),
  applyWorkflowOption: (page: Page, option_id: string) => request<Page>(`${root(page.engagement_id)}/records/${page.id}/workflow`, json('PUT', { option_id, revision: page.revision }))
};
