# VAPT Workspace — source of truth

Version 2.0 · Single-user local application · Four delivery phases. Phases 1–2 are implemented. Phases 3–4 remain planned requirements. See IMPLEMENTATION_STATUS.md and docs/REQUIREMENTS_MATRIX.md for evidence and gaps.

## 1. Product and safety boundaries

VAPT Workspace is a single-user, offline-capable knowledge base and workflow manager for web vulnerability assessments. It enables fast capture of observations, Notion-style in-browser editing, structured activity tracking, navigation among related records, minimal administration, customized records/views, and persistent local engagement data. Search, backups, history, and exports must be reliable. The workspace prioritizes the tester's current work, not management dashboards or vanity metrics.

All runtime functionality stays local. No telemetry, analytics, cloud database, AI integration, mandatory account, PostgreSQL, Redis, or Elasticsearch dependency. Installed frontend assets and Python dependencies run offline. Initial installation requires package access; optional developer tooling is not a runtime dependency. Phase 1 is a local server application, not a disconnected browser PWA: the local API must be running for persistence.

Never implement active scanning, request replay, exploitation, or automated interaction with assessed targets. Evidence inspection is passive; scanner imports consume files already obtained elsewhere. Displayed links are not automatically fetched. SQLite is authoritative; browser localStorage is not used for workspace data.

## 2. Navigation and engagement boundaries

The sidebar hierarchy is:

- PERSONAL WORKSPACE: Home; My Tasks; All Pages.
- VAPT WORKSPACE: Scope & Assets; Attack Surfaces; Testing Backlog; Test Cases; Findings; Evidence.
- OTHER: Activity History; Settings & Templates.

Also provide engagement switching, global search, modal general-page creation, collapsible sidebar, nested page navigation, and optional pinned/favorite pages. The shared page header shows the current area at left and route-specific context at right; only Home uses the quiet “pick up where you left off” copy. Page-tree expansion uses standard chevron disclosures. Each engagement owns its pages, tasks, scratchpad, specialized records, relationships, and recent history. Changing engagements changes all displayed engagement data; no API lookup or mutation can access another engagement's records. An engagement is archived using soft deletion and can be restored. New engagements have one empty scratchpad and no fictional assessment data.

Phase 1 exposes working personal navigation and settings. Future navigation labels appear as noninteractive text with explicit planned-phase labels. Full activity history and templates are reserved, not presented as working controls. Engagement UUID is encoded in routes and query cache keys. Ctrl/Cmd+K opens search; Escape closes it. Sidebar links and collapse button are keyboard accessible. A skip-to-content link is provided.

## 3. Home — fixed layout

Home has exactly three main sections: **Priority Queue**, **Notes**, and **Recently Opened**. Notes is always the bottom visual section, including the single-column mobile layout. Panels cannot be dragged, resized, or configured. No attack-surface totals, test totals, finding counts, coverage percentages, severity charts, KPI cards, or management statistics.

### Priority Queue

Show incomplete PERSONAL tasks only (Open or In Progress). Sort P1, P2, P3, then manual position within a priority, then creation time as a deterministic tie-break. Never automatically include Testing Backlog records. A compact Add task button beside the section title opens the creation modal; do not reserve a full input row. Edit titles, priority, and completion; navigate to full task details. Persist edits through the API and update the query cache immediately after acceptance. Completed tasks disappear from Home but remain under My Tasks. Manual ordering is available under My Tasks and determines Home order.

### Scratchpad

One persistent structured Tiptap document per engagement, shown as **Notes**, using the shared editor and autosave pipeline. Support headings, text, lists, checkboxes, code blocks with language metadata, tables, inline formatting, and other available Phase 1 blocks. Preserve formatting after server/browser restart and show understandable save state. Notes cannot be converted into additional documents.

### Recently Opened

Track actual user visits to page detail routes with a separate API operation. Ordinary page retrieval/search does not count as opening. SQLite stores the history. Most recently opened first; reopening a page updates its timestamp and moves it to the top. `MAX_RECENT = 8` in the API is the internal configurable cap, also used to trim older rows. Each engagement has independent history, preserved across new database sessions and application restarts. Exclude soft-deleted/inaccessible pages and scratchpads. Home displays up to eight accessible items.

