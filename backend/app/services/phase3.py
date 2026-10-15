import csv
import hashlib
import io
import json
from datetime import date
from typing import Any
from urllib.parse import urlparse
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from app.models.entities import Page, now
from app.models.records import (
    CustomPropertyDefinition,
    CustomPropertyValue,
    DocumentLink,
    Evidence,
    EvidenceFile,
    RecordRegistry,
    SavedView,
)
from app.repositories.workspace import page


def plain_text(document: dict[str, Any]) -> str:
    parts: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "text" and isinstance(node.get("text"), str):
            parts.append(node["text"])
        elif node.get("type") in {"mention", "wikiLink"}:
            parts.append(str(node.get("attrs", {}).get("label", "")))
        for child in node.get("content", []):
            walk(child)

    walk(document)
    return " ".join(parts)


def document_targets(document: dict[str, Any]) -> dict[str, set[str]]:
    result = {"mention": set(), "wiki": set()}

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        kind = node.get("type")
        if kind in {"mention", "wikiLink"}:
            target = node.get("attrs", {}).get("recordId")
            if isinstance(target, str):
                result["mention" if kind == "mention" else "wiki"].add(target)
        for child in node.get("content", []):
            walk(child)

    walk(document)
    return result


def reconcile_document_links(db: Session, entity: Page) -> None:
    def validate_resources(node: Any) -> None:
        if not isinstance(node, dict):
            return
        kind = node.get("type")
        attrs = node.get("attrs", {})
        if kind in {"evidenceImage", "fileAttachment"}:
            evidence_id = attrs.get("evidenceId")
            target = db.scalar(
                select(EvidenceFile)
                .join(Page, Page.id == EvidenceFile.evidence_id)
                .where(
                    EvidenceFile.evidence_id == evidence_id,
                    Page.engagement_id == entity.engagement_id,
                    Page.deleted_at.is_(None),
                )
            )
            if not target:
                raise HTTPException(422, "An evidence block targets an inaccessible stored file")
        if kind == "databaseView":
            saved = db.scalar(
                select(SavedView).where(
                    SavedView.id == attrs.get("viewId"),
                    SavedView.engagement_id == entity.engagement_id,
                    SavedView.deleted_at.is_(None),
                )
            )
            if not saved:
                raise HTTPException(422, "An embedded database block targets an inaccessible saved view")
        for child in node.get("content", []):
            validate_resources(child)

    validate_resources(entity.content)
    desired = document_targets(entity.content)
    for origin in ("mention", "wiki"):
        existing = {
            row.target_id: row
            for row in db.scalars(
                select(DocumentLink).where(DocumentLink.source_id == entity.id, DocumentLink.origin == origin)
            )
        }
        for target_id in desired[origin]:
            if target_id == entity.id:
                continue
            target = db.scalar(
                select(RecordRegistry).where(
                    RecordRegistry.page_id == target_id, RecordRegistry.engagement_id == entity.engagement_id
                )
            )
            if not target:
                raise HTTPException(422, "An internal link targets an inaccessible record")
            if target_id not in existing:
                db.add(
                    DocumentLink(
                        engagement_id=entity.engagement_id,
                        source_id=entity.id,
                        target_id=target_id,
                        origin=origin,
                    )
                )
        for target_id, link in existing.items():
            if target_id not in desired[origin]:
                db.delete(link)


def index_page(db: Session, entity: Page) -> None:
    registry = db.get(RecordRegistry, entity.id)
    db.execute(text("DELETE FROM page_search WHERE page_id=:pid"), {"pid": entity.id})
    if entity.deleted_at is None:
        db.execute(
            text("INSERT INTO page_search(page_id,engagement_id,kind,title,body) VALUES (:p,:e,:k,:t,:b)"),
            {
                "p": entity.id,
                "e": entity.engagement_id,
                "k": registry.kind if registry else entity.page_type,
                "t": entity.title,
                "b": plain_text(entity.content),
            },
        )


def rebuild_engagement_index(db: Session, eid: str) -> None:
    db.execute(text("DELETE FROM page_search WHERE engagement_id=:eid"), {"eid": eid})
    for entity, kind in db.execute(
        select(Page, RecordRegistry.kind)
        .join(RecordRegistry, RecordRegistry.page_id == Page.id)
        .where(Page.engagement_id == eid, Page.deleted_at.is_(None), Page.page_type != "scratchpad")
    ):
        extra: list[str] = []
        for definition, value in db.execute(select(CustomPropertyDefinition, CustomPropertyValue).join(CustomPropertyValue, CustomPropertyValue.property_id == CustomPropertyDefinition.id).where(CustomPropertyValue.engagement_id == eid, CustomPropertyValue.record_id == entity.id, CustomPropertyDefinition.data_type == "text", CustomPropertyDefinition.visible.is_(True), CustomPropertyDefinition.deleted_at.is_(None))):
            if isinstance(value.value, str):
                extra.append(value.value)
        evidence = db.get(Evidence, entity.id)
        if evidence:
            if evidence.review_state == "Restricted":
                continue
            extra.extend([evidence.evidence_type, evidence.source_tool, evidence.source_reference or ""])
        db.execute(
            text("INSERT INTO page_search(page_id,engagement_id,kind,title,body) VALUES (:p,:e,:k,:t,:b)"),
            {"p": entity.id, "e": eid, "k": kind, "t": entity.title, "b": " ".join([plain_text(entity.content), *extra])},
        )


