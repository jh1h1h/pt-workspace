import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Page
from app.models.records import RECORD_MODELS, RecordRegistry, ScopeDocument
from app.repositories.workspace import engagement, output, page
from app.repositories.records import record_row
from app.schemas.contracts import PageList, PageOut
from app.schemas.record_properties import FIELD_SCHEMAS
from app.schemas.records import CREATE_SCHEMAS, PATCH_SCHEMAS, VerifyFinding
from app.services.records import create_record, patch_record, verify_finding
from app.services.document_templates import SCOPE_SECTIONS
from app.api.pages import remove as delete_page, restore as restore_page

PATHS = {
    "asset": "assets",
    "surface": "attack-surfaces",
    "backlog": "backlog",
    "test_case": "test-cases",
    "finding": "findings",
    "evidence": "evidence",
    "scope": "scope-pages",
    "observation": "observations",
    "template": "templates",
}
# Client filter names map only to explicitly allowed ORM columns.
FILTERS = {
    "asset": {"asset_type", "scope_state", "environment"},
    "surface": {"surface_type", "status", "http_method", "authentication_state"},
    "backlog": {"status", "priority", "category"},
    "test_case": {"execution_status", "assessment_outcome", "category"},
    "finding": {"validation_status", "severity", "vulnerability_category"},
    "evidence": {"sanitization_state", "evidence_type", "review_state", "source_tool"},
    "scope": {"section"},
    "observation": {"surface_id", "classification"},
    "template": {"record_type", "is_default"},
}
router = APIRouter(prefix="/engagements/{eid}", tags=["VAPT records"])


def build_routes(kind: str) -> None:
    model = RECORD_MODELS[kind]
    create_schema, patch_schema = CREATE_SCHEMAS[kind], PATCH_SCHEMAS[kind]
    prefix = "/" + PATHS[kind]

    def listing(
        eid: str,
        q: str = "",
        filters: str = Query("", max_length=3000),
        filter_field: str | None = None,
        filter_value: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        severity: str | None = None,
        classification: str | None = None,
        surface_id: str | None = None,
        sort: str = "created_at",
        direction: str = "asc",
        deleted: bool = False,
        offset: int = Query(0, ge=0),
        limit: int = Query(20, ge=1, le=200),
        db: Session = Depends(get_db),
    ) -> dict:
        engagement(db, eid)
        query = (
            select(Page)
            .join(RecordRegistry, RecordRegistry.page_id == Page.id)
            .join(model, model.page_id == Page.id)
            .where(
                RecordRegistry.engagement_id == eid,
                Page.engagement_id == eid,
                RecordRegistry.kind == kind,
                Page.deleted_at.is_not(None) if deleted else Page.deleted_at.is_(None),
            )
        )
        if q:
            query = query.where(Page.title.contains(q, autoescape=True))
        extra_filters = {}
        if filters:
            try:
                extra_filters = json.loads(filters)
            except ValueError:
                raise HTTPException(422, "Filters must be a JSON object")
            if (
                not isinstance(extra_filters, dict)
                or len(extra_filters) > 10
                or any(not isinstance(k, str) or not isinstance(v, str) for k, v in extra_filters.items())
            ):
                raise HTTPException(422, "Filters must contain at most ten string values")
        filters = {
            key: value
            for key, value in {
                "status": status,
                "priority": priority,
                "severity": severity,
                "classification": classification,
                "surface_id": surface_id,
            }.items()
            if value is not None
        }
        filters.update(extra_filters)
        if filter_field is not None:
            if filter_value is None:
                raise HTTPException(422, "filter_value is required")
            filters[filter_field] = filter_value
        for field, value in filters.items():
            if field not in FILTERS[kind]:
                raise HTTPException(422, "Unsupported column filter")
            column = getattr(model, field)
            query = query.where(column == (value.lower() == "true" if field == "is_default" else value))
        sortable = {
            "title": Page.title,
            "display_id": Page.display_id,
            "created_at": Page.created_at,
            "updated_at": Page.updated_at,
            **{
                field: getattr(model, field)
                for field in FIELD_SCHEMAS[kind].model_fields
                if hasattr(model, field) and field not in {"tags", "roles"}
            },
        }
        if sort not in sortable or direction not in {"asc", "desc"}:
            raise HTTPException(422, "Unsupported sort")
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        column = sortable[sort]
        items = db.scalars(
            query.order_by(column.desc() if direction == "desc" else column.asc(), Page.id).offset(offset).limit(limit)
        )
        return dict(items=[output(db, entity) for entity in items], total=total, offset=offset, limit=limit)

    def create(eid: str, data: create_schema, db: Session = Depends(get_db)) -> PageOut:
        entity = create_record(db, eid, kind, data.model_dump(mode="json"))
        db.commit()
        return output(db, entity)

    def retrieve(eid: str, pid: str, db: Session = Depends(get_db)) -> PageOut:
        entity = page(db, eid, pid)
        record_row(db, entity, kind)
        return output(db, entity)

    def patch(eid: str, pid: str, data: patch_schema, db: Session = Depends(get_db)) -> PageOut:
        entity = patch_record(db, page(db, eid, pid), kind, data.model_dump(mode="json", exclude_unset=True))
        db.commit()
        return output(db, entity)

    def remove(eid: str, pid: str, db: Session = Depends(get_db)) -> None:
        record_row(db, page(db, eid, pid), kind)
        delete_page(eid, pid, db)

    def restore(eid: str, pid: str, db: Session = Depends(get_db)) -> PageOut:
        record_row(db, page(db, eid, pid, True), kind)
        return restore_page(eid, pid, db)

    for suffix, handler, method, response in [
        ("", listing, "GET", PageList),
        ("", create, "POST", PageOut),
        ("/{pid}", retrieve, "GET", PageOut),
        ("/{pid}", patch, "PATCH", PageOut),
        ("/{pid}", remove, "DELETE", None),
        ("/{pid}/restore", restore, "POST", PageOut),
    ]:
        router.add_api_route(
            prefix + suffix,
            handler,
            methods=[method],
            response_model=response,
            status_code=201 if method == "POST" and not suffix else 204 if method == "DELETE" else 200,
            name=f"{kind}_{handler.__name__}",
        )


# Register specific actions first so they cannot be mistaken for record UUID routes.
@router.post("/findings/{pid}/verify", response_model=PageOut)
def verify(eid: str, pid: str, data: VerifyFinding, db: Session = Depends(get_db)) -> PageOut:
    entity = verify_finding(db, page(db, eid, pid), data.revision, data.verification_note)
    db.commit()
    return output(db, entity)


@router.post("/scope-pages/initialize", response_model=list[PageOut])
def initialize_scope(eid: str, db: Session = Depends(get_db)) -> list[PageOut]:
    engagement(db, eid)
    # Serialize idempotent initialization using the engagement row write lock.
    from sqlalchemy import update
    from app.models.entities import Engagement

    db.execute(update(Engagement).where(Engagement.id == eid).values(next_page=Engagement.next_page))
    existing = set(
        db.scalars(
            select(ScopeDocument.section).join(Page, Page.id == ScopeDocument.page_id).where(Page.engagement_id == eid)
        )
    )
    entities = []
    for section in SCOPE_SECTIONS:
        if section not in existing:
            data = CREATE_SCHEMAS["scope"](title=section, section=section)
            entities.append(create_record(db, eid, "scope", data.model_dump(mode="json")))
    db.commit()
    return [output(db, p) for p in entities]


for kind in PATHS:
    build_routes(kind)