## 4. Personal Tasks

Personal Tasks are independent of Testing Backlog and Test Cases. A task consists of a shared page and a typed SQL table holding its task properties:

| Property | Contract |
| --- | --- |
| Internal ID | Immutable UUID inherited from its page |
| Display ID | Stable, monotonic per engagement, e.g. TASK-0001; never reused after deletion |
| Title | Required nonempty, at most 300 characters |
| Description | Structured Tiptap document |
| Status | Open, In Progress, Done |
| Priority | P1, P2, P3 |
| Due date | Optional ISO calendar date |
| Position | Nonnegative manual position |
| Relation | Optional page/record UUID in the same engagement |
| Parent task | Optional same-engagement task UUID; no circular subtask chains |
| Timestamps | Creation and update times inherited from the page |

Create, edit, complete, reopen, reorder, and soft-delete tasks. Support simple inline titles, dedicated detail pages, status/priority/due-before filtering, basic title search, and grouping by priority or status. Reordering runs in a transaction with revision checks for each task; failure rolls the whole operation back. Subtasks can be created as tasks and assigned a parent in task detail. Related-page links and subtask navigation are visible there. Deleting a parent task preserves subtask records and links; reassignment is available. A linked task stays a personal task. Completing it never updates a test or backlog item's status.

## 5. Universal records and hierarchy

Every persisted record page has an immutable UUID, engagement UUID, stable display ID where applicable, title, optional icon, optional parent page UUID, validated Tiptap JSON, creation/update timestamps, integer revision, favorite flag, and soft-deletion timestamp. General pages use registry kind `page`; their physical legacy page type remains `note` to preserve released SQLite constraints. Migration `e2f3a4b5c6d7` promotes note documents already present at upgrade time to visible general pages without changing their content, hierarchy, UUIDs, revisions, or deletion state. Personal Tasks and specialized records participate in universal navigation. The singular Notes document uses the fixed engagement-local identifier SCRATCHPAD. Explicit compatibility API inputs created afterward with legacy registry kinds `note`/`journal` remain recoverable but are not listed, searched, created by normal UI, or exposed as workflows.

Create general pages from the sidebar modal or as children from page detail. The editor `/Create child page` command opens the same modal, creates a child of the current page, and inserts its stable internal link. `/Link page` selects and inserts an existing page link without creating or reparenting it. Rename, directly edit titles/content, move/nest by changing the parent, navigate breadcrumbs, add icons, pin/unpin in the sidebar, and search record titles. All Pages provides a tree and typed list. The singular engagement Notes document is freeform with no mandatory template and cannot own child pages.

Enforce same-engagement parents, reject self-parenting and ancestor cycles, and never nest beneath a scratchpad. The API validates full ancestor chains. Deleted pages are excluded by default. Soft-deleting a page promotes immediate children to the deleted page's parent and increments their revisions. It does not delete descendants, personal tasks, linked records, or relation UUIDs. Basic trash in Settings lists deleted pages and restores them. Restored pages retain their previous parent if accessible; otherwise they are restored at root. Children remain at their promoted locations. Relationships to deleted records remain recoverable; inaccessible link destinations return 404. Archiving/restoring an engagement preserves all its data.

Phase 4 adds comprehensive Trash/recovery tooling, immutable revision snapshots, and activity records. Phase 1 revision numbers are concurrency tokens, not immutable revision history.

## 6. Reusable rich-text editor

Phase 1 uses extensible Tiptap v3 extensions, shared by scratchpads and universal page/task documents. Required capabilities:

