# VAPT Workspace

Local personal workspace for web vulnerability-assessment documentation. Phases 1–3 provide personal documents/tasks, typed assessment records, customization, passive evidence handling, full-text search, saved views, reusable templates and passive file imports. It performs no scanning or target interaction. Read SPEC.md for the complete four-phase plan and IMPLEMENTATION_STATUS.md for current verification evidence.

## Prerequisites

- Python 3.11–3.13 with pip and venv (Linux Debian/Kali: install python3-venv if needed; virtualenv is an alternative). The pinned pydantic-core does not support Python 3.14.
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

On macOS with Homebrew Python 3.14 as the default, install `python@3.13` and create the launcher environment with that interpreter instead of `python3`:

```bash
brew install python@3.13
python3.13 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock.txt
```

An existing `venv/` created with Python 3.14 cannot be switched to 3.13 by activating it; leave it untouched and use the new `.venv/` for this project.

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

This creates an engagement named **DEMO — Fictional assessment**, populates its Notes document, and creates two personal tasks; no fake findings, targets or scans. It is opt-in and idempotent. It preserves other engagements. For demo-only data, point VAPT_DATABASE_URL at a separate file first.

## Import the application SSO Test Case checklist

The current local checklist in `tmp/auth-flow-2h-test-cases.json` describes 23 application-owned staff, Admin and HQ login/OTP cases with explicit Burp/browser instructions: nine P1 cases budgeted at 110 minutes plus a 10-minute buffer, ten P2 follow-ups and four P3 cases. Open redirects receive 20 P1 minutes. Timings are hard caps, not a promise that every conditional branch will fit; stop and record untested/blocked branches. The older `tmp/edupass-login-test-cases.json` is retained separately, not merged into this checklist. Each case's Category names the vulnerability type, not a confirmed finding. Priority and category persist in the table/detail view. Test Case priorities accept P1 through P99999 and sort numerically; Personal Tasks and Testing Backlog remain P1/P2/P3. Keep future JSON checklists in ignored `tmp/`; they are not committed. Microsoft is out of scope. Adapt prerequisites to written authorization, never paste raw credentials/codes/OTPs into Test Cases, and leave fixture-dependent negative checks Blocked without the approved fixture.

With the local API running, preview the destination and exact-title skips from the repository root. This command makes no changes:

```bash
python3 scripts/import_test_cases.py tmp/auth-flow-2h-test-cases.json 'pgw2026'
```

Once the destination and case titles look right, explicitly create the missing cases:

```bash
python3 scripts/import_test_cases.py tmp/auth-flow-2h-test-cases.json 'pgw2026' --apply
```

Use your engagement's exact name in quotes (including capitalization), or its UUID from the engagement URL. If more than one active engagement has that name, the importer refuses to proceed and prints their UUIDs so you can choose explicitly. The importer uses only the loopback API, leaves existing Test Cases with identical titles untouched, and creates new cases as Not Started / Not Assessed. It does not create findings, contact assessed targets, or implement the separate scanner-import feature. A failed partial run can be resumed: preview again before retrying. Existing same-title records are skipped even if their content differs; review those records manually.

To replace the selected engagement's entire Test Cases collection with a revised checklist, first preview the permanent deletion (including trashed cases):

```bash
python3 scripts/import_test_cases.py tmp/auth-flow-2h-test-cases.json 'pgw2026' --purge
```

Only after reviewing that destination and count, explicitly apply the replacement:

```bash
python3 scripts/import_test_cases.py tmp/auth-flow-2h-test-cases.json 'pgw2026' --purge --apply
```

