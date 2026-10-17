from datetime import datetime
from hashlib import sha256
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session
from app.models.entities import Engagement, Page, PersonalTask, now
from app.models.records import (
    CustomPropertyDefinition, CustomPropertyValue, ImportEntry, RECORD_MODELS, RecordSequence,
)
from app.repositories.records import delete_test_case_pages, record_row, test_case_pages
from app.repositories.workspace import engagement, page
from app.schemas.record_properties import FIELD_SCHEMAS
from app.services.registry import register_page
from app.services.workspace import check_parent, patch_page
from app.services.relationships import add_link
from app.services.document_templates import builtin_template, resolve_template, clear_previous_default

PREFIXES = {
    "asset": "AST",
    "surface": "SURF",
    "backlog": "BLG",
    "test_case": "TST",
    "finding": "FND",
    "evidence": "EVD",
    "scope": "SCP",
    "observation": "OBS",
    "template": "TPL",
}
TRANSITIONS = {
    "Candidate": {"Validating", "Inconclusive", "Dismissed"},
    "Validating": {"Candidate", "Inconclusive", "Dismissed"},
    "Confirmed": {"Report Ready", "Validating", "Dismissed"},
    "Inconclusive": {"Candidate", "Validating", "Dismissed"},
    "Dismissed": {"Candidate", "Validating"},
    "Report Ready": {"Confirmed", "Validating", "Dismissed"},
}
PAGE_FIELDS = {"title", "content", "icon", "parent_id", "favorite"}


def test_case_purge_preview(db: Session, eid: str) -> dict[str, Any]:
    engagement(db, eid)
    entities = test_case_pages(db, eid)
    ids = {entity.id for entity in entities}
    if ids:
        dependencies = (
            (select(Page.id).where(Page.parent_id.in_(ids), Page.id.not_in(ids)), "child pages"),
            (select(PersonalTask.page_id).where(PersonalTask.related_page_id.in_(ids)), "Personal Task references"),
            (select(ImportEntry.id).where(ImportEntry.record_id.in_(ids)), "append-only import provenance"),
        )
        for query, label in dependencies:
            if db.scalar(query.limit(1)) is not None:
                if label == "append-only import provenance":
                    raise HTTPException(409, "Purge blocked by append-only import provenance; these cases cannot be purged by this tool")
                raise HTTPException(409, f"Purge blocked by {label}; preserve or detach these references first")
        definitions = list(db.scalars(select(CustomPropertyDefinition).where(
            CustomPropertyDefinition.engagement_id == eid, CustomPropertyDefinition.data_type == "relation"
        )))
        for definition in definitions:
            defaults = definition.default_value if isinstance(definition.default_value, list) else [definition.default_value]
            if any(isinstance(target, str) and target in ids for target in defaults):
                raise HTTPException(409, "Purge blocked by a relation property's default value")
        if definitions:
            values = db.scalars(select(CustomPropertyValue).where(
                CustomPropertyValue.engagement_id == eid,
                CustomPropertyValue.property_id.in_([definition.id for definition in definitions]),
                CustomPropertyValue.record_id.not_in(ids),
            ))
            if any(isinstance(value.value, list) and ids.intersection(value.value) for value in values):
                raise HTTPException(409, "Purge blocked by another record's custom relation value")
    state = "\n".join([eid, *[
        f"{entity.id}:{entity.revision}:{entity.deleted_at}" for entity in entities
    ]])
    return {"count": len(entities), "confirmation": sha256(state.encode("utf-8")).hexdigest()}


def replace_test_cases(
    db: Session, eid: str, confirmation: str, cases: list[dict[str, Any]]
) -> tuple[int, list[Page]]:
    db.execute(update(Engagement).where(Engagement.id == eid).values(next_page=Engagement.next_page))
    preview = test_case_purge_preview(db, eid)
    if confirmation != preview["confirmation"]:
        raise HTTPException(409, "Test Cases changed since preview; preview again before purging")
    ids = [entity.id for entity in test_case_pages(db, eid)]
    delete_test_case_pages(db, eid, ids)
    created = [create_record(db, eid, "test_case", values) for values in cases]
    db.flush()
    return len(ids), created