- Paragraphs and H1–H3 headings.
- Bold, italic, underline, inline code (and StarterKit strike support).
- Bullet and numbered lists; nested lists and checklists/task items.
- Blockquotes, code blocks with editable language metadata.
- Tables with row/column insertion, column resizing and table removal.
- Horizontal dividers, line breaks, keyboard shortcuts, undo/redo.
- Functional slash-command menu: paragraph, H1/H2/H3, bullet/numbered/checklist, quote, code block, table, divider, contextual child-page creation and existing-page linking. Menu filters as typed; arrows, Enter, Escape and pointer selection work.
- Markdown typing shortcuts supported by the relevant Tiptap extensions (headings, lists, quotes, code, dividers and marks where practical).
- Direct editing and automatic saving; no Edit/Save mode.

Persist JSON as structured SQLite JSON, not HTML. Validate the document tree, nesting, supported nodes/marks/attributes and safe link schemes. Unsupported content is explicitly rejected without overwriting the previous document. The frontend enables content checking, preserves the original loaded JSON, and disables editing on unsupported content. It must not silently convert unknown nodes into empty content. Extend the schema and validator together in future migrations/features.

Rendering uses the extension schema and React/Tiptap DOM rendering, with no raw HTML execution or dangerouslySetInnerHTML. Unsafe link protocols and unrecognized markup are rejected. External links are not automatically fetched. No HTML import/paste handler may execute scripts. Phase 3 adds record mentions, wiki-style internal links, embedded linked views, images/attachments, drag-to-reorder block controls, callouts, and advanced paste handling without replacing the editor.

## 7. Autosave and recovery

Normal text changes debounce for 700 ms. Page properties use the same revision-checked autosave writer. Each open document owns one serialized writer; it captures a snapshot per request and queues any newer edits after the current response. Responses do not replace the user's newer editor state. Successful responses advance the base revision; stale requests receive HTTP 409 and never overwrite newer content. Do not write when serialized content matches the baseline.

States: Saved, Unsaved (waiting), Saving, Save Failed. Pending content remains in memory after errors. Retry explicitly; download the unsaved document as JSON for recovery; review the server version. An explicit “Save my edits over this version” action rebases onto the reviewed revision and attempts a new conditional update. Any intervening write still produces a conflict. No silent overwrite on conflict.

A workspace-wide save coordinator blocks route changes while edits are pending and flushes them before proceeding. If persistence fails, navigation stays blocked and a recovery dialog sends the user back to the editor. Engagement switching uses routes and the same guard. Browser unload shows the browser's native warning for pending work and attempts a revision-checked keepalive request for payloads below 60 KB when no save is already in flight. Browser/process shutdown, crashes, network failure, and large pending documents cannot guarantee asynchronous save completion. Unsaved crash recovery is not persistent in Phase 1: wait for Saved or download JSON before quitting after a failure. The database's last accepted version always remains intact. Undo history is editor-session-local; saved document formatting is durable.

## 8. Phase 2 specialized VAPT records

Use shared page identities/documents with validated structured SQL tables for specialized fields. Do not implement these as unvalidated arbitrary JSON records. Add each schema through Alembic. Use UUID relationships, stable type-specific display IDs, explicit engagement scoping, transactions, pagination, and typed API/validation contracts. Specialized status changes never cascade into Personal Tasks.

### Assets and scope

First-class assets and scope references describe authorized hosts, URLs, applications, environments, ownership, inclusion/exclusion, and written scope references. Preserve scope provenance and link records without initiating target interaction.

### Attack surfaces and discovery

Support endpoints, parameters, forms, authorization boundaries, authentication flows, file uploads, client-side routes, cookies, headers, caching, CORS, redirects, error handling, rate limiting, TLS configuration, and external integrations. Use validated subtype attributes instead of losing type information. Discovery classifications distinguish Observed (directly seen), Advertised (described elsewhere), and Inferred (hypothesized). Retain historical discovery observations, their source, classification, timestamps, and links; new observations never overwrite old ones. Discovery observation is a first-class record.

### Testing Backlog

Independent planning records with their own status, priority, relations to assets/surfaces/test cases, and editable documentation. They do not appear automatically in the Home Personal Priority Queue and never share completion semantics with Personal Tasks.

### Test Cases

