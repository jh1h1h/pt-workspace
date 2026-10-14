# Implementation status

Updated 2026-10-14. **Phases 1 and 2 complete. Ready for Phase 3 when requested; Phase 3 has not begun.**

## Implemented

Phase 1 remains intact: engagement CRUD/isolation, universal notes/journals/task pages, nested hierarchy, favorites, title search, soft deletion/recovery, independent Personal Tasks, persistent recent history, exact three-section Home, reusable Tiptap editor and revision-protected serialized autosave with failure recovery.

Phase 2 adds typed assets and explicit scope authorization; nine editable scope documents and additional pages; seventeen attack-surface types and explicit duplicate indicators; retained discovery observations; independent Testing Backlog with table and persistent drag/keyboard Kanban; Test Cases with separate execution/outcome; Candidate findings with explicit verification and protected Report Ready; evidence metadata/documents; editable default/custom test/finding templates; universal scoped UUID relationships with searchable atomic multiple linking, both-end display, backlinks and linked creation. Reusable TanStack tables provide search, filtering, sorting, pagination, inline edits, delete/restore and loading/error states. All details reuse Phase 1 editor, routing and autosave.

New registry, sequences and typed extension tables use additive Alembic migration b7fa36c2836a; existing Phase 1 rows remain unchanged. Composite foreign keys/triggers validate engagement/type integrity. Personal Task legacy links synchronize without completion cascades. No assessed target is contacted; runtime remains local.

## Verification evidence

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
