from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.records import RelationshipCreate, RelationshipOut, RelationshipBatch
from app.services.relationships import add_link, links, output_link, remove_link

router = APIRouter(prefix="/engagements/{eid}", tags=["relationships"])


@router.get("/records/{pid}/relationships", response_model=list[RelationshipOut])
def listing(eid: str, pid: str, db: Session = Depends(get_db)) -> list[RelationshipOut]:
    return links(db, eid, pid)


@router.get("/records/{pid}/backlinks", response_model=list[RelationshipOut])
def backlinks(eid: str, pid: str, db: Session = Depends(get_db)) -> list[RelationshipOut]:
    return [link for link in links(db, eid, pid) if link.direction == "incoming"]


@router.post("/relationships", response_model=RelationshipOut, status_code=201)
def create(eid: str, data: RelationshipCreate, db: Session = Depends(get_db)) -> RelationshipOut:
    entity = add_link(db, eid, str(data.source_id), str(data.target_id), data.relationship_type)
    db.commit()
    return output_link(db, entity, str(data.source_id))


@router.delete("/relationships/{rid}", status_code=204)
def remove(eid: str, rid: str, db: Session = Depends(get_db)) -> None:
    remove_link(db, eid, rid)
    db.commit()


@router.post("/relationships/batch", response_model=list[RelationshipOut], status_code=201)
def create_batch(eid: str, data: RelationshipBatch, db: Session = Depends(get_db)) -> list[RelationshipOut]:
    entities = [
        add_link(db, eid, str(data.source_id), str(link.target_id), link.relationship_type) for link in data.links
    ]
    db.commit()
    return [output_link(db, entity, str(data.source_id)) for entity in entities]
