from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Page, PersonalTask
from app.repositories.workspace import engagement, output, page
from app.schemas.contracts import PageList, PageOut, Reorder, TaskCreate, TaskPatch
from app.services.workspace import create_page, patch_page

router = APIRouter(prefix="/engagements/{eid}/tasks", tags=["personal tasks"])


def task_page(db: Session, eid: str, pid: str) -> Page:
    entity = page(db, eid, pid)
    if entity.page_type != "task":
        raise HTTPException(404, "Personal task not found")
    return entity


@router.get("", response_model=PageList)
def listing(
    eid: str,
    status: Literal["Open", "In Progress", "Done"] | None = None,
    priority: Literal["P1", "P2", "P3"] | None = None,
    due_before: date | None = None,
    q: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    engagement(db, eid)
    query = (
        select(Page)
        .join(PersonalTask, PersonalTask.page_id == Page.id)
        .where(Page.engagement_id == eid, Page.deleted_at.is_(None))
    )
    if status:
        query = query.where(PersonalTask.status == status)
    if priority:
        query = query.where(PersonalTask.priority == priority)
    if due_before:
        query = query.where(PersonalTask.due_date <= due_before.isoformat())
    if q:
        query = query.where(Page.title.contains(q, autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(PersonalTask.priority, PersonalTask.position, Page.created_at).offset(offset).limit(limit)
    )
    return dict(items=[output(db, p) for p in items], total=total, offset=offset, limit=limit)


@router.post("", response_model=PageOut, status_code=201)
def create(eid: str, data: TaskCreate, db: Session = Depends(get_db)) -> PageOut:
    eng = engagement(db, eid)
    values = data.model_dump(mode="json")
    title = values.pop("title")
    for relation in ["related_page_id", "parent_task_id"]:
        if values[relation]:
            target = page(db, eid, values[relation])
            if relation == "parent_task_id" and target.page_type != "task":
                raise HTTPException(422, "Parent must be a personal task")
    entity = create_page(db, eng, dict(title=title, page_type="task"), True)
    position = (
        db.scalar(
            select(func.coalesce(func.max(PersonalTask.position), -1))
            .join(Page, PersonalTask.page_id == Page.id)
            .where(Page.engagement_id == eid)
        )
        + 1
    )
    db.add(PersonalTask(page_id=entity.id, position=position, **values))
    db.flush()
    if values.get("related_page_id"):
        from app.services.relationships import sync_personal_link

        sync_personal_link(db, entity, values["related_page_id"])
    db.commit()
    return output(db, entity)


@router.post("/reorder", response_model=list[PageOut])
def reorder(eid: str, data: Reorder, db: Session = Depends(get_db)) -> list[PageOut]:
    if len({item.id for item in data.items}) != len(data.items):
        raise HTTPException(422, "Duplicate task IDs")
    entities = [task_page(db, eid, item.id) for item in data.items]
    for index, (item, entity) in enumerate(zip(data.items, entities)):
        patch_page(db, entity, dict(revision=item.revision, position=index))
    db.commit()
    return [output(db, p) for p in entities]


@router.get("/{pid}", response_model=PageOut)
def retrieve(eid: str, pid: str, db: Session = Depends(get_db)) -> PageOut:
    return output(db, task_page(db, eid, pid))


@router.patch("/{pid}", response_model=PageOut)
def patch(eid: str, pid: str, data: TaskPatch, db: Session = Depends(get_db)) -> PageOut:
    entity = patch_page(db, task_page(db, eid, pid), data.model_dump(exclude_unset=True, mode="json"))
    db.commit()
    return output(db, entity)
