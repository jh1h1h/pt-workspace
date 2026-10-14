# Instructions for future Codex sessions

Before coding, read SPEC.md, IMPLEMENTATION_STATUS.md, docs/REQUIREMENTS_MATRIX.md and README.md. Inspect the repository and existing tests. SPEC.md is the source of truth; preserve every outstanding Phase 2–4 requirement until verified. Do not silently omit requirements or claim future features are complete.

Preserve existing user data and working functionality. Do not overwrite/delete workspace databases, attachments, unsaved documents, or unrelated files. Never run a seed implicitly. All database changes require a new Alembic migration; do not alter released migrations. Run migrations/tests on temporary databases. Use UUID relations, stable display IDs, engagement-scoped lookup/mutation, foreign keys and transactions.

Use TypeScript strict mode and Python annotations. Separate rendering, transport, domain rules and persistence; add reusable components/services/repositories rather than growing a single endpoint or component. Keep specialized record fields typed/validated; avoid arbitrary JSON blobs for domain data. JSON is appropriate for validated Tiptap documents.

Maintain the exact three-section Home layout (Priority Queue, Scratchpad, Recently Opened). Personal Tasks must remain separate from Testing Backlog/Test Cases. Never add KPIs, coverage/severity charts, configurable dashboard panels, scanning, exploitation, target requests, replay, telemetry, analytics, cloud services or mandatory accounts.

Keep runtime local and loopback-only by default. Browser storage is not an authoritative database. Unknown document nodes/attributes must trigger an explicit recovery state, not silent conversion. Preserve autosave debouncing, serialization, revisions, failed-edit retention and navigation/unload protection when extending the editor.

Run relevant automated tests after every change and all Phase 1 and Phase 2 checks before declaring a release complete: `python scripts/run.py checks`. Tests must exercise migrated SQLite and real API behavior; acceptance tests must not mock successful API responses. A network/socket restriction is a blocker to report, not a reason to fabricate pass counts. Update IMPLEMENTATION_STATUS.md and the requirements matrix with passing/failing/skipped/blocked evidence. No requirement is Verified without passing tests or documented manual verification. Do not start a later phase unless requested and the current acceptance gate is satisfied.

Preserve Phase 2 explicit scope authorization, append-only discovery provenance, verified finding lifecycle, typed registry foreign keys, templates, bidirectional links and independent Personal Task/Backlog/Test Case status. Read docs/API.md. Do not start Phase 3 without a new request.
