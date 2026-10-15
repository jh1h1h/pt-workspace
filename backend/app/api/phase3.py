import csv
import hashlib
import io
import os
import re
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response, StreamingResponse
from sqlalchemy import exists, func, select, text
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Page, PersonalTask, now
from app.models.records import (
    AttackSurface,
    CustomPropertyDefinition,
    CustomPropertyValue,
    DocumentLink,
    Evidence,
    EvidenceFile,
    ImportEntry,
    ImportJob,
    RecordRegistry,
    ReusableTemplate,
    SavedView,
    WorkflowAssignment,
    WorkflowOption,
    RECORD_MODELS,
)
from app.repositories.workspace import engagement, output, page
from app.schemas.contracts import PageOut
from app.schemas.records import CREATE_SCHEMAS
from app.schemas.phase3 import (
    BulkUpdate,
    EvidenceMetadata,
    ImportConfirm,
    PropertyCreate,
    PropertyPatch,
    PropertyValueInput,
    QuickCapture,
    SearchResult,
    ViewCreate,
    ViewPatch,
    WorkflowApply,
    WorkflowCreate,
    ReusableTemplateCreate,
    ReusableTemplatePatch,
    TemplateInstantiate,
)
from app.services.phase3 import (
    index_page,
    parse_import,
    rebuild_engagement_index,
    reconcile_document_links,
    set_property_value,
    validate_property_value,
)
from app.services.records import create_record, normalized_route, patch_record
from app.services.relationships import add_link
from app.services.workspace import create_page, patch_page

router = APIRouter(prefix="/engagements/{eid}", tags=["Phase 3"])
RECORD_TYPES = {"asset", "surface", "backlog", "test_case", "finding", "evidence"}
MAX_UPLOAD = 25 * 1024 * 1024


def as_dict(entity: object) -> dict:
    return {column.name: getattr(entity, column.name) for column in entity.__table__.columns}


def definition(db: Session, eid: str, property_id: str, deleted: bool = False) -> CustomPropertyDefinition:
    entity = db.scalar(
        select(CustomPropertyDefinition).where(
            CustomPropertyDefinition.id == property_id, CustomPropertyDefinition.engagement_id == eid
        )
    )
    if not entity or (entity.deleted_at and not deleted):
        raise HTTPException(404, "Custom property not found")
    return entity


