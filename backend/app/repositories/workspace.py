from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import Engagement, Page, PersonalTask
from app.schemas.contracts import PageOut, TaskOut


def engagement(db: Session, eid: str, deleted: bool = False) -> Engagement:
    entity = db.get(Engagement, eid)
    if not entity or (entity.deleted_at and not deleted):
        raise HTTPException(404, "Engagement not found")
    return entity


def page(db: Session, eid: str, pid: str, deleted: bool = False) -> Page:
    engagement(db, eid)
    entity = db.scalar(select(Page).where(Page.id == pid, Page.engagement_id == eid))
    if not entity or (entity.deleted_at and not deleted):
        raise HTTPException(404, "Page not found")
    return entity


def output(db: Session, entity: Page) -> PageOut:
    result = PageOut.model_validate(entity)
    task = db.get(PersonalTask, entity.id)
    if task:
        result.task = TaskOut.model_validate(task)
    from app.repositories.records import projection

    result.record = projection(db, entity)
    if result.record:
        result.page_type = result.record.kind
    return result
