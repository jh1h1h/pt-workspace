from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.registry import register_page
from app.models.entities import Engagement, Page, now
from app.repositories.workspace import engagement
from app.schemas.contracts import EngagementInput, EngagementList, EngagementOut

router = APIRouter(prefix="/engagements", tags=["engagements"])


@router.get("", response_model=EngagementList)
def listing(
    deleted: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    query = select(Engagement).where(Engagement.deleted_at.is_not(None) if deleted else Engagement.deleted_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    return dict(
        items=db.scalars(query.order_by(Engagement.created_at).offset(offset).limit(limit)).all(),
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=EngagementOut, status_code=201)
def create(data: EngagementInput, db: Session = Depends(get_db)) -> Engagement:
    entity = Engagement(**data.model_dump())
    db.add(entity)
    db.flush()
    scratch = Page(engagement_id=entity.id, display_id="SCRATCHPAD", title="Scratchpad", page_type="scratchpad")
    db.add(scratch)
    db.flush()
    register_page(db, scratch)
    db.commit()
    return entity


@router.get("/{eid}", response_model=EngagementOut)
def retrieve(eid: str, db: Session = Depends(get_db)) -> Engagement:
    return engagement(db, eid)


@router.patch("/{eid}", response_model=EngagementOut)
def rename(eid: str, data: EngagementInput, db: Session = Depends(get_db)) -> Engagement:
    entity = engagement(db, eid)
    entity.name = data.name
    db.commit()
    return entity


@router.delete("/{eid}", status_code=204)
def remove(eid: str, db: Session = Depends(get_db)) -> None:
    engagement(db, eid).deleted_at = now()
    db.commit()


@router.post("/{eid}/restore", response_model=EngagementOut)
def restore(eid: str, db: Session = Depends(get_db)) -> Engagement:
    entity = engagement(db, eid, True)
    entity.deleted_at = None
    db.commit()
    return entity
