# Requirements matrix

Status vocabulary: Not Started, In Progress, Implemented, Verified, Blocked, Removed. Verified requires actual passing automated tests or a dated manual check. A passing backend test verifies backend behavior, not the entire corresponding UI flow. Refer to IMPLEMENTATION_STATUS.md for final gate counts and environment restrictions.

| Requirement ID | Description | Planned Phase | Implementation Location | Test IDs | Status |
| --- | --- | --- | --- | --- | --- |
| P1-ARCH | Monorepo; strict TypeScript; annotated Python; separated UI/API/domain/persistence | 1 | frontend/src; backend/app; tsconfig.json | TypeScript + Ruff checks | Verified |
| P1-LOCAL | Local runtime, SQLite authority, no cloud/telemetry/target interaction | 1 | backend/app/core; frontend/src/api; scripts/run.py | P1-B01; manual source/dependency inspection | Verified |
| P1-MIGRATIONS | Versioned repeatable migrations with data preservation and pre-existing note promotion | 1 | backend/migrations | P1-B14; test_migration_preserves_existing_documents_links_and_hierarchy; P2-B19; upgrade/downgrade copy check 2026-10-15 | Verified |
| P1-DOCS | Complete four-phase SPEC, agent instructions, README/status/matrix | 1 | SPEC.md; AGENTS.md; README.md; docs | Manual document audit (2026-10-14) | Verified |
| P1-DEPS | Pinned compatible dependencies and lockfiles; actual installs | 1 | frontend/package-lock.json; backend/requirements.lock.txt | npm ls; Python import/version checks; build | Verified |
| P1-ENG-API | Engagement CRUD/archive/restore; isolated scoping | 1 | backend/app/api/engagements.py; repositories/workspace.py | P1-B01; P1-B08; test_archive_restore_engagement | Verified |
| P1-ENG-UI | Engagement creation/switching; independent workspace data | 1 | features/Engagements.tsx; app/Shell.tsx | P1-F09; P1-E01; P1-E06 | Verified |
| P1-SHELL | Route-aware shared header and context, chevron page-tree disclosure, collapsible sidebar, keyboard navigation and modal page creation | 1 | app/Shell.tsx; app/router.tsx; components/PageTree.tsx; CreatePageDialog.tsx | P1-F10; header/page-modal component tests; desktop/mobile visual checks 2026-10-15 | Verified |
| P1-FUTURE-NAV | Reserve VAPT navigation; Phase 2 now provides functional module routes | 1 | app/Shell.tsx; SPEC.md §2 | P2-F01; P2-E01–E10 | Verified |
| P1-HOME | Exactly three fixed sections; Notes visually last at every viewport; no KPIs/configurable panels | 1 | features/Home.tsx; home-responsive.css | P1-F01; P1-F02; 390x844 and 1440x900 visual checks 2026-10-15 | Verified |
| P1-QUEUE | Incomplete personal tasks only; P1/P2/P3/manual ordering | 1 | features/Home.tsx; components/TaskRow.tsx | P1-F03; P1-F04; P1-B06 | Verified |
| P1-QUEUE-EDIT | Inline creation/title/priority/completion and task-detail links | 1 | components/NewTask.tsx; TaskRow.tsx | P1-F03; P1-B06; P1-E03 | Verified |
| P1-TASK-MODEL | UUID/display ID, document, status/priority/date/order/relations/subtasks/times | 1 | models/entities.py; schemas/contracts.py | P1-B06; test_subtask_cycles_and_links; P1-B15 | Verified |
| P1-TASK-CRUD | Create/update/complete/reopen/soft-delete/restore personal tasks | 1 | api/tasks.py; api/pages.py | P1-B06; P1-B08; P1-B02 | Verified |
| P1-TASK-ORDER | Transactional manual ordering with revision checks | 1 | services/workspace.py; api/tasks.py; features/Tasks.tsx | P1-B06; test_reorder_atomic_on_conflict | Verified |
| P1-TASK-FILTER | Status/priority/due-date filters; title search; priority/status grouping | 1 | api/tasks.py; features/Tasks.tsx | P1-B07; P1-F04; UI grouping source review | Implemented |
| P1-TASK-DETAIL | Description/properties/relations/subtasks in dedicated detail | 1 | features/PageDetail.tsx | P1-B06; test_subtask_cycles_and_links; API test; secondary UI coverage not comprehensive | Implemented |
| P1-PAGE-API | Page CRUD, immutable identities, titles/icons/content/revisions/times | 1 | api/pages.py; models/entities.py | P1-B02; P1-B15 | Verified |
| P1-PAGE-TREE | Create/nest/move general pages; modal child creation; same-engagement parents; reject cycles | 1 | services/workspace.py; components/CreatePageDialog.tsx; PageTree.tsx; PageDetail.tsx | P1-B02–B03; page-modal/slash component tests; P1-E04 | Verified |
| P1-PAGE-EDITOR | Direct title/content editing; persistent formatted document | 1 | features/PageDetail.tsx; editor | P1-B04; P1-E02 | Verified |
| P1-PAGE-BREADCRUMBS | Navigate ancestor breadcrumbs and child pages | 1 | features/PageDetail.tsx | P1-E04 | Verified |
| P1-NOTES | Exactly one engagement-scoped freeform Notes document | 1 | features/Home.tsx; editor/SavedDocument.tsx | P1-B09; P1-F05; single engagement note tests | Verified |
| P1-JOURNAL | Dated journal workflow | 1 | Retired; legacy rows retained for recovery | Product decision; creation/navigation removed | Removed |
| P1-FAVORITES | Persistent pins and sidebar favorites for active workflow pages | 1 | api/pages.py; features/PageDetail.tsx; app/Shell.tsx | P1-B02; secondary UI coverage not comprehensive | Implemented |
| P1-SCRATCH | Exactly one formatted persistent scratchpad per engagement | 1 | api/engagements.py; api/pages.py; features/Home.tsx | P1-B09; P1-F05; P1-E06 | Verified |
| P1-RECENT | Actual opens; SQLite persistence; independent history; cap eight | 1 | backend/app/models/entities.py; api/pages.py; features/Home.tsx | P1-B10; P1-B11; P1-B12; P1-F08; P1-E05 | Verified |
| P1-SEARCH | Scoped workflow-record/task title search and global-search dialog | 1 | api/pages.py; api/tasks.py; components/SearchDialog.tsx | P1-B07; P3-S01–S04; P1-F10; secondary UI result selection not comprehensive | Implemented |
| P1-EDITOR-BLOCKS | Paragraphs H1–H3 lists/checklists quotes code/language tables dividers | 1 | editor/extensions.ts; editor/commands.ts; RichEditor.tsx | P1-F06; P1-B04 | Verified |
| P1-EDITOR-MARKS | Bold/italic/underline/inline-code; keyboard/markdown shortcuts; undo/redo | 1 | editor/extensions.ts; RichEditor.tsx | P1-F06; P1-E08 | Verified |
| P1-SLASH | Functional block insertion, child-page creation and non-hierarchical existing-page links | 1 | editor/commands.ts; RichEditor.tsx | P1-F07; child/link page component tests; P1-E08 | Verified |
| P1-JSON-SAFE | Validated JSON; safe rendering; no unknown-content discard | 1 | schemas/contracts.py; editor/RichEditor.tsx | P1-B04; P1-B05; P1-F06; source review | Verified |
| P1-AUTOSAVE | 700ms debounce, serialization, change detection, save states | 1 | hooks/useAutosave.ts; editor/SaveFeedback | P1-F05; autosave.test.tsx; P1-E02 | Verified |
| P1-CONFLICT | Revision/CAS protects newer data; explicit conflict review/rebase | 1 | services/workspace.py; hooks/useAutosave.ts | P1-B13; autosave conflict and overlapping-save tests | Verified |
| P1-SAVE-RECOVERY | Retained failed content, retry/download; navigation/unload protection | 1 | hooks/saveCoordinator.ts; app/Shell.tsx; useAutosave.ts | P1-E07; autosave retry tests; documented shutdown limitation | Verified |
| P1-DELETE-RECOVERY | Soft delete/promote children/preserve links; basic trash/restore | 1 | api/pages.py; features/Settings.tsx | P1-B02; test_children_promoted_and_restore; secondary UI recovery coverage not comprehensive | Implemented |
| P1-API | /api/v1 typed schemas, pagination, consistent validation errors | 1 | backend/app/api; schemas/contracts.py; frontend/src/api | P1-B05; P1-B13; test_noop_save_and_pagination | Verified |
| P1-UI-STATES | Restrained editing UI; loading/error/empty states | 1 | components/Feedback.tsx; features; styles.css | P1-F01–F10; manual screenshots reviewed 2026-10-14 | Verified |
| P1-SEED | Empty production DB; opt-in labeled fictional development seed | 1 | scripts/seed.py; migrations; Engagements.tsx | P1-B14; P1-E01; manual isolated seed/idempotency run 2026-10-14 | Verified |
| P1-SCRIPTS | Portable installs/migrations/dev/test/check/stop scripts; loopback defaults | 1 | scripts/run.py; e2e_backend.py; README.md | Linux suites; Windows runtime not executed | Implemented |
| P1-ACCEPTANCE | All backend/component/E2E/static checks passing | 1 | backend/tests; frontend/src/tests; frontend/e2e | P1-B01–B15; P1-F01–F10; P1-E01–E08 | Verified |
| P2-ASSETS | Typed assets, explicit authorization and editable scope documents | 2 | models/records.py; features/records/RecordModule.tsx | P2-B01; P2-F01; P2-E01 | Verified |
| P2-SURFACES | Seventeen surface types, typed properties and duplicate indicators | 2 | models/records.py; services/records.py; RecordTable.tsx | P2-B01; P2-B07; P2-F02; P2-E01 | Verified |
| P2-DISCOVERY | Retained Observed/Advertised/Inferred provenance and editable descriptions | 2 | models/records.py; DiscoveryPanel.tsx | P2-B05; P2-B06; P2-F03 | Verified |
| P2-BACKLOG | Independent technical backlog, table/Kanban and blocked reasons | 2 | models/records.py; BacklogKanban.tsx | P2-B08–B10; P2-F04–F05; P2-E02; P2-E07–E08 | Verified |
| P2-CASES | Independent execution/outcome and editable procedure templates; detail prioritizes actions and finding threshold, without sidebar page entries | 2 | models/records.py; RecordProperties.tsx; TemplateSettings.tsx; PageDetail.tsx; Shell.tsx | P2-B11–B12; P2-F06; P2-E03; P2-E10; imported Test Case detail and sidebar component tests; browser mobile/desktop 2026-10-15 | Verified |
| P2-CASE-CHECKLIST | Optional local-only single-purpose application SSO Test Case checklist and explicit local API import by UUID or unique exact engagement name; not scanner import | 2 | ignored tmp/edupass-login-test-cases.json; scripts/import_test_cases.py | test_login_checklist_creates_real_test_cases and test_engagement_name_resolution_uses_real_paginated_api (migrated SQLite/actual API, 2026-10-15); 27 local payload schema checks; live 27 active/11 recoverable replacement check | Verified |
| P2-FINDINGS | Candidate defaults, explicit verification and protected Report Ready | 2 | services/records.py; RecordProperties.tsx | P2-B13–B14; P2-F07; P2-E04 | Verified |
| P2-EVIDENCE | Evidence metadata, sanitization state, documents and multi-record links | 2 | models/records.py; features/records | P2-B01; P2-B15; P2-B20 | Verified |
| P2-RELATIONS | Scoped UUID registry, bidirectional links and atomic multiple picker | 2 | services/relationships.py; RelatedRecordsPanel.tsx | P2-B04; P2-B15–B17; P2-F08–F09; P2-E05–E06 | Verified |
| P3-PROPERTIES | UI-managed custom typed properties | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-VIEWS | Persistent saved database views | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-TABLE-KANBAN | Saved/customizable table and Kanban views beyond Phase 2 baseline | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-FILTER-SORT | Modal filtering/sorting/grouping from compact Filter controls | 3 | RecordTable.tsx; BacklogKanban.tsx; Tasks.tsx | P2-F02 updated modal workflow; desktop visual check 2026-10-15 | Implemented |
| P3-COLUMNS | Column resizing/order/visibility | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-BULK | Bulk edits with conflicts; CSV export | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-FTS | Global full-text SQLite search | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-MENTIONS | Internal @ mentions and [[ wiki links | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-BACKLINKS | Document-mention/wiki backlinks beyond Phase 2 relationship backlinks | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-CAPTURE | Keyboard-only Quick Capture dialog without persistent floating control | 3 | GlobalQuickCapture.tsx; Tools.tsx | P3-X05; manual shortcut check 2026-10-15 | Verified |
| P3-EMBEDS | Embedded linked database/related-record views | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-FILES | File attachments/images and safe passive previews | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-HTTP | Read-only HTTP evidence inspection; no replay/target requests | 3 | SPEC.md §9 | Planned; tests required in corresponding phase | Not Started |
| P3-EDITOR | Block reorder/callouts/advanced paste extensions with compact block-actions menu | 3 | RichEditor.tsx; phase3Extensions.tsx | P3-T06–T07; desktop/mobile visual checks 2026-10-15 | Verified |
| P3-CONVERT | Convert selected Notes content to another note | 3 | Retired | Backend/frontend absence tests | Removed |
| P4-IMPORT | Structured scanner file imports | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-DEDUPE | Import deduplication with provenance and historical retention | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-REVISIONS | Immutable document/structured-property revision history | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-ACTIVITY | Scoped navigable Activity History | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-TRASH | Comprehensive trash/recovery and explicit purge | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-BACKUP | Consistent database and attachment backup/restore | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-EXPORT | Markdown and versioned JSON export | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-REPORT | Draft reports exported from verified findings | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |
| P4-DEPLOY | Safe local-only packaged deployment and optional compose | 4 | SPEC.md §10 | Planned; tests required in corresponding phase | Not Started |

| P2-SCOPE | Nine editable scope documents and additional hierarchical scope pages | 2 | services/document_templates.py; RecordModule.tsx | P2-E01; test_templates_authorization_and_blocker_validation; manual source review 2026-10-14 | Verified |
| P2-TEMPLATES | Editable test/finding templates with engagement defaults | 2 | services/document_templates.py; TemplateSettings.tsx | test_templates_authorization_and_blocker_validation; P2-B01; P2-E03–E04 | Verified |
| P2-VIEWS | Reusable tables: inline edits, search, filters, sort, pagination, delete/restore | 2 | RecordTable.tsx; api/records.py | P2-B18; P2-B20; P2-F01–F02; P2-E01–E10 | Verified |
| P2-MIGRATION | Additive typed schema/registry preserving every Phase 1 row | 2 | backend/migrations/versions/b7fa36c2836a* | P2-B19; empty migration upgrade/repeat/schema check | Verified |
| P2-ACCEPTANCE | Phase 1–2 suites and static checks | 2 | backend/tests; frontend/src/tests; frontend/e2e | P2-B01–B20; P2-F01–F10; P2-E01–E10; all P1 suites | Verified |
| P3-EVIDENCE-FILES | Evidence file storage, uploads and passive file previews | 3 | SPEC.md §9 | Future phase tests required | Not Started |
