# Implementation status

Updated 2026-10-15. **Phases 1–3 are implemented and the Phase 1–3 automated acceptance gate passes. Phase 4 has not started.**

## Implemented

Phase 1 foundations remain intact: engagement CRUD/isolation, task and specialized-record pages, nested hierarchy, favorites, title search, soft deletion/recovery, independent Personal Tasks, persistent recent history, exact three-section Home, reusable Tiptap editor and revision-protected serialized autosave with failure recovery. The former note/journal workflow has been retired in favor of exactly one engagement-scoped Notes document. Existing note documents are promoted to visible general pages by additive migration `e2f3a4b5c6d7`; explicit legacy compatibility records created afterward remain recoverable but hidden.

General pages now have an explicit visible registry kind backed by additive migrations `d1e2f3a4b5c6` and `e2f3a4b5c6d7`. Sidebar and child-page creation use a title modal; editor slash commands create-and-link a child or link an existing page without changing hierarchy. Record, task and Kanban filter/sort controls use compact Filter buttons and modal controls. The shared route header uses route-specific context, with “A quiet place to pick up where you left off.” reserved for Home and clickable hierarchy breadcrumbs on detail routes. Detail pages consolidate metadata, parent selection, pin/delete, editor block actions, linked-record creation and child creation into compact inline controls. Quick Capture remains available from Ctrl/Cmd+Shift+K without a floating trigger. Notes remains the bottom Home section on desktop and mobile.

Phase 2 behavior remains intact: typed assessment records, explicit scope authorization, append-only discovery provenance, independent backlog/test states, verified-finding lifecycle, templates and bidirectional links. Phase 3 adds additive migration `c9d4e5f60718` for typed custom properties, canonical workflow labels, saved views, document links, controlled evidence files, reusable content templates, FTS5 search and import provenance. Migrations `d1e2f3a4b5c6` and `e2f3a4b5c6d7` register and promote visible general pages without deleting existing rows.

Implemented Phase 3 behavior includes all eight custom-property types with required/default/value/relation validation; stable rename and confirmation-required destructive conversion; saved-view create/edit/rename/default/duplicate/delete, live embedded views, visible/order/width configuration, allowlisted filtering/sorting/grouping, backend pagination, transactional revision-checked bulk edits and scoped CSV export; UUID mentions/wiki links and backlinks; searchable evidence/saved-view editor pickers, callouts, captions and block actions; controlled evidence upload/hash/deduplication/inert preview/exact download; engagement-scoped FTS5; Quick Capture; six reusable template examples; and preview/confirm passive imports for the five documented formats.

Restricted evidence is download-only, excluded from preview/search and omitted from saved-view CSV exports. Uploaded test evidence is isolated in temporary E2E storage. No import, preview, editor embed or evidence operation sends a request to an assessed target.

## Verification evidence

An opt-in application SSO checklist (`tmp/edupass-login-test-cases.json`) and loopback Test Case importer (`scripts/import_test_cases.py`) are available for manual engagement use. Future Test Case JSON files belong in ignored `tmp/` and are not committed. On 2026-10-15 the initial 11 imported cases were confirmed untouched and unlinked, then soft-deleted through the scoped API at the user's request; all 27 revised single-purpose cases passed schema validation and were imported into that engagement. A live API check confirmed exactly 27 active cases with matching documents and 11 recoverable originals, with no other active cases. No assessed target was contacted. The checked-in importer regression uses a self-contained migrated-SQLite real-API fixture so it runs without the ignored checklist; the backend suite passed 60/60 at the preceding check. This is not the Phase 4 scanner-import workflow.

The importer also accepts exact active engagement names, paginates the real engagement listing and rejects missing or duplicate names; UUID input remains supported. Name-based preview for `pgw2026` skipped all 27 existing cases without changes. A migrated-SQLite API test covers both identifiers, case-sensitive matching, pagination and duplicate rejection; the backend suite passed 61/61 after this change.

Test Case entries no longer appear in the sidebar page tree or pinned list; the dedicated Test Cases navigation remains. Imported Test Case detail presents prerequisites, finding threshold, and steps first, with progress, evidence, and editing in disclosures. Phase 1–2 frontend component tests passed 27/27 on 2026-10-15, including sidebar and detail-route regressions; TypeScript, build, and mobile/desktop browser checks passed. ESLint still reports the pre-existing RecordTable hook-dependency warning. This does not change the separate Phase 3 saved-view acceptance blocker.

The Phase 3 saved-view failure and the RecordTable hook warning were subsequently fixed. Latest complete post-merge gate on 2026-10-15:

| Suite | Passed | Failed | Skipped | Evidence |
| --- | ---: | ---: | ---: | --- |
| Backend pytest | 63 | 0 | 0 | `docs/backend-test-results.xml`; full `scripts/run.py checks` output |
| Frontend Vitest | 42 | 0 | 0 | `docs/frontend-test-results.json` |
| Actual-backend Playwright | 21 | 0 | 0 | `docs/e2e-test-results.json` |
| Total automated tests | 126 | 0 | 0 | Phase 1–3 combined |

TypeScript strict checking, ESLint, Ruff and the production Vite build pass. A fresh temporary SQLite database upgraded through `e2f3a4b5c6d7 (head)` and `alembic check` reported no upgrade operations. Alembic emitted one SQL-introspection warning while checking a composite foreign key, but the check exited successfully. The production build retains the known non-failing combined-editor chunk-size warning.

Playwright starts actual FastAPI and Vite servers against a fresh migrated temporary SQLite database and temporary evidence directory. No successful API response is mocked. The 21 tests comprise eight Phase 1, ten Phase 2 and three Phase 3 real-backend scenarios.

## Remaining Phase 3 limitations

- The single engagement Notes/Scratchpad document is intentionally not convertible into additional notes. This preserves SPEC §§3/5 and requirement P3-CONVERT is Removed; the prompt's selected-range conversion request conflicts with that source-of-truth decision.
- Quick Capture supports Personal Task, Attack Surface, Testing Backlog item and Candidate Finding. General pages/extra “Notes” are intentionally excluded because the product has exactly one Notes document. If a record type has a required custom property without a default, full record creation must be used so the value can be supplied.
- Saved-view grouping is persisted and drives supported Kanban/status presentation; table rendering does not add arbitrary multi-level grouped rows.
- Evidence files created by a failed upload transaction are removed immediately. There is no automatic filesystem-wide orphan sweep because Phase 4 backup/recovery does not yet provide a safe way to distinguish abandoned bytes from recoverable/staged files.
- Executable/binary formats are download-only; textual markup and HTTP previews are rendered as inert `text/plain` in a sandbox. HTTP decoding beyond the stored UTF-8-safe preview is not implemented as a separate transform.
- Automated coverage is strongest at API/component boundaries plus three integrated Phase 3 scenarios. There is no exhaustive browser scenario for every custom-property type or every template button, though those API behaviors are covered by migrated-SQLite tests.

## Phase 4 readiness

The Phase 3 acceptance gate is green and the repository is technically ready for a separately requested Phase 4. Do not begin Phase 4 implicitly. Phase 4 still owns immutable revision/activity history, comprehensive trash/purge, backup/restore, broader imports, Markdown/JSON/report exports and packaged deployment.
