from sqlalchemy.orm import Session
from app.models.entities import Page
from app.models.records import RecordRegistry


def register_page(db: Session, entity: Page, kind: str | None = None) -> RecordRegistry:
    row = RecordRegistry(page_id=entity.id, engagement_id=entity.engagement_id, kind=kind or entity.page_type)
    db.add(row)
    db.flush()
    return row
