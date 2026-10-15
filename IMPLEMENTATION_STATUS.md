# Implementation status

Updated 2026-10-15. **Phases 1 and 2 remain implemented; Phase 3 implementation is present but its full acceptance gate is blocked by one saved-view frontend test.**

## Implemented

Phase 1 foundations remain intact: engagement CRUD/isolation, task and specialized-record pages, nested hierarchy, favorites, title search, soft deletion/recovery, independent Personal Tasks, persistent recent history, exact three-section Home, reusable Tiptap editor and revision-protected serialized autosave with failure recovery. The former note/journal workflow has been retired in favor of exactly one engagement-scoped Notes document. Existing note documents are promoted to visible general pages by additive migration `e2f3a4b5c6d7`; explicit legacy compatibility records created afterward remain recoverable but hidden.

General pages now have an explicit visible registry kind backed by additive migrations `d1e2f3a4b5c6` and `e2f3a4b5c6d7`. Sidebar and child-page creation use a title modal; editor slash commands create-and-link a child or link an existing page without changing hierarchy. Record, task and Kanban filter/sort controls use compact Filter buttons and modal controls. The shared route header uses route-specific context, with “A quiet place to pick up where you left off.” reserved for Home and clickable hierarchy breadcrumbs on detail routes. Detail pages consolidate metadata, parent selection, pin/delete, editor block actions, linked-record creation and child creation into compact inline controls. Quick Capture remains available from Ctrl/Cmd+Shift+K without a floating trigger. Notes remains the bottom Home section on desktop and mobile.

Phase 2 adds typed assets and explicit scope authorization; nine editable scope documents and additional pages; seventeen attack-surface types and explicit duplicate indicators; retained discovery observations; independent Testing Backlog with table and persistent drag/keyboard Kanban; Test Cases with separate execution/outcome; Candidate findings with explicit verification and protected Report Ready; evidence metadata/documents; editable default/custom test/finding templates; universal scoped UUID relationships with searchable atomic multiple linking, both-end display, backlinks and linked creation. Reusable TanStack tables provide search, filtering, sorting, pagination, inline edits, delete/restore and loading/error states. All details reuse Phase 1 editor, routing and autosave.

New registry, sequences and typed extension tables use additive Alembic migration b7fa36c2836a; existing Phase 1 rows remain unchanged. Composite foreign keys/triggers validate engagement/type integrity. Personal Task legacy links synchronize without completion cascades. No assessed target is contacted; runtime remains local.

## Verification evidence

An opt-in application SSO checklist (`tmp/edupass-login-test-cases.json`) and loopback Test Case importer (`scripts/import_test_cases.py`) are available for manual engagement use. Future Test Case JSON files belong in ignored `tmp/` and are not committed. On 2026-10-15 the initial 11 imported cases were confirmed untouched and unlinked, then soft-deleted through the scoped API at the user's request; all 27 revised single-purpose cases passed schema validation and were imported into that engagement. A live API check confirmed exactly 27 active cases with matching documents and 11 recoverable originals, with no other active cases. No assessed target was contacted. The checked-in importer regression uses a self-contained migrated-SQLite real-API fixture so it runs without the ignored checklist; the backend suite passed 60/60 at the preceding check. This is not the Phase 4 scanner-import workflow.

The importer also accepts exact active engagement names, paginates the real engagement listing and rejects missing or duplicate names; UUID input remains supported. Name-based preview for `pgw2026` skipped all 27 existing cases without changes. A migrated-SQLite API test covers both identifiers, case-sensitive matching, pagination and duplicate rejection; the backend suite passed 61/61 after this change.

Test Case entries no longer appear in the sidebar page tree or pinned list; the dedicated Test Cases navigation remains. Imported Test Case detail presents prerequisites, finding threshold, and steps first, with progress, evidence, and editing in disclosures. Phase 1–2 frontend component tests passed 27/27 on 2026-10-15, including sidebar and detail-route regressions; TypeScript, build, and mobile/desktop browser checks passed. ESLint still reports the pre-existing RecordTable hook-dependency warning. This does not change the separate Phase 3 saved-view acceptance blocker.

