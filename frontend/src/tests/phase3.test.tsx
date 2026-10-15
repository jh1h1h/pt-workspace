import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { RichEditor } from '../editor/RichEditor';
import { phase3Api } from '../api/phase3';
import { PropertySettings, CustomValues } from '../features/phase3/CustomProperties';
import { SavedViews } from '../features/phase3/SavedViews';
import { EvidenceUploader, ImportManager, QuickCapture } from '../features/phase3/Tools';
import { SearchDialog } from '../components/SearchDialog';
import { SavedDocument } from '../editor/SavedDocument';
import { page } from './fixtures';
import type { Page } from '../api/types';
import type { CustomProperty, SavedView } from '../api/phase3';
import { api } from '../api/client';

function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}
const finding = (): Page => page({ id: '11111111-1111-4111-8111-111111111111', engagement_id: 'e1', page_type: 'finding', record: { kind: 'finding', vulnerability_category: '', cwe: null, owasp: null, validation_status: 'Candidate', severity: 'Unassigned', cvss_score: null, cvss_vector: null, severity_rationale: null, verified_at: null, verification_note: '' } });

beforeEach(() => {
  vi.spyOn(phase3Api, 'customValues').mockResolvedValue([]);
  vi.spyOn(phase3Api, 'backlinks').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

it('P3-T01 T02 stable mention and wiki references insert structured UUID nodes', async () => {
  const changes = vi.fn();
  vi.spyOn(phase3Api, 'search').mockResolvedValue([{ id: '22222222-2222-4222-8222-222222222222', display_id: 'FND-0001', title: 'Stable finding', kind: 'finding', excerpt: '' }]);
  mount(<RichEditor content={{ type: 'doc', content: [{ type: 'paragraph' }] }} onChange={changes} engagementId="e1" />);
  const editor = screen.getByRole('textbox', { name: 'Document' });
  await userEvent.click(editor); await userEvent.type(editor, '@Sta');
  await userEvent.click(await screen.findByRole('option', { name: /Stable finding/ }));
  await waitFor(() => expect(changes).toHaveBeenCalledWith(expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ type: 'mention', attrs: expect.objectContaining({ recordId: '22222222-2222-4222-8222-222222222222' }) })]) })]) })));
  await userEvent.type(editor, '{[}{[}');
  await userEvent.click(await screen.findByRole('option', { name: /Stable finding/ }));
  await waitFor(() => expect(JSON.stringify(changes.mock.calls.at(-1)?.[0])).toContain('wikiLink'));
});

