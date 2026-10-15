from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, delete
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Page, RecentPage, now
from app.models.records import RecordRegistry
from app.repositories.workspace import engagement, output, page
from app.schemas.contracts import PageCreate, PageList, PageOut, PagePatch
from app.services.workspace import check_parent, create_page, patch_page

MAX_RECENT = 8

router = APIRouter(prefix="/engagements/{eid}", tags=["pages"])


@router.get("/pages", response_model=PageList)
def listing(
    eid: str,
    q: str = "",
    deleted: bool = False,
    favorite: bool | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    engagement(db, eid)
    query = select(Page).join(RecordRegistry, RecordRegistry.page_id == Page.id).where(
        Page.engagement_id == eid,
        RecordRegistry.kind.not_in(("scratchpad", "note", "journal")),
        Page.deleted_at.is_not(None) if deleted else Page.deleted_at.is_(None),
    )
    if q:
        query = query.where(Page.title.contains(q, autoescape=True))
    if favorite is not None:
        query = query.where(Page.favorite == favorite)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    return dict(
        items=[output(db, p) for p in db.scalars(query.order_by(Page.created_at).offset(offset).limit(limit))],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/pages", response_model=PageOut, status_code=201)
def create(eid: str, data: PageCreate, db: Session = Depends(get_db)) -> PageOut:
    eng = engagement(db, eid)
    check_parent(db, eid, None, data.parent_id)
    values = data.model_dump(mode="json")
    content = values.pop("content")
    registry_kind = values["page_type"]
    if registry_kind == "page":
        values["page_type"] = "note"
    if values["page_type"] == "journal" and not values["journal_date"]:
        raise HTTPException(422, "Journal pages require a date")
    entity = create_page(db, eng, values, registry_kind=registry_kind)
    entity.content = content
    from app.services.phase3 import index_page, reconcile_document_links

    reconcile_document_links(db, entity)
    index_page(db, entity)
    db.commit()
    return output(db, entity)


@router.get("/scratchpad", response_model=PageOut)
def scratchpad(eid: str, db: Session = Depends(get_db)) -> PageOut:
    eng = engagement(db, eid)
    entity = db.scalar(select(Page).where(Page.engagement_id == eid, Page.page_type == "scratchpad"))
    if not entity:
        # SQLite write transaction serializes lazy creation. Unique display ID prevents duplicates.
        entity = Page(engagement_id=eng.id, display_id="SCRATCHPAD", title="Scratchpad", page_type="scratchpad")
        db.add(entity)
        db.flush()
        from app.services.registry import register_page

        register_page(db, entity)
        db.commit()
    return output(db, entity)


@router.get("/recent", response_model=list[PageOut])
def recent(eid: str, db: Session = Depends(get_db)) -> list[PageOut]:
    engagement(db, eid)
    items = db.scalars(
        select(Page)
        .join(RecentPage, Page.id == RecentPage.page_id)
        .join(RecordRegistry, RecordRegistry.page_id == Page.id)
        .where(
            RecentPage.engagement_id == eid,
            Page.engagement_id == eid,
            RecordRegistry.kind.not_in(("note", "journal")),
            Page.deleted_at.is_(None),
        )
        .order_by(RecentPage.opened_at.desc())
        .limit(MAX_RECENT)
    )
    return [output(db, p) for p in items]


@router.get("/pages/{pid}", response_model=PageOut)
def retrieve(eid: str, pid: str, db: Session = Depends(get_db)) -> PageOut:
    return output(db, page(db, eid, pid))


@router.patch("/pages/{pid}", response_model=PageOut)
def patch(eid: str, pid: str, data: PagePatch, db: Session = Depends(get_db)) -> PageOut:
    entity = patch_page(db, page(db, eid, pid), data.model_dump(exclude_unset=True, mode="json"))
    db.commit()
    return output(db, entity)


@router.post("/pages/{pid}/open", status_code=204)
def opened(eid: str, pid: str, db: Session = Depends(get_db)) -> None:
    entity = page(db, eid, pid)
    if entity.page_type == "scratchpad":
        return
    recent = db.get(RecentPage, (eid, pid))
    if recent:
        recent.opened_at = now()
    else:
        db.add(RecentPage(engagement_id=eid, page_id=pid))
    db.flush()
    excess = db.scalars(
        select(RecentPage.page_id)
        .where(RecentPage.engagement_id == eid)
        .order_by(RecentPage.opened_at.desc())
        .offset(MAX_RECENT)
    ).all()
    if excess:
        db.execute(delete(RecentPage).where(RecentPage.engagement_id == eid, RecentPage.page_id.in_(excess)))
    db.commit()


@router.delete("/pages/{pid}", status_code=204)
def remove(eid: str, pid: str, db: Session = Depends(get_db)) -> None:
    entity = page(db, eid, pid)
    if entity.page_type == "scratchpad":
        raise HTTPException(422, "Scratchpad cannot be deleted")
    # Child pages are promoted, never silently removed.
    for child in db.scalars(select(Page).where(Page.parent_id == pid, Page.engagement_id == eid)):
        child.parent_id = entity.parent_id
        child.revision += 1
        child.updated_at = now()
    entity.deleted_at = now()
    entity.revision += 1
    entity.updated_at = now()
    from app.services.phase3 import index_page

    index_page(db, entity)
    db.commit()


@router.post("/pages/{pid}/restore", response_model=PageOut)
def restore(eid: str, pid: str, db: Session = Depends(get_db)) -> PageOut:
    entity = page(db, eid, pid, True)
    if entity.parent_id:
        parent = db.get(Page, entity.parent_id)
        if parent.deleted_at:
            entity.parent_id = None
    if entity.deleted_at:
        entity.deleted_at = None
        entity.revision += 1
        entity.updated_at = now()
    from app.services.phase3 import index_page

    index_page(db, entity)
    db.commit()
    return output(db, entity)