def validate_property_value(
    db: Session, definition: CustomPropertyDefinition, value: Any, eid: str
) -> Any:
    if value is None or value == "":
        if definition.required:
            raise HTTPException(422, f"{definition.name} is required")
        return None
    kind = definition.data_type
    if kind == "text":
        if not isinstance(value, str) or len(value) > 20000:
            raise HTTPException(422, "Text property requires a string")
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise HTTPException(422, "Number property requires a finite number")
        if value != value or value in (float("inf"), float("-inf")):
            raise HTTPException(422, "Number must be finite")
    elif kind == "checkbox":
        if not isinstance(value, bool):
            raise HTTPException(422, "Checkbox property requires true or false")
    elif kind == "date":
        if not isinstance(value, str):
            raise HTTPException(422, "Date property requires YYYY-MM-DD")
        try:
            value = date.fromisoformat(value).isoformat()
        except ValueError as error:
            raise HTTPException(422, "Date property requires YYYY-MM-DD") from error
    elif kind == "url":
        if not isinstance(value, str) or urlparse(value).scheme not in {"http", "https"}:
            raise HTTPException(422, "URL property requires an http(s) URL")
    elif kind == "single_select":
        if not isinstance(value, str) or value not in definition.allowed_values:
            raise HTTPException(422, "Select value is not an allowed option")
    elif kind == "multi_select":
        if not isinstance(value, list) or len(value) > 100 or any(v not in definition.allowed_values for v in value):
            raise HTTPException(422, "Multi-select values must use allowed options")
        value = list(dict.fromkeys(value))
    elif kind == "relation":
        values = value if isinstance(value, list) else [value]
        if len(values) > 100 or any(not isinstance(v, str) for v in values):
            raise HTTPException(422, "Relation property requires record UUIDs")
        for target in values:
            page(db, eid, target)
        value = list(dict.fromkeys(values))
    return value


def set_property_value(
    db: Session, eid: str, record_id: str, definition: CustomPropertyDefinition, value: Any
) -> CustomPropertyValue:
    record = page(db, eid, record_id)
    registry = db.get(RecordRegistry, record.id)
    if not registry or registry.kind != definition.record_type:
        raise HTTPException(422, "Property does not apply to this record type")
    normalized = validate_property_value(db, definition, value, eid)
    entity = db.scalar(
        select(CustomPropertyValue).where(
            CustomPropertyValue.property_id == definition.id, CustomPropertyValue.record_id == record_id
        )
    )
    if entity:
        entity.value = normalized
        entity.updated_at = now()
    else:
        entity = CustomPropertyValue(
            engagement_id=eid, property_id=definition.id, record_id=record_id, value=normalized
        )
        db.add(entity)
    return entity


def parse_import(format_name: str, payload: bytes) -> list[dict[str, str]]:
    if len(payload) > 10 * 1024 * 1024:
        raise HTTPException(413, "Import exceeds the 10 MB limit")
    try:
        source = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(422, "Import must be UTF-8 text") from error
    rows: list[dict[str, Any]]
    try:
        if format_name == "http-exchange":
            first = source.splitlines()[0] if source.splitlines() else ""
            if not first.startswith(("GET ", "POST ", "PUT ", "PATCH ", "DELETE ", "HEAD ", "OPTIONS ", "HTTP/")):
                raise HTTPException(422, "HTTP evidence must begin with a request or response line")
            return [{"row": "1", "kind": "evidence", "title": "Imported HTTP exchange", "content": source, "fingerprint": hashlib.sha256(payload).hexdigest()}]
        if format_name == "csv":
            rows = list(csv.DictReader(io.StringIO(source)))
        elif format_name == "json":
            loaded = json.loads(source)
            rows = loaded if isinstance(loaded, list) else loaded.get("records", [])
        elif format_name == "katana-jsonl":
            rows = [json.loads(line) for line in source.splitlines() if line.strip()]
        elif format_name in {"feroxbuster-json", "feroxbuster-jsonl"}:
            rows = [json.loads(line) for line in source.splitlines() if line.strip()]
        else:
            raise HTTPException(422, "Unsupported import format")
    except (ValueError, csv.Error) as error:
        raise HTTPException(422, "Malformed import; no data was changed") from error
    if not isinstance(rows, list) or len(rows) > 10000:
        raise HTTPException(422, "Import must contain at most 10,000 records")
    result = []
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            result.append({"row": str(index), "error": "Row must be an object"})
            continue
        url = row.get("url") or row.get("endpoint") or row.get("target")
        if not isinstance(url, str) or not url.strip():
            result.append({"row": str(index), "error": "Missing url"})
            continue
        method = str(row.get("method") or row.get("status_method") or "GET").upper()
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"}:
            result.append({"row": str(index), "error": "Invalid HTTP method"})
            continue
        auth = str(row.get("authentication_context") or row.get("auth") or "")
        canonical = f"{url.strip()}\n{method}\n{auth}"
        result.append(
            {
                "row": str(index),
                "url": url.strip(),
                "method": method,
                "title": str(row.get("title") or url).strip()[:300],
                "authentication_context": auth[:300],
                "source_reference": str(row.get("source") or "")[:2000],
                "fingerprint": hashlib.sha256(canonical.encode()).hexdigest(),
            }
        )
    return result
