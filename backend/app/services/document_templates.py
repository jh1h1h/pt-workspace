from copy import deepcopy
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.entities import Page, now
from app.models.records import DocumentTemplate
from app.schemas.contracts import EMPTY_DOC

SECTIONS = {
    "test_case": [
        "Objective",
        "Prerequisites",
        "Testing procedure",
        "Observations",
        "Result / outcome",
        "Linked evidence",
        "Linked findings",
        "Related tasks or backlog items",
    ],
    "finding": [
        "Summary",
        "Description",
        "Affected components",
        "Prerequisites",
        "Reproduction",
        "Expected behaviour",
        "Observed behaviour",
        "Security impact",
        "Evidence",
        "Remediation",
        "References",
        "Validation notes",
    ],
}
SCOPE_SECTIONS = [
    "Engagement overview",
    "Rules of engagement",
    "Testing boundaries",
    "Exclusions",
    "Approved testing windows",
    "Project-team contacts",
    "Known limitations",
    "Authentication and test-account notes",
    "Open questions",
]


def builtin_template(kind: str) -> dict:
    if kind not in SECTIONS:
        return deepcopy(EMPTY_DOC)
    return {
        "type": "doc",
        "content": [
            node
            for title in SECTIONS[kind]
            for node in [
                {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": title}]},
                {"type": "paragraph"},
            ]
        ],
    }


def resolve_template(db: Session, eid: str, kind: str, template_id: str | None) -> dict:
    query = (
        select(Page)
        .join(DocumentTemplate, DocumentTemplate.page_id == Page.id)
        .where(Page.engagement_id == eid, Page.deleted_at.is_(None), DocumentTemplate.record_type == kind)
    )
    if template_id:
        entity = db.scalar(query.where(Page.id == template_id))
        if not entity:
            raise HTTPException(404, "Matching same-engagement template not found")
    else:
        entity = db.scalar(query.where(DocumentTemplate.is_default.is_(True)))
    return deepcopy(entity.content) if entity else builtin_template(kind)


def clear_previous_default(db: Session, eid: str, kind: str, current_id: str) -> None:
    for row in db.scalars(
        select(DocumentTemplate).where(
            DocumentTemplate.engagement_id == eid,
            DocumentTemplate.record_type == kind,
            DocumentTemplate.is_default.is_(True),
            DocumentTemplate.page_id != current_id,
        )
    ):
        row.is_default = False
        page = db.get(Page, row.page_id)
        page.revision += 1
        page.updated_at = now()
    db.flush()