def normalized_route(value: str) -> str:
    # Normalize only safe syntactic equivalence; do not decode/collapse distinct contexts.
    try:
        parts = urlsplit(value.strip())
    except ValueError as error:
        raise HTTPException(422, "Invalid URL or route syntax") from error
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path or ("/" if parts.netloc else ""), parts.query, "")
    )


def validate_state(kind: str, values: dict[str, Any], row: object | None = None) -> None:
    if kind == "asset" and values["scope_state"] == "In Scope" and not values["authorization_confirmed"]:
        raise HTTPException(
            422, "In Scope requires explicit authorization confirmation. Discovery is not authorization."
        )
    if kind == "backlog" and values["status"] == "Blocked" and not (values.get("blocker_reason") or "").strip():
        raise HTTPException(422, "Blocked backlog items require a blocker reason")
    if kind == "finding":
        status = values["validation_status"]
        if row is None and status in {"Confirmed", "Report Ready"}:
            raise HTTPException(422, "Create a candidate, then explicitly verify it before confirming or reporting")
        if row is not None and status != row.validation_status:
            if status not in TRANSITIONS[row.validation_status]:
                raise HTTPException(422, "Invalid finding transition; use the explicit verification action to confirm")
            if status in {"Confirmed", "Report Ready"} and not row.verified_at:
                raise HTTPException(422, "Finding has not been explicitly verified")


def create_record(db: Session, eid: str, kind: str, values: dict[str, Any]) -> Page:
    engagement(db, eid)
    values = dict(values)
    links = values.pop("links", [])
    custom_values = values.pop("custom_values", {})
    template_id = values.pop("template_id", None)
    content = values.pop("content", None)
    title, icon, parent_id = values.pop("title"), values.pop("icon", None), values.pop("parent_id", None)
    check_parent(db, eid, None, parent_id)
    validate_state(kind, values)
    if kind == "observation":
        record_row(db, page(db, eid, values["surface_id"]), "surface")
        if values.get("evidence_id"):
            record_row(db, page(db, eid, values["evidence_id"]), "evidence")
        values["observed_at"] = datetime.fromisoformat(values["observed_at"]) if values.get("observed_at") else now()
    if kind == "surface":
        values["normalized_route"] = normalized_route(values["url_route"])
    db.execute(insert(RecordSequence).values(engagement_id=eid, kind=kind, next_value=1).on_conflict_do_nothing())
    sequence = (
        db.execute(
            update(RecordSequence)
            .where(RecordSequence.engagement_id == eid, RecordSequence.kind == kind)
            .values(next_value=RecordSequence.next_value + 1)
            .returning(RecordSequence.next_value)
        ).scalar_one()
        - 1
    )
    entity = Page(
        engagement_id=eid,
        display_id=f"{PREFIXES[kind]}-{sequence:04d}",
        title=title,
        icon=icon,
        parent_id=parent_id,
        page_type="note",
        content=content if content is not None else resolve_template(db, eid, kind, template_id),
    )
    db.add(entity)
    db.flush()
    register_page(db, entity, kind)
    if kind == "template":
        values["engagement_id"] = eid
        if content is None:
            entity.content = builtin_template(values["record_type"])
        if values["is_default"]:
            clear_previous_default(db, eid, values["record_type"], entity.id)
    row = RECORD_MODELS[kind](page_id=entity.id, **values)
    db.add(row)
    db.flush()
    if kind in {"asset", "surface", "backlog", "test_case", "finding", "evidence"}:
        from sqlalchemy import select
        from app.models.records import CustomPropertyDefinition
        from app.services.phase3 import set_property_value

        definitions = list(db.scalars(select(CustomPropertyDefinition).where(CustomPropertyDefinition.engagement_id == eid, CustomPropertyDefinition.record_type == kind, CustomPropertyDefinition.deleted_at.is_(None))))
        known = {definition.id: definition for definition in definitions}
        if set(custom_values) - set(known):
            raise HTTPException(422, "A custom property is invalid for this record type")
        for definition in definitions:
            supplied = custom_values.get(definition.id, definition.default_value)
            if supplied is None and definition.required:
                raise HTTPException(422, f"{definition.name} is required")
            if supplied is not None:
                set_property_value(db, eid, entity.id, definition, supplied)
    for link in links:
        add_link(db, eid, entity.id, link["target_id"], link["relationship_type"])
    if kind == "observation":
        add_link(db, eid, entity.id, values["surface_id"], "observed_on")
        if values.get("evidence_id"):
            add_link(db, eid, entity.id, values["evidence_id"], "supports")
    from app.services.phase3 import index_page, reconcile_document_links

    reconcile_document_links(db, entity)
    index_page(db, entity)
    return entity


