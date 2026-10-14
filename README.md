# VAPT Workspace

Local personal workspace for web vulnerability-assessment documentation. Phases 1–2 provide personal documents/tasks plus Scope & Assets, Attack Surfaces, Testing Backlog, Test Cases, Findings, Evidence metadata, discovery observations, templates and bidirectional record links. It performs no scanning or target interaction. Read SPEC.md for the complete four-phase plan and IMPLEMENTATION_STATUS.md for current verification evidence.

## Prerequisites

- Python 3.11+ with pip and venv (Linux Debian/Kali: install python3-venv if needed; virtualenv is an alternative).
- Node.js 22.12+ or 24 LTS and npm.
- Chromium for Playwright (`npx playwright install chromium`). On Linux, missing browser OS libraries can be installed with `npx playwright install-deps chromium` using your system's administrative permissions.
- Available loopback ports 8000 (API) and 5173 (frontend). No external account or database required.

## Linux quick start

From the repository root:

```bash
python3 -m venv .venv
# Alternative when ensurepip is unavailable: virtualenv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
npm ci --prefix frontend
cd frontend
npx playwright install chromium
cd ..
python3 scripts/run.py dev
```

Open http://127.0.0.1:5173. The launcher runs migrations, starts both servers bound to 127.0.0.1, and stops both on Ctrl+C. Dependencies/assets run locally after installation. There is no production seed on startup. Create an engagement on the first screen.

