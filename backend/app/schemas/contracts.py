from datetime import date, datetime
from typing import Any, Literal
from app.schemas.record_properties import RecordProperties
from pydantic import BaseModel, ConfigDict, Field, field_validator

EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}
NODES = {
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "taskList",
    "taskItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "hardBreak",
    "table",
    "tableRow",
    "tableHeader",
    "tableCell",
    "mention",
    "wikiLink",
    "callout",
    "evidenceImage",
    "fileAttachment",
    "databaseView",
}
MARKS = {"bold", "italic", "underline", "strike", "code", "link"}


def validate_document(doc: dict[str, Any]) -> dict[str, Any]:
    count = 0

    def walk(node: Any, depth: int = 0) -> None:
        nonlocal count
        count += 1
        if depth > 60 or count > 20000:
            raise ValueError("Document exceeds safety limits")
        if not isinstance(node, dict) or node.get("type") not in NODES:
            raise ValueError("Unsupported document node; original content must be retained for recovery")
        if set(node) - {"type", "attrs", "content", "marks", "text"}:
            raise ValueError("Unsupported document fields")
        kind = node["type"]
        if kind == "text" and (not isinstance(node.get("text"), str) or not node["text"]):
            raise ValueError("Text node requires nonempty text")
        if "content" in node and not isinstance(node["content"], list):
            raise ValueError("Content must be an array")
        if "attrs" in node and not isinstance(node["attrs"], dict):
            raise ValueError("Attributes must be an object")
        if kind == "heading" and node.get("attrs", {}).get("level", 1) not in [1, 2, 3]:
            raise ValueError("Only headings 1–3 are supported")
        attrs = node.get("attrs", {})
        attr_keys = {
            "heading": {"level"},
            "codeBlock": {"language"},
            "orderedList": {"start", "type"},
            "taskItem": {"checked"},
            "table": set(),
            "tableCell": {"colspan", "rowspan", "colwidth", "align"},
            "tableHeader": {"colspan", "rowspan", "colwidth", "align"},
            "mention": {"recordId", "label"},
            "wikiLink": {"recordId", "label"},
            "callout": {"tone", "icon"},
            "evidenceImage": {"evidenceId", "alt", "caption"},
            "fileAttachment": {"evidenceId", "label"},
            "databaseView": {"viewId"},
        }.get(kind, set())
        if set(attrs) - attr_keys:
            raise ValueError("Unsupported attributes; original content must be retained")
        if kind == "taskItem" and "checked" in attrs and not isinstance(attrs["checked"], bool):
            raise ValueError("checked must be boolean")
        if kind == "codeBlock" and attrs.get("language") is not None and not isinstance(attrs["language"], str):
            raise ValueError("Code language must be a string")
        if kind in {"mention", "wikiLink"}:
            if not isinstance(attrs.get("recordId"), str) or len(attrs["recordId"]) != 36:
                raise ValueError("Internal links require an immutable UUID")
            if not isinstance(attrs.get("label"), str) or len(attrs["label"]) > 300:
                raise ValueError("Invalid internal link label")
        if kind in {"evidenceImage", "fileAttachment"}:
            if not isinstance(attrs.get("evidenceId"), str) or len(attrs["evidenceId"]) != 36:
                raise ValueError("Evidence blocks require an immutable UUID")
        if kind == "databaseView" and (not isinstance(attrs.get("viewId"), str) or len(attrs["viewId"]) != 36):
            raise ValueError("Database view blocks require an immutable UUID")
        if kind in {"tableCell", "tableHeader"}:
            for key in ["colspan", "rowspan"]:
                value = attrs.get(key, 1)
                if not isinstance(value, int) or not 1 <= value <= 100:
                    raise ValueError("Table spans must be integers from 1 to 100")
            widths = attrs.get("colwidth")
            if widths is not None and (
                not isinstance(widths, list)
                or len(widths) > 100
                or any(not isinstance(w, int) or not 0 <= w <= 10000 for w in widths)
            ):
                raise ValueError("Invalid column widths")
        marks = node.get("marks", [])
        if not isinstance(marks, list):
            raise ValueError("Marks must be an array")
        for mark in marks:
            if not isinstance(mark, dict) or mark.get("type") not in MARKS:
                raise ValueError("Unsupported mark; original content must be retained")
            if set(mark) - {"type", "attrs"}:
                raise ValueError("Unsupported mark fields")
            mark_attrs = mark.get("attrs", {})
            if not isinstance(mark_attrs, dict):
                raise ValueError("Mark attributes must be an object")
            allowed_mark_attrs = {"href", "target", "rel", "class"} if mark["type"] == "link" else set()
            if set(mark_attrs) - allowed_mark_attrs:
                raise ValueError("Unsupported mark attributes; original content must be retained")
            if mark["type"] == "link":
                href = mark.get("attrs", {}).get("href", "")
                if not isinstance(href, str) or not href.startswith(("http://", "https://", "mailto:", "/")):
                    raise ValueError("Unsafe link scheme")
        for child in node.get("content", []):
            walk(child, depth + 1)

    if doc.get("type") != "doc":
        raise ValueError("Document root must be doc")
    walk(doc)
    # Structural validation matching the Phase 1 ProseMirror schema.
    blocks = NODES - {"doc", "text", "hardBreak", "mention", "wikiLink", "listItem", "taskItem", "tableRow", "tableCell", "tableHeader"}

    def structure(node: dict) -> None:
        kind = node["type"]
        children = node.get("content", [])
        allowed = {
            "doc": blocks,
            "paragraph": {"text", "hardBreak", "mention", "wikiLink"},
            "heading": {"text", "hardBreak", "mention", "wikiLink"},
            "codeBlock": {"text"},
            "bulletList": {"listItem"},
            "orderedList": {"listItem"},
            "taskList": {"taskItem"},
            "listItem": blocks,
            "taskItem": blocks,
            "blockquote": blocks,
            "table": {"tableRow"},
            "tableRow": {"tableCell", "tableHeader"},
            "tableCell": blocks,
            "tableHeader": blocks,
            "callout": blocks,
        }.get(kind, set())
        if any(c["type"] not in allowed for c in children):
            raise ValueError("Invalid document structure")
        if (
            kind
            in {
                "doc",
                "bulletList",
                "orderedList",
                "taskList",
                "listItem",
                "taskItem",
                "blockquote",
                "table",
                "tableRow",
                "tableCell",
                "tableHeader",
            }
            and not children
        ):
            raise ValueError("Container requires content")
        for child in children:
            structure(child)

    structure(doc)
    return doc


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EngagementInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)


class EngagementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    created_at: datetime
    deleted_at: datetime | None


class PageCreate(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    page_type: Literal["page", "note", "journal"] = "page"
    parent_id: str | None = None
    icon: str | None = Field(default=None, max_length=32)
    journal_date: date | None = None
    content: dict[str, Any] = Field(default_factory=lambda: EMPTY_DOC.copy())
    _document = field_validator("content")(validate_document)


class PagePatch(StrictModel):
    revision: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=300)
    icon: str | None = Field(default=None, max_length=32)
    parent_id: str | None = None
    favorite: bool | None = None
    content: dict[str, Any] | None = None

    @field_validator("content")
    @classmethod
    def document(cls, value: dict | None) -> dict | None:
        return validate_document(value) if value is not None else value


class TaskCreate(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    priority: Literal["P1", "P2", "P3"] = "P2"
    status: Literal["Open", "In Progress", "Done"] = "Open"
    due_date: date | None = None
    related_page_id: str | None = None
    parent_task_id: str | None = None


class TaskPatch(PagePatch):
    status: Literal["Open", "In Progress", "Done"] | None = None
    priority: Literal["P1", "P2", "P3"] | None = None
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0)
    related_page_id: str | None = None
    parent_task_id: str | None = None


class ReorderItem(StrictModel):
    id: str
    revision: int = Field(ge=1)


class Reorder(StrictModel):
    items: list[ReorderItem] = Field(max_length=1000)


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: Literal["Open", "In Progress", "Done"]
    priority: Literal["P1", "P2", "P3"]
    due_date: str | None
    position: int
    related_page_id: str | None
    parent_task_id: str | None


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    engagement_id: str
    display_id: str
    title: str
    icon: str | None
    parent_id: str | None
    page_type: str
    journal_date: str | None
    content: dict
    favorite: bool
    revision: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    task: TaskOut | None = None
    record: RecordProperties | None = None


class PageList(BaseModel):
    items: list[PageOut]
    total: int
    offset: int
    limit: int


class EngagementList(BaseModel):
    items: list[EngagementOut]
    total: int
    offset: int
    limit: int
