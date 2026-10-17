import { surfaceTypes, methods, type RecordKind, type RecordChanges, type RecordProperties, type ValidationStatus } from '../../api/recordTypes';
export interface FieldSpec {
  key: keyof RecordChanges;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'tags' | 'date' | 'number' | 'boolean';
  choices?: readonly string[];
  nullable?: boolean;
  max?: number;
}
export interface RecordConfig {
  label: string;
  singular: string;
  fields: FieldSpec[];
  columns: (keyof RecordChanges)[];
  filters: (keyof RecordChanges)[];
  statusKey?: keyof RecordChanges;
}
const field = (key: keyof RecordChanges, label: string, type: FieldSpec['type'] = 'text', choices?: readonly string[], nullable = false): FieldSpec => ({
  key,
  label,
  type,
  choices,
  nullable
});
export const backlogStatuses = ['Queued', 'In Progress', 'Blocked', 'Completed', 'Skipped'] as const;
export const findingTransitions: Record<ValidationStatus, ValidationStatus[]> = {
  Candidate: ['Validating', 'Inconclusive', 'Dismissed'],
  Validating: ['Candidate', 'Inconclusive', 'Dismissed'],
  Confirmed: ['Report Ready', 'Validating', 'Dismissed'],
  Inconclusive: ['Candidate', 'Validating', 'Dismissed'],
  Dismissed: ['Candidate', 'Validating'],
  'Report Ready': ['Confirmed', 'Validating', 'Dismissed']
};
export const configs: Record<RecordKind, RecordConfig> = {
  asset: {
    label: 'Scope & Assets',
    singular: 'Asset',
    fields: [field('asset_type', 'Asset type', 'select', ['Application', 'Domain', 'Host', 'API', 'Environment', 'Other']), field('hostname_url', 'Hostname or URL'), field('environment', 'Environment'), field('scope_state', 'Scope state', 'select', ['In Scope', 'Out of Scope', 'Pending Confirmation']), field('authorization_confirmed', 'Explicit testing authorization confirmed', 'boolean'), field('approval_reference', 'Approval reference', 'text', undefined, true), field('authentication_requirements', 'Authentication requirements', 'textarea'), field('application_owner', 'Application owner', 'text', undefined, true), field('tags', 'Tags', 'tags')],
    columns: ['asset_type', 'hostname_url', 'environment', 'scope_state'],
    filters: ['asset_type', 'environment', 'scope_state'],
    statusKey: 'scope_state'
  },
  surface: {
    label: 'Attack Surfaces',
    singular: 'Attack surface',
    fields: [field('surface_type', 'Surface type', 'select', surfaceTypes), field('url_route', 'URL or route'), field('http_method', 'HTTP method', 'select', methods, true), field('parameter_name', 'Parameter name', 'text', undefined, true), field('parameter_location', 'Parameter location', 'select', ['Query', 'Body', 'Path', 'Header', 'Cookie', 'Form', 'Other'], true), field('authentication_state', 'Authentication state'), field('roles', 'Relevant roles', 'tags'), field('status', 'Testing status', 'select', ['To Review', 'In Progress', 'Reviewed', 'Blocked', 'Not Applicable']), field('tags', 'Tags', 'tags')],
    columns: ['surface_type', 'url_route', 'http_method', 'status'],
    filters: ['surface_type', 'status', 'http_method', 'authentication_state'],
    statusKey: 'status'
  },
  backlog: {
    label: 'Testing Backlog',
    singular: 'Backlog item',
    fields: [field('objective', 'Objective', 'textarea'), field('category', 'Category'), field('priority', 'Priority', 'select', ['P1', 'P2', 'P3']), field('blocker_reason', 'Blocker reason', 'textarea', undefined, true), field('status', 'Backlog status', 'select', backlogStatuses), field('due_date', 'Due date', 'date', undefined, true)],
    columns: ['category', 'priority', 'status', 'due_date'],
    filters: ['category', 'priority', 'status'],
    statusKey: 'status'
  },
  test_case: {
    label: 'Test Cases',
    singular: 'Test case',
    fields: [field('category', 'Category'), field('priority', 'Priority'), field('execution_status', 'Execution status', 'select', ['Not Started', 'In Progress', 'Blocked', 'Completed', 'Not Applicable']), field('assessment_outcome', 'Assessment outcome', 'select', ['Not Assessed', 'No Issue Observed', 'Potential Finding', 'Finding Confirmed', 'Inconclusive']), field('testing_notes', 'Testing notes', 'textarea')],
    columns: ['category', 'priority', 'execution_status', 'assessment_outcome'],
    filters: ['category', 'priority', 'execution_status', 'assessment_outcome'],
    statusKey: 'execution_status'
  },
  finding: {
    label: 'Findings',
    singular: 'Finding',
    fields: [field('vulnerability_category', 'Vulnerability category'), field('cwe', 'CWE', 'text', undefined, true), field('owasp', 'OWASP classification', 'text', undefined, true), field('validation_status', 'Validation status', 'select', ['Candidate', 'Validating', 'Confirmed', 'Inconclusive', 'Dismissed', 'Report Ready']), field('severity', 'Severity', 'select', ['Critical', 'High', 'Medium', 'Low', 'Informational', 'Unassigned']), field('cvss_score', 'CVSS score', 'number', undefined, true), field('cvss_vector', 'CVSS vector', 'text', undefined, true), field('severity_rationale', 'Severity rationale', 'textarea', undefined, true)],
    columns: ['vulnerability_category', 'validation_status', 'severity'],
    filters: ['vulnerability_category', 'validation_status', 'severity'],
    statusKey: 'validation_status'
  },
  evidence: {
    label: 'Evidence',
    singular: 'Evidence reference',
    fields: [field('evidence_type', 'Evidence type', 'select', ['Screenshot', 'HTTP request', 'HTTP response', 'HTTP exchange', 'Log', 'Text document', 'Other file']), field('review_state', 'Review state', 'select', ['Needs Review', 'Reviewed', 'Restricted']), field('source_tool', 'Source / tool'), field('captured_at', 'Captured at'), field('source_reference', 'Source reference'), field('media_type', 'Media type'), field('sanitization_state', 'Legacy sanitization state', 'select', ['Unreviewed', 'Sanitized', 'Contains Sensitive Data'])],
    columns: ['evidence_type', 'source_tool', 'review_state'],
    filters: ['review_state'],
    statusKey: 'review_state'
  },
  scope: {
    label: 'Scope documentation',
    singular: 'Scope page',
    fields: [field('section', 'Scope section')],
    columns: ['section'],
    filters: ['section']
  },
  observation: {
    label: 'Discovery observations',
    singular: 'Discovery observation',
    fields: [],
    columns: ['classification', 'discovery_source'],
    filters: ['classification']
  },
  template: {
    label: 'Document templates',
    singular: 'Document template',
    fields: [field('record_type', 'Template record type', 'select', ['test_case', 'finding']), field('is_default', 'Use as engagement default', 'boolean')],
    columns: ['record_type', 'is_default'],
    filters: ['record_type', 'is_default']
  }
};
export function valueOf(properties: RecordProperties | null | undefined, key: string): unknown {
  return properties ? Reflect.get(properties, key) : undefined;
}
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return Array.isArray(value) ? value.join(', ') : String(value);
}
export function choicesFor(spec: FieldSpec, properties: RecordProperties): readonly string[] | undefined {
  if (spec.key === 'validation_status' && properties.kind === 'finding') return [properties.validation_status, ...findingTransitions[properties.validation_status]];
  return spec.choices;
}
export function parseValue(spec: FieldSpec, value: string | boolean): unknown {
  if (spec.type === 'boolean') return Boolean(value);
  if (spec.type === 'tags') return [...new Set(String(value).split(',').map(s => s.trim()).filter(Boolean))];
  if (spec.nullable && value === '') return null;
  if (spec.type === 'number') return Number(value);
  return value;
}
export const moduleRoute = (kind: RecordKind) => ({
  asset: 'assets',
  surface: 'attack-surfaces',
  backlog: 'backlog',
  test_case: 'test-cases',
  finding: 'findings',
  evidence: 'evidence',
  scope: 'assets',
  observation: 'attack-surfaces',
  template: 'settings'
})[kind];

export const nextRelatedKind=(kind?:RecordKind):RecordKind=>kind==='asset'?'surface':kind==='surface'?'backlog':kind==='backlog'?'test_case':kind==='test_case'?'finding':kind==='finding'?'evidence':'asset';
