from typing import Any
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.models.entities import Engagement, Page, PersonalTask, now
from app.repositories.workspace import page
from app.schemas.contracts import EMPTY_DOC

TASK_FIELDS = {"status", "priority", "due_date", "position", "related_page_id", "parent_task_id"}


def check_parent(db: Session, eid: str, pid: str | None, parent: str | None) -> None:
    seen = {pid} if pid else set()
    while parent:
        if parent in seen:
            raise HTTPException(422, "Circular page hierarchy")
        seen.add(parent)
        ancestor = page(db, eid, parent)
        if ancestor.page_type == "scratchpad":
            raise HTTPException(422, "Scratchpad cannot be a parent")
        parent = ancestor.parent_id


def create_page(
    db: Session,
    engagement: Engagement,
    values: dict[str, Any],
    task: bool = False,
    registry_kind: str | None = None,
) -> Page:
    # Reserve the sequence under the same transaction as insertion.
    field = "next_task" if task else "next_page"
    sequence = (
        db.execute(
            update(Engagement)
            .where(Engagement.id == engagement.id)
            .values({field: getattr(Engagement, field) + 1})
            .returning(getattr(Engagement, field))
        ).scalar_one()
        - 1
    )
    entity = Page(
        engagement_id=engagement.id,
        display_id=f"{'TASK' if task else 'PAGE'}-{sequence:04d}",
        content=EMPTY_DOC.copy(),
        **values,
    )
    db.add(entity)
    db.flush()
    from app.services.registry import register_page

    register_page(db, entity, registry_kind)
    return entity


def patch_page(db: Session, entity: Page, values: dict[str, Any]) -> Page:
    revision = values.pop("revision")
    if entity.revision != revision:
        raise HTTPException(
            409, "Revision conflict. Your unsaved content has been retained; review the newer document before retrying."
        )
    if "parent_id" in values:
        check_parent(db, entity.engagement_id, entity.id, values["parent_id"])
    for relation in ["related_page_id", "parent_task_id"]:
        if values.get(relation):
            target = page(db, entity.engagement_id, values[relation])
            if relation == "parent_task_id":
                if target.page_type != "task":
                    raise HTTPException(422, "Subtask parent must be a personal task")
                cursor = target.id
                seen = {entity.id}
                while cursor:
                    if cursor in seen:
                        raise HTTPException(422, "Circular subtask hierarchy")
                    seen.add(cursor)
                    cursor = db.get(PersonalTask, cursor).parent_task_id
    task_values = {key: values.pop(key) for key in list(values) if key in TASK_FIELDS}
    if any(values.get(key) is None for key in ["title", "content", "favorite"] if key in values):
        raise HTTPException(422, "Title, content and favorite cannot be null")
    if any(task_values.get(key) is None for key in ["status", "priority", "position"] if key in task_values):
        raise HTTPException(422, "Task state cannot be null")
    if all(getattr(entity, key) == value for key, value in values.items()) and not task_values:
        return entity
    result = db.execute(
        update(Page)
        .where(Page.id == entity.id, Page.revision == revision)
        .values(**values, revision=revision + 1, updated_at=now())
    )
    if result.rowcount != 1:
        raise HTTPException(409, "Revision conflict")
    if task_values:
        db.execute(update(PersonalTask).where(PersonalTask.page_id == entity.id).values(**task_values))
    db.flush()
    db.refresh(entity)
    if "related_page_id" in task_values:
        from app.services.relationships import sync_personal_link

        sync_personal_link(db, entity, task_values["related_page_id"])
    if "content" in values or "title" in values:
        from app.services.phase3 import index_page, reconcile_document_links

        reconcile_document_links(db, entity)
        index_page(db, entity)
    return entity
