from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.models.entities import PersonalTask, now
from app.models.records import RecordRegistry, RecordRelationship
from app.repositories.workspace import engagement, page
from app.schemas.records import RelationshipOut, RecordRef


def add_link(
    db: Session, eid: str, source_id: str, target_id: str, relationship_type: str = "related_to", origin: str = "manual"
) -> RecordRelationship:
    page(db, eid, source_id)
    page(db, eid, target_id)
    if source_id == target_id:
        raise HTTPException(422, "A record cannot link to itself")
    pair_key = "|".join(sorted([source_id, target_id]))
    if db.scalar(
        select(RecordRelationship).where(
            RecordRelationship.engagement_id == eid,
            RecordRelationship.pair_key == pair_key,
            RecordRelationship.relationship_type == relationship_type,
        )
    ):
        raise HTTPException(409, "Relationship already exists on both records")
    entity = RecordRelationship(
        engagement_id=eid,
        source_id=source_id,
        target_id=target_id,
        pair_key=pair_key,
        relationship_type=relationship_type,
        origin=origin,
    )
    db.add(entity)
    db.flush()
    return entity


def reference(db: Session, eid: str, pid: str) -> RecordRef:
    entity = page(db, eid, pid, True)
    registry = db.get(RecordRegistry, pid)
    return RecordRef(
        id=entity.id,
        display_id=entity.display_id,
        title=entity.title,
        kind=registry.kind,
        deleted=entity.deleted_at is not None,
    )


def output_link(db: Session, entity: RecordRelationship, pid: str) -> RelationshipOut:
    return RelationshipOut(
        id=entity.id,
        source=reference(db, entity.engagement_id, entity.source_id),
        target=reference(db, entity.engagement_id, entity.target_id),
        relationship_type=entity.relationship_type,
        direction="outgoing" if entity.source_id == pid else "incoming",
        created_at=entity.created_at.isoformat(),
    )


def links(db: Session, eid: str, pid: str) -> list[RelationshipOut]:
    page(db, eid, pid, True)
    entities = db.scalars(
        select(RecordRelationship)
        .where(
            RecordRelationship.engagement_id == eid,
            or_(RecordRelationship.source_id == pid, RecordRelationship.target_id == pid),
        )
        .order_by(RecordRelationship.created_at, RecordRelationship.id)
    )
    return [output_link(db, entity, pid) for entity in entities]


def remove_link(db: Session, eid: str, rid: str) -> None:
    engagement(db, eid)
    entity = db.scalar(
        select(RecordRelationship).where(RecordRelationship.id == rid, RecordRelationship.engagement_id == eid)
    )
    if not entity:
        raise HTTPException(404, "Relationship not found")
    if entity.origin == "personal_task":
        task = db.get(PersonalTask, entity.source_id)
        if task and task.related_page_id == entity.target_id:
            task.related_page_id = None
            owner = page(db, eid, entity.source_id, True)
            owner.revision += 1
            owner.updated_at = now()
    db.delete(entity)


def sync_personal_link(db: Session, entity: object, target_id: str | None) -> None:
    old = db.scalars(
        select(RecordRelationship).where(
            RecordRelationship.engagement_id == entity.engagement_id,
            RecordRelationship.source_id == entity.id,
            RecordRelationship.origin == "personal_task",
        )
    ).all()
    for link in old:
        if link.target_id != target_id:
            db.delete(link)
    db.flush()
    if target_id:
        pair = "|".join(sorted([entity.id, target_id]))
        existing = db.scalar(
            select(RecordRelationship).where(
                RecordRelationship.engagement_id == entity.engagement_id,
                RecordRelationship.pair_key == pair,
                RecordRelationship.relationship_type == "related_to",
            )
        )
        if existing:
            existing.origin = "personal_task"
        else:
            add_link(db, entity.engagement_id, entity.id, target_id, "related_to", "personal_task")
