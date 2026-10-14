from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.models.entities import Page
from app.models.records import AttackSurface, RECORD_MODELS, RecordRegistry, RecordRelationship
from app.schemas.record_properties import PROPERTY_SCHEMAS, RecordProperties


def record_row(db: Session, entity: Page, kind: str | None = None) -> object:
    registry = db.get(RecordRegistry, entity.id)
    if not registry or (kind and registry.kind != kind) or registry.kind not in RECORD_MODELS:
        raise HTTPException(404, "Record not found")
    row = db.get(RECORD_MODELS[registry.kind], entity.id)
    if row is None:
        raise HTTPException(404, "Record properties not found")
    return row


def linked_assets(db: Session, eid: str, pid: str) -> set[str]:
    relations = db.scalars(
        select(RecordRelationship).where(
            RecordRelationship.engagement_id == eid,
            or_(RecordRelationship.source_id == pid, RecordRelationship.target_id == pid),
        )
    ).all()
    ids = {r.target_id if r.source_id == pid else r.source_id for r in relations}
    if not ids:
        return set()
    return set(
        db.scalars(
            select(RecordRegistry.page_id).where(
                RecordRegistry.engagement_id == eid, RecordRegistry.page_id.in_(ids), RecordRegistry.kind == "asset"
            )
        )
    )


def duplicates(db: Session, entity: Page, row: AttackSurface) -> list[str]:
    if not row.normalized_route:
        return []
    candidates = db.scalars(
        select(Page)
        .join(AttackSurface, AttackSurface.page_id == Page.id)
        .where(
            Page.engagement_id == entity.engagement_id,
            Page.deleted_at.is_(None),
            Page.id != entity.id,
            AttackSurface.normalized_route == row.normalized_route,
            AttackSurface.http_method == row.http_method,
            AttackSurface.authentication_state == row.authentication_state,
            AttackSurface.surface_type == row.surface_type,
            AttackSurface.parameter_name == row.parameter_name,
            AttackSurface.parameter_location == row.parameter_location,
        )
    ).all()
    assets = linked_assets(db, entity.engagement_id, entity.id)
    return [
        p.id
        for p in candidates
        if sorted(db.get(AttackSurface, p.id).roles) == sorted(row.roles)
        and linked_assets(db, entity.engagement_id, p.id) == assets
    ]


def projection(db: Session, entity: Page) -> RecordProperties | None:
    registry = db.get(RecordRegistry, entity.id)
    if not registry or registry.kind not in RECORD_MODELS:
        return None
    row = record_row(db, entity)
    properties = PROPERTY_SCHEMAS[registry.kind].model_validate(row)
    if registry.kind == "surface":
        properties.duplicate_ids = duplicates(db, entity, row)
    return properties
