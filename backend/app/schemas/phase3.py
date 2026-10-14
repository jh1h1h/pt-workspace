from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


PropertyType = Literal["text", "number", "checkbox", "date", "single_select", "multi_select", "url", "relation"]
RecordType = Literal["asset", "surface", "backlog", "test_case", "finding", "evidence"]


class PropertyCreate(Strict):
    record_type: RecordType
    name: str = Field(min_length=1, max_length=120)
    data_type: PropertyType
    allowed_values: list[str] = Field(default_factory=list, max_length=100)
    default_value: Any = None
    required: bool = False
    display_order: int = Field(default=0, ge=0)
    visible: bool = True


class PropertyPatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    data_type: PropertyType | None = None
    allowed_values: list[str] | None = Field(default=None, max_length=100)
    default_value: Any = None
    required: bool | None = None
    display_order: int | None = Field(default=None, ge=0)
    visible: bool | None = None
    conversion_confirmed: bool = False


class PropertyValueInput(Strict):
    value: Any = None


class ViewConfig(Strict):
    columns: list[str] = Field(default_factory=list, max_length=100)
    column_order: list[str] = Field(default_factory=list, max_length=100)
    column_widths: dict[str, int] = Field(default_factory=dict)
    filters: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    sorts: list[dict[str, str]] = Field(default_factory=list, max_length=5)
    group_by: str | None = Field(default=None, max_length=120)

    @field_validator("column_widths")
    @classmethod
    def widths(cls, value: dict[str, int]) -> dict[str, int]:
        if len(value) > 100 or any(not 40 <= width <= 1000 for width in value.values()):
            raise ValueError("Column widths must be 40–1000 pixels")
        return value


class ViewCreate(Strict):
    record_type: RecordType
    name: str = Field(min_length=1, max_length=120)
    view_type: Literal["table", "kanban"] = "table"
    config: ViewConfig = Field(default_factory=ViewConfig)
    is_default: bool = False


class ViewPatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    view_type: Literal["table", "kanban"] | None = None
    config: ViewConfig | None = None
    is_default: bool | None = None


class BulkUpdate(Strict):
    ids: list[str] = Field(min_length=1, max_length=500)
    revisions: dict[str, int]
    field: str = Field(min_length=1, max_length=120)
    value: Any


class WorkflowCreate(Strict):
    record_type: Literal["task", "backlog", "finding"]
    label: str = Field(min_length=1, max_length=100)
    canonical_category: str = Field(min_length=1, max_length=30)
    display_order: int = Field(default=0, ge=0)


class WorkflowApply(Strict):
    option_id: str
    revision: int = Field(ge=1)


class ScratchConvert(Strict):
    revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=300)
    content: dict[str, Any] | None = None
    clear: bool = False


class QuickCapture(Strict):
    kind: Literal["task", "note", "surface", "backlog", "finding"]
    title: str = Field(min_length=1, max_length=300)
    related_id: str | None = None
    priority: Literal["P1", "P2", "P3"] = "P2"


class ImportConfirm(Strict):
    import_id: str


class SearchResult(BaseModel):
    id: str
    display_id: str
    title: str
    kind: str
    excerpt: str


class EvidenceMetadata(Strict):
    title: str = Field(min_length=1, max_length=300)
    evidence_type: Literal["Screenshot", "HTTP request", "HTTP response", "HTTP exchange", "Log", "Text document", "Other file"] = "Other file"
    source_tool: str = Field(default="", max_length=300)
    captured_at: datetime | None = None
    review_state: Literal["Needs Review", "Reviewed", "Restricted"] = "Needs Review"
    related_id: str | None = None


class ReusableTemplateCreate(Strict):
    name: str = Field(min_length=1, max_length=120)
    record_type: Literal["note", "journal", "surface", "test_case", "finding", "backlog", "task"]
    content: dict[str, Any]
    default_properties: dict[str, Any] = Field(default_factory=dict)


class ReusableTemplatePatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    default_properties: dict[str, Any] | None = None


class TemplateInstantiate(Strict):
    title: str = Field(min_length=1, max_length=300)