@router.get("/custom-properties")
def property_list(eid: str, record_type: str | None = None, deleted: bool = False, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    query = select(CustomPropertyDefinition).where(
        CustomPropertyDefinition.engagement_id == eid,
        CustomPropertyDefinition.deleted_at.is_not(None) if deleted else CustomPropertyDefinition.deleted_at.is_(None),
    )
    if record_type:
        query = query.where(CustomPropertyDefinition.record_type == record_type)
    return [as_dict(p) for p in db.scalars(query.order_by(CustomPropertyDefinition.display_order, CustomPropertyDefinition.created_at))]


@router.post("/custom-properties", status_code=201)
def property_create(eid: str, data: PropertyCreate, db: Session = Depends(get_db)) -> dict:
    engagement(db, eid)
    entity = CustomPropertyDefinition(engagement_id=eid, **data.model_dump())
    validate_property_value(db, entity, entity.default_value, eid)
    db.add(entity)
    db.commit()
    return as_dict(entity)


@router.patch("/custom-properties/{property_id}")
def property_patch(eid: str, property_id: str, data: PropertyPatch, db: Session = Depends(get_db)) -> dict:
    entity = definition(db, eid, property_id)
    changes = data.model_dump(exclude_unset=True)
    confirmed = changes.pop("conversion_confirmed", False)
    new_type = changes.get("data_type", entity.data_type)
    new_options = changes.get("allowed_values", entity.allowed_values)
    probe = CustomPropertyDefinition(
        engagement_id=eid,
        record_type=entity.record_type,
        name=changes.get("name", entity.name),
        data_type=new_type,
        allowed_values=new_options,
        default_value=changes.get("default_value", entity.default_value),
        required=changes.get("required", entity.required),
    )
    incompatible: list[CustomPropertyValue] = []
    for value in db.scalars(select(CustomPropertyValue).where(CustomPropertyValue.property_id == entity.id)):
        try:
            validate_property_value(db, probe, value.value, eid)
        except HTTPException:
            incompatible.append(value)
    if incompatible and not confirmed:
        raise HTTPException(409, "Type/options change would discard values; repeat with conversion_confirmed")
    for value in incompatible:
        db.delete(value)
    for key, value in changes.items():
        setattr(entity, key, value)
    validate_property_value(db, entity, entity.default_value, eid)
    entity.updated_at = now()
    db.commit()
    return as_dict(entity)


@router.delete("/custom-properties/{property_id}", status_code=204)
def property_delete(eid: str, property_id: str, db: Session = Depends(get_db)) -> None:
    entity = definition(db, eid, property_id)
    entity.deleted_at = now()
    entity.updated_at = now()
    db.commit()


@router.post("/custom-properties/{property_id}/restore")
def property_restore(eid: str, property_id: str, db: Session = Depends(get_db)) -> dict:
    entity = definition(db, eid, property_id, True)
    entity.deleted_at = None
    entity.updated_at = now()
    db.commit()
    return as_dict(entity)


@router.get("/records/{record_id}/custom-values")
def values(eid: str, record_id: str, db: Session = Depends(get_db)) -> list[dict]:
    page(db, eid, record_id)
    registry = db.get(RecordRegistry, record_id)
    if not registry:
        raise HTTPException(404, "Record not found")
    rows = db.execute(
        select(CustomPropertyDefinition, CustomPropertyValue)
        .outerjoin(
            CustomPropertyValue,
            (CustomPropertyValue.property_id == CustomPropertyDefinition.id)
            & (CustomPropertyValue.record_id == record_id),
        )
        .where(CustomPropertyDefinition.engagement_id == eid, CustomPropertyDefinition.record_type == registry.kind, CustomPropertyDefinition.deleted_at.is_(None))
        .order_by(CustomPropertyDefinition.display_order)
    )
    return [{"definition": as_dict(d), "value": v.value if v else d.default_value} for d, v in rows]


@router.put("/records/{record_id}/custom-values/{property_id}")
def value_set(eid: str, record_id: str, property_id: str, data: PropertyValueInput, db: Session = Depends(get_db)) -> dict:
    entity = set_property_value(db, eid, record_id, definition(db, eid, property_id), data.value)
    db.commit()
    return as_dict(entity)


def view(db: Session, eid: str, view_id: str, deleted: bool = False) -> SavedView:
    entity = db.scalar(select(SavedView).where(SavedView.id == view_id, SavedView.engagement_id == eid))
    if not entity or (entity.deleted_at and not deleted):
        raise HTTPException(404, "Saved view not found")
    return entity


@router.get("/saved-views")
def view_list(eid: str, record_type: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    query = select(SavedView).where(SavedView.engagement_id == eid, SavedView.deleted_at.is_(None))
    if record_type:
        query = query.where(SavedView.record_type == record_type)
    return [as_dict(v) for v in db.scalars(query.order_by(SavedView.created_at))]


def clear_default(db: Session, eid: str, record_type: str, keep: str) -> None:
    for old in db.scalars(select(SavedView).where(SavedView.engagement_id == eid, SavedView.record_type == record_type, SavedView.is_default.is_(True), SavedView.id != keep)):
        old.is_default = False


@router.post("/saved-views", status_code=201)
def view_create(eid: str, data: ViewCreate, db: Session = Depends(get_db)) -> dict:
    engagement(db, eid)
    entity = SavedView(engagement_id=eid, **data.model_dump(mode="json"))
    db.add(entity)
    db.flush()
    if entity.is_default:
        clear_default(db, eid, entity.record_type, entity.id)
    db.commit()
    return as_dict(entity)


@router.post("/saved-views/{view_id}/duplicate", status_code=201)
def view_duplicate(eid: str, view_id: str, db: Session = Depends(get_db)) -> dict:
    original = view(db, eid, view_id)
    entity = SavedView(engagement_id=eid, record_type=original.record_type, name=original.name + " copy", view_type=original.view_type, config=original.config, is_default=False)
    db.add(entity)
    db.commit()
    return as_dict(entity)


@router.patch("/saved-views/{view_id}")
def view_patch(eid: str, view_id: str, data: ViewPatch, db: Session = Depends(get_db)) -> dict:
    entity = view(db, eid, view_id)
    for key, value in data.model_dump(exclude_unset=True, mode="json").items():
        setattr(entity, key, value)
    if entity.is_default:
        clear_default(db, eid, entity.record_type, entity.id)
    entity.updated_at = now()
    db.commit()
    return as_dict(entity)


@router.delete("/saved-views/{view_id}", status_code=204)
def view_delete(eid: str, view_id: str, db: Session = Depends(get_db)) -> None:
    entity = view(db, eid, view_id)
    entity.deleted_at = now()
    entity.is_default = False
    db.commit()


@router.get("/saved-views/{view_id}/records")
def view_records(eid: str, view_id: str, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)) -> dict:
    entity = view(db, eid, view_id)
    model = RECORD_MODELS[entity.record_type]
    query = select(Page).join(RecordRegistry, RecordRegistry.page_id == Page.id).join(model, model.page_id == Page.id).where(Page.engagement_id == eid, Page.deleted_at.is_(None), RecordRegistry.kind == entity.record_type)
    for item in entity.config.get("filters", []):
        field, value = item.get("field"), item.get("value")
        if field in {"title", "display_id"} and isinstance(value, str):
            query = query.where(getattr(Page, field).contains(value, autoescape=True))
        elif isinstance(field, str) and field.startswith("custom:"):
            property_id = field.removeprefix("custom:")
            query = query.where(exists(select(CustomPropertyValue.id).where(CustomPropertyValue.engagement_id == eid, CustomPropertyValue.record_id == Page.id, CustomPropertyValue.property_id == property_id, func.json_extract(CustomPropertyValue.value, "$") == value)))
        elif isinstance(field, str) and hasattr(model, field):
            query = query.where(getattr(model, field) == value)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    ordering = []
    for item in entity.config.get("sorts", []):
        field = item.get("field")
        column = getattr(Page, field, None) if field in {"title", "display_id", "created_at", "updated_at"} else getattr(model, field, None) if isinstance(field, str) else None
        if column is not None:
            ordering.append(column.desc() if item.get("direction") == "desc" else column.asc())
    rows = db.scalars(query.order_by(*(ordering or [Page.updated_at.desc()])).offset(offset).limit(limit))
    return {"items": [output(db, row) for row in rows], "total": total, "offset": offset, "limit": limit}


@router.get("/saved-views/{view_id}/export.csv")
def view_export(eid: str, view_id: str, selected: str = "", db: Session = Depends(get_db)) -> StreamingResponse:
    saved = view(db, eid, view_id)
    data = view_records(eid, view_id, 0, 200, db)
    selected_ids = set(filter(None, selected.split(",")))
    rows = [row for row in data["items"] if not selected_ids or row.id in selected_ids]
    columns = saved.config.get("columns") or ["id", "display_id", "title", "type", "updated_at"]
    columns = [column for column in columns if isinstance(column, str) and (column in {"id", "display_id", "title", "type", "created_at", "updated_at"} or column.startswith("custom:") or hasattr(RECORD_MODELS[saved.record_type], column))][:100]
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    for row in rows:
        cells = []
        for column in columns:
            if column.startswith("custom:"):
                custom = db.scalar(select(CustomPropertyValue).where(CustomPropertyValue.engagement_id == eid, CustomPropertyValue.record_id == row.id, CustomPropertyValue.property_id == column.removeprefix("custom:")))
                cells.append(custom.value if custom else "")
            elif column == "type":
                cells.append(saved.record_type)
            elif hasattr(row, column):
                cells.append(getattr(row, column))
            else:
                cells.append(getattr(row.record, column, ""))
        writer.writerow(cells)
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="vapt-view.csv"'})


@router.post("/bulk-update")
def bulk_update(eid: str, data: BulkUpdate, db: Session = Depends(get_db)) -> list[PageOut]:
    entities: list[Page] = []
    custom = data.field.removeprefix("custom:") if data.field.startswith("custom:") else None
    custom_definition = definition(db, eid, custom) if custom else None
    for pid in data.ids:
        entity = page(db, eid, pid)
        registry = db.get(RecordRegistry, pid)
        if not registry or registry.kind not in RECORD_TYPES or pid not in data.revisions:
            raise HTTPException(422, "Bulk records/revisions are invalid")
        if entity.revision != data.revisions[pid]:
            raise HTTPException(409, "A selected record changed; reload before bulk editing")
        if custom_definition:
            set_property_value(db, eid, pid, custom_definition, data.value)
            entities.append(entity)
        else:
            entities.append(patch_record(db, entity, registry.kind, {"revision": data.revisions[pid], data.field: data.value}))
    db.commit()
    return [output(db, item) for item in entities]


CANONICAL = {"task": {"Open", "In Progress", "Done"}, "backlog": {"Queued", "In Progress", "Blocked", "Completed", "Skipped"}, "finding": {"Candidate", "Validating", "Confirmed", "Inconclusive", "Dismissed", "Report Ready"}}


@router.get("/workflow-options")
def workflow_list(eid: str, record_type: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    query = select(WorkflowOption).where(WorkflowOption.engagement_id == eid)
    if record_type:
        query = query.where(WorkflowOption.record_type == record_type)
    return [as_dict(o) for o in db.scalars(query.order_by(WorkflowOption.display_order))]


@router.post("/workflow-options", status_code=201)
def workflow_create(eid: str, data: WorkflowCreate, db: Session = Depends(get_db)) -> dict:
    engagement(db, eid)
    if data.canonical_category not in CANONICAL[data.record_type]:
        raise HTTPException(422, "Custom label must map to a canonical workflow category")
    entity = WorkflowOption(engagement_id=eid, **data.model_dump())
    db.add(entity)
    db.commit()
    return as_dict(entity)


@router.put("/records/{record_id}/workflow")
def workflow_apply(eid: str, record_id: str, data: WorkflowApply, db: Session = Depends(get_db)) -> PageOut:
    entity = page(db, eid, record_id)
    option = db.scalar(select(WorkflowOption).where(WorkflowOption.id == data.option_id, WorkflowOption.engagement_id == eid))
    if not option:
        raise HTTPException(404, "Workflow option not found")
    registry = db.get(RecordRegistry, record_id)
    actual = "task" if db.get(PersonalTask, record_id) else registry.kind if registry else ""
    if actual != option.record_type:
        raise HTTPException(422, "Workflow option does not apply to this record")
    if actual == "task":
        entity = patch_page(db, entity, {"revision": data.revision, "status": option.canonical_category})
    else:
        field = "validation_status" if actual == "finding" else "status"
        entity = patch_record(db, entity, actual, {"revision": data.revision, field: option.canonical_category})
    assignment = db.get(WorkflowAssignment, record_id)
    if assignment:
        assignment.option_id = option.id
    else:
        db.add(WorkflowAssignment(record_id=record_id, engagement_id=eid, option_id=option.id))
    db.commit()
    return output(db, entity)


def evidence_root() -> Path:
    configured = Path(os.getenv("VAPT_EVIDENCE_DIR", str(Path(__file__).resolve().parents[2] / "evidence_data")))
    configured.mkdir(parents=True, exist_ok=True)
    return configured.resolve()


def inspect_type(payload: bytes, declared: str) -> str:
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if payload.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if payload.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    try:
        payload[:8192].decode("utf-8")
        return "text/plain" if declared in {"", "application/octet-stream"} else declared
    except UnicodeDecodeError:
        return "application/octet-stream"


@router.post("/evidence-files", status_code=201)
async def evidence_upload(eid: str, request: Request, metadata: str = Query(..., max_length=5000), db: Session = Depends(get_db)) -> dict:
    engagement(db, eid)
    try:
        info = EvidenceMetadata.model_validate_json(metadata)
    except ValueError as error:
        raise HTTPException(422, "Invalid evidence metadata") from error
    payload = await request.body()
    if not payload:
        raise HTTPException(422, "Evidence file is empty")
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(413, "Evidence exceeds the 25 MB limit")
    original = Path(request.headers.get("x-filename", "evidence.bin")).name[:300]
    digest = hashlib.sha256(payload).hexdigest()
    existing = db.scalar(select(EvidenceFile).join(Page, Page.id == EvidenceFile.evidence_id).where(Page.engagement_id == eid, EvidenceFile.sha256 == digest, EvidenceFile.file_size == len(payload)))
    if existing:
        if info.related_id:
            add_link(db, eid, existing.evidence_id, info.related_id, "supports")
            db.commit()
        return {"page": output(db, page(db, eid, existing.evidence_id)), "file": as_dict(existing), "duplicate": True}
    mime = inspect_type(payload, request.headers.get("content-type", ""))
    record = create_record(db, eid, "evidence", {"title": info.title, "source_reference": original, "media_type": mime, "sanitization_state": "Unreviewed", "evidence_type": info.evidence_type, "review_state": info.review_state, "source_tool": info.source_tool, "captured_at": info.captured_at})
    stored = uuid4().hex + ".bin"
    destination = (evidence_root() / stored).resolve()
    if destination.parent != evidence_root():
        raise HTTPException(422, "Unsafe storage path")
    destination.write_bytes(payload)
    file = EvidenceFile(evidence_id=record.id, original_filename=original, stored_filename=stored, file_size=len(payload), mime_type=mime, sha256=digest)
    db.add(file)
    if info.related_id:
        add_link(db, eid, record.id, info.related_id, "supports")
    try:
        db.commit()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {"page": output(db, record), "file": as_dict(file), "duplicate": False}


def evidence_file(db: Session, eid: str, evidence_id: str) -> tuple[Page, Evidence, EvidenceFile]:
    owner = page(db, eid, evidence_id)
    record = db.get(Evidence, evidence_id)
    file = db.scalar(select(EvidenceFile).where(EvidenceFile.evidence_id == evidence_id))
    if not record or not file:
        raise HTTPException(404, "Evidence file not found")
    return owner, record, file


@router.get("/evidence-files/{evidence_id}")
def evidence_metadata(eid: str, evidence_id: str, db: Session = Depends(get_db)) -> dict:
    _, record, file = evidence_file(db, eid, evidence_id)
    result = as_dict(file)
    result["review_state"] = record.review_state
    result["evidence_type"] = record.evidence_type
    return result


@router.get("/evidence-files/{evidence_id}/download")
def evidence_download(eid: str, evidence_id: str, db: Session = Depends(get_db)) -> FileResponse:
    _, _, file = evidence_file(db, eid, evidence_id)
    path = (evidence_root() / file.stored_filename).resolve()
    if path.parent != evidence_root() or not path.is_file():
        raise HTTPException(404, "Evidence bytes unavailable")
    return FileResponse(path, media_type="application/octet-stream", filename=file.original_filename)


@router.get("/evidence-files/{evidence_id}/preview")
def evidence_preview(eid: str, evidence_id: str, db: Session = Depends(get_db)) -> Response:
    _, record, file = evidence_file(db, eid, evidence_id)
    if record.review_state == "Restricted":
        raise HTTPException(403, "Restricted evidence is excluded from previews")
    path = (evidence_root() / file.stored_filename).resolve()
    if path.parent != evidence_root() or not path.is_file():
        raise HTTPException(404, "Evidence bytes unavailable")
    if file.mime_type in {"image/png", "image/jpeg", "image/gif"}:
        return FileResponse(path, media_type=file.mime_type, headers={"Content-Security-Policy": "default-src 'none'; sandbox"})
    if file.mime_type.startswith("text/") or record.evidence_type in {"HTTP request", "HTTP response", "HTTP exchange", "Log", "Text document"}:
        return PlainTextResponse(path.read_text("utf-8", errors="replace"), headers={"Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff"})
    raise HTTPException(415, "This file is download-only")


@router.get("/search", response_model=list[SearchResult])
def search(eid: str, q: str = Query(min_length=1, max_length=200), record_type: str | None = None, limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)) -> list[SearchResult]:
    engagement(db, eid)
    rebuild_engagement_index(db, eid)
    safe = " ".join(re.sub(r"[^\w-]", " ", q).split())
    if not safe:
        return []
    sql = "SELECT page_id,kind,title,snippet(page_search,4,'[',']','…',12) excerpt FROM page_search WHERE page_search MATCH :q AND engagement_id=:eid"
    params: dict[str, object] = {"q": safe + "*", "eid": eid, "limit": limit}
    if record_type:
        sql += " AND kind=:kind"
        params["kind"] = record_type
    sql += " ORDER BY rank LIMIT :limit"
    result = []
    for row in db.execute(text(sql), params).mappings():
        if row["kind"] in {"note", "journal"}:
            continue
        owner = db.get(Page, row["page_id"])
        result.append(SearchResult(id=owner.id, display_id=owner.display_id, title=owner.title, kind=row["kind"], excerpt=row["excerpt"] or ""))
    return result


@router.post("/quick-capture", response_model=PageOut, status_code=201)
def quick_capture(eid: str, data: QuickCapture, db: Session = Depends(get_db)) -> PageOut:
    eng = engagement(db, eid)
    if data.kind == "task":
        entity = create_page(db, eng, {"title": data.title, "page_type": "task"}, True)
        db.add(PersonalTask(page_id=entity.id, priority=data.priority, related_page_id=data.related_id))
    else:
        kind = {"surface": "surface", "backlog": "backlog", "finding": "finding"}[data.kind]
        values: dict = {"title": data.title}
        if kind == "backlog":
            values["priority"] = data.priority
        if data.related_id:
            values["links"] = [{"target_id": data.related_id, "relationship_type": "related_to"}]
        values = CREATE_SCHEMAS[kind].model_validate(values).model_dump(mode="json")
        entity = create_record(db, eid, kind, values)
    db.commit()
    return output(db, entity)


@router.post("/imports/preview", status_code=201)
async def import_preview(eid: str, request: Request, format: str, filename: str = "import.txt", db: Session = Depends(get_db)) -> dict:
    engagement(db, eid)
    payload = await request.body()
    source_hash = hashlib.sha256(payload).hexdigest()
    completed = db.scalar(select(ImportJob).where(ImportJob.engagement_id == eid, ImportJob.format == format, ImportJob.source_hash == source_hash, ImportJob.status == "confirmed").order_by(ImportJob.confirmed_at.desc()))
    if completed:
        return as_dict(completed)
    parsed = parse_import(format, payload)
    valid = [row for row in parsed if "error" not in row]
    rejected = [row for row in parsed if "error" in row]
    existing = set(db.scalars(select(ImportEntry.fingerprint).where(ImportEntry.engagement_id == eid)))
    for row in valid:
        row["duplicate"] = row["fingerprint"] in existing
    job = ImportJob(engagement_id=eid, format=format, source_filename=Path(filename).name[:300], source_hash=source_hash, preview={"records": valid, "rejected": rejected})
    db.add(job)
    db.commit()
    return as_dict(job)


@router.post("/imports/confirm")
def import_confirm(eid: str, data: ImportConfirm, db: Session = Depends(get_db)) -> dict:
    job = db.scalar(select(ImportJob).where(ImportJob.id == data.import_id, ImportJob.engagement_id == eid))
    if not job:
        raise HTTPException(404, "Import preview not found")
    if job.status == "confirmed":
        return {"import_id": job.id, "created": 0, "existing": len(job.preview.get("records", [])), "rejected": len(job.preview.get("rejected", []))}
    created = existing_count = 0
    for row in job.preview.get("records", []):
        previous = db.scalar(select(ImportEntry).where(ImportEntry.engagement_id == eid, ImportEntry.import_id == job.id, ImportEntry.fingerprint == row["fingerprint"]))
        if previous:
            existing_count += 1
            continue
        if row.get("kind") == "evidence":
            payload = row["content"].encode("utf-8")
            digest = hashlib.sha256(payload).hexdigest()
            file = db.scalar(select(EvidenceFile).join(Page, Page.id == EvidenceFile.evidence_id).where(Page.engagement_id == eid, EvidenceFile.sha256 == digest, EvidenceFile.file_size == len(payload)))
            if file:
                owner = page(db, eid, file.evidence_id)
                existing_count += 1
            else:
                owner = create_record(db, eid, "evidence", {"title": Path(job.source_filename).stem or "Imported HTTP exchange", "source_reference": job.source_filename, "media_type": "text/plain", "sanitization_state": "Unreviewed", "evidence_type": "HTTP exchange", "review_state": "Needs Review", "source_tool": job.format})
                stored = uuid4().hex + ".txt"
                destination = (evidence_root() / stored).resolve()
                if destination.parent != evidence_root():
                    raise HTTPException(500, "Unsafe evidence storage path")
                destination.write_bytes(payload)
                db.add(EvidenceFile(evidence_id=owner.id, original_filename=Path(job.source_filename).name, stored_filename=stored, file_size=len(payload), mime_type="text/plain", sha256=digest))
                created += 1
            db.add(ImportEntry(engagement_id=eid, import_id=job.id, record_id=owner.id, fingerprint=row["fingerprint"], source_row=1))
            continue
        route = normalized_route(row["url"])
        surface = db.scalar(select(Page).join(AttackSurface, AttackSurface.page_id == Page.id).where(Page.engagement_id == eid, Page.deleted_at.is_(None), AttackSurface.normalized_route == route, AttackSurface.http_method == row["method"], AttackSurface.authentication_state == row["authentication_context"]))
        if surface:
            existing_count += 1
        else:
            surface = create_record(db, eid, "surface", {"title": row["title"], "url_route": row["url"], "http_method": row["method"], "authentication_state": row["authentication_context"]})
            created += 1
        create_record(db, eid, "observation", {"title": f"Imported from {job.source_filename}", "surface_id": surface.id, "classification": "Observed", "discovery_source": job.format, "source_reference": row["source_reference"] or job.source_filename})
        db.add(ImportEntry(engagement_id=eid, import_id=job.id, record_id=surface.id, fingerprint=row["fingerprint"], source_row=int(row["row"])))
    job.status = "confirmed"
    job.confirmed_at = now()
    db.commit()
    return {"import_id": job.id, "created": created, "existing": existing_count, "rejected": len(job.preview.get("rejected", []))}


@router.get("/imports")
def import_history(eid: str, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    return [as_dict(job) for job in db.scalars(select(ImportJob).where(ImportJob.engagement_id == eid).order_by(ImportJob.created_at.desc()))]


@router.get("/records/{record_id}/document-backlinks")
def document_backlinks(eid: str, record_id: str, db: Session = Depends(get_db)) -> list[dict]:
    page(db, eid, record_id, True)
    rows = db.execute(select(DocumentLink, Page).join(Page, Page.id == DocumentLink.source_id).where(DocumentLink.engagement_id == eid, DocumentLink.target_id == record_id).order_by(DocumentLink.created_at.desc()))
    return [{"id": link.id, "origin": link.origin, "source": {"id": source.id, "display_id": source.display_id, "title": source.title, "deleted": source.deleted_at is not None}} for link, source in rows]


def reusable_template(db: Session, eid: str, template_id: str) -> ReusableTemplate:
    entity = db.scalar(select(ReusableTemplate).where(ReusableTemplate.id == template_id, ReusableTemplate.engagement_id == eid, ReusableTemplate.deleted_at.is_(None)))
    if not entity:
        raise HTTPException(404, "Template not found")
    return entity


@router.get("/content-templates")
def content_template_list(eid: str, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    result = []
    for template, owner in db.execute(select(ReusableTemplate, Page).join(Page, Page.id == ReusableTemplate.page_id).where(ReusableTemplate.engagement_id == eid, ReusableTemplate.deleted_at.is_(None)).order_by(ReusableTemplate.created_at)):
        item = as_dict(template)
        item["page"] = output(db, owner)
        result.append(item)
    return result


@router.post("/content-templates", status_code=201)
def content_template_create(eid: str, data: ReusableTemplateCreate, db: Session = Depends(get_db)) -> dict:
    from app.schemas.contracts import validate_document

    eng = engagement(db, eid)
    validate_document(data.content)
    owner = create_page(db, eng, {"title": data.name, "page_type": "note"})
    owner.content = data.content
    reconcile_document_links(db, owner)
    index_page(db, owner)
    entity = ReusableTemplate(engagement_id=eid, page_id=owner.id, name=data.name, record_type=data.record_type, default_properties=data.default_properties)
    db.add(entity)
    db.commit()
    item = as_dict(entity)
    item["page"] = output(db, owner)
    return item


@router.post("/content-templates/initialize", status_code=201)
def content_template_initialize(eid: str, db: Session = Depends(get_db)) -> list[dict]:
    engagement(db, eid)
    samples = [
        ("Authentication testing", "test_case"), ("Authorization testing", "test_case"),
        ("Input handling", "test_case"), ("Business logic review", "test_case"),
        ("Findings investigation", "finding"),
    ]
    existing = set(db.scalars(select(ReusableTemplate.name).where(ReusableTemplate.engagement_id == eid)))
    created = []
    for name, record_type in samples:
        if name in existing:
            continue
        document = {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": name}]}, {"type": "paragraph"}, {"type": "taskList", "content": [{"type": "taskItem", "attrs": {"checked": False}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Review and document observations"}]}]}]}]}
        owner = create_page(db, engagement(db, eid), {"title": name, "page_type": "note"})
        owner.content = document
        index_page(db, owner)
        entity = ReusableTemplate(engagement_id=eid, page_id=owner.id, name=name, record_type=record_type)
        db.add(entity)
        created.append(entity)
    db.commit()
    return [as_dict(item) for item in created]