Track execution priority as a numeric rank from P1 through P99999 (default P2) separately from execution status and assessment outcome. Lower numbers execute first. Priority is visible, editable, filterable and numerically sortable in Test Cases, and does not add cases to the Home Personal Priority Queue. Personal Tasks and Testing Backlog retain their independent P1/P2/P3 priorities. Execution is Not Started, In Progress, Blocked, Completed, or Not Applicable. Assessment outcome independently is Not Assessed, No Issue Observed, Potential Finding, Finding Confirmed, or Inconclusive. Completed/Inconclusive is valid; Blocked never implies success. Keep execution notes, scope, related surfaces, findings, and evidence. Re-execution must retain useful historical context.

Explicit importer replacement is a separately authorized destructive exception, not ordinary re-execution: `--purge` previews deletion of all selected-engagement Test Cases including trash; `--purge --apply` permanently replaces them with the validated checklist in one transaction. Preserve all other record types, attachments, engagements and monotonic display-ID sequences. Remove case-owned search/recent/property/link metadata without deleting linked records. Block preserved child/task/custom-relation/provenance dependencies, reject stale previews and roll back the full operation on replacement failure. Do not open/delete SQLite directly from the CLI. This narrow importer operation does not implement or remove Phase 4 comprehensive trash, recovery, backup or workspace-reset requirements.

### Findings

Explicitly distinguish candidate findings from verified findings. Structured fields capture title, affected records, severity, description, reproduction documentation, impact, remediation, verification state, and evidence references. Verification is an explicit user action. Do not count all candidates as verified issues. Only verified findings enter report drafts by default.

### Evidence

Local files, passive previews, metadata, sanitization state, and links to multiple records. No embedded active target execution. File paths use controlled storage names; prevent traversal and enforce limits. Render untrusted HTML/scripts as inert text or safe previews, never execute them. Phase 3 implements attachment handling and HTTP inspection; Phase 4 includes backups of those files.

### Record relationships

Typed relational table with source/target UUIDs, relationship type, engagement ownership, timestamps, and uniqueness rules. Show both directions in the UI, including appropriate inverse labels. Reject foreign-engagement links and preserve soft-deleted targets for recovery.

## 9. Phase 3 customization and editing