`--purge` alone is read-only. `--purge --apply` permanently removes every Test Case in the selected engagement, including execution notes, documents and trash, then imports the file in one transaction. Same-title cases are recreated with new UUIDs; their previous assessment state is not retained. Save any unsaved edits and close affected Test Case tabs first. The API preserves other engagements, notes, Personal Tasks, findings, evidence/attachments, templates, property definitions and monotonic display-ID counters. Only the deleted cases' search/recent entries, property values and relationship/backlink rows are removed; other documents keep their text/UUID references, whose deleted targets become unavailable. Child pages, Personal Task references, incoming custom relation values/defaults and append-only import provenance block purge rather than being silently changed. Detach editable references explicitly; provenance-linked cases cannot be purged by this tool. A stale preview or failed replacement rolls back all deletion/creation. At most 1000 replacement cases are accepted. There is no automatic backup or undo: retain any needed data before applying. This is a narrowly authorized Test Case importer operation, not a whole-workspace reset or the planned Phase 4 recovery/backup system.

If the importer says the running API does not support safe purge, restart the backend with the updated code and preview again. The importer never falls back to directly opening or deleting a SQLite database.

If import reports that the running API does not support Test Case priority, stop the existing dev server and restart it with `python3 scripts/run.py dev` from the repository root. Startup applies the additive database migration and loads the current backend code. Then preview the import again before using `--apply`; do not run a seed or remove the existing database.

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

Backend tests migrate a fresh SQLite file per fixture. Playwright starts the **actual FastAPI backend** against a TemporaryDirectory SQLite file and evidence directory, migrates it, and starts Vite. It refuses to reuse existing servers so acceptance cannot touch workspace.db. Stop your development servers before E2E. Twenty-one named Phase 1–3 acceptance tests run serially; the first verifies the initially empty engagement list. Successful responses are never mocked. P1-E07 intentionally aborts saves to exercise recovery. Results: docs/e2e-test-results.json; failure traces: frontend/test-results/. No E2E suite can run in an environment that disallows loopback socket binding.

## API and models

All endpoints use `/api/v1`. Listings return items/total/offset/limit (default 100, maximum 200). Each document/property patch requires its current revision; stale updates return 409. UUID/display IDs remain stable on rename. Validation errors return a consistent error object; unsupported document JSON is rejected rather than discarded.

| Endpoint | Methods / behavior |
| --- | --- |
| /health | GET |
| /engagements | GET paginated, POST create |
| /engagements/{eid} | GET, PATCH name, DELETE archive |
| /engagements/{eid}/restore | POST |
| /engagements/{eid}/pages | GET visible workflow/general pages; POST general page (`page_type: page`) |
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

Type `/` for the keyboard-accessible block menu. `/Create child page` opens a title modal, creates a child of the current page and inserts its link; `/Link page` inserts an existing page link without changing hierarchy. Formatting controls, markdown shortcuts, undo/redo, lists, tables and code language fields are live. Each engagement has one persistent Notes document at the bottom of Home. Add a task from the compact Priority Queue title-row button. Pin pages from detail and select their parent to move/nest them. Task and record filter/sort controls open from Filter buttons instead of occupying permanent rows. Link a task or assign a parent task in its detail view. Ctrl/Cmd+K opens engagement-scoped title search.

Autosave waits 700 ms, serializes requests, and uses revision checks. Navigation flushes pending document edits. On failure, content stays in the editor: Retry save, Download unsaved JSON, or Review server version. Overwriting a reviewed version requires an explicit action. Browser shutdown cannot guarantee an asynchronous save; wait for Saved or download your unsaved JSON before quitting after an error. Phase 1 has no durable crash-recovery buffer. Saved data and formatting survive restart; the editor's undo stack is session-local.

Soft deletion promotes child pages, preserves linked records, and retains the deleted page. Settings → Trash restores the page without moving children back. Existing note documents are promoted to visible general pages during upgrade; explicit legacy note/journal compatibility records created afterward remain recoverable but hidden from ordinary navigation and search. Archive engagement hides all its data and can be reversed from Settings or the engagement landing screen. Full immutable history/backup tooling is planned for Phase 4. Before manual copies of SQLite files, stop the application; a formal backup/restore workflow is not part of Phase 1.

## Dependencies and architecture