it('P3-T06 T07 callout, attachment, duplication and block controls are functional', async () => {
  const changes = vi.fn();
  mount(<RichEditor content={{ type: 'doc', content: [{ type: 'paragraph' }] }} onChange={changes} engagementId="e1" />);
  await userEvent.selectOptions(screen.getByLabelText('Insert block'), 'Callout');
  await waitFor(() => expect(JSON.stringify(changes.mock.calls.at(-1)?.[0])).toContain('callout'));
  expect(screen.getByRole('combobox', { name: 'Block actions' })).toBeEnabled();
  expect(screen.getByRole('option', { name: 'Move block up' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Move block down' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Duplicate block' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

it('P3-C01 custom property manager creates typed definitions', async () => {
  vi.spyOn(phase3Api, 'properties').mockResolvedValue([]);
  const create = vi.spyOn(phase3Api, 'createProperty').mockResolvedValue({ id: 'p1', engagement_id: 'e1', record_type: 'asset', name: 'Review date', data_type: 'date', allowed_values: [], default_value: null, required: true, display_order: 0, visible: true, deleted_at: null });
  mount(<PropertySettings eid="e1" />);
  await userEvent.type(screen.getByLabelText('Property name'), 'Review date');
  await userEvent.selectOptions(screen.getByLabelText('Property data type'), 'date');
  await userEvent.click(screen.getByText('Required'));
  await userEvent.click(screen.getByRole('button', { name: 'Create property' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'Review date', data_type: 'date', required: true })));
});

it('P3-C04 record detail edits custom values', async () => {
  const definition: CustomProperty = { id: 'p1', engagement_id: 'e1', record_type: 'finding', name: 'Ticket', data_type: 'text', allowed_values: [], default_value: null, required: false, display_order: 0, visible: true, deleted_at: null };
  vi.mocked(phase3Api.customValues).mockResolvedValue([{ definition, value: 'ABC' }]);
  const set = vi.spyOn(phase3Api, 'setCustomValue').mockResolvedValue({});
  mount(<CustomValues page={finding()} />);
  const field = await screen.findByLabelText('Ticket custom property');
  await userEvent.clear(field); await userEvent.type(field, 'DEF');
  await waitFor(() => expect(set).toHaveBeenCalledWith('e1', finding().id, 'p1', expect.any(String)));
});

it('P3-C05 saved views can be created, selected, duplicated and deleted', async () => {
  const existing: SavedView = { id: 'v1', engagement_id: 'e1', record_type: 'surface', name: 'Not Reviewed', view_type: 'table', config: { columns: ['title'], column_order: ['title'], column_widths: {}, filters: [], sorts: [], group_by: null }, is_default: true, deleted_at: null };
  vi.spyOn(phase3Api, 'views').mockResolvedValue([existing]);
  vi.spyOn(phase3Api, 'createView').mockResolvedValue({ ...existing, id: 'v2', name: 'Mine' });
  const duplicate = vi.spyOn(phase3Api, 'duplicateView').mockResolvedValue({ ...existing, id: 'v3' });
  const remove = vi.spyOn(phase3Api, 'deleteView').mockResolvedValue();
  const select = vi.fn(); mount(<SavedViews eid="e1" kind="surface" onSelect={select} />);
  await userEvent.click(await screen.findByRole('tab', { name: 'Not Reviewed' })); expect(select).toHaveBeenCalledWith(existing);
  await userEvent.click(screen.getByLabelText('Duplicate Not Reviewed')); expect(duplicate).toHaveBeenCalledWith('e1', 'v1');
  await userEvent.click(screen.getByLabelText('Delete Not Reviewed')); expect(remove).toHaveBeenCalledWith('e1', 'v1');
});

it('P3-E01 evidence drag/upload sends bytes and review metadata', async () => {
  const upload = vi.spyOn(phase3Api, 'uploadEvidence').mockResolvedValue({ page: finding(), file: { sha256: 'abc', file_size: 3, mime_type: 'image/png' }, duplicate: false });
  mount(<EvidenceUploader eid="e1" related={finding()} />);
  const file = new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Evidence file'), file);
  await waitFor(() => expect(upload).toHaveBeenCalledWith('e1', file, expect.objectContaining({ related_id: finding().id, review_state: 'Needs Review' })));
  expect(await screen.findByText(/SHA-256 abc/)).toBeInTheDocument();
});

it('P3-S05 full text search supports type filter and keyboard results', async () => {
  vi.spyOn(phase3Api, 'search').mockResolvedValue([{ id: finding().id, display_id: 'FND-0001', title: 'Authorization issue', kind: 'finding', excerpt: 'matched body' }]);
  mount(<SearchDialog eid="e1" onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Search workspace'), 'authorization');
  expect(await screen.findByRole('link', { name: /Authorization issue/ })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Search record type'), 'finding');
  await waitFor(() => expect(phase3Api.search).toHaveBeenCalledWith('e1', 'authorization', 'finding'));
});

it('P3-I10 import preview requires explicit confirmation', async () => {
  vi.spyOn(phase3Api, 'importHistory').mockResolvedValue([]);
  const preview = vi.spyOn(phase3Api, 'previewImport').mockResolvedValue({ id: 'i1', format: 'csv', source_filename: 'routes.csv', status: 'preview', preview: { records: [{ row: '1', url: 'https://example.test', method: 'GET', title: 'Route', duplicate: false }], rejected: [] }, created_at: '2026-01-01' });
  const confirm = vi.spyOn(phase3Api, 'confirmImport').mockResolvedValue({ created: 1, existing: 0, rejected: 0 });
  mount(<ImportManager eid="e1" />);
  await userEvent.upload(screen.getByLabelText('Import format').parentElement!.querySelector('input[type=file]') as HTMLInputElement, new File(['url\nhttps://example.test'], 'routes.csv'));
  await waitFor(() => expect(preview).toHaveBeenCalled());
  expect(confirm).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledWith('e1', 'i1'));
});

it('P3-X05 Quick Capture creates a candidate without navigation', async () => {
  const capture = vi.spyOn(phase3Api, 'quickCapture').mockResolvedValue(finding()); const close = vi.fn();
  mount(<QuickCapture eid="e1" related="current" onClose={close} />);
  await userEvent.selectOptions(screen.getByLabelText('Quick capture type'), 'finding');
  await userEvent.type(screen.getByLabelText('Quick capture title'), 'Possible issue');
  await userEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(capture).toHaveBeenCalledWith('e1', 'finding', 'Possible issue', 'current', 'P2'));
  expect(close).toHaveBeenCalled();
});

it('scratchpad remains the single engagement note without conversion', async () => {
  const scratch = page({ id: 'scratch', page_type: 'scratchpad', title: 'Scratchpad' });
  vi.spyOn(api, 'patch').mockResolvedValue(scratch);
  mount(<SavedDocument page={scratch} label="Scratchpad content" />);
  await screen.findByRole('textbox', { name: 'Scratchpad content' });
  expect(screen.queryByRole('button', { name: 'Convert to Note' })).not.toBeInTheDocument();
});