- Manage custom property definitions through the UI with validated property types and constrained storage values. Do not use arbitrary JSON as the only structure for specialized domain records.
- Saved database views and richer customization of the Phase 2 table/Kanban baseline; filtering, sorting, grouping, resizing, column ordering/visibility. Search remains visible; filter/sort/group controls open from a compact Filter button in a modal. Persist views per engagement; clarify personal vs record view ownership in implementation.
- Bulk edits run transactionally with individual record revision checks and understandable conflicts. CSV export respects selected filters/columns and safe cell escaping.
- Global full-text search across accessible page/record text using SQLite-compatible indexing. Phase 1 provides scoped basic title search only.
- Internal @ mentions and [[ links with UUID targets, readable labels, scoped selection, and backlinks. Rename does not break links. Deleted targets render as unavailable references with recovery context.
- Quick Capture dialog for rapidly creating workflow records and tasks, with explicit destination and type. It opens from Ctrl/Cmd+Shift+K without a persistent floating page control.
- Embedded linked database views backed by saved queries and permissions/scoping, not copies of records.
- File attachments/images in local controlled storage, passive previews, safe paste handling, editor callouts and block reorder controls.
- Read-only HTTP evidence inspection: view stored request/response headers/body, decoding as an explicit passive operation. No send/replay controls, no automatic request to the assessed target.
- This delivery also accepts the five explicitly documented passive import adapters (Generic CSV/JSON, Katana JSONL, Feroxbuster JSONL and sanitized HTTP exchange text). They only parse user-supplied local bytes, require preview and confirmation, retain provenance and never contact imported targets. Broader scanner adapters, round-trip workspace import/export and recovery remain Phase 4.

## 10. Phase 4 reliability, import, export, deployment — planned only

- Additional structured scanner-result and round-trip workspace imports beyond the five Phase 3 passive adapters, safely parsed from local files and never executed. They require preview/validation, deduplication, provenance, original observation retention, and explicit candidate/verified status handling.
- Immutable revision history with document and structured-field snapshots, attribution appropriate to a single user, and explicit restoration generating a new revision.
- Activity History for creates, changes, opens where appropriate, imports, deletion, restoration, and exports, scoped by engagement and navigable to accessible records.
- Complete Trash and recovery controls that preserve relationships/hierarchy and explain effects before destructive operations. Permanent purge must be explicit and account for attachments and relation references.
- Database and attachment backup/restore: consistent SQLite snapshots, a versioned manifest, integrity checks, attachment hashes, staged validation and transactional restore. Preserve all engagement data. Restore incompatibility never silently corrupts the current workspace.
- Markdown and JSON export of selected pages/engagements with hierarchy, stable identities, documents, structured properties, relation references, and attachments. Round-trip JSON schema is versioned.
- Report-draft export from verified findings with evidence links, structured assessment details and a clear draft label. Never present candidates as verified without explicit selection.
- Safe local-only deployment, production static assets and local API, loopback defaults, Windows/Linux instructions, no mandatory external service. Finalize optional docker-compose.yml in Phase 4; no nonfunctional deployment configuration in Phase 1.

## 11. Architecture and selected dependencies

Monorepo root holds frontend/, backend/, scripts/, docs/, SPEC.md, AGENTS.md, IMPLEMENTATION_STATUS.md and README.md. Frontend separates app routing/shell, reusable UI, features, editor extensions/commands, hooks, typed API and tests. Backend separates routers, typed models/contracts, services (domain rules), repositories (lookups/projections), core database and migrations. This repository uses the current workspace root rather than creating an extra vapt-workspace directory.

Frontend: React 19.2.0, React Router 7.9.5, Vite 7.2.2, TypeScript 5.9.3 strict, Tailwind 4.1.17 (Vite integration), a local shadcn/ui-style Radix Slot/CVA Button, Tiptap 3.31.3, TanStack Query 5.90.5, TanStack Table 8.21.3. Tests: Vitest 3.2.4, RTL 16.3.0, Playwright 1.56.1. Tiptap packages are pinned to the same release to avoid extension schema mismatches; StarterKit v3 includes underline/link/undo-redo; TableKit supplies table nodes. React Router supports data-router navigation blocking. Node 22.12+ or 24 LTS satisfies Vite requirements.

Backend: Python 3.11+, FastAPI 0.115.12, Pydantic 2.11.7, SQLAlchemy 2.0.41, Alembic 1.16.1, Uvicorn 0.34.3, pytest 8.4.1, HTTPX 0.28.1, Ruff 0.11.13. These stable pinned versions use the Pydantic 2 and SQLAlchemy 2 APIs with FastAPI's Starlette-compatible TestClient. package-lock.json records the full npm tree; requirements.lock.txt freezes the Python tree. Python code has type annotations. Runtime includes only SQLite; foreign keys and busy timeout are enabled on each application connection. Tests use new migrated file databases, never production data.

Official installation references: https://tiptap.dev/docs/editor/getting-started/install/react and https://fastapi.tiangolo.com/tutorial/sql-databases/. Versions are deliberately pinned for repeatable installation, not automatically upgraded on startup.

## 12. API and persistence contract

Versioned REST prefix `/api/v1`. JSON errors contain `error.code`, `error.message`, and validation details where applicable. 404 hides inaccessible records; 409 signals stale revision/constraint conflict; 422 signals invalid input/cycles/documents. Listings have `items,total,offset,limit` with bounded positive limits and nonnegative offsets; frontend iterates pages so large workspaces are not silently truncated. All record endpoints carry engagement identity. All document/property writes include a required revision token; new accepted writes increment it and update timestamps. Unchanged documents do not create writes.

Phase 1 tables: engagements (identity/name/archive/counters), pages (shared identity/hierarchy/document/favorite/revision/deletion), personal_tasks (validated typed fields and FKs), recent_pages (engagement/page composite primary key and last-open timestamp). Migrations are explicit repeatable versioned DDL, with foreign keys, unique identity/date constraints and enum/range checks. No automatic create_all on application startup. Run Alembic before starting. SQLite transactions handle task ordering, sequence reservation, hierarchy promotion and engagement/scratchpad creation.

API families: engagement list/create/get/rename/archive/restore; scoped page list/create/get/patch/delete/restore; scratchpad get; recent get; explicit page open tracking; personal-task list/create/get/patch/reorder. Task deletion/recovery uses its universal page endpoints. See README for exact methods. Loopback server defaults and host validation protect the local boundary; no authentication service is required. Production hosting beyond loopback is outside Phase 1 scope.

## 13. Verification and release gates

Backend tests P1-B01–B15 cover two-engagement isolation; page lifecycle; nested cycles; formatted document roundtrip; invalid JSON; task lifecycle/order; filters; foreign-engagement task protection; scratchpads; recent ordering/session persistence/deletion; stale revisions; empty migrations; stable IDs. Additional tests cover recovery, archive/restore, transactional reorder failures, links/subtask cycles, no-op saves and pagination.

Component tests P1-F01–F10 cover the exact dashboard/no statistics; completed-task removal/order; scratchpad autosave; required editor schema/commands; actual slash insertion; recent navigation; engagement switching; sidebar/keyboard behavior. Writer tests cover serialized overlapping saves, failed-save retry, no-op avoidance and explicit conflict recovery.

Real-server Playwright tests P1-E01–E08 use an empty temporary SQLite database migrated before FastAPI startup, not mocked success responses. Cover engagement/note creation; note persistence after reload; task completion/My Tasks; nested breadcrumbs; recent history; engagement isolation; autosave failure retention/retry; undo/redo, slash commands and formatting after reload. Failure injection aborts a PATCH only; successful saves always reach FastAPI.

Before Phase 1 release: install locked dependencies, test migrations on empty database, run pytest/Vitest/TypeScript/lint/build/Playwright, fix failures, update status/matrix with actual evidence. No requirement is Verified without a passing test or recorded manual check. If environment restrictions block a suite, name the blocker and all unexecuted tests; never claim end-to-end readiness from component results alone. Do not begin Phase 2 until Phase 1 acceptance is complete.

## 14. Phase 2 implementation contract

### Shared storage and identity

An additive migration registers every existing page without rewriting Phase 1 rows. Specialized records retain the shared Page UUID, title, icon, hierarchy, validated Tiptap content, timestamps, revision, favorite and soft deletion. The physical legacy page_type remains note for specialized pages to preserve its existing check constraint; RecordRegistry.kind is authoritative and API responses expose the effective type. Typed extension tables hold domain properties. Display prefixes are AST, SURF, BLG, TST, FND, EVD, SCP, OBS and TPL; transactional per-engagement/type sequences never reuse identifiers. RecordRegistry composite foreign keys and SQLite triggers enforce engagement and kind integrity.

### Scope and assets

Scope & Assets offers idempotent creation of nine editable documents: Engagement overview, Rules of engagement, Testing boundaries, Exclusions, Approved testing windows, Project-team contacts, Known limitations, Authentication and test-account notes, Open questions. Additional scope pages support normal titles and hierarchy.

Assets store name (shared title), type (Application, Domain, Host, API, Environment, Other), hostname/URL, environment, scope state (In Scope, Out of Scope, Pending Confirmation), authentication requirements, optional owner, tags, approval reference, explicit authorization confirmation and rich notes. Default Pending Confirmation never authorizes testing. In Scope requires explicit authorization confirmation. Multiple assets/surfaces are related through UUID links.

### Surfaces and observations

Seventeen types cover HTTP endpoint, URL/query/body parameter, Form or input field, Authentication flow, Authorization boundary, File upload functionality, Client-side application route, Cookie or session behaviour, HTTP header, CORS configuration, Caching behaviour, Redirect behaviour, Rate limiting, Error handling, TLS/security configuration, Third-party integration, Other/custom. Fields include URL/route, optional HTTP method, parameter name/location, authentication state, roles, tags and notes. Assessment status is To Review, In Progress, Reviewed, Blocked, Not Applicable, with no security verdict implied.

DiscoveryObservation stores surface UUID, classification Observed/Advertised/Inferred, source/reference, optional method, timestamp, role/authentication context, confidence note, optional evidence UUID and editable description document. Provenance fields are immutable after capture; corrections append an observation while titles/descriptions remain editable. All historical observations remain visible.

Possible duplicates are explicitly indicated using normalized route, method, authentication context, type, parameters, roles and related asset set. URL alone is never unique. Different methods/contexts remain separate; no automatic merge or observation loss occurs. The explicit duplicate indicator satisfies Phase 2; a merge workflow is not implemented.

### Backlog, tests and findings

Backlog stores objective, category, independent P1/P2/P3 priority, Queued/In Progress/Blocked/Completed/Skipped status, blocker reason, due date and notes. Blocked requires a reason. Links can include multiple assets, surfaces and cases. Table and persistent drag-to-change-status Kanban are available with keyboard status controls. No linked completion cascades into Personal Tasks, tests or Home.

Test cases store category, numeric P1–P99999 execution rank, independent execution status/outcome, testing notes and procedure document. Default editable/removable headings are Objective, Prerequisites, Testing procedure, Observations, Result / outcome, Linked evidence, Linked findings, Related tasks or backlog items. Users select templates; Settings supports editable per-engagement test/finding templates and a single default per type. Existing records do not change when a template changes.

Findings default Candidate and Unassigned. Fields include vulnerability category, optional CWE/OWASP, severity (Critical, High, Medium, Low, Informational, Unassigned), optional CVSS score 0–10/vector/rationale and document. Default removable sections are Summary, Description, Affected components, Prerequisites, Reproduction, Expected behaviour, Observed behaviour, Security impact, Evidence, Remediation, References, Validation notes.

Validation states are Candidate, Validating, Confirmed, Inconclusive, Dismissed, Report Ready. Candidate may become Validating/Inconclusive/Dismissed; Validating may return to Candidate/Inconclusive/Dismissed. Only an explicit verify action from Validating with a nonempty verification note creates Confirmed and its verification timestamp. Confirmed may become Report Ready/Validating/Dismissed; Report Ready may become Confirmed/Validating/Dismissed. Inconclusive and Dismissed may reopen as Candidate/Validating; Inconclusive may become Dismissed. Returning to an unverified state clears verification proof. Direct creation or PATCH into verified states is rejected. Severity never changes validation. Report Ready requires retained explicit verification proof.

### Relationships and views

RecordRelationship stores UUID, source/target registry UUIDs, engagement, relationship type, timestamp, canonical pair and origin. Types: related_to, affects, assesses, plans, supports, documents, observed_on, depends_on. The same pair/type cannot be duplicated in either direction; self-links and cross-engagement targets are rejected. Searchable multi-selection uses atomic batch creation. Both ends show current labels, deleted targets remain recoverable without broken navigation, and incoming backlinks are available separately. Every detail page has a linked-record panel and related-record creation; Personal Task singular legacy links synchronize with universal relations without changing task semantics.

Reusable TanStack tables provide creation/opening, inline basic properties, allowlisted server sorting/column filtering, title search, pagination, delete/restore, status indicators and loading/error/empty states for assets, surfaces, backlog, cases and findings. No arbitrary client SQL is accepted. Evidence metadata/document records and multi-record links are implemented; file upload/storage, passive file previews and HTTP inspection remain Phase 3. Bulk changes and saved/custom views remain Phase 3.

### Phase 2 verification gate

P2-B01–B20 test typed CRUD, stable IDs, isolation, referential integrity, retained provenance, distinct contexts, independent completion, validation lifecycle, bidirectional/deduplicated relationships, filters/pagination, Phase 1 migration preservation and recovery. P2-F01–F10 test tables/properties, provenance, Kanban, independence, lifecycle, picker/backlinks and unchanged Home. P2-E01–E10 exercise real backend linked creation, backlinks/rename, real Kanban drag persistence, Home separation, isolation and reload. Run these together with all Phase 1 suites, migrations, strict type checking, lint and build before release. Phase 3 requires a separate user request.
