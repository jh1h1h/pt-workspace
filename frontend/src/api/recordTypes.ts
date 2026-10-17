import type { JSONContent } from '@tiptap/react';
export type RecordKind = 'asset' | 'surface' | 'backlog' | 'test_case' | 'finding' | 'evidence' | 'scope' | 'observation' | 'template';
export type RegistryKind = RecordKind | 'page' | 'note' | 'journal' | 'task' | 'scratchpad';
export type AssetType = 'Application' | 'Domain' | 'Host' | 'API' | 'Environment' | 'Other';
export type ScopeState = 'In Scope' | 'Out of Scope' | 'Pending Confirmation';
export type SurfaceStatus = 'To Review' | 'In Progress' | 'Reviewed' | 'Blocked' | 'Not Applicable';
export type BacklogStatus = 'Queued' | 'In Progress' | 'Blocked' | 'Completed' | 'Skipped';
export type ExecutionStatus = 'Not Started' | 'In Progress' | 'Blocked' | 'Completed' | 'Not Applicable';
export type AssessmentOutcome = 'Not Assessed' | 'No Issue Observed' | 'Potential Finding' | 'Finding Confirmed' | 'Inconclusive';
export type ValidationStatus = 'Candidate' | 'Validating' | 'Confirmed' | 'Inconclusive' | 'Dismissed' | 'Report Ready';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | 'Unassigned';
export const surfaceTypes = ['HTTP endpoint', 'URL/query/body parameter', 'Form or input field', 'Authentication flow', 'Authorization boundary', 'File upload functionality', 'Client-side application route', 'Cookie or session behaviour', 'HTTP header', 'CORS configuration', 'Caching behaviour', 'Redirect behaviour', 'Rate limiting', 'Error handling', 'TLS/security configuration', 'Third-party integration', 'Other/custom'] as const;
export type SurfaceType = typeof surfaceTypes[number];
export const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'] as const;
export type HttpMethod = typeof methods[number];
export type ParameterLocation = 'Query' | 'Body' | 'Path' | 'Header' | 'Cookie' | 'Form' | 'Other';
export type Classification = 'Observed' | 'Advertised' | 'Inferred';
export type SanitizationState = 'Unreviewed' | 'Sanitized' | 'Contains Sensitive Data';
export type RelationshipType = 'related_to' | 'affects' | 'assesses' | 'plans' | 'supports' | 'documents' | 'observed_on' | 'depends_on';
export interface AssetProperties {
  kind: 'asset';
  asset_type: AssetType;
  hostname_url: string;
  environment: string;
  scope_state: ScopeState;
  authentication_requirements: string;
  application_owner: string | null;
  authorization_confirmed: boolean;
  approval_reference: string | null;
  tags: string[];
}
export interface SurfaceProperties {
  kind: 'surface';
  surface_type: SurfaceType;
  url_route: string;
  http_method: HttpMethod | null;
  parameter_name: string | null;
  parameter_location: ParameterLocation | null;
  authentication_state: string;
  roles: string[];
  status: SurfaceStatus;
  tags: string[];
  duplicate_ids: string[];
}
export interface BacklogProperties {
  kind: 'backlog';
  objective: string;
  category: string;
  priority: 'P1' | 'P2' | 'P3';
  status: BacklogStatus;
  blocker_reason: string | null;
  due_date: string | null;
}
export interface TestProperties {
  kind: 'test_case';
  category: string;
  priority: `P${number}`;
  execution_status: ExecutionStatus;
  assessment_outcome: AssessmentOutcome;
  testing_notes: string;
}
export interface FindingProperties {
  kind: 'finding';
  vulnerability_category: string;
  cwe: string | null;
  owasp: string | null;
  validation_status: ValidationStatus;
  severity: Severity;
  cvss_score: number | null;
  cvss_vector: string | null;
  severity_rationale: string | null;
  verified_at: string | null;
  verification_note: string;
}
export interface EvidenceProperties {
  kind: 'evidence';
  source_reference: string;
  media_type: string;
  sanitization_state: SanitizationState;
  evidence_type: 'Screenshot' | 'HTTP request' | 'HTTP response' | 'HTTP exchange' | 'Log' | 'Text document' | 'Other file';
  review_state: 'Needs Review' | 'Reviewed' | 'Restricted';
  source_tool: string;
  captured_at: string | null;
}
export interface ScopeProperties {
  kind: 'scope';
  section: string;
}
export interface ObservationProperties {
  kind: 'observation';
  surface_id: string;
  classification: Classification;
  discovery_source: string;
  source_reference: string;
  observed_method: HttpMethod | null;
  observed_at: string;
  relevant_role: string | null;
  authentication_context: string | null;
  confidence_note: string;
  evidence_id: string | null;
}
export interface TemplateProperties {
  kind: 'template';
  record_type: 'test_case' | 'finding';
  is_default: boolean;
}
export type RecordProperties = AssetProperties | SurfaceProperties | BacklogProperties | TestProperties | FindingProperties | EvidenceProperties | ScopeProperties | ObservationProperties | TemplateProperties;
export interface RecordChanges {
  asset_type?: AssetType;
  hostname_url?: string;
  environment?: string;
  scope_state?: ScopeState;
  authentication_requirements?: string;
  application_owner?: string | null;
  authorization_confirmed?: boolean;
  approval_reference?: string | null;
  tags?: string[];
  surface_type?: SurfaceType;
  url_route?: string;
  http_method?: HttpMethod | null;
  parameter_name?: string | null;
  parameter_location?: ParameterLocation | null;
  authentication_state?: string;
  roles?: string[];
  status?: SurfaceStatus | BacklogStatus | 'Open' | 'Done';
  objective?: string;
  category?: string;
  priority?: `P${number}`;
  blocker_reason?: string | null;
  due_date?: string | null;
  execution_status?: ExecutionStatus;
  assessment_outcome?: AssessmentOutcome;
  testing_notes?: string;
  vulnerability_category?: string;
  cwe?: string | null;
  owasp?: string | null;
  validation_status?: ValidationStatus;
  severity?: Severity;
  cvss_score?: number | null;
  cvss_vector?: string | null;
  severity_rationale?: string | null;
  source_reference?: string;
  media_type?: string;
  sanitization_state?: SanitizationState;
  evidence_type?: EvidenceProperties['evidence_type'];
  review_state?: EvidenceProperties['review_state'];
  source_tool?: string;
  captured_at?: string | null;
  section?: string;
  record_type?: 'test_case' | 'finding';
  is_default?: boolean;
  surface_id?: string;
  classification?: Classification;
  discovery_source?: string;
  observed_method?: HttpMethod | null;
  observed_at?: string;
  relevant_role?: string | null;
  authentication_context?: string | null;
  confidence_note?: string;
  evidence_id?: string | null;
}
export interface LinkInput {
  target_id: string;
  relationship_type?: RelationshipType;
}
export interface RecordCreateInput extends RecordChanges {
  title: string;
  content?: JSONContent;
  parent_id?: string | null;
  template_id?: string;
  links?: LinkInput[];
  custom_values?: Record<string, unknown>;
}
export interface RecordRef {
  id: string;
  display_id: string;
  title: string;
  kind: RegistryKind;
  deleted: boolean;
}
export interface Relationship {
  id: string;
  source: RecordRef;
  target: RecordRef;
  relationship_type: RelationshipType;
  direction: 'outgoing' | 'incoming';
  created_at: string;
}
export const recordPaths: Record<RecordKind, string> = {
  asset: 'assets',
  surface: 'attack-surfaces',
  backlog: 'backlog',
  test_case: 'test-cases',
  finding: 'findings',
  evidence: 'evidence',
  scope: 'scope-pages',
  observation: 'observations',
  template: 'templates'
};