@router.patch("/content-templates/{template_id}")
def content_template_patch(eid: str, template_id: str, data: ReusableTemplatePatch, db: Session = Depends(get_db)) -> dict:
    entity = reusable_template(db, eid, template_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entity, key, value)
    if data.name:
        owner = page(db, eid, entity.page_id)
        patch_page(db, owner, {"revision": owner.revision, "title": data.name})
    entity.updated_at = now()
    db.commit()
    return as_dict(entity)


@router.post("/content-templates/{template_id}/duplicate", status_code=201)
def content_template_duplicate(eid: str, template_id: str, db: Session = Depends(get_db)) -> dict:
    original = reusable_template(db, eid, template_id)
    source = page(db, eid, original.page_id)
    owner = create_page(db, engagement(db, eid), {"title": original.name + " copy", "page_type": "note"})
    owner.content = source.content
    reconcile_document_links(db, owner)
    index_page(db, owner)
    entity = ReusableTemplate(engagement_id=eid, page_id=owner.id, name=original.name + " copy", record_type=original.record_type, default_properties=original.default_properties)
    db.add(entity)
    db.commit()
    return as_dict(entity)


@router.delete("/content-templates/{template_id}", status_code=204)
def content_template_delete(eid: str, template_id: str, db: Session = Depends(get_db)) -> None:
    entity = reusable_template(db, eid, template_id)
    entity.deleted_at = now()
    entity.updated_at = now()
    db.commit()


@router.post("/content-templates/{template_id}/instantiate", response_model=PageOut, status_code=201)
def content_template_instantiate(eid: str, template_id: str, data: TemplateInstantiate, db: Session = Depends(get_db)) -> PageOut:
    template = reusable_template(db, eid, template_id)
    source = page(db, eid, template.page_id)
    if template.record_type == "task":
        entity = create_page(db, engagement(db, eid), {"title": data.title, "page_type": "task"}, True)
        entity.content = source.content
        db.add(PersonalTask(page_id=entity.id, **template.default_properties))
        reconcile_document_links(db, entity)
        index_page(db, entity)
    else:
        entity = create_record(db, eid, template.record_type, {"title": data.title, "content": source.content, **template.default_properties})
    db.commit()
    return output(db, entity)
