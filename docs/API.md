# API reference — Phases 1–2

Base URL: http://127.0.0.1:8000/api/v1. Interactive typed OpenAPI: /docs; machine schema: /openapi.json. All record paths below are relative to /engagements/{eid}. README documents Phase 1 routes.

| Resource path | Record kind / display prefix |
| --- | --- |
| /assets | asset / AST |
| /attack-surfaces | surface / SURF |
| /backlog | backlog / BLG |
| /test-cases | test_case / TST |
| /findings | finding / FND |
| /evidence | evidence / EVD (metadata/document only) |
| /scope-pages | scope / SCP |
| /observations | observation / OBS |
| /templates | template / TPL |

Each resource provides GET/POST collection, GET/PATCH/DELETE /{pid}, POST /{pid}/restore. DELETE is soft deletion. Output is a shared Page including a discriminated typed `record` property; create/patch domain properties are top-level fields. PATCH requires revision and accepts title/content plus type-specific editable properties. UUIDs are immutable. Shared page detail/open/favorite/hierarchy/recovery endpoints remain usable. Observation provenance is creation-only; patch edits title/document.

Lists return items,total,offset,limit; specialized default limit is 20, maximum 200. Parameters: q (title search), offset, limit, sort, direction asc/desc, deleted, status/priority/severity/classification/surface_id where applicable; filters is a JSON object of at most ten allowlisted field/string pairs. Unsupported properties/sorts/filters return 422. No arbitrary SQL is accepted. All lookup and mutation paths enforce engagement scope.

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
