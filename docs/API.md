# API reference — Phases 1–3

Base URL: http://127.0.0.1:8000/api/v1. Interactive typed OpenAPI: /docs; machine schema: /openapi.json. All record paths below are relative to /engagements/{eid}. README documents Phase 1 routes.

`POST /engagements/{eid}/pages` creates a visible general page by default. Its public `page_type` is `page`; `parent_id` optionally creates it beneath an accessible same-engagement page. Upgrade migration `e2f3a4b5c6d7` promotes note documents that predate the visible general-page kind. Explicit legacy `note`/`journal` values created after that migration remain API compatibility inputs for recovery tests but are hidden from normal listing and search.

| Resource path | Record kind / display prefix |
| --- | --- |
| /assets | asset / AST |
| /attack-surfaces | surface / SURF |
| /backlog | backlog / BLG |
| /test-cases | test_case / TST |
| /findings | finding / FND |
| /evidence | evidence / EVD (metadata/document plus optional controlled file) |
| /scope-pages | scope / SCP |
| /observations | observation / OBS |
| /templates | template / TPL |

Each resource provides GET/POST collection, GET/PATCH/DELETE /{pid}, POST /{pid}/restore. DELETE is soft deletion. Output is a shared Page including a discriminated typed `record` property; create/patch domain properties are top-level fields. PATCH requires revision and accepts title/content plus type-specific editable properties. UUIDs are immutable. Shared page detail/open/favorite/hierarchy/recovery endpoints remain usable. Observation provenance is creation-only; patch edits title/document.

Lists return items,total,offset,limit; specialized default limit is 20, maximum 200. Parameters: q (title search), offset, limit, sort, direction asc/desc, deleted, status/priority/severity/classification/surface_id where applicable; filters is a JSON object of at most ten allowlisted field/string pairs. Unsupported properties/sorts/filters return 422. No arbitrary SQL is accepted. All lookup and mutation paths enforce engagement scope.

Test Cases persist `priority` as P1, P2 or P3 (default P2). The Test Cases list supports `priority=P1`, `filters={"priority":"P1"}`, and `sort=priority&direction=asc` for highest-first ordering. This execution priority is independent of Personal Tasks and Testing Backlog.

| Additional route | Method / body |
| --- | --- |
| /scope-pages/initialize | POST; idempotently creates missing nine scope documents |
| /findings/{pid}/verify | POST; revision, verification_note; requires Validating |
| /records/{pid}/relationships | GET; links displayed in both directions |
| /records/{pid}/backlinks | GET; incoming links |
| /relationships | POST; source_id, target_id, relationship_type |
| /relationships/batch | POST; source_id, links array of target_id/relationship_type; atomic |
| /relationships/{rid} | DELETE; removes link |

Create records with related_ids to link multiple same-engagement targets in the creation transaction; template_id optionally selects a matching same-engagement test/finding template. Exact field constraints and enums are published in OpenAPI and SPEC.md §14. Errors use error.code/message/details as applicable: 404 inaccessible/wrong-engagement, 409 stale revision/duplicate constraint, 422 invalid typed properties or lifecycle. Finding confirmation requires explicit verification proof; changing severity never changes status. Record/task completion never cascades.

Persistence models are typed SQLAlchemy extensions to Page, a UUID registry, transactional identifier sequences and composite-FK relationships. Schema migration b7fa36c2836a is additive and backfills existing Phase 1 identities/legacy task links. No target request, replay or active execution endpoints exist.

## Phase 3 endpoints

All paths remain engagement scoped.

| Resource path | Methods / behavior |
| --- | --- |
| /custom-properties | GET active/deleted definitions; POST typed definition |
| /custom-properties/{id} | PATCH rename/type/options/default/required/order/visibility; DELETE soft-delete; POST /restore |
| /records/{id}/custom-values | GET values/defaults; PUT /{property_id} validates and stores a typed value |
| /saved-views | GET/POST persistent table or Kanban configurations |
| /saved-views/{id} | PATCH rename/default/config; DELETE with UI confirmation; POST /duplicate |
| /saved-views/{id}/records | GET filtered/sorted paginated live records |
| /saved-views/{id}/export.csv | GET all matching rows, or `selected=id,id`; restricted evidence is excluded |
| /bulk-update | POST selected IDs, per-row revisions, allowlisted field and value; atomic conflict behavior |
| /workflow-options | GET/POST labels mapped to canonical task/backlog/finding states |
| /records/{id}/workflow | PUT option and revision; finding verification rules still apply |
| /search | GET `q`, optional `record_type`, optional `limit`; FTS5 over accessible engagement records |
| /records/{id}/document-backlinks | GET mention/wiki backlinks by immutable UUID |
| /quick-capture | POST task, surface, backlog or candidate finding without navigation |
| /evidence-files | POST raw bytes with JSON `metadata` query and `X-Filename`; maximum 25 MB |
| /evidence-files/{id} | GET stored metadata; GET /preview inert preview; GET /download exact bytes |
| /content-templates | GET/POST reusable templates; POST /initialize six editable examples |
| /content-templates/{id} | PATCH metadata; POST /duplicate; POST /instantiate; DELETE soft-delete |
| /imports/preview | POST inert bytes with `format` and `filename`; validates without assessment-record writes |
| /imports/confirm | POST `import_id`; transactional and idempotent |
| /imports | GET engagement import history |

Saved-view columns, filters, sorts and grouping fields are validated against page fields, the selected typed record schema, and active same-engagement custom-property IDs. Unknown client field names return 422 and are never interpolated into SQL. Exact import schemas and fixtures are documented in README and `docs/import-examples/`.