Pinned versions and compatibility decisions are documented in SPEC.md §11. frontend/package-lock.json and backend/requirements.lock.txt record installed dependency trees. The UI uses Tailwind v4 plus restrained document styles and a local reusable shadcn/ui-style Radix/CVA Button. No CDN/fonts/analytics/network services are required at runtime. Vite builds the frontend; a final packaged static-host deployment belongs to Phase 4. Do not expose the development servers to a LAN or internet.

## Phase 2 workflow

Open Scope & Assets and initialize the nine blank engagement documents when wanted. Create assets; explicitly confirm authorization before selecting In Scope. Discovery never grants authorization. Open Attack Surfaces to create typed surfaces and append discovery observations. The detail page preserves every classification/source alongside technical notes and shows possible duplicates rather than silently combining URLs.

Use the detail page’s Linked records **+ Add** menu to link an existing record, create the next workflow record, or create an independent Personal Task. Related records appear at both ends; Link existing supports searchable multiple selection. Detail pages keep hierarchy breadcrumbs in the shared header, metadata and parent selection inline, block movement in one editor menu, and child creation beside its section heading. Testing Backlog switches between table and Kanban; drag a card or use its keyboard-accessible status selector. Blocked requires a reason. Test execution and outcome have separate controls.

Findings start Candidate/Unassigned. Move to Validating, enter a verification note and explicitly verify before Confirmed or Report Ready. Changing severity never validates a finding. Settings & Templates creates editable test/finding templates; select one at creation or designate the engagement default. Tables support title search, property filters, sorting, pagination, inline changes and trash/restore. Phase 3 adds controlled evidence attachments and passive HTTP inspection as described below.

Existing databases upgrade through `python3 scripts/run.py migrate` or automatically before `dev`; no database replacement or seed is performed. Run Phase 2 tests individually with `pytest tests/test_phase2.py` from backend/, `npm test -- -t P2-` from frontend/, or `npx playwright test -g P2-` from frontend/. Phase 3 usage follows below; Phase 4 remains planned in SPEC.md.

## Phase 3 workflow

Settings & Templates manages typed custom properties, canonical workflow labels, reusable content templates and passive imports. Record modules provide persistent saved views, visible/reordered/resizable columns, allowlisted filters and sorts, bulk updates with revision checks, and CSV export. Ctrl/Cmd+K opens grouped full-text search; Ctrl/Cmd+Shift+K opens Quick Capture without navigating away. The editor supports stable mentions/wiki links, callouts, block movement/duplication, evidence image/file pickers and embedded saved views. Evidence uploads remain in controlled local storage, are hashed, and are previewed only as passive images or inert text. Restricted evidence is omitted from previews and search.

Imports are always previewed before an explicit confirmation and never fetch a URL, replay traffic, execute file content or run a scanner. UTF-8 input is limited to 10 MB and 10,000 rows. Example files are in `docs/import-examples/`. Accepted schemas are:

- Generic CSV (`csv`): header row; required `url` (aliases `endpoint`, `target`); optional `method`, `title`, `authentication_context` (alias `auth`) and `source`.
- Generic JSON (`json`): an array of those objects, or an object with a `records` array.
- Katana JSONL (`katana-jsonl`): one JSON object per line using the same fields.
- Feroxbuster JSONL (`feroxbuster-jsonl`): one JSON object per line using the same fields; extra fields such as `status` are retained only in the source file and are not executed.
- Sanitized HTTP exchange (`http-exchange`): inert UTF-8 text whose first line begins with an HTTP method or `HTTP/`; it is stored as HTTP evidence after confirmation.

Methods are normalized to uppercase and must be GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE or CONNECT. Preview creates only an import-preview record, not assessment records. Confirmation is transactional. Reconfirming the same import is idempotent; importing a different source can append a distinct discovery observation without overwriting manual record notes.

Run Phase 3 tests with `pytest tests/test_phase3.py` from `backend/`, `npm test -- -t P3-` from `frontend/`, or `npx playwright test e2e/phase3.spec.ts` from `frontend/`. `python3 scripts/run.py checks` runs the full Phase 1–3 gate. Phase 4 history, comprehensive trash/purge, backup/restore, report/Markdown/JSON export and packaged deployment are not implemented.