def patch_record(db: Session, entity: Page, kind: str, values: dict[str, Any]) -> Page:
    row = record_row(db, entity, kind)
    changes = dict(values)
    page_values = {key: changes.pop(key) for key in list(changes) if key in PAGE_FIELDS | {"revision"}}
    if changes:
        merged = {key: getattr(row, key) for key in FIELD_SCHEMAS[kind].model_fields}
        merged.update(changes)
        try:
            validated = FIELD_SCHEMAS[kind].model_validate(merged).model_dump(mode="json")
        except ValueError as error:
            raise HTTPException(422, "Invalid structured properties: " + str(error)) from error
        validate_state(kind, validated, row)
        if kind == "template" and validated["record_type"] != row.record_type:
            raise HTTPException(422, "A template record type is immutable; create another template")
        if kind == "template" and validated["is_default"]:
            # Obtain SQLite's write lock before changing multiple defaults.
            db.execute(
                update(RecordSequence)
                .where(RecordSequence.engagement_id == entity.engagement_id, RecordSequence.kind == "template")
                .values(next_value=RecordSequence.next_value)
            )
            clear_previous_default(db, entity.engagement_id, row.record_type, entity.id)
        if kind == "finding" and validated["validation_status"] not in {"Confirmed", "Report Ready"}:
            changes["verified_at"] = None
            changes["verification_note"] = ""
        if kind == "surface" and "url_route" in changes:
            changes["normalized_route"] = normalized_route(validated["url_route"])
    # Force a revision increment for structured-field changes; page documents still use CAS.
    revision = page_values["revision"]
    if changes and all(getattr(row, key) == value for key, value in changes.items()):
        changes = {}
    if changes:
        page_values["title"] = page_values.get("title", entity.title)
        patch_page(db, entity, page_values)
        if entity.revision == revision:
            result = db.execute(
                update(Page)
                .where(Page.id == entity.id, Page.revision == revision)
                .values(revision=revision + 1, updated_at=now())
            )
            if result.rowcount != 1:
                raise HTTPException(409, "Revision conflict")
            db.refresh(entity)
        for key, value in changes.items():
            setattr(row, key, value)
        db.flush()
    else:
        patch_page(db, entity, page_values)
    return entity


def verify_finding(db: Session, entity: Page, revision: int, note: str) -> Page:
    row = record_row(db, entity, "finding")
    if row.validation_status != "Validating":
        raise HTTPException(422, "Move a candidate to Validating before explicit verification")
    if entity.revision != revision:
        raise HTTPException(409, "Revision conflict")
    result = db.execute(
        update(Page)
        .where(Page.id == entity.id, Page.revision == revision)
        .values(revision=revision + 1, updated_at=now())
    )
    if result.rowcount != 1:
        raise HTTPException(409, "Revision conflict")
    row.validation_status = "Confirmed"
    row.verified_at = now()
    row.verification_note = note
    db.flush()
    db.refresh(entity)
    return entity
