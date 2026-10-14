# Phase 3 implementation plan

1. Add an additive migration for custom properties and workflow labels, saved views, document links, evidence-file metadata, FTS5 search, and import history/items. Preserve every Phase 1–2 row.
2. Extend the shared Tiptap JSON contract with UUID-backed mentions/wiki links, callouts, evidence images/files, and saved-view embeds. Reconcile document-origin links independently from manual relationships.
3. Add engagement-scoped APIs and services for properties/values, workflow options, views/bulk/CSV, evidence upload/preview/download, search, scratchpad conversion, quick capture, templates, and preview/confirm import adapters.
4. Extend the existing React editor, record details/tables, Settings/Templates, Search, Home, and shell with keyboard-accessible Phase 3 controls while keeping the fixed Home sections.
5. Add Phase 3 backend, component, and real-server E2E coverage; run every Phase 1–3 suite, migrations, strict type checking, linting, and the production build. Update the source specification and evidence documents.

Imports are implemented in Phase 3 because Prompt 3 explicitly requests them. Phase 4 retains revision history, activity history, complete trash/purge, backup/restore, report/Markdown/JSON export, and packaged deployment.