## Windows PowerShell quick start

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.lock.txt
npm ci --prefix frontend
Push-Location frontend
npx playwright install chromium
Pop-Location
py -3 scripts/run.py dev
```

Activation is optional; commands use the virtual-environment interpreter directly, so PowerShell activation policy changes are unnecessary. Stop with Ctrl+C. The implementation uses portable Python subprocess commands and pathlib, not shell-only launch scripts. Windows execution needs verification on an actual Windows host; current tests run on Linux.

For an existing checked-out workspace, `python scripts/run.py install` performs the locked installs and installs the test browser. On Linux use `python3` if `python` is not the expected interpreter.

## Separate processes and migrations

```bash
python3 scripts/run.py migrate
# Terminal 1, from backend/: ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Terminal 2, from frontend/: npm run dev -- --port 5173 --strictPort
```

PowerShell equivalents in backend/: `..\.venv\Scripts\python.exe -m alembic upgrade head` then `..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`. Frontend uses the same npm command. API documentation: http://127.0.0.1:8000/docs. Vite proxies `/api` to the local backend, so no CORS/external API configuration is needed.

Default database: backend/workspace.db when using the launcher. Configuration: `VAPT_DATABASE_URL` (SQLite URL). Foreign keys are enabled on every application connection. Run all migrations before starting; API startup does not silently create tables. No production data appears in a fresh database until you create an engagement.

## Start with an empty database safely

Use a new filename rather than deleting an existing database:

```bash
export VAPT_DATABASE_URL="sqlite:///./fresh-workspace.db"
python3 scripts/run.py dev
```

```powershell
$env:VAPT_DATABASE_URL = 'sqlite:///./fresh-workspace.db'
py -3 scripts/run.py dev
```

Relative SQLite paths resolve in backend/ for the launcher. Keep the variable set for migrations and API startup. Clear it with `unset VAPT_DATABASE_URL` (Linux) or `Remove-Item Env:VAPT_DATABASE_URL` (PowerShell) after stopping. Never overwrite your existing database to obtain a clean test environment.

## Explicit fictional development seed

```bash
python3 scripts/run.py seed
```

This creates an engagement named **DEMO — Fictional assessment**, a note and two personal tasks; no fake findings, targets or scans. It is opt-in and idempotent. It preserves other engagements. For demo-only data, point VAPT_DATABASE_URL at a separate file first.

## Tests and checks

From the root (replace python3 with py -3 on Windows):

```bash
python3 scripts/run.py backend-tests
python3 scripts/run.py frontend-tests
python3 scripts/run.py e2e
python3 scripts/run.py checks
```

Individual tools:

```bash
cd backend
../.venv/bin/python -m pytest -q
../.venv/bin/python -m pytest -q tests/test_phase1.py -k P1_B13
cd ../frontend
npm test
npm test -- -t P1-F05
npm run typecheck
npm run lint
npm run build
npm run e2e
npx playwright test -g P1-E07
cd ..
.venv/bin/python -m ruff check backend scripts
```

PowerShell uses `..\.venv\Scripts\python.exe` from backend/ and `.\.venv\Scripts\python.exe` from root. `checks` runs pytest, Vitest, TypeScript, ESLint, Ruff, production build and Playwright; it stops on a failed check.

Backend tests migrate a fresh SQLite file per fixture. Playwright starts the **actual FastAPI backend** against a TemporaryDirectory SQLite file, migrates it, and starts Vite. It refuses to reuse existing servers so acceptance cannot touch workspace.db. Stop your development servers before E2E. Eighteen named Phase 1–2 acceptance tests run serially; the first verifies the initially empty engagement list. Successful responses are never mocked. P1-E07 intentionally aborts saves to exercise recovery. Results: frontend/test-results/results.json; failure traces: frontend/test-results/. No E2E suite can run in an environment that disallows loopback socket binding.

## API and models

All endpoints use `/api/v1`. Listings return items/total/offset/limit (default 100, maximum 200). Each document/property patch requires its current revision; stale updates return 409. UUID/display IDs remain stable on rename. Validation errors return a consistent error object; unsupported document JSON is rejected rather than discarded.

| Endpoint | Methods / behavior |
| --- | --- |
| /health | GET |
| /engagements | GET paginated, POST create |
| /engagements/{eid} | GET, PATCH name, DELETE archive |
| /engagements/{eid}/restore | POST |
| /engagements/{eid}/pages | GET search/favorites/trash, POST note/journal |
| /engagements/{eid}/pages/{pid} | GET, PATCH document/properties, DELETE soft-delete (including task pages) |
| /engagements/{eid}/pages/{pid}/restore | POST restore |
| /engagements/{eid}/pages/{pid}/open | POST actual visit |
| /engagements/{eid}/scratchpad | GET engagement scratchpad |
| /engagements/{eid}/recent | GET up to eight accessible recent pages |
| /engagements/{eid}/tasks | GET status/priority/due-before/title filters, POST |
| /engagements/{eid}/tasks/{pid} | GET, PATCH typed task fields/document |
| /engagements/{eid}/tasks/reorder | POST revision-checked list of IDs, transactional |

SQLAlchemy models: Engagement, Page, PersonalTask, RecentPage, RecordRegistry, RecordSequence, Asset, AttackSurface, BacklogItem, TestCase, Finding, Evidence, ScopeDocument, DiscoveryObservation, DocumentTemplate and RecordRelationship. Schema DDL is in backend/migrations/versions/. PersonalTask is a typed extension of a Page, not a generic JSON object; Tiptap content is the validated document JSON column. Phase 2 specialized records use typed extension tables and an additive registry migration preserving existing rows. See [API reference](docs/API.md) for the new endpoints.

## Editing and recovery

Type `/` for the keyboard-accessible block menu. Formatting controls, markdown shortcuts, undo/redo, lists, tables and code language fields are live. Pin pages from detail; select their parent to move/nest them. Journal date creates/opens a unique daily document. My Tasks filters by status/priority/due date, groups by priority/status and offers move-up/down controls within priorities. Link a task or assign a parent task in its detail view. Ctrl/Cmd+K opens engagement-scoped title search.

Autosave waits 700 ms, serializes requests, and uses revision checks. Navigation flushes pending document edits. On failure, content stays in the editor: Retry save, Download unsaved JSON, or Review server version. Overwriting a reviewed version requires an explicit action. Browser shutdown cannot guarantee an asynchronous save; wait for Saved or download your unsaved JSON before quitting after an error. Phase 1 has no durable crash-recovery buffer. Saved data and formatting survive restart; the editor's undo stack is session-local.

Soft deletion promotes child pages, preserves linked records, and retains the deleted page. A journal date remains reserved while its journal is in trash; restore that journal to use the same date. Settings → Trash restores the page without moving children back. Archive engagement hides all its data and can be reversed from Settings or the engagement landing screen. Full immutable history/backup tooling is planned for Phase 4. Before manual copies of SQLite files, stop the application; a formal backup/restore workflow is not part of Phase 1.

## Dependencies and architecture

Pinned versions and compatibility decisions are documented in SPEC.md §11. frontend/package-lock.json and backend/requirements.lock.txt record installed dependency trees. The UI uses Tailwind v4 plus restrained document styles and a local reusable shadcn/ui-style Radix/CVA Button. No CDN/fonts/analytics/network services are required at runtime. Vite builds the frontend; a final packaged static-host deployment belongs to Phase 4. Do not expose the development servers to a LAN or internet.

## Phase 2 workflow

Open Scope & Assets and initialize the nine blank engagement documents when wanted. Create assets; explicitly confirm authorization before selecting In Scope. Discovery never grants authorization. Open Attack Surfaces to create typed surfaces and append discovery observations. The detail page preserves every classification/source alongside technical notes and shows possible duplicates rather than silently combining URLs.

Use Add linked record from a detail page to create a backlog item, then a test case, then a Candidate finding. Related records appear at both ends; Link records supports searchable multiple selection. Personal Tasks remain independent. Testing Backlog switches between table and Kanban; drag a card or use its keyboard-accessible status selector. Blocked requires a reason. Test execution and outcome have separate controls.

Findings start Candidate/Unassigned. Move to Validating, enter a verification note and explicitly verify before Confirmed or Report Ready. Changing severity never validates a finding. Settings & Templates creates editable test/finding templates; select one at creation or designate the engagement default. Tables support title search, property filters, sorting, pagination, inline changes and trash/restore. Evidence currently stores documentation and metadata; attachments and passive HTTP inspection are reserved for Phase 3.

Existing databases upgrade through `python3 scripts/run.py migrate` or automatically before `dev`; no database replacement or seed is performed. Run Phase 2 tests individually with `pytest tests/test_phase2.py` from backend/, `npm test -- -t P2-` from frontend/, or `npx playwright test -g P2-` from frontend/. `python3 scripts/run.py checks` runs both phases. Phases 3–4 remain planned in SPEC.md.