Latest check on 2026-10-15 after the page-workflow and layout update: backend pytest passed 59/59, Phase 1–2 Vitest passed 25/25, and full Vitest passed 38/39. The backend document validator now round-trips Tiptap 3.31 link marks with nullable `title` attributes while retaining unsafe-scheme rejection; a non-mutating live-server probe confirmed the captured payload passes validation. TypeScript, Ruff, production build, page/slash interactions, modal filtering, and desktop/mobile visual checks passed. ESLint completed with one pre-existing `RecordTable.tsx` hook-dependency warning. `P3-C05 saved views can be created, selected, duplicated and deleted` remains blocked because the test observes no `deleteView` call; E2E was not rerun in this check.

| Suite | Passed | Failed | Skipped | Report |
| --- | --- | --- | --- | --- |
| Backend pytest | 44 | 0 | 0 | docs/backend-test-results.xml |
| Frontend Vitest | 25 | 0 | 0 | docs/frontend-test-results.json |
| Actual-backend Playwright | 18 | 0 | 0 | docs/e2e-test-results.json |
| Total | 87 | 0 | 0 | Phase 1 and Phase 2 combined |

Backend includes 23 Phase 1 and 21 Phase 2 tests; frontend includes 15 Phase 1 and 10 Phase 2 tests; E2E includes 8 Phase 1 and 10 Phase 2 tests. All required named acceptance cases run. TypeScript strict checking, ESLint, Ruff and production build pass. Fresh SQLite migration upgrade, repeated upgrade and Alembic schema check pass; Phase 2 migration preservation is exercised against every existing Phase 1 table row in P2-B19.

The actual E2E suite ran directly in the agent using user-approved execution outside the socket-restricted sandbox. The final report records 18 expected, zero unexpected/skipped/flaky, 27.9 seconds. E2E starts actual FastAPI/Vite and a temporary migrated SQLite database; no successful API responses are mocked. P1-E07 deliberately aborts saves to verify recovery. Earlier failures are fixed.

Manual visual review on 2026-10-14: docs/home-preview.png, docs/editor-preview.png, docs/phase2-test-case-preview.png and docs/phase2-kanban-preview.png inspected. Neutral document layout, exact Home panels, structured properties, Completed/Inconclusive case, template headings, linked records and persisted Completed Kanban card are visible. Sidebar is internally scrollable; Kanban can scroll horizontally. Screenshots contain isolated fictional E2E data only.

## Remaining scope and practical limitations

- Evidence file uploads/storage, passive file previews and HTTP inspection remain Phase 3; Phase 2 evidence is metadata and document references.
- Search is engagement-scoped title search. Custom properties, saved/customized views, bulk operations/CSV, full-text search, document mentions/wiki backlinks, Quick Capture, embedded views, attachments and richer editing remain Phase 3. Relationship backlinks already work.
- Imports/provenance deduplication, immutable revisions, complete activity history/trash, backup/restore, Markdown/JSON/report exports and packaged deployment remain Phase 4.
- Discovery provenance is immutable after capture; append a correction/new observation. Title and description remain editable. Duplicates are indicated; automatic/manual merge is not implemented or needed for the specified indicator alternative.
- Browser shutdown cannot guarantee an asynchronous save. Failed content remains in memory with retry/download/review; there is no durable crash buffer. Wait for Saved before quitting. Undo history is session-local.
- Soft deletion promotes child pages; restoration does not move them back. Deleted relationship targets retain history and avoid active broken links until recovered.
- Windows-compatible scripts and PowerShell instructions are supplied; actual Windows execution has not been tested. Linux suites and actual servers are verified.
- Vite reports a combined editor bundle above 500 KB; the production build succeeds. Final deployment packaging remains Phase 4.
- Protected .git is not a writable initialized repository; lockfiles are present but no Git commit was created.

## Handoff

Read SPEC.md, AGENTS.md, README.md, docs/API.md and docs/REQUIREMENTS_MATRIX.md. Preserve all data and Phase 1–2 behavior; add migrations, use typed extensions and run both phases' suites. Never change Home's three panels or cascade completion. Do not begin Phase 3 without a new request.
